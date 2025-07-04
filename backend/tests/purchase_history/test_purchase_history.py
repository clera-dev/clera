#!/usr/bin/env python3
"""
Test suite for purchase history functionality.

This test suite comprehensively tests the purchase history tools
to ensure they work correctly with the Alpaca broker API.
"""

import os
import sys
import pytest
import logging
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import the modules to test
from clera_agents.tools.purchase_history import (
    ActivityRecord, get_account_activities, get_purchase_history,
    get_all_activities, format_purchase_history, find_first_purchase_dates
)
from clera_agents.portfolio_management_agent import (
    get_purchase_history_tool, get_account_activities_tool, get_first_purchase_dates_tool
)

# Configure logging for tests
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestActivityRecord:
    """Test the ActivityRecord dataclass and its methods."""
    
    def test_activity_record_creation(self):
        """Test creating an ActivityRecord manually."""
        activity = ActivityRecord(
            activity_type='FILL',
            symbol='AAPL',
            transaction_time=datetime.now(timezone.utc),
            quantity=Decimal('10'),
            price=Decimal('150.00'),
            side='buy',
            net_amount=Decimal('-1500.00'),
            description='Bought 10 shares of AAPL at $150.00',
            id='test-123'
        )
        
        assert activity.activity_type == 'FILL'
        assert activity.symbol == 'AAPL'
        assert activity.quantity == Decimal('10')
        assert activity.side == 'buy'
        
    def test_from_alpaca_activity_fill(self):
        """Test creating ActivityRecord from a mock Alpaca FILL activity."""
        # Mock Alpaca activity object
        mock_activity = Mock()
        mock_activity.activity_type = 'FILL'
        mock_activity.symbol = 'TSLA'
        mock_activity.transaction_time = '2024-06-01T14:30:00Z'
        mock_activity.qty = '5'
        mock_activity.price = '200.50'
        mock_activity.side = 'buy'
        mock_activity.net_amount = '-1002.50'
        mock_activity.id = 'fill-123'
        
        activity = ActivityRecord.from_alpaca_activity(mock_activity)
        
        assert activity.activity_type == 'FILL'
        assert activity.symbol == 'TSLA'
        assert activity.quantity == Decimal('5')
        assert activity.price == Decimal('200.50')
        assert activity.side == 'buy'
        assert activity.net_amount == Decimal('-1002.50')
        assert 'Bought 5 shares of TSLA at $200.50' in activity.description
        
    def test_from_alpaca_activity_dividend(self):
        """Test creating ActivityRecord from a mock Alpaca dividend activity."""
        mock_activity = Mock()
        mock_activity.activity_type = 'DIV'
        mock_activity.symbol = 'MSFT'
        mock_activity.transaction_time = '2024-06-01T09:00:00Z'
        mock_activity.net_amount = '25.00'
        mock_activity.id = 'div-456'
        
        # Add attributes that might not exist
        mock_activity.qty = None
        mock_activity.price = None
        mock_activity.side = None
        
        activity = ActivityRecord.from_alpaca_activity(mock_activity)
        
        assert activity.activity_type == 'DIV'
        assert activity.symbol == 'MSFT'
        assert activity.net_amount == Decimal('25.00')
        assert 'Dividend payment of $25.00 from MSFT' in activity.description


