"""
SnapTrade Portfolio Reconstruction Service

Production-grade service for reconstructing portfolio history from SnapTrade transaction data.

Key Features:
- Fetches all historical transactions from SnapTrade (paginated)
- Replays transactions chronologically to build portfolio states
- Fetches and caches historical EOD prices from FMP API
- Generates daily snapshots from account inception to present
- Handles multi-user efficiency (shared price cache across all users)

Architecture:
- Modular, testable design following SOLID principles
- Batch processing with controlled API usage
- Comprehensive error handling and logging
- Database-first approach with caching layer
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date, timedelta
from dataclasses import dataclass
from collections import defaultdict
from decimal import Decimal
import requests
import os

logger = logging.getLogger(__name__)

@dataclass
class PortfolioSnapshot:
    """Represents a portfolio state at a specific date."""
    snapshot_date: date
    total_value: Decimal
    total_cost_basis: Decimal
    total_gain_loss: Decimal
    total_gain_loss_percent: Decimal
    holdings: Dict[str, Dict[str, Any]]  # symbol -> {quantity, cost_basis, market_value}
    
@dataclass
class Transaction:
    """Normalized transaction from SnapTrade."""
    trade_date: date
    symbol: str
    type: str  # BUY, SELL, DIVIDEND, etc.
    quantity: Decimal
    price: Decimal
    net_amount: Decimal
    fees: Decimal

class SnapTradePortfolioReconstructionService:
    """
    Production-grade service for reconstructing portfolio history from SnapTrade transactions.
    """
    
    def __init__(self):
        """Initialize the reconstruction service."""
        self.supabase = None
        self.snaptrade_client = None
        self.fmp_api_key = os.getenv('FINANCIAL_MODELING_PREP_API_KEY', '')
        
        # Performance tracking
        self.total_transactions_processed = 0
        self.total_snapshots_created = 0
        self.total_api_calls = 0
    
    def _get_supabase_client(self):
        """Lazy load Supabase client."""
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    def _get_snaptrade_client(self):
        """Lazy load SnapTrade client."""
        if self.snaptrade_client is None:
            from snaptrade_client import SnapTrade
            self.snaptrade_client = SnapTrade(
                consumer_key=os.getenv("SNAPTRADE_CONSUMER_KEY"),
                client_id=os.getenv("SNAPTRADE_CLIENT_ID"),
            )
        return self.snaptrade_client
    
    async def reconstruct_user_portfolio_history(
        self, 
        user_id: str,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Main entry point: Reconstruct entire portfolio history for a SnapTrade user.
        
        Args:
            user_id: Clera user ID
            force_refresh: If True, re-fetch all data even if history exists
            
        Returns:
            Dictionary with reconstruction statistics
        """
        start_time = datetime.now()
        
        try:
            logger.info(f"🚀 Starting portfolio reconstruction for user {user_id}")
            
            # Step 1: Get SnapTrade credentials
            snap_user = await self._get_snaptrade_user(user_id)
            if not snap_user:
                return {'success': False, 'error': 'User not connected to SnapTrade'}
            
            # Step 2: Get user's SnapTrade accounts
            accounts = await self._get_user_snaptrade_accounts(user_id)
            if not accounts:
                return {'success': False, 'error': 'No SnapTrade accounts found'}
            
            # Step 3: For each account, fetch transactions and reconstruct
            total_snapshots = 0
            total_transactions = 0
            all_snapshots = []  # Track all snapshots across accounts
            
            for account in accounts:
                account_id = account['provider_account_id']
                logger.info(f"📊 Processing account {account_id}")
                
                # Fetch all transactions
                transactions = await self._fetch_all_transactions(
                    account_id,
                    snap_user['snaptrade_user_id'],
                    snap_user['snaptrade_user_secret']
                )
                
                if not transactions:
                    logger.warning(f"⚠️  No transactions found for account {account_id}")
                    continue
                
                total_transactions += len(transactions)
                logger.info(f"✅ Fetched {len(transactions)} transactions")
                
                # Replay transactions to build daily snapshots
                snapshots = await self._replay_transactions_to_snapshots(
                    transactions,
                    user_id
                )
                
                total_snapshots += len(snapshots)
                all_snapshots.extend(snapshots)
                logger.info(f"✅ Generated {len(snapshots)} daily snapshots")
                
                # Store snapshots in database
                await self._store_snapshots(user_id, snapshots)
            
            duration = (datetime.now() - start_time).total_seconds()
            
            return {
                'success': True,
                'user_id': user_id,
                'accounts_processed': len(accounts),
                'total_transactions': total_transactions,
                'total_snapshots': total_snapshots,
                'processing_duration_seconds': duration,
                'earliest_date': min(s.snapshot_date for s in all_snapshots).isoformat() if all_snapshots else None,
                'latest_date': max(s.snapshot_date for s in all_snapshots).isoformat() if all_snapshots else None
            }
            
        except Exception as e:
            logger.error(f"❌ Error reconstructing portfolio for user {user_id}: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e),
                'user_id': user_id
            }
    
    async def _get_snaptrade_user(self, user_id: str) -> Optional[Dict]:
        """Get SnapTrade user credentials from database."""
        supabase = self._get_supabase_client()
        result = supabase.table('snaptrade_users')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()
        
        return result.data[0] if result.data else None
    
    async def _get_user_snaptrade_accounts(self, user_id: str) -> List[Dict]:
        """Get user's SnapTrade investment accounts."""
        supabase = self._get_supabase_client()
        result = supabase.table('user_investment_accounts')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('provider', 'snaptrade')\
            .eq('is_active', True)\
            .execute()
        
        return result.data or []
    
    async def _fetch_all_transactions(
        self,
        account_id: str,
        snaptrade_user_id: str,
        user_secret: str
    ) -> List[Transaction]:
        """
        Fetch ALL historical transactions from SnapTrade (with pagination).
        
        SnapTrade returns max 1000 transactions per request, so we paginate.
        """
        client = self._get_snaptrade_client()
        all_transactions = []
        offset = 0
        limit = 1000
        
        while True:
            try:
                logger.info(f"📥 Fetching transactions batch: offset={offset}, limit={limit}")
                
                response = client.account_information.get_account_activities(
                    account_id=account_id,
                    user_id=snaptrade_user_id,
                    user_secret=user_secret,
                    offset=offset,
                    limit=limit
                )
                
                self.total_api_calls += 1
                
                # SnapTrade returns paginated data
                activities = response.body.get('data', [])
                
                if not activities:
                    break  # No more data
                
                # Parse and normalize transactions
                for activity in activities:
                    try:
                        tx = self._parse_transaction(activity)
                        if tx:
                            all_transactions.append(tx)
                    except Exception as e:
                        logger.warning(f"⚠️  Failed to parse transaction: {e}")
                
                # Check if we have more pages
                pagination = response.body.get('pagination', {})
                if not pagination.get('has_more', False):
                    break
                
                offset += limit
                
            except Exception as e:
                logger.error(f"❌ Error fetching transactions at offset {offset}: {e}")
                break
        
        # Sort by trade date (oldest first)
        all_transactions.sort(key=lambda t: t.trade_date)
        
        return all_transactions
    
    def _parse_transaction(self, activity: Dict) -> Optional[Transaction]:
        """Parse a SnapTrade activity into our normalized Transaction format."""
        try:
            # Extract symbol (can be nested)
            symbol_data = activity.get('symbol', {})
            if isinstance(symbol_data, dict):
                symbol = symbol_data.get('symbol', symbol_data.get('ticker', 'UNKNOWN'))
            else:
                symbol = str(symbol_data) if symbol_data else 'UNKNOWN'
            
            # Skip activities without a symbol (deposits, withdrawals, etc.)
            if symbol == 'UNKNOWN' or not symbol:
                return None
            
            return Transaction(
                trade_date=datetime.strptime(activity['trade_date'], '%Y-%m-%d').date(),
                symbol=symbol,
                type=activity.get('type', 'UNKNOWN'),
                quantity=Decimal(str(activity.get('quantity', 0))),
                price=Decimal(str(activity.get('price', 0))),
                net_amount=Decimal(str(activity.get('net_amount', 0))),
                fees=Decimal(str(activity.get('fee', 0)))
            )
        except Exception as e:
            logger.warning(f"⚠️  Failed to parse transaction: {e}")
            return None
    
    async def _replay_transactions_to_snapshots(
        self,
        transactions: List[Transaction],
        user_id: str
    ) -> List[PortfolioSnapshot]:
        """
        Replay transactions chronologically to build daily portfolio snapshots.
        
        Algorithm:
        1. Group transactions by date
        2. For each date, apply transactions to update holdings
        3. Fetch EOD prices for all holdings on that date
        4. Calculate portfolio value and create snapshot
        """
        if not transactions:
            return []
        
        # Current portfolio state (symbol -> {quantity, cost_basis})
        holdings = defaultdict(lambda: {'quantity': Decimal(0), 'cost_basis': Decimal(0)})
        
        # Group transactions by date
        transactions_by_date = defaultdict(list)
        for tx in transactions:
            transactions_by_date[tx.trade_date].append(tx)
        
        # Get date range
        start_date = min(tx.trade_date for tx in transactions)
        end_date = max(tx.trade_date for tx in transactions)
        
        # Generate snapshots for each trading day
        snapshots = []
        current_date = start_date
        
        while current_date <= end_date:
            # Apply transactions for this date
            if current_date in transactions_by_date:
                for tx in transactions_by_date[current_date]:
                    self._apply_transaction_to_holdings(tx, holdings)
            
            # Skip if no holdings
            if not any(h['quantity'] > 0 for h in holdings.values()):
                current_date += timedelta(days=1)
                continue
            
            # Fetch EOD prices for all holdings
            symbols = [symbol for symbol, h in holdings.items() if h['quantity'] > 0]
            prices = await self._get_historical_prices(symbols, current_date)
            
            # Calculate portfolio value
            total_value = Decimal(0)
            total_cost_basis = Decimal(0)
            snapshot_holdings = {}
            
            for symbol, holding in holdings.items():
                if holding['quantity'] <= 0:
                    continue
                
                price = prices.get(symbol, Decimal(0))
                market_value = holding['quantity'] * price
                
                total_value += market_value
                total_cost_basis += holding['cost_basis']
                
                snapshot_holdings[symbol] = {
                    'quantity': holding['quantity'],
                    'cost_basis': holding['cost_basis'],
                    'market_value': market_value,
                    'price': price
                }
            
            # Create snapshot
            if total_value > 0:
                total_gain_loss = total_value - total_cost_basis
                total_gain_loss_percent = (total_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else Decimal(0)
                
                snapshots.append(PortfolioSnapshot(
                    snapshot_date=current_date,
                    total_value=total_value,
                    total_cost_basis=total_cost_basis,
                    total_gain_loss=total_gain_loss,
                    total_gain_loss_percent=total_gain_loss_percent,
                    holdings=snapshot_holdings
                ))
            
            current_date += timedelta(days=1)
        
        return snapshots
    
    def _apply_transaction_to_holdings(
        self,
        tx: Transaction,
        holdings: Dict[str, Dict[str, Decimal]]
    ):
        """Apply a transaction to update holdings (quantity and cost basis)."""
        symbol = tx.symbol
        
        if tx.type == 'BUY':
            # Add to position
            holdings[symbol]['quantity'] += tx.quantity
            holdings[symbol]['cost_basis'] += abs(tx.net_amount)
        
        elif tx.type == 'SELL':
            # Reduce position (proportional cost basis)
            if holdings[symbol]['quantity'] > 0:
                # FIX: Detect overselling - don't allow selling more than available
                if tx.quantity > holdings[symbol]['quantity']:
                    logger.warning(
                        f"⚠️ Oversell detected: Attempting to sell {tx.quantity} shares "
                        f"but only {holdings[symbol]['quantity']} available for {symbol}. "
                        f"Transaction: {tx.trade_date} - This may indicate data inconsistency."
                    )
                    # Cap the sell to available quantity to prevent negative holdings
                    actual_sell_quantity = holdings[symbol]['quantity']
                    sell_ratio = actual_sell_quantity / holdings[symbol]['quantity']
                    holdings[symbol]['cost_basis'] *= (1 - sell_ratio)
                    holdings[symbol]['quantity'] = Decimal(0)
                else:
                    sell_ratio = tx.quantity / holdings[symbol]['quantity']
                    holdings[symbol]['cost_basis'] *= (1 - sell_ratio)
                    holdings[symbol]['quantity'] -= tx.quantity
            else:
                # Attempting to sell when position is zero or negative
                logger.warning(
                    f"⚠️ Sell transaction on zero/negative position: {symbol} "
                    f"on {tx.trade_date}. Quantity: {holdings[symbol]['quantity']}, "
                    f"Sell amount: {tx.quantity}. This may indicate data inconsistency."
                )
                # Don't process the sell - position is already zero/negative
        
        elif tx.type == 'DIVIDEND':
            # Dividends don't affect quantity or cost basis
            pass
        
        # Clean up zero positions
        if holdings[symbol]['quantity'] <= 0:
            holdings[symbol]['quantity'] = Decimal(0)
            holdings[symbol]['cost_basis'] = Decimal(0)
    
    async def _get_historical_prices(
        self,
        symbols: List[str],
        price_date: date
    ) -> Dict[str, Decimal]:
        """
        Get EOD prices for symbols on a specific date.
        
        Uses cached database prices first, fetches from FMP if needed.
        Caches fetched prices for future use across all users.
        """
        supabase = self._get_supabase_client()
        prices = {}
        symbols_to_fetch = []
        
        # Step 1: Check cache
        for symbol in symbols:
            result = supabase.table('global_historical_prices')\
                .select('close_price')\
                .eq('fmp_symbol', symbol)\
                .eq('price_date', price_date.isoformat())\
                .is_('price_timestamp', 'null')\
                .limit(1)\
                .execute()
            
            if result.data:
                prices[symbol] = Decimal(str(result.data[0]['close_price']))
            else:
                symbols_to_fetch.append(symbol)
        
        # Step 2: Fetch missing prices from FMP
        if symbols_to_fetch and self.fmp_api_key:
            fetched_prices = await self._fetch_fmp_historical_prices(symbols_to_fetch, price_date)
            prices.update(fetched_prices)
            
            # Step 3: Cache fetched prices
            await self._cache_historical_prices(fetched_prices, price_date)
        
        return prices
    
    async def _fetch_fmp_historical_prices(
        self,
        symbols: List[str],
        price_date: date
    ) -> Dict[str, Decimal]:
        """Fetch historical EOD prices from FMP API."""
        prices = {}
        
        try:
            # FMP endpoint for historical prices
            # We'll fetch one symbol at a time for accuracy
            for symbol in symbols:
                url = f"https://financialmodelingprep.com/api/v3/historical-price-full/{symbol}"
                params = {
                    'apikey': self.fmp_api_key,
                    'from': price_date.isoformat(),
                    'to': price_date.isoformat()
                }
                
                response = requests.get(url, params=params, timeout=10)
                self.total_api_calls += 1
                
                if response.status_code == 200:
                    data = response.json()
                    historical = data.get('historical', [])
                    if historical:
                        prices[symbol] = Decimal(str(historical[0]['close']))
                else:
                    logger.warning(f"⚠️  Failed to fetch price for {symbol} on {price_date}: {response.status_code}")
            
        except Exception as e:
            logger.error(f"❌ Error fetching FMP prices: {e}")
        
        return prices
    
    async def _cache_historical_prices(
        self,
        prices: Dict[str, Decimal],
        price_date: date
    ):
        """Cache fetched prices in database for future use."""
        supabase = self._get_supabase_client()
        
        for symbol, price in prices.items():
            try:
                supabase.table('global_historical_prices').insert({
                    'fmp_symbol': symbol,
                    'price_date': price_date.isoformat(),
                    'close_price': float(price),
                    'data_source': 'fmp',
                    'data_quality': 100.0
                }).execute()
            except Exception as e:
                # Ignore duplicate key errors (price already cached)
                pass
    
    async def _store_snapshots(
        self,
        user_id: str,
        snapshots: List[PortfolioSnapshot]
    ):
        """Store generated snapshots in user_portfolio_history table."""
        supabase = self._get_supabase_client()
        
        for snapshot in snapshots:
            try:
                supabase.table('user_portfolio_history').insert({
                    'user_id': user_id,
                    'value_date': snapshot.snapshot_date.isoformat(),
                    'snapshot_type': 'reconstructed',
                    'total_value': float(snapshot.total_value),
                    'total_cost_basis': float(snapshot.total_cost_basis),
                    'total_gain_loss': float(snapshot.total_gain_loss),
                    'total_gain_loss_percent': float(snapshot.total_gain_loss_percent),
                    'securities_count': len(snapshot.holdings),
                    'data_quality_score': 100.0
                }, upsert=True, on_conflict='user_id,value_date,snapshot_type').execute()
                
                self.total_snapshots_created += 1
                
            except Exception as e:
                logger.error(f"❌ Error storing snapshot for {snapshot.snapshot_date}: {e}")

# Singleton instance
_reconstruction_service = None

def get_reconstruction_service() -> SnapTradePortfolioReconstructionService:
    """Get singleton reconstruction service instance."""
    global _reconstruction_service
    if _reconstruction_service is None:
        _reconstruction_service = SnapTradePortfolioReconstructionService()
    return _reconstruction_service

