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

from alpaca.broker.client import BrokerClient
from alpaca.broker.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# Import our Supabase helper
from utils.supabase import get_user_alpaca_account_id
from .financial_analyst_agent import get_stock_quote

# Configure logging
logger = logging.getLogger(__name__)

load_dotenv()

api_key = os.getenv("BROKER_API_KEY")
secret_key = os.getenv("BROKER_SECRET_KEY")


broker_client = BrokerClient(
    api_key,
    secret_key,
    sandbox=True
)

# Module-level variable to store the last valid account ID
_LAST_VALID_ACCOUNT_ID = None
_LAST_VALID_USER_ID = None

def get_account_id(config: RunnableConfig = None) -> str:
    """Get the account ID for the human.

    Primarily uses get_config() when running in LangGraph Cloud.
    Falls back to last known ID or Supabase lookup if needed.

    Args:
        config: Optional RunnableConfig (automatically passed or retrieved).

    Returns:
        str: Account ID to use for operations.
    """
    global _LAST_VALID_ACCOUNT_ID, _LAST_VALID_USER_ID

    current_user_id = None
    current_account_id = None

    # ---- STRATEGY 1: Use get_config() (Primary for LangGraph Cloud) ----
    retrieved_config = config
    if retrieved_config is None:
        try:
            retrieved_config = get_config()
            logger.info(f"[Trade Agent] Retrieved config via get_config(): {retrieved_config}")
        except Exception as e:
            logger.warning(f"[Trade Agent] Failed to get config via get_config(), proceeding with fallback strategies: {e}")
            retrieved_config = None

    if retrieved_config and isinstance(retrieved_config.get('configurable'), dict):
        configurable = retrieved_config['configurable']
        current_account_id = configurable.get('account_id')
        current_user_id = configurable.get('user_id') # Get user_id as well

        if current_account_id:
            logger.info(f"[Trade Agent] Using account_id from config: {current_account_id}")
            _LAST_VALID_ACCOUNT_ID = current_account_id
            if current_user_id: _LAST_VALID_USER_ID = current_user_id
            return current_account_id
        elif current_user_id:
             _LAST_VALID_USER_ID = current_user_id
             logger.info(f"[Trade Agent] User ID found in config ({current_user_id}), but no account_id. Will try Supabase lookup.")
        else:
             logger.info(f"[Trade Agent] Config retrieved but lacks account_id and user_id.")
    else:
        logger.info(f"[Trade Agent] No valid config retrieved via get_config() or passed argument.")


    # ---- STRATEGY 2: Use User ID (from config if available) for Supabase Lookup ----
    if current_user_id:
        logger.info(f"[Trade Agent] Attempting Supabase lookup for user_id from config: {current_user_id}")
        try:
            db_account_id = get_user_alpaca_account_id(current_user_id)
            if db_account_id:
                logger.info(f"[Trade Agent] Found account_id via Supabase: {db_account_id}")
                _LAST_VALID_ACCOUNT_ID = db_account_id
                return db_account_id
            else:
                 logger.warning(f"[Trade Agent] Supabase lookup failed for user_id: {current_user_id}")
        except Exception as e:
            logger.error(f"[Trade Agent] Error during Supabase lookup for {current_user_id}: {e}", exc_info=True)

    # ---- STRATEGY 3: Use last known valid account_id ----
    if _LAST_VALID_ACCOUNT_ID:
        logger.info(f"[Trade Agent] Using last known valid account_id: {_LAST_VALID_ACCOUNT_ID}")
        return _LAST_VALID_ACCOUNT_ID

    # ---- STRATEGY 4: Try to get account_id from last known user_id ----
    if _LAST_VALID_USER_ID:
        logger.info(f"[Trade Agent] Attempting Supabase lookup for last known user_id: {_LAST_VALID_USER_ID}")
        try:
            db_account_id = get_user_alpaca_account_id(_LAST_VALID_USER_ID)
            if db_account_id:
                logger.info(f"[Trade Agent] Found account_id via Supabase (last known user): {db_account_id}")
                _LAST_VALID_ACCOUNT_ID = db_account_id
                return db_account_id
        except Exception as e:
             logger.error(f"[Trade Agent] Error during Supabase lookup for last known user {_LAST_VALID_USER_ID}: {e}", exc_info=True)

    # ---- FALLBACK ----
    fallback_account_id = "4a045111-ef77-46aa-9f33-6002703376f6" # static account id for testing
    logger.error("[Trade Agent] CRITICAL: Using fallback account_id - all retrieval strategies failed")
    return fallback_account_id


