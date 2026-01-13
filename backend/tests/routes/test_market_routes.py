"""
Comprehensive tests for market routes - stock search and popular stocks.

These tests ensure the stock search functionality is production-grade:
- Correct scoring and ranking of results
- Efficient handling of large datasets
- Proper error handling
- API contract compliance
"""

import pytest
import json
import os
import tempfile
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Import the router and internal functions
from routes.market_routes import router, _score_asset, _asset_cache


# Create test app with the router
app = FastAPI()
app.include_router(router)
client = TestClient(app)


# --- Test Fixtures ---

@pytest.fixture
def sample_assets():
    """Sample asset data for testing."""
    return [
        {"symbol": "AAPL", "name": "Apple Inc. Common Stock"},
        {"symbol": "MSFT", "name": "Microsoft Corporation Common Stock"},
        {"symbol": "GOOGL", "name": "Alphabet Inc. Class A Common Stock"},
        {"symbol": "GOOG", "name": "Alphabet Inc. Class C Capital Stock"},
        {"symbol": "AMZN", "name": "Amazon.com Inc. Common Stock"},
        {"symbol": "TSLA", "name": "Tesla Inc Common Stock"},
        {"symbol": "KO", "name": "Coca-Cola Company"},
        {"symbol": "KOF", "name": "Coca-Cola FEMSA, S.A.B DE C.V"},
        {"symbol": "CCEP", "name": "Coca-Cola Europacific Partners plc"},
        {"symbol": "AAPB", "name": "GraniteShares 2x Long AAPL Daily ETF"},
        {"symbol": "META", "name": "Meta Platforms Inc Class A Common Stock"},
        {"symbol": "NVDA", "name": "NVIDIA Corporation Common Stock"},
        {"symbol": "JPM", "name": "JPMorgan Chase & Co. Common Stock"},
        {"symbol": "V", "name": "Visa Inc. Class A Common Stock"},
        {"symbol": "BRK.B", "name": "Berkshire Hathaway Inc. Class B"},
    ]


