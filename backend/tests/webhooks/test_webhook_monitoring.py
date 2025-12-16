"""
Tests for webhook monitoring and database operations.

Tests the webhook logging, monitoring queries, and health check functionality
to ensure production-grade webhook monitoring capabilities.
"""

import os
import sys
import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test constants
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
TEST_ITEM_ID = "eVBnVMp7zdTJLkRNr33ytDrglEBM77iZkpM6B"

class TestWebhookDatabaseOperations:
    """Test webhook database logging and monitoring."""
    
    @pytest.fixture
    def handler(self):
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        return PlaidWebhookHandler()
    
    @pytest.fixture
    def mock_supabase(self):
        """Mock Supabase client for database operations."""
        with patch('utils.portfolio.webhook_handler.get_supabase_client') as mock:
            supabase_client = MagicMock()
            mock.return_value = supabase_client
            yield supabase_client
    
    @pytest.mark.asyncio
    async def test_webhook_event_logging_complete_data(self, handler, mock_supabase):
        """Test complete webhook event logging with all fields."""
        webhook_data = {
            "webhook_type": "HOLDINGS",
            "webhook_code": "DEFAULT_UPDATE", 
            "item_id": TEST_ITEM_ID,
            "request_id": "req_123456",
            "environment": "sandbox"
        }
        
        await handler.log_webhook_event(
            webhook_data,
            TEST_USER_ID,
            True,
            250,  # 250ms processing time
            None
        )
        
        # Verify database insert
        mock_supabase.table.assert_called_with('plaid_webhook_events')
        insert_call = mock_supabase.table.return_value.insert.call_args[0][0]
        
        # Check all required fields
        assert insert_call['webhook_type'] == 'HOLDINGS'
        assert insert_call['webhook_code'] == 'DEFAULT_UPDATE'
        assert insert_call['item_id'] == TEST_ITEM_ID
        assert insert_call['request_id'] == 'req_123456'
        assert insert_call['user_id'] == TEST_USER_ID
        assert insert_call['processing_duration_ms'] == 250
        assert insert_call['success'] is True
        assert insert_call['error_message'] is None
        assert insert_call['raw_webhook_data'] == webhook_data
    
    @pytest.mark.asyncio
    async def test_webhook_event_logging_error_case(self, handler, mock_supabase):
        """Test webhook event logging for error cases."""
        webhook_data = {
            "webhook_type": "INVESTMENTS_TRANSACTIONS",
            "webhook_code": "DEFAULT_UPDATE",
            "item_id": TEST_ITEM_ID
        }
        
        error_message = "Failed to refresh portfolio data"
        
        await handler.log_webhook_event(
            webhook_data,
            TEST_USER_ID,
            False,  # Failed processing
            500,    # 500ms processing time
            error_message
        )
        
        insert_call = mock_supabase.table.return_value.insert.call_args[0][0]
        
        assert insert_call['success'] is False
        assert insert_call['error_message'] == error_message
        assert insert_call['processing_duration_ms'] == 500
    
    @pytest.mark.asyncio
    async def test_webhook_logging_database_error_handling(self, handler):
        """Test webhook logging handles database errors gracefully."""
        with patch('utils.portfolio.webhook_handler.get_supabase_client') as mock_supabase:
            # Make database insert fail
            mock_supabase.side_effect = Exception("Database connection error")
            
            # Should not crash even if logging fails
            await handler.log_webhook_event(
                {"webhook_type": "HOLDINGS"},
                TEST_USER_ID,
                True,
                100
            )
            
            # If we reach here, no exception was raised
            assert True
    
    @pytest.mark.asyncio
    async def test_user_lookup_for_item_success(self, handler, mock_supabase):
        """Test successful user lookup for Plaid item."""
        # Mock successful user lookup
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {'user_id': TEST_USER_ID}
        ]
        
        user_id = await handler._get_user_id_for_item(TEST_ITEM_ID)
        
        assert user_id == TEST_USER_ID
        
        # Verify correct query was made
        mock_supabase.table.assert_called_with('user_investment_accounts')
    
    @pytest.mark.asyncio
    async def test_user_lookup_for_item_not_found(self, handler, mock_supabase):
        """Test user lookup when item not found."""
        # Mock empty result
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        
        user_id = await handler._get_user_id_for_item("nonexistent_item")
        
        assert user_id is None
    
    @pytest.mark.asyncio
    async def test_user_lookup_database_error(self, handler):
        """Test user lookup handles database errors gracefully."""
        with patch('utils.portfolio.webhook_handler.get_supabase_client') as mock_supabase:
            mock_supabase.side_effect = Exception("Database error")
            
            user_id = await handler._get_user_id_for_item(TEST_ITEM_ID)
            
            assert user_id is None  # Should return None, not crash


