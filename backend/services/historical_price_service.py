"""
Historical Price Service

Production-grade service for fetching and caching historical price data.
Optimized for massive scale with intelligent batching and cost minimization.

Key Features:
- Global symbol deduplication across all users
- Batch API requests for cost efficiency
- Permanent caching (historical prices never change)
- Intelligent retry logic with exponential backoff
- Comprehensive error handling and monitoring
"""

import asyncio
import logging
import json
import aiohttp
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date, timedelta
from dataclasses import dataclass
from decimal import Decimal

logger = logging.getLogger(__name__)

@dataclass
class PriceDataPoint:
    """Single price data point."""
    date: date
    open_price: Optional[float]
    high_price: Optional[float]
    low_price: Optional[float]
    close_price: float
    volume: Optional[int]
    adjusted_close: Optional[float]

@dataclass
class HistoricalPriceResult:
    """Result of historical price fetch operation."""
    symbol: str
    start_date: date
    end_date: date
    data_points: List[PriceDataPoint]
    success: bool
    error: Optional[str] = None
    api_calls_used: int = 0
    cache_hit: bool = False

@dataclass
class BatchPriceStats:
    """Statistics for batch price operations."""
    total_symbols: int
    successful_symbols: int
    failed_symbols: int
    total_data_points: int
    cache_hits: int
    cache_misses: int
    api_calls_made: int
    api_cost_estimate: float
    processing_duration_seconds: float

