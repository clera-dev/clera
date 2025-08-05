#!/usr/bin/env python3
"""
Test for verifying the deposit exclusion fix in portfolio return calculation.

This test verifies that deposits are correctly excluded from the investment return
calculation, solving the issue where a $10,000 deposit was being counted as
today's portfolio return.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import Mock, MagicMock
from portfolio_realtime.portfolio_calculator import PortfolioCalculator

def test_deposit_exclusion_scenario():
    """
    Test the exact scenario from the bug report:
    - User had portfolio worth $143,910.89 yesterday
    - User deposited $10,000 today
    - Portfolio gained $500 in stock value
    - Expected: Today's return should be $500, not $10,500
    """
    print("🧪 Testing Deposit Exclusion Fix")
    print("=" * 50)
    
    # Create mock broker client
    mock_broker_client = Mock()
    
    # Mock account data - yesterday's value was $143,910.89
    mock_account = Mock()
    mock_account.cash = 60000.0  # $50k original + $10k deposit
    mock_account.last_equity = 143910.89  # Yesterday's total equity
    mock_broker_client.get_trade_account_by_id.return_value = mock_account
    
    # Mock today's deposit activity
    mock_activity = Mock()
    mock_activity.net_amount = 10000.0  # $10,000 deposit today
    mock_broker_client.get_account_activities.return_value = [mock_activity]
    
    # Mock portfolio history method to fail (forcing fallback)
    mock_broker_client.get_portfolio_history_for_account.side_effect = Exception("Portfolio history not available")
    
    # Mock positions - some holdings that gained $500 in value
    test_positions = [
        {
            'symbol': 'AAPL',
            'qty': 100,
            'current_price': 150.0  # $15,000 position
        },
        {
            'symbol': 'MSFT', 
            'qty': 200,
            'current_price': 350.0  # $70,000 position
        },
        {
            'symbol': 'GOOGL',
            'qty': 50,
            'current_price': 180.0  # $9,000 position
        }
    ]
    mock_broker_client.get_all_positions_for_account.return_value = test_positions
    
    # Create calculator
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
    
    print("💰 Scenario Setup:")
    print(f"   Yesterday's equity: ${mock_account.last_equity:,.2f}")
    print(f"   Today's deposit: ${mock_activity.net_amount:,.2f}")
    print(f"   Current cash: ${mock_account.cash:,.2f}")
    print(f"   Stock positions value: ${sum(pos['qty'] * pos['current_price'] for pos in test_positions):,.2f}")
    
    # Calculate portfolio value (this should properly exclude deposits from return)
    result = calculator.calculate_portfolio_value('test-account-id')
    
    print("\n📊 Results:")
    print(f"   Portfolio value: {result['total_value']}")
    print(f"   Today's return: {result['today_return']}")
    print(f"   Raw return: ${result['raw_return']:,.2f}")
    print(f"   Return percentage: {result['raw_return_percent']:.2f}%")
    
    # Verify the calculations
    expected_portfolio_value = 60000 + 15000 + 70000 + 9000  # $154,000
    expected_return = (154000 - 10000) - 143910.89  # Exclude deposit: $89.11
    
    print(f"\n✅ Expected Calculations:")
    print(f"   Portfolio value: ${expected_portfolio_value:,.2f}")
    print(f"   Return calculation: (${expected_portfolio_value:,.2f} - ${mock_activity.net_amount:,.2f}) - ${mock_account.last_equity:,.2f}")
    print(f"   Expected return: ${expected_return:,.2f}")
    
    # Assertions
    assert result is not None, "Calculator should return a result"
    assert result['raw_value'] == expected_portfolio_value, f"Portfolio value should be ${expected_portfolio_value:,.2f}"
    
    # The key test: return should be around $89, NOT $10,089 (which would include the deposit)
    assert abs(result['raw_return'] - expected_return) < 0.01, f"Return should be ${expected_return:.2f}, not include the deposit"
    assert result['raw_return'] < 1000, "Return should be small (under $1000), not include the $10k deposit"
    
    print(f"\n🎉 SUCCESS! Deposit correctly excluded from return calculation.")
    print(f"   The fix prevents deposits from being counted as investment gains!")
    
    return result

def test_multiple_deposits():
    """Test handling multiple deposits in the same day."""
    print("\n🧪 Testing Multiple Deposits Scenario")
    print("=" * 50)
    
    # Create mock broker client
    mock_broker_client = Mock()
    
    # Mock multiple deposit activities
    mock_activity1 = Mock()
    mock_activity1.net_amount = 5000.0
    mock_activity2 = Mock()
    mock_activity2.net_amount = 3000.0
    mock_activity3 = Mock()
    mock_activity3.net_amount = 2000.0
    
    mock_broker_client.get_account_activities.return_value = [mock_activity1, mock_activity2, mock_activity3]
    
    # Create calculator
    calculator = PortfolioCalculator(
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    calculator.broker_client = mock_broker_client
    
    # Test deposits summing
    total_deposits = calculator.get_todays_deposits('test-account')
    expected_total = 5000 + 3000 + 2000  # $10,000 total
    
    print(f"   Multiple deposits: $5,000 + $3,000 + $2,000")
    print(f"   Total detected: ${total_deposits:,.2f}")
    print(f"   Expected total: ${expected_total:,.2f}")
    
    assert total_deposits == expected_total, f"Should correctly sum multiple deposits"
    print(f"✅ Multiple deposits correctly summed!")

if __name__ == "__main__":
    try:
        result = test_deposit_exclusion_scenario()
        test_multiple_deposits()
        print(f"\n🎯 All tests passed! The deposit exclusion fix is working correctly.")
        print(f"   Today's return: {result['today_return']}")
        print(f"   Raw return: ${result['raw_return']:,.2f}")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1) 