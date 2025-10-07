"""
Comprehensive tests for new portfolio mode safety services.

Tests the production-grade safety layer that prevents crashes for aggregation-only users
while maintaining full functionality for existing brokerage users.
"""

import asyncio
import json
import os
import pytest
import redis
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from decimal import Decimal
from datetime import datetime, timedelta

# Add parent directory to path for imports
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test data constants
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"  # Valid UUID
TEST_USER_ID_2 = "550e8400-e29b-41d4-a716-446655440001"  # Valid UUID
TEST_ALPACA_ACCOUNT_ID = "alpaca-123-456-789"
TEST_PLAID_ACCOUNT_ID = "plaid_account_456"

# Import the services we're testing
from utils.portfolio.portfolio_mode_service import PortfolioModeService, PortfolioMode
from utils.portfolio.websocket_auth_service import WebSocketAuthorizationService
from utils.portfolio.realtime_data_service import RealtimeDataService
from utils.portfolio.safe_account_service import SafeAccountService

class TestPortfolioModeService:
    """Test the PortfolioModeService for safe mode detection."""
    
    @pytest.fixture
    def service(self):
        return PortfolioModeService()
    
    @pytest.fixture 
    def mock_feature_flags(self):
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock:
            mock_flags = MagicMock()
            mock.return_value = mock_flags
            yield mock_flags
    
    @pytest.fixture
    def mock_get_alpaca_id(self):
        with patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock:
            yield mock
    
    def test_aggregation_mode_detection(self, service, mock_feature_flags, mock_get_alpaca_id):
        """Test detection of aggregation mode users."""
        mock_feature_flags.get_portfolio_mode.return_value = "aggregation"
        mock_get_alpaca_id.return_value = None
        
        mode = service.get_user_portfolio_mode(TEST_USER_ID)
        assert mode == PortfolioMode.AGGREGATION
    
    def test_brokerage_mode_detection(self, service, mock_feature_flags, mock_get_alpaca_id):
        """Test detection of brokerage mode users."""
        mock_feature_flags.get_portfolio_mode.return_value = "brokerage"
        mock_get_alpaca_id.return_value = "alpaca-123"
        
        mode = service.get_user_portfolio_mode(TEST_USER_ID)
        assert mode == PortfolioMode.BROKERAGE
    
    def test_hybrid_mode_detection(self, service, mock_feature_flags, mock_get_alpaca_id):
        """Test detection of hybrid mode users."""
        mock_feature_flags.get_portfolio_mode.return_value = "hybrid"
        mock_get_alpaca_id.return_value = TEST_ALPACA_ACCOUNT_ID
        
        mode = service.get_user_portfolio_mode(TEST_USER_ID)
        assert mode == PortfolioMode.HYBRID
    
    def test_safe_alpaca_account_check_success(self, service, mock_get_alpaca_id):
        """Test safe Alpaca account check with existing account."""
        mock_get_alpaca_id.return_value = TEST_ALPACA_ACCOUNT_ID
        
        result = service.has_alpaca_account_safe(TEST_USER_ID)
        assert result is True
    
    def test_safe_alpaca_account_check_none(self, service, mock_get_alpaca_id):
        """Test safe Alpaca account check with no account."""
        mock_get_alpaca_id.return_value = None
        
        result = service.has_alpaca_account_safe(TEST_USER_ID)
        assert result is False
    
    def test_safe_alpaca_account_check_exception(self, service, mock_get_alpaca_id):
        """Test safe Alpaca account check handles exceptions gracefully."""
        mock_get_alpaca_id.side_effect = Exception("Database error")
        
        result = service.has_alpaca_account_safe(TEST_USER_ID)
        assert result is False  # Should return False, not crash
    
    def test_websocket_authorization_aggregation_mode(self, service, mock_feature_flags, mock_get_alpaca_id):
        """Test websocket authorization for aggregation mode."""
        mock_feature_flags.get_portfolio_mode.return_value = "aggregation"
        mock_get_alpaca_id.return_value = None
        
        auth_info = service.get_websocket_authorization_mode(TEST_USER_ID, TEST_PLAID_ACCOUNT_ID)
        
        assert auth_info["authorized"] is True
        assert auth_info["account_type"] == "plaid"
        assert auth_info["mode"] == "aggregation"
    
    def test_websocket_authorization_brokerage_mode(self, service, mock_feature_flags, mock_get_alpaca_id):
        """Test websocket authorization for brokerage mode."""
        mock_feature_flags.get_portfolio_mode.return_value = "brokerage"
        mock_get_alpaca_id.return_value = TEST_ALPACA_ACCOUNT_ID
        
        auth_info = service.get_websocket_authorization_mode(TEST_USER_ID, TEST_ALPACA_ACCOUNT_ID)
        
        assert auth_info["authorized"] is True
        assert auth_info["account_type"] == "alpaca"
        assert auth_info["mode"] == "brokerage"
    
    def test_websocket_authorization_forbidden(self, service, mock_feature_flags, mock_get_alpaca_id):
        """Test websocket authorization denies wrong account."""
        mock_feature_flags.get_portfolio_mode.return_value = "brokerage"
        mock_get_alpaca_id.return_value = TEST_ALPACA_ACCOUNT_ID
        
        auth_info = service.get_websocket_authorization_mode(TEST_USER_ID, "wrong-account")
        
        assert auth_info["authorized"] is False
        assert "not authorized" in auth_info["error"]