class TestPurchaseHistoryFunctions:
    """Test the core purchase history functions."""
    
    @patch('clera_agents.tools.purchase_history.broker_client')
    @patch('clera_agents.tools.purchase_history.get_account_id')
    def test_get_account_activities_success(self, mock_get_account_id, mock_broker_client):
        """Test successful retrieval of account activities."""
        # Setup mocks
        mock_get_account_id.return_value = 'test-account-123'
        
        # Mock Alpaca activity
        mock_activity = Mock()
        mock_activity.activity_type = 'FILL'
        mock_activity.symbol = 'AAPL'
        mock_activity.transaction_time = '2024-06-01T14:30:00Z'
        mock_activity.qty = '10'
        mock_activity.price = '150.00'
        mock_activity.side = 'buy'
        mock_activity.net_amount = '-1500.00'
        mock_activity.id = 'test-fill-123'
        
        mock_broker_client.get_account_activities.return_value = [mock_activity]
        
        # Test the function
        activities = get_account_activities(
            account_id='test-account-123',
            activity_types=['FILL']
        )
        
        assert len(activities) == 1
        assert activities[0].symbol == 'AAPL'
        assert activities[0].activity_type == 'FILL'
        
        # Verify the broker client was called correctly
        mock_broker_client.get_account_activities.assert_called_once()
        
    @patch('clera_agents.tools.purchase_history.broker_client')
    @patch('clera_agents.tools.purchase_history.get_account_id')
    def test_get_account_activities_error(self, mock_get_account_id, mock_broker_client):
        """Test error handling in get_account_activities."""
        mock_get_account_id.return_value = 'test-account-123'
        mock_broker_client.get_account_activities.side_effect = Exception("API Error")
        
        activities = get_account_activities(
            account_id='test-account-123'
        )
        
        assert activities == []
        
    @patch('clera_agents.tools.purchase_history.get_account_activities')
    @patch('clera_agents.tools.purchase_history.get_account_id')
    def test_get_purchase_history(self, mock_get_account_id, mock_get_activities):
        """Test get_purchase_history function."""
        mock_get_account_id.return_value = 'test-account-123'
        
        # Mock activity
        mock_activity = ActivityRecord(
            activity_type='FILL',
            symbol='NVDA',
            transaction_time=datetime.now(timezone.utc),
            quantity=Decimal('5'),
            price=Decimal('300.00'),
            side='buy',
            net_amount=Decimal('-1500.00'),
            description='Bought 5 shares of NVDA at $300.00',
            id='test-123'
        )
        
        mock_get_activities.return_value = [mock_activity]
        
        activities = get_purchase_history(days_back=30)
        
        assert len(activities) == 1
        assert activities[0].symbol == 'NVDA'
        
        # Verify correct parameters were passed
        mock_get_activities.assert_called_once_with(
            account_id='test-account-123',
            activity_types=['FILL'],
            date_start=mock_get_activities.call_args[1]['date_start'],
            date_end=mock_get_activities.call_args[1]['date_end'],
            page_size=100
        )


class TestFormattingFunctions:
    """Test the formatting and display functions."""
    
    def test_format_purchase_history_empty(self):
        """Test formatting with no activities."""
        result = format_purchase_history([])
        
        assert "No trading activities found" in result
        
    def test_format_purchase_history_with_activities(self):
        """Test formatting with sample activities."""
        activities = [
            ActivityRecord(
                activity_type='FILL',
                symbol='AAPL',
                transaction_time=datetime(2024, 6, 1, 14, 30, 0, tzinfo=timezone.utc),
                quantity=Decimal('10'),
                price=Decimal('150.00'),
                side='buy',
                net_amount=Decimal('-1500.00'),
                description='Bought 10 shares of AAPL at $150.00',
                id='test-1'
            ),
            ActivityRecord(
                activity_type='FILL',
                symbol='TSLA',
                transaction_time=datetime(2024, 6, 1, 15, 45, 0, tzinfo=timezone.utc),
                quantity=Decimal('5'),
                price=Decimal('200.00'),
                side='sell',
                net_amount=Decimal('1000.00'),
                description='Sold 5 shares of TSLA at $200.00',
                id='test-2'
            )
        ]
        
        result = format_purchase_history(activities)
        
        assert "Purchase History" in result
        assert "2 transactions" in result
        assert "AAPL" in result
        assert "TSLA" in result
        assert "June 01, 2024" in result
        assert "🟢" in result  # Buy emoji
        assert "🔴" in result  # Sell emoji
        
    def test_find_first_purchase_dates_functionality(self):
        """Test the logic of find_first_purchase_dates function."""
        # This would be tested with mock data since we can't rely on real API data
        # The actual implementation would call get_account_activities and process the results
        pass


