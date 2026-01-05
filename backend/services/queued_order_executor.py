"""
Queued Order Executor Service

Production-grade background job that executes queued orders when the market opens.
This handles orders that were placed when the market was closed and couldn't be
submitted directly to the brokerage.

Architecture:
- Uses APScheduler for reliable job scheduling
- Runs every 5 minutes during market hours to check for pending orders
- Also triggers at market open (9:30 AM ET) to catch overnight orders
- Processes orders one at a time with proper error handling
- Updates order status in database for user visibility
- Sends notifications on success/failure (future enhancement)
"""

import logging
import asyncio
import os
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from utils.supabase.db_client import get_supabase_client
from utils.trading_calendar import get_trading_calendar

logger = logging.getLogger(__name__)

# Configuration
CHECK_INTERVAL_MINUTES = int(os.getenv('QUEUED_ORDER_CHECK_INTERVAL_MINUTES', '5'))
MAX_RETRY_ATTEMPTS = 3


class QueuedOrderExecutor:
    """
    Executes queued orders when the market opens.
    
    Features:
    - Automatic execution of pending orders at market open
    - Retry logic with exponential backoff
    - Proper status tracking in database
    - Market hours awareness
    - Graceful error handling per order
    """
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.supabase = get_supabase_client()
        self.calendar = get_trading_calendar()
        self._is_running = False
        
    def start(self):
        """Start the executor with configured jobs."""
        if self._is_running:
            logger.warning("QueuedOrderExecutor already running")
            return
            
        logger.info("🚀 Starting Queued Order Executor")
        logger.info(f"   Check interval: Every {CHECK_INTERVAL_MINUTES} minutes during market hours")
        
        # Job 1: Check for pending orders every N minutes during market hours
        # This catches any orders that slip through or need retry
        self.scheduler.add_job(
            self._process_pending_orders,
            IntervalTrigger(minutes=CHECK_INTERVAL_MINUTES),
            id='queued_order_check',
            name='Queued Order Check',
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        
        # Job 2: Trigger at market open (9:31 AM ET) - slight delay to ensure market is open
        # This catches all overnight orders immediately
        self.scheduler.add_job(
            self._process_pending_orders,
            CronTrigger(hour=9, minute=31, timezone='US/Eastern'),
            id='market_open_execution',
            name='Market Open Order Execution',
            replace_existing=True,
            max_instances=1,
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
        
    async def _process_pending_orders(self):
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
            # Get all pending orders
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
                    result = await self._execute_queued_order(order)
                    if result.get('success'):
                        success_count += 1
                    else:
                        fail_count += 1
                except Exception as e:
                    logger.error(f"Error processing order {order['id']}: {e}", exc_info=True)
                    fail_count += 1
                    await self._mark_order_failed(order['id'], str(e))
                
                # Small delay between orders to avoid rate limits
                await asyncio.sleep(1)
            
            logger.info(f"📈 Queued order execution complete: {success_count} succeeded, {fail_count} failed")
            
        except Exception as e:
            logger.error(f"Error in queued order processing: {e}", exc_info=True)
    
    async def _execute_queued_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
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
        
        logger.info(f"🔄 Executing queued order {order_id}: {action} {symbol}")
        
        # Mark as executing
        self.supabase.table('queued_orders')\
            .update({
                'status': 'executing',
                'updated_at': datetime.now(timezone.utc).isoformat()
            })\
            .eq('id', order_id)\
            .execute()
        
        try:
            # Import here to avoid circular imports
            from services.snaptrade_trading_service import get_snaptrade_trading_service
            trading_service = get_snaptrade_trading_service()
            
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
                # Mark as executed
                self.supabase.table('queued_orders')\
                    .update({
                        'status': 'executed',
                        'executed_at': datetime.now(timezone.utc).isoformat(),
                        'execution_result': result,
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    })\
                    .eq('id', order_id)\
                    .execute()
                
                logger.info(f"✅ Queued order {order_id} executed successfully")
                
                # TODO: Send notification to user about successful execution
                
                return {'success': True, 'order_id': order_id, 'result': result}
            else:
                error_msg = result.get('error', 'Unknown error')
                
                # Check if this is a retriable error
                if self._is_retriable_error(error_msg) and retry_count < MAX_RETRY_ATTEMPTS:
                    # Increment retry count, will try again next cycle
                    self.supabase.table('queued_orders')\
                        .update({
                            'status': 'pending',  # Back to pending for retry
                            'retry_count': retry_count + 1,
                            'last_error': error_msg,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        })\
                        .eq('id', order_id)\
                        .execute()
                    
                    logger.warning(f"⚠️ Order {order_id} failed (retry {retry_count + 1}/{MAX_RETRY_ATTEMPTS}): {error_msg}")
                    return {'success': False, 'order_id': order_id, 'error': error_msg, 'will_retry': True}
                else:
                    # Mark as failed
                    await self._mark_order_failed(order_id, error_msg)
                    return {'success': False, 'order_id': order_id, 'error': error_msg}
                    
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Error executing queued order {order_id}: {e}", exc_info=True)
            
            if retry_count < MAX_RETRY_ATTEMPTS:
                self.supabase.table('queued_orders')\
                    .update({
                        'status': 'pending',
                        'retry_count': retry_count + 1,
                        'last_error': error_msg,
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    })\
                    .eq('id', order_id)\
                    .execute()
                return {'success': False, 'order_id': order_id, 'error': error_msg, 'will_retry': True}
            else:
                await self._mark_order_failed(order_id, error_msg)
                return {'success': False, 'order_id': order_id, 'error': error_msg}
    
    async def _mark_order_failed(self, order_id: str, error_msg: str):
        """Mark an order as permanently failed."""
        self.supabase.table('queued_orders')\
            .update({
                'status': 'failed',
                'last_error': error_msg,
                'updated_at': datetime.now(timezone.utc).isoformat()
            })\
            .eq('id', order_id)\
            .execute()
        
        logger.error(f"❌ Queued order {order_id} permanently failed: {error_msg}")
        
        # TODO: Send notification to user about failed order
    
    def _is_retriable_error(self, error_msg: str) -> bool:
        """Check if an error is retriable (transient network issues, etc.)."""
        retriable_indicators = [
            'timeout',
            'connection',
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
    
    def get_status(self) -> Dict:
        """Get executor status for monitoring."""
        jobs = self.scheduler.get_jobs() if self._is_running else []
        
        # Get pending order count
        pending_count = 0
        try:
            result = self.supabase.table('queued_orders')\
                .select('id', count='exact')\
                .eq('status', 'pending')\
                .execute()
            pending_count = result.count or 0
        except Exception:
            pass
        
        return {
            'is_running': self._is_running,
            'pending_orders': pending_count,
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