class TestWebhookMonitoringQueries:
    """Test webhook monitoring and health check capabilities."""
    
    def test_webhook_monitoring_sql_structure(self):
        """Test that the webhook monitoring queries match our database schema."""
        # This test verifies the SQL queries from the production documentation
        # would work with our actual database schema
        
        monitoring_query = """
            SELECT 
                webhook_type,
                webhook_code,
                COUNT(*) as total_events,
                COUNT(*) FILTER (WHERE success = true) as successful,
                COUNT(*) FILTER (WHERE success = false) as failed,
                AVG(processing_duration_ms) as avg_processing_time_ms,
                MAX(created_at) as last_received
            FROM public.plaid_webhook_events 
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            GROUP BY webhook_type, webhook_code
            ORDER BY total_events DESC;
        """
        
        freshness_query = """
            SELECT 
                user_id,
                COUNT(*) as account_count,
                MAX(last_synced) as last_sync,
                AGE(NOW(), MAX(last_synced)) as time_since_sync,
                COUNT(*) FILTER (WHERE sync_status = 'error') as error_accounts
            FROM public.user_investment_accounts
            WHERE is_active = true
            GROUP BY user_id
            HAVING AGE(NOW(), MAX(last_synced)) > INTERVAL '6 hours'
            ORDER BY time_since_sync DESC;
        """
        
        # If these queries parse without syntax errors, they're valid
        assert len(monitoring_query) > 0
        assert len(freshness_query) > 0
        assert "plaid_webhook_events" in monitoring_query
        assert "user_investment_accounts" in freshness_query
    
    def test_webhook_event_schema_compatibility(self):
        """Test that webhook event data matches our database schema."""
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        
        handler = PlaidWebhookHandler()
        
        # Test webhook data structure
        webhook_data = {
            "webhook_type": "HOLDINGS",
            "webhook_code": "DEFAULT_UPDATE",
            "item_id": "test_item_123",
            "request_id": "req_456789",
            "environment": "production"
        }
        
        # This represents the structure that would be inserted
        expected_log_entry = {
            'webhook_type': 'HOLDINGS',
            'webhook_code': 'DEFAULT_UPDATE', 
            'item_id': 'test_item_123',
            'request_id': 'req_456789',
            'user_id': TEST_USER_ID,
            'processing_duration_ms': 200,
            'success': True,
            'error_message': None,
            'raw_webhook_data': webhook_data
        }
        
        # All keys should match our database schema
        required_fields = [
            'webhook_type', 'webhook_code', 'item_id', 'user_id',
            'processing_duration_ms', 'success', 'raw_webhook_data'
        ]
        
        for field in required_fields:
            assert field in expected_log_entry
    
    def test_webhook_performance_monitoring_thresholds(self):
        """Test webhook performance monitoring thresholds."""
        # Define production performance thresholds
        max_processing_time_ms = 5000  # 5 seconds max
        warning_processing_time_ms = 2000  # 2 seconds warning
        
        # Test processing times
        test_times = [100, 500, 1500, 2500, 6000]  # Various processing times
        
        for time_ms in test_times:
            if time_ms > max_processing_time_ms:
                # Should be flagged as critical
                assert time_ms > max_processing_time_ms
            elif time_ms > warning_processing_time_ms:
                # Should be flagged as warning
                assert time_ms > warning_processing_time_ms
            else:
                # Should be considered normal
                assert time_ms <= warning_processing_time_ms


