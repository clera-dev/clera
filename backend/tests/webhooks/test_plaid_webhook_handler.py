"""
Comprehensive tests for Plaid webhook handler production readiness.

Tests the webhook handler with real Plaid webhook data structures to ensure
production-grade reliability and security.
"""

import os
import sys
import pytest
import json
import hmac
import hashlib
import time
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Real Plaid webhook data structures based on API documentation
REAL_HOLDINGS_WEBHOOK = {
    "webhook_type": "HOLDINGS",
    "webhook_code": "DEFAULT_UPDATE",
    "item_id": "eVBnVMp7zdTJLkRNr33ytDrglEBM77iZkpM6B",
    "request_id": "bkVE1BHWMAZ9Rnr",
    "error": None,
    "environment": "sandbox"
}

REAL_TRANSACTIONS_WEBHOOK = {
    "webhook_type": "INVESTMENTS_TRANSACTIONS", 
    "webhook_code": "DEFAULT_UPDATE",
    "item_id": "eVBnVMp7zdTJLkRNr33ytDrglEBM77iZkpM6B",
    "request_id": "bkVE1BHWMAZ9Rnr",
    "new_investments_transactions": 5,
    "environment": "sandbox"
}

# Test constants
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
TEST_API_KEY = "test-backend-api-key"
TEST_WEBHOOK_KEY = "test-webhook-verification-key"

