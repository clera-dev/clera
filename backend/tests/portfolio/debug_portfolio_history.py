#!/usr/bin/env python3
"""
Debug script for portfolio history API to understand why it's not returning data
"""

import sys
sys.path.append('.')

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from alpaca.trading.requests import GetPortfolioHistoryRequest
import os

def get_portfolio_history_data(calculator, account_id, history_filter=None):
    try:
        return calculator.broker_client.get_portfolio_history_for_account(
            account_id=account_id,
            history_filter=history_filter
        )
    except Exception as e:
        return {"error": str(e)}

def format_portfolio_history_output(data):
    if isinstance(data, dict) and "error" in data:
        return f"Error fetching portfolio history: {data['error']}"
    output = []
    output.append(f"   Type: {type(data)}")
    if hasattr(data, '__dict__'):
        for attr, value in data.__dict__.items():
            if attr != 'history_filter':
                output.append(f"   {attr}: {value}")
    if hasattr(data, 'profit_loss') and data.profit_loss:
        output.append(f"✅ Found profit_loss data: {data.profit_loss}")
        if len(data.profit_loss) > 0:
            latest_pnl = data.profit_loss[-1]
            output.append(f"🎯 Latest P&L: ${latest_pnl}")
    else:
        output.append(f"❌ No profit_loss data in response")
    return '\n'.join(output)

def debug_portfolio_history():
    """Debug the portfolio history API call"""
    try:
        account_id = os.getenv('TEST_ALPACA_ACCOUNT_ID')
        if not account_id:
            raise RuntimeError("TEST_ALPACA_ACCOUNT_ID environment variable must be set for this test.")
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        print(f"🔍 Debugging portfolio history for account {account_id}")
        periods_to_try = ["1D", "2D", "1W", "1M"]
        for period in periods_to_try:
            print(f"\n📅 Trying period: {period}")
            history_request = GetPortfolioHistoryRequest(
                period=period,
                timeframe="1D",
                pnl_reset="no_reset",
                intraday_reporting="market_hours"
            )
            data = get_portfolio_history_data(calc, account_id, history_request)
            output = format_portfolio_history_output(data)
            print(output)
            if hasattr(data, 'profit_loss') and data.profit_loss and len(data.profit_loss) > 0:
                break
        print(f"\n🔄 Trying without request filter...")
        data = get_portfolio_history_data(calc, account_id)
        print(format_portfolio_history_output(data))
        print(f"\n📋 Account details for comparison:")
        try:
            account = calc.broker_client.get_trade_account_by_id(account_id)
            print(f"   Current equity: ${float(account.equity):.2f}")
            print(f"   Last equity: ${float(account.last_equity):.2f}")
            print(f"   Cash: ${float(account.cash):.2f}")
            print(f"   Portfolio value: ${float(account.portfolio_value):.2f}")
        except Exception as e:
            print(f"❌ Error fetching account details: {e}")
    except Exception as e:
        print(f"❌ Error during debug: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_portfolio_history() 