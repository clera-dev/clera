#trade_execution_agent.py

# Import necessary libraries
from langchain_core.tools import tool
from langgraph.types import interrupt
from langgraph.pregel import Pregel # Import if needed to understand config structure
from langgraph.config import get_config # Import get_config
from langchain_core.runnables.config import RunnableConfig

import os
import logging
from dotenv import load_dotenv
from typing import Optional, Dict, Any, Tuple

# Load environment variables first, with override to ensure they're set
load_dotenv(override=True)

from alpaca.broker.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# SnapTrade imports
from snaptrade_client import SnapTrade
from snaptrade_client.exceptions import ApiException as SnapTradeApiException

# Import shared account utilities
from utils.account_utils import get_account_id, get_user_id_from_config
from utils.market_data import get_stock_quote
from utils.alpaca.broker_client_factory import get_broker_client

# Import trade routing service
from clera_agents.services.trade_routing_service import TradeRoutingService

# Configure logging
logger = logging.getLogger(__name__)

# Use centralized broker client
broker_client = get_broker_client()

# Initialize SnapTrade client
snaptrade_client = SnapTrade(
    consumer_key=os.getenv("SNAPTRADE_CONSUMER_KEY"),
    client_id=os.getenv("SNAPTRADE_CLIENT_ID"),
)




