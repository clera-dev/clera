#trade_execution_agent.py

# Import necessary libraries
from langchain_core.tools import tool
from langgraph.types import interrupt
from langgraph.errors import GraphInterrupt  # CRITICAL: This is the actual exception raised by interrupt()
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


def _parse_and_validate_trade_confirmation(
    user_confirmation: str,
    original_ticker: str,
    original_amount: float,
    original_account_id: str,
    original_account_type: str,
    user_id: str,
    is_sell: bool = False
) -> Tuple[Optional[str], str, float, str, str, str]:
    """
    Parse and validate modified trade confirmation from user.
    
    Extracts a shared helper to avoid DRY violations between buy/sell.
    Handles JSON parsing, input validation, and account ownership verification.
    
    Args:
        user_confirmation: Raw confirmation string from user (could be JSON or text)
        original_ticker: Original ticker proposed by agent
        original_amount: Original dollar amount proposed by agent
        original_account_id: Original account ID
        original_account_type: Original account type ('alpaca' or 'snaptrade')
        user_id: Authenticated user ID for ownership verification
        is_sell: Whether this is a SELL order (requires holdings check on ticker change)
    
    Returns:
        Tuple of (error_message, final_ticker, final_amount, final_account_id, final_account_type, final_confirmation)
        - error_message: None if valid, error string if validation failed
        - final_*: Validated values to use for trade execution
        - final_confirmation: Normalized confirmation string ('yes'/'no'/original)
    """
    import json
    
    modified_ticker = original_ticker
    modified_amount = original_amount
    modified_account_id = original_account_id
    modified_account_type = original_account_type
    final_confirmation = user_confirmation
    
    try:
        if user_confirmation.startswith('{'):
            modified_data = json.loads(user_confirmation)
            if modified_data.get('action') == 'execute':
                # User confirmed with modifications
                if modified_data.get('modified'):
                    # SECURITY: Re-validate all modified inputs
                    new_ticker = str(modified_data.get('ticker', original_ticker)).strip().upper()
                    new_amount = modified_data.get('amount', original_amount)
                    # SECURITY: Convert account_id to string to prevent AttributeError
                    # if malformed JSON sends integer (e.g., "account_id": 123)
                    raw_account_id = modified_data.get('account_id')
                    new_account_id = str(raw_account_id) if raw_account_id is not None else None
                    
                    # Validate ticker format
                    if not new_ticker or not new_ticker.isalnum():
                        return (f"Error: Invalid ticker symbol '{new_ticker}'. Ticker symbols must be alphanumeric.",
                                original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                    modified_ticker = new_ticker
                    
                    # Validate amount
                    try:
                        new_amount = float(new_amount)
                        # SECURITY: Check for NaN, Infinity which bypass < comparison
                        import math
                        if not math.isfinite(new_amount) or new_amount < 1:
                            return (f"Error: Invalid dollar amount '{new_amount}'. Minimum order is $1.00.",
                                    original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                        modified_amount = new_amount
                    except (ValueError, TypeError):
                        return (f"Error: Invalid dollar amount '{new_amount}'. Please provide a valid number.",
                                original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                    
                    # SECURITY: Validate account ownership if user changed account
                    # Normalize account_id comparison (strip prefixes for consistent comparison)
                    normalized_original = original_account_id.replace('snaptrade_', '').replace('alpaca_', '')
                    normalized_new = new_account_id.replace('snaptrade_', '').replace('alpaca_', '') if new_account_id else None
                    
                    if normalized_new and normalized_new != normalized_original:
                        from utils.supabase.db_client import get_supabase_client
                        supabase = get_supabase_client()
                        
                        # Verify account belongs to this user
                        account_check = supabase.table('user_investment_accounts')\
                            .select('provider_account_id, provider')\
                            .eq('user_id', user_id)\
                            .eq('provider_account_id', normalized_new)\
                            .execute()
                        
                        if not account_check.data:
                            logger.warning(f"[Trade Agent] SECURITY: User {user_id} attempted to use unauthorized account {new_account_id}")
                            return ("Error: You don't have permission to trade with that account.",
                                    original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                        
                        # Set account type based on actual provider
                        account_provider = account_check.data[0].get('provider', 'snaptrade')
                        if account_provider == 'alpaca':
                            modified_account_id = normalized_new
                            modified_account_type = 'alpaca'
                        else:
                            modified_account_id = f"snaptrade_{normalized_new}" if not new_account_id.startswith('snaptrade_') else new_account_id
                            modified_account_type = 'snaptrade'
                    
                    # For SELL orders: verify holdings if ticker OR account was changed
                    # Must verify the target account actually holds the stock
                    account_changed = normalized_new and normalized_new != normalized_original
                    if is_sell and (modified_ticker != original_ticker or account_changed):
                        if account_changed:
                            # CRITICAL FIX: Verify the SPECIFIC selected account holds the stock
                            # Don't use detect_symbol_account which returns the FIRST matching account
                            # User might hold same stock in multiple accounts
                            symbol_upper = modified_ticker.upper()
                            holdings_result = supabase.table('user_aggregated_holdings')\
                                .select('account_contributions')\
                                .eq('user_id', user_id)\
                                .eq('symbol', symbol_upper)\
                                .execute()
                            
                            if not holdings_result.data:
                                return (f"Error: You don't appear to hold {modified_ticker} in any of your accounts. Cannot sell.",
                                        original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                            
                            # Check if the SPECIFIC selected account is in the account_contributions
                            account_contributions = holdings_result.data[0].get('account_contributions', [])
                            if isinstance(account_contributions, str):
                                import json as json_mod
                                try:
                                    account_contributions = json_mod.loads(account_contributions)
                                except json_mod.JSONDecodeError as parse_error:
                                    # SECURITY: Corrupted DB data - do NOT allow trade without verification
                                    logger.error(f"[Trade Agent] Failed to parse account_contributions: {parse_error}")
                                    return (f"Error: Unable to verify holdings. Please try again.",
                                            original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                            
                            # Check if user's selected account holds this symbol
                            account_found = False
                            for contrib in account_contributions:
                                contrib_account_id = contrib.get('account_id', '')
                                contrib_normalized = contrib_account_id.replace('snaptrade_', '').replace('alpaca_', '')
                                contrib_quantity = float(contrib.get('quantity', 0))
                                if contrib_normalized == normalized_new and contrib_quantity > 0:
                                    account_found = True
                                    break
                            
                            if not account_found:
                                return (f"Error: The selected account doesn't hold {modified_ticker}. Please select an account that holds this stock.",
                                        original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                            
                            logger.info(f"[Trade Agent] SELL account changed - verified holdings on account {modified_account_id}")
                        else:
                            # Ticker changed but not account - use detect_symbol_account to find the right account
                            # detect_symbol_account returns (account_id, account_type, account_info) tuple
                            found_account_id, found_account_type, found_account_info = TradeRoutingService.detect_symbol_account(
                                modified_ticker, user_id
                            )
                            
                            if not found_account_id:
                                return (f"Error: You don't appear to hold {modified_ticker} in any of your accounts. Cannot sell.",
                                        original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
                            
                            modified_account_id = found_account_id
                            modified_account_type = found_account_type or 'snaptrade'
                            logger.info(f"[Trade Agent] SELL ticker changed - verified holdings on account {modified_account_id}")
                    
                    action_type = "SELL" if is_sell else "BUY"
                    logger.info(f"[Trade Agent] User MODIFIED {action_type} trade: {modified_ticker} ${modified_amount:.2f} via {modified_account_id}")
                
                # Valid confirmation
                final_confirmation = "yes"
                
    except json.JSONDecodeError:
        # Not JSON - treat as regular text response (e.g., "yes", "no")
        logger.debug(f"[Trade Agent] Confirmation not JSON, treating as text: {user_confirmation[:50]}")
    except (ValueError, TypeError) as e:
        # SECURITY: Validation error during processing - do NOT proceed with trade
        # This prevents trades from bypassing validation if errors occur mid-processing
        logger.error(f"[Trade Agent] Validation error during trade confirmation: {e}")
        return (f"Error: Invalid trade data. Please try again.",
                original_ticker, original_amount, original_account_id, original_account_type, user_confirmation)
    
    return (None, modified_ticker, modified_amount, modified_account_id, modified_account_type, final_confirmation)


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
        user_confirmation = str(og_user_confirmation).strip()
        logger.info(f"[Trade Agent] Received confirmation: '{user_confirmation}'")

        # Parse and validate any modifications from the confirmation popup
        error_msg, modified_ticker, modified_amount, modified_account_id, modified_account_type, user_confirmation = \
            _parse_and_validate_trade_confirmation(
                user_confirmation=user_confirmation,
                original_ticker=ticker,
                original_amount=notional_amount,
                original_account_id=account_id,
                original_account_type=account_type,
                user_id=user_id,
                is_sell=False
            )
        
        if error_msg:
            return error_msg
        
        user_confirmation_lower = user_confirmation.lower()

        # Check rejection
        if any(rejection in user_confirmation_lower for rejection in ["no", "nah", "nope", "cancel", "reject", "deny"]):
            logger.info(f"[Trade Agent] Trade CANCELED by user")
            return "Trade canceled: You chose not to proceed with this transaction."

        # Check explicit confirmation
        if not any(approval in user_confirmation_lower for approval in ["yes", "approve", "confirm", "execute", "proceed", "ok"]):
            return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

        # Execute trade with potentially modified values
        try:
            if modified_account_type == 'alpaca':
                logger.info(f"[Trade Agent] Executing BUY via Alpaca: {modified_ticker} ${modified_amount:.2f}")
                result = _submit_alpaca_market_order(modified_account_id, modified_ticker, modified_amount, OrderSide.BUY)
            else:  # snaptrade
                logger.info(f"[Trade Agent] Executing BUY via SnapTrade: {modified_ticker} ${modified_amount:.2f}")
                result = _submit_snaptrade_market_order(user_id, modified_account_id, modified_ticker, modified_amount, 'BUY')
            
            logger.info(f"[Trade Agent] BUY order result: {result}")
            return result
        except GraphInterrupt:
            # CRITICAL: Re-raise GraphInterrupt exceptions so LangGraph can handle them
            # The interrupt() call raises GraphInterrupt to pause execution and request user confirmation
            raise
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[Trade Agent] Error executing BUY order: {e}", exc_info=True)
            return f"❌ Error executing BUY order: {error_msg}. Please verify the ticker symbol is correct and the amount is valid, then try again."
            
    except GraphInterrupt:
        # CRITICAL: Re-raise GraphInterrupt exceptions so LangGraph can handle them properly
        # This allows the graph to pause and show the confirmation UI to the user
        raise
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
        user_confirmation = str(og_user_confirmation).strip()
        logger.info(f"[Trade Agent] Received confirmation: '{user_confirmation}'")

        # Parse and validate any modifications from the confirmation popup
        # Note: is_sell=True enables holdings verification if ticker changes
        error_msg, modified_ticker, modified_amount, modified_account_id, modified_account_type, user_confirmation = \
            _parse_and_validate_trade_confirmation(
                user_confirmation=user_confirmation,
                original_ticker=ticker,
                original_amount=notional_amount,
                original_account_id=account_id,
                original_account_type=account_type,
                user_id=user_id,
                is_sell=True
            )
        
        if error_msg:
            return error_msg
        
        user_confirmation_lower = user_confirmation.lower()

        # Check rejection
        if any(rejection in user_confirmation_lower for rejection in ["no", "nah", "nope", "cancel", "reject", "deny"]):
            logger.info(f"[Trade Agent] Trade CANCELED by user")
            return "Trade canceled: You chose not to proceed with this transaction."

        # Check explicit confirmation
        if not any(approval in user_confirmation_lower for approval in ["yes", "approve", "confirm", "execute", "proceed", "ok"]):
            return "Trade not executed: Unclear confirmation. Please try again with a clear 'yes' or 'no'."

        # Execute trade with potentially modified values
        try:
            if modified_account_type == 'alpaca':
                logger.info(f"[Trade Agent] Executing SELL via Alpaca: {modified_ticker} ${modified_amount:.2f}")
                result = _submit_alpaca_market_order(modified_account_id, modified_ticker, modified_amount, OrderSide.SELL)
            else:  # snaptrade
                logger.info(f"[Trade Agent] Executing SELL via SnapTrade: {modified_ticker} ${modified_amount:.2f}")
                result = _submit_snaptrade_market_order(user_id, modified_account_id, modified_ticker, modified_amount, 'SELL')
            
            logger.info(f"[Trade Agent] SELL order result: {result}")
            return result
        except GraphInterrupt:
            # CRITICAL: Re-raise GraphInterrupt exceptions so LangGraph can handle them
            raise
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[Trade Agent] Error executing SELL order: {e}", exc_info=True)
            return f"❌ Error executing SELL order: {error_msg}. Please verify the ticker symbol is correct and the user has sufficient shares to sell."
            
    except GraphInterrupt:
        # CRITICAL: Re-raise GraphInterrupt exceptions so LangGraph can handle them properly
        # This allows the graph to pause and show the confirmation UI to the user
        raise
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
        
        # Clean account ID (remove our prefix) - needed for all SnapTrade API calls
        clean_account_id = account_id.replace('snaptrade_', '')
        
        # Get symbol's universal ID from SnapTrade using account-specific lookup
        # CRITICAL: Use symbol_search_user_account to get the correct exchange symbol
        # (e.g., NYSE JNJ instead of German SWB JNJ)
        logger.info(f"[Trade Agent] Looking up tradeable symbol ID for {ticker} on account {clean_account_id}")
        
        # Use symbol_search_user_account to get symbols actually tradeable on this account
        symbol_response = snaptrade_client.reference_data.symbol_search_user_account(
            user_id=snaptrade_user_id,
            user_secret=user_secret,
            account_id=clean_account_id,
            substring=ticker
        )
        
        if not symbol_response.body:
            return f"❌ Error: Symbol '{ticker}' is not available for trading on the user's brokerage. Please verify the ticker symbol is correct (e.g., 'AAPL' for Apple, 'GOOGL' for Google), or try a different stock."
        
        # Find exact match for the ticker, prioritizing US exchanges
        us_exchanges = {'NYSE', 'NASDAQ', 'ARCA', 'BATS', 'AMEX', 'NYSEARCA'}
        universal_symbol_id = None
        exact_match = None
        us_match = None
        
        for symbol_data in symbol_response.body:
            if symbol_data.get('symbol') == ticker:
                exchange_code = symbol_data.get('exchange', {}).get('code', '')
                # Prefer US exchanges
                if exchange_code in us_exchanges:
                    us_match = symbol_data
                    break  # Found US match, use it
                elif exact_match is None:
                    exact_match = symbol_data
        
        best_match = us_match or exact_match
        if best_match:
            universal_symbol_id = best_match.get('id')
            exchange_code = best_match.get('exchange', {}).get('code', 'Unknown')
            logger.info(f"[Trade Agent] Found tradeable symbol ID for {ticker} on {exchange_code}: {universal_symbol_id}")
        else:
            return f"❌ Error: Symbol '{ticker}' is not available for trading on the user's brokerage. Please verify the ticker symbol is correct, or try a different stock - ETFs like VTI, SPY, or QQQ are usually widely supported."
        
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
            'account_id': clean_account_id,  # CRITICAL FIX: Use clean UUID without 'snaptrade_' prefix
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
        
        # PRODUCTION-GRADE: Trigger portfolio sync after trade in background
        # Don't block the trade response - user can click Refresh on Portfolio page
        # The sync will run asynchronously to update holdings
        try:
            from utils.portfolio.snaptrade_sync_service import trigger_full_user_sync
            import asyncio
            import threading
            
            def run_sync_in_background():
                """Run sync in a background thread to avoid blocking the response."""
                try:
                    asyncio.run(trigger_full_user_sync(user_id, force_rebuild=True))
                    logger.info(f"[Trade Agent] Background post-trade sync completed for user {user_id}")
                except Exception as e:
                    logger.warning(f"[Trade Agent] Background post-trade sync failed: {e}")
            
            # Start background sync - don't wait for it
            sync_thread = threading.Thread(target=run_sync_in_background, daemon=True)
            sync_thread.start()
            logger.info(f"[Trade Agent] Started background sync for user {user_id}")
        except Exception as sync_error:
            # Don't fail the trade response if sync setup fails - user can refresh manually
            logger.warning(f"[Trade Agent] Failed to start background sync: {sync_error}")
        
        # Build success message with refresh hint
        if order_units is not None:
            return f"✅ Trade submitted successfully via SnapTrade: {action} {int(order_units)} shares of {ticker}. Click 'Refresh' on the Portfolio page to see updated holdings."
        else:
            return f"✅ Trade submitted successfully via SnapTrade: {action} order for ${notional_amount:.2f} of {ticker}. Click 'Refresh' on the Portfolio page to see updated holdings."
    
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
        
        # Handle symbol not available error (1063)
        if '1063' in error_str or 'Unable to obtain symbol' in error_str:
            return f"❌ Sorry, {ticker} is not available for trading through the user's connected brokerage. This stock may not be supported by their broker, or trading may be restricted. Please suggest a different stock - ETFs like VTI, SPY, or QQQ are usually widely supported."
        
        # Generic brokerage error - clean up the technical details for user
        # Extract just the meaningful part of the error
        if "'detail':" in error_str:
            try:
                import re
                detail_match = re.search(r"'detail':\s*'([^']+)'", error_str)
                if detail_match:
                    clean_error = detail_match.group(1)
                    return f"❌ Brokerage error: {clean_error}. Please try a different stock or check with the user if this stock is available on their brokerage."
            except Exception:
                pass  # Fall through to generic error message
        
        return f"❌ Brokerage error occurred while placing the order. Please try a different stock or ask the user to check if {ticker} is available on their brokerage platform."
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
