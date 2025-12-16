# Trade Execution Agent Enhancement for SnapTrade

## Overview

This document shows how to **enhance** your existing trade execution agent to support multi-brokerage trading via SnapTrade.

## Enhanced Trade Execution Agent

Update `backend/clera_agents/trade_execution_agent.py`:

```python
# trade_execution_agent.py - ENHANCED VERSION

# Import necessary libraries
from langchain_core.tools import tool
from langgraph.types import interrupt
from langgraph.pregel import Pregel
from langgraph.config import get_config
from langchain_core.runnables.config import RunnableConfig

import os
import logging
from dotenv import load_dotenv
from typing import Optional, Dict, Any, Tuple

# Load environment variables
load_dotenv(override=True)

# SnapTrade imports
from snaptrade_client import SnapTrade
from snaptrade_client.api_client import ApiException

# Alpaca imports (keep for backward compatibility)
from alpaca.broker.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# Import shared utilities
from utils.account_utils import get_account_id
from utils.market_data import get_stock_quote
from utils.alpaca.broker_client_factory import get_broker_client

# Configure logging
logger = logging.getLogger(__name__)

# Initialize clients
broker_client = get_broker_client()  # Alpaca (for Clera brokerage)

# Initialize SnapTrade client
snaptrade_client = SnapTrade(
    consumer_key=os.getenv("SNAPTRADE_CONSUMER_KEY"),
    client_id=os.getenv("SNAPTRADE_CLIENT_ID"),
)


# =====================================================
# HELPER FUNCTIONS
# =====================================================

def get_user_portfolio_mode(user_id: str) -> Dict[str, Any]:
    """
    Determine user's portfolio mode and available trading accounts.
    
    Returns:
        {
            'mode': 'brokerage' | 'aggregation' | 'hybrid',
            'has_alpaca': bool,
            'has_snaptrade': bool,
            'alpaca_account_id': Optional[str],
            'snaptrade_accounts': List[Dict]
        }
    """
    from utils.supabase.db_client import get_supabase_client
    
    supabase = get_supabase_client()
    
    # Check for Alpaca account
    alpaca_result = supabase.table('user_onboarding')\
        .select('alpaca_account_id')\
        .eq('user_id', user_id)\
        .execute()
    
    has_alpaca = bool(alpaca_result.data and alpaca_result.data[0].get('alpaca_account_id'))
    alpaca_account_id = alpaca_result.data[0].get('alpaca_account_id') if alpaca_result.data else None
    
    # Check for SnapTrade accounts (with trade permission)
    snaptrade_result = supabase.table('user_investment_accounts')\
        .select('id, provider_account_id, institution_name, account_name, connection_type')\
        .eq('user_id', user_id)\
        .eq('provider', 'snaptrade')\
        .eq('connection_type', 'trade')\  # Only accounts with trade permission
        .eq('is_active', True)\
        .execute()
    
    snaptrade_accounts = snaptrade_result.data or []
    has_snaptrade = bool(snaptrade_accounts)
    
    # Determine mode
    if has_alpaca and has_snaptrade:
        mode = 'hybrid'
    elif has_alpaca:
        mode = 'brokerage'
    elif has_snaptrade:
        mode = 'aggregation'
    else:
        mode = 'none'
    
    return {
        'mode': mode,
        'has_alpaca': has_alpaca,
        'has_snaptrade': has_snaptrade,
        'alpaca_account_id': alpaca_account_id,
        'snaptrade_accounts': snaptrade_accounts
    }


def detect_symbol_account(symbol: str, user_id: str) -> Tuple[Optional[str], Optional[str], Optional[Dict]]:
    """
    Detect which account holds a specific symbol.
    
    Returns:
        (account_id, account_type, account_info)
        account_type: 'alpaca' | 'snaptrade'
    """
    from utils.supabase.db_client import get_supabase_client
    
    supabase = get_supabase_client()
    
    # Check aggregated holdings
    holdings_result = supabase.table('user_aggregated_holdings')\
        .select('accounts, provider_account_id')\
        .eq('user_id', user_id)\
        .eq('symbol', symbol)\
        .execute()
    
    if not holdings_result.data:
        return None, None, None
    
    # Get account information from holdings
    holding = holdings_result.data[0]
    accounts_data = holding.get('accounts', [])
    
    if not accounts_data:
        return None, None, None
    
    # Prefer SnapTrade accounts with trade permission, then Alpaca
    for acc in accounts_data:
        account_id = acc.get('account_id', '')
        
        if account_id.startswith('snaptrade_'):
            # Check if this account has trade permission
            account_info = supabase.table('user_investment_accounts')\
                .select('*')\
                .eq('provider_account_id', account_id.replace('snaptrade_', ''))\
                .eq('connection_type', 'trade')\
                .execute()
            
            if account_info.data:
                return account_id, 'snaptrade', account_info.data[0]
        
        elif account_id == 'alpaca':
            portfolio_mode = get_user_portfolio_mode(user_id)
            if portfolio_mode['has_alpaca']:
                return portfolio_mode['alpaca_account_id'], 'alpaca', None
    
    return None, None, None


def get_snaptrade_user_credentials(user_id: str) -> Optional[Dict[str, str]]:
    """Get SnapTrade user credentials from database."""
    from utils.supabase.db_client import get_supabase_client
    
    supabase = get_supabase_client()
    result = supabase.table('snaptrade_users')\
        .select('snaptrade_user_id, snaptrade_user_secret')\
        .eq('user_id', user_id)\
        .execute()
    
    if not result.data:
        return None
    
    return {
        'user_id': result.data[0]['snaptrade_user_id'],
        'user_secret': result.data[0]['snaptrade_user_secret']
    }


# =====================================================
# TRADE EXECUTION TOOLS
# =====================================================

@tool("execute_buy_market_order")
def execute_buy_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order BUY trade.
    
    This tool automatically detects which brokerage account holds the symbol
    and executes the trade on the appropriate platform (Alpaca or SnapTrade).

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to buy (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    try:
        # Get user context
        from utils.account_utils import get_user_id_from_config
        user_id = get_user_id_from_config(config)
        
        logger.info(f"[Trade Agent] Initiating BUY for {ticker} (${notional_amount}) for user {user_id}")

        # Validate inputs
        if not isinstance(notional_amount, (int, float)) or notional_amount < 1:
            return f"Error: Invalid notional amount '{notional_amount}'. It must be at least $1.00."

        ticker = str(ticker).strip().upper()
        if not ticker or not ticker.isalnum():
            return f"Error: Invalid ticker symbol '{ticker}'."

        notional_amount_formatted = f"{notional_amount:.2f}"

        # Get stock quote
        stock_quote = get_stock_quote(ticker)
        price = stock_quote[0]['price']
        if not price or price <= 0:
            return f"Error: Unable to retrieve a valid price for {ticker}."
        
        approximate_shares = notional_amount / price
        
        # Detect which account can trade this symbol
        account_id, account_type, account_info = detect_symbol_account(ticker, user_id)
        
        if not account_id:
            # Symbol not found in user's holdings, check portfolio mode
            portfolio_mode = get_user_portfolio_mode(user_id)
            
            if portfolio_mode['has_alpaca']:
                # User has Alpaca account, can trade any symbol
                account_id = portfolio_mode['alpaca_account_id']
                account_type = 'alpaca'
            elif portfolio_mode['has_snaptrade']:
                # User has SnapTrade accounts, need to pick one
                # For now, use first available account with trade permission
                # TODO: Could prompt user to select account
                account_type = 'snaptrade'
                account_id = portfolio_mode['snaptrade_accounts'][0]['provider_account_id']
                account_info = portfolio_mode['snaptrade_accounts'][0]
            else:
                return "❌ Error: No trading accounts connected. Please connect a brokerage account first."
        
        # Create confirmation prompt with account info
        account_display = "Clera Brokerage" if account_type == 'alpaca' else f"{account_info.get('institution_name', 'Unknown')} - {account_info.get('account_name', 'Unknown')}"
        
        confirmation_prompt = (
            f"TRADE CONFIRMATION REQUIRED\n\n"
            f"• BUY ${notional_amount_formatted} of {ticker}\n"
            f"• Trading Account: {account_display}\n"
            f"• Current Price: ${price:.2f} per share\n"
            f"• Approximate Shares: {approximate_shares:.2f} shares\n"
            f"• Order Type: Market Order (executed at current market price)\n\n"
            f"⚠️ IMPORTANT: Final shares and price may vary slightly due to market movements.\n"
            f"Please confirm with 'Yes' to execute or 'No' to cancel this trade."
        )
        
        og_user_confirmation = interrupt(confirmation_prompt)
        user_confirmation = str(og_user_confirmation).lower().strip()
        logger.info(f"[Trade Agent] Received confirmation: '{user_confirmation}'")

        # Check rejection
        if any(rejection in user_confirmation for rejection in ["no", "nah", "nope", "cancel", "reject", "deny"]):
            logger.info(f"[Trade Agent] Trade CANCELED by user")
            return "Trade canceled: You chose not to proceed with this transaction."

        # Check explicit confirmation
        if not any(approval in user_confirmation for approval in ["yes", "approve", "confirm", "execute", "proceed", "ok"]):
            return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

        # Execute trade based on account type
        if account_type == 'alpaca':
            logger.info(f"[Trade Agent] Executing via Alpaca")
            result = _submit_alpaca_market_order(account_id, ticker, notional_amount, OrderSide.BUY)
        else:  # snaptrade
            logger.info(f"[Trade Agent] Executing via SnapTrade")
            result = _submit_snaptrade_market_order(user_id, account_id, ticker, notional_amount, 'BUY')
        
        logger.info(f"[Trade Agent] BUY order result: {result}")
        return result
            
    except Exception as e:
        logger.error(f"[Trade Agent] Error executing BUY order: {e}", exc_info=True)
        return "❌ Error executing trade. Please verify the ticker symbol and try again."


@tool("execute_sell_market_order")
def execute_sell_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order SELL trade.
    
    This tool automatically detects which brokerage account holds the symbol
    and executes the trade on the appropriate platform (Alpaca or SnapTrade).

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to sell (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    try:
        # Get user context
        from utils.account_utils import get_user_id_from_config
        user_id = get_user_id_from_config(config)
        
        logger.info(f"[Trade Agent] Initiating SELL for {ticker} (${notional_amount}) for user {user_id}")

        # Validate inputs
        if not isinstance(notional_amount, (int, float)) or notional_amount < 1:
            return f"Error: Invalid notional amount '{notional_amount}'. It must be at least $1.00."

        ticker = str(ticker).strip().upper()
        if not ticker or not ticker.isalnum():
            return f"Error: Invalid ticker symbol '{ticker}'."

        notional_amount_formatted = f"{notional_amount:.2f}"

        # Get stock quote
        stock_quote = get_stock_quote(ticker)
        price = stock_quote[0]['price']
        if not price or price <= 0:
            return f"Error: Unable to retrieve a valid price for {ticker}."
        
        approximate_shares = notional_amount / price
        
        # CRITICAL: For SELL orders, we MUST detect which account holds the symbol
        account_id, account_type, account_info = detect_symbol_account(ticker, user_id)
        
        if not account_id:
            return f"❌ Error: You don't hold {ticker} in any of your trading accounts. Cannot execute SELL order."
        
        # Create confirmation prompt with account info
        account_display = "Clera Brokerage" if account_type == 'alpaca' else f"{account_info.get('institution_name', 'Unknown')} - {account_info.get('account_name', 'Unknown')}"
        
        confirmation_prompt = (
            f"TRADE CONFIRMATION REQUIRED\n\n"
            f"• SELL ${notional_amount_formatted} of {ticker}\n"
            f"• Trading Account: {account_display}\n"
            f"• Current Price: ${price:.2f} per share\n"
            f"• Approximate Shares: {approximate_shares:.2f} shares\n"
            f"• Order Type: Market Order (executed at current market price)\n\n"
            f"⚠️ IMPORTANT: Final shares and price may vary slightly due to market movements.\n"
            f"Please confirm with 'Yes' to execute or 'No' to cancel this trade."
        )
        
        og_user_confirmation = interrupt(confirmation_prompt)
        user_confirmation = str(og_user_confirmation).lower().strip()
        logger.info(f"[Trade Agent] Received confirmation: '{user_confirmation}'")

        # Check rejection
        if any(rejection in user_confirmation for rejection in ["no", "nah", "nope", "cancel", "reject", "deny"]):
            logger.info(f"[Trade Agent] Trade CANCELED by user")
            return "Trade canceled: You chose not to proceed with this transaction."

        # Check explicit confirmation
        if not any(approval in user_confirmation for approval in ["yes", "approve", "confirm", "execute", "proceed", "ok"]):
            return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

        # Execute trade based on account type
        if account_type == 'alpaca':
            logger.info(f"[Trade Agent] Executing SELL via Alpaca")
            result = _submit_alpaca_market_order(account_id, ticker, notional_amount, OrderSide.SELL)
        else:  # snaptrade
            logger.info(f"[Trade Agent] Executing SELL via SnapTrade")
            result = _submit_snaptrade_market_order(user_id, account_id, ticker, notional_amount, 'SELL')
        
        logger.info(f"[Trade Agent] SELL order result: {result}")
        return result
            
    except Exception as e:
        logger.error(f"[Trade Agent] Error executing SELL order: {e}", exc_info=True)
        return "❌ Error executing trade. Please verify the ticker symbol and try again."


# =====================================================
# EXECUTION FUNCTIONS
# =====================================================

def _submit_alpaca_market_order(account_id: str, ticker: str, notional_amount: float, side: OrderSide) -> str:
    """Submit market order via Alpaca (existing implementation)."""
    try:
        market_order_data = MarketOrderRequest(
            symbol=ticker,
            notional=notional_amount,
            side=side,
            time_in_force=TimeInForce.DAY,
            commission=0
        )

        market_order = broker_client.submit_order_for_account(
            account_id=account_id,
            order_data=market_order_data
        )
        
        order_type = "BUY" if side == OrderSide.BUY else "SELL"
        return f"✅ Trade submitted successfully via Clera Brokerage: {order_type} order for ${notional_amount:.2f} of {ticker}. You can monitor the status in your Portfolio page."
    
    except Exception as e:
        logger.error(f"[Trade Agent] Alpaca API error: {e}", exc_info=True)
        raise e


def _submit_snaptrade_market_order(user_id: str, account_id: str, ticker: str, notional_amount: float, action: str) -> str:
    """Submit market order via SnapTrade."""
    try:
        # Get SnapTrade user credentials
        credentials = get_snaptrade_user_credentials(user_id)
        if not credentials:
            return "❌ Error: SnapTrade credentials not found. Please reconnect your brokerage account."
        
        snaptrade_user_id = credentials['user_id']
        user_secret = credentials['user_secret']
        
        # Get symbol's universal ID
        symbol_response = snaptrade_client.reference_data.get_symbols_by_ticker(
            query=ticker
        )
        
        if not symbol_response.body:
            return f"❌ Error: Symbol {ticker} not found in SnapTrade."
        
        universal_symbol_id = symbol_response.body[0]['id']
        
        # Place order using SnapTrade
        order_response = snaptrade_client.trading.place_force_order(
            account_id=account_id.replace('snaptrade_', ''),  # Remove our prefix
            user_id=snaptrade_user_id,
            user_secret=user_secret,
            action=action,
            order_type="Market",
            time_in_force="Day",
            universal_symbol_id=universal_symbol_id,
            notional_value={"amount": notional_amount, "currency": "USD"}
        )
        
        # Store order in our database
        from utils.supabase.db_client import get_supabase_client
        supabase = get_supabase_client()
        
        order_data = {
            'user_id': user_id,
            'account_id': account_id,
            'brokerage_order_id': order_response.body.get('brokerage_order_id', ''),
            'symbol': ticker,
            'universal_symbol_id': universal_symbol_id,
            'action': action,
            'order_type': 'Market',
            'time_in_force': 'Day',
            'notional_value': notional_amount,
            'status': order_response.body.get('status', 'PENDING'),
            'raw_order_data': order_response.body
        }
        
        supabase.table('snaptrade_orders').insert(order_data).execute()
        
        return f"✅ Trade submitted successfully via SnapTrade: {action} order for ${notional_amount:.2f} of {ticker}. You can monitor the status in your Portfolio page."
    
    except ApiException as e:
        logger.error(f"[Trade Agent] SnapTrade API error: {e}", exc_info=True)
        return f"❌ SnapTrade API error: {str(e)}"
    except Exception as e:
        logger.error(f"[Trade Agent] SnapTrade order error: {e}", exc_info=True)
        raise e
```