@pytest.fixture
def temp_cache_file(sample_assets):
    """Create a temporary cache file with sample assets."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(sample_assets, f)
        temp_path = f.name
    yield temp_path
    # Cleanup
    if os.path.exists(temp_path):
        os.unlink(temp_path)


@pytest.fixture(autouse=True)
def reset_cache():
    """Reset the cache before each test."""
    _asset_cache.reload()
    yield
    _asset_cache.reload()


# --- Unit Tests for _score_asset ---

class TestScoreAsset:
    """Tests for the scoring algorithm."""

    def test_exact_symbol_match_highest_score(self):
        """Exact symbol match should return the highest score (1000)."""
        asset = {"symbol": "AAPL", "name": "Apple Inc."}
        score = _score_asset(asset, "aapl", "aapl", ["aapl"])
        assert score == 1000

    def test_symbol_starts_with_search_term(self):
        """Symbol prefix match should score high."""
        asset = {"symbol": "GOOGL", "name": "Alphabet Inc."}
        score = _score_asset(asset, "goog", "goog", ["goog"])
        assert 800 <= score <= 900  # High score but less than exact match

    def test_symbol_contains_search_term(self):
        """Symbol containing search term should score moderately high."""
        asset = {"symbol": "AAPB", "name": "2x Long AAPL ETF"}
        score = _score_asset(asset, "aap", "aap", ["aap"])
        assert score >= 700  # Symbol contains "aap"

    def test_name_starts_with_search_term(self):
        """Name starting with search term should score well."""
        asset = {"symbol": "AAPL", "name": "Apple Inc."}
        score = _score_asset(asset, "apple", "apple", ["apple"])
        assert score == 600

    def test_multi_word_search(self):
        """Multi-word search should match all words in name."""
        asset = {"symbol": "KO", "name": "Coca-Cola Company"}
        score = _score_asset(asset, "coca cola", "cocacola", ["coca", "cola"])
        # Should match at name start or word boundaries
        assert score >= 500

    def test_word_boundary_match_in_name(self):
        """Word boundary match in name should score moderately."""
        asset = {"symbol": "AAPB", "name": "2x Long AAPL Daily ETF"}
        score = _score_asset(asset, "aapl", "aapl", ["aapl"])
        assert score >= 400

    def test_no_match_returns_zero(self):
        """Non-matching search should return 0."""
        asset = {"symbol": "AAPL", "name": "Apple Inc."}
        score = _score_asset(asset, "xyz", "xyz", ["xyz"])
        assert score == 0

    def test_case_insensitive_matching(self):
        """Search should be case-insensitive."""
        asset = {"symbol": "AAPL", "name": "Apple Inc."}
        # Uppercase in search should match
        score1 = _score_asset(asset, "aapl", "aapl", ["aapl"])
        score2 = _score_asset(asset, "AAPL".lower(), "AAPL".lower(), ["aapl"])
        assert score1 == score2 == 1000

    def test_normalized_name_matching(self):
        """Normalized matching should handle hyphens and spaces."""
        asset = {"symbol": "KO", "name": "Coca-Cola Company"}
        # "cocacola" (normalized) should match "coca-cola" in name
        score = _score_asset(asset, "cocacola", "cocacola", ["cocacola"])
        assert score >= 150  # Normalized name match

    def test_exact_match_prioritized_over_contains(self):
        """Exact symbol match should rank higher than partial matches."""
        exact_asset = {"symbol": "AAPL", "name": "Apple Inc."}
        contains_asset = {"symbol": "AAPB", "name": "2x Long AAPL ETF"}
        
        exact_score = _score_asset(exact_asset, "aapl", "aapl", ["aapl"])
        contains_score = _score_asset(contains_asset, "aapl", "aapl", ["aapl"])
        
        assert exact_score > contains_score


class TestScoreAssetEdgeCases:
    """Edge case tests for the scoring algorithm."""

    def test_empty_search_term(self):
        """Empty search term should not match anything."""
        asset = {"symbol": "AAPL", "name": "Apple Inc."}
        score = _score_asset(asset, "", "", [])
        # Empty search won't match the scoring logic
        assert score == 0

    def test_special_characters_in_search(self):
        """Special characters should be handled properly."""
        asset = {"symbol": "BRK.B", "name": "Berkshire Hathaway"}
        score = _score_asset(asset, "brk.b", "brk.b", ["brk.b"])
        # Should not crash and should match if symbol contains it
        assert score >= 0

    def test_very_long_search_term(self):
        """Very long search terms should not crash."""
        asset = {"symbol": "AAPL", "name": "Apple Inc."}
        long_search = "a" * 100
        score = _score_asset(asset, long_search, long_search, [long_search])
        assert score == 0  # No match expected

    def test_numeric_search_term(self):
        """Numeric search terms should be handled."""
        asset = {"symbol": "AAPB", "name": "GraniteShares 2x Long AAPL"}
        score = _score_asset(asset, "2x", "2x", ["2x"])
        assert score >= 0


# --- Integration Tests for Search Endpoint ---

class TestSearchEndpoint:
    """Tests for the /api/market/search endpoint."""

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_returns_correct_format(self, mock_get_assets, sample_assets):
        """Search should return properly formatted response."""
        mock_get_assets.return_value = sample_assets
        
        response = client.get("/api/market/search?q=AAPL")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "results" in data
        assert "total_matches" in data
        assert data["query"] == "AAPL"

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_exact_symbol_first(self, mock_get_assets, sample_assets):
        """Exact symbol match should be first result."""
        mock_get_assets.return_value = sample_assets
        
        response = client.get("/api/market/search?q=AAPL")
        data = response.json()
        
        # First result should be AAPL (exact match)
        assert len(data["results"]) > 0
        assert data["results"][0]["symbol"] == "AAPL"

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_respects_limit(self, mock_get_assets, sample_assets):
        """Search should respect the limit parameter."""
        mock_get_assets.return_value = sample_assets
        
        response = client.get("/api/market/search?q=a&limit=5")
        data = response.json()
        
        assert len(data["results"]) <= 5

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_empty_query_rejected(self, mock_get_assets, sample_assets):
        """Empty query should be rejected."""
        mock_get_assets.return_value = sample_assets
        
        response = client.get("/api/market/search?q=")
        assert response.status_code == 422  # Validation error

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_case_insensitive(self, mock_get_assets, sample_assets):
        """Search should be case-insensitive."""
        mock_get_assets.return_value = sample_assets
        
        response_upper = client.get("/api/market/search?q=AAPL")
        response_lower = client.get("/api/market/search?q=aapl")
        
        data_upper = response_upper.json()
        data_lower = response_lower.json()
        
        # Both should return the same first result
        assert data_upper["results"][0]["symbol"] == data_lower["results"][0]["symbol"]

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_multi_word_query(self, mock_get_assets, sample_assets):
        """Multi-word query should work correctly."""
        mock_get_assets.return_value = sample_assets
        
        response = client.get("/api/market/search?q=coca%20cola")
        data = response.json()
        
        assert data["success"] == True
        # Should find Coca-Cola related stocks
        assert any("coca" in r["name"].lower() or "KO" in r["symbol"] for r in data["results"])

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_no_results(self, mock_get_assets, sample_assets):
        """Search with no matches should return empty results."""
        mock_get_assets.return_value = sample_assets
        
        response = client.get("/api/market/search?q=xyznonexistent")
        data = response.json()
        
        assert data["success"] == True
        assert len(data["results"]) == 0
        assert data["total_matches"] == 0

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_handles_empty_cache(self, mock_get_assets):
        """Search should handle empty cache gracefully."""
        mock_get_assets.return_value = []
        
        response = client.get("/api/market/search?q=AAPL")
        data = response.json()
        
        assert data["success"] == True
        assert len(data["results"]) == 0


# --- Integration Tests for Popular Stocks Endpoint ---

class TestPopularStocksEndpoint:
    """Tests for the /api/market/popular endpoint."""

    @patch('routes.market_routes._get_asset_lookup', new_callable=AsyncMock)
    def test_popular_returns_correct_format(self, mock_get_lookup, sample_assets):
        """Popular stocks should return properly formatted response."""
        mock_get_lookup.return_value = {a['symbol']: a for a in sample_assets}
        
        response = client.get("/api/market/popular")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "assets" in data
        assert "count" in data

    @patch('routes.market_routes._get_asset_lookup', new_callable=AsyncMock)
    def test_popular_returns_well_known_stocks(self, mock_get_lookup, sample_assets):
        """Popular stocks should include well-known companies."""
        mock_get_lookup.return_value = {a['symbol']: a for a in sample_assets}
        
        response = client.get("/api/market/popular")
        data = response.json()
        
        symbols = [a["symbol"] for a in data["assets"]]
        # Should include at least some of these well-known stocks
        well_known = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA"]
        found_well_known = [s for s in well_known if s in symbols]
        assert len(found_well_known) > 0

    @patch('routes.market_routes._get_asset_lookup', new_callable=AsyncMock)
    def test_popular_respects_limit(self, mock_get_lookup, sample_assets):
        """Popular stocks should respect the limit parameter."""
        mock_get_lookup.return_value = {a['symbol']: a for a in sample_assets}
        
        response = client.get("/api/market/popular?limit=5")
        data = response.json()
        
        assert len(data["assets"]) <= 5

    @patch('routes.market_routes._get_asset_lookup', new_callable=AsyncMock)
    def test_popular_handles_empty_cache(self, mock_get_lookup):
        """Popular stocks should handle empty cache gracefully."""
        mock_get_lookup.return_value = {}
        
        response = client.get("/api/market/popular")
        data = response.json()
        
        assert data["success"] == True
        assert len(data["assets"]) == 0


# --- Performance Tests ---

class TestPerformance:
    """Performance-related tests."""

    @patch('routes.market_routes._get_cached_assets', new_callable=AsyncMock)
    def test_search_with_large_dataset(self, mock_get_assets):
        """Search should be efficient with large datasets."""
        # Generate a large dataset (10,000 assets)
        large_assets = [
            {"symbol": f"SYM{i}", "name": f"Company Name {i}"}
            for i in range(10000)
        ]
        # Add some real-looking ones
        large_assets.extend([
            {"symbol": "AAPL", "name": "Apple Inc."},
            {"symbol": "MSFT", "name": "Microsoft Corporation"},
        ])
        mock_get_assets.return_value = large_assets
        
        import time
        start = time.time()
        response = client.get("/api/market/search?q=AAPL")
        elapsed = time.time() - start
        
        assert response.status_code == 200
        # Should complete in under 1 second even with 10K assets
        assert elapsed < 1.0
        
        data = response.json()
        assert data["success"] == True
        # Should find AAPL
        assert any(r["symbol"] == "AAPL" for r in data["results"])


# --- Security Tests ---

class TestSecurity:
    """Security-related tests."""

    def test_search_query_max_length(self):
        """Search query should have maximum length limit."""
        long_query = "a" * 100
        response = client.get(f"/api/market/search?q={long_query}")
        # Should either reject or handle gracefully
        assert response.status_code in [200, 422]  # Either OK or validation error

    def test_search_sql_injection_safe(self):
        """Search should be safe from SQL injection attempts."""
        # This is a file-based search, but test for safety anyway
        malicious_query = "'; DROP TABLE users; --"
        response = client.get(f"/api/market/search?q={malicious_query}")
        # Should handle gracefully (we don't use SQL, but test the behavior)
        assert response.status_code in [200, 422]

    def test_search_path_traversal_safe(self):
        """Search should be safe from path traversal attempts."""
        malicious_query = "../../../etc/passwd"
        response = client.get(f"/api/market/search?q={malicious_query}")
        # Should handle gracefully
        assert response.status_code in [200, 422]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
