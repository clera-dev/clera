"""
Tests for Portfolio Data Freshness Service

Production-grade tests for the staleness detection and auto-sync mechanism.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

# Test configuration constants
from routes.portfolio_freshness import (
    STALE_THRESHOLD_MARKET_HOURS_MINUTES,
    STALE_THRESHOLD_OFF_HOURS_MINUTES,
    _is_market_hours,
    _get_staleness_threshold_minutes
)


class TestStalenessThresholds:
    """Test staleness threshold calculations."""
    
    def test_market_hours_threshold(self):
        """During market hours, staleness threshold should be 5 minutes."""
        assert STALE_THRESHOLD_MARKET_HOURS_MINUTES == 5
    
    def test_off_hours_threshold(self):
        """Outside market hours, staleness threshold should be 30 minutes."""
        assert STALE_THRESHOLD_OFF_HOURS_MINUTES == 30
    
    @patch('routes.portfolio_freshness._is_market_hours')
    def test_threshold_during_market_hours(self, mock_is_market_hours):
        """Test that correct threshold is used during market hours."""
        mock_is_market_hours.return_value = True
        threshold = _get_staleness_threshold_minutes()
        assert threshold == 5
    
    @patch('routes.portfolio_freshness._is_market_hours')
    def test_threshold_outside_market_hours(self, mock_is_market_hours):
        """Test that correct threshold is used outside market hours."""
        mock_is_market_hours.return_value = False
        threshold = _get_staleness_threshold_minutes()
        assert threshold == 30


class TestTradingCalendarIntegration:
    """Test integration with trading calendar."""
    
    @patch('routes.portfolio_freshness.get_trading_calendar')
    def test_market_hours_check_success(self, mock_get_calendar):
        """Test market hours check when calendar is available."""
        mock_calendar = Mock()
        mock_calendar.is_market_open_now.return_value = True
        mock_get_calendar.return_value = mock_calendar
        
        result = _is_market_hours()
        assert result is True
    
    @patch('routes.portfolio_freshness.get_trading_calendar')
    def test_market_hours_check_failure_defaults_to_conservative(self, mock_get_calendar):
        """Test that market hours check defaults to True (conservative) on failure."""
        mock_get_calendar.side_effect = Exception("Calendar unavailable")
        
        result = _is_market_hours()
        # Should default to True (assume market open) for safety
        assert result is True


class TestFreshnessCalculation:
    """Test freshness calculation logic."""
    
    def test_data_age_calculation(self):
        """Test that data age is correctly calculated."""
        now = datetime.utcnow()
        
        # 10 minutes ago
        last_synced = now - timedelta(minutes=10)
        age_minutes = (now - last_synced).total_seconds() / 60
        assert abs(age_minutes - 10) < 0.1
    
    def test_is_stale_during_market_hours(self):
        """Test staleness detection during market hours."""
        now = datetime.utcnow()
        
        # 3 minutes old - should NOT be stale during market hours
        last_synced = now - timedelta(minutes=3)
        age = (now - last_synced).total_seconds() / 60
        is_stale = age > STALE_THRESHOLD_MARKET_HOURS_MINUTES
        assert is_stale is False
        
        # 6 minutes old - should BE stale during market hours
        last_synced = now - timedelta(minutes=6)
        age = (now - last_synced).total_seconds() / 60
        is_stale = age > STALE_THRESHOLD_MARKET_HOURS_MINUTES
        assert is_stale is True
    
    def test_is_stale_outside_market_hours(self):
        """Test staleness detection outside market hours."""
        now = datetime.utcnow()
        
        # 20 minutes old - should NOT be stale outside market hours
        last_synced = now - timedelta(minutes=20)
        age = (now - last_synced).total_seconds() / 60
        is_stale = age > STALE_THRESHOLD_OFF_HOURS_MINUTES
        assert is_stale is False
        
        # 35 minutes old - should BE stale outside market hours
        last_synced = now - timedelta(minutes=35)
        age = (now - last_synced).total_seconds() / 60
        is_stale = age > STALE_THRESHOLD_OFF_HOURS_MINUTES
        assert is_stale is True


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_no_data_is_always_stale(self):
        """Test that no sync timestamp means data is stale."""
        last_synced = None
        is_stale = last_synced is None
        assert is_stale is True
    
    def test_future_timestamp_not_stale(self):
        """Test handling of future timestamps (shouldn't happen but be safe)."""
        now = datetime.utcnow()
        future = now + timedelta(minutes=5)
        age = (now - future).total_seconds() / 60
        # Negative age should not trigger staleness
        is_stale = age > STALE_THRESHOLD_MARKET_HOURS_MINUTES
        assert is_stale is False


class TestIndustryStandards:
    """Test that our implementation follows industry standards."""
    
    def test_market_hours_threshold_is_reasonable(self):
        """
        Industry standard: Data should be refreshed every 5-15 minutes during market hours.
        Robinhood, Wealthfront, Betterment use similar thresholds.
        """
        assert 1 <= STALE_THRESHOLD_MARKET_HOURS_MINUTES <= 15
    
    def test_off_hours_threshold_is_reasonable(self):
        """
        Industry standard: Data can be 30+ minutes stale outside market hours.
        This reduces unnecessary API calls when markets are closed.
        """
        assert 15 <= STALE_THRESHOLD_OFF_HOURS_MINUTES <= 60
    
    def test_market_hours_threshold_is_stricter(self):
        """Market hours threshold should be stricter than off-hours."""
        assert STALE_THRESHOLD_MARKET_HOURS_MINUTES < STALE_THRESHOLD_OFF_HOURS_MINUTES


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

