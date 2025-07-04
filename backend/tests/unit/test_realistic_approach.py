#!/usr/bin/env python3
"""
Test script for the realistic daily return approach that matches major brokerages
"""

import sys
sys.path.append('.')

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import os

def test_realistic_approach():
    """Test the realistic daily return calculation approach"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🧪 Testing REALISTIC approach for account {account_id}")
        print("📝 This approach matches what major brokerages like Schwab/Fidelity actually do")
        
        # Test the realistic daily return calculation
        todays_return, portfolio_value = calc.calculate_realistic_daily_return(account_id)
        
        print(f"✅ Realistic calculation successful!")
        print(f"💰 Portfolio value: ${portfolio_value:.2f}")
        print(f"📈 Today's return: ${todays_return:.2f}")
        
        # Calculate percentage
        base_value = portfolio_value - todays_return
        return_percent = (todays_return / base_value * 100) if base_value > 0 else 0
        print(f"📊 Return percentage: {return_percent:.2f}%")
        
        # This will likely still show a high percentage because it includes deposits,
        # but that's how major brokerages actually work - they flag it rather than exclude it
        if abs(return_percent) > 5:
            print("💡 High daily return detected - likely includes deposit/withdrawal effects")
            print("📌 Major brokerages handle this by showing a note like 'Return includes deposits'")
        else:
            print("✅ Return percentage looks reasonable for pure investment performance")
        
        # Test the full portfolio calculation with this approach
        print(f"\n🔄 Testing full portfolio calculation with realistic approach...")
        portfolio_data = calc.calculate_portfolio_value(account_id)
        
        if portfolio_data:
            print("✅ Full portfolio calculation successful!")
            print(f"💰 Total Value: {portfolio_data['total_value']}")
            print(f"📈 Today's Return: {portfolio_data['today_return']}")
            print(f"🔢 Raw Return: ${portfolio_data['raw_return']:.2f}")
            print(f"📊 Return %: {portfolio_data['raw_return_percent']:.2f}%")
            
            print(f"\n🏦 COMPARISON TO MAJOR BROKERAGES:")
            print(f"   - Schwab/Fidelity would show: {portfolio_data['today_return']}")
            print(f"   - They would add a note if large deposits detected")
            print(f"   - Time-weighted return would be shown separately for longer periods")
        else:
            print("❌ Full portfolio calculation failed")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_realistic_approach() 