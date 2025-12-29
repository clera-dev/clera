"""
Portfolio Refresh Scheduler

Production-grade background job that refreshes all users' portfolio data
from SnapTrade on a scheduled basis.

Industry Standard:
- Robinhood/Wealthfront refresh every 15-30 min during market hours
- We use 1 hour as a cost-conscious default (configurable)

Architecture:
- Uses APScheduler for reliable job scheduling
- Processes users in batches to avoid overwhelming SnapTrade API
- Handles failures gracefully (one user's failure doesn't stop others)
- Logs all activity for monitoring and debugging
"""

import logging
import asyncio
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from utils.supabase.db_client import get_supabase_client
from utils.trading_calendar import get_trading_calendar
from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
from utils.portfolio.snaptrade_sync_service import trigger_full_user_sync

logger = logging.getLogger(__name__)

# Configuration
REFRESH_INTERVAL_HOURS = int(os.getenv('PORTFOLIO_REFRESH_INTERVAL_HOURS', '1'))
BATCH_SIZE = int(os.getenv('PORTFOLIO_REFRESH_BATCH_SIZE', '50'))  # Users per batch
BATCH_DELAY_SECONDS = int(os.getenv('PORTFOLIO_REFRESH_BATCH_DELAY', '5'))  # Delay between batches
MARKET_HOURS_ONLY = os.getenv('PORTFOLIO_REFRESH_MARKET_HOURS_ONLY', 'false').lower() == 'true'


