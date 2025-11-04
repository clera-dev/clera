"""
SnapTrade Trading Service

PRODUCTION-GRADE: Handles trade execution via SnapTrade API with:
- Order impact validation (check before placing)
- Trade placement with proper error handling
- Order status tracking
- Order cancellation
- Multi-account support

Follows SOLID principles and SnapTrade best practices.
"""

import os
import logging
from typing import Dict, Any, Optional, List
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


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
        Get SnapTrade universal symbol ID for a ticker.
        
        Args:
            ticker: Stock symbol (e.g., 'AAPL')
            
        Returns:
            Universal symbol ID or None if not found
        """
        try:
            logger.info(f"Looking up universal symbol ID for {ticker}")
            
            # Search for symbol in SnapTrade
            response = self.client.reference_data.get_symbols_by_ticker(query=ticker)
            
            if not response.body or len(response.body) == 0:
                logger.warning(f"Symbol {ticker} not found in SnapTrade")
                return None
            
            # Return the first matching symbol's ID
            universal_symbol_id = response.body[0]['id']
            logger.info(f"Found universal symbol ID for {ticker}: {universal_symbol_id}")
            
            return universal_symbol_id
            
        except Exception as e:
            logger.error(f"Error looking up symbol {ticker}: {e}")
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
            
            # Get universal symbol ID
            universal_symbol_id = self.get_universal_symbol_id(symbol)
            if not universal_symbol_id:
                return {
                    'success': False,
                    'error': f'Symbol {symbol} not found or not supported for trading.'
                }
            
            logger.info(f"Checking order impact: {action} {symbol} via account {account_id}")
            
            # Call SnapTrade order impact API
            # CRITICAL FIX: Removed trading_session parameter (not in SDK)
            response = self.client.trading.get_order_impact(
                user_id=credentials['snaptrade_user_id'],
                user_secret=credentials['snaptrade_user_secret'],
                account_id=account_id,
                action=action,
                universal_symbol_id=universal_symbol_id,
                order_type=order_type,
                time_in_force=time_in_force,
                notional_value=Decimal(str(notional_value)) if notional_value else None,
                units=units,
                price=price,
                stop=stop
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
                'error': f'Failed to validate order: {str(e)}'
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
        
        PRODUCTION-GRADE: Two methods of order placement:
        1. Using trade_id from check_order_impact (recommended)
        2. Direct placement with order parameters (force order)
        
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
                
            # Method 2: Force place order directly (no impact check)
            else:
                if not all([symbol, action, order_type, time_in_force]):
                    return {
                        'success': False,
                        'error': 'Missing required order parameters: symbol, action, order_type, time_in_force'
                    }
                
                # Get universal symbol ID
                universal_symbol_id = self.get_universal_symbol_id(symbol)
                if not universal_symbol_id:
                    return {
                        'success': False,
                        'error': f'Symbol {symbol} not found or not supported for trading.'
                    }
                
                logger.info(f"Force placing order: {action} {symbol} via account {account_id}")
                
                # CRITICAL FIX: Removed trading_session parameter (not in SDK)
                response = self.client.trading.place_force_order(
                    user_id=credentials['snaptrade_user_id'],
                    user_secret=credentials['snaptrade_user_secret'],
                    account_id=account_id,
                    action=action,
                    universal_symbol_id=universal_symbol_id,
                    order_type=order_type,
                    time_in_force=time_in_force,
                    notional_value=Decimal(str(notional_value)) if notional_value else None,
                    units=units,
                    price=price,
                    stop=stop
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
            logger.error(f"Error placing order: {e}", exc_info=True)
            return {
                'success': False,
                'error': f'Failed to place order: {str(e)}'
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
                'error': f'Failed to cancel order: {str(e)}'
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
                'error': f'Failed to fetch orders: {str(e)}',
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

