"""
Symbol Mapping Service

Production-grade service for mapping Plaid security identifiers to FMP-compatible symbols.
Critical for portfolio history reconstruction and cost optimization.

Handles multiple security types:
- Equities with ticker symbols (90% direct compatibility)
- Mutual funds with CUSIP identifiers 
- Bonds with complex names
- Options with derivative identifiers
- International securities with ISIN codes
"""

import asyncio
import logging
import json
import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class SecurityMappingResult:
    """Result of security mapping operation."""
    plaid_security_id: str
    fmp_symbol: Optional[str]
    mapping_method: str
    confidence: float
    error: Optional[str] = None

@dataclass
class MappingStats:
    """Statistics for batch mapping operations."""
    total_securities: int
    mapped_successfully: int
    direct_ticker_mappings: int
    cusip_mappings: int
    name_fuzzy_mappings: int
    manual_mappings: int
    failed_mappings: int
    api_calls_made: int
    processing_duration_seconds: float

class SymbolMappingService:
    """
    Production-grade symbol mapping service.
    
    Maps Plaid security identifiers to FMP-compatible ticker symbols
    using intelligent fallback strategies and permanent caching.
    """
    
    def __init__(self):
        """Initialize the symbol mapping service."""
        self.supabase = None  # Lazy loaded
        self.fmp_api_key = None  # Lazy loaded
        self.mapping_cache = {}  # In-memory cache for batch operations
        
        # Performance tracking
        self.api_calls_made = 0
        self.cache_hits = 0
        self.cache_misses = 0
    
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
    
    async def map_securities_for_user(self, plaid_securities: List[Dict[str, Any]]) -> MappingStats:
        """
        Map all securities for a user with comprehensive statistics.
        
        Args:
            plaid_securities: List of Plaid security objects from holdings/transactions
            
        Returns:
            MappingStats with complete operation metrics
        """
        start_time = datetime.now()
        
        # Extract unique securities (deduplication)
        unique_securities = self._deduplicate_securities(plaid_securities)
        logger.info(f"🔍 Processing {len(unique_securities)} unique securities")
        
        # Process mappings with controlled concurrency
        mapping_results = await self._process_security_batch(unique_securities)
        
        # Calculate statistics
        stats = self._calculate_mapping_stats(mapping_results, start_time)
        
        # Store successful mappings permanently
        await self._store_successful_mappings(mapping_results)
        
        # Queue failed mappings for manual review
        await self._queue_failed_mappings(mapping_results)
        
        logger.info(f"✅ Symbol mapping complete: {stats.mapped_successfully}/{stats.total_securities} successful")
        
        return stats
    
    async def _process_security_batch(self, securities: List[Dict[str, Any]]) -> List[SecurityMappingResult]:
        """
        Process a batch of securities with controlled concurrency.
        """
        semaphore = asyncio.Semaphore(10)  # Limit concurrent operations
        
        async def process_single_security(security):
            async with semaphore:
                return await self._map_single_security(security)
        
        tasks = [process_single_security(security) for security in securities]
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _map_single_security(self, plaid_security: Dict[str, Any]) -> SecurityMappingResult:
        """
        Map a single Plaid security to FMP symbol using fallback chain.
        
        Mapping strategies in priority order:
        1. Direct ticker symbol (90% success rate)
        2. CUSIP lookup (mutual funds, bonds)
        3. Name-based fuzzy matching
        4. Manual mapping queue
        """
        
        security_id = plaid_security['security_id']
        
        # Check permanent cache first
        cached_result = await self._get_cached_mapping(security_id)
        if cached_result:
            self.cache_hits += 1
            return SecurityMappingResult(
                plaid_security_id=security_id,
                fmp_symbol=cached_result['fmp_symbol'],
                mapping_method=cached_result['mapping_method'],
                confidence=cached_result['mapping_confidence']
            )
        
        self.cache_misses += 1
        
        # Try mapping strategies in order
        mapping_strategies = [
            ('ticker', self._direct_ticker_mapping),
            ('cusip', self._cusip_lookup_mapping),
            ('name_fuzzy', self._name_fuzzy_matching),
            ('manual', self._manual_mapping_fallback)
        ]
        
        for method_name, strategy in mapping_strategies:
            try:
                result = await strategy(plaid_security)
                if result:
                    fmp_symbol, confidence = result
                    return SecurityMappingResult(
                        plaid_security_id=security_id,
                        fmp_symbol=fmp_symbol,
                        mapping_method=method_name,
                        confidence=confidence
                    )
            except Exception as e:
                logger.warning(f"Mapping strategy {method_name} failed for {security_id}: {e}")
                continue
        
        # All strategies failed
        return SecurityMappingResult(
            plaid_security_id=security_id,
            fmp_symbol=None,
            mapping_method='failed',
            confidence=0.0,
            error=f"All mapping strategies failed for {plaid_security.get('name', 'unnamed')}"
        )
    
    async def _direct_ticker_mapping(self, security: Dict[str, Any]) -> Optional[Tuple[str, float]]:
        """
        Direct ticker symbol mapping (90% of securities).
        
        Returns:
            Tuple of (fmp_symbol, confidence) or None
        """
        ticker = security.get('ticker_symbol')
        if not ticker:
            return None
        
        # Clean and validate ticker
        clean_ticker = ticker.upper().strip()
        
        # Basic validation - should look like a stock ticker
        if not re.match(r'^[A-Z]{1,5}$', clean_ticker):
            # Handle extended tickers (like options)
            if not re.match(r'^[A-Z0-9]{1,20}$', clean_ticker):
                return None
        
        # Validate symbol exists in FMP (quick API check)
        if await self._validate_fmp_symbol_exists(clean_ticker):
            return (clean_ticker, 100.0)
        
        return None
    
    async def _cusip_lookup_mapping(self, security: Dict[str, Any]) -> Optional[Tuple[str, float]]:
        """
        CUSIP to symbol mapping for mutual funds and bonds.
        
        Many mutual funds don't have ticker symbols but have CUSIP identifiers.
        """
        cusip = security.get('cusip')
        if not cusip:
            return None
        
        # Try CUSIP lookup via OpenFIGI API or similar service
        try:
            symbol = await self._cusip_to_symbol_lookup(cusip)
            if symbol and await self._validate_fmp_symbol_exists(symbol):
                return (symbol, 95.0)
        except Exception as e:
            logger.debug(f"CUSIP lookup failed for {cusip}: {e}")
        
        return None
    
    async def _name_fuzzy_matching(self, security: Dict[str, Any]) -> Optional[Tuple[str, float]]:
        """
        Name-based fuzzy matching for complex securities.
        
        Uses FMP symbol search or builds similarity matching.
        """
        name = security.get('name', '').strip()
        if not name or len(name) < 3:
            return None
        
        try:
            # Use FMP symbol search API
            candidates = await self._search_fmp_symbols_by_name(name)
            
            if candidates:
                # Find best match using fuzzy string matching
                best_match = self._find_best_name_match(name, candidates)
                if best_match and best_match['confidence'] > 0.85:
                    return (best_match['symbol'], best_match['confidence'] * 100)
        
        except Exception as e:
            logger.debug(f"Name fuzzy matching failed for '{name}': {e}")
        
        return None
    
    async def _manual_mapping_fallback(self, security: Dict[str, Any]) -> Optional[Tuple[str, float]]:
        """
        Manual mapping fallback - queue for human review.
        """
        # This doesn't return a mapping, but queues the security for manual resolution
        await self._queue_for_manual_mapping(security)
        return None
    
    async def _validate_fmp_symbol_exists(self, symbol: str) -> bool:
        """
        Quick validation that a symbol exists in FMP API.
        
        Uses lightweight quote endpoint to verify symbol validity.
        """
        try:
            import aiohttp
            api_key = self._get_fmp_api_key()
            
            url = f"https://financialmodelingprep.com/api/v3/quote/{symbol}"
            params = {'apikey': api_key}
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=5) as response:
                    if response.status == 200:
                        data = await response.json()
                        # FMP returns [] for invalid symbols, [data] for valid symbols
                        is_valid = isinstance(data, list) and len(data) > 0
                        self.api_calls_made += 1
                        return is_valid
            
            return False
            
        except Exception as e:
            logger.debug(f"FMP symbol validation failed for {symbol}: {e}")
            return False
    
    async def _cusip_to_symbol_lookup(self, cusip: str) -> Optional[str]:
        """
        Convert CUSIP to ticker symbol using OpenFIGI or similar service.
        
        OpenFIGI is free and provides CUSIP → Symbol mapping.
        """
        try:
            import aiohttp
            
            # OpenFIGI API (free)
            url = "https://api.openfigi.com/v3/mapping"
            payload = [{
                "idType": "ID_CUSIP",
                "idValue": cusip,
                "exchCode": "US"  # Focus on US exchanges
            }]
            
            headers = {
                'Content-Type': 'application/json'
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=10) as response:
                    if response.status == 200:
                        results = await response.json()
                        if results and len(results) > 0 and 'data' in results[0]:
                            figi_data = results[0]['data']
                            if figi_data:
                                ticker = figi_data[0].get('ticker')
                                if ticker:
                                    self.api_calls_made += 1
                                    return ticker.upper()
            
            return None
            
        except Exception as e:
            logger.debug(f"CUSIP lookup failed for {cusip}: {e}")
            return None
    
    async def _search_fmp_symbols_by_name(self, security_name: str) -> List[Dict[str, Any]]:
        """
        Search FMP API for symbols matching a security name.
        """
        try:
            import aiohttp
            api_key = self._get_fmp_api_key()
            
            # Use FMP symbol search endpoint
            url = "https://financialmodelingprep.com/api/v3/search"
            params = {
                'query': security_name,
                'limit': 10,
                'apikey': api_key
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=10) as response:
                    if response.status == 200:
                        results = await response.json()
                        self.api_calls_made += 1
                        return results if isinstance(results, list) else []
            
            return []
            
        except Exception as e:
            logger.debug(f"FMP symbol search failed for '{security_name}': {e}")
            return []
    
    def _find_best_name_match(self, target_name: str, candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Find best fuzzy match between target name and candidate symbols.
        
        Uses string similarity algorithms to find the best match.
        """
        try:
            from difflib import SequenceMatcher
            
            best_match = None
            best_confidence = 0.0
            
            for candidate in candidates:
                candidate_name = candidate.get('name', '')
                candidate_symbol = candidate.get('symbol', '')
                
                # Calculate similarity score
                name_similarity = SequenceMatcher(None, target_name.lower(), candidate_name.lower()).ratio()
                
                # Boost confidence for exact symbol matches
                if target_name.upper() in candidate_symbol.upper():
                    name_similarity += 0.2
                
                if name_similarity > best_confidence:
                    best_confidence = name_similarity
                    best_match = {
                        'symbol': candidate_symbol,
                        'name': candidate_name,
                        'confidence': name_similarity
                    }
            
            return best_match if best_confidence > 0.7 else None
            
        except Exception as e:
            logger.debug(f"Fuzzy matching failed for '{target_name}': {e}")
            return None
    
    async def _get_cached_mapping(self, plaid_security_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached mapping from database.
        """
        try:
            supabase = self._get_supabase_client()
            
            result = supabase.table('global_security_symbol_mappings')\
                .select('fmp_symbol, mapping_method, mapping_confidence')\
                .eq('plaid_security_id', plaid_security_id)\
                .execute()
            
            if result.data and len(result.data) > 0:
                return result.data[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting cached mapping for {plaid_security_id}: {e}")
            return None
    
    async def _store_successful_mappings(self, mapping_results: List[SecurityMappingResult]):
        """
        Store successful mappings permanently in database.
        """
        successful_mappings = [r for r in mapping_results if r.fmp_symbol and not r.error]
        
        if not successful_mappings:
            return
        
        try:
            supabase = self._get_supabase_client()
            
            # Prepare batch insert data
            mappings_data = []
            for result in successful_mappings:
                mapping_data = {
                    'plaid_security_id': result.plaid_security_id,
                    'fmp_symbol': result.fmp_symbol,
                    'mapping_method': result.mapping_method,
                    'mapping_confidence': result.confidence,
                    'mapping_verified': result.confidence >= 95.0,
                    'created_by': 'symbol_mapping_service'
                }
                mappings_data.append(mapping_data)
            
            # Batch insert with conflict resolution
            supabase.table('global_security_symbol_mappings')\
                .upsert(mappings_data, on_conflict='plaid_security_id')\
                .execute()
            
            logger.info(f"💾 Stored {len(mappings_data)} symbol mappings permanently")
            
        except Exception as e:
            logger.error(f"Error storing symbol mappings: {e}")
    
    async def _queue_failed_mappings(self, mapping_results: List[SecurityMappingResult]):
        """
        Queue failed mappings for manual review and resolution.
        """
        failed_mappings = [r for r in mapping_results if not r.fmp_symbol or r.error]
        
        if not failed_mappings:
            return
        
        try:
            # Store in a queue table or send alerts for manual resolution
            # For now, log for manual review
            logger.warning(f"🚨 {len(failed_mappings)} securities require manual mapping:")
            for result in failed_mappings:
                logger.warning(f"  - {result.plaid_security_id}: {result.error}")
            
            # TODO: Implement manual mapping queue system
            # Could store in a separate table for admin review
            
        except Exception as e:
            logger.error(f"Error queuing failed mappings: {e}")
    
    def _deduplicate_securities(self, plaid_securities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove duplicate securities based on security_id.
        """
        seen_ids = set()
        unique_securities = []
        
        for security in plaid_securities:
            security_id = security.get('security_id')
            if security_id and security_id not in seen_ids:
                seen_ids.add(security_id)
                unique_securities.append(security)
        
        return unique_securities
    
    def _calculate_mapping_stats(self, mapping_results: List[SecurityMappingResult], 
                                start_time: datetime) -> MappingStats:
        """
        Calculate comprehensive statistics for mapping operation.
        """
        total = len(mapping_results)
        successful = len([r for r in mapping_results if r.fmp_symbol and not r.error])
        
        # Count by method
        direct_ticker = len([r for r in mapping_results if r.mapping_method == 'ticker'])
        cusip = len([r for r in mapping_results if r.mapping_method == 'cusip'])
        name_fuzzy = len([r for r in mapping_results if r.mapping_method == 'name_fuzzy'])
        manual = len([r for r in mapping_results if r.mapping_method == 'manual'])
        failed = total - successful
        
        duration = (datetime.now() - start_time).total_seconds()
        
        return MappingStats(
            total_securities=total,
            mapped_successfully=successful,
            direct_ticker_mappings=direct_ticker,
            cusip_mappings=cusip,
            name_fuzzy_mappings=name_fuzzy,
            manual_mappings=manual,
            failed_mappings=failed,
            api_calls_made=self.api_calls_made,
            processing_duration_seconds=duration
        )
    
    async def _queue_for_manual_mapping(self, security: Dict[str, Any]):
        """
        Queue security for manual mapping resolution.
        """
        # TODO: Implement manual mapping queue
        # For now, just log for visibility
        logger.info(f"📝 Queued for manual mapping: {security.get('name', 'unnamed')} ({security.get('security_id', 'no_id')})")

# Global service instance
symbol_mapping_service = SymbolMappingService()

def get_symbol_mapping_service() -> SymbolMappingService:
    """Get the global symbol mapping service instance."""
    return symbol_mapping_service
