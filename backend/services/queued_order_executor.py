"""
Queued Order Executor Service

Production-grade background job that executes queued orders when the market opens.
This handles orders that were placed when the market was closed and couldn't be
submitted directly to the brokerage.

Architecture:
- Uses APScheduler BackgroundScheduler for reliable job scheduling (sync)
- Runs every 5 minutes during market hours to check for pending orders
- Also triggers at market open (9:30 AM ET) to catch overnight orders
- Processes orders one at a time with proper error handling
- Updates order status in database for user visibility
- Recovers stuck 'executing' orders after timeout
- Sends notifications on success/failure (future enhancement)
"""

import logging
import time
import os
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from utils.supabase.db_client import get_supabase_client
from utils.trading_calendar import get_trading_calendar

logger = logging.getLogger(__name__)

# Configuration
CHECK_INTERVAL_MINUTES = int(os.getenv('QUEUED_ORDER_CHECK_INTERVAL_MINUTES', '5'))
MAX_RETRY_ATTEMPTS = 3
# Orders stuck in 'executing' for longer than this will be reset to 'pending'
STUCK_ORDER_TIMEOUT_MINUTES = 5


class QueuedOrderExecutor:
    """
    Executes queued orders when the market opens.
    
    Features:
    - Automatic execution of pending orders at market open
    - Recovery of stuck 'executing' orders (server crash protection)
    - Retry logic with exponential backoff
    - Proper status tracking in database
    - Market hours awareness
    - Graceful error handling per order
    """
    
    def __init__(self, trading_service=None):
        """
        Initialize the executor.
        
        Args:
            trading_service: Optional trading service instance for dependency injection.
                           If not provided, will be imported when needed.
        """
        self.scheduler = BackgroundScheduler()
        self.supabase = get_supabase_client()
        self.calendar = get_trading_calendar()
        self._is_running = False
        self._trading_service = trading_service
        
    def _get_trading_service(self):
        """Get trading service, importing if not injected."""
        if self._trading_service is None:
            # Import here to avoid circular imports at module load time
            from services.snaptrade_trading_service import get_snaptrade_trading_service
            self._trading_service = get_snaptrade_trading_service()
        return self._trading_service
        
    def start(self):
        """Start the executor with configured jobs."""
        if self._is_running:
            logger.warning("QueuedOrderExecutor already running")
            return
            
        logger.info("🚀 Starting Queued Order Executor")
        
        # Job 1: Check and execute pending orders every N minutes during market hours
        self.scheduler.add_job(
            self._process_pending_orders,
            IntervalTrigger(minutes=CHECK_INTERVAL_MINUTES),
            id='queued_order_check',
            name='Check and execute queued orders',
            replace_existing=True,
            max_instances=1  # Prevent overlapping runs
        )
        
        # Job 2: Special trigger at market open (9:31 AM ET, 1 min after open)
        # This ensures overnight orders are processed promptly
        self.scheduler.add_job(
            self._process_pending_orders,
            CronTrigger(hour=9, minute=31, timezone='America/New_York'),
            id='market_open_trigger',
            name='Market open order execution',
            replace_existing=True,
            max_instances=1
        )
        
        # Job 3: Recovery job for stuck orders (runs every 10 minutes)
        self.scheduler.add_job(
            self._recover_stuck_orders,
            IntervalTrigger(minutes=10),
            id='stuck_order_recovery',
            name='Recover stuck executing orders',
            replace_existing=True,
            max_instances=1
        )
        
        self.scheduler.start()
        self._is_running = True
        logger.info("✅ Queued Order Executor started")
        
    def stop(self):
        """Stop the executor gracefully."""
        if not self._is_running:
            return
            
        logger.info("🛑 Stopping Queued Order Executor...")
        self.scheduler.shutdown(wait=True)
        self._is_running = False
        logger.info("✅ Queued Order Executor stopped")
    
    def _recover_stuck_orders(self):
        """
        Recover orders stuck in 'executing' status.
        
        This handles the case where the server crashes after acquiring the lock
        but before completing the order. Orders stuck in 'executing' for longer
        than STUCK_ORDER_TIMEOUT_MINUTES are flagged for manual review.
        
        CRITICAL: We do NOT auto-retry stuck orders because:
        1. The order may have been placed with the brokerage before the crash
        2. We have no way to verify with the brokerage if the order was placed
        3. Auto-retrying could cause DUPLICATE TRADES with real money
        
        Instead, stuck orders are marked as 'needs_review' for manual inspection.
        """
        try:
            timeout_threshold = datetime.now(timezone.utc) - timedelta(minutes=STUCK_ORDER_TIMEOUT_MINUTES)
            
            # Find orders stuck in 'executing' for too long
            stuck_orders = self.supabase.table('queued_orders')\
                .select('id, user_id, symbol, action, notional_value, last_attempt_at, retry_count')\
                .eq('status', 'executing')\
                .lt('last_attempt_at', timeout_threshold.isoformat())\
                .execute()
            
            if not stuck_orders.data:
                return
            
            logger.critical(f"🚨 CRITICAL: Found {len(stuck_orders.data)} stuck orders requiring manual review")
            
            for order in stuck_orders.data:
                order_id = order['id']
                user_id = order.get('user_id', 'unknown')
                symbol = order.get('symbol', 'unknown')
                action = order.get('action', 'unknown')
                notional_value = order.get('notional_value', 0)
                
                # CRITICAL: Do NOT auto-retry - mark for manual review
                # The order may have been placed with the brokerage already
                # Human verification is required to prevent duplicate trades
                result = self.supabase.table('queued_orders')\
                    .update({
                        'status': 'needs_review',
                        'last_error': 'CRITICAL: Order stuck in executing state. Manual verification required - check brokerage for duplicate orders before re-processing.',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    })\
                    .eq('id', order_id)\
                    .eq('status', 'executing')\
                    .execute()
                
                if result.data:
                    logger.critical(
                        f"🚨 Order {order_id} flagged for review: "
                        f"user={user_id}, {action} ${notional_value} of {symbol}. "
                        f"CHECK BROKERAGE FOR DUPLICATE ORDERS BEFORE RE-PROCESSING."
                    )
                    # TODO: Send alert to admin/support team
                    # TODO: Consider sending notification to user about delayed order
                    
        except Exception as e:
            logger.error(f"Error recovering stuck orders: {e}", exc_info=True)
        
    def _process_pending_orders(self):
        """
        Main job: Process all pending queued orders.
        
        Only executes when market is open to ensure orders go through.
        """
        job_start = datetime.now(timezone.utc)
        logger.info(f"📋 Checking for pending queued orders at {job_start.isoformat()}")
        
        # Only process during market hours
        if not self.calendar.is_market_open_now():
            logger.info("⏸️ Market is closed - skipping queued order execution")
            return
        
        try:
            # Get all pending orders (oldest first)
            pending_orders = self.supabase.table('queued_orders')\
                .select('*')\
                .eq('status', 'pending')\
                .order('created_at', desc=False)\
                .execute()
            
            orders = pending_orders.data or []
            
            if not orders:
                logger.info("✅ No pending queued orders to process")
                return
            
            logger.info(f"📊 Found {len(orders)} pending orders to execute")
            
            # Process each order
            success_count = 0
            fail_count = 0
            
            for order in orders:
                try:
                    result = self._execute_queued_order(order)
                    if result.get('success'):
                        success_count += 1
                    else:
                        fail_count += 1
                except Exception as e:
                    logger.error(f"Error processing order {order['id']}: {e}", exc_info=True)
                    fail_count += 1
                    self._mark_order_failed(order['id'], str(e))
                
                # Small delay between orders to avoid rate limits
                time.sleep(1)
            
            logger.info(f"📈 Queued order execution complete: {success_count} succeeded, {fail_count} failed")
            
        except Exception as e:
            logger.error(f"Error in queued order processing: {e}", exc_info=True)
    
    def _execute_queued_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a single queued order.
        
        Args:
            order: Order data from queued_orders table
            
        Returns:
            Result dict with success status
        """
        order_id = order['id']
        user_id = order['user_id']
        account_id = order['account_id']
        symbol = order['symbol']
        action = order['action']
        notional_value = order.get('notional_value')
        units = order.get('units')
        retry_count = order.get('retry_count', 0)
        
        logger.info(f"🔄 Attempting to execute queued order {order_id}: {action} {symbol}")
        
        # CRITICAL: Atomic lock acquisition to prevent race conditions
        # Only update to 'executing' if status is still 'pending'
        # This prevents duplicate order execution across multiple server instances
        lock_result = self.supabase.table('queued_orders')\
            .update({
                'status': 'executing',
                'last_attempt_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat()
            })\
            .eq('id', order_id)\
            .eq('status', 'pending')\
            .execute()
        
        # Check if we successfully acquired the lock
        if not lock_result.data or len(lock_result.data) == 0:
            logger.info(f"⏭️ Order {order_id} already being processed by another instance, skipping")
            return {'success': False, 'reason': 'already_processing'}
        
        # Track whether order was placed (to prevent duplicate execution on DB errors)
        order_placed = False
        order_result = None
        
        try:
            trading_service = self._get_trading_service()
            
            # Execute the order through our trading service
            result = trading_service.place_order(
                user_id=user_id,
                account_id=account_id,
                symbol=symbol,
                action=action,
                order_type='Market',
                time_in_force='Day',  # Day order now that market is open
                notional_value=notional_value,
                units=units
            )
            
            if result.get('success'):
                # CRITICAL: Check if this was actually executed or just re-queued
                # When market closes mid-processing, trading service returns {success: True, queued: True}
                # We should NOT mark re-queued orders as 'executed'
                if result.get('queued'):
                    # CRITICAL: Order was re-queued by the trading service
                    # The trading service already created a NEW queued_order record
                    # Mark the ORIGINAL order as 'cancelled' to prevent duplicate execution
                    new_order_id = result.get('order_id')
                    
                    # CRITICAL: Only cancel original if we have a valid new order ID
                    # If order_id is missing, keep original as 'pending' to avoid order loss
                    if not new_order_id:
                        error_msg = 'Re-queue attempt returned no order_id'
                        
                        # Check if max retries exceeded (consistent with other retry paths at lines 370, 417)
                        # Uses same pattern: check < MAX before incrementing, allowing MAX+1 total attempts
                        if retry_count >= MAX_RETRY_ATTEMPTS:
                            logger.error(f"❌ Order {order_id} failed after {retry_count + 1} attempts: {error_msg}")
                            self._mark_order_failed(order_id, f'{error_msg} - max retries exceeded')
                            return {'success': False, 'order_id': order_id, 'error': error_msg}
                        
                        logger.warning(f"⚠️ Order {order_id} re-queue failed (retry {retry_count + 1}/{MAX_RETRY_ATTEMPTS + 1}): {error_msg}")
                        self.supabase.table('queued_orders')\
                            .update({
                                'status': 'pending',
                                'retry_count': retry_count + 1,
                                'last_error': f'{error_msg} - will retry',
                                'updated_at': datetime.now(timezone.utc).isoformat()
                            })\
                            .eq('id', order_id)\
                            .eq('status', 'executing')\
                            .execute()
                        return {'success': False, 'order_id': order_id, 'error': error_msg, 'will_retry': True}
                    
                    logger.warning(f"⚠️ Order {order_id} was re-queued as {new_order_id} (market closed). Marking original as cancelled.")
                    self.supabase.table('queued_orders')\
                        .update({
                            'status': 'cancelled',
                            'last_error': f'Superseded by new queued order {new_order_id} (market closed during execution)',
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        })\
                        .eq('id', order_id)\
                        .eq('status', 'executing')\
                        .execute()
                    return {'success': False, 'order_id': order_id, 'requeued': True, 'new_order_id': new_order_id}
                
                # Order was actually executed
                # CRITICAL: Mark order as placed BEFORE attempting DB update
                # This prevents duplicate execution if DB update fails
                order_placed = True
                order_result = result
                
                # Mark as executed in DB
                try:
                    self.supabase.table('queued_orders')\
                        .update({
                            'status': 'executed',
                            'executed_at': datetime.now(timezone.utc).isoformat(),
                            'execution_result': result,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        })\
                        .eq('id', order_id)\
                        .execute()
                except Exception as db_error:
                    # Log DB error but don't retry the order - it was already placed!
                    logger.error(f"⚠️ Order {order_id} executed but DB update failed: {db_error}")
                
                logger.info(f"✅ Queued order {order_id} executed successfully")
                
                # TODO: Send notification to user about successful execution
                
                return {'success': True, 'order_id': order_id, 'result': result}
            else:
                error_msg = result.get('error', 'Unknown error')
                
                # Check if this is a retriable error
                if self._is_retriable_error(error_msg) and retry_count < MAX_RETRY_ATTEMPTS:
                    # Increment retry count, will try again next cycle
                    # CRITICAL: Use optimistic locking to prevent race conditions
                    # Only update if status is still 'executing' to prevent overwriting completed orders
                    self.supabase.table('queued_orders')\
                        .update({
                            'status': 'pending',  # Back to pending for retry
                            'retry_count': retry_count + 1,
                            'last_error': error_msg,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        })\
                        .eq('id', order_id)\
                        .eq('status', 'executing')\
                        .execute()
                    
                    logger.warning(f"⚠️ Order {order_id} failed (retry {retry_count + 1}/{MAX_RETRY_ATTEMPTS}): {error_msg}")
                    return {'success': False, 'order_id': order_id, 'error': error_msg, 'will_retry': True}
                else:
                    # Mark as failed
                    self._mark_order_failed(order_id, error_msg)
                    return {'success': False, 'order_id': order_id, 'error': error_msg}
                    
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Error executing queued order {order_id}: {e}", exc_info=True)
            
            # CRITICAL: Only retry if order was NOT placed
            # If order was placed but we got an exception (e.g., during DB update),
            # do NOT reset to pending - that would cause duplicate execution
            if order_placed:
                logger.error(f"⚠️ Order {order_id} was placed but post-execution failed. NOT retrying to avoid duplicate.")
                # Try to mark as executed anyway
                try:
                    self.supabase.table('queued_orders')\
                        .update({
                            'status': 'executed',
                            'executed_at': datetime.now(timezone.utc).isoformat(),
                            'execution_result': order_result,
                            'last_error': f'Post-execution error (order was placed): {error_msg}',
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        })\
                        .eq('id', order_id)\
                        .execute()
                except Exception:
                    pass
                return {'success': True, 'order_id': order_id, 'result': order_result, 'warning': 'Post-execution error'}
            
            if retry_count < MAX_RETRY_ATTEMPTS:
                # CRITICAL: Use optimistic locking to prevent resetting executed orders
                self.supabase.table('queued_orders')\
                    .update({
                        'status': 'pending',
                        'retry_count': retry_count + 1,
                        'last_error': error_msg,
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    })\
                    .eq('id', order_id)\
                    .eq('status', 'executing')\
                    .execute()
                return {'success': False, 'order_id': order_id, 'error': error_msg, 'will_retry': True}
            else:
                self._mark_order_failed(order_id, error_msg)
                return {'success': False, 'order_id': order_id, 'error': error_msg}
    
    def _mark_order_failed(self, order_id: str, error_msg: str):
        """Mark an order as permanently failed."""
        # CRITICAL: Use optimistic locking to prevent overwriting 'executed' status
        # Only mark as failed if still in 'executing' state
        result = self.supabase.table('queued_orders')\
            .update({
                'status': 'failed',
                'last_error': error_msg,
                'updated_at': datetime.now(timezone.utc).isoformat()
            })\
            .eq('id', order_id)\
            .eq('status', 'executing')\
            .execute()
        
        if result.data:
            logger.error(f"❌ Queued order {order_id} permanently failed: {error_msg}")
        
        # TODO: Send notification to user about failed order
    
    def _is_retriable_error(self, error_msg: str) -> bool:
        """Check if an error is retriable (transient network issues, etc.)."""
        # CRITICAL: First check for connection-disabled errors (3003)
        # These require user action (reconnecting brokerage) and will NEVER succeed on retry
        # Retrying these wastes 15+ minutes before users learn the real issue
        from services.snaptrade_trading_service import is_connection_disabled_error
        if is_connection_disabled_error(error_msg):
            return False
        
        retriable_indicators = [
            'timeout',
            'connection',  # Network connection issues (not brokerage connection disabled)
            'network',
            'temporary',
            'try again',
            'rate limit',
            '429',
            '503',
            '504',
        ]
        error_lower = error_msg.lower()
        return any(indicator in error_lower for indicator in retriable_indicators)
    
    def get_status(self, user_id: str) -> Dict:
        """
        Get executor status for monitoring.
        
        SECURITY: user_id is REQUIRED to prevent information disclosure.
        Each user can only see their own pending order count.
        
        Args:
            user_id: User ID to filter pending orders (required for security)
        """
        jobs = self.scheduler.get_jobs() if self._is_running else []
        
        # Get pending order count filtered by user
        pending_count = 0
        needs_review_count = 0
        try:
            result = self.supabase.table('queued_orders')\
                .select('id', count='exact')\
                .eq('status', 'pending')\
                .eq('user_id', user_id)\
                .execute()
            pending_count = result.count or 0
            
            # Also get orders needing manual review (stuck orders)
            review_result = self.supabase.table('queued_orders')\
                .select('id', count='exact')\
                .eq('status', 'needs_review')\
                .eq('user_id', user_id)\
                .execute()
            needs_review_count = review_result.count or 0
        except Exception:
            pass
        
        return {
            'is_running': self._is_running,
            'pending_orders': pending_count,
            'needs_review_orders': needs_review_count,
            'jobs': [
                {
                    'id': job.id,
                    'name': job.name,
                    'next_run': job.next_run_time.isoformat() if job.next_run_time else None,
                    'trigger': str(job.trigger)
                }
                for job in jobs
            ]
        }


# Global executor instance
_executor: Optional[QueuedOrderExecutor] = None


def get_queued_order_executor() -> QueuedOrderExecutor:
    """Get the global executor instance."""
    global _executor
    if _executor is None:
        _executor = QueuedOrderExecutor()
    return _executor


def start_queued_order_executor():
    """Start the global executor."""
    executor = get_queued_order_executor()
    executor.start()
    return executor


def stop_queued_order_executor():
    """Stop the global executor."""
    global _executor
    if _executor is not None:
        _executor.stop()
        _executor = None
