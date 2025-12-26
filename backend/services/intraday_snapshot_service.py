"""
Intraday Portfolio Snapshot Service

PRODUCTION-GRADE: Stores portfolio value snapshots every 5 minutes during market hours
for accurate 1D charts showing real portfolio fluctuations, not interpolation.

Purpose: Replace brokerages with professional-grade live tracking.
"""

import logging
import json
from datetime import datetime, date, time, timedelta
from typing import Dict, Any, Optional
import pytz

logger = logging.getLogger(__name__)


class IntradaySnapshotService:
    """
    Stores portfolio values throughout the day for accurate intraday charting.
    
    Features:
    - Snapshots every 5 minutes during market hours (9:30 AM - 4:00 PM EST)
    - Stores in user_portfolio_history with snapshot_type='intraday'
    - Provides REAL data instead of interpolation
    - Professional-grade tracking for brokerage replacement platform
    """
    
    def __init__(self):
        """Initialize the intraday snapshot service."""
        self.supabase = None  # Lazy loaded
        self.last_snapshot_time = {}  # Track last snapshot per user
        self.snapshot_interval = 300  # 5 minutes in seconds
        self.est = pytz.timezone('US/Eastern')
    
    def _get_supabase_client(self):
        """Lazy load Supabase client."""
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    def is_market_hours(self) -> bool:
        """
        Check if current time is during market hours (9:30 AM - 4:00 PM EST).
        
        PRODUCTION-GRADE: Uses trading_calendar to properly detect both weekends AND holidays.
        
        Returns:
            True if market is open and within trading hours, False otherwise
        """
        from utils.trading_calendar import get_trading_calendar
        
        now = datetime.now(self.est)
        current_time = now.time()
        current_date = now.date()
        
        # CRITICAL FIX: Use trading calendar to check for BOTH weekends AND holidays
        # This ensures we don't take snapshots on Christmas, Thanksgiving, etc.
        trading_calendar = get_trading_calendar()
        if not trading_calendar.is_market_open_today(current_date):
            logger.debug(f"📅 Market closed on {current_date} (weekend or holiday)")
            return False
        
        # Market hours: 9:30 AM to 4:00 PM EST
        market_open = time(9, 30)
        market_close = time(16, 0)
        
        return market_open <= current_time <= market_close
    
    def should_create_snapshot(self, user_id: str) -> bool:
        """
        Determine if enough time has passed to create a new snapshot.
        
        Args:
            user_id: User to check
            
        Returns:
            True if snapshot should be created, False otherwise
        """
        # Always create snapshot if market is closed (for EOD snapshot)
        if not self.is_market_hours():
            return False
        
        # Check if enough time has passed since last snapshot
        last_time = self.last_snapshot_time.get(user_id)
        if last_time is None:
            return True
        
        # FIX: Use timezone-aware datetime.now() to match last_time
        from datetime import timezone
        now = datetime.now(timezone.utc)
        if last_time.tzinfo is None:
            # If last_time is naive, assume it's UTC
            last_time = last_time.replace(tzinfo=timezone.utc)
        
        elapsed = (now - last_time).total_seconds()
        return elapsed >= self.snapshot_interval
    
    async def create_snapshot(self, user_id: str, portfolio_value: float, 
                             opening_value: Optional[float] = None,
                             metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Create an intraday portfolio snapshot.
        
        Args:
            user_id: User ID
            portfolio_value: Current portfolio value
            opening_value: Today's opening value (optional)
            metadata: Additional metadata (optional)
            
        Returns:
            True if snapshot created successfully, False otherwise
        """
        try:
            if not self.should_create_snapshot(user_id):
                return False
            
            supabase = self._get_supabase_client()
            now = datetime.now(self.est)
            today = now.date()
            
            # Get today's opening value if not provided
            if opening_value is None:
                opening_value = await self._get_opening_value(user_id, today)
            
            # Calculate intraday metrics
            intraday_change = portfolio_value - opening_value if opening_value else 0
            intraday_change_pct = (intraday_change / opening_value * 100) if opening_value and opening_value > 0 else 0
            
            # Create snapshot record
            snapshot = {
                'user_id': user_id,
                'value_date': today.isoformat(),
                'snapshot_type': 'intraday',
                'total_value': portfolio_value,
                'total_cost_basis': portfolio_value,  # We don't track cost basis intraday
                'total_gain_loss': intraday_change,
                'total_gain_loss_percent': intraday_change_pct,
                'opening_value': opening_value,
                'data_source': 'live_tracking',
                'price_source': 'fmp',
                'created_at': now.isoformat()
            }
            
            # Add metadata if provided
            if metadata:
                snapshot['account_breakdown'] = metadata.get('account_breakdown', {})
                snapshot['securities_count'] = metadata.get('securities_count', 0)
            
            # Insert snapshot (no upsert - we want multiple snapshots per day)
            supabase.table('user_portfolio_history')\
                .insert(snapshot)\
                .execute()
            
            # Update last snapshot time
            self.last_snapshot_time[user_id] = now
            
            logger.info(f"📸 Intraday snapshot created for user {user_id}: ${portfolio_value:,.2f} (change: ${intraday_change:+,.2f})")
            return True
            
        except Exception as e:
            logger.error(f"Error creating intraday snapshot for user {user_id}: {e}")
            return False
    
    async def _get_opening_value(self, user_id: str, today: date) -> float:
        """
        Get today's opening value (first intraday snapshot or yesterday's close).
        
        Args:
            user_id: User ID
            today: Today's date
            
        Returns:
            Opening value for today
        """
        try:
            supabase = self._get_supabase_client()
            
            # Try to get today's first intraday snapshot
            today_snapshots = supabase.table('user_portfolio_history')\
                .select('total_value')\
                .eq('user_id', user_id)\
                .eq('value_date', today.isoformat())\
                .eq('snapshot_type', 'intraday')\
                .order('created_at', desc=False)\
                .limit(1)\
                .execute()
            
            if today_snapshots.data:
                return float(today_snapshots.data[0]['total_value'])
            
            # Fall back to yesterday's close
            yesterday = today - timedelta(days=1)
            yesterday_snapshot = supabase.table('user_portfolio_history')\
                .select('total_value, closing_value')\
                .eq('user_id', user_id)\
                .lte('value_date', yesterday.isoformat())\
                .in_('snapshot_type', ['daily_eod', 'reconstructed'])\
                .order('value_date', desc=True)\
                .limit(1)\
                .execute()
            
            if yesterday_snapshot.data:
                return float(yesterday_snapshot.data[0].get('closing_value') or yesterday_snapshot.data[0]['total_value'])
            
            return 0.0
            
        except Exception as e:
            logger.error(f"Error getting opening value: {e}")
            return 0.0
    
    async def get_intraday_snapshots(self, user_id: str, target_date: Optional[date] = None) -> list:
        """
        Retrieve all intraday snapshots for a specific date.
        
        Args:
            user_id: User ID
            target_date: Date to get snapshots for (default: today)
            
        Returns:
            List of snapshot dictionaries
        """
        try:
            if target_date is None:
                target_date = datetime.now(self.est).date()
            
            supabase = self._get_supabase_client()
            
            result = supabase.table('user_portfolio_history')\
                .select('created_at, total_value, total_gain_loss, total_gain_loss_percent, opening_value')\
                .eq('user_id', user_id)\
                .eq('value_date', target_date.isoformat())\
                .eq('snapshot_type', 'intraday')\
                .order('created_at', desc=False)\
                .execute()
            
            return result.data or []
            
        except Exception as e:
            logger.error(f"Error retrieving intraday snapshots: {e}")
            return []
    
    async def cleanup_old_intraday_snapshots(self, days_to_keep: int = 7):
        """
        Delete intraday snapshots older than specified days to save storage.
        
        Args:
            days_to_keep: Number of days of intraday data to retain
        """
        try:
            supabase = self._get_supabase_client()
            cutoff_date = (datetime.now(self.est).date() - timedelta(days=days_to_keep)).isoformat()
            
            supabase.table('user_portfolio_history')\
                .delete()\
                .eq('snapshot_type', 'intraday')\
                .lt('value_date', cutoff_date)\
                .execute()
            
            logger.info(f"🧹 Cleaned up intraday snapshots older than {days_to_keep} days")
            
        except Exception as e:
            logger.error(f"Error cleaning up old intraday snapshots: {e}")


# Singleton instance
_intraday_snapshot_service = None


def get_intraday_snapshot_service() -> IntradaySnapshotService:
    """Get or create singleton instance of intraday snapshot service."""
    global _intraday_snapshot_service
    if _intraday_snapshot_service is None:
        _intraday_snapshot_service = IntradaySnapshotService()
    return _intraday_snapshot_service

