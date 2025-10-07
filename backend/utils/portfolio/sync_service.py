"""
Portfolio synchronization service for production-ready data management.

This service handles automatic data synchronization, caching, and background
updates to ensure portfolio data is always fresh and available.
"""

import asyncio
import logging
import json
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from decimal import Decimal

from .portfolio_service import get_portfolio_service
from .abstract_provider import ProviderError

logger = logging.getLogger(__name__)

class PortfolioSyncService:
    """
    Production-ready portfolio synchronization service.
    
    Features:
    - Background data synchronization
    - Intelligent caching with TTL
    - Error recovery and retry logic
    - Performance monitoring
    """
    
    def __init__(self):
        """Initialize sync service."""
        self.portfolio_service = get_portfolio_service()
        self.sync_in_progress = {}  # Track ongoing syncs to prevent duplicates
    
    async def ensure_user_portfolio_fresh(self, user_id: str, max_age_minutes: int = 30, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Ensure user's portfolio data is fresh, fetching if needed.
        
        This method provides production-ready data access with automatic
        background refresh when data becomes stale.
        
        Args:
            user_id: User identifier
            max_age_minutes: Maximum age in minutes before data is considered stale
            force_refresh: If True, bypass cache completely and fetch fresh data
            
        Returns:
            Fresh portfolio data dictionary
        """
        try:
            logger.info(f"📊 Ensuring fresh portfolio data for user {user_id}")
            
            # Check if sync is already in progress for this user
            if user_id in self.sync_in_progress:
                logger.info(f"⏳ Sync already in progress for user {user_id}, waiting...")
                await self.sync_in_progress[user_id]
            
            # Check cache first (unless force refresh requested)
            if not force_refresh:
                cached_data = await self._get_cached_portfolio(user_id, max_age_minutes)
                if cached_data:
                    logger.info(f"✅ Using cached portfolio data for user {user_id}")
                    return cached_data
            else:
                logger.info(f"🔄 FORCE REFRESH: Bypassing cache for user {user_id}")
            
            # Data is stale or missing, refresh it
            logger.info(f"🔄 Portfolio data stale for user {user_id}, refreshing...")
            
            # Create sync task to prevent duplicate requests
            sync_task = asyncio.create_task(self._sync_user_portfolio(user_id))
            self.sync_in_progress[user_id] = sync_task
            
            try:
                fresh_data = await sync_task
                await self._cache_portfolio(user_id, fresh_data)
                return fresh_data
            finally:
                # Remove from in-progress tracking
                self.sync_in_progress.pop(user_id, None)
            
        except Exception as e:
            logger.error(f"Error ensuring fresh portfolio for user {user_id}: {e}")
            # Return empty portfolio on error rather than failing
            return self.portfolio_service._empty_portfolio_response()
    
    async def _sync_user_portfolio(self, user_id: str) -> Dict[str, Any]:
        """Synchronize user portfolio data from all providers."""
        try:
            # Get fresh data from all providers
            portfolio_data = await self.portfolio_service.get_user_portfolio(user_id)
            
            # Update database snapshots for historical tracking
            await self._create_portfolio_snapshot(user_id, portfolio_data)
            
            logger.info(f"✅ Successfully synced portfolio for user {user_id}: "
                       f"${portfolio_data['summary']['total_value']:.2f}, "
                       f"{portfolio_data['summary']['position_count']} positions")
            
            return portfolio_data
            
        except Exception as e:
            logger.error(f"Error syncing portfolio for user {user_id}: {e}")
            raise
    
    async def _get_cached_portfolio(self, user_id: str, max_age_minutes: int) -> Optional[Dict[str, Any]]:
        """Get cached portfolio data if it's fresh enough."""
        try:
            # Try Redis cache first for fastest lookups
            try:
                from api_server import get_redis_client
                redis_client = await get_redis_client()
                if redis_client:
                    cache_key = f"portfolio:{user_id}"
                    cached_payload = await redis_client.get(cache_key)
                    if cached_payload:
                        logger.info(f"⚡ Redis cache hit for user {user_id}")
                        try:
                            return json.loads(cached_payload)
                        except Exception as decode_error:
                            logger.warning(
                                f"Redis cache decode failed for user {user_id}: {decode_error}"
                            )
            except Exception as re:
                logger.warning(f"Redis cache read failed for user {user_id}: {re}")

            # Fallback: check database snapshots when Redis miss or unavailable
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            cutoff_time = datetime.now() - timedelta(minutes=max_age_minutes)
            
            # Check for recent portfolio snapshot
            result = supabase.table('user_portfolio_snapshots')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('snapshot_type', 'manual')\
                .gte('created_at', cutoff_time.isoformat())\
                .order('created_at', desc=True)\
                .limit(1)\
                .execute()
            
            if result.data:
                snapshot = result.data[0]
                logger.info(f"📋 Found recent snapshot for user {user_id} from {snapshot['created_at']}")
                
                # Convert snapshot back to portfolio format
                return self._snapshot_to_portfolio(snapshot)
            
            return None
            
        except Exception as e:
            logger.error(f"Error checking cached portfolio for user {user_id}: {e}")
            return None
    
    async def _cache_portfolio(self, user_id: str, portfolio_data: Dict[str, Any]):
        """Cache portfolio data for future use."""
        try:
            # Create portfolio snapshot
            await self._create_portfolio_snapshot(user_id, portfolio_data, snapshot_type='manual')
            
            # Also cache in Redis for faster access
            try:
                # Lazy import to avoid circular dependencies at module import time
                from api_server import get_redis_client  # async redis client
                redis_client = await get_redis_client()
                if redis_client:
                    # Cache for 30 minutes (1800 seconds)
                    await redis_client.setex(
                        f"portfolio:{user_id}", 1800, json.dumps(portfolio_data, default=str)
                    )
            except Exception as re:
                # Do not fail the request if Redis is unavailable
                logger.warning(f"Redis cache set failed for user {user_id}: {re}")
            
        except Exception as e:
            logger.error(f"Error caching portfolio for user {user_id}: {e}")
    
    async def _create_portfolio_snapshot(self, user_id: str, portfolio_data: Dict[str, Any], 
                                       snapshot_type: str = 'manual'):
        """Create portfolio snapshot in database."""
        try:
            from utils.supabase.db_client import get_supabase_client
            
            summary = portfolio_data.get('summary', {})
            
            snapshot_data = {
                'user_id': user_id,
                'snapshot_date': datetime.now().date().isoformat(),
                'snapshot_type': snapshot_type,
                'total_value': summary.get('total_value', 0),
                'total_cost_basis': summary.get('total_cost_basis', 0),
                'total_gain_loss': summary.get('total_gain_loss', 0),
                'total_gain_loss_percent': summary.get('total_gain_loss_percent', 0),
                'account_count': summary.get('account_count', 0),
                'provider_breakdown': {
                    'plaid': {
                        'accounts': summary.get('account_count', 0),
                        'value': summary.get('total_value', 0)
                    }
                },
                'top_holdings': portfolio_data.get('positions', [])[:10]  # Top 10 holdings
            }
            
            supabase = get_supabase_client()
            
            # Use direct table insert with upsert
            result = supabase.table('user_portfolio_snapshots')\
                .upsert(snapshot_data, on_conflict='user_id,snapshot_date,snapshot_type')\
                .execute()
            
            logger.info(f"📸 Created portfolio snapshot for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error creating portfolio snapshot: {e}")
    
    def _snapshot_to_portfolio(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """Convert database snapshot back to portfolio data format."""
        return {
            'accounts': [],  # Will be filled by live data
            'positions': snapshot.get('top_holdings', []),
            'summary': {
                'total_value': float(snapshot.get('total_value', 0)),
                'total_cost_basis': float(snapshot.get('total_cost_basis', 0)),
                'total_gain_loss': float(snapshot.get('total_gain_loss', 0)),
                'total_gain_loss_percent': float(snapshot.get('total_gain_loss_percent', 0)),
                'account_count': snapshot.get('account_count', 0),
                'position_count': len(snapshot.get('top_holdings', []))
            },
            'metadata': {
                'last_updated': snapshot.get('created_at'),
                'providers': ['plaid'],
                'data_freshness': 'cached'
            }
        }

# Global sync service instance
sync_service = PortfolioSyncService()
