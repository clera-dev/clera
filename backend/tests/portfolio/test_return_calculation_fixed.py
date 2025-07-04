#!/usr/bin/env python3
"""
Test to verify the CORRECTED return calculation logic.
This test verifies that deposits are now properly excluded from today's return calculation.
"""

import json
import sys
import os
from unittest.mock import Mock, MagicMock, patch

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator


def test_return_calculation_correctly_excludes_deposits():
    """Test that return calculation correctly excludes deposits using portfolio history."""
    
    # Scenario: User deposited $49,000 but that should NOT count as today's return
    # Previous day equity: $10,000
    # User deposits: $49,000  
    # Current portfolio value: $59,500 (deposits + $500 actual gain)
    # Expected return: $500 (NOT $49,500)
    
    # Mock broker client
    mock_broker_client = MagicMock()
    
    # Mock account info
    mock_account = MagicMock()
    mock_account.cash = "50000.00"          # Current cash (includes the deposit)
    mock_account.last_equity = "10000.00"   # Previous day's total equity
    mock_account.equity = "59500.00"        # Current total equity
    
    # Mock positions (some stocks that gained value)
    test_positions = [
        {
            "symbol": "AAPL",
            "qty": "50", 
            "current_price": "190.00",  # Current price
            "market_value": "9500.00"   # 50 * $190 = $9,500
        }
    ]
    
    # Mock portfolio history response (the key fix!)
    mock_portfolio_history = MagicMock()
    mock_portfolio_history.profit_loss = [500.0]  # Only $500 actual gain (excludes deposits)
    mock_portfolio_history.base_value = 10000.0   # Base value for percentage calculation
    
    # Configure mocks
    mock_broker_client.get_trade_account_by_id.return_value = mock_account
    mock_broker_client.get_all_positions_for_account.return_value = test_positions
    
    # Mock the portfolio history method on the broker client
    mock_broker_client.get_portfolio_history_for_account.return_value = mock_portfolio_history
    
    # Create calculator with mock
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379, 
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    calculator.broker_client = mock_broker_client
    
    # Mock Redis client to simulate no cached data
    calculator.redis_client = Mock()
    calculator.redis_client.get.return_value = None  # No cached positions
    
    # Calculate portfolio value
    result = calculator.calculate_portfolio_value("test-account-123")
    
    # Verify results
    assert result is not None
    
    # Expected calculations:
    # Current Portfolio Value = Cash + Positions = $50,000 + $9,500 = $59,500
    expected_current_value = 59500.00
    assert result["raw_value"] == expected_current_value
    
    # Today's Return should now be ONLY $500 (from portfolio history profit_loss)
    # This is the KEY FIX - we're using portfolio history which excludes deposits
    expected_return = 500.0  # Only the actual investment gains
    assert result["raw_return"] == expected_return
    
    # Expected percentage: $500 / $10,000 = 5%
    expected_percentage = 5.0
    assert abs(result["raw_return_percent"] - expected_percentage) < 0.01
    
    print(f"✓ Current portfolio value: ${result['raw_value']:.2f}")
    print(f"✓ Today's return: ${result['raw_return']:.2f}")
    print(f"✓ Today's return %: {result['raw_return_percent']:.2f}%")
    print("✓ FIXED: Return calculation now correctly excludes deposits!")
    
    # Verify the broker client was called with the correct portfolio history request
    mock_broker_client.get_portfolio_history_for_account.assert_called_once()


def test_fallback_calculation_when_portfolio_history_fails():
    """Test fallback when portfolio history is not available."""
    
    # Mock broker client
    mock_broker_client = MagicMock()
    
    # Mock account info
    mock_account = MagicMock()
    mock_account.cash = "1000.00"
    mock_account.last_equity = "2000.00"  # Previous day equity
    
    # Mock positions
    test_positions = [
        {
            "symbol": "AAPL",
            "qty": "10", 
            "current_price": "150.00",
            "market_value": "1500.00"
        }
    ]
    
    # Configure mocks - portfolio history fails
    mock_broker_client.get_trade_account_by_id.return_value = mock_account
    mock_broker_client.get_account_by_id.return_value = mock_account
    mock_broker_client.get_all_positions_for_account.return_value = test_positions
    mock_broker_client.get_portfolio_history_for_account.side_effect = Exception("Portfolio history not available")
    
    # Create calculator with mock
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379, 
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    calculator.broker_client = mock_broker_client
    
    # Mock Redis client
    calculator.redis_client = Mock()
    calculator.redis_client.get.return_value = None
    
    # Calculate portfolio value
    result = calculator.calculate_portfolio_value("test-account-123")
    
    # Verify fallback calculation works
    assert result is not None
    
    # Current portfolio: $1000 cash + $1500 positions = $2500
    expected_current_value = 2500.00
    assert result["raw_value"] == expected_current_value
    
    # Fallback return: $2500 - $2000 = $500
    expected_return = 500.0
    assert result["raw_return"] == expected_return
    
    print(f"✓ Fallback calculation works: ${result['raw_return']:.2f} return")


if __name__ == "__main__":
    print("Testing CORRECTED return calculation logic...")
    test_return_calculation_correctly_excludes_deposits()
    test_fallback_calculation_when_portfolio_history_fails()
    print("\n✅ All tests passed! Return calculation now correctly excludes deposits.") 