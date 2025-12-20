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
            return f"Error: Invalid dollar amount '{notional_amount}'. The user must provide a dollar amount of at least $1.00. Please ask them for a valid dollar amount to buy."

        # Validate ticker format
        ticker = str(ticker).strip().upper()
        if not ticker or not ticker.isalnum():
            return f"Error: Invalid ticker symbol '{ticker}'. Ticker symbols must be alphanumeric (e.g., 'AAPL', 'MSFT', 'GOOGL'). Please ask the user for a valid stock ticker."

        notional_amount_formatted = f"{notional_amount:.2f}"

        # Get stock quote
        stock_quote = get_stock_quote(ticker)
        price = stock_quote[0]['price']
        if not price or price <= 0:
            return f"Error: Unable to retrieve a valid price for '{ticker}'. This could mean the ticker symbol doesn't exist or is not tradable. Please verify the stock symbol with the user and try again."
        
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
                return "❌ Error: No trading accounts connected. The user needs to connect a brokerage account before they can trade. Please inform them to connect their brokerage account first via the Portfolio page."
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
            error_msg = str(e)
            logger.error(f"[Trade Agent] Error executing BUY order: {e}", exc_info=True)
            return f"❌ Error executing BUY order: {error_msg}. Please verify the ticker symbol is correct and the amount is valid, then try again."
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[Trade Agent] Unexpected error in BUY order: {e}", exc_info=True)
        return f"❌ Unexpected error during BUY order: {error_msg}. Please try again or ask the user to contact support if the issue persists."


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
            return f"Error: Invalid dollar amount '{notional_amount}'. The user must provide a dollar amount of at least $1.00. Please ask them for a valid dollar amount to sell."

        ticker = str(ticker).strip().upper()
        if not ticker or not ticker.isalnum():
            return f"Error: Invalid ticker symbol '{ticker}'. Ticker symbols must be alphanumeric (e.g., 'AAPL', 'MSFT', 'GOOGL'). Please ask the user for a valid stock ticker."

        notional_amount_formatted = f"{notional_amount:.2f}"

        # Get stock quote
        stock_quote = get_stock_quote(ticker)
        price = stock_quote[0]['price']
        if not price or price <= 0:
            return f"Error: Unable to retrieve a valid price for '{ticker}'. This could mean the ticker symbol doesn't exist or is not tradable. Please verify the stock symbol with the user and try again."
        
        approximate_shares = notional_amount / price
        
        # CRITICAL: For SELL, we MUST find which account holds the symbol
        account_id, account_type, account_info = TradeRoutingService.detect_symbol_account(ticker, user_id)
        
        if not account_id:
            return f"❌ Error: The user doesn't hold {ticker} in any of their trading accounts. Cannot execute SELL order. Please inform the user they can only sell stocks they currently own."
        
        # Determine account display name
        if account_type == 'alpaca':
            account_display = "Clera Brokerage"
        else:
            account_display = f"{account_info.get('institution_name', 'Unknown')} - {account_info.get('account_name', 'Account')}"
        
        # Create confirmation prompt
        # For SnapTrade accounts, note that selling will be converted to whole shares
        import math
        whole_shares = math.floor(approximate_shares)
        
        snaptrade_note = ""
        if account_type == 'snaptrade':
            if whole_shares == 0:
                return f"❌ Error: ${notional_amount:.2f} equals only {approximate_shares:.3f} shares of {ticker}. The user's brokerage requires selling at least 1 whole share, which costs approximately ${price:.2f}. Please ask them to increase the sell amount to at least ${price:.2f}."
            snaptrade_note = f"\n📍 Note: Your brokerage requires whole shares, so {whole_shares} share(s) will be sold.\n"
        
        confirmation_prompt = (
            f"TRADE CONFIRMATION REQUIRED\n\n"
            f"• SELL ${notional_amount_formatted} of {ticker}\n"
            f"• Trading Account: {account_display}\n"
            f"• Current Price: ${price:.2f} per share\n"
            f"• Approximate Shares: {approximate_shares:.2f} shares\n"
            f"• Order Type: Market Order\n"
            f"{snaptrade_note}\n"
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
            error_msg = str(e)
            logger.error(f"[Trade Agent] Error executing SELL order: {e}", exc_info=True)
            return f"❌ Error executing SELL order: {error_msg}. Please verify the ticker symbol is correct and the user has sufficient shares to sell."
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[Trade Agent] Unexpected error in SELL order: {e}", exc_info=True)
        return f"❌ Unexpected error during SELL order: {error_msg}. Please try again or ask the user to contact support if the issue persists."


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
    """Submit market order via SnapTrade (external brokerages).
    
    IMPORTANT: For SELL orders, many brokerages (like Webull) don't support selling
    fractional shares when you hold whole shares. This function handles that by
    converting notional amounts to whole share units for SELL orders.
    """
    import math
    try:
        from utils.supabase.db_client import get_supabase_client
        
        # Get SnapTrade user credentials
        credentials = TradeRoutingService.get_snaptrade_user_credentials(user_id)
        if not credentials:
            return "❌ Error: Brokerage connection expired or not found. The user needs to reconnect their brokerage account via the Portfolio page. Please inform them of this."
        
        snaptrade_user_id = credentials['user_id']
        user_secret = credentials['user_secret']
        
        # Get symbol's universal ID from SnapTrade
        logger.info(f"[Trade Agent] Looking up universal symbol ID for {ticker}")
        symbol_response = snaptrade_client.reference_data.get_symbols_by_ticker(
            query=ticker
        )
        
        if not symbol_response.body:
            return f"❌ Error: Symbol '{ticker}' not found. This stock may not be available for trading through the user's brokerage. Please verify the ticker symbol is correct (e.g., 'AAPL' for Apple, 'GOOGL' for Google)."
        
        # PRODUCTION-GRADE: Handle both dict and list responses from SnapTrade API
        # The API may return a single symbol dict or a list depending on version
        if isinstance(symbol_response.body, dict) and 'id' in symbol_response.body:
            universal_symbol_id = symbol_response.body['id']
        elif isinstance(symbol_response.body, list) and len(symbol_response.body) > 0:
            first_symbol = symbol_response.body[0]
            universal_symbol_id = first_symbol.get('id') if isinstance(first_symbol, dict) else first_symbol['id']
        else:
            return f"❌ Error: Symbol '{ticker}' not found. This stock may not be available for trading through the user's brokerage. Please verify the ticker symbol is correct (e.g., 'AAPL' for Apple, 'GOOGL' for Google)."
        
        logger.info(f"[Trade Agent] Found universal symbol ID: {universal_symbol_id}")
        
        # Clean account ID (remove our prefix)
        clean_account_id = account_id.replace('snaptrade_', '')
        
        # Determine order parameters based on action type
        # For SELL orders, we need to use units (whole shares) instead of notional_value
        # because many brokerages don't allow selling fractional shares from whole-share positions
        order_units = None
        order_notional = None
        
        if action == 'SELL':
            # Get current price to convert notional to units
            try:
                # Use a test order impact call to get the current price
                test_impact = snaptrade_client.trading.get_order_impact(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret,
                    account_id=clean_account_id,
                    action=action,
                    universal_symbol_id=universal_symbol_id,
                    order_type="Market",
                    time_in_force="Day",
                    units=0.001  # Tiny amount just to get price
                )
                current_price = test_impact.body.get('trade', {}).get('price')
                
                if current_price and current_price > 0:
                    raw_units = notional_amount / float(current_price)
                    whole_units = math.floor(raw_units)
                    
                    if whole_units == 0:
                        min_sell_value = float(current_price)
                        return f"❌ The sell amount ${notional_amount:.2f} equals only {raw_units:.3f} shares of {ticker}. This brokerage requires selling whole shares. The user must sell at least 1 full share, which costs approximately ${min_sell_value:.2f}. Please ask them to increase their sell amount."
                    
                    order_units = float(whole_units)
                    logger.info(f"[Trade Agent] SELL: Converted ${notional_amount} to {order_units} whole shares at ${current_price}/share")
                else:
                    # Fallback to notional if we can't get price
                    order_notional = float(notional_amount)
                    logger.warning(f"[Trade Agent] Could not get price for {ticker}, using notional_value")
            except Exception as price_error:
                logger.warning(f"[Trade Agent] Could not convert notional to units: {price_error}, using notional_value")
                order_notional = float(notional_amount)
        else:
            # BUY orders can use notional_value (fractional shares usually supported for buying)
            order_notional = float(notional_amount)
        
        # Place order using SnapTrade
        logger.info(f"[Trade Agent] Placing {action} order via SnapTrade for {ticker} (units={order_units}, notional={order_notional})")
        
        order_params = {
            'account_id': clean_account_id,
            'user_id': snaptrade_user_id,
            'user_secret': user_secret,
            'action': action,
            'order_type': "Market",
            'time_in_force': "Day",
            'universal_symbol_id': universal_symbol_id,
        }
        
        if order_units is not None:
            order_params['units'] = order_units
        else:
            order_params['notional_value'] = order_notional
        
        order_response = snaptrade_client.trading.place_force_order(**order_params)
        
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
            'units': order_units,
            'status': order_response.body.get('status', 'PENDING'),
            'raw_order_data': order_response.body
        }
        
        supabase.table('snaptrade_orders').insert(order_data).execute()
        logger.info(f"[Trade Agent] Order stored in database")
        
        # PRODUCTION-GRADE: Immediately trigger a portfolio sync after trade
        # SnapTrade webhooks can be delayed, so sync holdings now
        try:
            from utils.portfolio.snaptrade_sync_service import trigger_full_user_sync
            import asyncio
            
            # Run sync in background task to not block the response
            async def delayed_sync():
                # Small delay to let brokerage process the order
                await asyncio.sleep(3)
                result = await trigger_full_user_sync(user_id, force_rebuild=True)
                if result.get('success'):
                    logger.info(f"[Trade Agent] Post-trade sync completed: {result.get('positions_synced', 0)} positions")
                else:
                    logger.warning(f"[Trade Agent] Post-trade sync failed: {result.get('error')}")
            
            # Schedule the sync but don't wait for it
            asyncio.create_task(delayed_sync())
            logger.info(f"[Trade Agent] Scheduled post-trade holdings sync for user {user_id}")
        except Exception as sync_error:
            # Don't fail the trade response if sync scheduling fails
            logger.warning(f"[Trade Agent] Failed to schedule post-trade sync: {sync_error}")
        
        # Build success message
        if order_units is not None:
            return f"✅ Trade submitted successfully via SnapTrade: {action} {int(order_units)} shares of {ticker}. Monitor status in your Portfolio page."
        else:
            return f"✅ Trade submitted successfully via SnapTrade: {action} order for ${notional_amount:.2f} of {ticker}. Monitor status in your Portfolio page."
    
    except SnapTradeApiException as e:
        error_str = str(e)
        logger.error(f"[Trade Agent] SnapTrade API error: {e}", exc_info=True)
        
        # PRODUCTION-GRADE: Handle specific brokerage errors with user-friendly messages
        
        # Check for market closed error
        market_closed_indicators = [
            'not open for trading', 'market hours', 'non_trading_hours',
            'NON_TRADING_HOURS', '1019', 'CAN_NOT_TRADING_FOR_NON_TRADING_HOURS'
        ]
        if any(indicator.lower() in error_str.lower() for indicator in market_closed_indicators):
            # Queue the order for market open
            try:
                from services.snaptrade_trading_service import get_snaptrade_trading_service
                trading_service = get_snaptrade_trading_service()
                queue_result = trading_service.queue_order(
                    user_id=user_id,
                    account_id=account_id.replace('snaptrade_', ''),
                    symbol=ticker,
                    action=action,
                    order_type='Market',
                    time_in_force='Day',
                    notional_value=notional_amount if order_units is None else None,
                    units=order_units
                )
                if queue_result.get('success'):
                    return f"⏰ Market is currently closed. The user's {action} order for {ticker} has been queued and will automatically execute when the market opens (9:30 AM ET Monday-Friday). They can view or cancel this order on the Portfolio page."
                else:
                    return f"❌ Market is closed and we couldn't queue the order: {queue_result.get('error', 'Unknown error')}. Please ask the user to try again when the market opens (9:30 AM - 4:00 PM ET, Monday-Friday)."
            except Exception as queue_error:
                logger.error(f"[Trade Agent] Failed to queue order: {queue_error}")
                return "❌ Market is currently closed and we couldn't queue the order. The US stock market is open 9:30 AM - 4:00 PM Eastern Time, Monday through Friday. Please ask the user to try again during market hours."
        
        # Handle fractional share error
        if 'FRACT_NOT_CLOSE_INT_POSITION' in error_str or 'fractional shares' in error_str.lower():
            return "❌ This brokerage requires selling whole shares only. The user needs to sell at least 1 full share. Please ask them to increase the sell amount to cover at least 1 whole share."
        
        # Handle insufficient buying power
        if 'insufficient' in error_str.lower() or 'buying power' in error_str.lower():
            return "❌ Insufficient buying power to place this order. The user doesn't have enough funds in their brokerage account. Please ask them to deposit funds or reduce the order amount."
        
        # Handle permission errors
        if 'permission' in error_str.lower():
            return "❌ The user's brokerage account does not have permission for this type of order. They may need to enable trading permissions in their brokerage account settings."
        
        return f"❌ Brokerage error: {error_str}. Please verify the order details with the user and try again."
    except Exception as e:
        logger.error(f"[Trade Agent] SnapTrade order error: {e}", exc_info=True)
        raise e