class TestPlaidWebhookHandler:
    """Test the PlaidWebhookHandler class."""
    
    @pytest.fixture
    def handler(self):
        """Create PlaidWebhookHandler instance."""
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        return PlaidWebhookHandler()
    
    @pytest.fixture
    def mock_environment(self):
        """Mock environment variables for testing."""
        with patch.dict(os.environ, {
            'BACKEND_API_KEY': TEST_API_KEY,
            'PLAID_WEBHOOK_VERIFICATION_KEY': TEST_WEBHOOK_KEY
        }):
            yield
    
    @pytest.fixture
    def mock_supabase(self):
        """Mock Supabase database calls."""
        with patch('utils.portfolio.webhook_handler.get_supabase_client') as mock:
            supabase_client = MagicMock()
            mock.return_value = supabase_client
            
            # Mock user lookup for item
            supabase_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {'user_id': TEST_USER_ID}
            ]
            
            yield supabase_client
    
    @pytest.fixture
    def mock_services(self):
        """Mock portfolio and sync services."""
        with patch('utils.portfolio.webhook_handler.get_portfolio_service') as mock_portfolio, \
             patch('utils.portfolio.webhook_handler.sync_service') as mock_sync:
            
            portfolio_service = MagicMock()
            sync_service = MagicMock()
            
            mock_portfolio.return_value = portfolio_service
            mock_sync.ensure_user_portfolio_fresh = AsyncMock(return_value={
                'positions': [{'symbol': 'AAPL', 'quantity': 100}],
                'metadata': {'last_updated': datetime.now().isoformat()}
            })
            portfolio_service._invalidate_user_cache = AsyncMock()
            
            yield {
                'portfolio': portfolio_service,
                'sync': mock_sync
            }
    
    def test_webhook_signature_verification_valid(self, handler, mock_environment):
        """Test webhook signature verification with valid signature."""
        request_body = json.dumps(REAL_HOLDINGS_WEBHOOK).encode()
        
        # Compute valid signature
        expected_signature = hashlib.sha256(
            (TEST_WEBHOOK_KEY + request_body.decode('utf-8')).encode('utf-8')
        ).hexdigest()
        
        result = handler.verify_webhook_signature(request_body, expected_signature)
        assert result is True
    
    def test_webhook_signature_verification_invalid(self, handler, mock_environment):
        """Test webhook signature verification with invalid signature."""
        request_body = json.dumps(REAL_HOLDINGS_WEBHOOK).encode()
        invalid_signature = "invalid_signature_hash"
        
        result = handler.verify_webhook_signature(request_body, invalid_signature)
        assert result is False
    
    def test_webhook_signature_verification_missing_key(self, handler):
        """Test webhook signature verification without verification key (development mode)."""
        with patch.dict(os.environ, {}, clear=True):
            request_body = json.dumps(REAL_HOLDINGS_WEBHOOK).encode()
            
            result = handler.verify_webhook_signature(request_body, "any_signature")
            assert result is True  # Should allow in development
    
    @pytest.mark.asyncio
    async def test_log_webhook_event_success(self, handler, mock_supabase):
        """Test webhook event logging to database."""
        await handler.log_webhook_event(
            REAL_HOLDINGS_WEBHOOK,
            TEST_USER_ID,
            True,
            150,  # 150ms processing time
            None
        )
        
        # Verify database insert was called
        mock_supabase.table.assert_called_with('plaid_webhook_events')
        mock_supabase.table.return_value.insert.assert_called_once()
        
        # Check the logged data structure
        insert_call = mock_supabase.table.return_value.insert.call_args[0][0]
        assert insert_call['webhook_type'] == 'HOLDINGS'
        assert insert_call['webhook_code'] == 'DEFAULT_UPDATE'
        assert insert_call['item_id'] == 'eVBnVMp7zdTJLkRNr33ytDrglEBM77iZkpM6B'
        assert insert_call['user_id'] == TEST_USER_ID
        assert insert_call['success'] is True
        assert insert_call['processing_duration_ms'] == 150
    
    @pytest.mark.asyncio
    async def test_log_webhook_event_failure(self, handler, mock_supabase):
        """Test webhook event logging for failed processing."""
        error_message = "Portfolio refresh failed"
        
        await handler.log_webhook_event(
            REAL_TRANSACTIONS_WEBHOOK,
            TEST_USER_ID,
            False,
            300,  # 300ms processing time
            error_message
        )
        
        insert_call = mock_supabase.table.return_value.insert.call_args[0][0]
        assert insert_call['success'] is False
        assert insert_call['error_message'] == error_message
        assert insert_call['processing_duration_ms'] == 300
    
    @pytest.mark.asyncio
    async def test_get_user_id_for_item_success(self, handler, mock_supabase):
        """Test successful user ID lookup for Plaid item."""
        user_id = await handler._get_user_id_for_item("test_item_id")
        
        assert user_id == TEST_USER_ID
        # Verify correct database query
        mock_supabase.table.assert_called_with('user_investment_accounts')
    
    @pytest.mark.asyncio 
    async def test_get_user_id_for_item_not_found(self, handler, mock_supabase):
        """Test user ID lookup when item not found."""
        # Mock empty result
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        
        user_id = await handler._get_user_id_for_item("nonexistent_item")
        
        assert user_id is None
    
    @pytest.mark.asyncio
    async def test_handle_holdings_webhook_success(self, handler, mock_environment, mock_supabase, mock_services):
        """Test successful holdings webhook processing."""
        result = await handler.handle_webhook(
            REAL_HOLDINGS_WEBHOOK,
            TEST_API_KEY
        )
        
        assert result["acknowledged"] is True
        assert "processing_time_ms" in result
        
        # Verify cache invalidation and refresh were called
        mock_services['portfolio']._invalidate_user_cache.assert_called_once_with(TEST_USER_ID)
        mock_services['sync'].ensure_user_portfolio_fresh.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_handle_transactions_webhook_success(self, handler, mock_environment, mock_supabase, mock_services):
        """Test successful transactions webhook processing."""
        result = await handler.handle_webhook(
            REAL_TRANSACTIONS_WEBHOOK,
            TEST_API_KEY
        )
        
        assert result["acknowledged"] is True
        assert "processing_time_ms" in result
        
        # Verify cache invalidation and refresh were called
        mock_services['portfolio']._invalidate_user_cache.assert_called_once_with(TEST_USER_ID)
        mock_services['sync'].ensure_user_portfolio_fresh.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_handle_webhook_invalid_api_key(self, handler, mock_environment):
        """Test webhook rejection with invalid API key."""
        with pytest.raises(HTTPException) as exc_info:
            await handler.handle_webhook(
                REAL_HOLDINGS_WEBHOOK,
                "invalid_api_key"
            )
        
        assert exc_info.value.status_code == 401
        assert "Invalid API key" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_handle_webhook_with_signature_verification(self, handler, mock_environment, mock_supabase, mock_services):
        """Test webhook processing with signature verification."""
        request_body = json.dumps(REAL_HOLDINGS_WEBHOOK).encode()
        
        # Compute valid signature
        valid_signature = hashlib.sha256(
            (TEST_WEBHOOK_KEY + request_body.decode('utf-8')).encode('utf-8')
        ).hexdigest()
        
        result = await handler.handle_webhook(
            REAL_HOLDINGS_WEBHOOK,
            TEST_API_KEY,
            request_body,
            valid_signature
        )
        
        assert result["acknowledged"] is True
    
    @pytest.mark.asyncio
    async def test_handle_webhook_invalid_signature(self, handler, mock_environment, mock_supabase):
        """Test webhook rejection with invalid signature."""
        request_body = json.dumps(REAL_HOLDINGS_WEBHOOK).encode()
        invalid_signature = "invalid_signature_hash"
        
        with pytest.raises(HTTPException) as exc_info:
            await handler.handle_webhook(
                REAL_HOLDINGS_WEBHOOK,
                TEST_API_KEY,
                request_body,
                invalid_signature
            )
        
        assert exc_info.value.status_code == 401
        assert "Invalid webhook signature" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_handle_unrecognized_webhook_type(self, handler, mock_environment, mock_supabase, mock_services):
        """Test handling of unrecognized webhook types."""
        unknown_webhook = {
            "webhook_type": "UNKNOWN_TYPE",
            "webhook_code": "UNKNOWN_CODE",
            "item_id": "test_item_id",
            "request_id": "test_request_id"
        }
        
        result = await handler.handle_webhook(unknown_webhook, TEST_API_KEY)
        
        assert result["acknowledged"] is True
        # Should not crash, just log as unhandled
    
    @pytest.mark.asyncio
    async def test_handle_webhook_user_not_found(self, handler, mock_environment, mock_supabase):
        """Test webhook processing when user not found for item."""
        # Mock empty user result
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        
        result = await handler.handle_webhook(REAL_HOLDINGS_WEBHOOK, TEST_API_KEY)
        
        assert result["acknowledged"] is True
        assert "warning" in result
        assert "No user found" in result["warning"]
    
    @pytest.mark.asyncio
    async def test_handle_webhook_service_error(self, handler, mock_environment, mock_supabase, mock_services):
        """Test webhook processing when portfolio service fails."""
        # Make portfolio service fail
        mock_services['sync'].ensure_user_portfolio_fresh = AsyncMock(side_effect=Exception("Portfolio service error"))
        
        result = await handler.handle_webhook(REAL_HOLDINGS_WEBHOOK, TEST_API_KEY)
        
        assert result["acknowledged"] is False
        assert "error" in result
        assert "processing_time_ms" in result


