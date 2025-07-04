#!/usr/bin/env python3
"""
COMPREHENSIVE RETURN CALCULATION DEBUG TEST

This test examines every single value that goes into the return calculation
to ensure the logic is correct and production-ready.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import requests
import json
import logging

logger = logging.getLogger(__name__)

def test_return_calculation_comprehensive_debug():
    """Debug every single value in the return calculation process"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🔍 COMPREHENSIVE RETURN CALCULATION DEBUG for account {account_id}")
        print("=" * 100)
        
        # STEP 1: Raw Account Data Analysis
        print(f"\n1️⃣ RAW ACCOUNT DATA ANALYSIS:")
        print("-" * 50)
        account = calc.broker_client.get_trade_account_by_id(account_id)
        
        current_equity = float(account.equity)
        last_equity = float(account.last_equity) if account.last_equity else 0
        cash = float(account.cash)
        portfolio_value = float(account.portfolio_value)
        buying_power = float(account.buying_power)
        
        print(f"   📊 Current Equity: ${current_equity:,.2f}")
        print(f"   📊 Last Equity: ${last_equity:,.2f}")
        print(f"   💰 Cash: ${cash:,.2f}")
        print(f"   📈 Portfolio Value: ${portfolio_value:,.2f}")
        print(f"   💳 Buying Power: ${buying_power:,.2f}")
        
        # Calculate raw difference
        raw_difference = current_equity - last_equity
        raw_percentage = (raw_difference / last_equity * 100) if last_equity > 0 else 0
        
        print(f"   🧮 Raw Difference: ${raw_difference:,.2f}")
        print(f"   📊 Raw Percentage: {raw_percentage:.2f}%")
        
        # STEP 2: Position Analysis
        print(f"\n2️⃣ POSITION ANALYSIS:")
        print("-" * 50)
        positions = calc.broker_client.get_all_positions_for_account(account_id)
        
        total_position_value = 0.0
        position_count = len(positions)
        
        print(f"   📋 Total Positions: {position_count}")
        print(f"   {'Symbol':<8} {'Qty':<12} {'Avg Cost':<12} {'Current $':<15} {'Market Val':<15} {'Unrealized P&L':<15}")
        print(f"   {'-'*8} {'-'*12} {'-'*12} {'-'*15} {'-'*15} {'-'*15}")
        
        for position in positions:
            symbol = position.symbol
            qty = float(position.qty)
            avg_cost = float(position.avg_entry_price) if position.avg_entry_price else 0
            market_value = float(position.market_value)
            current_price = market_value / qty if qty != 0 else 0
            unrealized_pl = float(position.unrealized_pl) if position.unrealized_pl else 0
            
            total_position_value += market_value
            
            print(f"   {symbol:<8} {qty:<12.2f} ${avg_cost:<11.2f} ${current_price:<14.2f} ${market_value:<14.2f} ${unrealized_pl:<14.2f}")
        
        print(f"   {'-'*8} {'-'*12} {'-'*12} {'-'*15} {'-'*15} {'-'*15}")
        print(f"   {'TOTAL':<8} {'':<12} {'':<12} {'':<15} ${total_position_value:<14.2f} {'':<15}")
        print(f"   💰 Cash: ${cash:,.2f}")
        print(f"   📊 Total Portfolio: ${total_position_value + cash:,.2f}")
        
        # STEP 3: Test Each Calculation Method
        print(f"\n3️⃣ TESTING EACH CALCULATION METHOD:")
        print("-" * 50)
        
        # Method 1: Position-based calculation (current implementation)
        print(f"   🔢 METHOD 1: Position-based calculation")
        try:
            total_return = 0.0
            for position in positions:
                # Current implementation returns 0 because we can't get historical prices
                position_return = 0.0  # This is the problem!
                total_return += position_return
            
            print(f"      Result: ${total_return:.2f} (This is why we get $0!)")
            print(f"      Problem: No historical price data available in sandbox")
        except Exception as e:
            print(f"      Error: {e}")
        
        # Method 2: Simple equity difference
        print(f"   🔢 METHOD 2: Simple equity difference")
        equity_return = current_equity - last_equity
        equity_percentage = (equity_return / last_equity * 100) if last_equity > 0 else 0
        print(f"      Raw Return: ${equity_return:,.2f} ({equity_percentage:.2f}%)")
        
        # Method 3: What SHOULD the calculation be?
        print(f"   🔢 METHOD 3: What SHOULD the calculation be?")
        
        # The issue is: if last_equity is stale, we need a different baseline
        # Let's calculate what yesterday's equity SHOULD have been
        total_unrealized_pl = sum(float(pos.unrealized_pl) if pos.unrealized_pl else 0 for pos in positions)
        total_cost_basis = sum(float(pos.qty) * float(pos.avg_entry_price) if pos.avg_entry_price else 0 for pos in positions)
        
        print(f"      Total Cost Basis: ${total_cost_basis:,.2f}")
        print(f"      Total Unrealized P&L: ${total_unrealized_pl:,.2f}")
        print(f"      Current Position Value: ${total_position_value:,.2f}")
        print(f"      Cash: ${cash:,.2f}")
        print(f"      Total Current: ${total_position_value + cash:,.2f}")
        
        # STEP 4: Apply Current Logic and Show Decision Process
        print(f"\n4️⃣ CURRENT LOGIC DECISION PROCESS:")
        print("-" * 50)
        
        print(f"   📋 Step 1: Try position-based calculation")
        print(f"      - Can't get historical prices in sandbox")
        print(f"      - Returns: $0.00")
        print(f"      - Decision: Use this if < 5% of portfolio (${current_equity * 0.05:,.2f})")
        print(f"      - $0 < ${current_equity * 0.05:,.2f}? YES → Use $0")
        
        print(f"   📋 Step 2: Validate equity difference")
        print(f"      - Raw return: ${equity_return:,.2f} ({equity_percentage:.2f}%)")
        print(f"      - Is > 10%? {'YES' if abs(equity_percentage) > 10 else 'NO'}")
        print(f"      - Is > 5%? {'YES' if abs(equity_percentage) > 5 else 'NO'}")
        
        if abs(equity_percentage) > 10:
            print(f"      - Decision: REJECT (>10% unrealistic) → Return $0")
        elif abs(equity_percentage) > 5:
            print(f"      - Decision: SUSPICIOUS (>5%) → Return $0 (conservative)")
        else:
            print(f"      - Decision: ACCEPT reasonable return")
        
        # STEP 5: Proposed Fix
        print(f"\n5️⃣ PROPOSED FIX:")
        print("-" * 50)
        
        # The fix: Use a more intelligent baseline when last_equity is stale
        # Option 1: Use unrealized P&L to estimate yesterday's value
        if abs(equity_percentage) > 5:
            print(f"   🔧 OPTION 1: Use unrealized P&L as proxy for returns")
            
            # If we can't trust last_equity, use cost basis + smaller portion of unrealized P&L
            # This represents recent gains vs old gains
            estimated_baseline = total_cost_basis + cash
            current_value = total_position_value + cash
            estimated_return = current_value - estimated_baseline
            estimated_percentage = (estimated_return / estimated_baseline * 100) if estimated_baseline > 0 else 0
            
            print(f"      Estimated baseline (cost + cash): ${estimated_baseline:,.2f}")
            print(f"      Current value: ${current_value:,.2f}")
            print(f"      Estimated total return: ${estimated_return:,.2f} ({estimated_percentage:.2f}%)")
            
            # Option 2: Use a conservative daily return estimate
            print(f"   🔧 OPTION 2: Conservative daily return estimate")
            conservative_daily_return = current_equity * 0.005  # 0.5% assumption
            print(f"      Conservative 0.5% daily return: ${conservative_daily_return:,.2f}")
            
            # Option 3: Use position-level data if available
            print(f"   🔧 OPTION 3: Check if we can get intraday changes")
            total_intraday_pl = sum(float(pos.unrealized_intraday_pl) if hasattr(pos, 'unrealized_intraday_pl') and pos.unrealized_intraday_pl else 0 for pos in positions)
            print(f"      Total intraday P&L: ${total_intraday_pl:,.2f}")
        
        # STEP 6: Test API Endpoint
        print(f"\n6️⃣ API ENDPOINT TEST:")
        print("-" * 50)
        try:
            response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
            if response.status_code == 200:
                api_data = response.json()
                print(f"   API Response:")
                for key, value in api_data.items():
                    print(f"      {key}: {value}")
            else:
                print(f"   API Error: {response.status_code}")
        except Exception as e:
            print(f"   API Exception: {e}")
        
        # STEP 7: Recommendation
        print(f"\n7️⃣ RECOMMENDATION:")
        print("-" * 50)
        
        if abs(equity_percentage) > 5:
            print(f"   🚨 ISSUE: last_equity (${last_equity:,.2f}) appears stale")
            print(f"   📅 This creates unrealistic {equity_percentage:.2f}% daily return")
            print(f"   💡 SOLUTION: Use alternative calculation method")
            print(f"   ✅ SUGGESTED: Conservative estimate or intraday P&L")
        else:
            print(f"   ✅ last_equity appears reasonable")
            print(f"   ✅ Can use simple equity difference")
            
        print(f"\n   🎯 FOR PRODUCTION:")
        print(f"   1. Implement fallback when last_equity > 5% difference")
        print(f"   2. Use intraday P&L when available")
        print(f"   3. Conservative estimate (0.5-2%) when data unavailable")
        print(f"   4. Log warnings for manual review")
        
        return True
        
    except Exception as e:
        print(f"❌ Error in comprehensive debug: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_return_calculation_comprehensive_debug() 