def _submit_market_order(account_id: str, ticker: str, notional_amount: float, side: OrderSide, user_id: Optional[str] = None) -> str:
    """
    Submit a market order to the appropriate brokerage based on account type.
    
    NOTE: This function is primarily used for Alpaca accounts from api_server.py.
    SnapTrade accounts are typically handled via snaptrade_trading_service directly.
    
    Args:
        account_id: The account ID (may be prefixed with 'snaptrade_' for SnapTrade accounts)
        ticker: The stock symbol to trade
        notional_amount: The dollar amount to trade
        side: OrderSide.BUY or OrderSide.SELL
        user_id: Optional user ID (required for SnapTrade accounts, can be extracted from config for LangGraph calls)
        
    Returns:
        Success/error message string
    """
    try:
        # Determine if this is a SnapTrade account
        if account_id.startswith('snaptrade_'):
            # Use SnapTrade - need user_id
            resolved_user_id = user_id
            if not resolved_user_id:
                try:
                    resolved_user_id = get_user_id_from_config()
                except Exception as e:
                    logger.error(f"[Trade Agent] Cannot get user_id for SnapTrade order: {e}")
                    return "❌ Error: Unable to identify user session for brokerage order. Please ask the user to try placing the trade directly from the Portfolio page."
            
            action = "BUY" if side == OrderSide.BUY else "SELL"
            return _submit_snaptrade_market_order(
                user_id=resolved_user_id,
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
        error_msg = str(e)
        logger.error(f"[Trade Agent] Error in _submit_market_order: {e}", exc_info=True)
        return f"❌ Error submitting market order: {error_msg}. Please verify the order details (ticker symbol and amount) with the user and try again."