## Key Enhancements

### 1. **Multi-Brokerage Detection**
- Automatically detects which account holds a symbol
- Supports Alpaca (Clera brokerage) + SnapTrade (external brokerages)
- Intelligent routing based on holdings

### 2. **Portfolio Mode Awareness**
```python
{
    'mode': 'hybrid',  # or 'brokerage', 'aggregation'
    'has_alpaca': True,
    'has_snaptrade': True,
    'alpaca_account_id': 'xxx',
    'snaptrade_accounts': [...]
}
```

### 3. **Smart Order Routing**
- **For BUY orders**: Uses any available trading account
- **For SELL orders**: MUST use account that holds the symbol
- Clear error messages when trading not possible

### 4. **Enhanced Confirmations**
- Shows which brokerage will execute the trade
- Institution name and account details
- Price and quantity estimates

### 5. **Order Tracking**
- All SnapTrade orders stored in `snaptrade_orders` table
- Complete audit trail
- Raw API response preserved

## System Prompt Updates

Update your Portfolio Management Agent's system prompt to include:

```markdown
## Trading Execution Rules

1. **ONLY** call trade execution tools when you have CONFIRMED:
   - The exact symbol the user wants to trade
   - The dollar amount they want to trade
   - Which brokerage account will execute the trade

2. **For SELL orders**: You MUST verify the user holds the symbol in a trading account

3. **Account Detection**: The trade execution agent will automatically:
   - Detect which account holds a symbol
   - Route the order to the correct brokerage
   - Show the user which account will be used

4. **Multi-Brokerage Support**: Users may have:
   - Clera Brokerage account (via Alpaca)
   - External brokerage accounts (via SnapTrade: Schwab, Fidelity, etc.)
   - The system handles routing automatically

5. **Error Handling**: If trading fails:
   - Explain the error clearly
   - Suggest next steps (e.g., "reconnect brokerage", "check holdings")
   - Never retry automatically without user confirmation
```

## Environment Variables

Add to `.env`:

```bash
# SnapTrade API
SNAPTRADE_CONSUMER_KEY=your_consumer_key
SNAPTRADE_CLIENT_ID=your_client_id
```

## Testing the Enhanced Agent

```python
# Test script
import asyncio
from clera_agents.trade_execution_agent import (
    get_user_portfolio_mode,
    detect_symbol_account
)

async def test_enhanced_trading():
    user_id = "your-test-user-id"
    
    # Check portfolio mode
    mode = get_user_portfolio_mode(user_id)
    print(f"Portfolio Mode: {mode}")
    
    # Detect symbol account
    account_id, account_type, info = detect_symbol_account("AAPL", user_id)
    print(f"AAPL is in: {account_type} account {account_id}")

asyncio.run(test_enhanced_trading())
```

## Next Steps

1. ✅ Multi-brokerage trade execution implemented
2. ✅ Automatic account detection
3. ✅ Order tracking in database
4. ✅ Clear user confirmations

**Next**: Proceed to [06-FRONTEND-UPDATES.md](./06-FRONTEND-UPDATES.md) for UI changes.

