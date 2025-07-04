#!/usr/bin/env python3
"""
Debug script for portfolio history API to understand why it's not returning data
"""

import sys
sys.path.append('.')

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from alpaca.trading.requests import GetPortfolioHistoryRequest
import os

def debug_portfolio_history():
    """Debug the portfolio history API call"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🔍 Debugging portfolio history for account {account_id}")
        
        # Try different period settings
        periods_to_try = ["1D", "2D", "1W", "1M"]
        
        for period in periods_to_try:
            print(f"\n📅 Trying period: {period}")
            try:
                history_request = GetPortfolioHistoryRequest(
                    period=period,
                    timeframe="1D",
                    pnl_reset="no_reset",
                    intraday_reporting="market_hours"
                )
                
                print(f"📤 Making portfolio history request...")
                portfolio_history = calc.broker_client.get_portfolio_history_for_account(
                    account_id=account_id,
                    history_filter=history_request
                )
                
                print(f"📊 Portfolio history response:")
                print(f"   Type: {type(portfolio_history)}")
                if hasattr(portfolio_history, '__dict__'):
                    for attr, value in portfolio_history.__dict__.items():
                        if attr != 'history_filter':  # Skip the filter object
                            print(f"   {attr}: {value}")
                
                if hasattr(portfolio_history, 'profit_loss') and portfolio_history.profit_loss:
                    print(f"✅ Found profit_loss data: {portfolio_history.profit_loss}")
                    if len(portfolio_history.profit_loss) > 0:
                        latest_pnl = portfolio_history.profit_loss[-1]
                        print(f"🎯 Latest P&L: ${latest_pnl}")
                        break
                else:
                    print(f"❌ No profit_loss data in response")
                    
            except Exception as e:
                print(f"❌ Error with period {period}: {e}")
        
        # Also try without any request filter
        print(f"\n🔄 Trying without request filter...")
        try:
            portfolio_history = calc.broker_client.get_portfolio_history_for_account(
                account_id=account_id
            )
            print(f"📊 Response without filter:")
            if hasattr(portfolio_history, '__dict__'):
                for attr, value in portfolio_history.__dict__.items():
                    print(f"   {attr}: {value}")
        except Exception as e:
            print(f"❌ Error without filter: {e}")
            
        # Check account details for comparison
        print(f"\n📋 Account details for comparison:")
        account = calc.broker_client.get_trade_account_by_id(account_id)
        print(f"   Current equity: ${float(account.equity):.2f}")
        print(f"   Last equity: ${float(account.last_equity):.2f}")
        print(f"   Cash: ${float(account.cash):.2f}")
        print(f"   Portfolio value: ${float(account.portfolio_value):.2f}")
        
    except Exception as e:
        print(f"❌ Error during debug: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_portfolio_history() 