#!/usr/bin/env python3
"""
Test the FINAL SOLUTION that handles stale last_equity and provides safe fallbacks.
This addresses both the return calculation and deployment concerns.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import requests

def test_final_solution():
    """Test the final robust solution"""
    calc = PortfolioCalculator(
        broker_api_key=os.getenv('BROKER_API_KEY'),
        broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
        sandbox=True
    )
    
    account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
    print(f"🎯 TESTING FINAL SOLUTION for account {account_id}")
    print("=" * 80)
    
    # Test the robust calculation
    print("\n1️⃣ TESTING ROBUST CALCULATION:")
    todays_return, portfolio_value = calc.calculate_todays_return_robust(account_id)
    return_pct = (todays_return / (portfolio_value - todays_return) * 100) if (portfolio_value - todays_return) > 0 else 0
    
    print(f"   Portfolio Value: ${portfolio_value:,.2f}")
    print(f"   Today's Return: ${todays_return:,.2f} ({return_pct:.2f}%)")
    
    # Assert it's realistic
    assert abs(return_pct) <= 5.0, f"Return ({return_pct:.2f}%) is not realistic (should be <= 5.0%)"
    print(f"   ✅ Return ({return_pct:.2f}%) is REALISTIC")
    
    # Test the API endpoint
    print("\n2️⃣ TESTING API ENDPOINT:")
    response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
    assert response.status_code == 200, f"API request failed: {response.status_code}"
    data = response.json()
    api_return = data['todays_return']
    api_return_pct = data['return_percentage']
    
    print(f"   API Portfolio Value: ${data['portfolio_value']:,.2f}")
    print(f"   API Today's Return: ${api_return:,.2f} ({api_return_pct:.2f}%)")
    
    assert abs(api_return_pct) <= 5.0, f"API Return ({api_return_pct:.2f}%) is not realistic (should be <= 5.0%)"
    print(f"   ✅ API Return ({api_return_pct:.2f}%) is REALISTIC")

if __name__ == "__main__":
    test_final_solution() 