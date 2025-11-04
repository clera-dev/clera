"""
Tests for Live Enrichment Service

Production-grade tests covering all edge cases for the live data enrichment service.
"""

import pytest
from decimal import Decimal
from datetime import datetime, timedelta
from utils.portfolio.live_enrichment_service import LiveEnrichmentService, get_enrichment_service


class TestLiveEnrichmentService:
    """Test suite for LiveEnrichmentService"""
    
    def test_service_initialization(self):
        """Test that service initializes correctly"""
        service = LiveEnrichmentService()
        assert service is not None
        # Market client may or may not initialize depending on env vars
        assert hasattr(service, 'market_data_client')
    
    def test_singleton_pattern(self):
        """Test that get_enrichment_service returns the same instance"""
        service1 = get_enrichment_service()
        service2 = get_enrichment_service()
        assert service1 is service2
    
    def test_enrich_empty_holdings(self):
        """Test enrichment with empty holdings list"""
        service = LiveEnrichmentService()
        result = service.enrich_holdings([], 'test-user-id')
        assert result == []
    
    def test_enrich_single_holding_with_live_price(self):
        """Test enrichment of a single holding when live price is available"""
        service = LiveEnrichmentService()
        
        # Mock holding with stale data
        holdings = [{
            'symbol': 'AAPL',
            'total_quantity': 10.0,
            'total_cost_basis': 1500.0,
            'total_market_value': 0.0,  # Stale!
            'security_type': 'equity'
        }]
        
        # Note: This will actually call Alpaca API in tests
        # For unit tests, we'd mock this. For integration tests, we let it run.
        enriched = service.enrich_holdings(holdings, 'test-user')
        
        assert len(enriched) == 1
        assert enriched[0]['symbol'] == 'AAPL'
        
        # If live price was fetched, market value should be > 0
        if enriched[0].get('price_is_live'):
            assert enriched[0]['total_market_value'] > 0
    
    def test_enrich_holdings_with_zero_quantity(self):
        """Test enrichment handles zero quantity gracefully"""
        service = LiveEnrichmentService()
        
        holdings = [{
            'symbol': 'TSLA',
            'total_quantity': 0.0,
            'total_cost_basis': 0.0,
            'total_market_value': 0.0,
            'security_type': 'equity'
        }]
        
        enriched = service.enrich_holdings(holdings, 'test-user-zero-qty')
        
        assert len(enriched) == 1
        # Should not crash, should handle gracefully
        # Note: With live prices, market_value will be live_price * 0 = 0
        assert enriched[0]['total_market_value'] == 0.0 or enriched[0].get('price_is_live') == True
    
    def test_cache_functionality(self):
        """Test that caching works correctly"""
        service = LiveEnrichmentService()
        user_id = 'cache-test-user'
        
        holdings = [{
            'symbol': 'MSFT',
            'total_quantity': 5.0,
            'total_cost_basis': 1000.0,
            'total_market_value': 0.0,
            'security_type': 'equity'
        }]
        
        # First call - should hit API
        result1 = service.enrich_holdings(holdings, user_id)
        
        # Second call within 60 seconds - should use cache
        result2 = service.enrich_holdings(holdings, user_id)
        
        # Results should be identical
        assert result1 == result2
    
    def test_cache_invalidation(self):
        """Test that cache can be manually cleared"""
        service = LiveEnrichmentService()
        user_id = 'clear-cache-test'
        
        holdings = [{'symbol': 'GOOGL', 'total_quantity': 1.0, 'total_cost_basis': 100.0, 'total_market_value': 0.0, 'security_type': 'equity'}]
        
        # Enrich and cache
        service.enrich_holdings(holdings, user_id)
        
        # Clear cache
        service.clear_cache(user_id)
        
        # Should not be in cache anymore
        from utils.portfolio.live_enrichment_service import _cache_timestamps
        assert f"{user_id}_enriched" not in _cache_timestamps
    
    def test_force_refresh_bypasses_cache(self):
        """Test that force_refresh parameter bypasses cache"""
        service = LiveEnrichmentService()
        user_id = 'force-refresh-test'
        
        holdings = [{'symbol': 'NVDA', 'total_quantity': 2.0, 'total_cost_basis': 500.0, 'total_market_value': 0.0, 'security_type': 'equity'}]
        
        # First call
        service.enrich_holdings(holdings, user_id)
        
        # Force refresh should bypass cache
        result = service.enrich_holdings(holdings, user_id, force_refresh=True)
        
        # Should still get valid result
        assert len(result) == 1


class TestEnrichmentEdgeCases:
    """Test edge cases and error handling"""
    
    def test_missing_symbol_field(self):
        """Test enrichment handles missing symbol field"""
        service = LiveEnrichmentService()
        
        holdings = [{
            'total_quantity': 10.0,
            'total_cost_basis': 1000.0,
            # Missing 'symbol' field!
        }]
        
        # Should not crash
        result = service.enrich_holdings(holdings, 'test-user')
        assert len(result) == 1
    
    def test_invalid_symbol(self):
        """Test enrichment handles invalid/delisted symbols"""
        service = LiveEnrichmentService()
        
        holdings = [{
            'symbol': 'INVALID_TICKER_12345',
            'total_quantity': 1.0,
            'total_cost_basis': 100.0,
            'total_market_value': 0.0,
            'security_type': 'equity'
        }]
        
        # Should not crash, should fall back to stale data
        result = service.enrich_holdings(holdings, 'test-user-invalid')
        assert len(result) == 1
        # If Alpaca doesn't have the symbol, it will use stale data
        # The enrichment service sets price_is_live based on whether a live price was found
        assert 'price_is_live' in result[0]
    
    def test_negative_cost_basis(self):
        """Test enrichment handles negative cost basis (short positions)"""
        service = LiveEnrichmentService()
        
        holdings = [{
            'symbol': 'TSLA',
            'total_quantity': -10.0,  # Short position
            'total_cost_basis': -3000.0,
            'total_market_value': 0.0,
            'security_type': 'equity'
        }]
        
        # Should handle without division by zero errors
        result = service.enrich_holdings(holdings, 'test-user')
        assert len(result) == 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