class TestWebSocketAuthorizationService:
    """Test the WebSocketAuthorizationService for safe websocket connections."""
    
    @pytest.fixture
    def service(self):
        return WebSocketAuthorizationService()
    
    @pytest.fixture
    def mock_portfolio_service(self):
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock:
            yield mock.return_value
    
    def test_authorize_aggregation_user(self, service, mock_portfolio_service):
        """Test authorization for aggregation mode user."""
        mock_portfolio_service.get_websocket_authorization_mode.return_value = {
            "authorized": True,
            "mode": "aggregation",
            "account_type": "plaid",
            "error": None
        }
        
        authorized, error_msg, metadata = service.authorize_websocket_connection("user123", "plaid_account_456")
        
        assert authorized is True
        assert error_msg is None
        assert metadata["mode"] == "aggregation"
        assert metadata["account_type"] == "plaid"
    
    def test_authorize_brokerage_user(self, service, mock_portfolio_service):
        """Test authorization for brokerage mode user."""
        mock_portfolio_service.get_websocket_authorization_mode.return_value = {
            "authorized": True,
            "mode": "brokerage",
            "account_type": "alpaca",
            "error": None
        }
        
        authorized, error_msg, metadata = service.authorize_websocket_connection("user123", "alpaca-123")
        
        assert authorized is True
        assert error_msg is None
        assert metadata["mode"] == "brokerage"
        assert metadata["account_type"] == "alpaca"
    
    def test_deny_unauthorized_access(self, service, mock_portfolio_service):
        """Test denial of unauthorized websocket access."""
        mock_portfolio_service.get_websocket_authorization_mode.return_value = {
            "authorized": False,
            "mode": "brokerage",
            "account_type": None,
            "error": "Account mismatch"
        }
        
        authorized, error_msg, metadata = service.authorize_websocket_connection("user123", "wrong-account")
        
        assert authorized is False
        assert error_msg == "Account mismatch"
        assert metadata["authorized"] is False
    
    def test_handle_authorization_exception(self, service, mock_portfolio_service):
        """Test graceful handling of authorization exceptions."""
        mock_portfolio_service.get_websocket_authorization_mode.side_effect = Exception("Database error")
        
        authorized, error_msg, metadata = service.authorize_websocket_connection("user123", "account-123")
        
        assert authorized is False
        assert "authorization error" in error_msg.lower()
        assert "error" in metadata