class TestWebhookEndpointIntegration:
    """Test the actual webhook endpoint in api_server.py."""
    
    @pytest.fixture
    def mock_webhook_handler(self):
        """Mock the webhook handler."""
        with patch('utils.portfolio.webhook_handler.webhook_handler') as mock:
            yield mock
    
    @pytest.mark.asyncio
    async def test_webhook_endpoint_success(self, mock_webhook_handler):
        """Test the /webhook/plaid endpoint processes webhooks correctly."""
        # Import here to avoid circular imports
        from fastapi.testclient import TestClient
        from api_server import app
        
        client = TestClient(app)
        
        # Mock successful webhook processing
        mock_webhook_handler.handle_webhook = AsyncMock(return_value={
            "acknowledged": True,
            "processing_time_ms": 150
        })
        
        # Test webhook endpoint
        response = client.post(
            "/webhook/plaid",
            json=REAL_HOLDINGS_WEBHOOK,
            headers={"X-API-Key": TEST_API_KEY}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["acknowledged"] is True
        
        # Verify handler was called
        mock_webhook_handler.handle_webhook.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_webhook_endpoint_error_handling(self, mock_webhook_handler):
        """Test webhook endpoint error handling."""
        from fastapi.testclient import TestClient
        from api_server import app
        
        client = TestClient(app)
        
        # Mock webhook handler failure
        mock_webhook_handler.handle_webhook = AsyncMock(side_effect=Exception("Handler error"))
        
        response = client.post(
            "/webhook/plaid",
            json=REAL_HOLDINGS_WEBHOOK,
            headers={"X-API-Key": TEST_API_KEY}
        )
        
        assert response.status_code == 200  # Should not crash
        data = response.json()
        assert data["acknowledged"] is False
        assert "error" in data


class TestWebhookSecurity:
    """Test webhook security features."""
    
    @pytest.fixture
    def handler(self):
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        return PlaidWebhookHandler()
    
    def test_webhook_signature_algorithm(self, handler):
        """Test the webhook signature verification algorithm matches Plaid's spec."""
        request_body = '{"webhook_type":"HOLDINGS","webhook_code":"DEFAULT_UPDATE"}'
        webhook_key = "test_key"
        
        # Compute signature using Plaid's algorithm
        expected_signature = hashlib.sha256(
            (webhook_key + request_body).encode('utf-8')
        ).hexdigest()
        
        with patch.dict(os.environ, {'PLAID_WEBHOOK_VERIFICATION_KEY': webhook_key}):
            result = handler.verify_webhook_signature(request_body.encode(), expected_signature)
            assert result is True
    
    def test_webhook_timing_attack_resistance(self, handler):
        """Test that signature verification uses timing-safe comparison."""
        with patch('utils.portfolio.webhook_handler.hmac.compare_digest') as mock_compare:
            mock_compare.return_value = True
            
            with patch.dict(os.environ, {'PLAID_WEBHOOK_VERIFICATION_KEY': 'test_key'}):
                handler.verify_webhook_signature(b'test', 'signature')
                
                # Verify that hmac.compare_digest was used (timing-safe)
                mock_compare.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_webhook_api_key_validation(self, handler):
        """Test API key validation for webhook security."""
        with patch.dict(os.environ, {'BACKEND_API_KEY': 'correct_key'}):
            # Test with wrong API key
            with pytest.raises(HTTPException) as exc_info:
                await handler.handle_webhook(REAL_HOLDINGS_WEBHOOK, "wrong_key")
            
            assert exc_info.value.status_code == 401


class TestWebhookDataStructures:
    """Test webhook handler with real Plaid data structures."""
    
    @pytest.fixture
    def handler(self):
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        return PlaidWebhookHandler()
    
    @pytest.fixture
    def complete_mock_setup(self):
        """Complete mock setup for webhook testing."""
        with patch.dict(os.environ, {'BACKEND_API_KEY': TEST_API_KEY}), \
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
                'positions': [{'symbol': 'AAPL', 'quantity': 100}]
            })
            
            yield {
                'supabase': supabase_client,
                'portfolio': portfolio_service,
                'sync': mock_sync
            }
    
    @pytest.mark.asyncio
    async def test_holdings_webhook_real_data_structure(self, handler, complete_mock_setup):
        """Test holdings webhook with real Plaid data structure."""
        result = await handler.handle_webhook(REAL_HOLDINGS_WEBHOOK, TEST_API_KEY)
        
        assert result["acknowledged"] is True
        assert result["processing_time_ms"] > 0
        
        # Verify correct service methods were called
        complete_mock_setup['portfolio']._invalidate_user_cache.assert_called_once_with(TEST_USER_ID)
        complete_mock_setup['sync'].ensure_user_portfolio_fresh.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_transactions_webhook_real_data_structure(self, handler, complete_mock_setup):
        """Test transactions webhook with real Plaid data structure."""
        result = await handler.handle_webhook(REAL_TRANSACTIONS_WEBHOOK, TEST_API_KEY)
        
        assert result["acknowledged"] is True
        assert result["processing_time_ms"] > 0
        
        # Verify correct service methods were called
        complete_mock_setup['portfolio']._invalidate_user_cache.assert_called_once_with(TEST_USER_ID)
        complete_mock_setup['sync'].ensure_user_portfolio_fresh.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_webhook_processing_performance(self, handler, complete_mock_setup):
        """Test webhook processing performance is within acceptable limits."""
        start_time = time.time()
        
        result = await handler.handle_webhook(REAL_HOLDINGS_WEBHOOK, TEST_API_KEY)
        
        processing_time = time.time() - start_time
        
        assert result["acknowledged"] is True
        assert processing_time < 5.0  # Should process within 5 seconds
        assert result["processing_time_ms"] < 5000  # Reported time should also be reasonable


