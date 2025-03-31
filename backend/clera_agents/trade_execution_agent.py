#trade_execution_agent.py

# Import necessary libraries
from langchain_core.tools import tool
from langgraph.types import interrupt

import os
import logging
from dotenv import load_dotenv

from alpaca.broker.client import BrokerClient
from alpaca.broker.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# Import our Supabase helper
from utils.supabase import get_user_alpaca_account_id

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

def get_account_id(state=None) -> str:
    """Get the account ID for the human.
    
    Args:
        state: Optional state dictionary that may contain account_id or user_id
        
    Returns:
        str: Account ID to use for operations
    """
    global _LAST_VALID_ACCOUNT_ID, _LAST_VALID_USER_ID
    
    # Default fallback account ID - only used in extreme failure cases
    fallback_account_id = "4a045111-ef77-46aa-9f33-6002703376f6" # static account id for testing
    
    # ---- STRATEGY 1: Use valid state if available ----
    if state and isinstance(state, dict):
        # Update the module-level variables if we have valid data
        if state.get("account_id"):
            _LAST_VALID_ACCOUNT_ID = state.get("account_id")
            logger.info(f"Updated last valid account_id from state: {_LAST_VALID_ACCOUNT_ID}")
            
        if state.get("user_id"):
            _LAST_VALID_USER_ID = state.get("user_id")
            logger.info(f"Updated last valid user_id from state: {_LAST_VALID_USER_ID}")
            
        # Direct account_id from state takes precedence
        if state.get("account_id"):
            return state.get("account_id")
            
        # Use user_id from state to get account_id
        if state.get("user_id"):
            db_account_id = get_user_alpaca_account_id(state.get("user_id"))
            if db_account_id:
                _LAST_VALID_ACCOUNT_ID = db_account_id
                return db_account_id
    else:
        logger.warning("Invalid state provided to get_account_id: state is None or not a dictionary")
    
    # ---- STRATEGY 2: Use last known valid account_id ----
    if _LAST_VALID_ACCOUNT_ID:
        logger.info(f"Using last known valid account_id: {_LAST_VALID_ACCOUNT_ID}")
        return _LAST_VALID_ACCOUNT_ID
        
    # ---- STRATEGY 3: Try to get account_id from last known user_id ----
    if _LAST_VALID_USER_ID:
        logger.info(f"Attempting to get account_id for last known user_id: {_LAST_VALID_USER_ID}")
        db_account_id = get_user_alpaca_account_id(_LAST_VALID_USER_ID)
        if db_account_id:
            _LAST_VALID_ACCOUNT_ID = db_account_id
            return db_account_id
    
    # ---- FALLBACK: Last resort fallback account_id ----
    logger.error("CRITICAL: Using fallback account_id - all retrieval strategies failed")
    return fallback_account_id


@tool("execute_buy_market_order")
def execute_buy_market_order(account_id: str, ticker: str, notional_amount: float, state=None) -> str:
    """Execute a market order trade.

    Inputs:
        account_id: str | UUID (can be "auto" to use state account_id)
        ticker: str
        notional_amount: float
        state: Optional state dictionary that may contain account_id
    """
    # If account_id is "auto", get it from state
    if account_id == "auto" and state:
        account_id = get_account_id(state)
    
    # Validate notional amount
    if notional_amount < 1:
        return f"Error: Notional amount must be at least $1. You provided ${notional_amount}."
    
    # Validate ticker format
    ticker = ticker.strip().upper()  # Normalize ticker
    
    # Potential interruption point with clear trade details
    og_user_confirmation = interrupt(
        f"TRADE CONFIRMATION REQUIRED: Buy ${notional_amount} worth of {ticker}.\n\n"
        f"Please confirm with 'yes' to execute or 'no' to cancel this trade."
    )
    
    # Process user confirmation safely
    user_confirmation = str(og_user_confirmation).lower().strip()
    
    # Check if the user rejected the trade
    if any(rejection in user_confirmation for rejection in ["no", "nah", "nope", "cancel", "reject"]):
        return "Trade canceled: You chose not to proceed with this transaction."
    
    # Check for explicit confirmation
    if not any(approval in user_confirmation for approval in ["yes", "approve", "confirm", "execute", "proceed"]):
        return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

    # Submit the order
    try:
        return _submit_market_order(account_id, ticker, notional_amount, OrderSide.BUY)
    except Exception as e:
        return f"❌ Error executing trade: {str(e)}. Please verify the ticker symbol and try again."


@tool("execute_sell_market_order")
def execute_sell_market_order(account_id: str, ticker: str, notional_amount: float, state=None) -> str:
    """Execute a market order trade.

    Inputs:
        account_id: str | UUID (can be "auto" to use state account_id)
        ticker: str
        notional_amount: float
        state: Optional state dictionary that may contain account_id
    """
    # If account_id is "auto", get it from state
    if account_id == "auto" and state:
        account_id = get_account_id(state)
    
    # Validate notional amount
    if notional_amount < 1:
        return f"Error: Notional amount must be at least $1. You provided ${notional_amount}."
    
    # Validate ticker format
    ticker = ticker.strip().upper()  # Normalize ticker
    
    # Potential interruption point with clear trade details
    og_user_confirmation = interrupt(
        f"TRADE CONFIRMATION REQUIRED: Sell ${notional_amount} worth of {ticker}.\n\n"
        f"Please confirm with 'yes' to execute or 'no' to cancel this trade."
    )
    
    # Process user confirmation safely
    user_confirmation = str(og_user_confirmation).lower().strip()
    
    # Check if the user rejected the trade
    if any(rejection in user_confirmation for rejection in ["no", "nah", "nope", "cancel", "reject"]):
        return "Trade canceled: You chose not to proceed with this transaction."
    
    # Check for explicit confirmation
    if not any(approval in user_confirmation for approval in ["yes", "approve", "confirm", "execute", "proceed"]):
        return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

    # Submit the order
    try:
        return _submit_market_order(account_id, ticker, notional_amount, OrderSide.SELL)
    except Exception as e:
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
        return f"✅ Trade executed successfully: {order_type} order for ${notional_amount} of {ticker}. Order details: {market_order}."
    except Exception as e:
        raise e  # Re-raise to be handled by the calling function
