#!/usr/bin/env python3
"""
Comprehensive test to debug the return calculation issue.
We need to understand why we're seeing 6.91% daily returns.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from alpaca.broker.requests import GetAccountActivitiesRequest, ActivityType
from datetime import date, datetime, timedelta
import asyncio

def test_debug_return_calculation():
    """Debug the return calculation by examining all raw values"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🔍 DEBUGGING RETURN CALCULATION for account {account_id}")
        print("=" * 80)
        
        # 1. Get raw account data
        print("\n1️⃣ RAW ACCOUNT DATA:")
        account = calc.broker_client.get_trade_account_by_id(account_id)
        print(f"   Current Equity: ${float(account.equity):,.2f}")
        print(f"   Last Equity: ${float(account.last_equity) if account.last_equity else 'None':,.2f}")
        print(f"   Buying Power: ${float(account.buying_power):,.2f}")
        print(f"   Cash: ${float(account.cash):,.2f}")
        print(f"   Portfolio Value: ${float(account.portfolio_value):,.2f}")
        
        if account.last_equity:
            raw_return = float(account.equity) - float(account.last_equity)
            raw_return_pct = (raw_return / float(account.last_equity)) * 100
            print(f"   Raw Return: ${raw_return:,.2f} ({raw_return_pct:.2f}%)")
        
        # 2. Check today's deposits/withdrawals
        print(f"\n2️⃣ TODAY'S DEPOSITS/WITHDRAWALS:")
        today = date.today()
        yesterday = today - timedelta(days=1)
        
        # Get activities for today
        activities_request = GetAccountActivitiesRequest(
            activity_types=[ActivityType.CSD, ActivityType.CSW],  # Cash deposits/withdrawals
            date=today,  # Just today's activities
            page_size=100
        )
        
        activities = calc.broker_client.get_account_activities(activities_request)
        total_deposits_today = 0.0
        total_withdrawals_today = 0.0
        
        print(f"   Checking activities from {today}:")
        for activity in activities:
            activity_date = datetime.fromisoformat(activity.date.replace('Z', '+00:00')).date()
            amount = float(activity.net_amount)
            
            print(f"   {activity_date}: {activity.activity_type} - ${amount:,.2f}")
            
            if activity_date == today:
                if activity.activity_type == ActivityType.CSD and amount > 0:
                    total_deposits_today += amount
                elif activity.activity_type == ActivityType.CSW and amount < 0:
                    total_withdrawals_today += abs(amount)
        
        print(f"   Total deposits today: ${total_deposits_today:,.2f}")
        print(f"   Total withdrawals today: ${total_withdrawals_today:,.2f}")
        print(f"   Net cash flow today: ${total_deposits_today - total_withdrawals_today:,.2f}")
        
        # 3. Calculate what the return SHOULD be
        print(f"\n3️⃣ CORRECTED CALCULATION:")
        if account.last_equity:
            current_equity = float(account.equity)
            last_equity = float(account.last_equity)
            
            # Subtract today's net deposits from current equity for true investment return
            adjusted_current_equity = current_equity - (total_deposits_today - total_withdrawals_today)
            true_investment_return = adjusted_current_equity - last_equity
            true_return_pct = (true_investment_return / last_equity) * 100
            
            print(f"   Last Equity (yesterday close): ${last_equity:,.2f}")
            print(f"   Current Equity (now): ${current_equity:,.2f}")
            print(f"   Less: Net deposits today: ${total_deposits_today - total_withdrawals_today:,.2f}")
            print(f"   Adjusted Current Equity: ${adjusted_current_equity:,.2f}")
            print(f"   True Investment Return: ${true_investment_return:,.2f}")
            print(f"   True Return Percentage: {true_return_pct:.2f}%")
            
            # 4. Compare with our current implementation
            print(f"\n4️⃣ CURRENT IMPLEMENTATION RESULT:")
            todays_return, portfolio_value = calc.calculate_realistic_daily_return(account_id)
            return_pct = (todays_return / (portfolio_value - todays_return)) * 100 if (portfolio_value - todays_return) > 0 else 0
            print(f"   Current Implementation Return: ${todays_return:,.2f} ({return_pct:.2f}%)")
            print(f"   Current Implementation Portfolio: ${portfolio_value:,.2f}")
            
            # 5. Analysis
            print(f"\n5️⃣ ANALYSIS:")
            if abs(true_return_pct) > 5.0:
                print("   ⚠️  WARNING: Return > 5% indicates possible issue!")
                print("   Possible causes:")
                print("   - Large untracked deposits")
                print("   - Stale last_equity value")
                print("   - Market data timing issues")
                print("   - Account transfer/rollover activity")
            else:
                print("   ✅ Return seems reasonable")
                
        return True
        
    except Exception as e:
        print(f"❌ Error in debug test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_debug_return_calculation() 