@tool("execute_buy_market_order")
def execute_buy_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order BUY trade across Alpaca or SnapTrade brokerages.
    
    This tool automatically detects which brokerage account to use based on:
    - User's connected accounts
    - Existing holdings of the symbol (for consistency)
    - Trading permissions

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to buy (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    try:
        # Get user context
        user_id = get_user_id_from_config(config)
        logger.info(f"[Trade Agent] Initiating BUY for {ticker} (${notional_amount}) for user {user_id}")

        # Validate notional amount
        if not isinstance(notional_amount, (int, float)) or notional_amount < 1:
            return f"Error: Invalid notional amount '{notional_amount}'. It must be at least $1.00."

        # Validate ticker format
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
        
        # Detect which account can/should trade this symbol
        account_id, account_type, account_info = TradeRoutingService.detect_symbol_account(ticker, user_id)
        
        if not account_id:
            # Symbol not found in holdings, check portfolio mode for available trading accounts
            portfolio_mode = TradeRoutingService.get_user_portfolio_mode(user_id)
            
            if portfolio_mode['has_alpaca']:
                # Use Alpaca account
                account_id = portfolio_mode['alpaca_account_id']
                account_type = 'alpaca'
                account_display = "Clera Brokerage"
            elif portfolio_mode['has_snaptrade'] and portfolio_mode['snaptrade_accounts']:
                # Use first SnapTrade account with trade permission
                snap_acc = portfolio_mode['snaptrade_accounts'][0]
                account_id = f"snaptrade_{snap_acc['provider_account_id']}"
                account_type = 'snaptrade'
                account_info = snap_acc
                account_display = f"{snap_acc.get('institution_name', 'Unknown')} - {snap_acc.get('account_name', 'Account')}"
            else:
                return "❌ Error: No trading accounts connected. Please connect a brokerage account first."
        else:
            # Account detected from holdings
            if account_type == 'alpaca':
                account_display = "Clera Brokerage"
            else:
                account_display = f"{account_info.get('institution_name', 'Unknown')} - {account_info.get('account_name', 'Account')}"
        
        # Create confirmation prompt with account info
        confirmation_prompt = (
            f"TRADE CONFIRMATION REQUIRED\n\n"
            f"• BUY ${notional_amount_formatted} of {ticker}\n"
            f"• Trading Account: {account_display}\n"
            f"• Current Price: ${price:.2f} per share\n"
            f"• Approximate Shares: {approximate_shares:.2f} shares\n"
            f"• Order Type: Market Order\n\n"
            f"⚠️ IMPORTANT: Final shares and price may vary due to market movements.\n"
            f"Please confirm with 'Yes' to execute or 'No' to cancel."
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
        try:
            if account_type == 'alpaca':
                logger.info(f"[Trade Agent] Executing BUY via Alpaca")
                result = _submit_alpaca_market_order(account_id, ticker, notional_amount, OrderSide.BUY)
            else:  # snaptrade
                logger.info(f"[Trade Agent] Executing BUY via SnapTrade")
                result = _submit_snaptrade_market_order(user_id, account_id, ticker, notional_amount, 'BUY')
            
            logger.info(f"[Trade Agent] BUY order result: {result}")
            return result
        except Exception as e:
            logger.error(f"[Trade Agent] Error executing BUY order: {e}", exc_info=True)
            return "❌ Error executing trade. Please verify the ticker symbol and try again."
            
    except Exception as e:
        logger.error(f"[Trade Agent] Unexpected error in BUY order: {e}", exc_info=True)
        return "❌ Unexpected error. Please try again or contact support."


@tool("execute_sell_market_order")
def execute_sell_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order SELL trade across Alpaca or SnapTrade brokerages.
    
    CRITICAL: For SELL orders, we MUST detect which account holds the symbol.

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to sell (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    try:
        # Get user context
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
        
        # CRITICAL: For SELL, we MUST find which account holds the symbol
        account_id, account_type, account_info = TradeRoutingService.detect_symbol_account(ticker, user_id)
        
        if not account_id:
            return f"❌ Error: You don't hold {ticker} in any of your trading accounts. Cannot execute SELL order."
        
        # Determine account display name
        if account_type == 'alpaca':
            account_display = "Clera Brokerage"
        else:
            account_display = f"{account_info.get('institution_name', 'Unknown')} - {account_info.get('account_name', 'Account')}"
        
        # Create confirmation prompt
        confirmation_prompt = (
            f"TRADE CONFIRMATION REQUIRED\n\n"
            f"• SELL ${notional_amount_formatted} of {ticker}\n"
            f"• Trading Account: {account_display}\n"
            f"• Current Price: ${price:.2f} per share\n"
            f"• Approximate Shares: {approximate_shares:.2f} shares\n"
            f"• Order Type: Market Order\n\n"
            f"⚠️ IMPORTANT: Final shares and price may vary due to market movements.\n"
            f"Please confirm with 'Yes' to execute or 'No' to cancel."
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
        try:
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
            
    except Exception as e:
        logger.error(f"[Trade Agent] Unexpected error in SELL order: {e}", exc_info=True)
        return "❌ Unexpected error. Please try again or contact support."


def _submit_alpaca_market_order(account_id: str, ticker: str, notional_amount: float, side: OrderSide) -> str:
    """Submit market order via Alpaca (Clera brokerage)."""
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
        return f"✅ Trade submitted successfully via Clera Brokerage: {order_type} order for ${notional_amount:.2f} of {ticker}. Monitor status in your Portfolio page."
    except Exception as e:
        logger.error(f"[Trade Agent] Alpaca API error: {e}", exc_info=True)
        raise e


def _submit_snaptrade_market_order(user_id: str, account_id: str, ticker: str, notional_amount: float, action: str) -> str:
    """Submit market order via SnapTrade (external brokerages)."""
    try:
        from utils.supabase.db_client import get_supabase_client
        
        # Get SnapTrade user credentials
        credentials = TradeRoutingService.get_snaptrade_user_credentials(user_id)
        if not credentials:
            return "❌ Error: SnapTrade credentials not found. Please reconnect your brokerage account."
        
        snaptrade_user_id = credentials['user_id']
        user_secret = credentials['user_secret']
        
        # Get symbol's universal ID from SnapTrade
        logger.info(f"[Trade Agent] Looking up universal symbol ID for {ticker}")
        symbol_response = snaptrade_client.reference_data.get_symbols_by_ticker(
            query=ticker
        )
        
        if not symbol_response.body or len(symbol_response.body) == 0:
            return f"❌ Error: Symbol {ticker} not found in SnapTrade. It may not be available for trading at this brokerage."
        
        universal_symbol_id = symbol_response.body[0]['id']
        logger.info(f"[Trade Agent] Found universal symbol ID: {universal_symbol_id}")
        
        # Clean account ID (remove our prefix)
        clean_account_id = account_id.replace('snaptrade_', '')
        
        # Place order using SnapTrade
        logger.info(f"[Trade Agent] Placing {action} order via SnapTrade for {ticker}")
        order_response = snaptrade_client.trading.place_force_order(
            account_id=clean_account_id,
            user_id=snaptrade_user_id,
            user_secret=user_secret,
            action=action,
            order_type="Market",
            time_in_force="Day",
            universal_symbol_id=universal_symbol_id,
            notional_value={"amount": notional_amount, "currency": "USD"}
        )
        
        # Store order in database
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
        logger.info(f"[Trade Agent] Order stored in database")
        
        return f"✅ Trade submitted successfully via SnapTrade: {action} order for ${notional_amount:.2f} of {ticker}. Monitor status in your Portfolio page."
    
    except SnapTradeApiException as e:
        logger.error(f"[Trade Agent] SnapTrade API error: {e}", exc_info=True)
        return f"❌ SnapTrade API error: {str(e)}"
    except Exception as e:
        logger.error(f"[Trade Agent] SnapTrade order error: {e}", exc_info=True)
        raise e


def _submit_market_order(account_id: str, ticker: str, notional_amount: float, side: OrderSide) -> str:
    """
    Submit a market order to the appropriate brokerage based on account type.
    
    Args:
        account_id: The account ID (may be prefixed with 'snaptrade_' for SnapTrade accounts)
        ticker: The stock symbol to trade
        notional_amount: The dollar amount to trade
        side: OrderSide.BUY or OrderSide.SELL
        
    Returns:
        Success/error message string
    """
    try:
        # Determine if this is a SnapTrade account
        if account_id.startswith('snaptrade_'):
            # Use SnapTrade
            action = "BUY" if side == OrderSide.BUY else "SELL"
            return _submit_snaptrade_market_order(
                user_id=get_user_id_from_config(),
                account_id=account_id,
                ticker=ticker,
                notional_amount=notional_amount,
                action=action
            )
        else:
            # Use Alpaca
            return _submit_alpaca_market_order(
                account_id=account_id,
                ticker=ticker,
                notional_amount=notional_amount,
                side=side
            )
    except Exception as e:
        logger.error(f"[Trade Agent] Error in _submit_market_order: {e}", exc_info=True)
        return f"❌ Error submitting market order: {str(e)}"