@tool("execute_buy_market_order")
def execute_buy_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order BUY trade.

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to buy (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    # Use combined state/config logic to get account_id
    account_id = get_account_id(config=config) # Pass config explicitly if needed by get_account_id

    logger.info(f"[Trade Agent] Initiating BUY for {ticker} (${notional_amount}) for account {account_id}")

    # Validate notional amount
    if not isinstance(notional_amount, (int, float)) or notional_amount < 1:
        err_msg = f"Error: Invalid notional amount '{notional_amount}'. It must be a number of at least $1.00."
        logger.error(f"[Trade Agent] Validation failed: {err_msg}")
        return err_msg

    # Validate ticker format (simple check)
    ticker = str(ticker).strip().upper()
    if not ticker or not ticker.isalnum(): # Basic check, might need refinement
        err_msg = f"Error: Invalid ticker symbol '{ticker}'. Please provide a valid stock symbol."
        logger.error(f"[Trade Agent] Validation failed: {err_msg}")
        return err_msg

    # Format notional amount for confirmation message
    notional_amount_formatted = f"{notional_amount:.2f}"

    # --- Interrupt for Confirmation --- 
    # Let GraphInterrupt propagate if raised by interrupt()
    stock_quote = get_stock_quote(ticker)
    price = stock_quote[0]['price']
    confirmation_prompt = (
        f"TRADE CONFIRMATION REQUIRED: Buy ${notional_amount_formatted} worth of {ticker} (current price: ${price}).\n\n"
        f"Please confirm with 'Yes' to execute or 'No' to cancel this trade."
    )
    # This call will raise GraphInterrupt if confirmation is needed
    og_user_confirmation = interrupt(confirmation_prompt)
    # --- Code below only executes after resume --- 
    
    user_confirmation = str(og_user_confirmation).lower().strip()
    logger.info(f"[Trade Agent] Received confirmation: '{user_confirmation}'")

    # Check rejection
    if any(rejection in user_confirmation for rejection in ["no", "nah", "nope", "cancel", "reject", "deny"]):
        logger.info(f"[Trade Agent] Trade CANCELED by user ({ticker} ${notional_amount_formatted})")
        return "Trade canceled: You chose not to proceed with this transaction."

    # Check explicit confirmation
    if not any(approval in user_confirmation for approval in ["yes", "approve", "confirm", "execute", "proceed", "ok"]):
        logger.warning(f"[Trade Agent] Unclear trade confirmation received: '{user_confirmation}'")
        return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

    # Submit the order (This part still needs error handling for API failures)
    try:
        logger.info(f"[Trade Agent] Submitting BUY order for {ticker} (${notional_amount_formatted})")
        result = _submit_market_order(account_id, ticker, notional_amount, OrderSide.BUY)
        logger.info(f"[Trade Agent] BUY order result: {result}")
        return result
    except Exception as e:
        logger.error(f"[Trade Agent] Error submitting BUY order for {ticker}: {e}", exc_info=True)
        return f"❌ Error executing trade: {str(e)}. Please verify the ticker symbol and try again."


@tool("execute_sell_market_order")
def execute_sell_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order SELL trade.

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to sell (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    account_id = get_account_id(config=config) # Pass config explicitly
    logger.info(f"[Trade Agent] Initiating SELL for {ticker} (${notional_amount}) for account {account_id}")

    if not isinstance(notional_amount, (int, float)) or notional_amount < 1:
        err_msg = f"Error: Invalid notional amount '{notional_amount}'. It must be a number of at least $1.00."
        logger.error(f"[Trade Agent] Validation failed: {err_msg}")
        return err_msg

    ticker = str(ticker).strip().upper()
    if not ticker or not ticker.isalnum():
        err_msg = f"Error: Invalid ticker symbol '{ticker}'. Please provide a valid stock symbol."
        logger.error(f"[Trade Agent] Validation failed: {err_msg}")
        return err_msg

    notional_amount_formatted = f"{notional_amount:.2f}"

    # --- Interrupt for Confirmation --- 
    # Let GraphInterrupt propagate if raised by interrupt()
    stock_quote = get_stock_quote(ticker)
    price = stock_quote[0]['price']
    confirmation_prompt = (
        f"TRADE CONFIRMATION REQUIRED: Sell ${notional_amount_formatted} worth of {ticker} (current price: ${price}).\n\n"
        f"Please confirm with 'Yes' to execute or 'No' to cancel this trade."
    )
    # This call will raise GraphInterrupt if confirmation is needed
    og_user_confirmation = interrupt(confirmation_prompt)
    # --- Code below only executes after resume --- 

    user_confirmation = str(og_user_confirmation).lower().strip()
    logger.info(f"[Trade Agent] Received confirmation: '{user_confirmation}'")

    if any(rejection in user_confirmation for rejection in ["no", "nah", "nope", "cancel", "reject", "deny"]):
        logger.info(f"[Trade Agent] Trade CANCELED by user ({ticker} ${notional_amount_formatted})")
        return "Trade canceled: You chose not to proceed with this transaction."

    if not any(approval in user_confirmation for approval in ["yes", "approve", "confirm", "execute", "proceed", "ok"]):
        logger.warning(f"[Trade Agent] Unclear trade confirmation received: '{user_confirmation}'")
        return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

    # Submit the order (This part still needs error handling for API failures)
    try:
        logger.info(f"[Trade Agent] Submitting SELL order for {ticker} (${notional_amount_formatted})")
        result = _submit_market_order(account_id, ticker, notional_amount, OrderSide.SELL)
        logger.info(f"[Trade Agent] SELL order result: {result}")
        return result
    except Exception as e:
        logger.error(f"[Trade Agent] Error submitting SELL order for {ticker}: {e}", exc_info=True)
        return f"❌ Error executing trade: {str(e)}. Please verify the ticker symbol and try again."


def _submit_market_order(account_id: str, ticker: str, notional_amount: float, side: OrderSide) -> str:
    """Helper function to submit a market order.
    
    Args:
        account_id: The account ID to execute the trade for
        ticker: The ticker symbol of the security
        notional_amount: The dollar amount to trade
        side: Buy or sell order side
        
    Returns:
        A string with the result of the order
    """
    try:
        market_order_data = MarketOrderRequest(
            symbol=ticker,
            notional=notional_amount,
            side=side,
            time_in_force=TimeInForce.DAY,
            commission=0  # This is the dollar value commission for the order
        )

        # Market order
        market_order = broker_client.submit_order_for_account(
            account_id=account_id,
            order_data=market_order_data
        )
        
        order_type = "BUY" if side == OrderSide.BUY else "SELL"
        return f"✅ Trade submitted successfully: {order_type} order for ${notional_amount:.2f} of {ticker}. Order ID: {market_order.id}. Status: {market_order.status}."
    except Exception as e:
        logger.error(f"[Trade Agent] Alpaca API error submitting order for {ticker}: {e}", exc_info=True)
        raise e  # Re-raise for specific handling in calling tool
