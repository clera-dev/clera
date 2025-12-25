"""
Sector Allocation Service

Production-grade service for calculating sector allocation from portfolio holdings.
Follows SOLID principles with clear separation from API layer.

Integrates with existing sector_data_collector.py infrastructure and supports
both Plaid aggregated securities and Alpaca brokerage securities.
"""

import logging
import json
from typing import Dict, Any, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class SectorAllocationService:
    """
    Service for calculating sector allocation across different data sources.
    
    Supports:
    - Plaid aggregated holdings with rich sector metadata
    - Alpaca brokerage holdings with FMP sector data
    - Intelligent fallbacks for unknown securities
    """
    
    def __init__(self):
        """Initialize the sector allocation service."""
        self.supabase = None  # Lazy loaded to avoid circular imports
        self.redis_client = None  # Lazy loaded
    
    def _get_supabase_client(self):
        """Lazy load Supabase client to avoid circular imports."""
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    def _get_redis_client(self):
        """Lazy load Redis client following existing pattern from sector_data_collector.py."""
        if self.redis_client is None:
            import redis
            import os
            
            # Follow the same production detection pattern as sector_data_collector.py
            _IS_PRODUCTION = os.getenv("COPILOT_ENVIRONMENT_NAME", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production"
            if _IS_PRODUCTION:
                redis_host = os.getenv("REDIS_HOST")
                if not redis_host:
                    raise RuntimeError("REDIS_HOST environment variable must be set in production!")
            else:
                redis_host = os.getenv("REDIS_HOST", "127.0.0.1")
            
            redis_port = int(os.getenv("REDIS_PORT", "6379"))
            redis_db = int(os.getenv("REDIS_DB", "0"))
            
            self.redis_client = redis.Redis(
                host=redis_host, 
                port=redis_port, 
                db=redis_db, 
                decode_responses=True
            )
        return self.redis_client
    
    async def get_plaid_sector_allocation(self, user_id: str, filter_account: str = None) -> Dict[str, Any]:
        """
        Get sector allocation for aggregation mode - EQUITY STOCKS ONLY.
        
        Strategy:
        - Include ONLY equity stocks and ETFs (exclude bonds, options, crypto, mutual funds)
        - Use FMP API to get sector data (same as Alpaca mode)
        - This gives clean sector breakdown focused on long equity positions
        - Supports account-level filtering for X-Ray Vision
        - OPTIMIZATION: Implements 30-second response cache for performance
        
        Args:
            user_id: User ID to get aggregated holdings for
            filter_account: Optional account ID to filter to specific account
            
        Returns:
            Sector allocation response dictionary
        """
        # OPTIMIZATION: Check response cache first (30-second TTL)
        cache_key = f"sector_allocation:plaid:{user_id}:{filter_account or 'total'}"
        cached_response = self._get_cached_response(cache_key)
        if cached_response:
            logger.debug(f"✅ [Cache Hit] Returning cached sector allocation for user {user_id}")
            return cached_response
        
        try:
            # CRITICAL: Use AccountFilteringService for account-specific filtering
            from utils.portfolio.account_filtering_service import get_account_filtering_service
            filter_service = get_account_filtering_service()
            
            # Get filtered holdings (will return all holdings if filter_account is None)
            all_holdings = await filter_service.filter_holdings_by_account(user_id, filter_account)
            
            # CRITICAL: Enrich with live prices for accurate sector allocation
            from utils.portfolio.live_enrichment_service import get_enrichment_service
            enrichment_service = get_enrichment_service()
            enriched_holdings = enrichment_service.enrich_holdings(all_holdings, user_id)
            
            # Use comprehensive crypto detection from asset_classification module
            from utils.asset_classification import classify_asset, AssetClassification
            
            def is_crypto_holding(h):
                """Check if a holding is a cryptocurrency using comprehensive detection."""
                security_type = h.get('security_type', '')
                # Direct security_type check
                if security_type in ['crypto', 'cryptocurrency']:
                    return True
                # Symbol-based classification for comprehensive detection (BTC, ETH, ADA, etc.)
                symbol = h.get('symbol', '').upper()
                name = h.get('security_name', '')
                classification = classify_asset(symbol, name, None)
                return classification == AssetClassification.CRYPTO
            
            # CRITICAL FIX: Filter out crypto holdings BEFORE sector allocation
            # Crypto assets don't have traditional sectors and should not be processed
            crypto_holdings = [h for h in enriched_holdings if is_crypto_holding(h)]
            non_crypto_holdings = [h for h in enriched_holdings if not is_crypto_holding(h)]
            
            # Filter to ONLY equity stocks and ETFs for sector allocation (excluding crypto)
            # Note: SnapTrade 'et' code is normalized to 'etf' in snaptrade_provider.py
            equity_holdings = [
                h for h in non_crypto_holdings 
                if h.get('security_type') in ['equity', 'etf']
            ]
            
            # Log for debugging
            logger.info(f"Sector allocation breakdown: {len(enriched_holdings)} total, {len(crypto_holdings)} crypto, {len(equity_holdings)} equity for filter: {filter_account}")
            
            # Check if portfolio is crypto-only or crypto-dominant
            if not equity_holdings and crypto_holdings:
                # Portfolio is entirely crypto - return "N/A" sector allocation
                crypto_total_value = sum(float(h.get('total_market_value', 0)) for h in crypto_holdings)
                logger.info(f"✅ Portfolio is 100% crypto for user {user_id}, filter: {filter_account}. Total crypto: ${crypto_total_value:.2f}")
                return {
                    'sectors': [{
                        'sector': 'N/A (Cryptocurrency)',
                        'value': round(crypto_total_value, 2),
                        'percentage': 100.0
                    }],
                    'total_portfolio_value': round(crypto_total_value, 2),
                    'last_data_update_timestamp': datetime.now(timezone.utc).isoformat(),
                    'data_source': 'crypto_only',
                    'note': 'Cryptocurrencies do not have traditional sector classifications'
                }
            
            if not equity_holdings and not crypto_holdings:
                # No equity and no crypto - might be cash only
                logger.warning(f"No equity or crypto holdings found for user {user_id}, filter: {filter_account}")
                return self._empty_sector_allocation_response()
            
            if not equity_holdings:
                # Has crypto but no equity - should have been caught above, but just in case
                logger.warning(f"No equity holdings found for user {user_id}, filter: {filter_account}")
                return self._empty_sector_allocation_response()
            
            # Build sector allocation using FMP data (same as Alpaca/brokerage mode)
            sector_values = {}
            total_portfolio_value = 0
            redis_client = self._get_redis_client()
            
            # Use same Redis key format as sector_data_collector.py
            for holding in equity_holdings:
                symbol = holding['symbol']
                market_value = holding['total_market_value']
                security_type = holding['security_type']
                total_portfolio_value += market_value
                
                # Look up FMP sector data in Redis (same key format as sector_data_collector.py)
                fmp_sector_key = f"sector:{symbol}"
                sector_data_json = redis_client.get(fmp_sector_key)
                
                if sector_data_json:
                    try:
                        sector_data = json.loads(sector_data_json)
                        sector = sector_data.get('sector', 'Unknown')
                        
                        if sector and sector != 'Unknown':
                            sector_values[sector] = sector_values.get(sector, 0) + market_value
                            logger.debug(f"✅ {symbol} ({security_type}): {sector} (${market_value:.2f})")
                        else:
                            sector_values['Unknown'] = sector_values.get('Unknown', 0) + market_value
                            logger.debug(f"❓ {symbol} ({security_type}): Unknown sector (${market_value:.2f})")
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse FMP sector data for {symbol}")
                        sector_values['Unknown'] = sector_values.get('Unknown', 0) + market_value
                else:
                    # No FMP data in cache - try to fetch it
                    sector = await self._fetch_fmp_sector(symbol)
                    if sector and sector != 'Unknown':
                        sector_values[sector] = sector_values.get(sector, 0) + market_value
                        logger.debug(f"🔍 {symbol} ({security_type}): Fetched {sector} (${market_value:.2f})")
                    else:
                        # If FMP fails and it's an ETF, classify it intelligently
                        if security_type == 'etf':
                            etf_sector = self._classify_etf_by_name(symbol, holding.get('security_name', ''))
                            sector_values[etf_sector] = sector_values.get(etf_sector, 0) + market_value
                            logger.debug(f"📊 {symbol} (ETF): Classified as {etf_sector} (${market_value:.2f})")
                        else:
                            sector_values['Unknown'] = sector_values.get('Unknown', 0) + market_value
                            logger.debug(f"⚠️ {symbol} ({security_type}): No FMP data available (${market_value:.2f})")
            
            # Build sector allocation response (same format as existing infrastructure)
            sector_allocation_response = []
            if total_portfolio_value > 0:
                for sector, value in sector_values.items():
                    percentage = (value / total_portfolio_value) * 100
                    sector_allocation_response.append({
                        'sector': sector,
                        'value': round(value, 2),
                        'percentage': round(percentage, 2)
                    })
            
            # Sort by value (descending) - consistent with sector_data_collector.py approach
            sector_allocation_response.sort(key=lambda x: x['value'], reverse=True)
            
            filter_msg = f", filter: {filter_account}" if filter_account else ""
            logger.info(f"Plaid sector allocation calculated for user {user_id}{filter_msg}: {len(sector_allocation_response)} sectors, total: ${total_portfolio_value}")
            
            response = {
                'sectors': sector_allocation_response,
                'total_portfolio_value': round(total_portfolio_value, 2),
                'last_data_update_timestamp': datetime.now(timezone.utc).isoformat(),
                'data_source': 'plaid_aggregated'
            }
            
            # OPTIMIZATION: Cache the response for 30 seconds
            self._cache_response(cache_key, response, ttl_seconds=30)
            logger.debug(f"💾 [Cache Set] Cached sector allocation for user {user_id}")
            
            return response
            
        except Exception as e:
            logger.error(f"Error calculating Plaid sector allocation for user {user_id}: {e}")
            return self._empty_sector_allocation_response(error=str(e))
    
    async def _fetch_fmp_sector(self, symbol: str) -> str:
        """
        Fetch sector data from FMP API and cache it in Redis.
        
        Uses same approach as sector_data_collector.py for consistency.
        
        Args:
            symbol: Stock ticker symbol
            
        Returns:
            Sector name or 'Unknown'
        """
        try:
            import httpx
            import os
            
            fmp_api_key = os.getenv('FINANCIAL_MODELING_PREP_API_KEY')
            if not fmp_api_key:
                logger.warning("FMP API key not configured")
                return 'Unknown'
            
            # Fetch company profile from FMP
            url = f'https://financialmodelingprep.com/api/v3/profile/{symbol}'
            params = {'apikey': fmp_api_key}
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    if data and len(data) > 0:
                        sector = data[0].get('sector', 'Unknown')
                        industry = data[0].get('industry', '')
                        
                        # Cache in Redis (same format as sector_data_collector.py)
                        redis_client = self._get_redis_client()
                        sector_data = {
                            'symbol': symbol,
                            'sector': sector,
                            'industry': industry,
                            'last_updated': datetime.now(timezone.utc).isoformat()
                        }
                        redis_client.setex(
                            f"sector:{symbol}",
                            86400,  # 24 hour TTL
                            json.dumps(sector_data)
                        )
                        
                        logger.info(f"📥 Fetched and cached FMP sector for {symbol}: {sector}")
                        return sector
                    else:
                        logger.warning(f"FMP returned empty data for {symbol}")
                        return 'Unknown'
                else:
                    logger.warning(f"FMP API error for {symbol}: {response.status_code}")
                    return 'Unknown'
                    
        except Exception as e:
            logger.error(f"Error fetching FMP sector for {symbol}: {e}")
            return 'Unknown'
    
    def _consolidate_plaid_sector(self, plaid_sector: str, metadata: Dict[str, Any]) -> str:
        """
        Consolidate Plaid sector names to match existing standardized categories.
        
        This prevents sector fragmentation and ensures consistency with Alpaca/FMP sectors.
        
        Args:
            plaid_sector: Original sector from Plaid API
            metadata: Full security metadata for context
            
        Returns:
            Standardized sector name matching existing categories
        """
        if not plaid_sector or plaid_sector == 'Unknown':
            # Fallback to security type classification
            security_type = metadata.get('type', 'equity')
            return self._classify_security_by_type(security_type)
        
        # Plaid → Standard sector mapping for consistency
        sector_mapping = {
            # Technology consolidation
            'Technology Services': 'Technology',
            'Technology': 'Technology',
            
            # Healthcare consolidation  
            'Health Technology': 'Healthcare',
            'Healthcare': 'Healthcare',
            'Health Care': 'Healthcare',
            
            # Financial consolidation
            'Financial Services': 'Financial Services',
            'Financials': 'Financial Services',
            'Banks': 'Financial Services',
            
            # Government/Fixed Income consolidation
            'Government': 'Fixed Income',
            'Fixed Income': 'Fixed Income',
            
            # International consolidation
            'International': 'International',
            
            # Communication consolidation
            'Communication Services': 'Communication Services',
            'Communications': 'Communication Services',
            
            # Industrial consolidation
            'Industrials': 'Industrials',
            'Industrial': 'Industrials',
            
            # Consumer consolidation
            'Consumer Discretionary': 'Consumer Discretionary',
            'Consumer Staples': 'Consumer Staples',
            
            # Materials consolidation
            'Basic Materials': 'Basic Materials',
            'Materials': 'Basic Materials',
            
            # Energy consolidation
            'Energy': 'Energy',
            
            # Utilities consolidation
            'Utilities': 'Utilities',
            
            # Real Estate consolidation
            'Real Estate': 'Real Estate',
            'REITs': 'Real Estate'
        }
        
        # Check direct mapping first
        if plaid_sector in sector_mapping:
            return sector_mapping[plaid_sector]
        
        # Handle special Plaid cases
        if plaid_sector == 'Miscellaneous':
            # For miscellaneous, use security type context
            security_type = metadata.get('type', 'equity')
            security_name = metadata.get('name', '').lower()
            
            if security_type == 'etf':
                if 'international' in security_name or 'emerging' in security_name:
                    return 'International'
                else:
                    return 'Broad ETFs'  # Diversified ETFs
            elif security_type == 'mutual_fund':
                if 'international' in security_name or 'global' in security_name:
                    return 'International'
                elif 'bond' in security_name or 'income' in security_name:
                    return 'Fixed Income'
                else:
                    return 'Broad ETFs'  # Diversified mutual funds
            else:
                return 'Unknown'
        
        # Default: return as-is (may create new category)
        logger.warning(f"Unmapped Plaid sector: {plaid_sector}")
        return plaid_sector
    
    def _classify_etf_by_name(self, symbol: str, name: str) -> str:
        """
        Intelligently classify ETFs that don't have FMP data based on name/symbol.
        
        Args:
            symbol: ETF symbol
            name: ETF full name
            
        Returns:
            Best-guess sector classification
        """
        name_lower = name.lower()
        symbol_lower = symbol.lower()
        
        # Broad market / index ETFs
        if any(keyword in name_lower for keyword in ['s&p', 'index', 'total market', 'portfolio', 'aggregate', 'blend', 'core']):
            return 'Broad Market ETFs'
        
        # International ETFs
        if any(keyword in name_lower for keyword in ['international', 'global', 'emerging', 'world', 'foreign', 'ex-us']):
            return 'International'
        
        # Sector-specific keywords
        if any(keyword in name_lower for keyword in ['tech', 'technology', 'innovation', 'software']):
            return 'Technology'
        if any(keyword in name_lower for keyword in ['health', 'biotech', 'pharma', 'medical']):
            return 'Healthcare'
        if any(keyword in name_lower for keyword in ['financ', 'bank', 'insurance']):
            return 'Financial Services'
        if any(keyword in name_lower for keyword in ['energy', 'oil', 'gas']):
            return 'Energy'
        if any(keyword in name_lower for keyword in ['real estate', 'reit']):
            return 'Real Estate'
        if any(keyword in name_lower for keyword in ['consumer', 'retail']):
            return 'Consumer Discretionary'
        if any(keyword in name_lower for keyword in ['utilities', 'utility']):
            return 'Utilities'
        if any(keyword in name_lower for keyword in ['industrial', 'transport', 'aerospace']):
            return 'Industrials'
        if any(keyword in name_lower for keyword in ['materials', 'mining', 'metals']):
            return 'Basic Materials'
        
        # Default for unidentified ETFs
        return 'Broad Market ETFs'
    
    def _classify_security_by_type(self, security_type: str) -> str:
        """
        Classify security by type when no Plaid metadata is available.
        
        Args:
            security_type: Plaid security type
            
        Returns:
            Sector classification string
        """
        # Following similar logic as sector_data_collector.py for ETF categorization
        type_to_sector_mapping = {
            'bond': 'Fixed Income',  # Treasury bills/bonds → Fixed Income
            'crypto': 'Technology',  # Crypto classified as tech
            'mutual_fund': 'Unknown',  # Requires individual analysis
            'etf': 'Broad ETFs',  # Generic ETF classification
            'equity': 'Unknown'  # Requires individual analysis
        }
        
        return type_to_sector_mapping.get(security_type, 'Unknown')
    
    def _get_cached_response(self, cache_key: str) -> Dict[str, Any] | None:
        """
        Get cached response from Redis if available and not expired.
        
        Args:
            cache_key: Redis cache key
            
        Returns:
            Cached response dict or None if not found/expired
        """
        try:
            redis_client = self._get_redis_client()
            cached_json = redis_client.get(cache_key)
            
            if cached_json:
                return json.loads(cached_json)
            return None
        except Exception as e:
            logger.warning(f"Error reading from cache: {e}")
            return None
    
    def _cache_response(self, cache_key: str, response: Dict[str, Any], ttl_seconds: int = 30) -> None:
        """
        Cache response in Redis with expiration.
        
        Args:
            cache_key: Redis cache key
            response: Response dictionary to cache
            ttl_seconds: Time-to-live in seconds (default: 30)
        """
        try:
            redis_client = self._get_redis_client()
            response_json = json.dumps(response)
            redis_client.setex(cache_key, ttl_seconds, response_json)
        except Exception as e:
            logger.warning(f"Error writing to cache: {e}")
    
    def _empty_sector_allocation_response(self, error: str = None) -> Dict[str, Any]:
        """
        Return empty sector allocation response.
        
        Maintains consistent response format with existing API structure.
        """
        response = {
            'sectors': [],
            'total_portfolio_value': 0,
            'last_data_update_timestamp': datetime.now(timezone.utc).isoformat()
        }
        if error:
            response['error'] = error
        return response

# Global service instance following dependency injection pattern
sector_allocation_service = SectorAllocationService()

def get_sector_allocation_service() -> SectorAllocationService:
    """
    Get the global sector allocation service instance.
    
    Returns:
        SectorAllocationService instance
    """
    return sector_allocation_service
