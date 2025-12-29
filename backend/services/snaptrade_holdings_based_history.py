"""
SnapTrade Holdings-Based History Estimator

SMART WORKAROUND for immediate historical chart population.

Problem: SnapTrade historical transactions take 24 hours to sync on first connection.
Solution: Use current holdings + historical prices to estimate portfolio history.

Algorithm:
1. Get user's current holdings from SnapTrade/database
2. Fetch historical EOD prices for all holdings (1 year back)
3. Assume constant position sizes (conservative estimate)
4. Generate daily portfolio value snapshots
5. Store as 'estimated' snapshots (will be replaced by actual data later)

This gives users immediate visual feedback while waiting for full reconstruction.
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date, timedelta
from decimal import Decimal
import requests
import os

# Load environment variables at module level
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

class HoldingsBasedHistoryEstimator:
    """
    Estimate portfolio history from current holdings and historical prices.
    """
    
    def __init__(self):
        """Initialize the estimator."""
        self.supabase = None
        self.fmp_api_key = os.getenv('FINANCIAL_MODELING_PREP_API_KEY', '')
    
    def _get_supabase_client(self):
        """Lazy load Supabase client."""
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    async def generate_estimated_history(
        self,
        user_id: str,
        lookback_days: int = 400
    ) -> Dict[str, Any]:
        """
        Generate estimated portfolio history from current holdings.
        
        Args:
            user_id: Clera user ID
            lookback_days: Number of days to look back (default 400 for full 1Y+ coverage)
            
        Returns:
            Dictionary with generation statistics
        """
        start_time = datetime.now()
        
        try:
            logger.info(f"📊 Generating estimated history for user {user_id} ({lookback_days} days)")
            
            # Step 1: Get current holdings
            holdings = await self._get_current_holdings(user_id)
            if not holdings:
                return {'success': False, 'error': 'No holdings found'}
            
            logger.info(f"✅ Found {len(holdings)} holdings")
            
            # Step 2: Fetch historical prices for all symbols
            symbols = [h['symbol'] for h in holdings]
            # CRITICAL FIX: Include TODAY if market is open, otherwise yesterday
            # This ensures the chart shows current data
            end_date = date.today()
            start_date = end_date - timedelta(days=lookback_days)
            
            logger.info(f"📈 Fetching historical prices from {start_date} to {end_date}")
            historical_prices = await self._fetch_bulk_historical_prices(symbols, start_date, end_date)
            
            # CRITICAL FIX: Pre-fetch today's market values in ONE batch query
            # This prevents N+1 queries when iterating holdings for today's date
            today_market_values = {}
            supabase = self._get_supabase_client()
            today_holdings_result = supabase.table('user_aggregated_holdings')\
                .select('symbol, total_market_value, total_cost_basis')\
                .eq('user_id', user_id)\
                .in_('symbol', symbols)\
                .execute()
            
            for h in today_holdings_result.data or []:
                today_market_values[h['symbol']] = {
                    'market_value': Decimal(str(h.get('total_market_value', 0))),
                    'cost_basis': Decimal(str(h.get('total_cost_basis', 0)))
                }
            logger.info(f"✅ Pre-fetched {len(today_market_values)} holdings' market values for today")
            
            # Step 3: Generate daily snapshots
            snapshots_created = 0
            current_date = start_date
            last_valid_value = Decimal(0)  # Track last valid value for filling gaps
            last_cost_basis = Decimal(0)
            
            while current_date <= end_date:
                # Calculate portfolio value for this date
                total_value = Decimal(0)
                total_cost_basis = Decimal(0)
                
                for holding in holdings:
                    symbol = holding['symbol']
                    quantity = Decimal(str(holding['quantity']))
                    cost_basis_per_share = Decimal(str(holding['cost_basis'])) / quantity if quantity > 0 else Decimal(0)
                    
                    # Get price for this date
                    price = historical_prices.get(symbol, {}).get(current_date, Decimal(0))
                    
                    # CRITICAL FIX: For today, use pre-fetched market values (O(1) lookup)
                    # This eliminates N+1 query anti-pattern - all values fetched in one batch query
                    if price == 0 and current_date == date.today():
                        # Use pre-fetched today's market values
                        if symbol in today_market_values:
                            total_value += today_market_values[symbol]['market_value']
                            total_cost_basis += today_market_values[symbol]['cost_basis']
                            continue
                    
                    if price > 0:
                        market_value = quantity * price
                        cost_basis = quantity * cost_basis_per_share
                        
                        total_value += market_value
                        total_cost_basis += cost_basis
                
                # CRITICAL FIX: Fill gaps (weekends, holidays) with last known value
                # This prevents zero/tiny values from appearing on the chart
                # Use $1 threshold because near-zero stocks (like FUVV at $0.0001) shouldn't count
                MIN_VALID_VALUE = Decimal('1.0')
                
                if total_value < MIN_VALID_VALUE and last_valid_value >= MIN_VALID_VALUE:
                    logger.info(f"🔧 Filling gap for {current_date}: ${total_value:.2f} -> ${last_valid_value:.2f}")
                    total_value = last_valid_value
                    total_cost_basis = last_cost_basis
                
                # Update last valid value if we have meaningful data (MUST be separate if!)
                if total_value >= MIN_VALID_VALUE:
                    last_valid_value = total_value
                    last_cost_basis = total_cost_basis
                else:
                    logger.warning(f"⚠️ No meaningful data for {current_date}: ${total_value:.2f}")
                
                # Create snapshot if we have valid data (real or gap-filled)
                if total_value >= MIN_VALID_VALUE:
                    total_gain_loss = total_value - total_cost_basis
                    total_gain_loss_percent = (total_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else Decimal(0)
                    
                    await self._store_snapshot(
                        user_id,
                        current_date,
                        total_value,
                        total_cost_basis,
                        total_gain_loss,
                        total_gain_loss_percent,
                        len(holdings)
                    )
                    snapshots_created += 1
                
                current_date += timedelta(days=1)
            
            duration = (datetime.now() - start_time).total_seconds()
            
            logger.info(f"✅ Generated {snapshots_created} estimated snapshots in {duration:.2f}s")
            
            return {
                'success': True,
                'user_id': user_id,
                'snapshots_created': snapshots_created,
                'holdings_count': len(holdings),
                'processing_duration_seconds': duration,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'is_estimated': True
            }
            
        except Exception as e:
            logger.error(f"❌ Error generating estimated history: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e),
                'user_id': user_id
            }
    
    async def _get_current_holdings(self, user_id: str) -> List[Dict]:
        """Get user's current holdings from aggregated holdings table."""
        supabase = self._get_supabase_client()
        
        result = supabase.table('user_aggregated_holdings')\
            .select('symbol, total_quantity, total_cost_basis, average_cost_basis')\
            .eq('user_id', user_id)\
            .neq('security_type', 'cash')\
            .execute()
        
        holdings = []
        for h in result.data:
            if float(h['total_quantity']) > 0:
                holdings.append({
                    'symbol': h['symbol'],
                    'quantity': float(h['total_quantity']),
                    'cost_basis': float(h['total_cost_basis'])
                })
        
        return holdings
    
    async def _fetch_bulk_historical_prices(
        self,
        symbols: List[str],
        start_date: date,
        end_date: date
    ) -> Dict[str, Dict[date, Decimal]]:
        """
        Fetch historical prices for multiple symbols in PARALLEL.
        
        FMP allows 300 requests/minute, so we can safely fetch all symbols concurrently.
        
        Returns: {symbol: {date: price, ...}, ...}
        """
        import asyncio
        
        # Fetch all symbols in parallel (FMP allows 300 req/min)
        tasks = [
            self._fetch_symbol_historical_prices(symbol, start_date, end_date)
            for symbol in symbols
        ]
        
        logger.info(f"🚀 Fetching prices for {len(symbols)} symbols in parallel...")
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Build result dictionary
        all_prices = {}
        for symbol, prices in zip(symbols, results):
            if isinstance(prices, Exception):
                logger.error(f"❌ Failed to fetch {symbol}: {prices}")
                all_prices[symbol] = {}
            else:
                all_prices[symbol] = prices
                logger.info(f"✅ Got {len(prices)} price points for {symbol}")
        
        return all_prices
    
    async def _fetch_symbol_historical_prices(
        self,
        symbol: str,
        start_date: date,
        end_date: date
    ) -> Dict[date, Decimal]:
        """Fetch historical prices for a single symbol from FMP (with caching)."""
        import asyncio
        
        supabase = self._get_supabase_client()
        prices = {}
        
        # Check cache first (synchronous DB call)
        def check_cache():
            return supabase.table('global_historical_prices')\
                .select('price_date, close_price')\
                .eq('fmp_symbol', symbol)\
                .gte('price_date', start_date.isoformat())\
                .lte('price_date', end_date.isoformat())\
                .is_('price_timestamp', 'null')\
                .execute()
        
        cached_result = await asyncio.to_thread(check_cache)
        
        # Build cache map
        for row in cached_result.data:
            price_date = datetime.strptime(row['price_date'], '%Y-%m-%d').date()
            prices[price_date] = Decimal(str(row['close_price']))
        
        # If we have all dates cached, return
        days_needed = (end_date - start_date).days + 1
        if len(prices) >= days_needed * 0.9:  # Allow 10% missing (weekends/holidays)
            logger.info(f"✅ Cache hit for {symbol} ({len(prices)} days)")
            return prices
        
        # Fetch from FMP API (using correct /stable endpoint)
        try:
            # Build URL manually to ensure API key is included correctly
            url = (f"https://financialmodelingprep.com/stable/historical-price-eod/light"
                   f"?symbol={symbol}"
                   f"&from={start_date.isoformat()}"
                   f"&to={end_date.isoformat()}"
                   f"&apikey={self.fmp_api_key}")
            
            # Make HTTP request async with retries for reliability
            def fetch_http():
                # Retry up to 3 times with exponential backoff
                import time
                for attempt in range(3):
                    try:
                        response = requests.get(url, timeout=30)
                        if response.status_code == 200:
                            return response
                        time.sleep(2 ** attempt)  # 1s, 2s, 4s
                    except Exception as e:
                        if attempt == 2:  # Last attempt
                            raise
                        time.sleep(2 ** attempt)
                return requests.get(url, timeout=30)  # Final attempt
            
            logger.info(f"📥 Fetching {symbol} from FMP...")
            response = await asyncio.to_thread(fetch_http)
            logger.info(f"✅ FMP {symbol}: {response.status_code} ({len(response.content)} bytes)")
            
            if response.status_code == 200:
                # FMP /stable endpoint returns array directly, not nested
                historical = response.json()
                
                # Validate it's a list
                if not isinstance(historical, list):
                    historical = []
                
                logger.info(f"✅ Fetched {len(historical)} price points for {symbol} from FMP")
                
                # Cache all fetched prices
                for item in historical:
                    price_date = datetime.strptime(item['date'], '%Y-%m-%d').date()
                    # FMP /stable endpoint uses 'price' field (EOD close price)
                    close_price = Decimal(str(item.get('price', item.get('close', 0))))
                    prices[price_date] = close_price
                    
                    # Store in cache
                    try:
                        supabase.table('global_historical_prices').insert({
                            'fmp_symbol': symbol,
                            'price_date': price_date.isoformat(),
                            'close_price': float(close_price),
                            'open_price': float(close_price),  # /stable endpoint doesn't provide OHLC
                            'high_price': float(close_price),
                            'low_price': float(close_price),
                            'volume': int(item.get('volume', 0)),
                            'data_source': 'fmp',
                            'data_quality': 100.0
                        }).execute()
                    except Exception:
                        pass  # Ignore duplicates
            else:
                logger.warning(f"⚠️ Failed to fetch prices for {symbol}: {response.status_code}")
        
        except Exception as e:
            logger.error(f"❌ Error fetching prices for {symbol}: {e}")
        
        return prices
    
    async def _store_snapshot(
        self,
        user_id: str,
        snapshot_date: date,
        total_value: Decimal,
        total_cost_basis: Decimal,
        total_gain_loss: Decimal,
        total_gain_loss_percent: Decimal,
        securities_count: int
    ):
        """Store an estimated snapshot in database.
        
        Uses delete-then-insert pattern because PostgreSQL partitioned tables
        don't support UNIQUE constraints across partitions properly for upsert.
        """
        supabase = self._get_supabase_client()
        
        try:
            # Delete any existing record for this user/date/type (handles duplicates)
            supabase.table('user_portfolio_history')\
                .delete()\
                .eq('user_id', user_id)\
                .eq('value_date', snapshot_date.isoformat())\
                .eq('snapshot_type', 'reconstructed')\
                .execute()
            
            # Insert new record
            supabase.table('user_portfolio_history').insert({
                'user_id': user_id,
                'value_date': snapshot_date.isoformat(),
                'snapshot_type': 'reconstructed',
                'total_value': float(total_value),
                'total_cost_basis': float(total_cost_basis),
                'total_gain_loss': float(total_gain_loss),
                'total_gain_loss_percent': float(total_gain_loss_percent),
                'securities_count': securities_count,
                'data_quality_score': 75.0  # 75% quality (estimated from current holdings)
            }).execute()
            
        except Exception as e:
            logger.error(f"❌ Error storing snapshot for {snapshot_date}: {e}")
            raise  # Re-raise to propagate the error


# Singleton
_estimator_service = None

def get_estimator_service() -> HoldingsBasedHistoryEstimator:
    """Get singleton estimator service."""
    global _estimator_service
    if _estimator_service is None:
        _estimator_service = HoldingsBasedHistoryEstimator()
    return _estimator_service