class PortfolioRefreshScheduler:
    """
    Manages scheduled portfolio refresh jobs.
    
    Features:
    - Automatic refresh of all active SnapTrade users
    - Configurable interval (default: 1 hour)
    - Batch processing to avoid rate limits
    - Market hours awareness (optional)
    - Graceful error handling
    """
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.provider = SnapTradePortfolioProvider()
        self.supabase = get_supabase_client()
        self.calendar = get_trading_calendar()
        self._is_running = False
        self._current_job_id = None
        
    def start(self):
        """Start the scheduler with configured jobs."""
        if self._is_running:
            logger.warning("Scheduler already running")
            return
            
        logger.info(f"🚀 Starting Portfolio Refresh Scheduler")
        logger.info(f"   Interval: Every {REFRESH_INTERVAL_HOURS} hour(s)")
        logger.info(f"   Batch size: {BATCH_SIZE} users")
        logger.info(f"   Market hours only: {MARKET_HOURS_ONLY}")
        
        # Schedule the refresh job
        self.scheduler.add_job(
            self._refresh_all_users,
            IntervalTrigger(hours=REFRESH_INTERVAL_HOURS),
            id='portfolio_refresh',
            name='Portfolio Refresh Job',
            replace_existing=True,
            max_instances=1,  # Prevent overlapping runs
            coalesce=True,  # Combine missed runs into one
        )
        
        self.scheduler.start()
        self._is_running = True
        logger.info("✅ Portfolio Refresh Scheduler started")
        
    def stop(self):
        """Stop the scheduler gracefully."""
        if not self._is_running:
            return
            
        logger.info("🛑 Stopping Portfolio Refresh Scheduler...")
        self.scheduler.shutdown(wait=True)
        self._is_running = False
        logger.info("✅ Portfolio Refresh Scheduler stopped")
        
    async def _refresh_all_users(self):
        """
        Main job: Refresh portfolio data for all active SnapTrade users.
        
        This is called by the scheduler on the configured interval.
        """
        job_start = datetime.utcnow()
        logger.info(f"📊 Starting scheduled portfolio refresh at {job_start.isoformat()}")
        
        # Check if we should skip due to market hours setting
        if MARKET_HOURS_ONLY and not self.calendar.is_market_open_now():
            logger.info("⏸️ Skipping refresh - market is closed and MARKET_HOURS_ONLY is enabled")
            return
        
        try:
            # Get all active users with SnapTrade connections
            users = await self._get_active_snaptrade_users()
            
            if not users:
                logger.info("No active SnapTrade users to refresh")
                return
                
            logger.info(f"📋 Found {len(users)} active SnapTrade users to refresh")
            
            # Process in batches
            total_refreshed = 0
            total_failed = 0
            
            for i in range(0, len(users), BATCH_SIZE):
                batch = users[i:i + BATCH_SIZE]
                batch_num = (i // BATCH_SIZE) + 1
                total_batches = (len(users) + BATCH_SIZE - 1) // BATCH_SIZE
                
                logger.info(f"🔄 Processing batch {batch_num}/{total_batches} ({len(batch)} users)")
                
                # Process batch concurrently but with limits
                results = await self._process_user_batch(batch)
                
                # Count results
                for result in results:
                    if result.get('success'):
                        total_refreshed += 1
                    else:
                        total_failed += 1
                
                # Delay between batches to avoid overwhelming the API
                if i + BATCH_SIZE < len(users):
                    logger.debug(f"Waiting {BATCH_DELAY_SECONDS}s before next batch...")
                    await asyncio.sleep(BATCH_DELAY_SECONDS)
            
            job_end = datetime.utcnow()
            duration = (job_end - job_start).total_seconds()
            
            logger.info(
                f"✅ Scheduled refresh complete: "
                f"{total_refreshed} succeeded, {total_failed} failed, "
                f"duration: {duration:.1f}s"
            )
            
            # Update job statistics in database (for monitoring)
            await self._record_job_stats(job_start, job_end, total_refreshed, total_failed)
            
        except Exception as e:
            logger.error(f"❌ Error in scheduled portfolio refresh: {e}", exc_info=True)
    
    async def _get_active_snaptrade_users(self) -> List[Dict]:
        """Get all users with active SnapTrade connections."""
        try:
            # Get users from snaptrade_users table who have active connections
            result = self.supabase.table('snaptrade_users')\
                .select('user_id, snaptrade_user_id')\
                .execute()
            
            if not result.data:
                return []
            
            # Filter to only users with active investment accounts
            user_ids = [u['user_id'] for u in result.data]
            
            active_accounts = self.supabase.table('user_investment_accounts')\
                .select('user_id')\
                .in_('user_id', user_ids)\
                .eq('is_active', True)\
                .eq('provider', 'snaptrade')\
                .execute()
            
            active_user_ids = set(a['user_id'] for a in active_accounts.data)
            
            # Return only users with active accounts
            return [u for u in result.data if u['user_id'] in active_user_ids]
            
        except Exception as e:
            logger.error(f"Error fetching active SnapTrade users: {e}")
            return []
    
    async def _process_user_batch(self, users: List[Dict]) -> List[Dict]:
        """
        Process a batch of users concurrently.
        
        Uses asyncio.gather with return_exceptions=True to ensure
        one user's failure doesn't stop the batch.
        """
        tasks = [self._refresh_single_user(user) for user in users]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to error results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append({
                    'user_id': users[i]['user_id'],
                    'success': False,
                    'error': str(result)
                })
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def _refresh_single_user(self, user: Dict) -> Dict:
        """
        Refresh portfolio data for a single user.
        
        This triggers the actual SnapTrade brokerage refresh (costs money)
        and then syncs the data to our database.
        """
        user_id = user['user_id']
        
        try:
            logger.debug(f"Refreshing user {user_id}...")
            
            # Step 1: Trigger brokerage refresh (pulls fresh data from brokerage)
            refresh_success = await self.provider.refresh_data(user_id)
            
            if not refresh_success:
                logger.warning(f"Brokerage refresh failed for user {user_id}")
                # Still try to sync cached data
            
            # Step 2: Sync data to our database
            sync_result = await trigger_full_user_sync(user_id, force_rebuild=False)
            
            # Step 3: Update last_synced timestamp
            self.supabase.table('user_investment_accounts')\
                .update({'last_synced': datetime.utcnow().isoformat() + 'Z'})\
                .eq('user_id', user_id)\
                .eq('is_active', True)\
                .execute()
            
            return {
                'user_id': user_id,
                'success': True,
                'refresh_triggered': refresh_success,
                'positions_synced': sync_result.get('positions_synced', 0)
            }
            
        except Exception as e:
            logger.error(f"Error refreshing user {user_id}: {e}")
            return {
                'user_id': user_id,
                'success': False,
                'error': str(e)
            }
    
    async def _record_job_stats(
        self, 
        start_time: datetime, 
        end_time: datetime, 
        succeeded: int, 
        failed: int
    ):
        """Record job execution statistics for monitoring."""
        try:
            # Store in a job_stats table if it exists, otherwise just log
            # This is optional - you can add a table for this if you want monitoring
            logger.info(
                f"📈 Job Stats: start={start_time.isoformat()}, "
                f"end={end_time.isoformat()}, succeeded={succeeded}, failed={failed}"
            )
        except Exception as e:
            logger.warning(f"Could not record job stats: {e}")
    
    async def trigger_manual_refresh(self, user_id: str) -> Dict:
        """
        Trigger a manual refresh for a specific user.
        
        This is called from the API endpoint when a user clicks Refresh.
        Rate limiting should be handled by the caller.
        """
        return await self._refresh_single_user({'user_id': user_id})
    
    def get_status(self) -> Dict:
        """Get scheduler status for monitoring."""
        jobs = self.scheduler.get_jobs() if self._is_running else []
        
        return {
            'is_running': self._is_running,
            'jobs': [
                {
                    'id': job.id,
                    'name': job.name,
                    'next_run': job.next_run_time.isoformat() if job.next_run_time else None,
                    'trigger': str(job.trigger)
                }
                for job in jobs
            ],
            'config': {
                'refresh_interval_hours': REFRESH_INTERVAL_HOURS,
                'batch_size': BATCH_SIZE,
                'market_hours_only': MARKET_HOURS_ONLY
            }
        }


# Global scheduler instance
_scheduler: Optional[PortfolioRefreshScheduler] = None


def get_portfolio_refresh_scheduler() -> PortfolioRefreshScheduler:
    """Get the global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = PortfolioRefreshScheduler()
    return _scheduler


def start_portfolio_refresh_scheduler():
    """Start the global scheduler."""
    scheduler = get_portfolio_refresh_scheduler()
    scheduler.start()
    return scheduler


def stop_portfolio_refresh_scheduler():
    """Stop the global scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.stop()
        _scheduler = None

