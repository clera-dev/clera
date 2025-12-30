"""
Portfolio Data Freshness Management

Production-grade endpoints for checking and maintaining portfolio data freshness.
Implements industry-standard staleness detection and auto-sync triggers.

Industry Best Practices (Robinhood, Wealthfront, Betterment):
- Data should be refreshed every 5 minutes during market hours
- Data can be 30+ minutes stale during non-market hours
- Users should always see "Last Updated" timestamp
- Auto-sync on page load if data is stale

Features:
- Automatic background refresh every 1 hour (configurable)
- Secure rate limiting with atomic database operations
- Manual refresh with 5-minute cooldown
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Query, Header, HTTPException

from utils.authentication import get_authenticated_user_id
from utils.supabase.db_client import get_supabase_client
from utils.trading_calendar import get_trading_calendar


# Inline verify_api_key to avoid circular imports (same pattern as snaptrade_routes.py)
def verify_api_key(x_api_key: str = Header(None)):
    """Verify the API key from the request header."""
    expected_key = os.getenv("BACKEND_API_KEY")
    if not expected_key:
        raise HTTPException(status_code=500, detail="API key not configured")
    if x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/portfolio", tags=["Portfolio Freshness"])

# Configuration
STALE_THRESHOLD_MARKET_HOURS_MINUTES = 5  # Sync if data is >5 min old during market hours
STALE_THRESHOLD_OFF_HOURS_MINUTES = 30    # Sync if data is >30 min old outside market hours


def _is_market_hours() -> bool:
    """Check if we're currently in US market hours (9:30 AM - 4:00 PM ET)."""
    try:
        calendar = get_trading_calendar()
        return calendar.is_market_open_now()
    except Exception as e:
        logger.warning(f"Could not check market hours: {e}")
        # Default to conservative (market open) behavior
        return True


def _get_staleness_threshold_minutes() -> int:
    """Get the appropriate staleness threshold based on market hours."""
    if _is_market_hours():
        return STALE_THRESHOLD_MARKET_HOURS_MINUTES
    return STALE_THRESHOLD_OFF_HOURS_MINUTES


@router.get("/freshness")
async def get_portfolio_freshness(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
) -> Dict[str, Any]:
    """
    Get portfolio data freshness status for a user.
    
    Returns:
        - last_synced: ISO timestamp of last sync
        - is_stale: Whether data needs refresh
        - staleness_threshold_minutes: Current threshold being used
        - needs_sync: Recommended action (sync now vs use cached)
        - market_status: Whether markets are currently open
    
    Industry Standard: This endpoint is called on page load to determine
    if an auto-sync should be triggered before displaying data.
    """
    try:
        supabase = get_supabase_client()
        
        # Get the most recent sync timestamp from user_aggregated_holdings
        result = supabase.table('user_aggregated_holdings')\
            .select('updated_at')\
            .eq('user_id', user_id)\
            .order('updated_at', desc=True)\
            .limit(1)\
            .execute()
        
        # Also check user_investment_accounts for last_synced
        accounts_result = supabase.table('user_investment_accounts')\
            .select('last_synced')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .order('last_synced', desc=True)\
            .limit(1)\
            .execute()
        
        # Determine last sync time (most recent of holdings update or account sync)
        last_synced = None
        
        if result.data and result.data[0].get('updated_at'):
            holdings_updated = datetime.fromisoformat(result.data[0]['updated_at'].replace('Z', '+00:00'))
            last_synced = holdings_updated
        
        if accounts_result.data and accounts_result.data[0].get('last_synced'):
            account_synced = datetime.fromisoformat(accounts_result.data[0]['last_synced'].replace('Z', '+00:00'))
            if last_synced is None or account_synced > last_synced:
                last_synced = account_synced
        
        # Calculate staleness
        is_market_open = _is_market_hours()
        threshold_minutes = _get_staleness_threshold_minutes()
        
        if last_synced:
            # Ensure timezone-aware comparison
            now = datetime.now(last_synced.tzinfo) if last_synced.tzinfo else datetime.utcnow()
            age_minutes = (now - last_synced).total_seconds() / 60
            is_stale = age_minutes > threshold_minutes
            last_synced_iso = last_synced.isoformat()
        else:
            # No data ever synced - definitely stale
            age_minutes = float('inf')
            is_stale = True
            last_synced_iso = None
        
        logger.info(
            f"Portfolio freshness for user {user_id}: "
            f"last_synced={last_synced_iso}, age={age_minutes:.1f}min, "
            f"stale={is_stale} (threshold={threshold_minutes}min)"
        )
        
        return {
            "user_id": user_id,
            "last_synced": last_synced_iso,
            "age_minutes": round(age_minutes, 1) if age_minutes != float('inf') else None,
            "is_stale": is_stale,
            "needs_sync": is_stale,
            "staleness_threshold_minutes": threshold_minutes,
            "market_status": "open" if is_market_open else "closed",
            "recommendation": "sync_now" if is_stale else "use_cached"
        }
        
    except Exception as e:
        logger.error(f"Error checking portfolio freshness for user {user_id}: {e}")
        # On error, recommend sync to be safe
        return {
            "user_id": user_id,
            "last_synced": None,
            "age_minutes": None,
            "is_stale": True,
            "needs_sync": True,
            "staleness_threshold_minutes": _get_staleness_threshold_minutes(),
            "market_status": "unknown",
            "recommendation": "sync_now",
            "error": "Unable to check freshness status"  # Generic error, don't expose internals
        }


