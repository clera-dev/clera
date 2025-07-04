#!/usr/bin/env python3
"""
Test script for live portfolio calculation with deposit exclusion
"""

import sys
sys.path.append('.')

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import os

def test_portfolio_calculation():
    """Test the portfolio calculation to verify deposit exclusion works"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🧪 Testing portfolio calculation for account {account_id}")
        
        # Get today's deposits first
        deposits = calc.get_todays_deposits(account_id)
        print(f"📥 Today's deposits detected: ${deposits:.2f}")
        
        # Calculate portfolio
        portfolio_data = calc.calculate_portfolio_value(account_id)
        
        if portfolio_data:
            print("✅ Portfolio calculation successful!")
            print(f"💰 Total Value: {portfolio_data['total_value']}")
            print(f"📈 Today's Return: {portfolio_data['today_return']}")
            print(f"🔢 Raw Return: ${portfolio_data['raw_return']:.2f}")
            print(f"📊 Return %: {portfolio_data['raw_return_percent']:.2f}%")
            
            # Verify deposits are excluded
            if abs(portfolio_data['raw_return'] - deposits) > 100:  # Significant difference
                print("✅ GOOD: Return calculation appears to exclude deposits")
            else:
                print("❌ BAD: Return calculation might still include deposits")
                
        else:
            print("❌ Portfolio calculation failed")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_portfolio_calculation() 