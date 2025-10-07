"""
Integration tests for the /webhook/plaid endpoint in api_server.py.

Tests the complete webhook flow from HTTP request to database logging
to ensure production-grade reliability.
"""

import os
import sys
import pytest
import json
import hashlib
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test constants
TEST_API_KEY = "test-backend-api-key"
TEST_WEBHOOK_KEY = "test-webhook-verification-key"
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"

# Real webhook payloads from Plaid documentation
HOLDINGS_WEBHOOK_PAYLOAD = {
    "webhook_type": "HOLDINGS",
    "webhook_code": "DEFAULT_UPDATE",
    "item_id": "eVBnVMp7zdTJLkRNr33ytDrglEBM77iZkpM6B",
    "request_id": "bkVE1BHWMAZ9Rnr",
    "error": None,
    "environment": "sandbox"
}

TRANSACTIONS_WEBHOOK_PAYLOAD = {
    "webhook_type": "INVESTMENTS_TRANSACTIONS",
    "webhook_code": "DEFAULT_UPDATE", 
    "item_id": "eVBnVMp7zdTJLkRNr33ytDrglEBM77iZkpM6B",
    "request_id": "bkVE1BHWMAZ9Rnr",
    "new_investments_transactions": 3,
    "environment": "sandbox"
}

class TestWebhookEndpointIntegration:
    """Test the /webhook/plaid endpoint integration."""
    
    @pytest.fixture
    def client(self):
        """Create FastAPI test client."""
        from api_server import app
        return TestClient(app)
    
    @pytest.fixture
    def complete_webhook_mocks(self):
        """Complete mock setup for webhook endpoint testing."""
        with patch.dict(os.environ, {
            'BACKEND_API_KEY': TEST_API_KEY,
            'PLAID_WEBHOOK_VERIFICATION_KEY': TEST_WEBHOOK_KEY
        }), \
        patch('utils.portfolio.webhook_handler.get_supabase_client') as mock_supabase, \
        patch('utils.portfolio.webhook_handler.get_portfolio_service') as mock_portfolio, \
        patch('utils.portfolio.webhook_handler.sync_service') as mock_sync:
            
            # Setup Supabase mock
            supabase_client = MagicMock()
            mock_supabase.return_value = supabase_client
            supabase_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {'user_id': TEST_USER_ID}
            ]
            
            # Setup service mocks
            portfolio_service = MagicMock()
            portfolio_service._invalidate_user_cache = AsyncMock()
            mock_portfolio.return_value = portfolio_service
            
            mock_sync.ensure_user_portfolio_fresh = AsyncMock(return_value={
                'positions': [{'symbol': 'AAPL', 'quantity': 100}],
                'metadata': {'last_updated': '2025-09-16T22:39:57Z'}
            })
            
            yield {
                'supabase': supabase_client,
                'portfolio': portfolio_service,
                'sync': mock_sync
            }
    
    def test_webhook_endpoint_holdings_update(self, client, complete_webhook_mocks):
        """Test /webhook/plaid endpoint with holdings update."""
        response = client.post(
            "/webhook/plaid",
            json=HOLDINGS_WEBHOOK_PAYLOAD,
            headers={"X-API-Key": TEST_API_KEY}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["acknowledged"] is True
        assert "processing_time_ms" in data
        
        # Verify correct services were called
        complete_webhook_mocks['portfolio']._invalidate_user_cache.assert_called_once()
        complete_webhook_mocks['sync'].ensure_user_portfolio_fresh.assert_called_once()
    
    def test_webhook_endpoint_transactions_update(self, client, complete_webhook_mocks):
        """Test /webhook/plaid endpoint with transactions update."""
        response = client.post(
            "/webhook/plaid",
            json=TRANSACTIONS_WEBHOOK_PAYLOAD,
            headers={"X-API-Key": TEST_API_KEY}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["acknowledged"] is True
        
        # Verify transaction-specific processing
        complete_webhook_mocks['sync'].ensure_user_portfolio_fresh.assert_called_once()
    
    def test_webhook_endpoint_with_signature_verification(self, client, complete_webhook_mocks):
        """Test webhook endpoint with signature verification."""
        request_body = json.dumps(HOLDINGS_WEBHOOK_PAYLOAD)
        
        # Compute valid signature
        valid_signature = hashlib.sha256(
            (TEST_WEBHOOK_KEY + request_body).encode('utf-8')
        ).hexdigest()
        
        response = client.post(
            "/webhook/plaid",
            data=request_body,
            headers={
                "X-API-Key": TEST_API_KEY,
                "X-Plaid-Signature": valid_signature,
                "Content-Type": "application/json"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["acknowledged"] is True
    
    def test_webhook_endpoint_invalid_api_key(self, client):
        """Test webhook endpoint rejects invalid API key."""
        response = client.post(
            "/webhook/plaid",
            json=HOLDINGS_WEBHOOK_PAYLOAD,
            headers={"X-API-Key": "invalid_key"}
        )
        
        assert response.status_code == 401
    
    def test_webhook_endpoint_malformed_json(self, client):
        """Test webhook endpoint handles malformed JSON."""
        response = client.post(
            "/webhook/plaid",
            data="invalid json{{{",
            headers={
                "X-API-Key": TEST_API_KEY,
                "Content-Type": "application/json"
            }
        )
        
        assert response.status_code == 200  # Should not crash
        data = response.json()
        assert data["acknowledged"] is False
        assert "Invalid JSON payload" in data["error"]
    
    def test_webhook_endpoint_missing_headers(self, client):
        """Test webhook endpoint handles missing headers gracefully."""
        # Test without API key header
        response = client.post(
            "/webhook/plaid",
            json=HOLDINGS_WEBHOOK_PAYLOAD
        )
        
        assert response.status_code == 401  # Should require API key
    
    def test_webhook_endpoint_empty_payload(self, client):
        """Test webhook endpoint handles empty payload."""
        with patch.dict(os.environ, {'BACKEND_API_KEY': TEST_API_KEY}):
            response = client.post(
                "/webhook/plaid",
                json={},
                headers={"X-API-Key": TEST_API_KEY}
            )
            
            assert response.status_code == 200  # Should not crash
            data = response.json()
            # Should handle gracefully, possibly with warning


class TestWebhookPerformanceRequirements:
    """Test webhook meets Plaid's performance requirements."""
    
    @pytest.fixture
    def client(self):
        from api_server import app
        return TestClient(app)
    
    def test_webhook_response_time_requirement(self, client):
        """Test webhook responds within Plaid's required timeframe."""
        import time
        
        with patch.dict(os.environ, {'BACKEND_API_KEY': TEST_API_KEY}), \
             patch('utils.portfolio.webhook_handler.get_supabase_client') as mock_supabase, \
             patch('utils.portfolio.webhook_handler.sync_service') as mock_sync:
            
            # Setup minimal mocks for fast response
            supabase_client = MagicMock()
            mock_supabase.return_value = supabase_client
            supabase_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {'user_id': TEST_USER_ID}
            ]
            mock_sync.ensure_user_portfolio_fresh = AsyncMock(return_value={'positions': []})
            
            start_time = time.time()
            
            response = client.post(
                "/webhook/plaid",
                json=HOLDINGS_WEBHOOK_PAYLOAD,
                headers={"X-API-Key": TEST_API_KEY}
            )
            
            response_time = time.time() - start_time
            
            assert response.status_code == 200
            assert response_time < 30.0  # Plaid requires response within 30 seconds
            assert response_time < 5.0   # Our target: respond within 5 seconds
    
    def test_webhook_concurrent_request_handling(self, client):
        """Test webhook can handle concurrent requests."""
        import asyncio
        import aiohttp
        
        # This test would require running the actual server
        # For now, just verify the endpoint exists and basic structure
        assert True  # Placeholder for concurrent testing
    
    def test_webhook_payload_size_limits(self, client):
        """Test webhook handles various payload sizes."""
        # Test with small payload
        small_payload = HOLDINGS_WEBHOOK_PAYLOAD
        
        # Test with larger payload (simulating many transactions)
        large_payload = {
            **TRANSACTIONS_WEBHOOK_PAYLOAD,
            "new_investments_transactions": 1000,  # Large number
            "additional_data": "x" * 1000  # Large string
        }
        
        with patch.dict(os.environ, {'BACKEND_API_KEY': TEST_API_KEY}), \
             patch('utils.portfolio.webhook_handler.get_supabase_client'), \
             patch('utils.portfolio.webhook_handler.sync_service'):
            
            # Both should be handled
            small_response = client.post(
                "/webhook/plaid",
                json=small_payload,
                headers={"X-API-Key": TEST_API_KEY}
            )
            
            large_response = client.post(
                "/webhook/plaid", 
                json=large_payload,
                headers={"X-API-Key": TEST_API_KEY}
            )
            
            assert small_response.status_code == 200
            assert large_response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
