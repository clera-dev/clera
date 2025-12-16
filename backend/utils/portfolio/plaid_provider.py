"""
Plaid Investment API provider implementation.

This module implements the AbstractPortfolioProvider interface for Plaid's Investment API,
providing access to investment accounts, holdings, and transactions across 20+ account types.
"""

import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, date
from decimal import Decimal
import asyncio

# Plaid SDK imports - using patterns from working quickstart
import plaid
from plaid.api import plaid_api
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest
from plaid.model.investments_transactions_get_request_options import InvestmentsTransactionsGetRequestOptions
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.country_code import CountryCode
from plaid.model.products import Products
from plaid.configuration import Configuration

from .abstract_provider import (
    AbstractPortfolioProvider, Account, Position, Transaction, PerformanceData, ProviderError
)

logger = logging.getLogger(__name__)

class PlaidPortfolioProvider(AbstractPortfolioProvider):
    """
    Plaid Investment API provider implementation.
    
    Provides access to investment accounts across 2400+ financial institutions
    including brokerages, 401k, IRA, Roth IRA, 529, HSA, and other account types.
    """
    
    def __init__(self):
        """Initialize Plaid client with proper configuration."""
        self.provider_name = "plaid"  # Set provider name FIRST
        self.client = self._initialize_plaid_client()
    
    def _initialize_plaid_client(self) -> plaid_api.PlaidApi:
        """Initialize Plaid API client using existing patterns from bank_funding.py."""
        try:
            # Get credentials from environment
            plaid_client_id = os.getenv("PLAID_CLIENT_ID")
            plaid_secret = os.getenv("PLAID_SECRET") 
            plaid_env = os.getenv("PLAID_ENV", "sandbox")
            
            if not plaid_client_id or not plaid_secret:
                raise ProviderError(
                    "PLAID_CLIENT_ID and PLAID_SECRET must be set in environment",
                    "plaid",  # Use string literal
                    "MISSING_CREDENTIALS"
                )

            # Determine environment - following existing pattern
            if plaid_env == "sandbox":
                host = plaid.Environment.Sandbox
            elif plaid_env == "development":
                host = plaid.Environment.Development  
            elif plaid_env == "production":
                host = plaid.Environment.Production
            else:
                host = plaid.Environment.Sandbox
                logger.warning(f"Unknown PLAID_ENV '{plaid_env}', defaulting to sandbox")
            
            # Configure client - using 2025 pattern
            configuration = Configuration(
                host=host,
                api_key={
                    'clientId': plaid_client_id,
                    'secret': plaid_secret,
                    'plaidVersion': '2020-09-14'  # Latest stable API version
                }
            )
            
            api_client = plaid.ApiClient(configuration)
            client = plaid_api.PlaidApi(api_client)
            
            logger.info(f"✅ Plaid client initialized for {plaid_env} environment")
            return client
            
        except Exception as e:
            raise ProviderError(
                f"Failed to initialize Plaid client: {str(e)}",
                self.get_provider_name(),
                "INITIALIZATION_ERROR",
                e
            )
    
    async def get_accounts(self, user_id: str) -> List[Account]:
        """Get all investment accounts for a user from Plaid."""
        try:
            logger.info(f"Fetching Plaid investment accounts for user {user_id}")
            
            # Get user's access tokens from database
            access_tokens = await self._get_user_access_tokens(user_id)
            
            if not access_tokens:
                logger.info(f"No Plaid access tokens found for user {user_id}")
                return []
            
            accounts = []
            
            # Fetch accounts from each connected Item
            for token_data in access_tokens:
                try:
                    request = AccountsGetRequest(access_token=token_data['access_token_encrypted'])
                    response = self.client.accounts_get(request)
                    
                    # CRITICAL FIX: Convert to dictionary first (following quickstart pattern)
                    response_data = response.to_dict()
                    
                    # Filter for investment account types
                    for account in response_data.get('accounts', []):
                        if account['type'] in ['investment', 'brokerage']:
                            accounts.append(Account(
                                id=f"plaid_{account['account_id']}",
                                provider='plaid',
                                provider_account_id=account['account_id'],
                                account_type=account.get('subtype', account['type']),
                                institution_name=token_data['institution_name'],
                                account_name=account.get('name', 'Investment Account'),
                                balance=Decimal(str(account['balances'].get('current', 0) or 0)),
                                is_active=True
                            ))
                            
                except plaid.ApiException as e:
                    logger.error(f"Error fetching accounts for token {token_data.get('id', 'unknown')}: {e}")
                    # Continue with other tokens rather than failing completely
                    continue
            
            logger.info(f"✅ Retrieved {len(accounts)} investment accounts for user {user_id}")
            return accounts
            
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
            logger.info(f"Fetching Plaid investment positions for user {user_id}")
            
            access_tokens = await self._get_user_access_tokens(user_id)
            if not access_tokens:
                return []
            
            positions = []
            
            for token_data in access_tokens:
                try:
                    # FIXED: Use basic request without account filtering (following quickstart pattern)
                    # The Plaid API doesn't accept account_ids parameter directly
                    request = InvestmentsHoldingsGetRequest(
                        access_token=token_data['access_token_encrypted']
                    )
                    response = self.client.investments_holdings_get(request)
                    
                    # CRITICAL FIX: Convert to dictionary first (following quickstart pattern)
                    response_data = response.to_dict()
                    
                    # Create lookup maps for cross-referencing
                    securities_map = {
                        sec['security_id']: sec 
                        for sec in response_data.get('securities', [])
                    }
                    accounts_map = {
                        acc['account_id']: acc 
                        for acc in response_data.get('accounts', [])
                    }
                    
                    # Process each holding
                    for holding in response_data.get('holdings', []):
                        # Filter by account_id if specified (after getting all data)
                        holding_account_id = f"plaid_{holding['account_id']}"
                        if account_id and holding_account_id != account_id:
                            continue  # Skip holdings not for the requested account
                        
                        security = securities_map.get(holding['security_id'])
                        account = accounts_map.get(holding['account_id'])
                        
                        if security and account:
                            # Use ticker symbol if available, otherwise use security name
                            symbol = security.get('ticker_symbol') or security.get('name', 'Unknown')
                            
                            # CRITICAL FIX: Include ALL positions (including cash) for aggregation
                            # Cash positions will be filtered out later in the API layer for holdings display
                            is_cash_position = security.get('is_cash_equivalent', False) or security.get('type') == 'cash'
                            
                            if is_cash_position:
                                logger.debug(f"💰 PROCESSING CASH POSITION: {symbol} - ${holding.get('institution_value', 0)}")
                            else:
                                logger.info(f"🔍 PROCESSING HOLDING: {symbol} - {holding.get('quantity', 0)} shares - ${holding.get('institution_value', 0)}")
                            
                            # Calculate unrealized P/L
                            market_val = Decimal(str(holding.get('institution_value', 0) or 0))
                            cost_basis_val = Decimal(str(holding.get('cost_basis', 0) or 0))
                            unrealized_pl_val = market_val - cost_basis_val if cost_basis_val > 0 else Decimal('0')
                            
                            positions.append(Position(
                                symbol=symbol,
                                quantity=Decimal(str(holding.get('quantity', 0))),
                                market_value=market_val,
                                cost_basis=cost_basis_val,
                                account_id=holding_account_id,
                                institution_name=token_data['institution_name'],
                                security_type=security.get('type', 'equity'),
                                security_name=security.get('name'),
                                price=Decimal(str(holding.get('institution_price', 0) or 0)),
                                unrealized_pl=unrealized_pl_val
                            ))
                            
                            # Store rich Plaid security metadata separately for asset details
                            await self._store_plaid_security_metadata(symbol, security, user_id)
                            
                except plaid.ApiException as e:
                    logger.error(f"Error fetching positions for token {token_data.get('id', 'unknown')}: {e}")
                    continue
            
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
    
    async def get_transactions(self, user_id: str, account_id: Optional[str] = None, 
                              start_date: Optional[datetime] = None,
                              end_date: Optional[datetime] = None) -> List[Transaction]:
        """Get investment transactions for user's accounts."""
        try:
            logger.info(f"Fetching Plaid investment transactions for user {user_id}")
            
            access_tokens = await self._get_user_access_tokens(user_id)
            if not access_tokens:
                return []
            
            # Default to last 90 days if no date range specified
            if not start_date:
                start_date = datetime.now() - timedelta(days=90)
            if not end_date:
                end_date = datetime.now()
            
            transactions = []
            
            for token_data in access_tokens:
                try:
                    # FIXED: Don't pass account_ids=None (causes Plaid API error)
                    # Only include account_ids in options if we have a specific account to filter
                    options_dict = {'count': 500}  # Max transactions per request
                    
                    if account_id and account_id.startswith('plaid_'):
                        account_ids_filter = [account_id.replace('plaid_', '')]
                        options_dict['account_ids'] = account_ids_filter
                    
                    options = InvestmentsTransactionsGetRequestOptions(**options_dict)
                    
                    request = InvestmentsTransactionsGetRequest(
                        access_token=token_data['access_token_encrypted'],
                        start_date=start_date.date(),
                        end_date=end_date.date(),
                        options=options
                    )
                    response = self.client.investments_transactions_get(request)
                    
                    # CRITICAL FIX: Convert to dictionary first (following quickstart pattern)
                    response_data = response.to_dict()
                    
                    # Create securities lookup map
                    securities_map = {
                        sec['security_id']: sec 
                        for sec in response_data.get('securities', [])
                    }
                    
                    # Process each transaction
                    for txn in response_data.get('investment_transactions', []):
                        # Filter by account_id if specified (after getting all data)
                        txn_account_id = f"plaid_{txn['account_id']}"
                        if account_id and txn_account_id != account_id:
                            continue  # Skip transactions not for the requested account
                        
                        security = securities_map.get(txn['security_id'])
                        symbol = None
                        
                        if security:
                            symbol = security.get('ticker_symbol') or security.get('name')
                        
                        # Convert Plaid transaction types to standard types
                        transaction_type = self._normalize_transaction_type(txn.get('subtype', txn.get('type', 'other')))
                        
                        logger.info(f"🔍 PROCESSING TRANSACTION: {symbol or 'Cash'} - {transaction_type} - ${txn.get('amount', 0)}")
                        
                        # Parse date - handle both string and date objects from Plaid
                        txn_date = txn['date']
                        if isinstance(txn_date, str):
                            txn_date = datetime.strptime(txn_date, '%Y-%m-%d')
                        elif isinstance(txn_date, date):
                            txn_date = datetime.combine(txn_date, datetime.min.time())
                        
                        transactions.append(Transaction(
                            id=f"plaid_{txn['investment_transaction_id']}",
                            account_id=txn_account_id,
                            symbol=symbol,
                            transaction_type=transaction_type,
                            quantity=Decimal(str(txn.get('quantity', 0))),
                            price=Decimal(str(txn.get('price', 0))),
                            amount=Decimal(str(txn.get('amount', 0))),
                            date=txn_date,
                            description=txn.get('name', ''),
                            fees=Decimal(str(txn.get('fees', 0))) if txn.get('fees') else None
                        ))
                        
                except plaid.ApiException as e:
                    logger.error(f"Error fetching transactions for token {token_data.get('id', 'unknown')}: {e}")
                    continue
            
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
    
    async def get_performance(self, user_id: str, account_id: Optional[str] = None) -> PerformanceData:
        """Calculate performance metrics from positions and transactions."""
        try:
            logger.info(f"Calculating performance metrics for user {user_id}")
            
            # Get positions for current values
            positions = await self.get_positions(user_id, account_id)
            
            if not positions:
                return PerformanceData(
                    total_return=Decimal('0'),
                    total_return_percentage=Decimal('0'),
                    daily_return=Decimal('0'),
                    daily_return_percentage=Decimal('0'),
                    period_returns={}
                )
            
            # Calculate totals
            total_market_value = sum(pos.market_value for pos in positions)
            total_cost_basis = sum(pos.cost_basis for pos in positions)
            
            # Calculate returns
            total_return = total_market_value - total_cost_basis
            total_return_percentage = Decimal('0')
            if total_cost_basis > 0:
                total_return_percentage = (total_return / total_cost_basis) * Decimal('100')
            
            # TODO: Implement period returns calculation using historical data
            # For now, return basic performance data
            period_returns = {
                '1D': Decimal('0'),  # Would need historical price data
                '1W': Decimal('0'),
                '1M': Decimal('0'), 
                '3M': Decimal('0'),
                '1Y': total_return_percentage  # Use total return as proxy
            }
            
            return PerformanceData(
                total_return=total_return,
                total_return_percentage=total_return_percentage,
                daily_return=Decimal('0'),  # Would need previous day's data
                daily_return_percentage=Decimal('0'),
                period_returns=period_returns
            )
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to calculate performance for user {user_id}: {str(e)}",
                self.provider_name,
                "PERFORMANCE_CALCULATION_ERROR",
                e
            )
    
    async def refresh_data(self, user_id: str, account_id: Optional[str] = None) -> bool:
        """Refresh cached data by re-fetching from Plaid."""
        try:
            logger.info(f"Refreshing Plaid data for user {user_id}")
            
            # For now, just validate that we can fetch fresh data
            # In production, this would clear caches and trigger fresh API calls
            accounts = await self.get_accounts(user_id)
            positions = await self.get_positions(user_id, account_id)
            
            logger.info(f"✅ Data refresh successful: {len(accounts)} accounts, {len(positions)} positions")
            return True
            
        except Exception as e:
            logger.error(f"Failed to refresh data for user {user_id}: {e}")
            return False
    
    def get_provider_name(self) -> str:
        """Get the name of this provider."""
        return self.provider_name
    
    async def health_check(self) -> Dict[str, Any]:
        """Check Plaid API health and connectivity."""
        try:
            # Simple health check - verify client can be initialized
            test_client = self._initialize_plaid_client()
            
            return {
                'provider': self.provider_name,
                'status': 'healthy',
                'environment': os.getenv('PLAID_ENV', 'sandbox'),
                'timestamp': datetime.now().isoformat(),
                'version': plaid.__version__
            }
            
        except Exception as e:
            return {
                'provider': self.provider_name,
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    # === Helper Methods ===
    
    async def _get_user_access_tokens(self, user_id: str) -> List[Dict[str, Any]]:
        """Get unique Plaid access tokens for a user from database (deduplicated by access token)."""
        try:
            # Import here to avoid circular imports
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            result = supabase.table('user_investment_accounts')\
                .select('id, access_token_encrypted, institution_name, provider_account_id')\
                .eq('user_id', user_id)\
                .eq('provider', 'plaid')\
                .eq('is_active', True)\
                .execute()
            
            # DEDUPLICATION FIX: Group by access_token to avoid calling Plaid API multiple times for same Item
            unique_tokens = {}
            for account in result.data or []:
                token = account['access_token_encrypted']
                if token not in unique_tokens:
                    unique_tokens[token] = account
                    logger.info(f"🔍 DEDUP: Added unique token for {account['institution_name']}")
                else:
                    logger.info(f"🔍 DEDUP: Skipping duplicate token for {account['institution_name']}")
            
            deduped_tokens = list(unique_tokens.values())
            logger.info(f"🔍 ACCESS TOKENS: {len(result.data or [])} total accounts, {len(deduped_tokens)} unique access tokens")
            
            return deduped_tokens
            
        except Exception as e:
            logger.error(f"Error getting access tokens for user {user_id}: {e}")
            # Return empty list rather than failing - allows graceful degradation
            return []
    
    def _normalize_transaction_type(self, plaid_type: str) -> str:
        """Normalize Plaid transaction types to standard types."""
        type_mapping = {
            'buy': 'buy',
            'sell': 'sell', 
            'cash dividend': 'dividend',
            'dividend': 'dividend',
            'interest': 'interest',
            'deposit': 'deposit',
            'withdrawal': 'withdrawal',
            'transfer': 'transfer',
            'fee': 'fee',
            'tax': 'tax'
        }
        
        normalized = type_mapping.get(plaid_type.lower(), 'other')
        return normalized
    
    # === Public Token Exchange Methods ===
    
    async def create_link_token(self, user_id: str, user_email: str) -> str:
        """
        Create a Plaid Link token for investment account connection.
        
        Args:
            user_id: Unique user identifier
            user_email: User's email address
            
        Returns:
            Link token string for frontend Plaid Link initialization
        """
        try:
            logger.info(f"Creating Plaid Link token for user {user_id}")
            
            # Create base request
            request_params = {
                'products': [Products('investments')],  # Investment API access
                'client_name': "Clera",
                'country_codes': [CountryCode('US'), CountryCode('CA')],
                'language': 'en',
                'user': LinkTokenCreateRequestUser(
                    client_user_id=user_id,
                    email_address=user_email
                )
            }
            
            # Note: redirect_uri is omitted for testing
            # In production, configure redirect URI in Plaid Dashboard first
            # redirect_uri = os.getenv('PLAID_REDIRECT_URI')
            # if redirect_uri and redirect_uri.strip():
            #     request_params['redirect_uri'] = redirect_uri
            logger.info("Using standard Link flow (no OAuth redirect for testing)")
            
            request = LinkTokenCreateRequest(**request_params)
            
            response = self.client.link_token_create(request)
            
            # CRITICAL FIX: Convert to dictionary first (following quickstart pattern)
            response_data = response.to_dict()
            link_token = response_data['link_token']
            
            logger.info(f"✅ Link token created successfully for user {user_id}")
            return link_token
            
        except plaid.ApiException as e:
            logger.error(f"Plaid API error creating link token: {e}")
            raise ProviderError(
                f"Failed to create link token: {str(e)}",
                self.provider_name,
                "LINK_TOKEN_ERROR",
                e
            )
        except Exception as e:
            raise ProviderError(
                f"Failed to create link token for user {user_id}: {str(e)}",
                self.provider_name,
                "LINK_TOKEN_ERROR", 
                e
            )
    
    async def exchange_public_token(self, public_token: str, institution_name: str, 
                                   user_id: str) -> Dict[str, Any]:
        """
        Exchange Plaid public token for access token and save account connection.
        
        Args:
            public_token: Public token from Plaid Link
            institution_name: Name of the financial institution
            user_id: User identifier
            
        Returns:
            Dictionary with account information
        """
        try:
            logger.info(f"Exchanging Plaid public token for user {user_id}")
            
            # Exchange public token for access token
            exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
            exchange_response = self.client.item_public_token_exchange(exchange_request)
            
            # CRITICAL FIX: Convert to dictionary first (following quickstart pattern)
            exchange_data = exchange_response.to_dict()
            
            access_token = exchange_data['access_token']
            item_id = exchange_data['item_id']
            
            # Get account details immediately after exchange
            accounts_request = AccountsGetRequest(access_token=access_token)
            accounts_response = self.client.accounts_get(accounts_request)
            
            # CRITICAL FIX: Convert Plaid response object to dictionary (following quickstart pattern)
            accounts_data = accounts_response.to_dict()
            
            # Save investment accounts to database
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            # DEBUG: Log all accounts returned by Plaid to understand what we got
            all_accounts = accounts_data.get('accounts', [])
            logger.info(f"🔍 DEBUG: Plaid returned {len(all_accounts)} total accounts for user {user_id}")
            
            for i, account in enumerate(all_accounts):
                logger.info(f"🔍 Account {i+1}: type='{account['type']}', subtype='{account.get('subtype', 'None')}', name='{account.get('name', 'Unknown')}'")
            
            accounts_created = []
            investment_accounts_found = 0
            
            for account in accounts_data.get('accounts', []):
                # Now account['type'] should be a string after .to_dict() conversion
                account_type = account['type']
                logger.info(f"🔍 AFTER TO_DICT: account_type='{account_type}', type={type(account_type)}")
                
                # Check condition - should work correctly now
                is_investment = account_type in ['investment', 'brokerage']
                logger.info(f"🔍 CONDITION CHECK: account_type='{account_type}', is_investment={is_investment}")
                
                # Only save investment and brokerage accounts  
                if account_type in ['investment', 'brokerage']:
                    investment_accounts_found += 1
                    logger.info(f"✅ ENTERING INVESTMENT PROCESSING: account {investment_accounts_found}: {account['type']}/{account.get('subtype')} - {account.get('name')}")
                    
                    account_data = {
                        'user_id': user_id,
                        'provider': 'plaid',
                        'provider_account_id': account['account_id'],
                        'provider_item_id': item_id,
                        'institution_name': institution_name,
                        'account_name': account.get('name', 'Investment Account'),
                        'account_type': account.get('subtype', account['type']),
                        'account_subtype': account.get('subtype'),
                        'access_token_encrypted': access_token,
                        'sync_status': 'success',
                        'last_synced': datetime.now().isoformat(),
                        'raw_account_data': account
                    }
                    
                    # DEBUG: Log the exact data being inserted
                    logger.info(f"🔍 INSERTING: user_id={user_id}, provider_account_id={account['account_id']}, account_type={account.get('subtype', account['type'])}")
                    
                    try:
                        logger.info(f"🔍 Attempting database insert for account {account['account_id']}...")
                        result = supabase.table('user_investment_accounts').insert(account_data).execute()
                        
                        logger.info(f"🔍 Insert result: {result}")
                        logger.info(f"🔍 Result data: {result.data}")
                        logger.info(f"🔍 Result count: {result.count}")
                        
                        if result.data:
                            accounts_created.extend(result.data)
                            logger.info(f"✅ Successfully saved account {account['account_id']} to database")
                        else:
                            logger.error(f"❌ Database insert returned no data for account {account['account_id']}")
                            
                    except Exception as db_error:
                        logger.error(f"❌ Database insert exception for account {account['account_id']}: {db_error}")
                        logger.error(f"❌ Exception type: {type(db_error)}")
                        logger.error(f"❌ Account data that failed: {account_data}")
                        # Continue with other accounts
                        continue
                else:
                    logger.info(f"⏭️ Skipping non-investment account: {account['type']}/{account.get('subtype')} - {account.get('name')}")
            
            logger.info(f"🔍 SUMMARY: Found {investment_accounts_found} investment accounts, saved {len(accounts_created)} to database")
            
            logger.info(f"✅ Token exchanged and {len(accounts_created)} accounts saved for user {user_id}")
            return {
                'success': True,
                'item_id': item_id,
                'accounts_created': len(accounts_created),
                'accounts': accounts_created
            }
            
        except plaid.ApiException as e:
            logger.error(f"Plaid API error exchanging token: {e}")
            raise ProviderError(
                f"Failed to exchange public token: {str(e)}",
                self.provider_name,
                "TOKEN_EXCHANGE_ERROR",
                e
            )
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to exchange token for user {user_id}: {str(e)}",
                self.provider_name,
                "TOKEN_EXCHANGE_ERROR",
                e
            )
    
    async def _store_plaid_security_metadata(self, symbol: str, security: Dict[str, Any], user_id: str):
        """
        Store rich Plaid security metadata for later asset detail lookups.
        
        Args:
            symbol: Security symbol/identifier
            security: Full security data from Plaid API
            user_id: User ID for data association
        """
        try:
            # Store in Redis as a simple cache
            import redis
            import json
            
            redis_client = redis.Redis(
                host=os.getenv("REDIS_HOST", "127.0.0.1"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                db=int(os.getenv("REDIS_DB", "0"))
            )
            
            # Create security metadata key (MATCHING sector_allocation_service.py format)
            metadata_key = f"plaid_security_metadata:{symbol}:{user_id}"
            
            # Store comprehensive security data from Plaid API documentation
            security_metadata = {
                'symbol': symbol,
                'name': security.get('name'),
                'ticker_symbol': security.get('ticker_symbol'),
                'type': security.get('type'),
                'subtype': security.get('subtype'),
                'sector': security.get('sector'),
                'industry': security.get('industry'),
                'cusip': security.get('cusip'),
                'isin': security.get('isin'),
                'close_price': security.get('close_price'),
                'close_price_as_of': security.get('close_price_as_of'),
                'is_cash_equivalent': security.get('is_cash_equivalent', False),
                'option_contract': security.get('option_contract'),
                'fixed_income': security.get('fixed_income'),
                'market_identifier_code': security.get('market_identifier_code'),
                'last_updated': datetime.now().isoformat()
            }
            
            # Store with TTL of 24 hours
            redis_client.setex(
                metadata_key,
                86400,  # 24 hours TTL
                json.dumps(security_metadata)
            )
            
            logger.debug(f"✅ Stored Plaid security metadata for {symbol}: {security.get('name')}")
            
        except Exception as e:
            logger.warning(f"Error storing Plaid security metadata for {symbol}: {e}")
            # Non-fatal error - continue processing
