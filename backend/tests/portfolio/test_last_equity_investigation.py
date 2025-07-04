#!/usr/bin/env python3
"""
Focused test to investigate the last_equity issue.
The problem: last_equity shows $143,910.89 but current is $153,850.05 (6.91% gap)
This suggests last_equity is stale or from an old date.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from datetime import date, datetime, timedelta

def test_last_equity_investigation():
    """Investigate why last_equity shows such old values"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🔍 LAST EQUITY INVESTIGATION for account {account_id}")
        print("=" * 80)
        
        # Get account data
        account = calc.broker_client.get_trade_account_by_id(account_id)
        
        current_equity = float(account.equity)
        last_equity = float(account.last_equity) if account.last_equity else 0
        
        print(f"\n📊 EQUITY VALUES:")
        print(f"   Current Equity: ${current_equity:,.2f}")
        print(f"   Last Equity: ${last_equity:,.2f}")
        
        if last_equity > 0:
            raw_return = current_equity - last_equity
            raw_return_pct = (raw_return / last_equity) * 100
            print(f"   Raw Difference: ${raw_return:,.2f}")
            print(f"   Raw Percentage: {raw_return_pct:.2f}%")
            
            # CRITICAL ANALYSIS
            print(f"\n🔍 ANALYSIS:")
            if abs(raw_return_pct) > 3.0:
                print(f"   🚨 PROBLEM: {raw_return_pct:.2f}% daily return is UNREALISTIC!")
                print(f"   📅 This suggests 'last_equity' is NOT from yesterday's close")
                print(f"   📅 It might be from several days ago or from account opening")
                
                # Calculate what last_equity SHOULD be for reasonable returns
                for reasonable_return in [0.5, 1.0, 1.5, 2.0]:
                    should_be = current_equity / (1 + reasonable_return/100)
                    print(f"   💡 For {reasonable_return}% return, last_equity should be: ${should_be:,.2f}")
                    
            else:
                print(f"   ✅ Return seems reasonable")
        
        # Check when the account was created/last updated
        print(f"\n📅 ACCOUNT TIMELINE:")
        print(f"   Account Status: {account.status}")
        print(f"   Account Created: {account.created_at}")
        print(f"   Trading Blocked: {account.trading_blocked}")
        
        # SOLUTION PROPOSAL
        print(f"\n💡 PROPOSED SOLUTIONS:")
        print(f"   1. 🔄 Use portfolio history API to get yesterday's actual closing value")
        print(f"   2. 📊 Use position-by-position calculation (price changes only)")
        print(f"   3. ⚠️  Ignore 'last_equity' field entirely as it's unreliable")
        print(f"   4. 🎯 For daily returns, calculate based on individual stock movements")
        
        # Test if this is a weekend/market closed issue
        today = date.today()
        weekday = today.weekday()  # 0=Monday, 6=Sunday
        print(f"\n📅 MARKET STATUS:")
        print(f"   Today: {today} ({['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][weekday]})")
        
        if weekday >= 5:  # Weekend
            print(f"   🏦 Market is CLOSED (weekend)")
            print(f"   💡 'last_equity' might be from Friday's close")
        else:
            print(f"   📈 Market should be OPEN (weekday)")
            print(f"   🚨 'last_equity' should be from yesterday's close")
        
        return True
        
    except Exception as e:
        print(f"❌ Error in investigation: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_last_equity_investigation() 