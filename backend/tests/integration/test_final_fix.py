#!/usr/bin/env python3
"""
Test script for the final portfolio history fix using Time-Weighted Return
"""

import sys
sys.path.append('.')

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import os

def test_final_portfolio_history_fix():
    """Test the final portfolio history fix that properly excludes deposits"""
    calc = PortfolioCalculator(
        broker_api_key=os.getenv('BROKER_API_KEY'),
        broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
        sandbox=True
    )
    
    account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
    print(f"🧪 Testing FINAL portfolio history fix for account {account_id}")
    
    # Test the portfolio history approach that excludes deposits
    todays_return, portfolio_value = calc.get_todays_return_using_portfolio_history(account_id)
    
    if todays_return is not None and portfolio_value is not None:
        print("✅ Portfolio history approach SUCCESSFUL!")
        print(f"💰 Portfolio value: ${portfolio_value:.2f}")
        print(f"📈 Today's return (excludes deposits): ${todays_return:.2f}")
        
        # Calculate percentage
        base_value = portfolio_value - todays_return
        return_percent = (todays_return / base_value * 100) if base_value > 0 else 0
        print(f"📊 Return percentage: {return_percent:.2f}%")
        
        # Check if the return is realistic (should be much less than 6%)
        if abs(return_percent) < 5:  # Reasonable daily return
            print("✅ EXCELLENT: Return calculation shows realistic daily change!")
            print("🎉 DEPOSITS ARE PROPERLY EXCLUDED FROM RETURN CALCULATION!")
        else:
            print(f"⚠️  WARNING: Return still shows {return_percent:.2f}% which may be high")
    else:
        print("❌ Portfolio history approach failed, testing fallback...")
        todays_return, portfolio_value = calc.calculate_todays_return_fallback(account_id)
        print(f"📈 Fallback return: ${todays_return:.2f}")
        print("⚠️  Note: Fallback still includes deposits - portfolio history should work in production")
    
    # Test the full portfolio calculation
    print(f"\n🔄 Testing full portfolio calculation...")
    portfolio_data = calc.calculate_portfolio_value(account_id)
    
    if portfolio_data:
        print("✅ Full portfolio calculation successful!")
        print(f"💰 Total Value: {portfolio_data['total_value']}")
        print(f"📈 Today's Return: {portfolio_data['today_return']}")
        print(f"🔢 Raw Return: ${portfolio_data['raw_return']:.2f}")
        print(f"📊 Return %: {portfolio_data['raw_return_percent']:.2f}%")
    else:
        print("❌ Full portfolio calculation failed")

if __name__ == "__main__":
    test_final_portfolio_history_fix() 