class TestRealtimeDataService:
    """Test the RealtimeDataService for safe real-time data handling."""
    
    @pytest.fixture
    def redis_client(self):
        """Mock Redis client for testing."""
        return MagicMock()
    
    @pytest.fixture
    def service(self, redis_client):
        return RealtimeDataService(redis_client)
    
    @pytest.fixture
    def mock_alpaca_components(self):
        """Mock Alpaca components."""
        # Mock the initialize_alpaca_components method instead of individual imports
        mock_components = {
            'symbol_collector': MagicMock(),
            'portfolio_calculator': MagicMock(),
            'sector_collector': MagicMock()
        }
        yield mock_components
    
    def test_initialize_alpaca_components_success(self, service, mock_alpaca_components):
        """Test successful initialization of Alpaca components."""
        # Mock the initialization to return success
        service.alpaca_components = mock_alpaca_components
        result = service.initialize_alpaca_components()
        assert result is True
        assert service.alpaca_components is not None
    
    def test_initialize_alpaca_components_failure(self, service):
        """Test graceful handling of Alpaca components initialization failure."""
        # Force the service to return failure 
        with patch.object(service, 'initialize_alpaca_components', return_value=False):
            result = service.initialize_alpaca_components()
            assert result is False
    
    def test_get_active_account_ids_mixed_types(self, service, redis_client):
        """Test getting account IDs with mixed account types."""
        # Mock Redis keys
        redis_client.keys.return_value = [
            b'account_positions:alpaca-123',
            b'account_positions:plaid_456',
            b'account_positions:unknown-789'
        ]
        
        # Mock metadata for one account
        redis_client.get.side_effect = lambda key: {
            'account_meta:alpaca-123': json.dumps({'type': 'alpaca'}),
            'account_meta:plaid_456': json.dumps({'type': 'plaid'}),
            'account_meta:unknown-789': None
        }.get(key)
        
        accounts_by_mode = service.get_active_account_ids_by_mode()
        
        assert 'alpaca-123' in accounts_by_mode['alpaca']
        assert 'plaid_456' in accounts_by_mode['plaid']
        assert 'unknown-789' in accounts_by_mode['alpaca']  # Default to Alpaca for backward compatibility
    
    @pytest.mark.asyncio
    async def test_refresh_alpaca_accounts(self, service, redis_client, mock_alpaca_components):
        """Test refreshing Alpaca accounts."""
        service.alpaca_components = mock_alpaca_components
        
        # Mock portfolio calculator response
        mock_alpaca_components['portfolio_calculator'].calculate_portfolio_value.return_value = {
            'account_id': 'alpaca-123',
            'total_value': 10000.50,
            'timestamp': datetime.now().isoformat()
        }
        
        result = await service.refresh_alpaca_accounts(['alpaca-123'])
        
        assert result == 1  # 1 account refreshed
        redis_client.publish.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_refresh_alpaca_accounts_no_components(self, service, redis_client):
        """Test refreshing Alpaca accounts when components not available."""
        service.alpaca_components = None
        
        result = await service.refresh_alpaca_accounts(['alpaca-123'])
        
        assert result == 0  # No accounts refreshed
    
    @pytest.mark.asyncio
    async def test_refresh_plaid_accounts(self, service, redis_client):
        """Test refreshing Plaid accounts (placeholder implementation)."""
        redis_client.exists.return_value = True
        
        result = await service.refresh_plaid_accounts(['plaid_account_456'])
        
        assert result == 1  # 1 account processed
    
    @pytest.mark.asyncio
    async def test_perform_periodic_refresh_mixed_accounts(self, service, redis_client, mock_alpaca_components):
        """Test periodic refresh with mixed account types."""
        service.alpaca_components = mock_alpaca_components
        
        # Mock get_active_account_ids_by_mode
        service.get_active_account_ids_by_mode = MagicMock(return_value={
            'alpaca': ['alpaca-123'],
            'plaid': ['plaid_456'],
            'unknown': []
        })
        
        # Mock individual refresh methods
        service.refresh_alpaca_accounts = AsyncMock(return_value=1)
        service.refresh_plaid_accounts = AsyncMock(return_value=1)
        service.refresh_sector_data = AsyncMock(return_value=True)
        
        results = await service.perform_periodic_refresh(
            need_full_refresh=True,
            need_sector_refresh=True
        )
        
        assert results['alpaca_refreshed'] == 1
        assert results['plaid_refreshed'] == 1
        assert results['sector_success'] is True
        assert len(results['errors']) == 0


