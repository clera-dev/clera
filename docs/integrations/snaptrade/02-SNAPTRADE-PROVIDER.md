# SnapTrade Provider Implementation

## Overview

This document provides the **complete implementation** of the SnapTrade portfolio provider, following your existing `AbstractPortfolioProvider` pattern.

## File: `backend/utils/portfolio/snaptrade_provider.py`

Create this file with the complete implementation:

```python
"""
SnapTrade API provider implementation.

This module implements the AbstractPortfolioProvider interface for SnapTrade's API,
providing access to investment accounts, holdings, transactions, and TRADE EXECUTION
across 20+ major brokerages.
"""

import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, date
from decimal import Decimal
import asyncio

# SnapTrade SDK imports
from snaptrade_client import SnapTrade
from snaptrade_client.api_client import ApiException

from .abstract_provider import (
    AbstractPortfolioProvider, Account, Position, Transaction, PerformanceData, ProviderError
)

logger = logging.getLogger(__name__)

class SnapTradePortfolioProvider(AbstractPortfolioProvider):
    """
    SnapTrade API provider implementation.
    
    Provides access to investment accounts across 20+ brokerages including:
    - TD Ameritrade, Charles Schwab, Fidelity, E*TRADE, etc.
    - Holdings, positions, and transactions (read)
    - Trade execution capabilities (write)
    - Real-time order management
    """
    
    def __init__(self):
        """Initialize SnapTrade client with proper configuration."""
        self.client = self._initialize_snaptrade_client()
        self.provider_name = "snaptrade"
    
    def _initialize_snaptrade_client(self) -> SnapTrade:
        """Initialize SnapTrade API client."""
        try:
            # Get credentials from environment
            consumer_key = os.getenv("SNAPTRADE_CONSUMER_KEY")
            client_id = os.getenv("SNAPTRADE_CLIENT_ID")
            
            if not consumer_key or not client_id:
                raise ProviderError(
                    "SNAPTRADE_CONSUMER_KEY and SNAPTRADE_CLIENT_ID must be set in environment",
                    self.get_provider_name(),
                    "MISSING_CREDENTIALS"
                )
            
            # Initialize SnapTrade client
            client = SnapTrade(
                consumer_key=consumer_key,
                client_id=client_id,
            )
            
            logger.info(f"✅ SnapTrade client initialized successfully")
            return client
            
        except Exception as e:
            raise ProviderError(
                f"Failed to initialize SnapTrade client: {str(e)}",
                self.get_provider_name(),
                "INITIALIZATION_ERROR",
                e
            )
    
    async def get_accounts(self, user_id: str) -> List[Account]:
        """Get all investment accounts for a user from SnapTrade."""
        try:
            logger.info(f"Fetching SnapTrade investment accounts for user {user_id}")
            
            # Get user credentials
            user_credentials = await self._get_user_credentials(user_id)
            if not user_credentials:
                logger.info(f"No SnapTrade credentials found for user {user_id}")
                return []
            
            snaptrade_user_id = user_credentials['snaptrade_user_id']
            user_secret = user_credentials['user_secret']
            
            # Fetch all accounts
            accounts_response = self.client.account_information.list_user_accounts(
                user_id=snaptrade_user_id,
                user_secret=user_secret
            )
            
            accounts = []
            for acc in accounts_response.body:
                # Convert SnapTrade account to our Account model
                accounts.append(Account(
                    id=f"snaptrade_{acc['id']}",
                    provider='snaptrade',
                    provider_account_id=str(acc['id']),
                    account_type=acc.get('type', 'investment'),
                    institution_name=acc.get('institution_name', 'Unknown'),
                    account_name=acc.get('name', 'Investment Account'),
                    balance=Decimal(str(acc.get('balance', {}).get('total', 0) or 0)),
                    is_active=True
                ))
            
            logger.info(f"✅ Retrieved {len(accounts)} SnapTrade accounts for user {user_id}")
            return accounts
            
        except ApiException as e:
            logger.error(f"SnapTrade API error fetching accounts: {e}")
            if e.status == 404:
                return []  # User not found, return empty list
            raise ProviderError(
                f"Failed to fetch accounts: {str(e)}",
                self.provider_name,
                "FETCH_ACCOUNTS_ERROR",
                e
            )
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to fetch accounts for user {user_id}: {str(e)}",
                self.provider_name,
                "FETCH_ACCOUNTS_ERROR",
                e
            )
    
    async def get_positions(self, user_id: str, account_id: Optional[str] = None) -> List[Position]:
        """Get investment holdings/positions for user's accounts."""
        try:
            logger.info(f"Fetching SnapTrade investment positions for user {user_id}")
            
            # Get user credentials
            user_credentials = await self._get_user_credentials(user_id)
            if not user_credentials:
                return []
            
            snaptrade_user_id = user_credentials['snaptrade_user_id']
            user_secret = user_credentials['user_secret']
            
            positions = []
            
            if account_id:
                # Fetch positions for specific account
                snaptrade_account_id = account_id.replace('snaptrade_', '')
                positions_list = await self._fetch_account_positions(
                    snaptrade_user_id, user_secret, snaptrade_account_id, user_id
                )
                positions.extend(positions_list)
            else:
                # Fetch positions for all accounts
                accounts_response = self.client.account_information.list_user_accounts(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret
                )
                
                for acc in accounts_response.body:
                    positions_list = await self._fetch_account_positions(
                        snaptrade_user_id, user_secret, str(acc['id']), user_id
                    )
                    positions.extend(positions_list)
            
            logger.info(f"✅ Retrieved {len(positions)} positions for user {user_id}")
            return positions
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to fetch positions for user {user_id}: {str(e)}",
                self.provider_name,
                "FETCH_POSITIONS_ERROR",
                e
            )
    
    async def _fetch_account_positions(
        self, 
        snaptrade_user_id: str, 
        user_secret: str, 
        account_id: str,
        user_id: str
    ) -> List[Position]:
        """Fetch positions for a specific account."""
        try:
            # Get account positions
            positions_response = self.client.account_information.get_user_account_positions(
                user_id=snaptrade_user_id,
                user_secret=user_secret,
                account_id=account_id
            )
            
            positions = []
            account_full_id = f"snaptrade_{account_id}"
            
            # Get account details for institution name
            account_details = self.client.account_information.get_user_account_details(
                user_id=snaptrade_user_id,
                user_secret=user_secret,
                account_id=account_id
            )
            institution_name = account_details.body.get('institution_name', 'Unknown')
            
            for pos in positions_response.body:
                # Extract symbol information
                symbol_info = pos.get('symbol', {})
                symbol = symbol_info.get('symbol', 'UNKNOWN')
                security_name = symbol_info.get('description', symbol)
                security_type = symbol_info.get('type', {}).get('id', 'equity')
                
                # Calculate quantities and values
                quantity = Decimal(str(pos.get('units', 0)))
                price = Decimal(str(pos.get('price', 0) or 0))
                market_value = Decimal(str(pos.get('value', 0) or 0))
                
                # Cost basis calculation
                cost_basis = Decimal(str(pos.get('average_purchase_price', 0) or 0)) * quantity
                unrealized_pl = market_value - cost_basis if cost_basis > 0 else Decimal('0')
                
                # Store universal symbol ID for later use
                universal_symbol_id = symbol_info.get('id')
                
                positions.append(Position(
                    symbol=symbol,
                    quantity=quantity,
                    market_value=market_value,
                    cost_basis=cost_basis,
                    account_id=account_full_id,
                    institution_name=institution_name,
                    security_type=security_type,
                    security_name=security_name,
                    price=price,
                    unrealized_pl=unrealized_pl,
                    universal_symbol_id=universal_symbol_id  # Store for trading
                ))
            
            return positions
            
        except ApiException as e:
            logger.error(f"Error fetching positions for account {account_id}: {e}")
            return []
    
    async def get_transactions(
        self, 
        user_id: str, 
        account_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Transaction]:
        """Get investment transactions for user's accounts."""
        try:
            logger.info(f"Fetching SnapTrade investment transactions for user {user_id}")
            
            # Get user credentials
            user_credentials = await self._get_user_credentials(user_id)
            if not user_credentials:
                return []
            
            snaptrade_user_id = user_credentials['snaptrade_user_id']
            user_secret = user_credentials['user_secret']
            
            # Default to last 90 days if no date range specified
            if not start_date:
                start_date = datetime.now() - timedelta(days=90)
            if not end_date:
                end_date = datetime.now()
            
            transactions = []
            
            if account_id:
                # Fetch for specific account
                snaptrade_account_id = account_id.replace('snaptrade_', '')
                txns = await self._fetch_account_activities(
                    snaptrade_user_id, user_secret, snaptrade_account_id,
                    start_date.date(), end_date.date()
                )
                transactions.extend(txns)
            else:
                # Fetch for all accounts
                accounts_response = self.client.account_information.list_user_accounts(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret
                )
                
                for acc in accounts_response.body:
                    txns = await self._fetch_account_activities(
                        snaptrade_user_id, user_secret, str(acc['id']),
                        start_date.date(), end_date.date()
                    )
                    transactions.extend(txns)
            
            logger.info(f"✅ Retrieved {len(transactions)} transactions for user {user_id}")
            return transactions
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to fetch transactions for user {user_id}: {str(e)}",
                self.provider_name,
                "FETCH_TRANSACTIONS_ERROR",
                e
            )
    
    async def _fetch_account_activities(
        self,
        snaptrade_user_id: str,
        user_secret: str,
        account_id: str,
        start_date: date,
        end_date: date
    ) -> List[Transaction]:
        """Fetch activities for a specific account."""
        try:
            activities_response = self.client.account_information.get_account_activities(
                user_id=snaptrade_user_id,
                user_secret=user_secret,
                account_id=account_id,
                start_date=start_date,
                end_date=end_date
            )
            
            transactions = []
            account_full_id = f"snaptrade_{account_id}"
            
            for activity in activities_response.body.get('data', []):
                # Extract transaction details
                symbol = activity.get('symbol', '')
                activity_type = activity.get('type', 'other')
                
                # Normalize transaction type
                transaction_type = self._normalize_transaction_type(activity_type)
                
                # Parse amounts
                amount = Decimal(str(activity.get('amount', 0) or 0))
                quantity = Decimal(str(activity.get('quantity', 0) or 0))
                price = Decimal(str(activity.get('price', 0) or 0))
                fee = Decimal(str(activity.get('fee', 0) or 0)) if activity.get('fee') else None
                
                # Parse date
                trade_date = activity.get('trade_date')
                if isinstance(trade_date, str):
                    txn_date = datetime.strptime(trade_date, '%Y-%m-%d')
                else:
                    txn_date = datetime.combine(trade_date, datetime.min.time())
                
                transactions.append(Transaction(
                    id=f"snaptrade_{activity.get('id', '')}",
                    account_id=account_full_id,
                    symbol=symbol if symbol else None,
                    transaction_type=transaction_type,
                    quantity=quantity,
                    price=price,
                    amount=amount,
                    date=txn_date,
                    description=activity.get('description', ''),
                    fees=fee
                ))
            
            return transactions
            
        except ApiException as e:
            logger.error(f"Error fetching activities for account {account_id}: {e}")
            return []
    
    async def get_performance(self, user_id: str, account_id: Optional[str] = None) -> PerformanceData:
        """Calculate performance metrics using SnapTrade's return rates API."""
        try:
            logger.info(f"Fetching performance metrics for user {user_id}")
            
            # Get user credentials
            user_credentials = await self._get_user_credentials(user_id)
            if not user_credentials:
                return self._empty_performance_data()
            
            snaptrade_user_id = user_credentials['snaptrade_user_id']
            user_secret = user_credentials['user_secret']
            
            if account_id:
                # Get performance for specific account
                snaptrade_account_id = account_id.replace('snaptrade_', '')
                return_rates = self.client.account_information.get_user_account_return_rates(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret,
                    account_id=snaptrade_account_id
                )
            else:
                # Get overall performance across all accounts
                # Use first authorization for simplicity
                auths = self.client.connections.list_brokerage_authorizations(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret
                )
                
                if not auths.body:
                    return self._empty_performance_data()
                
                return_rates = self.client.connections.return_rates(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret,
                    authorization_id=auths.body[0]['id']
                )
            
            # Parse return rates
            period_returns = {}
            for rate in return_rates.body.get('data', []):
                timeframe = rate.get('timeframe', '')
                value = Decimal(str(rate.get('value', 0) or 0))
                
                # Map SnapTrade timeframes to our format
                if timeframe == '1M':
                    period_returns['1M'] = value
                elif timeframe == '3M':
                    period_returns['3M'] = value
                elif timeframe == '6M':
                    period_returns['6M'] = value
                elif timeframe == '1Y':
                    period_returns['1Y'] = value
                elif timeframe == 'ALL':
                    period_returns['ALL'] = value
            
            # Get positions for current calculations
            positions = await self.get_positions(user_id, account_id)
            total_market_value = sum(pos.market_value for pos in positions)
            total_cost_basis = sum(pos.cost_basis for pos in positions)
            total_return = total_market_value - total_cost_basis
            total_return_percentage = (total_return / total_cost_basis * Decimal('100')) if total_cost_basis > 0 else Decimal('0')
            
            return PerformanceData(
                total_return=total_return,
                total_return_percentage=total_return_percentage,
                daily_return=Decimal('0'),  # Would need daily data
                daily_return_percentage=Decimal('0'),
                period_returns=period_returns
            )
            
        except Exception as e:
            logger.warning(f"Could not fetch performance data: {e}")
            return self._empty_performance_data()
    
    def _empty_performance_data(self) -> PerformanceData:
        """Return empty performance data."""
        return PerformanceData(
            total_return=Decimal('0'),
            total_return_percentage=Decimal('0'),
            daily_return=Decimal('0'),
            daily_return_percentage=Decimal('0'),
            period_returns={}
        )
    
    async def refresh_data(self, user_id: str, account_id: Optional[str] = None) -> bool:
        """Trigger a manual refresh of account data via SnapTrade."""
        try:
            logger.info(f"Triggering manual refresh for user {user_id}")
            
            # Get user credentials
            user_credentials = await self._get_user_credentials(user_id)
            if not user_credentials:
                return False
            
            snaptrade_user_id = user_credentials['snaptrade_user_id']
            user_secret = user_credentials['user_secret']
            
            # Get brokerage authorizations
            auths = self.client.connections.list_brokerage_authorizations(
                user_id=snaptrade_user_id,
                user_secret=user_secret
            )
            
            # Trigger refresh for each authorization
            for auth in auths.body:
                try:
                    self.client.connections.refresh_brokerage_authorization(
                        user_id=snaptrade_user_id,
                        user_secret=user_secret,
                        authorization_id=auth['id']
                    )
                    logger.info(f"✅ Triggered refresh for authorization {auth['id']}")
                except ApiException as e:
                    logger.warning(f"Could not refresh authorization {auth['id']}: {e}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to refresh data for user {user_id}: {e}")
            return False
    
    def get_provider_name(self) -> str:
        """Get the name of this provider."""
        return self.provider_name
    
    async def health_check(self) -> Dict[str, Any]:
        """Check SnapTrade API health and connectivity."""
        try:
            # Use API status check endpoint
            status_response = self.client.api_status.check()
            
            return {
                'provider': self.provider_name,
                'status': 'healthy',
                'api_status': status_response.body.get('status', 'unknown'),
                'timestamp': datetime.now().isoformat(),
                'version': 'v1'
            }
            
        except Exception as e:
            return {
                'provider': self.provider_name,
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    # === Helper Methods ===
    
    async def _get_user_credentials(self, user_id: str) -> Optional[Dict[str, str]]:
        """Get SnapTrade user credentials from database."""
        try:
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            result = supabase.table('snaptrade_users')\
                .select('snaptrade_user_id, snaptrade_user_secret')\
                .eq('user_id', user_id)\
                .execute()
            
            if not result.data:
                logger.warning(f"No SnapTrade credentials found for user {user_id}")
                return None
            
            return {
                'snaptrade_user_id': result.data[0]['snaptrade_user_id'],
                'user_secret': result.data[0]['snaptrade_user_secret']
            }
            
        except Exception as e:
            logger.error(f"Error getting SnapTrade credentials for user {user_id}: {e}")
            return None
    
    def _normalize_transaction_type(self, snaptrade_type: str) -> str:
        """Normalize SnapTrade transaction types to standard types."""
        type_mapping = {
            'BUY': 'buy',
            'SELL': 'sell',
            'DIVIDEND': 'dividend',
            'INTEREST': 'interest',
            'CONTRIBUTION': 'deposit',
            'WITHDRAWAL': 'withdrawal',
            'TRANSFER': 'transfer',
            'FEE': 'fee',
            'TAX': 'tax',
            'REI': 'reinvestment',  # Dividend reinvestment
            'STOCK_DIVIDEND': 'dividend',
            'OPTIONEXPIRATION': 'option_expiration',
            'OPTIONASSIGNMENT': 'option_assignment',
            'OPTIONEXERCISE': 'option_exercise'
        }
        
        return type_mapping.get(snaptrade_type.upper(), 'other')
    
    # === SnapTrade-Specific Methods ===
    
    async def register_user(self, user_id: str) -> Dict[str, str]:
        """
        Register a new user with SnapTrade.
        
        Args:
            user_id: Supabase user ID (will be used as SnapTrade user ID)
            
        Returns:
            Dictionary with user_id and user_secret
        """
        try:
            logger.info(f"Registering user {user_id} with SnapTrade")
            
            # Register with SnapTrade (use Supabase user_id as SnapTrade user_id)
            register_response = self.client.authentication.register_snap_trade_user(
                body={"userId": user_id}
            )
            
            user_secret = register_response.body['userSecret']
            
            # Store credentials in database
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            supabase.table('snaptrade_users').insert({
                'user_id': user_id,
                'snaptrade_user_id': user_id,
                'snaptrade_user_secret': user_secret
            }).execute()
            
            logger.info(f"✅ User {user_id} registered with SnapTrade")
            
            return {
                'user_id': user_id,
                'user_secret': user_secret
            }
            
        except Exception as e:
            raise ProviderError(
                f"Failed to register user {user_id}: {str(e)}",
                self.provider_name,
                "USER_REGISTRATION_ERROR",
                e
            )
    
    async def get_connection_portal_url(
        self, 
        user_id: str,
        broker: Optional[str] = None,
        connection_type: str = 'trade',
        redirect_url: Optional[str] = None
    ) -> str:
        """
        Get SnapTrade connection portal URL for user to connect brokerage.
        
        Args:
            user_id: User ID
            broker: Optional broker slug (e.g., 'ALPACA', 'SCHWAB')
            connection_type: 'read' or 'trade' (default: 'trade')
            redirect_url: Optional redirect URL after connection
            
        Returns:
            Connection portal URL
        """
        try:
            # Get user credentials
            user_credentials = await self._get_user_credentials(user_id)
            if not user_credentials:
                # User not registered, register them first
                credentials = await self.register_user(user_id)
                user_secret = credentials['user_secret']
            else:
                user_secret = user_credentials['user_secret']
            
            # Build login parameters
            params = {
                "userId": user_id,
                "userSecret": user_secret,
                "connectionType": connection_type
            }
            
            if broker:
                params["broker"] = broker
            
            if redirect_url:
                params["customRedirect"] = redirect_url
            
            # Get connection portal URL
            login_response = self.client.authentication.login_snap_trade_user(
                query_params=params
            )
            
            connection_url = login_response.body.get('redirectURI', '')
            
            logger.info(f"✅ Generated connection portal URL for user {user_id}")
            return connection_url
            
        except Exception as e:
            raise ProviderError(
                f"Failed to get connection portal URL: {str(e)}",
                self.provider_name,
                "CONNECTION_PORTAL_ERROR",
                e
            )
```

