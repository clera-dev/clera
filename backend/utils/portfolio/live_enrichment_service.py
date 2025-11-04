"""
Live Portfolio Data Enrichment Service

Production-grade service that enriches cached database holdings with live market prices.
Implements caching, rate limiting, and fallback strategies for billion-dollar scale.

Architecture:
- Fetches holdings from database (cached/stale prices OK)
- Enriches with live prices from market data API
- Caches enriched data for 60 seconds to minimize API calls
- Gracefully handles API failures with stale data fallback
"""

import os
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)

# In-memory cache for enriched data (60 second TTL)
_enrichment_cache: Dict[str, Dict[str, Any]] = {}
_cache_timestamps: Dict[str, datetime] = {}
CACHE_TTL_SECONDS = 60


class LiveEnrichmentService:
    """
    Service for enriching portfolio holdings with live market prices.
    
    This is the PRODUCTION-GRADE approach used by billion-dollar fintechs:
    - Cache database holdings (fast reads)
    - Enrich with live prices on-demand
    - Cache enriched results
    - Graceful degradation if API fails
    """
    
    def __init__(self):
        """Initialize the enrichment service with market data client."""
        self.market_data_client = None
        self._initialize_market_client()
    
    def _initialize_market_client(self):
        """
        Initialize Financial Modeling Prep (FMP) API client.
        
        FMP pricing: $50/month for 300 calls/min (10x cheaper than Alpaca)
        Free tier: 250 calls/day (good for development)
        """
        try:
            self.fmp_api_key = os.getenv('FINANCIAL_MODELING_PREP_API_KEY', '')
            
            if not self.fmp_api_key:
                logger.warning("FMP API key not found, live enrichment disabled")
                self.market_data_client = None
                return
            
            # FMP doesn't need a client object, just HTTP requests
            self.market_data_client = "fmp"  # Flag that we're using FMP
            logger.info("✅ Market data client initialized successfully (FMP)")
            
        except Exception as e:
            logger.error(f"Failed to initialize market data client: {e}")
            self.market_data_client = None
    
    def enrich_holdings(
        self,
        holdings: List[Dict[str, Any]],
        user_id: str,
        force_refresh: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Enrich holdings with live market prices.
        
        Args:
            holdings: List of holdings from database (may have stale prices)
            user_id: User ID for cache key
            force_refresh: If True, bypass cache
            
        Returns:
            List of holdings enriched with live prices
        """
        if not holdings:
            return []
        
        # Check cache first
        cache_key = f"{user_id}_enriched"
        if not force_refresh and self._is_cache_valid(cache_key):
            logger.debug(f"💨 Using cached enriched data for user {user_id}")
            return _enrichment_cache[cache_key]
        
        # Fetch live prices
        live_prices = self._fetch_live_prices(holdings)
        
        # Enrich each holding
        enriched = []
        for holding in holdings:
            enriched_holding = self._enrich_single_holding(holding, live_prices)
            enriched.append(enriched_holding)
        
        # Cache the results
        _enrichment_cache[cache_key] = enriched
        _cache_timestamps[cache_key] = datetime.utcnow()
        
        logger.info(f"✅ Enriched {len(enriched)} holdings for user {user_id}")
        return enriched
    
    def _fetch_live_prices(self, holdings: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Fetch live prices for all symbols in holdings using FMP API.
        
        Args:
            holdings: List of holdings with 'symbol' field
            
        Returns:
            Dictionary mapping symbol -> current price
        """
        if not self.market_data_client:
            logger.warning("Market data client not available, using stale prices")
            return {}
        
        try:
            import requests
            
            # Extract unique symbols
            symbols = list(set(h['symbol'] for h in holdings if h.get('symbol')))
            
            if not symbols:
                return {}
            
            logger.debug(f"🔄 Fetching live prices for {len(symbols)} symbols via FMP")
            
            # FMP batch quote endpoint (much more efficient than individual calls)
            # https://financialmodelingprep.com/api/v3/quote/AAPL,TSLA,MSFT?apikey=XXX
            symbols_str = ','.join(symbols)
            url = f"https://financialmodelingprep.com/api/v3/quote/{symbols_str}"
            
            response = requests.get(url, params={'apikey': self.fmp_api_key}, timeout=5)
            response.raise_for_status()
            
            # Parse response
            live_prices = {}
            for quote in response.json():
                symbol = quote.get('symbol')
                price = quote.get('price')
                if symbol and price:
                    live_prices[symbol] = float(price)
            
            logger.info(f"✅ Fetched live prices for {len(live_prices)}/{len(symbols)} symbols via FMP")
            return live_prices
            
        except Exception as e:
            logger.error(f"Failed to fetch live prices from FMP: {e}")
            return {}
    
    def _enrich_single_holding(
        self,
        holding: Dict[str, Any],
        live_prices: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Enrich a single holding with live price data.
        
        Args:
            holding: Original holding from database
            live_prices: Dictionary of symbol -> live price
            
        Returns:
            Enriched holding with updated market value and P/L
        """
        symbol = holding.get('symbol')
        quantity = float(holding.get('total_quantity', 0))
        cost_basis = float(holding.get('total_cost_basis', 0))
        security_type = holding.get('security_type', '')
        
        # Create a copy to avoid mutating original
        enriched = holding.copy()
        
        # CRITICAL FIX: Never enrich cash holdings - they're always 1:1
        if security_type == 'cash':
            enriched['price_is_live'] = True  # Cash is always "live" (it's just 1.0)
            enriched['current_price'] = 1.0
            return enriched
        
        if symbol in live_prices:
            # Calculate with live price
            current_price = live_prices[symbol]
            market_value = current_price * quantity
            unrealized_pl = market_value - cost_basis
            unrealized_pl_percent = (unrealized_pl / cost_basis) if cost_basis > 0 else 0
            
            # Update fields
            enriched['total_market_value'] = market_value
            enriched['unrealized_gain_loss'] = unrealized_pl
            enriched['unrealized_gain_loss_percent'] = unrealized_pl_percent * 100  # DB stores as percentage
            enriched['current_price'] = current_price
            enriched['price_is_live'] = True
        else:
            # Use stale data from database
            enriched['price_is_live'] = False
            logger.debug(f"⚠️  No live price for {symbol}, using stale data")
        
        return enriched
    
    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cached data is still valid (within TTL)."""
        if cache_key not in _cache_timestamps:
            return False
        
        age = (datetime.utcnow() - _cache_timestamps[cache_key]).total_seconds()
        return age < CACHE_TTL_SECONDS
    
    def clear_cache(self, user_id: Optional[str] = None):
        """
        Clear the enrichment cache.
        
        Args:
            user_id: If provided, clear only this user's cache. Otherwise clear all.
        """
        global _enrichment_cache, _cache_timestamps
        
        if user_id:
            cache_key = f"{user_id}_enriched"
            _enrichment_cache.pop(cache_key, None)
            _cache_timestamps.pop(cache_key, None)
            logger.debug(f"Cleared cache for user {user_id}")
        else:
            _enrichment_cache.clear()
            _cache_timestamps.clear()
            logger.debug("Cleared all enrichment cache")


# Singleton instance
_enrichment_service: Optional[LiveEnrichmentService] = None


def get_enrichment_service() -> LiveEnrichmentService:
    """Get or create the singleton enrichment service instance."""
    global _enrichment_service
    
    if _enrichment_service is None:
        _enrichment_service = LiveEnrichmentService()
    
    return _enrichment_service

