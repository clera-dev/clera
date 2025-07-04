#!/usr/bin/env python3
"""
TEST: Daily Return vs Total Return Investigation

This test investigates whether we're showing actual TODAY'S return
or accidentally showing total return since some older date.

A 6.90% daily return is extremely suspicious and likely indicates
we're calculating return over multiple days, not just today.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from datetime import datetime, date
import json

def test_daily_vs_total_return():
    """Investigate if we're showing daily or total return"""
    try:
        print("🔍 INVESTIGATING: DAILY vs TOTAL RETURN")
        print("=" * 80)
        
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        
        print(f"\n1️⃣ ACCOUNT EQUITY ANALYSIS:")
        print("-" * 50)
        
        account = calc.broker_client.get_trade_account_by_id(account_id)
        current_equity = float(account.equity)
        last_equity = float(account.last_equity) if account.last_equity else 0
        raw_return = current_equity - last_equity
        raw_return_pct = (raw_return / last_equity * 100) if last_equity > 0 else 0
        
        print(f"   Current Equity: ${current_equity:,.2f}")
        print(f"   Last Equity: ${last_equity:,.2f}")
        print(f"   Raw Difference: ${raw_return:,.2f}")
        print(f"   Raw Percentage: {raw_return_pct:.2f}%")
        
        # Check if last_equity has a timestamp or creation date
        print(f"\n   🕒 LAST EQUITY ANALYSIS:")
        try:
            # Check account creation date
            print(f"      Account Status: {account.status}")
            if hasattr(account, 'created_at'):
                print(f"      Account Created: {account.created_at}")
            if hasattr(account, 'updated_at'):
                print(f"      Account Updated: {account.updated_at}")
        except Exception as e:
            print(f"      Account timestamp info not available: {e}")
        
        print(f"\n2️⃣ POSITION-LEVEL ANALYSIS:")
        print("-" * 50)
        
        positions = calc.broker_client.get_all_positions_for_account(account_id)
        total_unrealized_pl = 0.0
        total_unrealized_intraday_pl = 0.0
        total_market_value = 0.0
        
        print(f"   {'Symbol':<8} {'Qty':<10} {'Market Val':<12} {'Total P&L':<12} {'Intraday P&L':<12} {'Daily %':<10}")
        print(f"   {'-'*8} {'-'*10} {'-'*12} {'-'*12} {'-'*12} {'-'*10}")
        
        for position in positions:
            symbol = position.symbol
            qty = float(position.qty)
            market_value = float(position.market_value)
            unrealized_pl = float(position.unrealized_pl) if position.unrealized_pl else 0
            
            # Try to get intraday P&L if available
            intraday_pl = 0.0
            try:
                if hasattr(position, 'unrealized_intraday_pl') and position.unrealized_intraday_pl:
                    intraday_pl = float(position.unrealized_intraday_pl)
            except:
                pass
            
            # Calculate daily percentage if we have intraday data
            daily_pct = 0.0
            if intraday_pl != 0 and market_value > 0:
                daily_pct = (intraday_pl / (market_value - intraday_pl) * 100)
            
            total_unrealized_pl += unrealized_pl
            total_unrealized_intraday_pl += intraday_pl
            total_market_value += market_value
            
            print(f"   {symbol:<8} {qty:<10.2f} ${market_value:<11.2f} ${unrealized_pl:<11.2f} ${intraday_pl:<11.2f} {daily_pct:<9.2f}%")
        
        print(f"   {'-'*8} {'-'*10} {'-'*12} {'-'*12} {'-'*12} {'-'*10}")
        print(f"   {'TOTALS':<8} {'':<10} ${total_market_value:<11.2f} ${total_unrealized_pl:<11.2f} ${total_unrealized_intraday_pl:<11.2f}")
        
        print(f"\n3️⃣ RETURN CALCULATION VERIFICATION:")
        print("-" * 50)
        
        # If intraday P&L is available, that should be today's return
        if total_unrealized_intraday_pl != 0:
            intraday_pct = (total_unrealized_intraday_pl / (total_market_value - total_unrealized_intraday_pl) * 100)
            print(f"   📊 Intraday P&L (TRUE daily): ${total_unrealized_intraday_pl:.2f} ({intraday_pct:.2f}%)")
        else:
            print(f"   ⚠️  No intraday P&L data available")
        
        # Compare total unrealized P&L vs equity difference
        print(f"   📊 Total Unrealized P&L: ${total_unrealized_pl:.2f}")
        print(f"   📊 Equity Difference: ${raw_return:.2f}")
        print(f"   📊 Difference: ${abs(total_unrealized_pl - raw_return):.2f}")
        
        if abs(total_unrealized_pl - raw_return) < 100:  # Close match
            print(f"   🚨 SUSPICION: Equity difference ≈ Total P&L")
            print(f"      This suggests 'last_equity' might be from account opening!")
            print(f"      The ${raw_return:.2f} might be TOTAL return, not daily!")
        
        print(f"\n4️⃣ ACCOUNT ACTIVITY CHECK:")
        print("-" * 50)
        
        # Check recent account activities to see if there were deposits
        try:
            from alpaca.broker.requests import GetAccountActivitiesRequest
            from datetime import date, timedelta
            
            # Check today's activities
            today = date.today()
            yesterday = today - timedelta(days=1)
            
            print(f"   Checking activities for {today} and {yesterday}...")
            
            # Get activities for the past few days
            for check_date in [today, yesterday, today - timedelta(days=2)]:
                try:
                    activities = calc.broker_client.get_account_activities(
                        account_id=account_id,
                        date=check_date
                    )
                    
                    if activities:
                        print(f"   📅 {check_date}:")
                        for activity in activities[:5]:  # Show first 5
                            activity_type = getattr(activity, 'activity_type', 'Unknown')
                            net_amount = getattr(activity, 'net_amount', 0)
                            print(f"      - {activity_type}: ${net_amount}")
                    else:
                        print(f"   📅 {check_date}: No activities")
                        
                except Exception as e:
                    print(f"   📅 {check_date}: Error getting activities - {e}")
                    
        except Exception as e:
            print(f"   ❌ Could not check account activities: {e}")
        
        print(f"\n5️⃣ INVESTIGATION CONCLUSION:")
        print("-" * 50)
        
        # Analyze the evidence
        is_likely_total_return = False
        
        if raw_return_pct > 5:
            print(f"   🚨 SUSPICIOUS: {raw_return_pct:.2f}% is very high for daily return")
            is_likely_total_return = True
            
        if abs(total_unrealized_pl - raw_return) < 100:
            print(f"   🚨 SUSPICIOUS: Equity diff ≈ Total P&L suggests last_equity is stale")
            is_likely_total_return = True
            
        if total_unrealized_intraday_pl == 0:
            print(f"   ⚠️  No intraday P&L data to compare against")
        elif abs(total_unrealized_intraday_pl) < abs(raw_return) / 2:
            print(f"   🚨 SUSPICIOUS: Intraday P&L much smaller than equity diff")
            is_likely_total_return = True
        
        if is_likely_total_return:
            print(f"\n   ❌ CONCLUSION: This appears to be TOTAL RETURN, not daily!")
            print(f"   💡 SOLUTION NEEDED:")
            print(f"      1. Use position intraday P&L for true daily return")
            print(f"      2. Or get proper yesterday's closing equity")
            print(f"      3. Or calculate based on actual price movements")
        else:
            print(f"\n   ✅ CONCLUSION: This appears to be legitimate daily return")
            
        return True
        
    except Exception as e:
        print(f"❌ Error in investigation: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_daily_vs_total_return() 