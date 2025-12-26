"""
SnapTrade Daily Portfolio Snapshot Service

PRODUCTION-GRADE: Automatically captures daily EOD (end-of-day) portfolio snapshots
for all SnapTrade users using SnapTrade's reporting API.

This service solves the "server downtime" problem with intelligent backfill:
1. Runs daily via cron/scheduler at market close (4:30 PM ET)
2. Automatically detects missing days (gaps in historical data)
3. Backfills missing snapshots using SnapTrade's historical reporting API
4. Ensures charts never show $0 or missing data due to server downtime

Features:
- ✅ Automatic gap detection and backfill
- ✅ Uses SnapTrade's native reporting API (includes deposits/withdrawals)
- ✅ Idempotent: safe to run multiple times (won't create duplicates)
- ✅ Efficient: only fetches data for missing dates
- ✅ Production-ready: comprehensive logging and error handling
"""

import os
import asyncio
import logging
from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class DailySnapTradeSnapshotService:
    """
    Service to capture daily portfolio snapshots for SnapTrade users.
    
    Handles both daily capture and automatic backfill of missing dates.
    """
    
    def __init__(self):
        """Initialize the snapshot service."""
        from snaptrade_client import SnapTrade
        
        self.client = SnapTrade(
            consumer_key=os.getenv('SNAPTRADE_CONSUMER_KEY'),
            client_id=os.getenv('SNAPTRADE_CLIENT_ID')
        )
    
    def _get_supabase_client(self):
        """Get Supabase client for database operations."""
        from supabase import create_client
        
        return create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        )
    
    async def capture_all_users_snapshots(self, backfill_missing: bool = True) -> Dict[str, Any]:
        """
        Capture today's EOD snapshot for ALL SnapTrade users.
        
        PRODUCTION-GRADE: Automatically backfills missing days if server was down.
        
        Args:
            backfill_missing: If True, automatically backfills gaps in historical data
            
        Returns:
            Summary of capture results
        """
        logger.info("🚀 Starting daily SnapTrade snapshot capture")
        
        try:
            supabase = self._get_supabase_client()
            
            # Get all users with SnapTrade connections
            result = supabase.table('snaptrade_brokerage_connections')\
                .select('user_id')\
                .eq('connection_status', 'active')\
                .execute()
            
            if not result.data:
                logger.warning("No active SnapTrade users found")
                return {"success": True, "users_processed": 0, "snapshots_created": 0}
            
            # Get unique user IDs
            user_ids = list(set(r['user_id'] for r in result.data))
            logger.info(f"📊 Found {len(user_ids)} users with active SnapTrade connections")
            
            snapshots_created = 0
            backfills_performed = 0
            errors = []
            
            for user_id in user_ids:
                try:
                    # Capture today's snapshot
                    success = await self._capture_user_snapshot(user_id)
                    if success:
                        snapshots_created += 1
                    
                    # PRODUCTION-GRADE: Automatic backfill for missing days
                    if backfill_missing:
                        missing_days = await self._detect_missing_days(user_id)
                        if missing_days:
                            logger.info(f"🔍 User {user_id} has {len(missing_days)} missing days, starting backfill...")
                            backfilled = await self._backfill_missing_days(user_id, missing_days)
                            backfills_performed += backfilled
                            logger.info(f"✅ Backfilled {backfilled} snapshots for user {user_id}")
                    
                except Exception as e:
                    logger.error(f"Error processing user {user_id}: {e}")
                    errors.append({"user_id": user_id, "error": str(e)})
            
            logger.info(f"✅ Daily snapshot capture complete: {snapshots_created} new snapshots, {backfills_performed} backfilled")
            
            return {
                "success": True,
                "users_processed": len(user_ids),
                "snapshots_created": snapshots_created,
                "backfills_performed": backfills_performed,
                "errors": errors if errors else None
            }
            
        except Exception as e:
            logger.error(f"Error in daily snapshot capture: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _capture_user_snapshot(self, user_id: str) -> bool:
        """
        Capture a single EOD snapshot for a user using LIVE price enrichment.
        
        PRODUCTION-GRADE FIX: Uses live market prices instead of stale reconstructed values.
        This ensures each day's snapshot reflects actual market prices, not duplicated values.
        
        CRITICAL: Skips snapshot capture on market closed days (weekends/holidays).
        On closed days, the previous trading day's value should be used for charts.
        
        Args:
            user_id: User ID to capture snapshot for
            
        Returns:
            True if snapshot was created, False if already exists or error
        """
        try:
            from utils.trading_calendar import get_trading_calendar
            
            supabase = self._get_supabase_client()
            today = datetime.now().date()
            
            # CRITICAL FIX: Skip snapshot capture on market closed days (weekends/holidays)
            # On Christmas, Thanksgiving, etc., we don't want to capture live prices
            # because crypto prices would create misleading portfolio values
            trading_calendar = get_trading_calendar()
            if not trading_calendar.is_market_open_today(today):
                logger.info(f"📅 Market closed on {today} - skipping snapshot capture for user {user_id}")
                return False
            
            # Check if snapshot already exists for today
            existing = supabase.table('user_portfolio_history')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('value_date', today.isoformat())\
                .eq('snapshot_type', 'daily_eod')\
                .execute()
            
            if existing.data:
                logger.debug(f"Snapshot already exists for user {user_id} on {today}")
                return False
            
            # PRODUCTION-GRADE: Get LIVE portfolio value using enrichment service
            # This fetches current holdings and enriches with live market prices
            holdings_result = supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', user_id)\
                .execute()
            
            if not holdings_result.data:
                logger.warning(f"No holdings found for user {user_id}")
                return False
            
            # Enrich with live prices
            # Use asyncio.to_thread to avoid blocking the event loop (enrich_holdings uses sync requests)
            from utils.portfolio.live_enrichment_service import get_enrichment_service
            enrichment_service = get_enrichment_service()
            enriched_holdings = await asyncio.to_thread(
                enrichment_service.enrich_holdings, holdings_result.data, user_id
            )
            
            # Calculate portfolio value from enriched data
            # Use `or 0` pattern to handle NULL database values (get() default only applies when key is missing)
            total_value = sum(float(h.get('total_market_value') or 0) for h in enriched_holdings)
            total_cost_basis = sum(float(h.get('total_cost_basis') or 0) for h in enriched_holdings)
            total_gain_loss = total_value - total_cost_basis
            total_gain_loss_percent = (total_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0
            
            if total_value <= 0:
                logger.warning(f"No portfolio value for user {user_id}")
                return False
            
            # Create EOD snapshot with accurate values
            snapshot = {
                'user_id': user_id,
                'value_date': today.isoformat(),
                'total_value': total_value,
                'total_cost_basis': total_cost_basis,
                'total_gain_loss': total_gain_loss,
                'total_gain_loss_percent': min(max(total_gain_loss_percent, -999.99), 999.99),  # Cap for DB
                'snapshot_type': 'daily_eod',
                'data_source': 'snaptrade_live',
                'data_quality_score': 100.0,  # Live prices = high quality
                'securities_count': len(enriched_holdings)
            }
            
            supabase.table('user_portfolio_history').insert(snapshot).execute()
            logger.info(f"✅ Created snapshot for user {user_id}: ${total_value:,.2f} (P/L: ${total_gain_loss:+,.2f})")
            return True
            
        except Exception as e:
            logger.error(f"Error capturing snapshot for user {user_id}: {e}")
            return False
    
    async def _detect_missing_days(self, user_id: str, lookback_days: int = 30) -> List[date]:
        """
        Detect missing snapshot days for a user.
        
        PRODUCTION-GRADE: Uses trading_calendar to properly skip BOTH weekends AND holidays.
        This ensures we don't try to backfill Christmas, Thanksgiving, etc.
        
        Args:
            user_id: User ID to check
            lookback_days: How many calendar days to look back (default: 30)
            
        Returns:
            List of dates that are missing snapshots (only actual trading days)
        """
        try:
            from utils.trading_calendar import get_trading_calendar
            
            supabase = self._get_supabase_client()
            today = datetime.now().date()
            start_date = today - timedelta(days=lookback_days)
            
            # Get trading calendar for holiday detection
            trading_calendar = get_trading_calendar()
            
            # Get existing snapshots in this period
            # FIX: Filter by snapshot_type='daily_eod' to avoid treating reconstructed rows as coverage
            result = supabase.table('user_portfolio_history')\
                .select('value_date')\
                .eq('user_id', user_id)\
                .eq('snapshot_type', 'daily_eod')\
                .gte('value_date', start_date.isoformat())\
                .lte('value_date', today.isoformat())\
                .execute()
            
            existing_dates = set()
            if result.data:
                for row in result.data:
                    existing_dates.add(datetime.fromisoformat(row['value_date']).date())
            
            # CRITICAL FIX: Use trading_calendar to check BOTH weekends AND holidays
            # This ensures we only count ACTUAL trading days as missing
            missing_days = []
            current_date = start_date
            
            while current_date <= today:
                # PRODUCTION-GRADE: Use trading calendar for proper holiday detection
                # This skips Christmas, Thanksgiving, MLK Day, etc.
                if trading_calendar.is_market_open_today(current_date):
                    if current_date not in existing_dates:
                        missing_days.append(current_date)
                
                current_date += timedelta(days=1)
            
            if missing_days:
                logger.info(f"🔍 User {user_id} missing {len(missing_days)} trading days: {missing_days[0]} to {missing_days[-1]}")
            
            return missing_days
            
        except Exception as e:
            logger.error(f"Error detecting missing days for user {user_id}: {e}")
            return []
    
    async def _backfill_missing_days(self, user_id: str, missing_days: List[date]) -> int:
        """
        Backfill missing snapshots using SnapTrade's reporting API.
        
        EFFICIENT: Fetches all missing days in one API call, then inserts them.
        
        Args:
            user_id: User ID to backfill for
            missing_days: List of dates to backfill
            
        Returns:
            Number of snapshots successfully backfilled
        """
        if not missing_days:
            return 0
        
        try:
            supabase = self._get_supabase_client()
            
            # Calculate lookback days to cover all missing days
            earliest_missing = min(missing_days)
            days_to_fetch = (datetime.now().date() - earliest_missing).days + 1
            
            # Fetch historical data from SnapTrade reporting API
            from services.snaptrade_reporting_service import get_snaptrade_reporting_service
            reporting_service = get_snaptrade_reporting_service()
            
            result = await reporting_service.fetch_portfolio_history(user_id, lookback_days=days_to_fetch)
            
            if not result['success']:
                logger.error(f"Failed to fetch backfill data for user {user_id}: {result.get('error')}")
                return 0
            
            # Query the reconstructed snapshots that were just inserted
            snapshots_result = supabase.table('user_portfolio_history')\
                .select('value_date, total_value')\
                .eq('user_id', user_id)\
                .in_('value_date', [d.isoformat() for d in missing_days])\
                .eq('snapshot_type', 'reconstructed')\
                .execute()
            
            if not snapshots_result.data:
                logger.warning(f"No data returned for missing days for user {user_id}")
                return 0
            
            # Convert reconstructed snapshots to daily_eod type
            backfilled_count = 0
            for snapshot in snapshots_result.data:
                try:
                    eod_snapshot = {
                        'user_id': user_id,
                        'value_date': snapshot['value_date'],
                        'total_value': float(snapshot['total_value']),
                        'total_cost_basis': float(snapshot['total_value']),
                        'total_gain_loss': 0.0,
                        'total_gain_loss_percent': 0.0,
                        'snapshot_type': 'daily_eod',
                        'data_source': 'snaptrade',
                        'securities_count': 0
                    }
                    
                    supabase.table('user_portfolio_history').insert(eod_snapshot).execute()
                    backfilled_count += 1
                    
                except Exception as e:
                    logger.error(f"Error backfilling snapshot for {snapshot['value_date']}: {e}")
            
            logger.info(f"✅ Backfilled {backfilled_count} snapshots for user {user_id}")
            return backfilled_count
            
        except Exception as e:
            logger.error(f"Error backfilling missing days for user {user_id}: {e}")
            return 0


# Global service instance
_daily_snapshot_service = None

def get_daily_snapshot_service() -> DailySnapTradeSnapshotService:
    """Get the global daily snapshot service instance."""
    global _daily_snapshot_service
    if _daily_snapshot_service is None:
        _daily_snapshot_service = DailySnapTradeSnapshotService()
    return _daily_snapshot_service
