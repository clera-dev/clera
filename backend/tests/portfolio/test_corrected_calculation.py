#!/usr/bin/env python3
"""
Test script for the corrected industry-standard return calculation
"""

import sys
sys.path.append('.')

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import os

def test_corrected_calculation():
    """Test the corrected portfolio calculation approach"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
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
            
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_corrected_calculation() 