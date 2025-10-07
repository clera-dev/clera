"""
Alpaca Portfolio Provider for Clera brokerage account integration.

This provider implements the AbstractPortfolioProvider interface using existing
Alpaca broker client infrastructure for seamless integration.
"""

import logging
import uuid
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from decimal import Decimal

from .abstract_provider import (
    AbstractPortfolioProvider, Account, Position, Transaction, PerformanceData, ProviderError
)

logger = logging.getLogger(__name__)

class AlpacaPortfolioProvider(AbstractPortfolioProvider):
    """
    Portfolio provider for Clera's Alpaca brokerage integration.
    
    Uses existing Alpaca broker client infrastructure to fetch positions,
    accounts, and transactions for users with Clera brokerage accounts.
    """
    
    def __init__(self):
        """Initialize Alpaca provider."""
        self.provider_name = "alpaca"
        logger.info("✅ Alpaca provider initialized")
    
    async def get_accounts(self, user_id: str) -> List[Account]:
        """Get Clera brokerage account for user."""
        try:
            logger.info(f"Fetching Clera brokerage account for user {user_id}")
            
            # Get user's Alpaca account ID using existing utility
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            result = supabase.table('user_onboarding')\
                .select('alpaca_account_id, alpaca_account_status')\
                .eq('user_id', user_id)\
                .single()
            
            if not result.data or not result.data.get('alpaca_account_id'):
                logger.info(f"No Clera brokerage account found for user {user_id}")
                return []
            
            alpaca_account_id = result.data['alpaca_account_id']
            account_status = result.data.get('alpaca_account_status', 'active')
            
            # Get account details using existing broker client
            from utils.alpaca.broker_client_factory import get_broker_client
            broker_client = get_broker_client()
            
            account_uuid = uuid.UUID(alpaca_account_id)
            account_details = await asyncio.to_thread(
                broker_client.get_account_by_id, 
                account_id=account_uuid
            )
            
            trade_account = await asyncio.to_thread(
                broker_client.get_trade_account_by_id,
                account_id=account_uuid
            )
            
            # Create Account object
            account = Account(
                id=f"clera_{alpaca_account_id}",
                provider=self.provider_name,
                provider_account_id=alpaca_account_id,
                account_type="brokerage",
                institution_name="Clera",
                account_name="Clera Brokerage Account",
                balance=float(trade_account.cash or 0),
                is_active=account_status == 'active'
            )
            
            logger.info(f"✅ Retrieved Clera account for user {user_id}: ${account.balance:,.2f}")
            return [account]
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to fetch Clera account for user {user_id}: {str(e)}",
                self.provider_name,
                "FETCH_ACCOUNTS_ERROR",
                e
            )
    
    async def get_positions(self, user_id: str, account_id: Optional[str] = None) -> List[Position]:
        """Get positions from Clera brokerage account."""
        try:
            logger.info(f"Fetching Clera brokerage positions for user {user_id}")
            
            # Get user's Alpaca account ID
            alpaca_account_id = await self._get_user_alpaca_account_id(user_id)
            if not alpaca_account_id:
                return []
            
            # Get positions using existing Alpaca broker client
            from utils.alpaca.broker_client_factory import get_broker_client
            broker_client = get_broker_client()
            
            account_uuid = uuid.UUID(alpaca_account_id)
            alpaca_positions = await asyncio.to_thread(
                broker_client.get_all_positions_for_account,
                account_id=account_uuid
            )
            
            if not alpaca_positions:
                logger.info(f"No Clera positions found for user {user_id}")
                return []
            
            # Transform Alpaca positions to Position objects
            positions = []
            for alpaca_pos in alpaca_positions:
                position = Position(
                    symbol=alpaca_pos.symbol,
                    quantity=float(alpaca_pos.qty or 0),
                    market_value=float(alpaca_pos.market_value or 0),
                    cost_basis=float(alpaca_pos.cost_basis or 0),
                    account_id=f"clera_{alpaca_account_id}",
                    institution_name="Clera",
                    security_type=self._map_alpaca_asset_class(alpaca_pos.asset_class),
                    
                    # Additional Alpaca-specific data
                    current_price=float(alpaca_pos.current_price or 0),
                    unrealized_gain_loss=float(alpaca_pos.unrealized_pl or 0),
                    unrealized_gain_loss_percent=float(alpaca_pos.unrealized_plpc or 0),
                    side=str(alpaca_pos.side.value) if alpaca_pos.side else 'long',
                    
                    # Intraday data (unique to Alpaca)
                    unrealized_intraday_pl=float(alpaca_pos.unrealized_intraday_pl or 0),
                    unrealized_intraday_plpc=float(alpaca_pos.unrealized_intraday_plpc or 0),
                    change_today=float(alpaca_pos.change_today or 0)
                )
                positions.append(position)
            
            logger.info(f"✅ Retrieved {len(positions)} Clera positions for user {user_id}")
            return positions
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to fetch Clera positions for user {user_id}: {str(e)}",
                self.provider_name,
                "FETCH_POSITIONS_ERROR",
                e
            )
    
    async def get_transactions(self, user_id: str, account_id: Optional[str] = None, 
                              start_date: Optional[datetime] = None, 
                              end_date: Optional[datetime] = None) -> List[Transaction]:
        """Get transactions from Clera brokerage account."""
        try:
            logger.info(f"Fetching Clera transactions for user {user_id}")
            
            alpaca_account_id = await self._get_user_alpaca_account_id(user_id)
            if not alpaca_account_id:
                return []
            
            # Use existing Alpaca order/transaction fetching logic
            from utils.alpaca.broker_client_factory import get_broker_client
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            
            broker_client = get_broker_client()
            account_uuid = uuid.UUID(alpaca_account_id)
            
            # Get orders (which represent transactions in Alpaca)
            order_filter = GetOrdersRequest(
                status=QueryOrderStatus.FILLED,
                limit=100
            )
            
            orders = await asyncio.to_thread(
                broker_client.get_orders_for_account,
                account_id=account_uuid,
                filter=order_filter
            )
            
            # Transform orders to Transaction objects
            transactions = []
            for order in orders:
                if order.filled_at:  # Only include filled orders
                    transaction = Transaction(
                        id=f"clera_{order.id}",
                        account_id=f"clera_{alpaca_account_id}",
                        symbol=order.symbol,
                        type=str(order.side.value).lower(),  # 'buy' or 'sell'
                        quantity=float(order.filled_qty or 0),
                        price=float(order.filled_avg_price or 0),
                        amount=float(order.filled_qty or 0) * float(order.filled_avg_price or 0),
                        date=order.filled_at,
                        description=f"{order.side.value} {order.qty} {order.symbol}"
                    )
                    transactions.append(transaction)
            
            logger.info(f"✅ Retrieved {len(transactions)} Clera transactions for user {user_id}")
            return transactions
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to fetch Clera transactions for user {user_id}: {str(e)}",
                self.provider_name,
                "FETCH_TRANSACTIONS_ERROR",
                e
            )
    
    async def get_performance(self, user_id: str, account_id: Optional[str] = None) -> PerformanceData:
        """Calculate performance metrics from Clera positions."""
        try:
            positions = await self.get_positions(user_id, account_id)
            
            if not positions:
                return PerformanceData(
                    total_return=0.0,
                    total_return_percentage=0.0,
                    daily_return=0.0,
                    daily_return_percentage=0.0,
                    period_returns={}
                )
            
            # Calculate totals
            total_market_value = sum(pos.market_value for pos in positions)
            total_cost_basis = sum(pos.cost_basis for pos in positions)
            total_unrealized_pl = sum(getattr(pos, 'unrealized_gain_loss', 0) for pos in positions)
            total_intraday_pl = sum(getattr(pos, 'unrealized_intraday_pl', 0) for pos in positions)
            
            # Calculate percentages
            total_return_percentage = (
                (total_unrealized_pl / total_cost_basis * 100) 
                if total_cost_basis > 0 else 0.0
            )
            
            daily_return_percentage = (
                (total_intraday_pl / (total_market_value - total_intraday_pl) * 100)
                if (total_market_value - total_intraday_pl) > 0 else 0.0
            )
            
            # TODO: Calculate period returns using historical data
            period_returns = {
                '1D': daily_return_percentage,
                '1W': 0.0,  # Requires historical data
                '1M': 0.0,  # Requires historical data
                '3M': 0.0,  # Requires historical data
                '1Y': total_return_percentage  # Use total as proxy
            }
            
            return PerformanceData(
                total_return=total_unrealized_pl,
                total_return_percentage=total_return_percentage,
                daily_return=total_intraday_pl,
                daily_return_percentage=daily_return_percentage,
                period_returns=period_returns
            )
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to calculate Clera performance for user {user_id}: {str(e)}",
                self.provider_name,
                "PERFORMANCE_CALCULATION_ERROR",
                e
            )
    
    async def refresh_data(self, user_id: str, account_id: Optional[str] = None) -> bool:
        """Refresh cached Clera data."""
        try:
            logger.info(f"Refreshing Clera data for user {user_id}")
            
            # For Alpaca, we don't typically cache data since it's real-time
            # This method validates connectivity and data access
            accounts = await self.get_accounts(user_id)
            positions = await self.get_positions(user_id, account_id)
            
            logger.info(f"✅ Clera refresh successful: {len(accounts)} accounts, {len(positions)} positions")
            return True
            
        except Exception as e:
            logger.error(f"Failed to refresh Clera data for user {user_id}: {e}")
            return False
    
    def get_provider_name(self) -> str:
        """Get the name of this provider."""
        return self.provider_name
    
    async def health_check(self) -> Dict[str, Any]:
        """Check Alpaca broker client connectivity."""
        try:
            from utils.alpaca.broker_client_factory import get_broker_client
            
            # Test broker client initialization
            broker_client = get_broker_client()
            
            # TODO: Add actual health check API call if available
            return {
                "status": "healthy",
                "provider": self.provider_name,
                "last_checked": datetime.now().isoformat(),
                "capabilities": ["accounts", "positions", "transactions", "real_time_data"]
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "provider": self.provider_name,
                "error": str(e),
                "last_checked": datetime.now().isoformat()
            }
    
    async def _get_user_alpaca_account_id(self, user_id: str) -> Optional[str]:
        """Get user's Alpaca account ID from onboarding data."""
        try:
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            result = supabase.table('user_onboarding')\
                .select('alpaca_account_id')\
                .eq('user_id', user_id)\
                .single()
            
            return result.data.get('alpaca_account_id') if result.data else None
            
        except Exception as e:
            logger.error(f"Error getting Alpaca account ID for user {user_id}: {e}")
            return None
    
    def _map_alpaca_asset_class(self, asset_class) -> str:
        """Map Alpaca asset class to normalized security type."""
        if not asset_class:
            return 'equity'
        
        # Use existing asset class mapping logic
        asset_class_str = str(asset_class.value) if hasattr(asset_class, 'value') else str(asset_class)
        
        mapping = {
            'us_equity': 'equity',
            'crypto': 'crypto',
            'option': 'option', 
            'cash': 'cash'
        }
        
        return mapping.get(asset_class_str.lower(), 'equity')

