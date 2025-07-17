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

# Load environment variables first, with override to ensure they're set
load_dotenv(override=True)

from alpaca.broker.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# Import shared account utilities
from utils.account_utils import get_account_id
from utils.market_data import get_stock_quote
from utils.alpaca.broker_client_factory import get_broker_client

# Configure logging
logger = logging.getLogger(__name__)

# Use centralized broker client
broker_client = get_broker_client()




@tool("execute_buy_market_order")
def execute_buy_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order BUY trade.

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to buy (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    try:
        # Validate user context first
        account_id = get_account_id(config=config)
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
        if not price or price <= 0:
            err_msg = f"Error: Unable to retrieve a valid price for {ticker}. Please try again later or check the symbol."
            logger.error(f"[Trade Agent] Invalid price for {ticker}: {price}")
            return err_msg
        
        # Calculate approximate shares
        approximate_shares = notional_amount / price
        
        # Create detailed confirmation prompt
        confirmation_prompt = (
            f"TRADE CONFIRMATION REQUIRED\n\n"
            f"• BUY ${notional_amount_formatted} of {ticker}\n"
            f"• Current Price: ${price:.2f} per share\n"
            f"• Approximate Shares: {approximate_shares:.2f} shares\n"
            f"• Order Type: Market Order (executed at current market price)\n\n"
            f"⚠️  IMPORTANT: Final shares and price may vary slightly due to market movements. Market orders execute immediately at the best available price.\n"
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
            
    except ValueError as e:
        logger.error(f"[Trade Agent] Account identification error: {e}")
        return f"""🚫 **Authentication Error**

Could not securely identify your account for this trade. This is a security protection to prevent unauthorized trading.

**Error Details:** {str(e)}

💡 **Next Steps:**
• Please log out and log back in
• Ensure you have completed account setup
• Contact support if the issue persists

**Security Note:** This error prevents unauthorized access to trading functions."""


@tool("execute_sell_market_order")
def execute_sell_market_order(ticker: str, notional_amount: float, state=None, config=None) -> str:
    """Execute a market order SELL trade.

    Inputs:
        ticker: str - The stock symbol (e.g., 'AAPL')
        notional_amount: float - The dollar amount to sell (min $1.00)
        state: Graph state (passed automatically).
        config: Run configuration (passed automatically).
    """
    try:
        # Validate user context first
        account_id = get_account_id(config=config)
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
        if not price or price <= 0:
            err_msg = f"Error: Unable to retrieve a valid price for {ticker}. Please try again later or check the symbol."
            logger.error(f"[Trade Agent] Invalid price for {ticker}: {price}")
            return err_msg
        
        # Calculate approximate shares
        approximate_shares = notional_amount / price
        
        # Create detailed confirmation prompt
        confirmation_prompt = (
            f"TRADE CONFIRMATION REQUIRED\n\n"
            f"• SELL ${notional_amount_formatted} of {ticker}\n"
            f"• Current Price: ${price:.2f} per share\n"
            f"• Approximate Shares: {approximate_shares:.2f} shares\n"
            f"• Order Type: Market Order (executed at current market price)\n\n"
            f"⚠️  IMPORTANT: Final shares and price may vary slightly due to market movements. Market orders execute immediately at the best available price.\n"
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
            
    except ValueError as e:
        logger.error(f"[Trade Agent] Account identification error: {e}")
        return f"""🚫 **Authentication Error**

Could not securely identify your account for this trade. This is a security protection to prevent unauthorized trading.

**Error Details:** {str(e)}

💡 **Next Steps:**
• Please log out and log back in
• Ensure you have completed account setup
• Contact support if the issue persists

**Security Note:** This error prevents unauthorized access to trading functions."""


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
        return f"Trade submitted successfully: {order_type} order for ${notional_amount:.2f} of {ticker}. You can monitor the status in your Portfolio page."
    except Exception as e:
        logger.error(f"[Trade Agent] Alpaca API error submitting order for {ticker}: {e}", exc_info=True)
        raise e  # Re-raise for specific handling in calling tool