class TestPortfolioManagementTools:
    """Test the @tool decorated functions."""
    
    @patch('clera_agents.portfolio_management_agent.get_purchase_history')
    def test_get_purchase_history_tool_success(self, mock_get_purchase_history):
        """Test the @tool decorated purchase history function."""
        mock_activity = ActivityRecord(
            activity_type='FILL',
            symbol='GOOGL',
            transaction_time=datetime.now(timezone.utc),
            quantity=Decimal('2'),
            price=Decimal('2500.00'),
            side='buy',
            net_amount=Decimal('-5000.00'),
            description='Bought 2 shares of GOOGL at $2500.00',
            id='test-googl'
        )
        
        mock_get_purchase_history.return_value = [mock_activity]
        
        result = get_purchase_history_tool()
        
        assert "Purchase History" in result
        assert "GOOGL" in result
        assert "Total Transactions: 1" in result
        assert "Buy Orders: 1" in result
        
    @patch('clera_agents.portfolio_management_agent.get_purchase_history')
    def test_get_purchase_history_tool_empty(self, mock_get_purchase_history):
        """Test the @tool function with no activities."""
        mock_get_purchase_history.return_value = []
        
        result = get_purchase_history_tool()
        
        assert "No Trading History Found" in result
        
    @patch('clera_agents.portfolio_management_agent.get_all_activities')
    def test_get_account_activities_tool_success(self, mock_get_all_activities):
        """Test the account activities tool function."""
        mock_activities = [
            ActivityRecord(
                activity_type='FILL',
                symbol='SPY',
                transaction_time=datetime.now(timezone.utc),
                quantity=Decimal('100'),
                price=Decimal('400.00'),
                side='buy',
                net_amount=Decimal('-40000.00'),
                description='Bought 100 shares of SPY at $400.00',
                id='spy-buy'
            ),
            ActivityRecord(
                activity_type='DIV',
                symbol='SPY',
                transaction_time=datetime.now(timezone.utc),
                quantity=None,
                price=None,
                side=None,
                net_amount=Decimal('150.00'),
                description='Dividend payment of $150.00 from SPY',
                id='spy-div'
            )
        ]
        
        mock_get_all_activities.return_value = mock_activities
        
        result = get_account_activities_tool()
        
        assert "Account Activities" in result
        assert "2 total activities" in result
        assert "SPY" in result
        assert "Trades: 1" in result
        assert "Dividends: 1" in result


class TestIntegration:
    """Integration tests that verify the complete workflow."""
    
    @pytest.mark.integration
    @patch('clera_agents.tools.purchase_history.broker_client')
    def test_complete_purchase_history_workflow(self, mock_broker_client):
        """Test the complete workflow from API call to formatted output."""
        # Setup mock broker client response
        mock_activity = Mock()
        mock_activity.activity_type = 'FILL'
        mock_activity.symbol = 'VTI'
        mock_activity.transaction_time = '2024-06-01T10:00:00Z'
        mock_activity.qty = '50'
        mock_activity.price = '200.00'
        mock_activity.side = 'buy'
        mock_activity.net_amount = '-10000.00'
        mock_activity.id = 'vti-purchase'
        
        mock_broker_client.get_account_activities.return_value = [mock_activity]
        
        # Test the complete workflow
        with patch('clera_agents.tools.purchase_history.get_account_id') as mock_get_account_id:
            mock_get_account_id.return_value = 'test-account'
            
            # Get activities
            activities = get_purchase_history(days_back=30)
            
            # Format them
            formatted = format_purchase_history(activities)
            
            # Verify results
            assert len(activities) == 1
            assert activities[0].symbol == 'VTI'
            assert "VTI" in formatted
            assert "Bought 50 shares" in formatted


def run_live_test():
    """
    Run a live test against the actual Alpaca API.
    This should only be run manually when testing with real credentials.
    """
    print("🧪 Running LIVE Purchase History Test")
    print("=" * 50)
    
    try:
        # Test the actual functions with real API
        from clera_agents.portfolio_management_agent import (
            get_purchase_history_tool, get_account_activities_tool, get_first_purchase_dates_tool
        )
        
        print("📅 Testing Purchase History Tool...")
        history_result = get_purchase_history_tool()
        print(history_result[:500] + "..." if len(history_result) > 500 else history_result)
        print("\n" + "="*50 + "\n")
        
        print("📋 Testing Account Activities Tool...")
        activities_result = get_account_activities_tool()
        print(activities_result[:500] + "..." if len(activities_result) > 500 else activities_result)
        print("\n" + "="*50 + "\n")
        
        print("📊 Testing First Purchase Dates Tool...")
        dates_result = get_first_purchase_dates_tool()
        print(dates_result[:500] + "..." if len(dates_result) > 500 else dates_result)
        print("\n" + "="*50 + "\n")
        
        print("✅ LIVE TEST COMPLETED SUCCESSFULLY!")
        
    except Exception as e:
        print(f"❌ LIVE TEST FAILED: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Run unit tests first
    print("🧪 Running Unit Tests...")
    pytest.main([__file__, "-v"])
    
    # Ask user if they want to run live tests
    response = input("\n🔴 Run LIVE tests against Alpaca API? (y/N): ").strip().lower()
    if response == 'y':
        run_live_test()
    else:
        print("✅ Skipping live tests. Unit tests completed!") 