# Utility function for getting Clera positions in aggregated format
async def get_clera_positions_aggregated(user_id: str) -> List[Dict[str, Any]]:
    """
    Get Clera brokerage positions in aggregated format compatible with Plaid positions.
    
    This function bridges existing Alpaca integration with the new portfolio aggregation system.
    
    Args:
        user_id: User identifier
        
    Returns:
        List of positions in aggregated format matching Plaid structure
    """
    try:
        logger.info(f"🏦 Fetching Clera positions for user {user_id}")
        
        # Use the provider to get positions
        provider = AlpacaPortfolioProvider()
        positions = await provider.get_positions(user_id)
        
        if not positions:
            logger.info(f"No Clera positions found for user {user_id}")
            return []
        
        # Get account ID for position attribution
        alpaca_account_id = await provider._get_user_alpaca_account_id(user_id)
        
        # Transform to aggregated format matching Plaid structure
        aggregated_positions = []
        
        for position in positions:
            # Calculate unrealized gain/loss percentage
            unrealized_gain_loss_percent = 0.0
            if position.cost_basis > 0:
                unrealized_gain_loss_percent = (
                    (position.market_value - position.cost_basis) / position.cost_basis * 100
                )
            
            aggregated_position = {
                'symbol': position.symbol,
                'security_name': position.symbol,  # Alpaca uses symbol as name
                'security_type': position.security_type,
                'total_quantity': position.quantity,
                'total_market_value': position.market_value,
                'total_cost_basis': position.cost_basis,
                'average_cost_basis': position.cost_basis / position.quantity if position.quantity > 0 else 0,
                'unrealized_gain_loss': position.market_value - position.cost_basis,
                'unrealized_gain_loss_percent': unrealized_gain_loss_percent,
                'accounts': [{
                    'account_id': f'clera_{alpaca_account_id}',
                    'quantity': position.quantity,
                    'market_value': position.market_value,
                    'cost_basis': position.cost_basis,
                    'institution': 'Clera'
                }],
                'institutions': ['Clera'],
                
                # Alpaca-specific data (not available in Plaid)
                'current_price': getattr(position, 'current_price', 0),
                'change_today': getattr(position, 'change_today', 0),
                'change_today_percent': getattr(position, 'unrealized_intraday_plpc', 0),
                'side': getattr(position, 'side', 'long'),
                'is_marginable': getattr(position, 'asset_marginable', False),
                'is_shortable': getattr(position, 'asset_shortable', False),
                'is_easy_to_borrow': getattr(position, 'asset_easy_to_borrow', False)
            }
            aggregated_positions.append(aggregated_position)
        
        logger.info(f"🏦 Transformed {len(aggregated_positions)} Clera positions for user {user_id}")
        return aggregated_positions
        
    except Exception as e:
        logger.error(f"Error fetching Clera aggregated positions for user {user_id}: {e}")
        return []