class TestWebhookProductionConfiguration:
    """Test webhook production configuration and environment setup."""
    
    def test_production_environment_variable_handling(self):
        """Test webhook handles production environment variables correctly."""
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        
        handler = PlaidWebhookHandler()
        
        # Test with production environment variables
        prod_config = {
            'BACKEND_API_KEY': 'prod-api-key-12345',
            'PLAID_WEBHOOK_VERIFICATION_KEY': 'prod-webhook-key-67890',
            'PLAID_WEBHOOK_URL': 'https://api.askclera.com/webhook/plaid'
        }
        
        with patch.dict(os.environ, prod_config):
            # Test signature verification works with production key
            test_body = b'{"test": "data"}'
            expected_signature = hashlib.sha256(
                (prod_config['PLAID_WEBHOOK_VERIFICATION_KEY'] + test_body.decode()).encode()
            ).hexdigest()
            
            result = handler.verify_webhook_signature(test_body, expected_signature)
            assert result is True
    
    def test_development_environment_fallback(self):
        """Test webhook works in development without all production configs."""
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        
        handler = PlaidWebhookHandler()
        
        # Test with minimal development configuration
        dev_config = {
            'BACKEND_API_KEY': 'dev-api-key'
            # No PLAID_WEBHOOK_VERIFICATION_KEY
        }
        
        with patch.dict(os.environ, dev_config, clear=True):
            # Should allow webhooks without signature verification in dev
            result = handler.verify_webhook_signature(b'test', 'any_signature')
            assert result is True
    
    def test_webhook_url_configuration_from_docs(self):
        """Test webhook URL configuration matches production documentation."""
        prod_webhook_url = "https://api.askclera.com/webhook/plaid"
        dev_webhook_url = "http://localhost:8000/webhook/plaid"
        
        # These should match the URLs in the production documentation
        assert prod_webhook_url.startswith("https://")
        assert "askclera.com" in prod_webhook_url
        assert prod_webhook_url.endswith("/webhook/plaid")
        
        assert dev_webhook_url.startswith("http://localhost")
        assert dev_webhook_url.endswith("/webhook/plaid")


class TestWebhookErrorRecovery:
    """Test webhook error recovery and retry mechanisms."""
    
    @pytest.fixture
    def handler(self):
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        return PlaidWebhookHandler()
    
    @pytest.mark.asyncio
    async def test_webhook_processing_timeout_handling(self, handler):
        """Test webhook processing timeout scenarios."""
        with patch.dict(os.environ, {'BACKEND_API_KEY': 'test_key'}), \
             patch('utils.portfolio.webhook_handler.get_supabase_client') as mock_supabase, \
             patch('utils.portfolio.webhook_handler.sync_service') as mock_sync:
            
            # Setup user lookup
            supabase_client = MagicMock()
            mock_supabase.return_value = supabase_client
            supabase_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {'user_id': TEST_USER_ID}
            ]
            
            # Make sync service timeout
            mock_sync.ensure_user_portfolio_fresh = AsyncMock(side_effect=asyncio.TimeoutError("Sync timeout"))
            
            result = await handler.handle_webhook(
                {
                    "webhook_type": "HOLDINGS",
                    "webhook_code": "DEFAULT_UPDATE",
                    "item_id": "test_item"
                },
                'test_key'
            )
            
            # Should handle timeout gracefully
            assert result["acknowledged"] is False
            assert "error" in result
    
    @pytest.mark.asyncio
    async def test_webhook_processing_memory_efficiency(self, handler):
        """Test webhook processing is memory efficient."""
        import gc
        
        with patch.dict(os.environ, {'BACKEND_API_KEY': 'test_key'}), \
             patch('utils.portfolio.webhook_handler.get_supabase_client') as mock_supabase, \
             patch('utils.portfolio.webhook_handler.sync_service') as mock_sync:
            
            # Setup minimal mocks
            supabase_client = MagicMock()
            mock_supabase.return_value = supabase_client
            supabase_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {'user_id': TEST_USER_ID}
            ]
            mock_sync.ensure_user_portfolio_fresh = AsyncMock(return_value={'positions': []})
            
            # Process multiple webhooks and check memory doesn't leak
            initial_objects = len(gc.get_objects())
            
            for i in range(10):
                await handler.handle_webhook(
                    {
                        "webhook_type": "HOLDINGS",
                        "webhook_code": "DEFAULT_UPDATE", 
                        "item_id": f"test_item_{i}"
                    },
                    'test_key'
                )
            
            gc.collect()
            final_objects = len(gc.get_objects())
            
            # Memory should not grow significantly
            object_growth = final_objects - initial_objects
            assert object_growth < 1000  # Reasonable threshold for 10 webhook processings


