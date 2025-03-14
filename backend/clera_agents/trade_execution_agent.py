#trade_execution_agent.py

# Import necessary libraries
from langchain_core.tools import tool
from langgraph.types import interrupt

import os
from dotenv import load_dotenv

from alpaca.broker.client import BrokerClient
from alpaca.broker.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

load_dotenv()

api_key = os.getenv("BROKER_API_KEY")
secret_key = os.getenv("BROKER_SECRET_KEY")


broker_client = BrokerClient(
    api_key,
    secret_key,
    sandbox=True
)

@tool("get_account_id")
def get_account_id() -> str:
    """Get the account ID for the human."""
    return "4a045111-ef77-46aa-9f33-6002703376f6" # static account id for now
    #return broker_client.get_account(os.getenv("BROKER_ACCOUNT_ID")).account_id


@tool("execute_buy_market_order")
def execute_buy_market_order(account_id: str, ticker: str, notional_amount: float) -> str: # in practice, this won't have price since we'll buy at market price automatically
    """Execute a market order trade.

    Inputs:
        account_id: str | UUID
        ticker: str
        notional_amount: float
    """
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
def execute_sell_market_order(account_id: str, ticker: str, notional_amount: float) -> str: # in practice, this won't have price since we'll buy at market price automatically
    """Execute a market order trade.

    Inputs:
        account_id: str | UUID
        ticker: str
        notional_amount: float
    """
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
