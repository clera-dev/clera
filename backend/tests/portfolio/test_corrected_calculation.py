#!/usr/bin/env python3
"""
Test script for the corrected industry-standard return calculation
"""

import sys
import os
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal

sys.path.append('.')

def create_mock_broker_client():
    """Create a mock broker client for testing."""
    mock_client = Mock()
    
    # Mock account data
    mock_account = Mock()
    mock_account.equity = Decimal('10000.00')
    mock_account.last_equity = Decimal('9800.00')
    mock_account.cash = Decimal('500.00')
    mock_account.buying_power = Decimal('500.00')
    mock_account.status = 'ACTIVE'
    
    # Mock positions
    mock_position = Mock()
    mock_position.symbol = 'AAPL'
    mock_position.qty = Decimal('10')
    mock_position.market_value = Decimal('9500.00')
    mock_position.cost_basis = Decimal('9000.00')
    mock_position.unrealized_pl = Decimal('500.00')
    mock_position.current_price = Decimal('950.00')
    
    # Mock orders
    mock_order = Mock()
    mock_order.symbol = 'AAPL'
    mock_order.qty = Decimal('5')
    mock_order.filled_qty = Decimal('5')
    mock_order.status = 'filled'
    mock_order.filled_avg_price = Decimal('950.00')
    
    # Setup mock methods
    mock_client.get_trade_account_by_id.return_value = mock_account
    mock_client.get_all_positions_for_account.return_value = [mock_position]
    mock_client.get_orders_for_account.return_value = [mock_order]
    
    return mock_client

def create_mock_portfolio_calculator():
    """Create a PortfolioCalculator with mocked dependencies."""
    from portfolio_realtime.portfolio_calculator import PortfolioCalculator
    
    # Create calculator with test configuration
    calc = PortfolioCalculator(
        broker_api_key='test_api_key',
        broker_secret_key='test_secret_key',
        sandbox=True
    )
    
    # Replace the broker client with our mock
    calc.broker_client = create_mock_broker_client()
    
    return calc

def test_corrected_calculation():
    """Test the corrected portfolio calculation approach with mocked dependencies."""
    # Create calculator with mocked dependencies
    calc = create_mock_portfolio_calculator()
    
    account_id = 'test-account-id'
    print(f"🧪 Testing corrected calculation for account {account_id}")
    
    # Test the corrected position-based calculation
    todays_return, portfolio_value = calc.calculate_todays_return_position_based(account_id)
    print(f"📊 Position-based calculation result:")
    print(f"   Portfolio value: ${portfolio_value:.2f}")
    print(f"   Today's return: ${todays_return:.2f}")
    
    # Test the full portfolio calculation
    portfolio_data = calc.calculate_portfolio_value(account_id)
    
    if portfolio_data:
        print("✅ Portfolio calculation successful!")
        print(f"💰 Total Value: {portfolio_data['total_value']}")
        print(f"📈 Today's Return: {portfolio_data['today_return']}")
        print(f"🔢 Raw Return: ${portfolio_data['raw_return']:.2f}")
        print(f"📊 Return %: {portfolio_data['raw_return_percent']:.2f}%")
        
        # Check if the return is reasonable (not 27% loss!)
        return_percent = portfolio_data['raw_return_percent']
        if abs(return_percent) < 10:  # Reasonable daily return
            print("✅ GOOD: Return calculation shows reasonable daily change")
        else:
            print(f"⚠️  WARNING: Return shows {return_percent:.2f}% which may be unrealistic")
            
    else:
        print("❌ Portfolio calculation failed")
        
    # Also test against account data directly
    account = calc.broker_client.get_trade_account_by_id(account_id)
    print(f"\n📋 Account data verification:")
    print(f"   Current equity: ${float(account.equity):.2f}")
    print(f"   Last equity: ${float(account.last_equity):.2f}")
    print(f"   Simple difference: ${float(account.equity) - float(account.last_equity):.2f}")

def test_corrected_calculation_with_real_data():
    """Integration test with real data (optional, for end-to-end validation)."""
    # Only run if environment variables are set
    if not (os.getenv('BROKER_API_KEY') and os.getenv('BROKER_SECRET_KEY')):
        print("⚠️  Skipping real data test - environment variables not set")
        return
    
    from portfolio_realtime.portfolio_calculator import PortfolioCalculator
    
    calc = PortfolioCalculator(
        broker_api_key=os.getenv('BROKER_API_KEY'),
        broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
        sandbox=True
    )
    
    account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
    print(f"🧪 Integration test with real data for account {account_id}")
    
    # Test with real data
    portfolio_data = calc.calculate_portfolio_value(account_id)
    
    if portfolio_data:
        print("✅ Real data test successful!")
        print(f"💰 Total Value: {portfolio_data['total_value']}")
        print(f"📈 Today's Return: {portfolio_data['today_return']}")
    else:
        print("❌ Real data test failed")

if __name__ == "__main__":
    # Run unit tests with mocked dependencies
    test_corrected_calculation()
    
    # Optionally run integration test
    test_corrected_calculation_with_real_data() 