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

def test_daily_vs_total_return(calculator_factory=None):
    """Investigate if we're showing daily or total return"""
    try:
        print("🔍 INVESTIGATING: DAILY vs TOTAL RETURN")
        print("=" * 80)
        if calculator_factory is not None:
            calc = calculator_factory()
        else:
            calc = PortfolioCalculator(
                broker_api_key=os.getenv('BROKER_API_KEY'),
                broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
                sandbox=True
            )
        
        account_id = os.getenv('TEST_ALPACA_ACCOUNT_ID')
        if not account_id:
            raise RuntimeError("TEST_ALPACA_ACCOUNT_ID environment variable must be set for this test.")
        
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
            print(f"      Error analyzing account dates: {e}")
    except Exception as e:
        print(f"Test failed: {e}")
        raise

if __name__ == "__main__":
    test_daily_vs_total_return() 