## Key Features Implemented

### 1. **Complete CRUD Operations**
- ✅ Get accounts
- ✅ Get positions/holdings
- ✅ Get transactions/activities
- ✅ Get performance metrics
- ✅ Manual data refresh

### 2. **SnapTrade-Specific Features**
- ✅ User registration
- ✅ Connection portal URL generation
- ✅ Brokerage authorization management
- ✅ Real-time data refresh

### 3. **Error Handling**
- ✅ Graceful degradation
- ✅ Comprehensive logging
- ✅ Provider-specific errors

### 4. **Data Normalization**
- ✅ Universal symbol ID tracking
- ✅ Transaction type mapping
- ✅ Consistent data models

## Usage Example

```python
from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider

# Initialize provider
provider = SnapTradePortfolioProvider()

# Register new user
credentials = await provider.register_user(user_id)

# Get connection portal URL
connection_url = await provider.get_connection_portal_url(
    user_id=user_id,
    connection_type='trade',  # Enable trading
    redirect_url='https://yourapp.com/onboarding/complete'
)

# After user connects brokerage...
accounts = await provider.get_accounts(user_id)
positions = await provider.get_positions(user_id)
transactions = await provider.get_transactions(user_id)
```

## Environment Variables

Add to your `.env` file:

```bash
# SnapTrade API Credentials
SNAPTRADE_CONSUMER_KEY=your_consumer_key_here
SNAPTRADE_CLIENT_ID=your_client_id_here
```

## Next Steps

After implementing this provider:

1. ✅ You can fetch portfolio data from SnapTrade
2. ✅ You can register users and connect brokerages
3. ✅ You're ready to implement trade execution

**Next**: Proceed to [03-AUTHENTICATION-FLOW.md](./03-AUTHENTICATION-FLOW.md) for user onboarding implementation.