@router.post("/sync-if-stale")
async def sync_portfolio_if_stale(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key),
    force: bool = Query(False, description="Force sync regardless of staleness")
) -> Dict[str, Any]:
    """
    Intelligently sync portfolio data only if it's stale.
    
    PRODUCTION-GRADE APPROACH:
    
    **Non-forced (page load):**
    - Reads from SnapTrade's cached data (FREE, fast)
    - Syncs to our DB if our local cache is stale
    - Data may be 1-24 hours old from brokerage perspective
    
    **Forced (manual refresh button):**
    - Triggers refresh_brokerage_authorization() which pulls FRESH data from brokerage
    - COSTS MONEY per call - SnapTrade charges for this
    - Async - queues refresh and data arrives via webhook
    - Rate limited to prevent abuse (1 per 5 min per user)
    
    Args:
        force: If True, trigger real brokerage refresh (rate limited, costs money)
    
    Returns:
        - synced: Whether a sync was performed
        - positions_synced: Number of positions if synced
        - last_synced: Updated timestamp
        - was_stale: Whether data was stale before sync
        - refresh_triggered: (force only) Whether brokerage refresh was triggered
    """
    try:
        # Check freshness first
        freshness = await get_portfolio_freshness(user_id, api_key)
        
        if not force and not freshness.get('is_stale', True):
            # Data is fresh, no sync needed
            logger.info(f"Portfolio for user {user_id} is fresh ({freshness.get('age_minutes', 0):.1f}min old), skipping sync")
            return {
                "synced": False,
                "reason": "data_fresh",
                "last_synced": freshness.get('last_synced'),
                "age_minutes": freshness.get('age_minutes'),
                "was_stale": False,
                "positions_synced": 0
            }
        
        # Data is stale, trigger sync
        logger.info(f"Portfolio for user {user_id} is stale ({freshness.get('age_minutes')} min old), triggering sync")
        
        # For force=True (manual refresh), also trigger real brokerage refresh
        # This calls SnapTrade's refresh_brokerage_authorization which pulls live data
        refresh_triggered = False
        rate_limited = False
        minutes_until_refresh = None
        
        if force:
            # SECURE RATE LIMITING: Use atomic database operations
            # This prevents race conditions where concurrent requests could bypass limits
            from utils.rate_limiter import get_rate_limiter
            rate_limiter = get_rate_limiter()
            
            can_refresh, wait_time = rate_limiter.check_and_update_rate_limit(
                user_id=user_id,
                action='portfolio_refresh',
                limit_minutes=5  # Rate limit: 1 refresh per 5 min
            )
            
            if not can_refresh:
                rate_limited = True
                minutes_until_refresh = wait_time
                logger.info(f"🚫 Rate limited: User {user_id} must wait {wait_time:.1f} min")
            else:
                try:
                    from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
                    provider = SnapTradePortfolioProvider()
                    refresh_success = await provider.refresh_data(user_id)
                    refresh_triggered = refresh_success
                    
                    # NOTE: We do NOT update last_synced here because:
                    # 1. The brokerage refresh is ASYNC - data arrives via webhook later
                    # 2. Updating timestamp now would be misleading
                    # 3. The webhook handler updates last_synced when actual data arrives
                    if refresh_success:
                        logger.info(f"✅ Triggered brokerage refresh for user {user_id} (data will arrive via webhook)")
                except Exception as e:
                    logger.warning(f"Could not trigger brokerage refresh: {e}")
        
        # Always sync from SnapTrade cache to our DB (even if rate limited for brokerage refresh)
        from utils.portfolio.snaptrade_sync_service import trigger_full_user_sync
        sync_result = await trigger_full_user_sync(user_id, force_rebuild=force and not rate_limited)
        
        # Determine if sync actually succeeded
        sync_success = sync_result.get('success', False)
        
        response = {
            "synced": sync_success,  # Accurately reflect whether sync succeeded
            "reason": "data_stale" if not force else ("rate_limited" if rate_limited else "force_refresh"),
            "last_synced": datetime.utcnow().isoformat() + 'Z' if sync_success else freshness.get('last_synced'),
            "was_stale": freshness.get('is_stale', True),
            "positions_synced": sync_result.get('positions_synced', 0),
            "sync_success": sync_success,
            "refresh_triggered": refresh_triggered,  # Indicates if real brokerage refresh was queued
        }
        
        # Add rate limiting info if applicable
        if rate_limited:
            response["rate_limited"] = True
            response["minutes_until_refresh"] = round(minutes_until_refresh, 1) if minutes_until_refresh else None
            response["note"] = f"Rate limited - you can refresh again in {minutes_until_refresh:.1f} minutes"
        elif refresh_triggered:
            response["note"] = "Brokerage refresh is async - fresh data will arrive via webhook"
        elif not sync_success:
            response["note"] = "Sync failed - using cached data"
        
        return response
        
    except Exception as e:
        logger.error(f"Error in sync-if-stale for user {user_id}: {e}")
        return {
            "synced": False,
            "reason": "error",
            "error": "An internal error occurred",  # Generic error, don't expose internals
            "was_stale": True,
            "positions_synced": 0
        }


