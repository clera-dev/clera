"""
Unified Portfolio Data Provider for AI Agents

This service abstracts portfolio data fetching from multiple sources (Alpaca, Plaid)
and provides a consistent interface for AI agents regardless of the user's account type.

Supports:
- Brokerage mode (Alpaca only)
- Aggregation mode (Plaid only)
- Hybrid mode (both Alpaca and Plaid)
"""

import logging
from typing import Dict, List, Optional, Tuple
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

from utils.supabase.db_client import get_supabase_client
from utils.alpaca.broker_client_factory import get_broker_client
from utils.authorization import AuthorizationService

logger = logging.getLogger(__name__)


@dataclass
class PortfolioHolding:
    """Unified portfolio holding representation"""
    symbol: str
    security_name: str
    security_type: str  # 'equity', 'etf', 'mutual_fund', 'bond', 'crypto', 'option', 'cash'
    quantity: Decimal
    market_value: Decimal
    cost_basis: Decimal
    unrealized_pl: Decimal
    unrealized_plpc: Decimal  # As decimal (e.g., 0.05 for 5%)
    source: str  # 'alpaca' or 'plaid'
    
    @property
    def weight(self) -> Decimal:
        """Weight will be calculated externally based on total portfolio value"""
        return Decimal('0')


@dataclass
class UserPortfolioMode:
    """Represents the user's portfolio account configuration"""
    has_alpaca: bool
    has_plaid: bool
    has_snaptrade: bool
    alpaca_account_id: Optional[str]
    user_id: str
    
    @property
    def mode(self) -> str:
        """Returns 'brokerage', 'aggregation', or 'hybrid'"""
        if self.has_alpaca and (self.has_plaid or self.has_snaptrade):
            return 'hybrid'
        elif self.has_alpaca:
            return 'brokerage'
        elif self.has_plaid or self.has_snaptrade:
            return 'aggregation'
        return 'none'
    
    @property
    def is_valid(self) -> bool:
        """User must have at least one account type"""
        return self.has_alpaca or self.has_plaid or self.has_snaptrade


