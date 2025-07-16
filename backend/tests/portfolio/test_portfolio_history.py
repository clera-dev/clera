#!/usr/bin/env python3
"""
Test script for portfolio history approach
"""

import sys
sys.path.append('.')

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import os

def test_portfolio_history():
    """Test the portfolio history approach to see why it's failing"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🧪 Testing portfolio history for account {account_id}")
        
        # Test the portfolio history approach
        todays_return, base_value = calc.get_todays_return_from_portfolio_history(account_id)
        print(f"📊 Portfolio history result: Return=${todays_return}, Base=${base_value}")
        
        # Also test direct account access
        account = calc.broker_client.get_trade_account_by_id(account_id)
        print(f"💰 Account last_equity: ${account.last_equity}")
        print(f"💰 Account current equity: ${account.equity}")
        print(f"💰 Account portfolio_value: ${account.portfolio_value}")
        
        # Test deposits
        deposits = calc.get_todays_deposits(account_id)
        print(f"📥 Today's deposits: ${deposits:.2f}")
        
        # Calculate what the return should be
        expected_return = float(account.equity) - deposits - float(account.last_equity) 
        print(f"🧮 Expected return (equity - deposits - last_equity): ${expected_return:.2f}")
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_portfolio_history() 