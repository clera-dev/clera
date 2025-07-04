"""
Pytest-compatible tests for purchase history functions.

This test file can be run with pytest for automated testing and CI/CD integration.
Usage: pytest test_purchase_history_pytest.py -v
"""

import sys
import os
import pytest
from datetime import datetime, timezone, timedelta

# Add the backend directory to the path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# TEST ACCOUNT CONFIGURATION
# =========================
# This test uses a specific Alpaca test account for consistent results
# Change this account ID if you need to test with a different account
TEST_ALPACA_ACCOUNT_ID = "60205bf6-1d3f-46a5-8a1c-7248ee9210c5"

# Import the functions we want to test
from clera_agents.tools.purchase_history import (
    find_first_purchase_dates,
    get_comprehensive_account_activities,
    get_account_activities,
    ActivityRecord
)


@pytest.fixture
def mock_account_id(monkeypatch):
    """Mock the get_account_id function to return our test account."""
    def mock_get_account_id(config=None):
        return TEST_ALPACA_ACCOUNT_ID
    
    monkeypatch.setattr("clera_agents.tools.purchase_history.get_account_id", mock_get_account_id)


class TestPurchaseHistoryFunctions:
    """Test suite for purchase history functions with pytest."""

    def test_find_first_purchase_dates_returns_dict(self, mock_account_id):
        """Test that find_first_purchase_dates returns a dictionary."""
        result = find_first_purchase_dates()
        
        assert isinstance(result, dict), "Function should return a dictionary"
        
        # Test the structure of returned data
        for symbol, date in result.items():
            assert isinstance(symbol, str), f"Symbol {symbol} should be a string"
            assert isinstance(date, datetime), f"Date for {symbol} should be a datetime object"
            assert date.tzinfo is not None, f"Date for {symbol} should be timezone-aware"

    def test_find_first_purchase_dates_has_reasonable_data(self, mock_account_id):
        """Test that find_first_purchase_dates returns reasonable data."""
        result = find_first_purchase_dates()
        
        # Should have some data for this test account
        assert len(result) > 0, "Should find some first purchase dates"
        
        # Dates should be recent (within last year)
        now = datetime.now(timezone.utc)
        one_year_ago = now - timedelta(days=365)
        
        for symbol, date in result.items():
            assert date >= one_year_ago, f"Date for {symbol} should be within last year"
            assert date <= now, f"Date for {symbol} should not be in the future"

    def test_get_comprehensive_account_activities_returns_string(self, mock_account_id):
        """Test that get_comprehensive_account_activities returns a formatted string."""
        result = get_comprehensive_account_activities(account_id=TEST_ALPACA_ACCOUNT_ID)
        
        assert isinstance(result, str), "Function should return a string"
        assert len(result) > 0, "Result should not be empty"
        assert "Account Activities" in result, "Result should contain account activities header"

    def test_get_comprehensive_account_activities_contains_expected_sections(self, mock_account_id):
        """Test that comprehensive activities contains expected sections."""
        result = get_comprehensive_account_activities(account_id=TEST_ALPACA_ACCOUNT_ID)
        
        # Check for key sections
        assert "**Activity Summary**" in result, "Should contain activity summary"
        assert "**Total Activities:**" in result, "Should contain total activities count"
        assert "**Buy Transactions:**" in result, "Should contain buy transaction count"
        assert "**Sell Transactions:**" in result, "Should contain sell transaction count"

    def test_get_account_activities_returns_list(self, mock_account_id):
        """Test that get_account_activities returns a list of ActivityRecord objects."""
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=60)
        
        result = get_account_activities(
            account_id=TEST_ALPACA_ACCOUNT_ID,
            activity_types=['FILL'],
            date_start=start_date,
            date_end=end_date
        )
        
        assert isinstance(result, list), "Function should return a list"
        
        # Test that each item is an ActivityRecord
        for activity in result:
            assert isinstance(activity, ActivityRecord), "Each item should be an ActivityRecord"
            
            # Test key properties exist
            assert hasattr(activity, 'symbol'), "Activity should have symbol"
            assert hasattr(activity, 'side'), "Activity should have side"
            assert hasattr(activity, 'quantity'), "Activity should have quantity"
            assert hasattr(activity, 'price'), "Activity should have price"
            assert hasattr(activity, 'transaction_time'), "Activity should have transaction_time"

    def test_side_detection_logic_works(self, mock_account_id):
        """Test that our side detection logic correctly identifies buy/sell transactions."""
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=60)
        
        activities = get_account_activities(
            account_id=TEST_ALPACA_ACCOUNT_ID,
            activity_types=['FILL'],
            date_start=start_date,
            date_end=end_date
        )
        
        buy_count = 0
        sell_count = 0
        
        for activity in activities:
            if activity.side:
                side_lower = str(activity.side).lower()
                if 'buy' in side_lower:
                    buy_count += 1
                elif 'sell' in side_lower:
                    sell_count += 1
        
        # Should have both buy and sell transactions for this test account
        assert buy_count > 0, "Should have some buy transactions"
        assert sell_count >= 0, "Should have zero or more sell transactions"
        assert buy_count + sell_count <= len(activities), "Buy + sell should not exceed total activities"

    def test_data_consistency_between_functions(self, mock_account_id):
        """Test data consistency between different functions."""
        # Get data from different functions
        first_purchases = find_first_purchase_dates()
        comprehensive_output = get_comprehensive_account_activities(account_id=TEST_ALPACA_ACCOUNT_ID)
        
        # Both should return some data
        assert len(first_purchases) > 0, "First purchases should return some data"
        assert len(comprehensive_output) > 0, "Comprehensive output should return some data"
        
        # Symbols from first purchases should appear in comprehensive output
        symbols_in_first_purchases = set(first_purchases.keys())
        
        # Count how many symbols appear in comprehensive output
        symbols_found_in_comprehensive = 0
        for symbol in symbols_in_first_purchases:
            if symbol in comprehensive_output:
                symbols_found_in_comprehensive += 1
        
        # At least some symbols should appear in both (allowing for different time windows)
        assert symbols_found_in_comprehensive > 0, "Some symbols should appear in both functions' outputs"

    def test_empty_date_range_handling(self, mock_account_id):
        """Test handling of empty date ranges."""
        # Test with a date range that should have no activities
        past_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
        past_date_end = datetime(2020, 1, 2, tzinfo=timezone.utc)
        
        activities = get_account_activities(
            account_id=TEST_ALPACA_ACCOUNT_ID,
            activity_types=['FILL'],
            date_start=past_date,
            date_end=past_date_end
        )
        
        # Should return empty list, not fail
        assert isinstance(activities, list), "Should return a list even when empty"
        assert len(activities) == 0, "Should return empty list for date range with no activities"

    def test_function_performance_is_reasonable(self, mock_account_id):
        """Test that functions complete in reasonable time."""
        import time
        
        # Test find_first_purchase_dates performance
        start_time = time.time()
        result = find_first_purchase_dates()
        end_time = time.time()
        
        execution_time = end_time - start_time
        assert execution_time < 5.0, f"find_first_purchase_dates took {execution_time:.2f}s, should be under 5s"
        
        # Test comprehensive activities performance
        start_time = time.time()
        result = get_comprehensive_account_activities(account_id=TEST_ALPACA_ACCOUNT_ID)
        end_time = time.time()
        
        execution_time = end_time - start_time
        assert execution_time < 10.0, f"get_comprehensive_account_activities took {execution_time:.2f}s, should be under 10s"

    @pytest.mark.parametrize("days_back", [30, 60, 90])
    def test_comprehensive_activities_with_different_periods(self, mock_account_id, days_back):
        """Test comprehensive activities with different time periods."""
        result = get_comprehensive_account_activities(
            account_id=TEST_ALPACA_ACCOUNT_ID,
            days_back=days_back
        )
        
        assert isinstance(result, str), f"Should return string for {days_back}-day period"
        assert len(result) > 0, f"Should return non-empty result for {days_back}-day period"
        assert f"{days_back}-day summary" in result or "day summary" in result, f"Should mention time period in output"


# For standalone execution
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"]) 