class PortfolioDataProvider:
    """
    Unified interface for fetching portfolio data from multiple sources.
    
    This class handles the complexity of determining which data sources are available
    for a user and merging data from multiple sources when applicable.
    """
    
    def __init__(self, user_id: str):
        """
        Initialize provider for a specific user.
        
        Args:
            user_id: Supabase user ID
        """
        self.user_id = user_id
        self.supabase = get_supabase_client()
        self.broker_client = get_broker_client()
        self._mode: Optional[UserPortfolioMode] = None
        
    def get_user_mode(self) -> UserPortfolioMode:
        """
        Determine the user's portfolio mode by checking onboarding status.
        
        Returns:
            UserPortfolioMode with information about connected accounts
            
        Raises:
            ValueError: If user has no connected accounts
        """
        if self._mode:
            return self._mode
            
        try:
            result = self.supabase.table('user_onboarding')\
                .select('alpaca_account_id, plaid_connection_completed_at')\
                .eq('user_id', self.user_id)\
                .single()\
                .execute()
            
            if not result.data:
                raise ValueError(f"No onboarding record found for user {self.user_id}")
            
            data = result.data
            has_alpaca = bool(data.get('alpaca_account_id'))
            has_plaid = bool(data.get('plaid_connection_completed_at'))
            alpaca_account_id = data.get('alpaca_account_id') if has_alpaca else None
            
            # Check for SnapTrade accounts
            has_snaptrade = self._has_snaptrade_accounts()
            
            self._mode = UserPortfolioMode(
                has_alpaca=has_alpaca,
                has_plaid=has_plaid,
                has_snaptrade=has_snaptrade,
                alpaca_account_id=alpaca_account_id,
                user_id=self.user_id
            )
            
            if not self._mode.is_valid:
                raise ValueError(f"User {self.user_id} has no connected accounts (Alpaca, Plaid, or SnapTrade)")
            
            logger.info(f"[PortfolioDataProvider] User {self.user_id} mode: {self._mode.mode} (Alpaca:{has_alpaca}, Plaid:{has_plaid}, SnapTrade:{has_snaptrade})")
            return self._mode
            
        except ValueError:
            # Re-raise ValueError as-is (already has good message)
            raise
        except Exception as e:
            # Check if it's a UUID format error from Supabase
            error_msg = str(e)
            if 'uuid' in error_msg.lower() or '22P02' in error_msg:
                raise ValueError(f"Invalid user ID format: {self.user_id}")
            
            logger.error(f"[PortfolioDataProvider] Error determining user mode: {e}", exc_info=True)
            raise
    
    def get_cash_balance(self) -> Decimal:
        """
        Get cash balance from available sources.
        
        IMPORTANT: For aggregation mode, cash is INCLUDED in holdings, so return 0 here.
        For brokerage/hybrid mode with Alpaca, return Alpaca cash (NOT in holdings).
        
        Returns:
            Decimal: Cash balance (0 for aggregation-only users since cash is in holdings)
        """
        mode = self.get_user_mode()
        
        if mode.has_alpaca:
            # Brokerage or Hybrid mode: Return Alpaca cash (not in holdings)
            try:
                account = self.broker_client.get_account_by_id(mode.alpaca_account_id)
                cash = Decimal(str(account.cash))
                logger.info(f"[PortfolioDataProvider] Fetched Alpaca cash: ${cash}")
                return cash
            except Exception as e:
                logger.error(f"[PortfolioDataProvider] Error fetching Alpaca cash: {e}")
                return Decimal('0')
        
        # For aggregation-only users, cash is ALREADY in holdings - return 0 to avoid double-counting
        logger.info(f"[PortfolioDataProvider] Aggregation mode - cash is in holdings, returning 0")
        return Decimal('0')
    
    def get_holdings(self) -> List[PortfolioHolding]:
        """
        Get all portfolio holdings from available sources.
        
        Returns:
            List[PortfolioHolding]: Unified list of holdings from all sources
        """
        mode = self.get_user_mode()
        holdings = []
        
        # Fetch Alpaca holdings if available
        if mode.has_alpaca:
            alpaca_holdings = self._get_alpaca_holdings(mode.alpaca_account_id)
            holdings.extend(alpaca_holdings)
            logger.info(f"[PortfolioDataProvider] Fetched {len(alpaca_holdings)} Alpaca holdings")
        
        # Fetch SnapTrade holdings if available (preferred over Plaid)
        if mode.has_snaptrade:
            snaptrade_holdings = self._get_snaptrade_holdings()
            holdings.extend(snaptrade_holdings)
            logger.info(f"[PortfolioDataProvider] Fetched {len(snaptrade_holdings)} SnapTrade holdings")
        
        # Fetch Plaid holdings if available (fallback/additional)
        if mode.has_plaid:
            plaid_holdings = self._get_plaid_holdings()
            holdings.extend(plaid_holdings)
            logger.info(f"[PortfolioDataProvider] Fetched {len(plaid_holdings)} Plaid holdings")
        
        logger.info(f"[PortfolioDataProvider] Total holdings: {len(holdings)} ({mode.mode} mode)")
        return holdings
    
    def _get_alpaca_holdings(self, account_id: str) -> List[PortfolioHolding]:
        """Fetch holdings from Alpaca broker API"""
        try:
            positions = self.broker_client.get_all_positions_for_account(account_id=account_id)
            holdings = []
            
            for pos in positions:
                try:
                    # Determine security type from Alpaca asset class
                    security_type = self._map_alpaca_asset_class(pos.asset_class)
                    
                    holding = PortfolioHolding(
                        symbol=pos.symbol,
                        security_name=pos.symbol,  # Alpaca doesn't provide full names
                        security_type=security_type,
                        quantity=Decimal(str(pos.qty)),
                        market_value=Decimal(str(pos.market_value)),
                        cost_basis=Decimal(str(pos.cost_basis)),
                        unrealized_pl=Decimal(str(pos.unrealized_pl)),
                        unrealized_plpc=Decimal(str(pos.unrealized_plpc)),
                        source='alpaca'
                    )
                    holdings.append(holding)
                except Exception as e:
                    logger.warning(f"[PortfolioDataProvider] Error processing Alpaca position {pos.symbol}: {e}")
                    continue
            
            return holdings
            
        except Exception as e:
            logger.error(f"[PortfolioDataProvider] Error fetching Alpaca holdings: {e}", exc_info=True)
            return []
    
    def _get_plaid_holdings(self) -> List[PortfolioHolding]:
        """Fetch holdings from Plaid aggregated data"""
        try:
            result = self.supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', self.user_id)\
                .execute()
            
            if not result.data:
                return []
            
            holdings = []
            for h in result.data:
                try:
                    # INCLUDE CASH - it's part of aggregated holdings for Plaid users
                    # (Cash is NOT handled separately for aggregation mode)
                    # Skip nothing - include all securities including cash
                    
                    # Handle sentinel value for unreliable returns
                    unrealized_plpc = h.get('unrealized_gain_loss_percent')
                    if unrealized_plpc == -999999.0 or unrealized_plpc <= -999999:
                        # Unreliable data - keep sentinel value for agent to detect
                        unrealized_plpc = Decimal('-999999')
                    else:
                        # Convert percentage to decimal (e.g., 10.5% → 0.105)
                        unrealized_plpc = Decimal(str(unrealized_plpc)) / Decimal('100')
                    
                    holding = PortfolioHolding(
                        symbol=h.get('symbol', 'UNKNOWN'),
                        security_name=h.get('security_name', 'Unknown Security'),
                        security_type=h.get('security_type', 'unknown'),
                        quantity=Decimal(str(h.get('total_quantity', 0))),
                        market_value=Decimal(str(h.get('total_market_value', 0))),
                        cost_basis=Decimal(str(h.get('total_cost_basis', 0))),
                        unrealized_pl=Decimal(str(h.get('unrealized_gain_loss', 0))),
                        unrealized_plpc=unrealized_plpc,
                        source='plaid'
                    )
                    holdings.append(holding)
                except Exception as e:
                    logger.warning(f"[PortfolioDataProvider] Error processing Plaid holding {h.get('symbol')}: {e}")
                    continue
            
            return holdings
            
        except Exception as e:
            logger.error(f"[PortfolioDataProvider] Error fetching Plaid holdings: {e}", exc_info=True)
            return []
    
    def _map_alpaca_asset_class(self, asset_class) -> str:
        """Map Alpaca asset class to our security type"""
        asset_class_str = str(asset_class).lower()
        
        if 'equity' in asset_class_str or 'stock' in asset_class_str:
            return 'equity'
        elif 'crypto' in asset_class_str:
            return 'crypto'
        elif 'option' in asset_class_str:
            return 'option'
        else:
            return 'equity'  # Default to equity for US equities
    
    def _has_snaptrade_accounts(self) -> bool:
        """Check if user has active SnapTrade accounts."""
        try:
            result = self.supabase.table('user_investment_accounts')\
                .select('id')\
                .eq('user_id', self.user_id)\
                .eq('provider', 'snaptrade')\
                .eq('is_active', True)\
                .limit(1)\
                .execute()
            return bool(result.data)
        except Exception as e:
            logger.error(f"Error checking SnapTrade accounts: {e}")
            return False
    
    def _get_snaptrade_holdings(self) -> List[PortfolioHolding]:
        """Fetch holdings from SnapTrade aggregated data (same table as Plaid)."""
        try:
            # SnapTrade holdings are stored in the same aggregated_holdings table
            # We filter by checking if any accounts in the 'accounts' JSONB array are SnapTrade
            result = self.supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', self.user_id)\
                .execute()
            
            if not result.data:
                return []
            
            holdings = []
            for h in result.data:
                try:
                    # Check if this holding has SnapTrade accounts
                    accounts_list = h.get('accounts', [])
                    has_snaptrade = any(
                        acc.get('account_id', '').startswith('snaptrade_') 
                        for acc in accounts_list
                    )
                    
                    if not has_snaptrade:
                        continue  # Skip non-SnapTrade holdings
                    
                    # Handle sentinel value for unreliable returns
                    unrealized_plpc = h.get('unrealized_gain_loss_percent')
                    if unrealized_plpc == -999999.0 or unrealized_plpc <= -999999:
                        unrealized_plpc = Decimal('-999999')  # Keep sentinel
                    else:
                        unrealized_plpc = Decimal(str(unrealized_plpc or 0))
                    
                    holding = PortfolioHolding(
                        symbol=h['symbol'],
                        security_name=h.get('security_name', h['symbol']),
                        security_type=h.get('security_type', 'equity'),
                        quantity=Decimal(str(h.get('total_quantity', 0))),
                        market_value=Decimal(str(h.get('total_market_value', 0))),
                        cost_basis=Decimal(str(h.get('average_cost_basis', 0) or 0)),
                        unrealized_pl=Decimal(str(h.get('unrealized_gain_loss', 0) or 0)),
                        unrealized_plpc=unrealized_plpc,
                        source='snaptrade'
                    )
                    holdings.append(holding)
                    
                except Exception as e:
                    logger.warning(f"[PortfolioDataProvider] Error processing SnapTrade holding {h.get('symbol')}: {e}")
                    continue
            
            return holdings
            
        except Exception as e:
            logger.error(f"[PortfolioDataProvider] Error fetching SnapTrade holdings: {e}", exc_info=True)
            return []
    
    def get_account_activities_alpaca(
        self,
        date_start: Optional[datetime] = None,
        date_end: Optional[datetime] = None
    ) -> List[Dict]:
        """
        Get account activities from Alpaca (for brokerage users).
        
        Args:
            date_start: Start date (defaults to 60 days ago)
            date_end: End date (defaults to now)
            
        Returns:
            List[Dict]: Activity records from Alpaca
        """
        mode = self.get_user_mode()
        
        if not mode.has_alpaca:
            return []
        
        try:
            # Import here to avoid circular dependencies
            from clera_agents.tools.purchase_history import get_account_activities
            
            # Set defaults
            if date_end is None:
                date_end = datetime.now(timezone.utc)
            if date_start is None:
                date_start = date_end - timedelta(days=60)
            
            activities = get_account_activities(
                account_id=mode.alpaca_account_id,
                date_start=date_start,
                date_end=date_end
            )
            
            # Convert ActivityRecord objects to dicts
            return [
                {
                    'date': act.date,
                    'type': act.type,
                    'symbol': act.symbol,
                    'description': act.description,
                    'quantity': act.quantity,
                    'price': act.price,
                    'amount': act.amount,
                    'source': 'alpaca'
                }
                for act in activities
            ]
            
        except Exception as e:
            logger.error(f"[PortfolioDataProvider] Error fetching Alpaca activities: {e}", exc_info=True)
            return []
    
    def get_account_activities_plaid(
        self,
        months_back: int = 12
    ) -> List[Dict]:
        """
        Get investment transactions from Plaid (for aggregation users).
        
        NOTE: Plaid provides historical transaction data, not just recent activities.
        
        Args:
            months_back: Number of months of history to fetch (default 12)
            
        Returns:
            List[Dict]: Transaction records from Plaid
        """
        mode = self.get_user_mode()
        
        if not mode.has_plaid:
            return []
        
        try:
            # Calculate date range
            end_date = datetime.now(timezone.utc)
            start_date = end_date - timedelta(days=months_back * 30)
            
            # Query Plaid investment transactions
            result = self.supabase.table('plaid_investment_transactions')\
                .select('*')\
                .eq('user_id', self.user_id)\
                .gte('date', start_date.strftime('%Y-%m-%d'))\
                .lte('date', end_date.strftime('%Y-%m-%d'))\
                .order('date', desc=True)\
                .execute()
            
            if not result.data:
                return []
            
            # Convert to standardized format
            activities = []
            for txn in result.data:
                activities.append({
                    'date': txn.get('date'),
                    'type': txn.get('type', 'transaction'),
                    'symbol': txn.get('security_id', 'UNKNOWN'),
                    'description': f"{txn.get('type', 'Transaction')} - {txn.get('name', 'Investment Transaction')}",
                    'quantity': abs(Decimal(str(txn.get('quantity', 0)))),
                    'price': Decimal(str(txn.get('price', 0))),
                    'amount': Decimal(str(txn.get('amount', 0))),
                    'source': 'plaid'
                })
            
            logger.info(f"[PortfolioDataProvider] Fetched {len(activities)} Plaid transactions")
            return activities
            
        except Exception as e:
            logger.error(f"[PortfolioDataProvider] Error fetching Plaid activities: {e}", exc_info=True)
            return []

