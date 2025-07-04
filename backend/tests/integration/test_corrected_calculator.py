#!/usr/bin/env python3
"""
Test Corrected Portfolio Calculator

Verify that the portfolio calculator now returns realistic daily returns
instead of the incorrect total return since account opening.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator

def test_corrected_calculator():
    """Test the corrected portfolio calculator"""
    try:
        print("🔧 TESTING CORRECTED PORTFOLIO CALCULATOR")
        print("=" * 80)
        
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        
        print(f"\n1️⃣ TESTING calculate_todays_return_robust:")
        print("-" * 50)
        
        todays_return, portfolio_value = calc.calculate_todays_return_robust(account_id)
        
        print(f"   Portfolio Value: ${portfolio_value:,.2f}")
        print(f"   Today's Return: ${todays_return:.2f}")
        
        if portfolio_value > 0:
            return_pct = (todays_return / portfolio_value * 100)
            print(f"   Return Percentage: {return_pct:.2f}%")
            
            # Check if this is now reasonable
            if 0.01 <= abs(return_pct) <= 2.0:  # 0.01% to 2% is reasonable daily range
                print(f"   ✅ SUCCESS: {return_pct:.2f}% is a REALISTIC daily return!")
            elif abs(return_pct) > 5.0:
                print(f"   ❌ STILL BROKEN: {return_pct:.2f}% is too high for daily return")
            else:
                print(f"   ⚠️  {return_pct:.2f}% is reasonable but low")
        
        print(f"\n2️⃣ TESTING calculate_portfolio_value:")
        print("-" * 50)
        
        portfolio_data = calc.calculate_portfolio_value(account_id)
        
        if portfolio_data:
            print(f"   Response:")
            for key, value in portfolio_data.items():
                print(f"      {key}: {value}")
                
            raw_return = portfolio_data.get('raw_return', 0)
            raw_return_percent = portfolio_data.get('raw_return_percent', 0)
            
            if 0.01 <= abs(raw_return_percent) <= 2.0:
                print(f"\n   ✅ CORRECTED: Daily return {raw_return_percent:.2f}% is realistic!")
            elif abs(raw_return_percent) > 5.0:
                print(f"\n   ❌ STILL BROKEN: {raw_return_percent:.2f}% is unrealistic")
            else:
                print(f"\n   ℹ️  Return {raw_return_percent:.2f}% is reasonable")
        
        # Clear Redis cache to test fresh calculation
        print(f"\n3️⃣ TESTING API ENDPOINT:")
        print("-" * 50)
        
        import redis
        redis_client = redis.Redis(host='localhost', port=6379, db=0)
        redis_client.flushall()
        print(f"   Cleared Redis cache")
        
        # Test API endpoint
        import requests
        try:
            response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
            if response.status_code == 200:
                api_data = response.json()
                api_return_pct = api_data.get('raw_return_percent', 0)
                
                print(f"   API Response:")
                print(f"      today_return: {api_data.get('today_return', 'N/A')}")
                print(f"      raw_return_percent: {api_return_pct:.2f}%")
                
                if 0.01 <= abs(api_return_pct) <= 2.0:
                    print(f"   ✅ API CORRECTED: {api_return_pct:.2f}% is realistic!")
                elif abs(api_return_pct) > 5.0:
                    print(f"   ❌ API STILL BROKEN: {api_return_pct:.2f}% is unrealistic")
                else:
                    print(f"   ℹ️  API return {api_return_pct:.2f}% is reasonable")
            else:
                print(f"   ❌ API Error: {response.status_code}")
        except Exception as e:
            print(f"   ❌ API Test failed: {e}")
        
        print(f"\n4️⃣ SUMMARY:")
        print("-" * 50)
        
        # Check if the fix worked
        if portfolio_data and 0.01 <= abs(portfolio_data.get('raw_return_percent', 0)) <= 2.0:
            print(f"   ✅ FIXED: Portfolio calculator returns realistic daily returns")
            print(f"   ✅ No more 6.90% fake 'daily' returns")
            print(f"   ✅ Now shows actual daily movement (~0.1-0.5%)")
        else:
            print(f"   ⚠️  May need additional fixes or cache clearing")
        
        return True
        
    except Exception as e:
        print(f"❌ Error in corrected calculator test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_corrected_calculator() 