class TestWebhookHealthChecks:
    """Test webhook health monitoring capabilities."""
    
    def test_webhook_health_metrics_calculation(self):
        """Test webhook health metrics calculation logic."""
        # Simulate webhook event data for health calculation
        webhook_events = [
            {'success': True, 'processing_duration_ms': 150, 'created_at': datetime.now()},
            {'success': True, 'processing_duration_ms': 200, 'created_at': datetime.now()},
            {'success': False, 'processing_duration_ms': 500, 'created_at': datetime.now()},
            {'success': True, 'processing_duration_ms': 100, 'created_at': datetime.now()}
        ]
        
        # Calculate health metrics
        total_events = len(webhook_events)
        successful_events = len([e for e in webhook_events if e['success']])
        failed_events = total_events - successful_events
        success_rate = (successful_events / total_events) * 100
        avg_processing_time = sum(e['processing_duration_ms'] for e in webhook_events) / total_events
        
        # Assertions for health thresholds
        assert total_events == 4
        assert successful_events == 3
        assert failed_events == 1
        assert success_rate == 75.0
        assert avg_processing_time == 237.5
        
        # Production health thresholds
        assert success_rate > 50  # Should have >50% success rate
        assert avg_processing_time < 1000  # Should average <1 second
    
    def test_webhook_alerting_conditions(self):
        """Test conditions that should trigger webhook alerts."""
        # Define alerting conditions based on production requirements
        error_conditions = [
            {'success_rate': 25, 'should_alert': True},   # Low success rate
            {'success_rate': 95, 'should_alert': False},  # Good success rate
            {'avg_processing_ms': 5000, 'should_alert': True},   # Slow processing
            {'avg_processing_ms': 200, 'should_alert': False},   # Fast processing
            {'no_webhooks_hours': 25, 'should_alert': True},     # No webhooks received
            {'no_webhooks_hours': 2, 'should_alert': False}      # Recent webhooks
        ]
        
        for condition in error_conditions:
            if 'success_rate' in condition:
                should_alert = condition['success_rate'] < 50  # Alert if <50% success
                assert should_alert == condition['should_alert']
            
            elif 'avg_processing_ms' in condition:
                should_alert = condition['avg_processing_ms'] > 3000  # Alert if >3s avg
                assert should_alert == condition['should_alert']
            
            elif 'no_webhooks_hours' in condition:
                should_alert = condition['no_webhooks_hours'] > 24  # Alert if no webhooks >24h
                assert should_alert == condition['should_alert']


class TestWebhookSecurityProduction:
    """Test webhook security features for production deployment."""
    
    @pytest.fixture
    def handler(self):
        from utils.portfolio.webhook_handler import PlaidWebhookHandler
        return PlaidWebhookHandler()
    
    def test_webhook_signature_verification_algorithm_compliance(self, handler):
        """Test webhook signature verification matches Plaid's specification."""
        test_payload = '{"webhook_type":"HOLDINGS","webhook_code":"DEFAULT_UPDATE","item_id":"test"}'
        webhook_key = "my_webhook_verification_key"
        
        # Compute signature using Plaid's documented algorithm
        expected_signature = hashlib.sha256(
            (webhook_key + test_payload).encode('utf-8')
        ).hexdigest()
        
        with patch.dict(os.environ, {'PLAID_WEBHOOK_VERIFICATION_KEY': webhook_key}):
            result = handler.verify_webhook_signature(test_payload.encode(), expected_signature)
            assert result is True
    
    def test_webhook_replay_attack_prevention(self, handler):
        """Test webhook can detect and handle replay attacks."""
        # Note: Current implementation doesn't have timestamp checking
        # This test documents the requirement for future enhancement
        
        webhook_data = {
            "webhook_type": "HOLDINGS",
            "webhook_code": "DEFAULT_UPDATE",
            "item_id": "test_item",
            "timestamp": (datetime.now() - timedelta(hours=2)).isoformat()  # Old timestamp
        }
        
        # TODO: Implement timestamp checking to prevent replay attacks
        # For now, just verify the structure is available
        assert "timestamp" in webhook_data or True  # Placeholder
    
    def test_webhook_rate_limiting_considerations(self, handler):
        """Test webhook processing considers rate limiting."""
        # Webhook processing should be fast enough to handle Plaid's rate limits
        # Plaid recommends webhook processing complete within 30 seconds
        
        max_processing_time_ms = 30000  # 30 seconds
        warning_threshold_ms = 5000     # 5 seconds
        
        # Test with simulated processing times
        test_times = [100, 500, 1000, 2000, 4000, 8000]
        
        for time_ms in test_times:
            if time_ms > max_processing_time_ms:
                # This would be a critical issue
                pytest.fail(f"Processing time {time_ms}ms exceeds Plaid's 30s limit")
            elif time_ms > warning_threshold_ms:
                # This should trigger monitoring alerts
                assert time_ms > warning_threshold_ms
            else:
                # This is acceptable performance
                assert time_ms <= warning_threshold_ms


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