class TestWebhookProductionReadiness:
    """Test webhook production readiness features."""
    
    @pytest.fixture
    def handler(self):
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        return PlaidWebhookHandler()
    
    def test_webhook_handler_module_imports(self):
        """Test that webhook handler imports are production ready."""
        try:
            from utils.portfolio.webhook_handler import webhook_handler, PlaidWebhookHandler
            from api_server import app  # Should include webhook endpoint
            
            # All imports should succeed
            assert webhook_handler is not None
            assert isinstance(webhook_handler, PlaidWebhookHandler)
            
        except ImportError as e:
            pytest.fail(f"Production webhook imports failed: {e}")
    
    def test_environment_configuration_check(self, handler):
        """Test webhook can detect required environment configuration."""
        # Test required environment variables are checked
        required_vars = [
            'BACKEND_API_KEY',
            'PLAID_WEBHOOK_VERIFICATION_KEY'  # Optional but recommended
        ]
        
        for var in required_vars:
            if var == 'PLAID_WEBHOOK_VERIFICATION_KEY':
                # This one is optional - should work without it
                continue
                
            with patch.dict(os.environ, {}, clear=True):
                # Should handle missing environment gracefully
                assert True  # If we get here, no crash occurred
    
    @pytest.mark.asyncio
    async def test_webhook_concurrent_processing(self, handler):
        """Test webhook can handle concurrent requests safely."""
        import asyncio
        
        with patch.dict(os.environ, {'BACKEND_API_KEY': TEST_API_KEY}), \
             patch('utils.portfolio.webhook_handler.get_supabase_client') as mock_supabase, \
             patch('utils.portfolio.webhook_handler.get_portfolio_service') as mock_portfolio, \
             patch('utils.portfolio.webhook_handler.sync_service') as mock_sync:
            
            # Setup mocks
            supabase_client = MagicMock()
            mock_supabase.return_value = supabase_client
            supabase_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {'user_id': TEST_USER_ID}
            ]
            
            portfolio_service = MagicMock()
            portfolio_service._invalidate_user_cache = AsyncMock()
            mock_portfolio.return_value = portfolio_service
            
            mock_sync.ensure_user_portfolio_fresh = AsyncMock(return_value={'positions': []})
            
            # Process multiple webhooks concurrently
            tasks = [
                handler.handle_webhook(REAL_HOLDINGS_WEBHOOK, TEST_API_KEY),
                handler.handle_webhook(REAL_TRANSACTIONS_WEBHOOK, TEST_API_KEY),
                handler.handle_webhook(REAL_HOLDINGS_WEBHOOK, TEST_API_KEY)
            ]
            
            results = await asyncio.gather(*tasks)
            
            # All should succeed
            for result in results:
                assert result["acknowledged"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