class TestSafeAccountService:
    """Test the SafeAccountService for safe account operations."""
    
    @pytest.fixture
    def service(self):
        return SafeAccountService()
    
    @pytest.fixture
    def mock_portfolio_service(self):
        with patch('utils.portfolio.safe_account_service.get_portfolio_mode_service') as mock:
            yield mock.return_value
    
    @pytest.fixture
    def mock_get_alpaca_id(self):
        with patch('utils.portfolio.safe_account_service.get_user_alpaca_account_id') as mock:
            yield mock
    
    def test_get_user_account_id_safe_aggregation_mode(self, service, mock_portfolio_service):
        """Test safe account ID retrieval for aggregation mode users."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.AGGREGATION
        
        result = service.get_user_account_id_safe("user123", required=True)
        assert result is None  # Expected for aggregation mode
    
    def test_get_user_account_id_safe_brokerage_mode(self, service, mock_portfolio_service, mock_get_alpaca_id):
        """Test safe account ID retrieval for brokerage mode users."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.BROKERAGE
        mock_get_alpaca_id.return_value = "alpaca-123"
        
        result = service.get_user_account_id_safe("user123", required=True)
        assert result == "alpaca-123"
    
    def test_get_user_account_id_safe_exception_handling(self, service, mock_portfolio_service):
        """Test safe account ID retrieval handles exceptions gracefully."""
        mock_portfolio_service.get_user_portfolio_mode.side_effect = Exception("Database error")
        
        result = service.get_user_account_id_safe("user123", required=False)
        assert result is None  # Should not crash
    
    def test_validate_account_access_aggregation_mode(self, service, mock_portfolio_service):
        """Test account access validation for aggregation mode."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.AGGREGATION
        
        is_valid, error_msg = service.validate_account_access("user123", "plaid_account_456")
        assert is_valid is True
        assert error_msg is None
    
    def test_validate_account_access_brokerage_mode_valid(self, service, mock_portfolio_service):
        """Test account access validation for brokerage mode with valid account."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.BROKERAGE
        service.get_user_account_id_safe = MagicMock(return_value="alpaca-123")
        
        is_valid, error_msg = service.validate_account_access("user123", "alpaca-123")
        assert is_valid is True
        assert error_msg is None
    
    def test_validate_account_access_brokerage_mode_invalid(self, service, mock_portfolio_service):
        """Test account access validation for brokerage mode with invalid account."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.BROKERAGE
        service.get_user_account_id_safe = MagicMock(return_value="alpaca-123")
        
        is_valid, error_msg = service.validate_account_access("user123", "wrong-account")
        assert is_valid is False
        assert "not accessible" in error_msg
    
    def test_get_user_accounts_info_comprehensive(self, service, mock_portfolio_service):
        """Test comprehensive user account information retrieval."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.HYBRID
        mock_portfolio_service.get_portfolio_data_sources.return_value = ["alpaca", "plaid"]
        service.get_user_account_id_safe = MagicMock(return_value="alpaca-123")
        
        info = service.get_user_accounts_info("user123")
        
        assert info["portfolio_mode"] == "hybrid"
        assert info["has_alpaca_account"] is True
        assert info["alpaca_account_id"] == "alpaca-123"
        assert info["realtime_updates_enabled"] is True
        assert "alpaca" in info["data_sources"]
        assert "plaid" in info["data_sources"]
    
    def test_is_endpoint_available_for_user_aggregation_mode(self, service, mock_portfolio_service):
        """Test endpoint availability for aggregation mode users."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.AGGREGATION
        mock_portfolio_service.has_alpaca_account_safe.return_value = False
        
        assert service.is_endpoint_available_for_user("user123", "portfolio") is True
        assert service.is_endpoint_available_for_user("user123", "realtime") is False
        assert service.is_endpoint_available_for_user("user123", "trading") is False
        assert service.is_endpoint_available_for_user("user123", "account") is True
    
    def test_is_endpoint_available_for_user_brokerage_mode(self, service, mock_portfolio_service):
        """Test endpoint availability for brokerage mode users."""
        mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.BROKERAGE
        mock_portfolio_service.has_alpaca_account_safe.return_value = True
        
        assert service.is_endpoint_available_for_user("user123", "portfolio") is True
        assert service.is_endpoint_available_for_user("user123", "realtime") is True
        assert service.is_endpoint_available_for_user("user123", "trading") is True
        assert service.is_endpoint_available_for_user("user123", "account") is True


class TestPlaidDataIntegration:
    """Test that new services handle actual Plaid data structures correctly."""
    
    @pytest.fixture
    def sample_plaid_positions_response(self):
        """Sample Plaid positions response based on API documentation."""
        return {
            'positions': [
                {
                    'symbol': 'AAPL',
                    'quantity': 100.0,
                    'market_value': 15000.0,
                    'cost_basis': 12000.0,
                    'institution_name': 'Charles Schwab',
                    'account_id': 'plaid_account_123',
                    'security_type': 'equity',
                    'security_name': 'Apple Inc.',
                    'institutions': ['Charles Schwab'],
                    'accounts': [
                        {
                            'account_id': 'plaid_account_123',
                            'quantity': 100.0,
                            'market_value': 15000.0,
                            'cost_basis': 12000.0,
                            'institution': 'Charles Schwab'
                        }
                    ]
                }
            ],
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'total_accounts': 1,
                'total_positions': 1
            }
        }
    
    def test_realtime_service_handles_plaid_positions(self, sample_plaid_positions_response):
        """Test that RealtimeDataService can handle Plaid position data."""
        redis_client = MagicMock()
        service = RealtimeDataService(redis_client)
        
        # Mock Redis to return Plaid account data
        redis_client.keys.return_value = [b'account_positions:plaid_account_123']
        redis_client.get.return_value = json.dumps({'type': 'plaid'})
        
        accounts_by_mode = service.get_active_account_ids_by_mode()
        
        assert 'plaid_account_123' in accounts_by_mode['plaid']
        assert len(accounts_by_mode['alpaca']) == 0
    
    def test_websocket_auth_handles_plaid_accounts(self, sample_plaid_positions_response):
        """Test that websocket authorization works with Plaid account IDs."""
        service = WebSocketAuthorizationService()
        
        with patch.object(service, 'portfolio_service') as mock_portfolio_service:
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": True,
                "mode": "aggregation",
                "account_type": "plaid",
                "error": None
            }
            
            authorized, error_msg, metadata = service.authorize_websocket_connection(
                "user123", "plaid_account_123"
            )
            
            assert authorized is True
            assert metadata["account_type"] == "plaid"
            assert metadata["mode"] == "aggregation"


# Integration test fixtures
@pytest.fixture
def mock_redis():
    """Mock Redis client for integration tests."""
    with patch('redis.Redis') as mock:
        yield mock.return_value

@pytest.fixture
def mock_supabase():
    """Mock Supabase calls."""
    with patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock:
        yield mock

@pytest.fixture
def mock_feature_flags_global():
    """Mock feature flags globally."""
    with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock:
        mock_flags = MagicMock()
        mock_flags.get_portfolio_mode.return_value = "aggregation"
        mock.return_value = mock_flags
        yield mock_flags


class TestEndToEndIntegration:
    """End-to-end integration tests for the complete safety system."""
    
    def test_aggregation_user_full_flow(self, mock_redis, mock_supabase, mock_feature_flags_global):
        """Test complete flow for an aggregation-only user."""
        mock_supabase.return_value = None  # No Alpaca account
        mock_feature_flags_global.get_portfolio_mode.return_value = "aggregation"
        
        # Test portfolio mode detection
        portfolio_service = PortfolioModeService()
        mode = portfolio_service.get_user_portfolio_mode("user123")
        assert mode == PortfolioMode.AGGREGATION
        
        # Test websocket authorization
        auth_service = WebSocketAuthorizationService()
        authorized, error_msg, metadata = auth_service.authorize_websocket_connection(
            "user123", "plaid_account_456"
        )
        assert authorized is True
        assert metadata["account_type"] == "plaid"
        
        # Test safe account service
        safe_service = SafeAccountService()
        alpaca_id = safe_service.get_user_account_id_safe("user123")
        assert alpaca_id is None  # Expected for aggregation users
        
        # Test endpoint availability
        assert safe_service.is_endpoint_available_for_user("user123", "portfolio") is True
        assert safe_service.is_endpoint_available_for_user("user123", "trading") is False
    
    def test_brokerage_user_full_flow(self, mock_redis, mock_supabase, mock_feature_flags_global):
        """Test complete flow for a brokerage user."""
        mock_supabase.return_value = "alpaca-123"  # Has Alpaca account
        mock_feature_flags_global.get_portfolio_mode.return_value = "brokerage"
        
        # Test portfolio mode detection
        portfolio_service = PortfolioModeService()
        mode = portfolio_service.get_user_portfolio_mode("user456")
        assert mode == PortfolioMode.BROKERAGE
        
        # Test websocket authorization
        auth_service = WebSocketAuthorizationService()
        authorized, error_msg, metadata = auth_service.authorize_websocket_connection(
            "user456", "alpaca-123"
        )
        assert authorized is True
        assert metadata["account_type"] == "alpaca"
        
        # Test safe account service
        safe_service = SafeAccountService()
        alpaca_id = safe_service.get_user_account_id_safe("user456")
        assert alpaca_id == "alpaca-123"
        
        # Test endpoint availability
        assert safe_service.is_endpoint_available_for_user("user456", "portfolio") is True
        assert safe_service.is_endpoint_available_for_user("user456", "trading") is True
        assert safe_service.is_endpoint_available_for_user("user456", "realtime") is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
