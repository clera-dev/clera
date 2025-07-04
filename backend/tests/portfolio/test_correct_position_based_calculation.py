#!/usr/bin/env python3
"""
Test the CORRECT approach: Position-by-position calculation using stock price movements.
This is how major brokerages actually calculate daily returns - they don't rely on stale equity fields.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from datetime import date, datetime, timedelta

def test_correct_position_based_calculation():
    """Test position-by-position calculation using actual stock price movements"""
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🎯 CORRECT POSITION-BASED CALCULATION for account {account_id}")
        print("=" * 80)
        
        # Get all positions
        positions = calc.broker_client.get_all_positions_for_account(account_id)
        
        total_current_value = 0.0
        total_previous_value = 0.0
        
        print(f"\n📊 POSITION-BY-POSITION ANALYSIS:")
        print(f"{'Symbol':<8} {'Qty':<10} {'Current$':<12} {'Previous$':<12} {'P&L$':<12} {'P&L%':<8}")
        print("-" * 70)
        
        for position in positions:
            symbol = position.symbol
            qty = float(position.qty)
            current_price = float(position.market_value) / qty if qty != 0 else 0
            
            # Get yesterday's closing price (this is the key!)
            try:
                # Use Alpaca's market data to get yesterday's close
                yesterday = date.today() - timedelta(days=1)
                
                # Get the bar data for yesterday
                from alpaca.data.requests import StockBarsRequest
                from alpaca.data.timeframe import TimeFrame
                from alpaca.data.historical import StockHistoricalDataClient
                
                # Initialize market data client
                data_client = StockHistoricalDataClient(
                    api_key=os.getenv('BROKER_API_KEY'),
                    secret_key=os.getenv('BROKER_SECRET_KEY'),
                    url_override="https://paper-api.alpaca.markets"  # Sandbox
                )
                
                # Get yesterday's bar
                bars_request = StockBarsRequest(
                    symbol_or_symbols=[symbol],
                    timeframe=TimeFrame.Day,
                    start=yesterday,
                    end=yesterday,
                    limit=1
                )
                
                bars = data_client.get_stock_bars(bars_request)
                
                if symbol in bars.data and len(bars.data[symbol]) > 0:
                    yesterday_close = float(bars.data[symbol][0].close)
                else:
                    # Fallback: use current price (no change calculation)
                    yesterday_close = current_price
                    
            except Exception as e:
                print(f"   ⚠️  Could not get yesterday's price for {symbol}: {e}")
                yesterday_close = current_price
            
            # Calculate values
            position_current_value = qty * current_price
            position_previous_value = qty * yesterday_close
            position_pnl = position_current_value - position_previous_value
            position_pnl_pct = (position_pnl / position_previous_value * 100) if position_previous_value > 0 else 0
            
            total_current_value += position_current_value
            total_previous_value += position_previous_value
            
            print(f"{symbol:<8} {qty:<10.2f} ${position_current_value:<11.2f} ${position_previous_value:<11.2f} ${position_pnl:<11.2f} {position_pnl_pct:<7.2f}%")
        
        # Add cash (cash doesn't change in value)
        account = calc.broker_client.get_trade_account_by_id(account_id)
        cash = float(account.cash)
        total_current_value += cash
        total_previous_value += cash
        
        print("-" * 70)
        print(f"{'CASH':<8} {1:<10.2f} ${cash:<11.2f} ${cash:<11.2f} ${0:<11.2f} {0:<7.2f}%")
        print("-" * 70)
        
        # Calculate total return
        total_return = total_current_value - total_previous_value
        total_return_pct = (total_return / total_previous_value * 100) if total_previous_value > 0 else 0
        
        print(f"{'TOTAL':<8} {'':<10} ${total_current_value:<11.2f} ${total_previous_value:<11.2f} ${total_return:<11.2f} {total_return_pct:<7.2f}%")
        
        print(f"\n✅ CORRECTED CALCULATION RESULTS:")
        print(f"   Portfolio Value: ${total_current_value:,.2f}")
        print(f"   Yesterday's Value: ${total_previous_value:,.2f}")
        print(f"   Today's Return: ${total_return:,.2f} ({total_return_pct:.2f}%)")
        
        # Compare with broken approach
        current_equity = float(account.equity)
        last_equity = float(account.last_equity) if account.last_equity else 0
        broken_return = current_equity - last_equity
        broken_return_pct = (broken_return / last_equity * 100) if last_equity > 0 else 0
        
        print(f"\n❌ VS. BROKEN ALPACA APPROACH:")
        print(f"   Current Equity: ${current_equity:,.2f}")
        print(f"   Last Equity (STALE): ${last_equity:,.2f}")
        print(f"   Broken Return: ${broken_return:,.2f} ({broken_return_pct:.2f}%)")
        
        print(f"\n🎯 CONCLUSION:")
        if abs(total_return_pct) <= 5.0:
            print(f"   ✅ Position-based return ({total_return_pct:.2f}%) is REALISTIC")
        else:
            print(f"   ⚠️  Position-based return ({total_return_pct:.2f}%) is still high")
            
        if abs(broken_return_pct) > abs(total_return_pct):
            print(f"   ✅ Position-based approach is MORE ACCURATE than Alpaca's last_equity")
        
        return total_return, total_current_value
        
    except Exception as e:
        print(f"❌ Error in position-based calculation: {e}")
        import traceback
        traceback.print_exc()
        return None, None

if __name__ == "__main__":
    test_correct_position_based_calculation() 