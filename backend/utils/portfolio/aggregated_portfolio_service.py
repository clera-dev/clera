"""
Aggregated Portfolio Service

Production-grade service for handling portfolio calculations using aggregated data
from multiple financial institutions via Plaid Investment API.

This service follows SOLID principles:
- Single Responsibility: Handles only aggregated portfolio calculations
- Open/Closed: Extensible without modifying existing code
- Dependency Inversion: Depends on abstractions (database interface)
- Interface Segregation: Focused interface for portfolio calculations
- Modularity: Clean separation from API layer
"""

import logging
import json
from typing import Dict, Any, List, Optional
from decimal import Decimal
from datetime import datetime

logger = logging.getLogger(__name__)

class AggregatedPortfolioService:
    """
    Service for calculating portfolio metrics from aggregated investment data.
    
    This service provides portfolio value, analytics, and asset allocation
    calculations for users with external investment accounts connected via Plaid.
    """
    
    def __init__(self):
        """Initialize the aggregated portfolio service."""
        self.supabase = None  # Lazy loaded to avoid circular imports
    
    def _get_supabase_client(self):
        """Lazy load Supabase client to avoid circular imports."""
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    async def get_portfolio_value(self, user_id: str, include_cash: bool = True) -> Dict[str, Any]:
        """
        Calculate current portfolio value and return metrics for aggregated data.
        
        PRODUCTION-GRADE: Uses live market prices via LiveEnrichmentService (FMP API).
        
        Args:
            user_id: User ID to calculate portfolio value for
            include_cash: Whether to include cash positions (default True for accurate total portfolio value)
            
        Returns:
            Dictionary with portfolio value, today's return, and metadata
        """
        try:
            supabase = self._get_supabase_client()
            
            # Get aggregated holdings for this user (need ALL fields for enrichment)
            query = supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', user_id)
            
            # CRITICAL: Include cash by default for accurate portfolio value
            # Cash is part of the total portfolio value and should be counted
            if not include_cash:
                query = query.neq('security_type', 'cash').neq('symbol', 'U S Dollar')
            
            result = query.execute()
            
            if not result.data:
                logger.warning(f"No aggregated holdings found for user {user_id}")
                return self._empty_portfolio_value_response()
            
            # CRITICAL: Enrich with LIVE market prices (database values are stale)
            from utils.portfolio.live_enrichment_service import get_enrichment_service
            enrichment_service = get_enrichment_service()
            enriched_holdings = enrichment_service.enrich_holdings(result.data, user_id)
            
            # Use modular calculation function with enriched data
            from .aggregated_calculations import calculate_portfolio_value
            return calculate_portfolio_value(enriched_holdings, user_id)
            
        except Exception as e:
            logger.error(f"Error getting aggregated portfolio value for user {user_id}: {e}")
            return self._empty_portfolio_value_response(error=str(e))
    
    async def get_portfolio_analytics(self, user_id: str) -> Dict[str, Any]:
        """
        Calculate portfolio analytics (risk and diversification scores) from aggregated data.
        
        Args:
            user_id: User ID to calculate analytics for
            
        Returns:
            Dictionary with risk_score and diversification_score
        """
        try:
            supabase = self._get_supabase_client()
            
            # Get aggregated holdings for analytics (EXCLUDE CASH POSITIONS)
            result = supabase.table('user_aggregated_holdings')\
                .select('symbol, security_name, security_type, total_quantity, total_market_value, total_cost_basis, unrealized_gain_loss')\
                .eq('user_id', user_id)\
                .neq('security_type', 'cash')\
                .neq('symbol', 'U S Dollar')\
                .execute()
            
            if not result.data:
                logger.warning(f"No aggregated holdings found for user {user_id}")
                return {"risk_score": "0.0", "diversification_score": "0.0"}
            
            # Use modular calculation function
            from .aggregated_calculations import calculate_portfolio_analytics
            return calculate_portfolio_analytics(result.data, user_id)
            
        except Exception as e:
            logger.error(f"Error calculating aggregated portfolio analytics for user {user_id}: {e}")
            return {"risk_score": "0.0", "diversification_score": "0.0"}
    
    async def get_asset_allocation(self, user_id: str) -> Dict[str, Any]:
        """
        Calculate asset allocation breakdown from aggregated holdings.
        
        OPTIMIZATION: Implements 30-second response cache for performance.
        
        Args:
            user_id: User ID to calculate asset allocation for
            
        Returns:
            Dictionary with cash/stock/bond allocation and pie chart data
        """
        # OPTIMIZATION: Check response cache first (30-second TTL)
        cache_key = f"asset_allocation:aggregated:{user_id}"
        cached_response = self._get_cached_response(cache_key)
        if cached_response:
            logger.debug(f"✅ [Cache Hit] Returning cached asset allocation for user {user_id}")
            return cached_response
        
        try:
            supabase = self._get_supabase_client()
            
            # Get aggregated holdings for allocation calculation (INCLUDE CASH for allocation percentages)
            result = supabase.table('user_aggregated_holdings')\
                .select('symbol, security_name, security_type, total_market_value')\
                .eq('user_id', user_id)\
                .execute()
            
            if not result.data:
                logger.warning(f"No aggregated holdings found for user {user_id}")
                return self._empty_allocation_response()
            
            # Use modular calculation function
            from .aggregated_calculations import calculate_asset_allocation
            response = calculate_asset_allocation(result.data, user_id)
            
            # OPTIMIZATION: Cache the response for 30 seconds
            self._cache_response(cache_key, response, ttl_seconds=30)
            logger.debug(f"💾 [Cache Set] Cached asset allocation for user {user_id}")
            
            return response
            
        except Exception as e:
            logger.error(f"Error calculating aggregated asset allocation for user {user_id}: {e}")
            return self._empty_allocation_response(error=str(e))
    
    
    def _empty_portfolio_value_response(self, error: Optional[str] = None) -> Dict[str, Any]:
        """Return empty portfolio value response."""
        response = {
            "account_id": "aggregated",
            "total_value": "$0.00",
            "today_return": "+$0.00 (0.00%)",
            "raw_value": 0.0,
            "raw_return": 0.0,
            "raw_return_percent": 0.0,
            "timestamp": datetime.now().isoformat(),
            "data_source": "plaid_aggregated"
        }
        if error:
            response["error"] = error
        return response
    
    async def get_portfolio_history(self, user_id: str, period: str = '1M', filter_account: Optional[str] = None) -> Dict[str, Any]:
        """
        Get portfolio history for aggregation mode using database snapshots.
        
        Since Plaid doesn't provide direct portfolio history like Alpaca,
        we construct it from our daily portfolio snapshots.
        
        Args:
            user_id: User ID to get history for
            period: Time period (1W, 1M, 3M, 1Y, MAX)
            filter_account: Optional account UUID to filter data to specific account only
            
        Returns:
            Portfolio history response compatible with frontend chart (all accounts or filtered)
        """
        try:
            supabase = self._get_supabase_client()
            
            # Handle account-specific filtering
            if filter_account:
                return await self._get_account_specific_history(user_id, period, filter_account)
            
            # Calculate date range based on period
            from datetime import datetime, timedelta
            end_date = datetime.now().date()
            
            period_mapping = {
                '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'MAX': 730  # 2 years max
            }
            days_back = period_mapping.get(period, 30)
            start_date = end_date - timedelta(days=days_back)
            
            # CRITICAL FIX: For 1D, ALWAYS use intraday chart with live price updates
            # This shows multiple data points throughout the day (hourly interpolation)
            # instead of just 2 EOD points (yesterday close → today close)
            if period == '1D':
                logger.info(f"🔧 1D request - building intraday chart with live price movements")
                return await self._build_intraday_chart(user_id, filter_account)
            
            # Get portfolio history snapshots for the period (from reconstructed history)
            result = supabase.table('user_portfolio_history')\
                .select('value_date, total_value, total_gain_loss, total_gain_loss_percent, created_at')\
                .eq('user_id', user_id)\
                .gte('value_date', start_date.isoformat())\
                .lte('value_date', end_date.isoformat())\
                .in_('snapshot_type', ['reconstructed', 'daily_eod'])\
                .order('value_date', desc=False)\
                .execute()
            
            snapshots = result.data or []
            
            if not snapshots:
                logger.warning(f"No portfolio history found for user {user_id} in period {period}")
                return self._empty_history_response(period)
            
            # CRITICAL FIX: Historical snapshots ALREADY include cash in total_value
            # Snapshots are created with include_cash=True, so NO need to add cash again
            # Double-counting cash was causing inflated historical values
            # cash_balance = 0.0  # REMOVED: Don't add cash (already in snapshots)
            
            # Convert snapshots to chart data format
            timestamps = []
            equity_values = []
            profit_loss = []
            profit_loss_pct = []
            
            # Generate DAILY data points for the entire requested period (like Alpaca did)
            from datetime import timedelta
            
            # Create snapshot lookup for efficient access
            snapshot_by_date = {}
            for snapshot in snapshots:
                snapshot_date = datetime.fromisoformat(snapshot['value_date']).date()
                snapshot_by_date[snapshot_date] = snapshot
            
            # CRITICAL FIX: Get last known value BEFORE start_date to handle periods starting on weekends
            last_known_value = 0.0
            lookback_result = supabase.table('user_portfolio_history')\
                .select('total_value')\
                .eq('user_id', user_id)\
                .lt('value_date', start_date.isoformat())\
                .in_('snapshot_type', ['reconstructed', 'daily_eod'])\
                .gt('total_value', 0)\
                .order('value_date', desc=True)\
                .limit(1)\
                .execute()
            
            if lookback_result.data and len(lookback_result.data) > 0:
                last_known_value = float(lookback_result.data[0]['total_value'])
                logger.info(f"📍 Found last known value before period start: ${last_known_value:.2f}")
            
            # Generate daily timeline from start_date to end_date
            current_date = start_date
            
            while current_date <= end_date:
                # Convert to timestamp
                date_timestamp = int(datetime.combine(current_date, datetime.min.time()).timestamp())
                timestamps.append(date_timestamp)
                
                if current_date in snapshot_by_date:
                    # Use actual snapshot data
                    snapshot = snapshot_by_date[current_date]
                    value = float(snapshot.get('total_value', last_known_value))
                    
                    # Skip zero values (weekends/holidays with no price data) - use last known value
                    if value == 0.0 and last_known_value > 0:
                        value = last_known_value
                    elif value > 0:
                        last_known_value = value  # Update last known value only for non-zero
                    
                    # CRITICAL FIX: Snapshot already includes cash - don't add it again!
                    equity_values.append(value)
                    profit_loss.append(float(snapshot.get('total_gain_loss', 0)))
                    profit_loss_pct.append(float(snapshot.get('total_gain_loss_percent', 0)))
                else:
                    # Fill gaps with last known value (or zero before first data)
                    # CRITICAL FIX: last_known_value already includes cash from snapshot
                    equity_values.append(last_known_value)
                    profit_loss.append(0.0)
                    profit_loss_pct.append(0.0)
                
                current_date += timedelta(days=1)
            
            logger.info(f"📊 Generated daily timeline for {period}: {len(timestamps)} daily points from {start_date} to {end_date}")
            
            # CRITICAL FIX: If latest snapshot is not from TODAY, append current live value
            # This ensures the chart endpoint always matches the live portfolio value at the top
            from datetime import datetime
            from utils.trading_calendar import get_trading_calendar
            
            today = datetime.now().date()
            trading_calendar = get_trading_calendar()
            latest_snapshot_date = datetime.fromisoformat(snapshots[-1]['value_date']).date() if snapshots else None
            
            if latest_snapshot_date and latest_snapshot_date < today:
                logger.info(f"📍 Latest snapshot is from {latest_snapshot_date}, appending TODAY's live value")
                
                # Get current portfolio value (including cash)
                current_portfolio = await self.get_portfolio_value(user_id, include_cash=True)
                current_value = current_portfolio.get('raw_value', 0)
                
                if current_value > 0:
                    # Add today's data point
                    today_timestamp = int(datetime.combine(today, datetime.min.time()).timestamp())
                    timestamps.append(today_timestamp)
                    equity_values.append(current_value)
                    
                    # PRODUCTION-GRADE: Calculate today's P/L ONLY if market is open
                    # On weekends/holidays, return should be $0.00 (market closed, no trading)
                    if trading_calendar.is_market_open_today(today):
                        # Market is OPEN - calculate real P/L vs yesterday
                        yesterday_value = equity_values[-2] if len(equity_values) > 1 else current_value
                        today_pl = current_value - yesterday_value
                        today_pl_pct = (today_pl / yesterday_value * 100) if yesterday_value > 0 else 0
                        
                        logger.info(f"✅ Market OPEN: Today's P/L: ${today_pl:+,.2f} ({today_pl_pct:+.2f}%)")
                    else:
                        # Market is CLOSED (weekend/holiday) - return is $0.00
                        today_pl = 0.0
                        today_pl_pct = 0.0
                        
                        logger.info(f"📅 Market CLOSED: Today's return is $0.00 (weekend/holiday)")
                    
                    profit_loss.append(today_pl)
                    profit_loss_pct.append(today_pl_pct)
                    
                    logger.info(f"✅ Appended today's value: ${current_value:,.2f} (vs last trading day, return: ${today_pl:+,.2f})")
            
            # Calculate base value (oldest value in period)
            base_value = equity_values[0] if equity_values else 0.0
            
            logger.info(f"Portfolio history constructed for user {user_id}: {len(equity_values)} data points over {period}")
            
            return {
                "timestamp": timestamps,
                "equity": equity_values,
                "profit_loss": profit_loss,
                "profit_loss_pct": profit_loss_pct,
                "base_value": base_value,
                "timeframe": "1D",  # Daily snapshots
                "base_value_asof": snapshots[0]['created_at'] if snapshots else None,
                "data_source": "plaid_snapshots_with_live"
            }
            
        except Exception as e:
            logger.error(f"Error getting aggregated portfolio history for user {user_id}: {e}")
            return self._empty_history_response(period)
    
    def _empty_history_response(self, period: str = '1M') -> Dict[str, Any]:
        """Return empty portfolio history response."""
        return {
            "timestamp": [],
            "equity": [],
            "profit_loss": [],
            "profit_loss_pct": [],
            "base_value": 0.0,
            "timeframe": "1D",
            "base_value_asof": None
        }
    
    async def _build_intraday_chart(self, user_id: str, filter_account: Optional[str] = None) -> Dict[str, Any]:
        """
        Build intraday (1D) chart using REAL snapshots taken every 5 minutes.
        
        Falls back to interpolation only if no snapshots exist (e.g., first day of use).
        This provides ACTUAL portfolio movements, not estimates.
        """
        try:
            from datetime import datetime, time, timedelta
            import pytz
            from services.intraday_snapshot_service import get_intraday_snapshot_service
            
            supabase = self._get_supabase_client()
            snapshot_service = get_intraday_snapshot_service()
            
            # Try to get real intraday snapshots first (PREFERRED)
            today = datetime.now().date()
            intraday_snapshots = await snapshot_service.get_intraday_snapshots(user_id, today)
            
            # If we have real snapshots, use them!
            if intraday_snapshots and len(intraday_snapshots) >= 2:
                logger.info(f"📊 Using {len(intraday_snapshots)} REAL intraday snapshots for 1D chart")
                
                timestamps = []
                equity_values = []
                profit_loss = []
                profit_loss_pct = []
                
                # Get yesterday's close for baseline
                yesterday = today - timedelta(days=1)
                yesterday_result = supabase.table('user_portfolio_history')\
                    .select('total_value, closing_value')\
                    .eq('user_id', user_id)\
                    .lte('value_date', yesterday.isoformat())\
                    .in_('snapshot_type', ['daily_eod', 'reconstructed'])\
                    .order('value_date', desc=True)\
                    .limit(1)\
                    .execute()
                
                yesterday_value = 0.0
                if yesterday_result.data:
                    yesterday_value = float(yesterday_result.data[0].get('closing_value') or yesterday_result.data[0]['total_value'])
                
                # Add yesterday's close as first point (for baseline comparison)
                est = pytz.timezone('US/Eastern')
                yesterday_close_time = datetime.combine(yesterday, time(16, 0)).replace(tzinfo=est)
                timestamps.append(int(yesterday_close_time.timestamp()))
                equity_values.append(yesterday_value)
                profit_loss.append(0.0)
                profit_loss_pct.append(0.0)
                
                # Add all intraday snapshots
                for snapshot in intraday_snapshots:
                    created_at = datetime.fromisoformat(snapshot['created_at'].replace('Z', '+00:00'))
                    value = float(snapshot['total_value'])
                    gain_loss = float(snapshot.get('total_gain_loss', 0))
                    gain_loss_pct = float(snapshot.get('total_gain_loss_percent', 0))
                    
                    timestamps.append(int(created_at.timestamp()))
                    equity_values.append(value)
                    profit_loss.append(gain_loss)
                    profit_loss_pct.append(gain_loss_pct)
                
                logger.info(f"✅ Built 1D chart with {len(timestamps)} REAL data points (not interpolated)")
                
                return {
                    "timestamp": timestamps,
                    "equity": equity_values,
                    "profit_loss": profit_loss,
                    "profit_loss_pct": profit_loss_pct,
                    "base_value": yesterday_value,
                    "timeframe": "1D",
                    "base_value_asof": str(timestamps[0]) if timestamps else None,
                    "data_source": "intraday_real"  # REAL data, not interpolated
                }
            
            # FALLBACK: If no snapshots exist, use interpolation (first day of use)
            logger.warning(f"⚠️  No intraday snapshots found for user {user_id} - falling back to interpolation")
            logger.warning(f"   Snapshots will be created automatically every 5 minutes during market hours")
            
            # Get yesterday's closing value as baseline
            yesterday = datetime.now().date() - timedelta(days=1)
            yesterday_result = supabase.table('user_portfolio_history')\
                .select('total_value, closing_value, account_breakdown')\
                .eq('user_id', user_id)\
                .lte('value_date', yesterday.isoformat())\
                .in_('snapshot_type', ['daily_eod', 'reconstructed'])\
                .order('value_date', desc=True)\
                .limit(1)\
                .execute()
            
            # Get yesterday's value (including cash)
            yesterday_value = 0.0
            if yesterday_result.data:
                yesterday_securities = float(yesterday_result.data[0].get('closing_value') or yesterday_result.data[0]['total_value'])
                
                # Add cash to yesterday's value
                cash_result = supabase.table('user_aggregated_holdings')\
                    .select('total_market_value')\
                    .eq('user_id', user_id)\
                    .eq('security_type', 'cash')\
                    .execute()
                
                yesterday_cash = sum(float(h.get('total_market_value', 0)) for h in cash_result.data) if cash_result.data else 0
                yesterday_value = yesterday_securities + yesterday_cash
            
            # Get current portfolio value (including cash)
            current_portfolio = await self.get_portfolio_value(user_id, include_cash=True)
            current_value = current_portfolio.get('raw_value', 0)
            
            if current_value == 0 and yesterday_value == 0:
                return self._empty_history_response('1D')
            
            # If no yesterday value, use current value as baseline
            if yesterday_value == 0:
                yesterday_value = current_value
            
            # Create intraday data points (simulated hourly progression)
            # In production, this would come from stored intraday snapshots
            est = pytz.timezone('US/Eastern')
            now = datetime.now(est)
            today_date = now.date()
            
            # Market open: 9:30 AM EST
            market_open = datetime.combine(today_date, time(9, 30)).replace(tzinfo=est)
            market_open_ts = int(market_open.timestamp())
            
            # Current time
            now_ts = int(now.timestamp())
            
            # Build progression from yesterday close → market open → now
            timestamps = []
            equity_values = []
            profit_loss = []
            profit_loss_pct = []
            
            # Calculate value change from yesterday to current
            total_change = current_value - yesterday_value
            total_change_pct = (total_change / yesterday_value * 100) if yesterday_value > 0 else 0
            
            # Point 1: Yesterday's close (for baseline comparison)
            yesterday_close_time = datetime.combine(yesterday, time(16, 0)).replace(tzinfo=est)
            timestamps.append(int(yesterday_close_time.timestamp()))
            equity_values.append(yesterday_value)
            profit_loss.append(0.0)
            profit_loss_pct.append(0.0)
            
            # Point 2: Today's market open (assume same as yesterday close initially)
            if now >= market_open:
                timestamps.append(market_open_ts)
                equity_values.append(yesterday_value)  # Opening value = yesterday's close
                profit_loss.append(0.0)
                profit_loss_pct.append(0.0)
            
            # Point 3-N: Hourly intervals if market is open
            if now >= market_open:
                hours_since_open = (now - market_open).total_seconds() / 3600
                
                # Create hourly data points (up to current time)
                for hour in range(1, int(hours_since_open) + 1):
                    hour_time = market_open + timedelta(hours=hour)
                    if hour_time <= now:
                        # Linear interpolation from open to current value
                        progress = hour / max(hours_since_open, 1)
                        interpolated_value = yesterday_value + (total_change * progress)
                        interpolated_pl = total_change * progress
                        interpolated_pl_pct = (interpolated_pl / yesterday_value * 100) if yesterday_value > 0 else 0
                        
                        timestamps.append(int(hour_time.timestamp()))
                        equity_values.append(interpolated_value)
                        profit_loss.append(interpolated_pl)
                        profit_loss_pct.append(interpolated_pl_pct)
            
            # Final point: Current value
            timestamps.append(now_ts)
            equity_values.append(current_value)
            profit_loss.append(total_change)
            profit_loss_pct.append(total_change_pct)
            
            logger.info(f"📊 Built intraday chart: {len(timestamps)} points from ${yesterday_value:.2f} → ${current_value:.2f} ({total_change_pct:+.2f}%)")
            
            return {
                "timestamp": timestamps,
                "equity": equity_values,
                "profit_loss": profit_loss,
                "profit_loss_pct": profit_loss_pct,
                "base_value": yesterday_value,
                "timeframe": "1D",
                "base_value_asof": str(timestamps[0]) if timestamps else None,
                "data_source": "intraday_interpolated"
            }
            
        except Exception as e:
            logger.error(f"Error building intraday chart for user {user_id}: {e}")
            return self._empty_history_response('1D')
    
    async def _build_intraday_chart_account(self, user_id: str, filter_account: str, plaid_account_id: str) -> Dict[str, Any]:
        """
        Build intraday chart for a specific account with hourly progression.
        Similar to _build_intraday_chart but filtered to one account.
        """
        try:
            import pytz
            from datetime import datetime, time, timedelta
            supabase = self._get_supabase_client()
            
            # Get yesterday's close for THIS account
            yesterday = datetime.now().date() - timedelta(days=1)
            yesterday_result = supabase.table('user_portfolio_history')\
                .select('total_value, closing_value, account_breakdown')\
                .eq('user_id', user_id)\
                .lte('value_date', yesterday.isoformat())\
                .in_('snapshot_type', ['daily_eod', 'reconstructed'])\
                .order('value_date', desc=True)\
                .limit(1)\
                .execute()
            
            yesterday_value = 0.0
            if yesterday_result.data and len(yesterday_result.data) > 0:
                # Parse account breakdown to get this account's value
                account_breakdown_raw = yesterday_result.data[0].get('account_breakdown', {})
                if isinstance(account_breakdown_raw, str):
                    import json
                    account_breakdown = json.loads(account_breakdown_raw) if account_breakdown_raw else {}
                else:
                    account_breakdown = account_breakdown_raw
                
                yesterday_securities = account_breakdown.get(plaid_account_id, 0)
                
                # Add account-specific cash
                cash_result = supabase.table('user_aggregated_holdings')\
                    .select('account_contributions, total_market_value')\
                    .eq('user_id', user_id)\
                    .eq('security_type', 'cash')\
                    .execute()
                
                account_cash = 0.0
                if cash_result.data:
                    import json
                    for cash_holding in cash_result.data:
                        contribs = cash_holding.get('account_contributions', [])
                        if isinstance(contribs, str):
                            contribs = json.loads(contribs)
                        for contrib in contribs:
                            if contrib.get('account_id') == plaid_account_id:
                                account_cash += float(contrib.get('market_value', 0))
                
                yesterday_value = float(yesterday_securities) + account_cash
            
            # Get current value for THIS account
            from utils.portfolio.account_filtering_service import get_account_filtering_service
            filter_service = get_account_filtering_service()
            filtered_holdings = await filter_service.filter_holdings_by_account(user_id, filter_account)
            current_value = sum(float(h.get('total_market_value', 0)) for h in filtered_holdings)
            
            if current_value == 0 and yesterday_value == 0:
                return self._empty_history_response('1D')
            
            # If no yesterday value, use current as baseline
            if yesterday_value == 0:
                yesterday_value = current_value
            
            # Build hourly progression
            est = pytz.timezone('US/Eastern')
            now = datetime.now(est)
            today_date = now.date()
            
            market_open = datetime.combine(today_date, time(9, 30)).replace(tzinfo=est)
            market_open_ts = int(market_open.timestamp())
            now_ts = int(now.timestamp())
            
            timestamps = []
            equity_values = []
            profit_loss = []
            profit_loss_pct = []
            
            total_change = current_value - yesterday_value
            total_change_pct = (total_change / yesterday_value * 100) if yesterday_value > 0 else 0
            
            # Point 1: Yesterday's close
            yesterday_close_time = datetime.combine(yesterday, time(16, 0)).replace(tzinfo=est)
            timestamps.append(int(yesterday_close_time.timestamp()))
            equity_values.append(yesterday_value)
            profit_loss.append(0.0)
            profit_loss_pct.append(0.0)
            
            # Point 2: Today's market open
            if now >= market_open:
                timestamps.append(market_open_ts)
                equity_values.append(yesterday_value)
                profit_loss.append(0.0)
                profit_loss_pct.append(0.0)
            
            # Point 3-N: Hourly intervals
            if now >= market_open:
                hours_since_open = (now - market_open).total_seconds() / 3600
                for hour in range(1, int(hours_since_open) + 1):
                    hour_time = market_open + timedelta(hours=hour)
                    if hour_time <= now:
                        progress = hour / max(hours_since_open, 1)
                        interpolated_value = yesterday_value + (total_change * progress)
                        interpolated_pl = total_change * progress
                        interpolated_pl_pct = (interpolated_pl / yesterday_value * 100) if yesterday_value > 0 else 0
                        
                        timestamps.append(int(hour_time.timestamp()))
                        equity_values.append(interpolated_value)
                        profit_loss.append(interpolated_pl)
                        profit_loss_pct.append(interpolated_pl_pct)
            
            # Final point: Current value
            timestamps.append(now_ts)
            equity_values.append(current_value)
            profit_loss.append(total_change)
            profit_loss_pct.append(total_change_pct)
            
            logger.info(f"📊 Built account intraday chart: {len(timestamps)} points from ${yesterday_value:,.2f} → ${current_value:,.2f} ({total_change_pct:+.2f}%)")
            
            return {
                "timestamp": timestamps,
                "equity": equity_values,
                "profit_loss": profit_loss,
                "profit_loss_pct": profit_loss_pct,
                "base_value": yesterday_value,
                "timeframe": "1D",
                "base_value_asof": str(timestamps[0]) if timestamps else None,
                "data_source": "account_intraday_interpolated"
            }
            
        except Exception as e:
            logger.error(f"Error building account intraday chart: {e}")
            return self._empty_history_response('1D')
    
    async def _get_account_specific_history(self, user_id: str, period: str, filter_account: str) -> Dict[str, Any]:
        """
        Get portfolio history filtered to a specific account using ACTUAL per-account data.
        
        We extract the specific account's value from the account_breakdown JSONB field
        that's stored in every daily snapshot. This provides exact historical values,
        not approximations.
        """
        try:
            import json  # Import at function level for JSON parsing
            supabase = self._get_supabase_client()
            
            # First, get the Plaid account ID for this UUID
            account_result = supabase.table('user_investment_accounts')\
                .select('provider_account_id')\
                .eq('id', filter_account)\
                .eq('user_id', user_id)\
                .single()\
                .execute()
            
            if not account_result.data:
                logger.warning(f"Account {filter_account} not found for user {user_id}")
                return self._empty_history_response(period)
                
            plaid_account_id = f"plaid_{account_result.data['provider_account_id']}"
            logger.info(f"Filtering history to account {plaid_account_id} (UUID: {filter_account})")
            
            # CRITICAL FIX: Handle 1D period specially with intraday chart
            if period == '1D':
                logger.info(f"Building intraday chart for account {plaid_account_id}")
                return await self._build_intraday_chart_account(user_id, filter_account, plaid_account_id)
            
            # Calculate date range based on period
            from datetime import datetime, timedelta
            end_date = datetime.now().date()
            
            period_mapping = {
                '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'MAX': 730
            }
            days_back = period_mapping.get(period, 30)
            start_date = end_date - timedelta(days=days_back)
            
            # Fetch snapshots with account_breakdown
            snapshots_result = supabase.table('user_portfolio_history')\
                .select('value_date, total_value, account_breakdown, total_cost_basis')\
                .eq('user_id', user_id)\
                .gte('value_date', start_date.isoformat())\
                .lte('value_date', end_date.isoformat())\
                .order('value_date', desc=False)\
                .execute()
            
            snapshots = snapshots_result.data if snapshots_result.data else []
            
            if not snapshots:
                # Fallback to current value if no historical data
                logger.warning(f"No historical snapshots found for user {user_id}, using current value")
                return await self._get_current_account_value_fallback(user_id, filter_account, period)
            
            # CRITICAL: Get cash balance for THIS specific account
            # Cash should be included in account-specific views
            account_cash_balance = 0.0
            try:
                cash_holdings_result = supabase.table('user_aggregated_holdings')\
                    .select('account_contributions, total_market_value')\
                    .eq('user_id', user_id)\
                    .eq('security_type', 'cash')\
                    .execute()
                
                if cash_holdings_result.data:
                    for cash_holding in cash_holdings_result.data:
                        account_contribs = cash_holding.get('account_contributions', [])
                        if isinstance(account_contribs, str):
                            account_contribs = json.loads(account_contribs)
                        
                        # Find contribution from this specific account
                        for contrib in account_contribs:
                            if contrib.get('account_id') == plaid_account_id:
                                account_cash_balance += float(contrib.get('market_value', 0))
                    
                    if account_cash_balance > 0:
                        logger.info(f"💵 Adding ${account_cash_balance:,.2f} cash to account {plaid_account_id} history")
            except Exception as e:
                logger.warning(f"Could not fetch cash balance for account {plaid_account_id}: {e}")
            
            # Extract account-specific values from each snapshot
            timestamps = []
            equity_values = []
            
            for snap in snapshots:
                account_breakdown_raw = snap.get('account_breakdown', {})
                
                # Parse JSON string if needed (Supabase returns JSONB as string sometimes)
                if isinstance(account_breakdown_raw, str):
                    try:
                        account_breakdown = json.loads(account_breakdown_raw)
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse account_breakdown JSON for date {snap.get('value_date')}")
                        continue
                else:
                    account_breakdown = account_breakdown_raw
                
                # Extract this account's value from the breakdown
                account_value = account_breakdown.get(plaid_account_id, 0)
                
                # CRITICAL FIX: Only include days where account actually had holdings (securities > 0)
                # This prevents oscillations from $0 days + current cash creating flat lines
                if account_value > 0:
                    value_date = datetime.fromisoformat(snap['value_date'])
                    timestamps.append(int(value_date.timestamp()))
                    # Add cash balance to securities value for total account value
                    equity_values.append(float(account_value) + account_cash_balance)
            
            # CRITICAL FIX: Append today's LIVE account value (like we do for total portfolio)
            # This ensures account chart matches the live value shown at the top
            # Do this BEFORE checking if timestamps is empty to handle cash-only accounts
            today = datetime.now().date()
            latest_snapshot_date = datetime.fromisoformat(snapshots[-1]['value_date']).date() if snapshots else None
            
            # Append today's value if either:
            # 1. No timestamps yet (account had $0 securities historically but might have value now)
            # 2. Latest snapshot is not from today
            should_append_today = not timestamps or (latest_snapshot_date and latest_snapshot_date < today)
            
            if should_append_today:
                logger.info(f"📍 Latest account snapshot is from {latest_snapshot_date or 'never'}, appending TODAY's live account value")
                
                # Get current live value for THIS account
                from utils.portfolio.account_filtering_service import get_account_filtering_service
                filter_service = get_account_filtering_service()
                filtered_holdings = await filter_service.filter_holdings_by_account(user_id, filter_account)
                current_account_value = sum(float(h.get('total_market_value', 0)) for h in filtered_holdings)
                
                if current_account_value > 0:
                    today_timestamp = int(datetime.combine(today, datetime.min.time()).timestamp())
                    timestamps.append(today_timestamp)
                    equity_values.append(current_account_value)
                    logger.info(f"✅ Appended today's account value: ${current_account_value:,.2f}")
            
            # Now check if we have any data points at all
            if not timestamps:
                logger.warning(f"Account {plaid_account_id} has no historical values in snapshots and no current value")
                return self._empty_history_response(period)
            
            # Calculate profit/loss (for now, simplified - could enhance later)
            first_value = equity_values[0]
            profit_loss = [float(val - first_value) for val in equity_values]
            profit_loss_pct = [
                float((val - first_value) / first_value * 100) if first_value > 0 else 0.0
                for val in equity_values
            ]
            
            account_history = {
                "timestamp": timestamps,
                "equity": equity_values,
                "profit_loss": profit_loss,
                "profit_loss_pct": profit_loss_pct,
                "base_value": first_value,
                "timeframe": period,
                "base_value_asof": str(timestamps[0]) if timestamps else None,  # Convert to string for API response model
                "data_source": "account_breakdown_actual"
            }
            
            logger.info(f"✅ Portfolio history for account {plaid_account_id}: {len(timestamps)} actual data points from {start_date} to {end_date}")
            return account_history
            
        except Exception as e:
            logger.error(f"Error getting account-specific history for {filter_account}: {e}")
            return self._empty_history_response(period)
    
    async def _get_current_account_value_fallback(self, user_id: str, filter_account: str, period: str) -> Dict[str, Any]:
        """
        Fallback when no historical data exists - construct a flat line from current value.
        """
        try:
            from utils.portfolio.account_filtering_service import get_account_filtering_service
            filter_service = get_account_filtering_service()
            
            # Get current account value
            filtered_holdings = await filter_service.filter_holdings_by_account(user_id, filter_account)
            current_value = sum(float(h.get('total_market_value', 0)) for h in filtered_holdings)
            
            if current_value == 0:
                return self._empty_history_response(period)
            
            # Create flat line with current value
            from datetime import datetime, timedelta
            now = datetime.now()
            timestamps = [int(now.timestamp())]
            equity_values = [current_value]
            
            return {
                "timestamp": timestamps,
                "equity": equity_values,
                "profit_loss": [0.0],
                "profit_loss_pct": [0.0],
                "base_value": current_value,
                "timeframe": period,
                "base_value_asof": str(timestamps[0]) if timestamps else None,  # Convert to string for API response model
                "data_source": "current_value_fallback"
            }
        except Exception as e:
            logger.error(f"Error in current account value fallback: {e}")
            return self._empty_history_response(period)
    
    async def _get_current_account_percentage(self, user_id: str, account_uuid: str) -> float:
        """
        Calculate what percentage of the total portfolio belongs to a specific account.
        (LEGACY - kept for backward compatibility, but no longer used for history)
        """
        try:
            supabase = self._get_supabase_client()
            
            # First, get the Plaid account ID for this UUID
            result = supabase.table('user_investment_accounts')\
                .select('provider_account_id')\
                .eq('id', account_uuid)\
                .eq('user_id', user_id)\
                .single()\
                .execute()
            
            if not result.data:
                logger.warning(f"Account {account_uuid} not found for user {user_id}")
                return 0.0
                
            plaid_account_id = f"plaid_{result.data['provider_account_id']}"
            logger.debug(f"Mapping account UUID {account_uuid} to Plaid ID {plaid_account_id}")
            
            # Get all holdings and calculate account-specific total
            result = supabase.table('user_aggregated_holdings')\
                .select('symbol, total_market_value, account_contributions')\
                .eq('user_id', user_id)\
                .execute()
            
            total_portfolio_value = 0.0
            account_specific_value = 0.0
            
            if result.data:
                for holding in result.data:
                    total_value = float(holding['total_market_value'])
                    total_portfolio_value += total_value
                    
                    # Check account contributions for this account
                    contributions = holding['account_contributions']
                    if isinstance(contributions, str):
                        contributions = json.loads(contributions) if contributions else []
                    
                    for contrib in contributions:
                        if contrib.get('account_id') == plaid_account_id:
                            account_specific_value += float(contrib.get('market_value', 0))
            
            if total_portfolio_value > 0:
                percentage = account_specific_value / total_portfolio_value
                logger.info(f"Account {account_uuid} represents {percentage:.1%} of total portfolio (${account_specific_value:.2f} / ${total_portfolio_value:.2f})")
                return percentage
            else:
                return 0.0
                
        except Exception as e:
            logger.error(f"Error calculating account percentage for {account_uuid}: {e}")
            return 0.0
    
    def _get_cached_response(self, cache_key: str) -> Dict[str, Any] | None:
        """
        Get cached response from Redis if available and not expired.
        
        Args:
            cache_key: Redis cache key
            
        Returns:
            Cached response dict or None if not found/expired
        """
        try:
            import json
            redis_client = self._get_redis_client()
            cached_json = redis_client.get(cache_key)
            
            if cached_json:
                return json.loads(cached_json)
            return None
        except Exception as e:
            logger.warning(f"Error reading from cache: {e}")
            return None
    
    def _cache_response(self, cache_key: str, response: Dict[str, Any], ttl_seconds: int = 30) -> None:
        """
        Cache response in Redis with expiration.
        
        Args:
            cache_key: Redis cache key
            response: Response dictionary to cache
            ttl_seconds: Time-to-live in seconds (default: 30)
        """
        try:
            import json
            redis_client = self._get_redis_client()
            response_json = json.dumps(response, default=str)  # default=str handles Decimals
            redis_client.setex(cache_key, ttl_seconds, response_json)
        except Exception as e:
            logger.warning(f"Error writing to cache: {e}")
    
    def _empty_allocation_response(self, error: Optional[str] = None) -> Dict[str, Any]:
        """Return empty allocation response."""
        response = {
            'cash': {'value': 0.0, 'percentage': 100.0},
            'stock': {'value': 0.0, 'percentage': 0.0},
            'bond': {'value': 0.0, 'percentage': 0.0},
            'total_value': 0.0,
            'pie_data': []
        }
        if error:
            response["error"] = error
        return response

# Global service instance following dependency injection pattern
aggregated_portfolio_service = AggregatedPortfolioService()

def get_aggregated_portfolio_service() -> AggregatedPortfolioService:
    """
    Get the global aggregated portfolio service instance.
    
    Returns:
        AggregatedPortfolioService instance
    """
    return aggregated_portfolio_service
