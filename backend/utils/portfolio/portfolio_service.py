"""
Portfolio service for orchestrating multiple investment data providers.

This service implements the Facade pattern to provide a unified interface
for accessing investment data from multiple providers (Plaid, Alpaca, etc.).
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from decimal import Decimal

from .abstract_provider import (
    AbstractPortfolioProvider, Account, Position, Transaction, PerformanceData, ProviderError
)
from .plaid_provider import PlaidPortfolioProvider
from .alpaca_provider import AlpacaPortfolioProvider
from .snaptrade_provider import SnapTradePortfolioProvider

logger = logging.getLogger(__name__)

class PortfolioService:
    """
    Unified portfolio service for multi-provider investment data aggregation.
    
    Implements the Facade pattern to simplify complex provider interactions
    and provides a single point of access for all portfolio operations.
    """
    
    def __init__(self):
        """Initialize service with available providers."""
        self.providers: Dict[str, AbstractPortfolioProvider] = {}
        self._initialize_providers()
    
    def _initialize_providers(self):
        """Initialize all available providers."""
        try:
            # Initialize SnapTrade provider (primary aggregation + trading)
            try:
                self.providers['snaptrade'] = SnapTradePortfolioProvider()
                logger.info("✅ SnapTrade provider initialized")
            except Exception as snaptrade_error:
                logger.warning(f"SnapTrade provider initialization failed: {snaptrade_error}")
            
            # Initialize Plaid provider (fallback for aggregation)
            try:
                self.providers['plaid'] = PlaidPortfolioProvider()
                logger.info("✅ Plaid provider initialized")
            except Exception as plaid_error:
                logger.warning(f"Plaid provider initialization failed: {plaid_error}")
            
            # Initialize Alpaca provider (for brokerage/hybrid mode)
            try:
                self.providers['alpaca'] = AlpacaPortfolioProvider()
                logger.info("✅ Alpaca provider initialized")
            except Exception as alpaca_error:
                logger.warning(f"Alpaca provider initialization failed: {alpaca_error}")
            
        except Exception as e:
            logger.error(f"Error initializing providers: {e}")
            # Don't fail service initialization if providers fail
            # This allows graceful degradation
    
    async def get_user_portfolio(self, user_id: str, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get complete portfolio view for user with intelligent caching.
        
        Args:
            user_id: Unique user identifier
            force_refresh: If True, bypass cache and fetch fresh data
            
        Returns:
            Aggregated portfolio data dictionary
        """
        try:
            logger.info(f"Getting portfolio for user {user_id}, force_refresh={force_refresh}")
            
            # Check cache first (unless force refresh)
            if not force_refresh:
                cached_data = await self._get_cached_portfolio(user_id)
                if cached_data:
                    logger.info(f"💾 Using cached portfolio data for user {user_id}")
                    return cached_data
            
            logger.info(f"🔄 Fetching fresh portfolio data for user {user_id}")
            
            # TODO: Check feature flags here when implemented
            active_providers = ['plaid']  # For now, just Plaid
            
            # Fetch data from all active providers concurrently
            all_accounts = []
            all_positions = []
            all_transactions = []
            
            for provider_name in active_providers:
                provider = self.providers.get(provider_name)
                if not provider:
                    logger.warning(f"Provider {provider_name} not available")
                    continue
                
                try:
                    # Fetch data from this provider
                    accounts = await provider.get_accounts(user_id)
                    positions = await provider.get_positions(user_id)
                    
                    all_accounts.extend(accounts)
                    all_positions.extend(positions)
                    
                    logger.info(f"✅ {provider_name}: {len(accounts)} accounts, {len(positions)} positions")
                    
                except ProviderError as e:
                    logger.error(f"Provider {provider_name} error: {e}")
                    # Continue with other providers rather than failing completely
                    continue
                except Exception as e:
                    logger.error(f"Unexpected error from provider {provider_name}: {e}")
                    continue
            
            # Aggregate positions by symbol across all accounts
            aggregated_positions = self._aggregate_positions(all_positions)
            
            # Save aggregated positions to cache table for fast future loading
            await self._save_aggregated_holdings_to_cache(user_id, aggregated_positions)
            
            # Calculate basic portfolio metrics (convert to Decimal for calculations)
            total_value = Decimal('0')
            total_cost_basis = Decimal('0')
            
            for pos in aggregated_positions:
                total_value += Decimal(str(pos['total_market_value']))
                total_cost_basis += Decimal(str(pos['total_cost_basis']))
            
            total_gain_loss = total_value - total_cost_basis
            total_gain_loss_percent = Decimal('0')
            if total_cost_basis > 0:
                total_gain_loss_percent = (total_gain_loss / total_cost_basis) * Decimal('100')
            
            # Create portfolio snapshot for historical tracking
            await self._create_portfolio_snapshot(user_id, total_value, total_cost_basis, len(all_accounts))
            
            portfolio_data = {
                'accounts': [acc.to_dict() for acc in all_accounts],
                'positions': aggregated_positions,
                'summary': {
                    'total_value': float(total_value),
                    'total_cost_basis': float(total_cost_basis),
                    'total_gain_loss': float(total_gain_loss),
                    'total_gain_loss_percent': float(total_gain_loss_percent),
                    'account_count': len(all_accounts),
                    'position_count': len(aggregated_positions)
                },
                'metadata': {
                    'last_updated': datetime.now().isoformat(),
                    'providers': active_providers,
                    'data_freshness': 'real_time'  # Since we're fetching live data
                }
            }
            
            return portfolio_data
            
        except Exception as e:
            logger.error(f"Error getting portfolio for user {user_id}: {e}")
            return self._empty_portfolio_response()
    
    async def _get_cached_portfolio(self, user_id: str, max_age_minutes: int = 30) -> Optional[Dict[str, Any]]:
        """Get cached portfolio data if fresh enough."""
        try:
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            cutoff_time = datetime.now() - timedelta(minutes=max_age_minutes)
            
            # Check for fresh aggregated holdings
            holdings_result = supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', user_id)\
                .gte('last_updated', cutoff_time.isoformat())\
                .execute()
            
            if holdings_result.data:
                logger.info(f"💾 Found {len(holdings_result.data)} cached holdings for user {user_id}")
                
                # Get accounts (always fresh from database)
                accounts_result = supabase.table('user_investment_accounts')\
                    .select('*')\
                    .eq('user_id', user_id)\
                    .eq('is_active', True)\
                    .execute()
                
                # Convert cached data back to portfolio format
                accounts = []
                for acc_data in accounts_result.data or []:
                    accounts.append({
                        'id': f"plaid_{acc_data['provider_account_id']}",
                        'provider': acc_data['provider'],
                        'account_type': acc_data['account_type'],
                        'institution_name': acc_data['institution_name'],
                        'account_name': acc_data['account_name'],
                        'balance': 0.0,  # Will be updated by live data when needed
                        'is_active': acc_data['is_active']
                    })
                
                # Convert cached holdings to position format
                positions = []
                total_value = Decimal('0')
                total_cost_basis = Decimal('0')
                
                for holding in holdings_result.data:
                    position = {
                        'symbol': holding['symbol'],
                        'security_name': holding['security_name'],
                        'security_type': holding['security_type'],
                        'total_quantity': float(holding['total_quantity']),
                        'total_market_value': float(holding['total_market_value']),
                        'total_cost_basis': float(holding['total_cost_basis']),
                        'average_cost_basis': float(holding['average_cost_basis']),
                        'unrealized_gain_loss': float(holding['unrealized_gain_loss']),
                        'unrealized_gain_loss_percent': float(holding['unrealized_gain_loss_percent']),
                        'accounts': holding['account_contributions'],
                        'institutions': list(holding['institution_breakdown'].keys())
                    }
                    positions.append(position)
                    total_value += Decimal(str(holding['total_market_value']))
                    total_cost_basis += Decimal(str(holding['total_cost_basis']))
                
                total_gain_loss = total_value - total_cost_basis
                total_gain_loss_percent = (total_gain_loss / total_cost_basis * Decimal('100')) if total_cost_basis > 0 else Decimal('0')
                
                return {
                    'accounts': accounts,
                    'positions': positions,
                    'summary': {
                        'total_value': float(total_value),
                        'total_cost_basis': float(total_cost_basis),
                        'total_gain_loss': float(total_gain_loss),
                        'total_gain_loss_percent': float(total_gain_loss_percent),
                        'account_count': len(accounts),
                        'position_count': len(positions)
                    },
                    'metadata': {
                        'last_updated': holdings_result.data[0]['last_updated'],
                        'providers': ['plaid'],
                        'data_freshness': 'cached'
                    }
                }
            
            return None  # No fresh cache available
            
        except Exception as e:
            logger.error(f"Error checking cached portfolio for user {user_id}: {e}")
            return None
    
    def _aggregate_positions(self, positions: List[Position]) -> List[Dict[str, Any]]:
        """
        Aggregate positions by symbol across all accounts.
        
        This method handles the core aggregation logic for multi-account portfolios,
        combining positions of the same security across different accounts.
        """
        symbol_groups = {}
        
        for position in positions:
            symbol = position.symbol
            if symbol not in symbol_groups:
                symbol_groups[symbol] = {
                    'symbol': symbol,
                    'security_name': position.security_name,
                    'security_type': position.security_type,
                    'total_quantity': Decimal('0'),
                    'total_market_value': Decimal('0'),
                    'total_cost_basis': Decimal('0'),
                    'accounts': [],
                    'institutions': set()
                }
            
            group = symbol_groups[symbol]
            group['total_quantity'] += position.quantity
            group['total_market_value'] += position.market_value
            group['total_cost_basis'] += position.cost_basis
            group['accounts'].append({
                'account_id': position.account_id,
                'quantity': float(position.quantity),
                'market_value': float(position.market_value),
                'cost_basis': float(position.cost_basis),
                'institution': position.institution_name
            })
            group['institutions'].add(position.institution_name)
        
        # Convert to list and calculate derived metrics
        aggregated = []
        for group in symbol_groups.values():
            # Convert sets to lists for JSON serialization
            group['institutions'] = list(group['institutions'])
            
            # Calculate derived metrics (ensure all Decimal operations)
            group['average_cost_basis'] = (
                group['total_cost_basis'] / group['total_quantity'] 
                if group['total_quantity'] > 0 else Decimal('0')
            )
            group['unrealized_gain_loss'] = group['total_market_value'] - group['total_cost_basis']
            
            # CRITICAL FIX: Handle invalid cost basis from Plaid
            # Plaid often provides incorrect or missing cost basis data
            security_type = group.get('security_type', 'equity')
            market_value = group['total_market_value']
            cost_basis = group['total_cost_basis']
            
            # Detect unreliable cost basis (suspiciously low compared to market value)
            cost_basis_unreliable = False
            if market_value > Decimal('100') and cost_basis < Decimal('50'):
                # Cost basis is suspiciously low - likely Plaid data issue
                cost_basis_unreliable = True
                logger.warning(f"⚠️ {group['symbol']}: Unreliable cost basis (${cost_basis} vs ${market_value} market value)")
            
            # For derivatives (options), cost basis is complex - mark as N/A
            if security_type in ['option', 'derivative', 'warrant', 'right']:
                cost_basis_unreliable = True
                logger.debug(f"📊 {group['symbol']}: Derivative - cost basis marked as N/A")
            
            # Calculate percentage only if cost basis is reliable
            if cost_basis_unreliable or cost_basis <= 0:
                # Mark as N/A by using a sentinel value (-999999) that frontend can detect
                # Cannot use None because database column doesn't allow NULL
                group['unrealized_gain_loss_percent'] = Decimal('-999999')
                logger.debug(f"📊 {group['symbol']}: Return % marked as N/A (unreliable cost basis)")
            else:
                raw_percent = (group['unrealized_gain_loss'] / cost_basis * Decimal('100'))
                
                # Cap percentage to prevent database overflow and display issues
                if raw_percent > Decimal('999.99'):
                    group['unrealized_gain_loss_percent'] = Decimal('999.99')
                    logger.debug(f"📊 Capped percentage for {group['symbol']}: {raw_percent}% → 999.99%")
                elif raw_percent < Decimal('-999.99'):
                    group['unrealized_gain_loss_percent'] = Decimal('-999.99')
                    logger.debug(f"📊 Capped percentage for {group['symbol']}: {raw_percent}% → -999.99%")
                else:
                    group['unrealized_gain_loss_percent'] = raw_percent
            
            # Convert Decimal types to float for JSON serialization
            for key in ['total_quantity', 'total_market_value', 'total_cost_basis', 
                       'average_cost_basis', 'unrealized_gain_loss', 'unrealized_gain_loss_percent']:
                try:
                    group[key] = float(group[key])
                except Exception as e:
                    logger.error(f"Error converting {key}={group[key]} to float: {e}")
                    group[key] = 0.0
            
            aggregated.append(group)
        
        # Sort by market value descending
        return sorted(aggregated, key=lambda x: x['total_market_value'], reverse=True)
    
    async def connect_plaid_account(self, user_id: str, user_email: str) -> str:
        """
        Create a Plaid Link token for new account connection.
        
        Args:
            user_id: Unique user identifier
            user_email: User's email address
            
        Returns:
            Link token for frontend Plaid Link initialization
        """
        try:
            plaid_provider = self.providers.get('plaid')
            if not plaid_provider:
                raise ProviderError("Plaid provider not available", "plaid", "PROVIDER_UNAVAILABLE")
            
            return await plaid_provider.create_link_token(user_id, user_email)
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to create connection for user {user_id}: {str(e)}",
                "plaid",
                "CONNECTION_ERROR",
                e
            )
    
    async def complete_plaid_connection(self, user_id: str, public_token: str, 
                                       institution_name: str) -> Dict[str, Any]:
        """
        Complete Plaid account connection by exchanging public token.
        
        Args:
            user_id: Unique user identifier
            public_token: Public token from Plaid Link
            institution_name: Name of the financial institution
            
        Returns:
            Dictionary with connection results
        """
        try:
            plaid_provider = self.providers.get('plaid')
            if not plaid_provider:
                raise ProviderError("Plaid provider not available", "plaid", "PROVIDER_UNAVAILABLE")
            
            return await plaid_provider.exchange_public_token(
                public_token, institution_name, user_id
            )
            
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(
                f"Failed to complete connection for user {user_id}: {str(e)}",
                "plaid",
                "CONNECTION_COMPLETION_ERROR",
                e
            )
    
    async def get_provider_health(self) -> Dict[str, Any]:
        """Get health status of all providers."""
        health_status = {
            'overall_status': 'healthy',
            'providers': {},
            'timestamp': datetime.now().isoformat()
        }
        
        for provider_name, provider in self.providers.items():
            try:
                provider_health = await provider.health_check()
                health_status['providers'][provider_name] = provider_health
                
                if provider_health.get('status') != 'healthy':
                    health_status['overall_status'] = 'degraded'
                    
            except Exception as e:
                health_status['providers'][provider_name] = {
                    'status': 'unhealthy',
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                }
                health_status['overall_status'] = 'degraded'
        
        return health_status
    
    async def refresh_user_data(self, user_id: str) -> bool:
        """
        Refresh cached portfolio data for a user (called by webhooks).
        
        Args:
            user_id: User identifier
            
        Returns:
            True if refresh was successful
        """
        try:
            logger.info(f"🔄 Refreshing portfolio data for user {user_id}")
            
            # Clear any cached data
            await self._invalidate_user_cache(user_id)
            
            # Force fresh fetch from all providers
            for provider_name, provider in self.providers.items():
                try:
                    success = await provider.refresh_data(user_id)
                    if success:
                        logger.info(f"✅ Refreshed {provider_name} data for user {user_id}")
                    else:
                        logger.warning(f"⚠️ Failed to refresh {provider_name} data for user {user_id}")
                except Exception as e:
                    logger.error(f"Error refreshing {provider_name} for user {user_id}: {e}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error refreshing data for user {user_id}: {e}")
            return False
    
    async def _invalidate_user_cache(self, user_id: str):
        """Invalidate all cached data for a user (Redis + Database)."""
        try:
            logger.info(f"🗑️ Invalidating cache for user {user_id}")
            
            # Clear Redis cache
            try:
                from api_server import get_redis_client
                redis_client = await get_redis_client()
                if redis_client:
                    await redis_client.delete(f"portfolio:{user_id}")
                    logger.info(f"🗑️ Cleared Redis cache for user {user_id}")
            except Exception as e:
                logger.warning(f"Failed to clear Redis cache for user {user_id}: {e}")
            
            # Clear database cache tables
            try:
                from utils.supabase.db_client import get_supabase_client
                supabase = get_supabase_client()
                
                # Clear aggregated holdings cache
                supabase.table('user_aggregated_holdings').delete().eq('user_id', user_id).execute()
                
                # Note: We don't clear portfolio snapshots as they're historical data
                # Only clear today's manual snapshots if needed
                today = datetime.now().date().isoformat()
                supabase.table('user_portfolio_snapshots')\
                    .delete()\
                    .eq('user_id', user_id)\
                    .eq('snapshot_date', today)\
                    .eq('snapshot_type', 'manual')\
                    .execute()
                
                logger.info(f"🗑️ Cleared database cache for user {user_id}")
                
            except Exception as e:
                logger.warning(f"Failed to clear database cache for user {user_id}: {e}")
                
        except Exception as e:
            logger.error(f"Error invalidating cache for user {user_id}: {e}")
    
    def _normalize_security_type(self, security_type: str) -> str:
        """Normalize security types to match database constraints."""
        if not security_type:
            return 'other'
            
        # Map Plaid security types to database-compliant types
        type_mapping = {
            'mutual fund': 'mutual_fund',
            'fixed income': 'bond',
            'derivative': 'option',
            'cryptocurrency': 'crypto',
            'equity': 'equity',
            'etf': 'etf',
            'cash': 'cash',
            'bond': 'bond',
            'option': 'option',
            'crypto': 'crypto',
            'other': 'other'
        }
        
        normalized = type_mapping.get(security_type.lower(), 'other')
        logger.debug(f"🔄 Security type mapping: '{security_type}' -> '{normalized}'")
        return normalized
    
    async def _save_aggregated_holdings_to_cache(self, user_id: str, aggregated_positions: List[Dict[str, Any]]):
        """Save aggregated holdings to cache table for fast future loading."""
        try:
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            
            # Clear existing cached holdings for this user
            supabase.table('user_aggregated_holdings').delete().eq('user_id', user_id).execute()
            
            # Insert new aggregated holdings
            cache_records = []
            logger.info(f"🔄 Processing {len(aggregated_positions)} positions for cache")
            for position in aggregated_positions:
                # Handle percentage values (sentinel value -999999 means N/A)
                gain_loss_percent = position['unrealized_gain_loss_percent']
                
                # Don't cap sentinel values
                if gain_loss_percent != -999999:
                    # Cap percentage values to fit within numeric(10, 4) constraints (max ±999,999.9999)
                    if abs(gain_loss_percent) > 999999.9999:
                        gain_loss_percent = 999999.9999 if gain_loss_percent > 0 else -999999.9999
                        logger.warning(f"Capped unrealized_gain_loss_percent for {position['symbol']}: {position['unrealized_gain_loss_percent']} -> {gain_loss_percent}")
                
                # Normalize security type for database compliance
                original_type = position.get('security_type', '')
                normalized_type = self._normalize_security_type(original_type)
                logger.info(f"💾 Caching {position['symbol']}: {original_type} -> {normalized_type}")
                
                cache_record = {
                    'user_id': user_id,
                    'symbol': position['symbol'],
                    'security_name': position.get('security_name'),
                    'security_type': normalized_type,
                    'total_quantity': position['total_quantity'],
                    'total_market_value': position['total_market_value'],
                    'total_cost_basis': position['total_cost_basis'],
                    'average_cost_basis': position['average_cost_basis'],
                    'unrealized_gain_loss': position['unrealized_gain_loss'],
                    'unrealized_gain_loss_percent': gain_loss_percent,
                    'account_contributions': position['accounts'],
                    'institution_breakdown': {inst: True for inst in position['institutions']},
                    'account_count': len(position['accounts']),
                    'data_source': 'plaid'
                }
                cache_records.append(cache_record)
            
            if cache_records:
                result = supabase.table('user_aggregated_holdings').insert(cache_records).execute()
                logger.info(f"💾 Cached {len(cache_records)} aggregated holdings for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error caching aggregated holdings for user {user_id}: {e}")
            # Don't fail the main request if caching fails
    
    async def _create_portfolio_snapshot(self, user_id: str, total_value: Decimal, 
                                       total_cost_basis: Decimal, account_count: int):
        """Create portfolio snapshot for historical tracking."""
        try:
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            
            gain_loss = total_value - total_cost_basis
            gain_loss_percent = Decimal('0')
            if total_cost_basis > 0:
                gain_loss_percent = (gain_loss / total_cost_basis) * Decimal('100')
            
            snapshot_data = {
                'user_id': user_id,
                'snapshot_date': datetime.now().date().isoformat(),
                'snapshot_type': 'manual',
                'total_value': float(total_value),
                'total_cost_basis': float(total_cost_basis),
                'total_gain_loss': float(gain_loss),
                'total_gain_loss_percent': float(gain_loss_percent),
                'account_count': account_count,
                'provider_breakdown': {'plaid': {'accounts': account_count, 'value': float(total_value)}},
                'data_completeness_score': 100.0,
                'providers_synced': ['plaid']
            }
            
            # Use upsert to handle daily snapshots
            result = supabase.table('user_portfolio_snapshots')\
                .upsert(snapshot_data, on_conflict='user_id,snapshot_date,snapshot_type')\
                .execute()
            
            logger.info(f"📸 Created portfolio snapshot for user {user_id}: ${total_value}")
            
        except Exception as e:
            logger.error(f"Error creating portfolio snapshot for user {user_id}: {e}")
            # Don't fail the main request if snapshot creation fails
    
    def _empty_portfolio_response(self) -> Dict[str, Any]:
        """Return empty portfolio structure for error cases."""
        return {
            'accounts': [],
            'positions': [],
            'summary': {
                'total_value': 0.0,
                'total_cost_basis': 0.0,
                'total_gain_loss': 0.0,
                'total_gain_loss_percent': 0.0,
                'account_count': 0,
                'position_count': 0
            },
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'providers': [],
                'data_freshness': 'error'
            }
        }

# Global service instance (Singleton pattern)
_portfolio_service = None

def get_portfolio_service() -> PortfolioService:
    """
    Get the global portfolio service instance.
    
    Implements Singleton pattern to ensure consistent service instance
    across the application while allowing for dependency injection in tests.
    """
    global _portfolio_service
    if _portfolio_service is None:
        _portfolio_service = PortfolioService()
    return _portfolio_service
