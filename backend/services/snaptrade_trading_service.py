"""
SnapTrade Trading Service

PRODUCTION-GRADE: Handles trade execution via SnapTrade API with:
- Order impact validation (check before placing)
- Trade placement with proper error handling
- Order status tracking
- Order cancellation
- Multi-account support
- ORDER QUEUEING: When market is closed, orders are queued locally

Follows SOLID principles and SnapTrade best practices.
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def is_market_closed_error(error_str: str) -> bool:
    """Check if an error indicates the market is closed."""
    market_closed_indicators = [
        'not open for trading',
        'market hours',
        'non_trading_hours',
        'NON_TRADING_HOURS',
        '1019',  # SnapTrade market closed code
        'CAN_NOT_TRADING_FOR_NON_TRADING_HOURS',
    ]
    error_lower = error_str.lower()
    return any(indicator.lower() in error_lower for indicator in market_closed_indicators)


class SnapTradeTradingService:
    """
    Service for executing trades through SnapTrade API.
    
    This service provides production-grade trade execution with proper validation,
    error handling, and order tracking.
    """
    
    def __init__(self):
        """Initialize the SnapTrade trading service."""
        from snaptrade_client import SnapTrade
        
        self.client = SnapTrade(
            consumer_key=os.getenv('SNAPTRADE_CONSUMER_KEY'),
            client_id=os.getenv('SNAPTRADE_CLIENT_ID')
        )
    
    def get_supabase_client(self):
        """Get Supabase client for database operations."""
        from supabase import create_client
        
        return create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        )
    
    def queue_order(
        self,
        user_id: str,
        account_id: str,
        symbol: str,
        action: str,
        order_type: str = 'Market',
        time_in_force: str = 'Day',
        notional_value: Optional[float] = None,
        units: Optional[float] = None,
        price: Optional[float] = None,
        stop_price: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Queue an order for execution when market opens.
        
        Used when the market is closed and the brokerage doesn't accept orders.
        The order is stored in our database and will be executed by a background
        job when the market opens.
        
        Args:
            user_id: Platform user ID
            account_id: SnapTrade account ID
            symbol: Stock ticker
            action: 'BUY' or 'SELL'
            order_type: 'Market', 'Limit', etc.
            time_in_force: 'Day', 'GTC', etc.
            notional_value: Dollar amount
            units: Number of shares
            price: Limit price
            stop_price: Stop price
            
        Returns:
            {
                'success': bool,
                'queued': True,
                'order_id': str,
                'message': str
            }
        """
        try:
            supabase = self.get_supabase_client()
            
            order_data = {
                'user_id': user_id,
                'account_id': account_id,
                'provider': 'snaptrade',
                'symbol': symbol,
                'action': action,
                'order_type': order_type,
                'time_in_force': time_in_force,
                'notional_value': notional_value,
                'units': units,
                'price': price,
                'stop_price': stop_price,
                'status': 'pending',
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
            
            result = supabase.table('queued_orders').insert(order_data).execute()
            
            if result.data:
                order_id = result.data[0]['id']
                
                # Build order description based on whether notional or units was provided
                if notional_value is not None:
                    order_desc = f"${notional_value:.2f} of {symbol}"
                    log_desc = f"${notional_value}"
                elif units is not None:
                    order_desc = f"{units} shares of {symbol}"
                    log_desc = f"{units} shares"
                else:
                    order_desc = symbol
                    log_desc = "unknown amount"
                
                logger.info(f"✅ Order queued successfully: {order_id} - {action} {log_desc} of {symbol}")
                
                return {
                    'success': True,
                    'queued': True,
                    'order_id': order_id,
                    'message': f'Order queued for market open. Your {action} order for {order_desc} will be executed when the market opens (9:30 AM ET).',
                    'order': {
                        'id': order_id,
                        'symbol': symbol,
                        'action': action,
                        'notional_value': notional_value,
                        'units': units,
                        'status': 'pending',
                        'queued_at': order_data['created_at']
                    }
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to queue order'
                }
                
        except Exception as e:
            logger.error(f"Error queueing order: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unable to queue order for later. Please try again when the market opens.'
            }
    
    def get_queued_orders(self, user_id: str, status: str = 'pending') -> List[Dict[str, Any]]:
        """
        Get queued orders for a user.
        
        Args:
            user_id: Platform user ID
            status: Filter by status ('pending', 'executing', 'executed', 'failed', 'cancelled')
            
        Returns:
            List of queued orders
        """
        try:
            supabase = self.get_supabase_client()
            
            query = supabase.table('queued_orders')\
                .select('*')\
                .eq('user_id', user_id)
            
            if status:
                query = query.eq('status', status)
            
            result = query.order('created_at', desc=True).execute()
            
            return result.data or []
            
        except Exception as e:
            logger.error(f"Error fetching queued orders: {e}")
            return []
    
    def cancel_queued_order(self, user_id: str, order_id: str) -> Dict[str, Any]:
        """
        Cancel a queued order.
        
        Args:
            user_id: Platform user ID
            order_id: Queued order ID
            
        Returns:
            {'success': bool, 'message': str}
        """
        try:
            supabase = self.get_supabase_client()
            
            # Verify ownership and status
            result = supabase.table('queued_orders')\
                .select('*')\
                .eq('id', order_id)\
                .eq('user_id', user_id)\
                .single()\
                .execute()
            
            if not result.data:
                return {'success': False, 'error': 'Order not found'}
            
            if result.data['status'] != 'pending':
                return {'success': False, 'error': f"Cannot cancel order with status: {result.data['status']}"}
            
            # Update status to cancelled
            supabase.table('queued_orders')\
                .update({'status': 'cancelled', 'updated_at': datetime.now(timezone.utc).isoformat()})\
                .eq('id', order_id)\
                .execute()
            
            logger.info(f"✅ Queued order cancelled: {order_id}")
            
            return {
                'success': True,
                'message': f"Order {order_id} cancelled successfully"
            }
            
        except Exception as e:
            logger.error(f"Error cancelling queued order: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_user_credentials(self, user_id: str) -> Optional[Dict[str, str]]:
        """
        Get SnapTrade credentials for a user.
        
        Args:
            user_id: Platform user ID
            
        Returns:
            {
                'snaptrade_user_id': str,
                'snaptrade_user_secret': str
            }
        """
        try:
            supabase = self.get_supabase_client()
            result = supabase.table('snaptrade_users')\
                .select('snaptrade_user_id, snaptrade_user_secret')\
                .eq('user_id', user_id)\
                .single()\
                .execute()
            
            if not result.data:
                logger.error(f"No SnapTrade credentials found for user {user_id}")
                return None
            
            return {
                'snaptrade_user_id': result.data['snaptrade_user_id'],
                'snaptrade_user_secret': result.data['snaptrade_user_secret']
            }
            
        except Exception as e:
            logger.error(f"Error getting SnapTrade credentials: {e}")
            return None
    
    def get_universal_symbol_id(self, ticker: str) -> Optional[str]:
        """
        DEPRECATED: Use get_universal_symbol_id_for_account instead.
        
        Get SnapTrade universal symbol ID for a ticker using generic lookup.
        WARNING: This may return symbols from non-US exchanges (e.g., German SWB for JNJ)
        
        Args:
            ticker: Stock symbol (e.g., 'AAPL')
            
        Returns:
            Universal symbol ID or None if not found
        """
        try:
            logger.info(f"Looking up universal symbol ID for {ticker}")
            
            # Search for symbol in SnapTrade
            response = self.client.reference_data.get_symbols_by_ticker(query=ticker)
            
            # PRODUCTION-GRADE FIX: The API returns a single symbol dict, not a list
            # response.body is the symbol object directly with 'id', 'symbol', etc.
            if not response.body:
                logger.warning(f"Symbol {ticker} not found in SnapTrade")
                return None
            
            # Get the ID from the symbol object (it's a dict, not a list)
            if isinstance(response.body, dict) and 'id' in response.body:
                universal_symbol_id = response.body['id']
                logger.info(f"Found universal symbol ID for {ticker}: {universal_symbol_id}")
                return universal_symbol_id
            
            # Fallback: if it's somehow a list (API version difference)
            if isinstance(response.body, list) and len(response.body) > 0:
                universal_symbol_id = response.body[0].get('id') if isinstance(response.body[0], dict) else response.body[0]['id']
                logger.info(f"Found universal symbol ID for {ticker}: {universal_symbol_id}")
                return universal_symbol_id
            
            logger.warning(f"Symbol {ticker} response format unexpected: {type(response.body)}")
            return None
            
        except Exception as e:
            logger.error(f"Error looking up symbol {ticker}: {e}")
            return None
    
    def get_universal_symbol_id_for_account(
        self, 
        ticker: str, 
        user_id: str, 
        account_id: str
    ) -> Optional[str]:
        """
        Get SnapTrade universal symbol ID for a ticker that is tradeable on a specific account.
        
        PRODUCTION-GRADE: Uses symbol_search_user_account to get symbols that are actually
        available for trading on the user's brokerage account. This avoids returning
        symbols from foreign exchanges (e.g., German SWB instead of NYSE for JNJ).
        
        Args:
            ticker: Stock symbol (e.g., 'AAPL', 'JNJ')
            user_id: Platform user ID
            account_id: SnapTrade account ID (UUID format)
            
        Returns:
            Universal symbol ID or None if not found/not tradeable
        """
        # Normalize ticker to uppercase for consistent matching
        ticker = ticker.upper().strip()
        
        try:
            # Get user credentials
            credentials = self.get_user_credentials(user_id)
            if not credentials:
                # CRITICAL: Do NOT fall back to deprecated method - it may return wrong exchange
                # This could cause trades to execute on wrong securities (e.g., German JNJ instead of US JNJ)
                logger.error(f"No credentials for user {user_id} - cannot look up tradeable symbol")
                return None
            
            logger.info(f"Looking up tradeable symbol ID for {ticker} on account {account_id}")
            
            # Use symbol_search_user_account to get symbols available on this specific account
            response = self.client.reference_data.symbol_search_user_account(
                user_id=credentials['snaptrade_user_id'],
                user_secret=credentials['snaptrade_user_secret'],
                account_id=account_id,
                substring=ticker
            )
            
            if not response.body:
                logger.warning(f"Symbol {ticker} not found for account {account_id}")
                return None
            
            # Find exact match for the ticker symbol (prioritize US exchanges)
            us_exchanges = {'NYSE', 'NASDAQ', 'ARCA', 'BATS', 'AMEX', 'NYSEARCA'}
            exact_match = None
            us_match = None
            
            for symbol_data in response.body:
                # Case-insensitive comparison to handle user input like 'aapl' vs API returning 'AAPL'
                symbol_from_api = symbol_data.get('symbol', '').upper()
                if symbol_from_api == ticker:
                    exchange_code = symbol_data.get('exchange', {}).get('code', '')
                    
                    # Prefer US exchanges
                    if exchange_code in us_exchanges:
                        us_match = symbol_data
                        break  # Found US match, use it
                    elif exact_match is None:
                        exact_match = symbol_data
            
            # Use US match first, then any exact match
            best_match = us_match or exact_match
            
            if best_match:
                universal_symbol_id = best_match.get('id')
                exchange_code = best_match.get('exchange', {}).get('code', 'Unknown')
                logger.info(f"Found tradeable symbol ID for {ticker} on {exchange_code}: {universal_symbol_id}")
                return universal_symbol_id
            
            logger.warning(f"No exact match for {ticker} found on account {account_id}")
            return None
            
        except Exception as e:
            # CRITICAL: Do NOT fall back to deprecated method on error
            # Silent fallback could cause trades on wrong securities
            logger.error(f"Error looking up symbol {ticker} for account {account_id}: {e}")
            return None
    
    def check_order_impact(
        self,
        user_id: str,
        account_id: str,
        symbol: str,
        action: str,
        order_type: str,
        time_in_force: str,
        notional_value: Optional[float] = None,
        units: Optional[float] = None,
        price: Optional[float] = None,
        stop: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Check the impact of an order before placing it.
        
        PRODUCTION-GRADE: Validates order and shows impact to user before execution.
        
        Args:
            user_id: Platform user ID
            account_id: SnapTrade account ID (UUID format)
            symbol: Stock ticker symbol
            action: 'BUY' or 'SELL'
            order_type: 'Market', 'Limit', 'Stop', 'StopLimit'
            time_in_force: 'Day', 'GTC', 'FOK', 'IOC'
            notional_value: Dollar amount (for Market orders)
            units: Number of shares (for Limit/Stop orders)
            price: Limit price (for Limit/StopLimit orders)
            stop: Stop price (for Stop/StopLimit orders)
            
        Returns:
            {
                'success': bool,
                'impact': {
                    'estimated_cost': float,
                    'estimated_commission': float,
                    'estimated_shares': float,
                    'estimated_price': float,
                    'forex_fee': float (if applicable),
                    'buying_power_effect': float,
                    'trade_id': str (for subsequent place order)
                },
                'error': str (if unsuccessful)
            }
        """
        try:
            # Get user credentials
            credentials = self.get_user_credentials(user_id)
            if not credentials:
                return {
                    'success': False,
                    'error': 'SnapTrade credentials not found. Please reconnect your brokerage account.'
                }
            
            # Get universal symbol ID for this specific account
            # PRODUCTION-GRADE: Use account-specific lookup to get the correct exchange
            # (e.g., NYSE JNJ instead of German SWB JNJ)
            universal_symbol_id = self.get_universal_symbol_id_for_account(symbol, user_id, account_id)
            if not universal_symbol_id:
                return {
                    'success': False,
                    'error': f"Symbol '{symbol}' is not available for trading on your brokerage. Please verify the ticker symbol is correct."
                }
            
            logger.info(f"Checking order impact: {action} {symbol} via account {account_id}")
            
            # Call SnapTrade order impact API
            # PRODUCTION-GRADE: Convert Decimal to float to match SDK signature
            # SDK expects: notional_value: Union[str, int, float, NoneType]
            # Use explicit `is not None` checks for consistency
            response = self.client.trading.get_order_impact(
                user_id=credentials['snaptrade_user_id'],
                user_secret=credentials['snaptrade_user_secret'],
                account_id=account_id,
                action=action,
                universal_symbol_id=universal_symbol_id,
                order_type=order_type,
                time_in_force=time_in_force,
                notional_value=float(notional_value) if notional_value is not None else None,
                units=float(units) if units is not None else None,
                price=float(price) if price is not None else None,
                stop=float(stop) if stop is not None else None
            )
            
            # Parse response
            impact_data = response.body
            
            logger.info(f"✅ Order impact calculated successfully")
            
            return {
                'success': True,
                'impact': {
                    'estimated_cost': float(impact_data.get('estimated_cost', 0)),
                    'estimated_commission': float(impact_data.get('estimated_commission', 0)),
                    'estimated_shares': float(impact_data.get('estimated_units', 0)),
                    'estimated_price': float(impact_data.get('price', 0)),
                    'forex_fee': float(impact_data.get('forex_fee', 0)),
                    'buying_power_effect': float(impact_data.get('buying_power_effect', 0)),
                    'trade_id': impact_data.get('trade_id', '')
                }
            }
            
        except Exception as e:
            logger.error(f"Error checking order impact: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unable to validate order. Please check your order details and try again.'
            }
    
    def place_order(
        self,
        user_id: str,
        account_id: str,
        trade_id: Optional[str] = None,
        symbol: Optional[str] = None,
        action: Optional[str] = None,
        order_type: Optional[str] = None,
        time_in_force: Optional[str] = None,
        notional_value: Optional[float] = None,
        units: Optional[float] = None,
        price: Optional[float] = None,
        stop: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Place a trade order via SnapTrade.
        
        PRODUCTION-GRADE: Uses the proper two-step flow:
        1. Call get_order_impact to validate the order and get a trade_id
        2. Call place_order with the trade_id to execute
        
        This ensures proper validation including:
        - Market hours check
        - Symbol validity
        - Account permissions
        - Buying power validation
        
        Args:
            user_id: Platform user ID
            account_id: SnapTrade account ID (UUID format)
            trade_id: Trade ID from check_order_impact (if available)
            symbol: Stock ticker (required if no trade_id)
            action: 'BUY' or 'SELL' (required if no trade_id)
            order_type: 'Market', 'Limit', 'Stop', 'StopLimit'
            time_in_force: 'Day', 'GTC', 'FOK', 'IOC'
            notional_value: Dollar amount (for Market orders)
            units: Number of shares (for Limit/Stop orders)
            price: Limit price (for Limit/StopLimit orders)
            stop: Stop price (for Stop/StopLimit orders)
            
        Returns:
            {
                'success': bool,
                'order': {
                    'brokerage_order_id': str,
                    'status': str,
                    'symbol': str,
                    'action': str,
                    'quantity': float,
                    'filled_quantity': float,
                    'execution_price': float,
                    'order_type': str,
                    'time_placed': str
                },
                'error': str (if unsuccessful)
            }
        """
        try:
            # Get user credentials
            credentials = self.get_user_credentials(user_id)
            if not credentials:
                return {
                    'success': False,
                    'error': 'SnapTrade credentials not found. Please reconnect your brokerage account.'
                }
            
            # Method 1: Place order using trade_id (from check_order_impact)
            if trade_id:
                logger.info(f"Placing order using trade_id: {trade_id}")
                
                response = self.client.trading.place_order(
                    user_id=credentials['snaptrade_user_id'],
                    user_secret=credentials['snaptrade_user_secret'],
                    trade_id=trade_id,
                    wait_to_confirm=True
                )
                
            # Method 2: PRODUCTION-GRADE - Use get_order_impact first, then place_order
            # This validates market hours, symbol, and buying power BEFORE placing
            else:
                if not all([symbol, action, order_type, time_in_force]):
                    return {
                        'success': False,
                        'error': 'Order information is incomplete. Please try again.'
                    }
                
                # Get universal symbol ID for this specific account
                # PRODUCTION-GRADE: Use account-specific lookup to get the correct exchange
                # (e.g., NYSE JNJ instead of German SWB JNJ)
                universal_symbol_id = self.get_universal_symbol_id_for_account(symbol, user_id, account_id)
                if not universal_symbol_id:
                    return {
                        'success': False,
                        'error': f"Symbol '{symbol}' is not available for trading on your brokerage. Please verify the ticker symbol is correct."
                    }
                
                logger.info(f"Validating order via get_order_impact: {action} {symbol} via account {account_id}")
                
                # PRODUCTION-GRADE: Convert notional_value to units if needed
                # Some brokerages (like Webull) don't support notional orders, only unit-based orders
                order_units = units
                if notional_value and not units:
                    # Get current price to convert notional to units
                    try:
                        # Use symbol search to get price info
                        symbol_response = self.client.reference_data.symbol_search_user_account(
                            user_id=credentials['snaptrade_user_id'],
                            user_secret=credentials['snaptrade_user_secret'],
                            account_id=account_id,
                            substring=symbol
                        )
                        
                        # Find exact symbol match
                        symbol_data = None
                        for s in symbol_response.body:
                            if s.get('symbol') == symbol:
                                symbol_data = s
                                break
                        
                        if symbol_data and symbol_data.get('id') == universal_symbol_id:
                            # Get a quote for the symbol to get current price
                            # First try with a small test order to get the price from impact
                            test_impact = self.client.trading.get_order_impact(
                                user_id=credentials['snaptrade_user_id'],
                                user_secret=credentials['snaptrade_user_secret'],
                                account_id=account_id,
                                action=action,
                                universal_symbol_id=universal_symbol_id,
                                order_type=order_type,
                                time_in_force=time_in_force,
                                units=0.001  # Tiny amount just to get price
                            )
                            current_price = test_impact.body.get('trade', {}).get('price')
                            
                            if current_price and current_price > 0:
                                # Calculate units from notional value
                                raw_units = float(notional_value) / float(current_price)
                                
                                # PRODUCTION-GRADE FIX: Handle fractional share limitations
                                # Many brokerages don't allow selling fractional shares when you hold whole shares
                                # For SELL orders, we round DOWN to whole shares to avoid this error
                                if action == 'SELL':
                                    import math
                                    whole_units = math.floor(raw_units)
                                    
                                    if whole_units == 0:
                                        # User is trying to sell less than 1 share
                                        min_sell_value = float(current_price)
                                        return {
                                            'success': False,
                                            'error': f'Minimum sell amount is 1 share (${min_sell_value:.2f}). Your ${notional_value:.2f} order equals {raw_units:.3f} shares. Please sell at least ${min_sell_value:.2f} worth.'
                                        }
                                    
                                    # CRITICAL: SnapTrade API expects float/Decimal, not int
                                    order_units = float(whole_units)
                                    logger.info(f"SELL order: Converted notional ${notional_value} to {order_units} whole shares (raw: {raw_units:.4f}) at ${current_price}/share")
                                else:
                                    # For BUY orders, fractional shares are usually supported
                                    # PRODUCTION-GRADE FIX: Round UP to ensure we meet minimum order amounts
                                    # Some brokerages (like Webull) have a strict $5 minimum and rounding down
                                    # can cause the final amount to be $4.999 which fails
                                    import math
                                    # Round up to 4 decimal places to ensure we meet the minimum
                                    order_units = math.ceil(raw_units * 10000) / 10000
                                    logger.info(f"BUY order: Converted notional ${notional_value} to {order_units} units (rounded UP) at ${current_price}/share")
                            else:
                                logger.warning(f"Could not get price for {symbol}, using notional_value directly")
                    except Exception as price_error:
                        # If we can't get price, the order will likely fail with a clear error
                        logger.warning(f"Could not convert notional to units: {price_error}")
                        # Fall through and try with notional_value anyway
                
                # STEP 1: Get order impact (validates market hours, symbol, buying power)
                try:
                    # Build order params - prefer units over notional_value for broader brokerage support
                    # Use explicit `is not None` checks for defensive programming
                    order_params = {
                        'user_id': credentials['snaptrade_user_id'],
                        'user_secret': credentials['snaptrade_user_secret'],
                        'account_id': account_id,
                        'action': action,
                        'universal_symbol_id': universal_symbol_id,
                        'order_type': order_type,
                        'time_in_force': time_in_force,
                    }
                    
                    if order_units is not None:
                        order_params['units'] = float(order_units)
                    elif notional_value is not None:
                        # Fallback to notional if units conversion failed
                        order_params['notional_value'] = float(notional_value)
                    
                    if price is not None:
                        order_params['price'] = float(price)
                    if stop is not None:
                        order_params['stop'] = float(stop)
                    
                    impact_response = self.client.trading.get_order_impact(**order_params)
                    
                    # Extract trade_id from impact response
                    impact_trade = impact_response.body.get('trade', {})
                    impact_trade_id = impact_trade.get('id')
                    
                    if not impact_trade_id:
                        logger.error(f"No trade_id in impact response: {impact_response.body}")
                        return {
                            'success': False,
                            'error': 'Unable to process this order right now. Please try again in a moment.'
                        }
                    
                    logger.info(f"Order validated, trade_id: {impact_trade_id}")
                    
                except Exception as impact_error:
                    error_str = str(impact_error)
                    
                    # PRODUCTION-GRADE: If market is closed, queue the order instead of failing
                    if is_market_closed_error(error_str):
                        logger.info(f"Market closed - queueing order for {action} {symbol}")
                        return self.queue_order(
                            user_id=user_id,
                            account_id=account_id,
                            symbol=symbol,
                            action=action,
                            order_type=order_type,
                            time_in_force=time_in_force,
                            notional_value=notional_value,
                            units=units,
                            price=price,
                            stop_price=stop
                        )
                    # Handle symbol not tradeable on this brokerage (code 1063)
                    elif '1063' in error_str or 'failed to obtain symbol' in error_str.lower() or 'unable to obtain symbol' in error_str.lower():
                        return {
                            'success': False,
                            'error': f"The symbol '{symbol}' is not available for trading on your connected brokerage. This stock may not be supported by Webull. Try trading ETFs like VTI, SPY, or QQQ instead."
                        }
                    elif 'insufficient' in error_str.lower() or 'buying power' in error_str.lower():
                        return {
                            'success': False,
                            'error': 'Insufficient buying power to place this order.'
                        }
                    elif 'permission' in error_str.lower():
                        return {
                            'success': False,
                            'error': 'Your account does not have permission to place this type of order.'
                        }
                    elif 'FRACT_NOT_CLOSE_INT_POSITION' in error_str or 'fractional shares trading is not available' in error_str.lower():
                        # Brokerage doesn't allow selling fractional shares from whole-share positions
                        return {
                            'success': False,
                            'error': 'This brokerage requires selling whole shares only. Please adjust your sell amount to at least 1 full share.'
                        }
                    else:
                        logger.error(f"Order impact validation failed: {impact_error}")
                        # Simplify technical errors for user display
                        user_error = error_str
                        if len(error_str) > 150:
                            user_error = "Unable to validate order with your brokerage. Please try again."
                        return {
                            'success': False,
                            'error': f'Order failed: {user_error}'
                        }
                
                # STEP 2: Place the order using the validated trade_id
                logger.info(f"Placing validated order with trade_id: {impact_trade_id}")
                
                response = self.client.trading.place_order(
                    user_id=credentials['snaptrade_user_id'],
                    user_secret=credentials['snaptrade_user_secret'],
                    trade_id=impact_trade_id,
                    wait_to_confirm=True
                )
            
            # Parse response
            order_data = response.body
            
            logger.info(f"✅ Order placed successfully: {order_data.get('brokerage_order_id')}")
            
            return {
                'success': True,
                'order': {
                    'brokerage_order_id': order_data.get('brokerage_order_id'),
                    'status': order_data.get('status'),
                    'symbol': symbol or (order_data.get('universal_symbol', {}).get('symbol')),
                    'action': action or order_data.get('action'),
                    'quantity': float(order_data.get('total_quantity', 0)),
                    'filled_quantity': float(order_data.get('filled_quantity', 0)),
                    'execution_price': float(order_data.get('execution_price', 0)) if order_data.get('execution_price') else None,
                    'order_type': order_data.get('order_type'),
                    'time_placed': order_data.get('time_placed')
                }
            }
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error placing order: {e}", exc_info=True)
            
            # PRODUCTION-GRADE: Handle specific brokerage error messages with user-friendly responses
            if 'FRACT_NOT_CLOSE_INT_POSITION' in error_str or 'fractional shares trading is not available' in error_str.lower():
                return {
                    'success': False,
                    'error': 'This brokerage requires selling whole shares only. Please adjust your sell amount to at least 1 full share.'
                }
            
            # Handle minimum order amount error (code 1119 - Webull fractional share minimum)
            if '1119' in error_str or 'minimum order amount' in error_str.lower() or 'FRACT_AMOUNT_GREAT_5' in error_str:
                return {
                    'success': False,
                    'error': 'The minimum order amount for fractional shares is $5. Please increase your order amount slightly above $5 to account for price fluctuations.'
                }
            
            # Handle symbol not tradeable on this brokerage (code 1063)
            if '1063' in error_str or 'failed to obtain symbol' in error_str.lower() or 'unable to obtain symbol' in error_str.lower():
                return {
                    'success': False,
                    'error': f"This symbol is not available for trading on your connected brokerage. Try trading ETFs like VTI, SPY, or QQQ instead."
                }
            
            # Simplify technical errors for user display
            user_error = error_str
            if len(error_str) > 150:
                user_error = "Unable to complete order with your brokerage. Please try again."
            return {
                'success': False,
                'error': f'Order failed: {user_error}'
            }
    
    def cancel_order(
        self,
        user_id: str,
        account_id: str,
        brokerage_order_id: str
    ) -> Dict[str, Any]:
        """
        Cancel an open order.
        
        Args:
            user_id: Platform user ID
            account_id: SnapTrade account ID (UUID format)
            brokerage_order_id: Order ID from brokerage
            
        Returns:
            {
                'success': bool,
                'message': str,
                'error': str (if unsuccessful)
            }
        """
        try:
            # Get user credentials
            credentials = self.get_user_credentials(user_id)
            if not credentials:
                return {
                    'success': False,
                    'error': 'SnapTrade credentials not found. Please reconnect your brokerage account.'
                }
            
            logger.info(f"Cancelling order: {brokerage_order_id} from account {account_id}")
            
            # Call SnapTrade cancel order API
            response = self.client.trading.cancel_order(
                user_id=credentials['snaptrade_user_id'],
                user_secret=credentials['snaptrade_user_secret'],
                account_id=account_id,
                brokerage_order_id=brokerage_order_id
            )
            
            logger.info(f"✅ Order cancelled successfully: {brokerage_order_id}")
            
            return {
                'success': True,
                'message': f'Order {brokerage_order_id} cancelled successfully',
                'response': response.body
            }
            
        except Exception as e:
            logger.error(f"Error cancelling order: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unable to cancel order. Please try again or contact your brokerage.'
            }
    
    def get_account_orders(
        self,
        user_id: str,
        account_id: str,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get orders for a specific account.
        
        Args:
            user_id: Platform user ID
            account_id: SnapTrade account ID (UUID format)
            status: Filter by status ('OPEN', 'EXECUTED', 'CANCELLED', etc.)
            
        Returns:
            {
                'success': bool,
                'orders': List[Dict],
                'error': str (if unsuccessful)
            }
        """
        try:
            # Get user credentials
            credentials = self.get_user_credentials(user_id)
            if not credentials:
                return {
                    'success': False,
                    'error': 'SnapTrade credentials not found.',
                    'orders': []
                }
            
            logger.info(f"Fetching orders for account {account_id}")
            
            # Call SnapTrade get orders API
            response = self.client.account_information.get_user_account_orders(
                user_id=credentials['snaptrade_user_id'],
                user_secret=credentials['snaptrade_user_secret'],
                account_id=account_id
            )
            
            orders = response.body or []
            
            # Filter by status if provided
            if status:
                orders = [o for o in orders if o.get('status') == status]
            
            logger.info(f"✅ Found {len(orders)} orders")
            
            return {
                'success': True,
                'orders': orders
            }
            
        except Exception as e:
            logger.error(f"Error fetching orders: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unable to load orders. Please refresh and try again.',
                'orders': []
            }


# Global service instance
_snaptrade_trading_service = None

def get_snaptrade_trading_service() -> SnapTradeTradingService:
    """Get the global SnapTrade trading service instance."""
    global _snaptrade_trading_service
    if _snaptrade_trading_service is None:
        _snaptrade_trading_service = SnapTradeTradingService()
    return _snaptrade_trading_service