@router.get("/refresh-status")
async def get_refresh_status(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
) -> Dict[str, Any]:
    """
    Get the current rate limit status for manual refresh.
    
    Returns:
        - can_refresh: Whether the user can trigger a manual refresh now
        - minutes_until_refresh: Time until next refresh is allowed
        - last_refresh: Timestamp of last manual refresh
        - total_refreshes: Total number of refreshes by this user
    """
    try:
        from utils.rate_limiter import get_rate_limiter
        rate_limiter = get_rate_limiter()
        
        status = rate_limiter.get_rate_limit_status(
            user_id=user_id,
            action='portfolio_refresh',
            limit_minutes=5
        )
        
        return status
        
    except Exception as e:
        logger.error(f"Error getting refresh status for user {user_id}: {e}")
        return {
            "can_refresh": False,
            "error": "Unable to check refresh status"  # Generic error, don't expose internals
        }


@router.get("/scheduler-status")
async def get_scheduler_status(
    api_key: str = Depends(verify_api_key)
) -> Dict[str, Any]:
    """
    Get the background scheduler status (admin endpoint).
    
    Returns:
        - is_running: Whether the scheduler is active
        - jobs: List of scheduled jobs with next run times
        - config: Current scheduler configuration
    """
    try:
        from services.portfolio_refresh_scheduler import get_portfolio_refresh_scheduler
        scheduler = get_portfolio_refresh_scheduler()
        
        return scheduler.get_status()
        
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        return {
            "is_running": False,
            "error": "Unable to get scheduler status"  # Generic error, don't expose internals
        }
