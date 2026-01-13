"""
Market routes for stock search and asset discovery.

This module provides efficient server-side stock search with pagination
to avoid loading all 12K+ assets to the frontend.
"""

import os
import json
import logging
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Asset cache configuration
ASSET_CACHE_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'tradable_assets.json')

# Thread pool for blocking I/O operations
_executor = ThreadPoolExecutor(max_workers=2)

router = APIRouter(prefix="/api/market", tags=["market"])


class SearchResult(BaseModel):
    """A single stock search result."""
    symbol: str
    name: str
    score: int = Field(description="Relevance score for ranking")


class StockSearchResponse(BaseModel):
    """Response from stock search endpoint."""
    success: bool
    results: List[SearchResult]
    total_matches: int
    query: str


# In-memory cache for assets to avoid blocking I/O on every request
class AssetCache:
    """
    Thread-safe in-memory cache for tradable assets.
    
    Loads assets once from disk and caches them in memory.
    Provides async-safe access without blocking the event loop.
    """
    _instance: Optional['AssetCache'] = None
    _lock = asyncio.Lock()
    
    def __init__(self):
        self._assets: List[dict] = []
        self._loaded = False
        self._asset_lookup: dict = {}
    
    @classmethod
    def get_instance(cls) -> 'AssetCache':
        """Get or create singleton instance."""
        if cls._instance is None:
            cls._instance = AssetCache()
        return cls._instance
    
    def _load_from_disk_sync(self) -> List[dict]:
        """Synchronous file read - to be run in executor."""
        if not os.path.exists(ASSET_CACHE_FILE):
            logger.warning(f"Asset cache file not found: {ASSET_CACHE_FILE}")
            return []
        
        try:
            with open(ASSET_CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading asset cache: {e}")
            return []
    
    async def get_assets(self) -> List[dict]:
        """
        Get cached assets, loading from disk if needed.
        
        Uses asyncio lock to prevent multiple concurrent loads.
        Runs disk I/O in thread pool to avoid blocking event loop.
        """
        if self._loaded:
            return self._assets
        
        async with self._lock:
            # Double-check after acquiring lock
            if self._loaded:
                return self._assets
            
            # Run blocking I/O in thread pool
            loop = asyncio.get_event_loop()
            self._assets = await loop.run_in_executor(
                _executor, 
                self._load_from_disk_sync
            )
            self._asset_lookup = {a['symbol']: a for a in self._assets}
            self._loaded = True
            logger.info(f"Loaded {len(self._assets)} assets into memory cache")
            return self._assets
    
    async def get_asset_lookup(self) -> dict:
        """Get symbol -> asset lookup dictionary."""
        await self.get_assets()  # Ensure loaded
        return self._asset_lookup
    
    def reload(self) -> None:
        """Force reload on next access."""
        self._loaded = False
        self._assets = []
        self._asset_lookup = {}


# Module-level cache instance
_asset_cache = AssetCache.get_instance()


async def _get_cached_assets() -> List[dict]:
    """Get assets from in-memory cache (async-safe)."""
    return await _asset_cache.get_assets()


async def _get_asset_lookup() -> dict:
    """Get asset lookup dictionary from cache (async-safe)."""
    return await _asset_cache.get_asset_lookup()


def _score_asset(asset: dict, search_term: str, normalized_search: str, search_words: List[str]) -> int:
    """
    Score an asset based on match quality.
    Higher scores = better matches.
    
    Scoring Strategy (production-grade):
    - Exact symbol match: 1000 points
    - Symbol starts with term: 900 points (minus length penalty)
    - Symbol contains term: 700 points
    - Name starts with term: 600 points
    - All search words found at word boundaries: 500 points
    - Name contains term at word boundary: 400 points
    - Name contains normalized term: 150 points
    - Name contains term anywhere: 100 points
    
    IMPORTANT: Symbol matches should always rank higher than name-only matches
    to ensure "AAPL" search returns Apple Inc first, not ETFs with AAPL in name.
    """
    # Early return for empty search
    if not search_term:
        return 0
    
    symbol_lower = asset['symbol'].lower()
    name_lower = asset['name'].lower()
    # Normalize name by removing hyphens and spaces for fuzzy matching
    name_normalized = re.sub(r'[-\s]+', '', name_lower)
    
    # Priority 1: Exact symbol match (highest priority)
    if symbol_lower == search_term or symbol_lower == normalized_search:
        return 1000
    
    # Priority 2: Symbol starts with search term (e.g., "AA" matches "AAPL")
    if symbol_lower.startswith(search_term) or symbol_lower.startswith(normalized_search):
        # Shorter symbols get higher scores (more relevant)
        return 900 - (len(symbol_lower) - len(search_term)) * 5
    
    # Priority 3: Symbol contains search term (e.g., search "PL" matches "AAPL")
    # This catches cases where user types full ticker but we want exact first
    if search_term in symbol_lower or normalized_search in symbol_lower:
        return 700
    
    # Priority 4: Name starts with search term (exact or normalized)
    if name_lower.startswith(search_term) or name_normalized.startswith(normalized_search):
        return 600
    
    # Priority 5: All search words found at word boundaries in name
    if len(search_words) > 1:
        all_words_match = True
        for word in search_words:
            escaped_word = re.escape(word)
            if not re.search(rf'\b{escaped_word}', name_lower, re.IGNORECASE):
                all_words_match = False
                break
        if all_words_match:
            return 500
    
    # Priority 6: Name contains search term at word boundary (e.g., "Coca" in "Coca-Cola")
    if search_words:
        first_word_escaped = re.escape(search_words[0])
        if re.search(rf'\b{first_word_escaped}', name_lower, re.IGNORECASE):
            return 400
    
    # Priority 7: Name contains search term (normalized match)
    if normalized_search in name_normalized:
        return 150
    
    # Priority 8: Name contains search term anywhere
    if search_term in name_lower:
        return 100
    
    # No match
    return 0


@router.get("/search", response_model=StockSearchResponse)
async def search_stocks(
    q: str = Query(..., min_length=1, max_length=50, description="Search query for symbol or company name"),
    limit: int = Query(default=30, ge=1, le=100, description="Maximum results to return")
):
    """
    Search for stocks by symbol or company name.
    
    This endpoint performs server-side search with intelligent ranking:
    - Exact symbol matches ranked highest
    - Symbol prefix matches ranked second
    - Company name matches ranked by relevance
    
    Example queries:
    - "AAPL" - exact symbol match
    - "apple" - company name search
    - "coca cola" - multi-word search
    """
    try:
        # Use async cache to avoid blocking event loop
        assets = await _get_cached_assets()
        
        if not assets:
            return JSONResponse({
                "success": True,
                "results": [],
                "total_matches": 0,
                "query": q
            })
        
        # Prepare search terms
        search_term = q.lower().strip()
        # Normalize search: remove spaces for fuzzy matching (e.g., "coca cola" -> "cocacola")
        normalized_search = re.sub(r'\s+', '', search_term)
        search_words = [w for w in search_term.split() if len(w) > 0]
        
        # Score all matching assets
        scored_results = []
        for asset in assets:
            score = _score_asset(asset, search_term, normalized_search, search_words)
            if score > 0:
                scored_results.append({
                    "symbol": asset['symbol'],
                    "name": asset['name'],
                    "score": score
                })
        
        # Sort by score descending, then by symbol length ascending (shorter = more relevant)
        scored_results.sort(key=lambda x: (-x['score'], len(x['symbol'])))
        
        # Return limited results
        limited_results = scored_results[:limit]
        
        return JSONResponse({
            "success": True,
            "results": limited_results,
            "total_matches": len(scored_results),
            "query": q
        })
        
    except Exception as e:
        logger.error(f"Error in stock search: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to search stocks")


@router.get("/popular")
async def get_popular_stocks(
    limit: int = Query(default=50, ge=1, le=100, description="Number of popular stocks to return")
):
    """
    Get a list of popular/common stocks for initial display.
    
    Returns a curated list of well-known stocks that can be shown
    before the user starts typing. This is much more efficient than
    loading all 12K+ assets.
    """
    # Curated list of popular stocks - covers most common search needs
    popular_symbols = [
        "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA",
        "BRK.B", "UNH", "JNJ", "V", "XOM", "JPM", "WMT", "MA", "PG",
        "HD", "CVX", "MRK", "ABBV", "LLY", "PFE", "KO", "PEP", "COST",
        "AVGO", "TMO", "CSCO", "ABT", "MCD", "ACN", "DHR", "CRM", "NKE",
        "NFLX", "DIS", "AMD", "INTC", "ADBE", "TXN", "QCOM", "PYPL",
        "ORCL", "IBM", "GS", "MS", "BA", "CAT", "GE"
    ]
    
    try:
        # Use async cache with pre-built lookup for O(1) access
        asset_lookup = await _get_asset_lookup()
        
        if not asset_lookup:
            return JSONResponse({
                "success": True,
                "assets": [],
                "count": 0
            })
        
        # Get popular stocks that exist in our asset list
        popular_assets = []
        for symbol in popular_symbols[:limit]:
            if symbol in asset_lookup:
                popular_assets.append(asset_lookup[symbol])
        
        return JSONResponse({
            "success": True,
            "assets": popular_assets,
            "count": len(popular_assets)
        })
        
    except Exception as e:
        logger.error(f"Error getting popular stocks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get popular stocks")
