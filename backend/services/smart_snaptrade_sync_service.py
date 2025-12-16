"""
PRODUCTION-GRADE: Smart SnapTrade Holdings Sync Service

This service intelligently syncs holdings from SnapTrade with cost optimization:
- Only syncs when data is stale (configurable threshold)
- Batches requests to respect API rate limits
- Tracks sync status per user to avoid redundant calls
- Exponential backoff on failures
- Comprehensive logging and metrics

Design Principles:
1. Cost Efficiency: Minimize API calls without sacrificing data freshness
2. Scalability: Handle millions of users with batching
3. Reliability: Retry logic with exponential backoff
4. Observability: Track sync metrics for monitoring

Author: Clera Engineering
Created: 2025-11-04
"""

import logging
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    """Result of a sync operation."""
    success: bool
    user_id: str
    holdings_count: int
    was_stale: bool
    sync_duration_ms: float
    error: Optional[str] = None


@dataclass
class SyncBatchMetrics:
    """Metrics for a batch sync operation."""
    total_users: int
    synced_users: int
    skipped_users: int  # Already fresh
    failed_users: int
    total_duration_seconds: float
    api_calls_made: int
    estimated_cost_usd: float  # Based on SnapTrade pricing


class SmartSnapTradeSyncService:
    """
    PRODUCTION-GRADE: Intelligent SnapTrade holdings sync service.
    
    Features:
    - Staleness-based sync (only sync if last_synced > threshold)
    - Rate-limited batching (respect SnapTrade API limits)
    - Exponential backoff retries
    - Cost tracking and optimization
    - Comprehensive metrics
    """
    
    def __init__(
        self,
        staleness_threshold_hours: int = 24,
        batch_size: int = 10,
        rate_limit_delay_seconds: float = 0.5,
        max_retries: int = 3
    ):
        """
        Initialize the smart sync service.
        
        Args:
            staleness_threshold_hours: Sync only if last_synced > this (default: 24h)
            batch_size: Users to process per batch (default: 10)
            rate_limit_delay_seconds: Delay between API calls (default: 0.5s = 120/min)
            max_retries: Max retry attempts per user (default: 3)
        """
        self.staleness_threshold = timedelta(hours=staleness_threshold_hours)
        self.batch_size = batch_size
        self.rate_limit_delay = rate_limit_delay_seconds
        self.max_retries = max_retries
        
        # Lazy-loaded dependencies
        self.supabase = None
        self.snaptrade_provider = None
        
        # Cost tracking (estimated based on SnapTrade pricing)
        # Adjust these based on actual SnapTrade pricing tier
        self.estimated_cost_per_call = 0.001  # $0.001 per API call (example)
        
        logger.info(
            f"💡 Smart Sync Service initialized: "
            f"staleness={staleness_threshold_hours}h, "
            f"batch={batch_size}, "
            f"rate_limit={rate_limit_delay_seconds}s"
        )
    
    def _get_supabase_client(self):
        """Lazy load Supabase client."""
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    def _get_snaptrade_provider(self):
        """Lazy load SnapTrade provider."""
        if self.snaptrade_provider is None:
            from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
            self.snaptrade_provider = SnapTradePortfolioProvider()
        return self.snaptrade_provider
    
    async def sync_stale_users(
        self,
        force: bool = False,
        max_users: Optional[int] = None
    ) -> SyncBatchMetrics:
        """
        PRODUCTION-GRADE: Sync holdings for users with stale data.
        
        This is the main entry point for scheduled/automated syncs.
        
        Args:
            force: If True, sync all users regardless of staleness
            max_users: Optional limit on users to sync (for testing)
        
        Returns:
            SyncBatchMetrics with comprehensive stats
        """
        start_time = time.time()
        supabase = self._get_supabase_client()
        
        logger.info(f"🔄 Starting smart sync (force={force}, max_users={max_users})")
        
        # STEP 1: Find users with stale SnapTrade connections
        stale_threshold_iso = (datetime.now() - self.staleness_threshold).isoformat()
        
        query = supabase.table('user_investment_accounts')\
            .select('user_id, institution_name, last_synced')\
            .eq('provider', 'snaptrade')\
            .eq('is_active', True)
        
        if not force:
            # Only get users with stale data
            query = query.or_(
                f'last_synced.is.null,last_synced.lt.{stale_threshold_iso}'
            )
        
        if max_users:
            query = query.limit(max_users)
        
        result = query.execute()
        
        if not result.data:
            logger.info("✅ No users need syncing - all data is fresh!")
            return SyncBatchMetrics(
                total_users=0,
                synced_users=0,
                skipped_users=0,
                failed_users=0,
                total_duration_seconds=time.time() - start_time,
                api_calls_made=0,
                estimated_cost_usd=0.0
            )
        
        # Get unique user IDs (one user may have multiple accounts)
        user_ids = list(set(account['user_id'] for account in result.data))
        
        logger.info(
            f"📊 Found {len(user_ids)} users with stale data "
            f"(threshold: {self.staleness_threshold.total_seconds() / 3600:.1f}h)"
        )
        
        # STEP 2: Sync in batches with rate limiting
        sync_results = []
        api_calls_made = 0
        
        for i in range(0, len(user_ids), self.batch_size):
            batch = user_ids[i:i + self.batch_size]
            batch_num = i // self.batch_size + 1
            total_batches = (len(user_ids) + self.batch_size - 1) // self.batch_size
            
            logger.info(f"🔄 Processing batch {batch_num}/{total_batches} ({len(batch)} users)")
            
            # Process batch with rate limiting
            batch_results = await self._sync_batch(batch)
            sync_results.extend(batch_results)
            api_calls_made += len(batch)
            
            # Add delay between batches to respect rate limits
            if i + self.batch_size < len(user_ids):
                await asyncio.sleep(self.rate_limit_delay * len(batch))
        
        # STEP 3: Calculate metrics
        synced = sum(1 for r in sync_results if r.success)
        failed = sum(1 for r in sync_results if not r.success)
        skipped = 0  # In smart sync, we don't skip (we filter in query)
        
        total_duration = time.time() - start_time
        estimated_cost = api_calls_made * self.estimated_cost_per_call
        
        metrics = SyncBatchMetrics(
            total_users=len(user_ids),
            synced_users=synced,
            skipped_users=skipped,
            failed_users=failed,
            total_duration_seconds=total_duration,
            api_calls_made=api_calls_made,
            estimated_cost_usd=estimated_cost
        )
        
        # Log comprehensive summary
        logger.info(
            f"✅ Smart sync complete:\n"
            f"  - Total users: {metrics.total_users}\n"
            f"  - Synced: {metrics.synced_users} ({metrics.synced_users/max(metrics.total_users,1)*100:.1f}%)\n"
            f"  - Failed: {metrics.failed_users}\n"
            f"  - Duration: {metrics.total_duration_seconds:.2f}s\n"
            f"  - API calls: {metrics.api_calls_made}\n"
            f"  - Est. cost: ${metrics.estimated_cost_usd:.4f}"
        )
        
        return metrics
    
    async def _sync_batch(self, user_ids: List[str]) -> List[SyncResult]:
        """
        Sync a batch of users with concurrent processing.
        
        Args:
            user_ids: List of user IDs to sync
        
        Returns:
            List of SyncResult for each user
        """
        tasks = [self._sync_single_user(user_id) for user_id in user_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to SyncResult errors
        sync_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                sync_results.append(SyncResult(
                    success=False,
                    user_id=user_ids[i],
                    holdings_count=0,
                    was_stale=True,
                    sync_duration_ms=0,
                    error=str(result)
                ))
            else:
                sync_results.append(result)
        
        return sync_results
    
    async def _sync_single_user(self, user_id: str) -> SyncResult:
        """
        Sync holdings for a single user with retry logic.
        
        Args:
            user_id: User ID to sync
        
        Returns:
            SyncResult with sync status
        """
        start_time = time.time()
        
        for attempt in range(self.max_retries):
            try:
                # Fetch fresh holdings from SnapTrade
                provider = self._get_snaptrade_provider()
                # PRODUCTION-GRADE: Use get_positions (the correct method name)
                holdings = await provider.get_positions(user_id)
                
                if not holdings:
                    logger.warning(f"⚠️  No holdings returned for user {user_id}")
                    return SyncResult(
                        success=False,
                        user_id=user_id,
                        holdings_count=0,
                        was_stale=True,
                        sync_duration_ms=(time.time() - start_time) * 1000,
                        error="No holdings returned"
                    )
                
                # Update last_synced timestamp
                supabase = self._get_supabase_client()
                supabase.table('user_investment_accounts')\
                    .update({'last_synced': datetime.now().isoformat()})\
                    .eq('user_id', user_id)\
                    .eq('provider', 'snaptrade')\
                    .execute()
                
                duration_ms = (time.time() - start_time) * 1000
                
                logger.debug(
                    f"✅ Synced user {user_id[:8]}... "
                    f"({len(holdings)} holdings, {duration_ms:.0f}ms)"
                )
                
                return SyncResult(
                    success=True,
                    user_id=user_id,
                    holdings_count=len(holdings),
                    was_stale=True,
                    sync_duration_ms=duration_ms
                )
                
            except Exception as e:
                if attempt < self.max_retries - 1:
                    # Exponential backoff
                    delay = (2 ** attempt) * self.rate_limit_delay
                    logger.warning(
                        f"⚠️  Sync failed for user {user_id} (attempt {attempt + 1}), "
                        f"retrying in {delay:.1f}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    # Final attempt failed
                    logger.error(f"❌ Sync failed for user {user_id} after {self.max_retries} attempts: {e}")
                    return SyncResult(
                        success=False,
                        user_id=user_id,
                        holdings_count=0,
                        was_stale=True,
                        sync_duration_ms=(time.time() - start_time) * 1000,
                        error=str(e)
                    )
        
        # Should never reach here
        return SyncResult(
            success=False,
            user_id=user_id,
            holdings_count=0,
            was_stale=True,
            sync_duration_ms=(time.time() - start_time) * 1000,
            error="Unknown error"
        )
    
    async def get_sync_status(self, user_id: str) -> Dict[str, Any]:
        """
        Get sync status for a specific user.
        
        Args:
            user_id: User ID to check
        
        Returns:
            Dict with sync status information
        """
        supabase = self._get_supabase_client()
        
        result = supabase.table('user_investment_accounts')\
            .select('institution_name, last_synced, is_active')\
            .eq('user_id', user_id)\
            .eq('provider', 'snaptrade')\
            .execute()
        
        if not result.data:
            return {
                'has_snaptrade': False,
                'is_stale': False,
                'last_synced': None,
                'hours_since_sync': None
            }
        
        # Get most recent sync across all accounts
        last_synced = None
        for account in result.data:
            if account.get('last_synced'):
                sync_time = datetime.fromisoformat(account['last_synced'].replace('Z', '+00:00'))
                if last_synced is None or sync_time > last_synced:
                    last_synced = sync_time
        
        if last_synced:
            hours_since_sync = (datetime.now(last_synced.tzinfo) - last_synced).total_seconds() / 3600
            is_stale = hours_since_sync > (self.staleness_threshold.total_seconds() / 3600)
        else:
            hours_since_sync = None
            is_stale = True  # Never synced = stale
        
        return {
            'has_snaptrade': True,
            'is_stale': is_stale,
            'last_synced': last_synced.isoformat() if last_synced else None,
            'hours_since_sync': hours_since_sync,
            'accounts': len(result.data)
        }


# Global instance (lazy loaded)
_smart_sync_service = None


def get_smart_sync_service(
    staleness_threshold_hours: int = 24,
    batch_size: int = 10,
    rate_limit_delay: float = 0.5
) -> SmartSnapTradeSyncService:
    """
    Get or create the global smart sync service instance.
    
    Args:
        staleness_threshold_hours: Only sync if data older than this
        batch_size: Users per batch
        rate_limit_delay: Delay between API calls
    
    Returns:
        SmartSnapTradeSyncService instance
    """
    global _smart_sync_service
    
    if _smart_sync_service is None:
        _smart_sync_service = SmartSnapTradeSyncService(
            staleness_threshold_hours=staleness_threshold_hours,
            batch_size=batch_size,
            rate_limit_delay_seconds=rate_limit_delay
        )
    
    return _smart_sync_service

