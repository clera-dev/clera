"""
SnapTrade Historical Portfolio Estimator

PRODUCTION-GRADE: Creates estimated historical portfolio snapshots for SnapTrade accounts
when the brokerage doesn't provide historical data via SnapTrade's reporting API.

APPROACH:
1. Get current holdings from SnapTrade
2. Fetch historical EOD prices from FMP for each security
3. Calculate daily portfolio value by applying historical prices to current quantities
4. Store snapshots in database for charting

LIMITATIONS & ASSUMPTIONS:
- Assumes current quantities were held historically (may not account for trades)
- More accurate for "buy and hold" portfolios
- Less accurate for frequently traded portfolios
- Still MUCH better than showing $0 or flat lines

This is the INDUSTRY-STANDARD approach when brokerages don't provide historical data.
Many fintech platforms (Mint, Personal Capital, etc.) use similar methodology.
"""

import os
import logging
import asyncio
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class SnapTradeHistoryEstimator:
    """
    Estimates historical portfolio values for SnapTrade accounts using current holdings
    and historical market prices.
    
    This is necessary because many brokerages (like Webull via SnapTrade) don't provide
    historical portfolio values through their APIs.
    """
    
    def __init__(self):
        """Initialize the history estimator."""
        from snaptrade_client import SnapTrade
        
        self.client = SnapTrade(
            consumer_key=os.getenv('SNAPTRADE_CONSUMER_KEY'),
            client_id=os.getenv('SNAPTRADE_CLIENT_ID')
        )
    
    def _get_supabase_client(self):
        """Get Supabase client for database operations."""
        from supabase import create_client
        
        return create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        )
    
    def _get_historical_price_service(self):
        """Get historical price service."""
        from services.historical_price_service import get_historical_price_service
        return get_historical_price_service()
    
    async def estimate_portfolio_history(
        self,
        user_id: str,
        lookback_days: int = 365
    ) -> Dict[str, Any]:
        """
        Estimate historical portfolio values using current holdings + historical prices.
        
        Args:
            user_id: Clera user ID
            lookback_days: Number of days of history to estimate
            
        Returns:
            Dict with 'success', 'snapshots_created', 'date_range', and optional 'error'
        """
        try:
            supabase = self._get_supabase_client()
            price_service = self._get_historical_price_service()
            
            logger.info(f"📊 Starting history estimation for user {user_id}")
            
            # Get SnapTrade credentials
            user_creds = supabase.table('snaptrade_users')\
                .select('snaptrade_user_id, snaptrade_user_secret')\
                .eq('user_id', user_id)\
                .single()\
                .execute()
            
            if not user_creds.data:
                return {
                    'success': False,
                    'error': 'No SnapTrade credentials found',
                    'snapshots_created': 0
                }
            
            snaptrade_user_id = user_creds.data['snaptrade_user_id']
            user_secret = user_creds.data['snaptrade_user_secret']
            
            # Get all user accounts
            accounts_response = self.client.account_information.list_user_accounts(
                user_id=snaptrade_user_id,
                user_secret=user_secret
            )
            
            if not accounts_response.body:
                return {
                    'success': False,
                    'error': 'No SnapTrade accounts found',
                    'snapshots_created': 0
                }
            
            logger.info(f"   Found {len(accounts_response.body)} accounts")
            
            # Get current holdings for all accounts
            all_holdings = []
            total_cash = 0.0
            
            for account in accounts_response.body:
                account_id = str(account['id'])
                account_name = account.get('name', 'Unknown')
                
                logger.info(f"   Processing account: {account_name}")
                
                # Get positions
                positions_response = self.client.account_information.get_user_account_positions(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret,
                    account_id=account_id
                )
                
                if positions_response.body:
                    for position in positions_response.body:
                        # Handle both dict and object position formats
                        if isinstance(position, dict):
                            symbol_data = position.get('symbol')
                            quantity = float(position.get('units', 0))
                        else:
                            symbol_data = getattr(position, 'symbol', None)
                            quantity = float(getattr(position, 'units', 0))
                        
                        # Extract symbol string - SnapTrade has deeply nested symbol structure
                        # Structure: position['symbol']['symbol']['symbol'] = 'AAPL'
                        symbol = None
                        if isinstance(symbol_data, dict):
                            # Try nested symbol.symbol.symbol
                            nested = symbol_data.get('symbol', {})
                            if isinstance(nested, dict):
                                symbol = nested.get('symbol')
                            else:
                                symbol = nested
                        else:
                            symbol = symbol_data
                        
                        if symbol and symbol != 'USD' and quantity > 0:  # Skip cash and zero positions
                            all_holdings.append({
                                'symbol': symbol,
                                'quantity': quantity,
                                'account_id': account_id,
                                'account_name': account_name
                            })
                            logger.debug(f"     Added holding: {symbol} x {quantity}")
                
                # Get cash balance
                try:
                    balance_response = self.client.account_information.get_user_account_balance(
                        user_id=snaptrade_user_id,
                        user_secret=user_secret,
                        account_id=account_id
                    )
                    
                    for balance in balance_response.body:
                        if isinstance(balance, dict) and 'cash' in balance:
                            total_cash += float(balance.get('cash', 0) or 0)
                except Exception as e:
                    logger.warning(f"Could not fetch cash balance for {account_name}: {e}")
            
            if not all_holdings:
                logger.warning(f"⚠️  No holdings found for user {user_id}")
                return {
                    'success': True,
                    'snapshots_created': 0,
                    'error': 'No holdings to estimate history from'
                }
            
            logger.info(f"   Total holdings: {len(all_holdings)} positions, ${total_cash:,.2f} cash")
            
            # Group holdings by symbol and sum quantities
            holdings_by_symbol = {}
            for holding in all_holdings:
                symbol = holding['symbol']
                if symbol not in holdings_by_symbol:
                    holdings_by_symbol[symbol] = 0.0
                holdings_by_symbol[symbol] += holding['quantity']
            
            logger.info(f"   Unique symbols: {len(holdings_by_symbol)}")
            
            # Fetch historical prices for all symbols
            end_date = date.today()
            start_date = end_date - timedelta(days=lookback_days)
            
            logger.info(f"   Fetching historical prices: {start_date} to {end_date}")
            
            symbols = list(holdings_by_symbol.keys())
            historical_prices = await self._fetch_historical_prices_batch(
                price_service, symbols, start_date, end_date
            )
            
            logger.info(f"   Got prices for {len(historical_prices)} symbols")
            
            # Calculate daily portfolio values
            logger.info(f"   Calculating daily portfolio values...")
            
            snapshots = []
            current_date = start_date
            
            while current_date <= end_date:
                # Skip weekends
                if current_date.weekday() >= 5:
                    current_date += timedelta(days=1)
                    continue
                
                daily_value = total_cash  # Start with cash
                securities_valued = 0
                
                # Add value of each position
                for symbol, quantity in holdings_by_symbol.items():
                    if quantity <= 0:
                        continue
                    
                    # Get price for this date
                    price = self._get_price_for_date(
                        historical_prices.get(symbol, {}),
                        current_date
                    )
                    
                    if price and price > 0:
                        daily_value += quantity * price
                        securities_valued += 1
                
                # Only create snapshot if we have at least some price data
                if securities_valued > 0:
                    snapshots.append({
                        'user_id': user_id,
                        'value_date': current_date.isoformat(),
                        'total_value': daily_value,
                        'total_cost_basis': daily_value,  # We don't know actual cost basis
                        'total_gain_loss': 0.0,
                        'total_gain_loss_percent': 0.0,
                        'snapshot_type': 'reconstructed',  # Use 'reconstructed' (DB constraint)
                        'data_source': 'snaptrade_estimated',  # But mark as estimated in data_source
                        'securities_count': securities_valued
                    })
                
                current_date += timedelta(days=1)
            
            logger.info(f"   Generated {len(snapshots)} daily snapshots")
            
            # Store in database
            if snapshots:
                # Delete BOTH estimated AND old reconstructed snapshots to avoid duplicates
                # (old Plaid-based reconstructor created bad data)
                supabase.table('user_portfolio_history')\
                    .delete()\
                    .eq('user_id', user_id)\
                    .eq('data_source', 'snaptrade_estimated')\
                    .execute()
                
                supabase.table('user_portfolio_history')\
                    .delete()\
                    .eq('user_id', user_id)\
                    .eq('data_source', 'reconstructed')\
                    .execute()
                
                logger.info(f"   Cleaned up old estimated and reconstructed snapshots")
                
                # Batch insert
                batch_size = 100
                for i in range(0, len(snapshots), batch_size):
                    batch = snapshots[i:i+batch_size]
                    supabase.table('user_portfolio_history')\
                        .insert(batch)\
                        .execute()
                
                logger.info(f"✅ Stored {len(snapshots)} estimated snapshots")
            
            return {
                'success': True,
                'snapshots_created': len(snapshots),
                'date_range': {
                    'start': snapshots[0]['value_date'] if snapshots else None,
                    'end': snapshots[-1]['value_date'] if snapshots else None
                },
                'estimation_method': 'current_holdings_with_historical_prices',
                'symbols_priced': len(historical_prices),
                'total_holdings': len(holdings_by_symbol)
            }
            
        except Exception as e:
            logger.error(f"Error estimating portfolio history: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'snapshots_created': 0
            }
    
    async def _fetch_historical_prices_batch(
        self,
        price_service,
        symbols: List[str],
        start_date: date,
        end_date: date
    ) -> Dict[str, Dict[date, float]]:
        """
        Fetch historical prices for multiple symbols using the historical price service.
        
        Returns:
            Dict mapping symbol -> {date -> price}
        """
        prices_by_symbol = {}
        
        # The historical price service already has batch fetching and caching
        logger.info(f"   Fetching prices for {len(symbols)} symbols...")
        
        for symbol in symbols:
            try:
                # Get prices for this symbol using our custom range method
                price_dict = await self._get_symbol_prices_range(
                    price_service, symbol, start_date, end_date
                )
                
                if price_dict:
                    prices_by_symbol[symbol] = price_dict
                    logger.debug(f"   Got {len(price_dict)} prices for {symbol}")
                
            except Exception as e:
                logger.warning(f"Failed to fetch prices for {symbol}: {e}")
                continue
        
        return prices_by_symbol
    
    async def _get_symbol_prices_range(
        self,
        price_service,
        symbol: str,
        start_date: date,
        end_date: date
    ) -> Dict[date, float]:
        """
        Fetch all prices for a symbol in a date range.
        
        Note: The historical_price_service.get_price_for_symbol_on_date is designed
        for single dates, so we need to fetch the entire range and convert to dict.
        """
        try:
            # Check if cached in database first
            supabase = self._get_supabase_client()
            
            cached_prices = supabase.table('global_historical_prices')\
                .select('price_date, close_price')\
                .eq('fmp_symbol', symbol)\
                .gte('price_date', start_date.isoformat())\
                .lte('price_date', end_date.isoformat())\
                .execute()
            
            if cached_prices.data and len(cached_prices.data) > 0:
                # Convert to dict
                price_dict = {}
                for row in cached_prices.data:
                    try:
                        price_date = datetime.strptime(row['price_date'], '%Y-%m-%d').date()
                        close_price = float(row['close_price'])
                        price_dict[price_date] = close_price
                    except (KeyError, ValueError) as e:
                        continue
                
                logger.debug(f"   Cache hit for {symbol}: {len(price_dict)} prices")
                return price_dict
            
            # Not in cache, fetch from FMP
            logger.debug(f"   Cache miss for {symbol}, fetching from FMP...")
            
            import os
            import aiohttp
            
            api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
            if not api_key:
                logger.error("FINANCIAL_MODELING_PREP_API_KEY not set")
                return {}
            
            url = f"https://financialmodelingprep.com/api/v3/historical-price-full/{symbol}"
            params = {
                'apikey': api_key,
                'from': start_date.isoformat(),
                'to': end_date.isoformat()
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        price_dict = {}
                        historical = data.get('historical', [])
                        
                        for price_data in historical:
                            try:
                                price_date = datetime.strptime(price_data['date'], '%Y-%m-%d').date()
                                close_price = float(price_data['close'])
                                price_dict[price_date] = close_price
                                
                                # Cache in database
                                supabase.table('global_historical_prices')\
                                    .upsert({
                                        'fmp_symbol': symbol,
                                        'price_date': price_date.isoformat(),
                                        'open_price': float(price_data.get('open', 0)),
                                        'high_price': float(price_data.get('high', 0)),
                                        'low_price': float(price_data.get('low', 0)),
                                        'close_price': close_price,
                                        'volume': int(price_data.get('volume', 0)),
                                        'data_source': 'fmp'
                                    }, on_conflict='fmp_symbol,price_date')\
                                    .execute()
                                
                            except (KeyError, ValueError) as e:
                                continue
                        
                        logger.debug(f"   Fetched and cached {len(price_dict)} prices for {symbol}")
                        return price_dict
                    else:
                        logger.warning(f"FMP API returned status {response.status} for {symbol}")
                        return {}
            
        except Exception as e:
            logger.error(f"Error fetching prices for {symbol}: {e}")
            return {}
    
    def _get_price_for_date(
        self,
        price_dict: Dict[date, float],
        target_date: date
    ) -> Optional[float]:
        """
        Get price for a specific date, with fallback to previous trading days.
        
        If exact date not found, looks back up to 5 trading days for the most recent price.
        """
        # Try exact date first
        if target_date in price_dict:
            return price_dict[target_date]
        
        # Look back up to 5 days for most recent price (handles holidays, data gaps)
        for i in range(1, 6):
            lookback_date = target_date - timedelta(days=i)
            if lookback_date in price_dict:
                return price_dict[lookback_date]
        
        return None


# Singleton instance
_estimator_instance = None


def get_snaptrade_history_estimator() -> SnapTradeHistoryEstimator:
    """Get or create singleton instance of SnapTrade history estimator."""
    global _estimator_instance
    if _estimator_instance is None:
        _estimator_instance = SnapTradeHistoryEstimator()
    return _estimator_instance