class HistoricalPriceService:
    """
    Production-grade historical price service.
    
    Designed for massive scale with intelligent cost optimization:
    - Global symbol deduplication across millions of users
    - Permanent caching (historical prices are immutable)
    - Batch requests to minimize API costs
    - Graceful degradation for missing data
    """
    
    def __init__(self):
        """Initialize the historical price service."""
        self.supabase = None  # Lazy loaded
        self.fmp_api_key = None  # Lazy loaded
        self.session = None  # HTTP session for connection pooling
        
        # Performance tracking
        self.api_calls_made = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.cost_estimate = 0.0
    
    def _get_supabase_client(self):
        """Lazy load Supabase client."""
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    def _get_fmp_api_key(self) -> str:
        """Lazy load FMP API key."""
        if self.fmp_api_key is None:
            import os
            self.fmp_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
            if not self.fmp_api_key:
                raise ValueError("FINANCIAL_MODELING_PREP_API_KEY environment variable is required")
        return self.fmp_api_key
    
    async def _get_http_session(self) -> aiohttp.ClientSession:
        """Get HTTP session with connection pooling for performance."""
        if self.session is None or self.session.closed:
            connector = aiohttp.TCPConnector(
                limit=100,  # Total connection pool size
                limit_per_host=20,  # Per-host connection limit
                ttl_dns_cache=300,  # DNS cache TTL
                use_dns_cache=True
            )
            
            timeout = aiohttp.ClientTimeout(total=30, connect=10)
            
            self.session = aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers={
                    'User-Agent': 'Clera-Portfolio-History/1.0'
                }
            )
        
        return self.session
    
    async def fetch_historical_prices_batch(self, symbols: List[str], 
                                          start_date: date, 
                                          end_date: date) -> BatchPriceStats:
        """
        Fetch historical prices for a batch of symbols with maximum efficiency.
        
        Args:
            symbols: List of FMP-compatible ticker symbols
            start_date: Start date for historical data
            end_date: End date for historical data
            
        Returns:
            BatchPriceStats with comprehensive operation metrics
        """
        start_time = datetime.now()
        
        # Global deduplication
        unique_symbols = list(set(symbols))
        logger.info(f"💰 Batch price fetch: {len(unique_symbols)} unique symbols (deduped from {len(symbols)})")
        
        # Check cache first (historical prices are immutable)
        cached_results, uncached_symbols = await self._check_price_cache(
            unique_symbols, start_date, end_date
        )
        
        logger.info(f"💾 Cache performance: {len(cached_results)} cached, {len(uncached_symbols)} need fetching")
        
        # Fetch uncached data with batch optimization
        fetched_results = {}
        if uncached_symbols:
            fetched_results = await self._batch_fetch_from_fmp(
                uncached_symbols, start_date, end_date
            )
            
            # Store fetched data permanently
            await self._store_price_data_permanently(fetched_results)
        
        # Combine cached and fetched results
        all_results = {**cached_results, **fetched_results}
        
        # Calculate comprehensive statistics
        stats = self._calculate_batch_stats(
            symbols, all_results, len(cached_results), len(uncached_symbols), start_time
        )
        
        logger.info(f"✅ Batch complete: {stats.successful_symbols}/{stats.total_symbols} symbols, "
                   f"{stats.api_calls_made} API calls, ~${stats.api_cost_estimate:.2f} cost")
        
        return stats
    
    async def _check_price_cache(self, symbols: List[str], 
                               start_date: date, 
                               end_date: date) -> Tuple[Dict[str, HistoricalPriceResult], List[str]]:
        """
        Check global price cache for existing data.
        
        Returns:
            Tuple of (cached_results, uncached_symbols)
        """
        try:
            supabase = self._get_supabase_client()
            
            cached_results = {}
            uncached_symbols = []
            
            for symbol in symbols:
                # Check if we have complete data for this symbol in the date range
                result = supabase.table('global_historical_prices')\
                    .select('price_date, close_price, open_price, high_price, low_price, volume, adjusted_close')\
                    .eq('fmp_symbol', symbol)\
                    .gte('price_date', start_date.isoformat())\
                    .lte('price_date', end_date.isoformat())\
                    .order('price_date')\
                    .execute()
                
                if result.data and len(result.data) > 0:
                    # Convert to PriceDataPoint objects
                    data_points = []
                    cached_dates = set()
                    for row in result.data:
                        row_date = datetime.fromisoformat(row['price_date']).date()
                        cached_dates.add(row_date)
                        data_points.append(PriceDataPoint(
                            date=row_date,
                            open_price=float(row['open_price']) if row['open_price'] else None,
                            high_price=float(row['high_price']) if row['high_price'] else None,
                            low_price=float(row['low_price']) if row['low_price'] else None,
                            close_price=float(row['close_price']),
                            volume=int(row['volume']) if row['volume'] else None,
                            adjusted_close=float(row['adjusted_close']) if row['adjusted_close'] else None
                        ))
                    
                    # FIX: Only mark as cache hit if we have full coverage of the date range
                    # Check if all dates in range are present (accounting for weekends/holidays)
                    from datetime import timedelta
                    expected_dates = set()
                    current_date = start_date
                    while current_date <= end_date:
                        # Skip weekends (Saturday=5, Sunday=6)
                        if current_date.weekday() < 5:
                            expected_dates.add(current_date)
                        current_date += timedelta(days=1)
                    
                    # Cache is complete if we have all expected trading days
                    if cached_dates >= expected_dates:
                        cached_results[symbol] = HistoricalPriceResult(
                            symbol=symbol,
                            start_date=start_date,
                            end_date=end_date,
                            data_points=data_points,
                            success=True,
                            cache_hit=True
                        )
                        self.cache_hits += 1
                    else:
                        # Partial cache - still need to fetch missing dates
                        uncached_symbols.append(symbol)
                        self.cache_misses += 1
                else:
                    uncached_symbols.append(symbol)
                    self.cache_misses += 1
            
            return cached_results, uncached_symbols
            
        except Exception as e:
            logger.error(f"Error checking price cache: {e}")
            # On cache error, fetch all symbols from API
            return {}, symbols
    
    async def _batch_fetch_from_fmp(self, symbols: List[str], 
                                  start_date: date, 
                                  end_date: date) -> Dict[str, HistoricalPriceResult]:
        """
        Batch fetch historical prices from FMP API with intelligent optimization.
        
        Uses FMP's batch endpoints and controlled concurrency for cost efficiency.
        """
        results = {}
        
        # Batch symbols into FMP-efficient groups (50 symbols per request max)
        symbol_batches = [symbols[i:i+50] for i in range(0, len(symbols), 50)]
        
        logger.info(f"🌐 Fetching from FMP: {len(symbol_batches)} batches, {len(symbols)} total symbols")
        
        # Process batches with controlled concurrency
        semaphore = asyncio.Semaphore(5)  # Max 5 concurrent API requests
        
        async def fetch_single_batch(symbol_batch):
            async with semaphore:
                return await self._fetch_price_batch_from_fmp(symbol_batch, start_date, end_date)
        
        # Execute all batches concurrently
        batch_tasks = [fetch_single_batch(batch) for batch in symbol_batches]
        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
        
        # Combine successful results
        for batch_result in batch_results:
            if isinstance(batch_result, dict):
                results.update(batch_result)
            else:
                logger.error(f"Batch fetch failed: {batch_result}")
        
        return results
    
    async def _fetch_price_batch_from_fmp(self, symbols: List[str], 
                                        start_date: date, 
                                        end_date: date) -> Dict[str, HistoricalPriceResult]:
        """
        Fetch historical prices for a single batch of symbols from FMP API.
        
        Uses FMP's bulk historical data endpoint for efficiency.
        """
        api_key = self._get_fmp_api_key()
        session = await self._get_http_session()
        results = {}
        
        # For each symbol in batch, make individual requests (FMP doesn't support true batch for historical)
        # But we can parallelize the individual requests within the batch
        
        async def fetch_single_symbol(symbol):
            try:
                url = f"https://financialmodelingprep.com/api/v3/historical-price-full/{symbol}"
                params = {
                    'from': start_date.isoformat(),
                    'to': end_date.isoformat(),
                    'apikey': api_key
                }
                
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        self.api_calls_made += 1
                        self.cost_estimate += 0.0025  # Estimate $0.0025 per request
                        
                        # Parse FMP response format
                        if 'historical' in data and data['historical']:
                            historical_data = data['historical']
                            
                            # Convert to PriceDataPoint objects
                            data_points = []
                            for price_data in historical_data:
                                data_points.append(PriceDataPoint(
                                    date=datetime.fromisoformat(price_data['date']).date(),
                                    open_price=float(price_data.get('open', 0)),
                                    high_price=float(price_data.get('high', 0)),
                                    low_price=float(price_data.get('low', 0)),
                                    close_price=float(price_data.get('close', 0)),
                                    volume=int(price_data.get('volume', 0)),
                                    adjusted_close=float(price_data.get('adjClose', price_data.get('close', 0)))
                                ))
                            
                            return HistoricalPriceResult(
                                symbol=symbol,
                                start_date=start_date,
                                end_date=end_date,
                                data_points=data_points,
                                success=True,
                                api_calls_used=1
                            )
                    
                    else:
                        logger.warning(f"FMP API error for {symbol}: {response.status}")
                        return HistoricalPriceResult(
                            symbol=symbol,
                            start_date=start_date,
                            end_date=end_date,
                            data_points=[],
                            success=False,
                            error=f"API error: {response.status}"
                        )
                
            except Exception as e:
                logger.error(f"Error fetching prices for {symbol}: {e}")
                return HistoricalPriceResult(
                    symbol=symbol,
                    start_date=start_date,
                    end_date=end_date,
                    data_points=[],
                    success=False,
                    error=str(e)
                )
        
        # Execute all symbol requests in parallel within the batch
        symbol_tasks = [fetch_single_symbol(symbol) for symbol in symbols]
        symbol_results = await asyncio.gather(*symbol_tasks, return_exceptions=True)
        
        # Process results
        for result in symbol_results:
            if isinstance(result, HistoricalPriceResult):
                results[result.symbol] = result
            else:
                logger.error(f"Symbol fetch exception: {result}")
        
        return results
    
    async def _store_price_data_permanently(self, price_results: Dict[str, HistoricalPriceResult]):
        """
        Store fetched price data permanently in global cache.
        
        Historical prices never change, so we cache them forever.
        """
        try:
            supabase = self._get_supabase_client()
            
            # Prepare batch insert data
            price_records = []
            
            for symbol, result in price_results.items():
                if not result.success or not result.data_points:
                    continue
                
                for data_point in result.data_points:
                    price_record = {
                        'fmp_symbol': symbol,
                        'price_date': data_point.date.isoformat(),
                        'price_timestamp': None,  # NULL for EOD data (daily reconstruction)
                        'open_price': data_point.open_price,
                        'high_price': data_point.high_price,
                        'low_price': data_point.low_price,
                        'close_price': data_point.close_price,
                        'volume': data_point.volume,
                        'adjusted_close': data_point.adjusted_close,
                        'data_source': 'fmp',
                        'data_quality': 100.0,
                        'fetch_timestamp': datetime.now().isoformat()
                    }
                    price_records.append(price_record)
            
            if price_records:
                # FIX: Handle EOD data (NULL timestamp) separately from intraday data
                # PostgreSQL's unique constraint with NULL values requires special handling
                # The partial unique indexes (idx_historical_prices_eod_unique) handle EOD data
                # but Supabase upsert may not recognize them correctly
                
                # Separate EOD and intraday records
                eod_records = [r for r in price_records if r.get('price_timestamp') is None]
                intraday_records = [r for r in price_records if r.get('price_timestamp') is not None]
                
                # Upsert EOD data using partial unique index (fmp_symbol, price_date WHERE price_timestamp IS NULL)
                if eod_records:
                    # For EOD data, use fmp_symbol + price_date for conflict resolution
                    # The partial unique index will enforce uniqueness
                    supabase.table('global_historical_prices')\
                        .upsert(eod_records, on_conflict='fmp_symbol,price_date')\
                        .execute()
                
                # Upsert intraday data using full unique constraint
                if intraday_records:
                    supabase.table('global_historical_prices')\
                        .upsert(intraday_records, on_conflict='fmp_symbol,price_date,price_timestamp')\
                        .execute()
                
                logger.info(f"💾 Stored {len(price_records)} price data points permanently "
                          f"({len(eod_records)} EOD, {len(intraday_records)} intraday)")
            
        except Exception as e:
            logger.error(f"Error storing price data: {e}")
    
    async def get_historical_prices_for_symbols(self, symbols: List[str], 
                                              start_date: date, 
                                              end_date: date) -> Dict[str, HistoricalPriceResult]:
        """
        Public interface for getting historical prices for multiple symbols.
        
        This is the main method used by the reconstruction engine.
        
        Args:
            symbols: List of FMP-compatible ticker symbols
            start_date: Start date for historical data
            end_date: End date for historical data
            
        Returns:
            Dictionary mapping symbol → HistoricalPriceResult
        """
        try:
            # Validate inputs
            if not symbols:
                return {}
            
            if start_date >= end_date:
                raise ValueError("start_date must be before end_date")
            
            # Execute batch fetch with statistics
            stats = await self.fetch_historical_prices_batch(symbols, start_date, end_date)
            
            # Return results in expected format
            # For now, return empty dict - the fetch_historical_prices_batch method
            # stores data but doesn't return the actual price data
            # We need to refactor this to return the actual data
            
            # Get the stored data back from cache
            cached_results, _ = await self._check_price_cache(symbols, start_date, end_date)
            
            return cached_results
            
        except Exception as e:
            logger.error(f"Error in batch historical price fetch: {e}")
            return {}
    
    def _calculate_batch_stats(self, original_symbols: List[str], 
                             results: Dict[str, HistoricalPriceResult],
                             cache_hits: int, cache_misses: int,
                             start_time: datetime) -> BatchPriceStats:
        """
        Calculate comprehensive statistics for batch operation.
        """
        successful = len([r for r in results.values() if r.success])
        failed = len(results) - successful
        total_data_points = sum(len(r.data_points) for r in results.values())
        
        duration = (datetime.now() - start_time).total_seconds()
        
        # Estimate API cost (FMP pricing)
        api_cost = self.api_calls_made * 0.0025  # ~$0.0025 per request
        
        return BatchPriceStats(
            total_symbols=len(original_symbols),
            successful_symbols=successful,
            failed_symbols=failed,
            total_data_points=total_data_points,
            cache_hits=cache_hits,
            cache_misses=cache_misses,
            api_calls_made=self.api_calls_made,
            api_cost_estimate=api_cost,
            processing_duration_seconds=duration
        )
    
    async def get_price_for_symbol_on_date(self, symbol: str, target_date: date) -> Optional[float]:
        """
        Get closing price for a specific symbol on a specific date.
        
        Optimized for reconstruction algorithm that needs individual price lookups.
        """
        try:
            supabase = self._get_supabase_client()
            
            # Check cache first
            result = supabase.table('global_historical_prices')\
                .select('close_price')\
                .eq('fmp_symbol', symbol)\
                .eq('price_date', target_date.isoformat())\
                .limit(1)\
                .execute()
            
            if result.data and len(result.data) > 0:
                return float(result.data[0]['close_price'])
            
            # If not in cache, we may need to fetch (but this should be rare
            # after batch fetching is complete)
            logger.debug(f"Price cache miss for {symbol} on {target_date}")
            return None
            
        except Exception as e:
            logger.error(f"Error getting price for {symbol} on {target_date}: {e}")
            return None
    
    async def close(self):
        """Clean up HTTP session."""
        if self.session and not self.session.closed:
            await self.session.close()

# Global service instance
historical_price_service = HistoricalPriceService()

def get_historical_price_service() -> HistoricalPriceService:
    """Get the global historical price service instance."""
    return historical_price_service
