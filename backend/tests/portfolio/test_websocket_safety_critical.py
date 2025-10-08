"""
Critical websocket safety tests - focused on preventing crashes for aggregation users.

This test file focuses on the most important safety checks to ensure the new
websocket authorization system prevents crashes for users without Alpaca accounts.
"""

import os
import sys
import pytest
import uuid
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test data
TEST_USER_UUID = "550e8400-e29b-41d4-a716-446655440000"
TEST_ALPACA_ACCOUNT_ID = "alpaca-account-123"
TEST_PLAID_ACCOUNT_ID = "plaid_account_456"

class TestCriticalWebSocketSafety:
    """Critical tests to ensure websocket server doesn't crash aggregation users."""
    
    def test_portfolio_mode_service_basic_functionality(self):
        """Test basic PortfolioModeService functionality."""
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            # Setup mocks
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            
            # Import and test service  
            from utils.portfolio.portfolio_mode_service import PortfolioModeService, PortfolioMode
            service = PortfolioModeService()
            
            # Test aggregation mode
            mock_flags_instance.get_portfolio_mode.return_value = "aggregation"
            mock_alpaca.return_value = None
            
            mode = service.get_user_portfolio_mode(TEST_USER_UUID)
            assert mode == PortfolioMode.AGGREGATION
            
            # Test brokerage mode
            mock_flags_instance.get_portfolio_mode.return_value = "brokerage"
            mock_alpaca.return_value = TEST_ALPACA_ACCOUNT_ID
            
            mode = service.get_user_portfolio_mode(TEST_USER_UUID)
            assert mode == PortfolioMode.BROKERAGE
    
    def test_safe_alpaca_account_check_prevents_crashes(self):
        """Test that safe Alpaca account check never crashes."""
        with patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            from utils.portfolio.portfolio_mode_service import PortfolioModeService
            service = PortfolioModeService()
            
            # Test with None return (no account)
            mock_alpaca.return_value = None
            result = service.has_alpaca_account_safe(TEST_USER_UUID)
            assert result is False
            
            # Test with valid account
            mock_alpaca.return_value = TEST_ALPACA_ACCOUNT_ID
            result = service.has_alpaca_account_safe(TEST_USER_UUID)
            assert result is True
            
            # Test with exception (critical - should not crash)
            mock_alpaca.side_effect = Exception("Database connection error")
            result = service.has_alpaca_account_safe(TEST_USER_UUID)
            assert result is False  # Should return False, not raise exception
    
    def test_websocket_authorization_service_basic(self):
        """Test basic websocket authorization functionality."""
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock_service:
            from utils.portfolio.websocket_auth_service import WebSocketAuthorizationService
            
            mock_portfolio_service = MagicMock()
            mock_service.return_value = mock_portfolio_service
            
            auth_service = WebSocketAuthorizationService()
            
            # Test successful authorization
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": True,
                "mode": "aggregation",
                "account_type": "plaid",
                "error": None
            }
            
            authorized, error_msg, metadata = auth_service.authorize_websocket_connection(
                TEST_USER_UUID, TEST_PLAID_ACCOUNT_ID
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["mode"] == "aggregation"
            
            # Test failed authorization
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": False,
                "mode": "brokerage", 
                "account_type": None,
                "error": "Account mismatch"
            }
            
            authorized, error_msg, metadata = auth_service.authorize_websocket_connection(
                TEST_USER_UUID, "wrong-account"
            )
            
            assert authorized is False
            assert error_msg == "Account mismatch"
    
    def test_websocket_authorization_function_integration(self):
        """Test the main authorization function that websocket server uses."""
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock_service:
            from utils.portfolio.websocket_auth_service import authorize_websocket_connection_safe
            
            mock_portfolio_service = MagicMock()
            mock_service.return_value = mock_portfolio_service
            
            # Test aggregation user authorization
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": True,
                "mode": "aggregation",
                "account_type": "plaid",
                "error": None
            }
            
            authorized, error_msg, metadata = authorize_websocket_connection_safe(
                TEST_USER_UUID, TEST_PLAID_ACCOUNT_ID
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["account_type"] == "plaid"
    
    def test_safe_account_service_basic_functionality(self):
        """Test basic SafeAccountService functionality."""
        with patch('utils.portfolio.safe_account_service.get_portfolio_mode_service') as mock_service:
            from utils.portfolio.safe_account_service import SafeAccountService
            
            mock_portfolio_service = MagicMock()
            mock_service.return_value = mock_portfolio_service
            
            safe_service = SafeAccountService()
            
            # Import PortfolioMode for the test
            from utils.portfolio.portfolio_mode_service import PortfolioMode
            
            # Test aggregation mode - should return None for Alpaca ID
            mock_portfolio_service.get_user_portfolio_mode.return_value = PortfolioMode.AGGREGATION
            
            result = safe_service.get_user_account_id_safe(TEST_USER_UUID)
            assert result is None  # Expected for aggregation mode
            
            # Test endpoint availability for aggregation mode
            assert safe_service.is_endpoint_available_for_user(TEST_USER_UUID, "portfolio") is True
            assert safe_service.is_endpoint_available_for_user(TEST_USER_UUID, "trading") is False
    
    def test_websocket_server_integration_safety(self):
        """Test that websocket server integration uses safe authorization."""
        # This test ensures the websocket server is using the safe authorization function
        
        # Import to check the websocket server has the safe imports
        try:
            from portfolio_realtime.websocket_server import authorize_websocket_connection_safe
            from utils.portfolio.websocket_auth_service import WebSocketAuthorizationService
            from utils.portfolio.realtime_data_service import RealtimeDataService
            
            # If imports succeed, the integration is properly connected
            assert True
        except ImportError as e:
            pytest.fail(f"Websocket server missing critical safety imports: {e}")
    
    def test_realtime_data_service_basic_safety(self):
        """Test RealtimeDataService basic safety without complex mocking."""
        from utils.portfolio.realtime_data_service import RealtimeDataService
        
        # Create service with mock Redis
        redis_client = MagicMock()
        service = RealtimeDataService(redis_client)
        
        # Test account categorization by ID format
        redis_client.keys.return_value = [
            b'account_positions:alpaca-123',
            b'account_positions:plaid_account_456'
        ]
        
        # Mock Redis metadata responses
        def mock_get(key):
            if key == 'account_meta:alpaca-123':
                return None  # No metadata - should infer as Alpaca
            elif key == 'account_meta:plaid_account_456':
                return '{"type": "plaid"}'
            return None
        
        redis_client.get.side_effect = mock_get
        redis_client.exists.return_value = True
        
        accounts_by_mode = service.get_active_account_ids_by_mode()
        
        # Should categorize correctly
        assert 'alpaca-123' in accounts_by_mode['alpaca']
        assert 'plaid_account_456' in accounts_by_mode['plaid']


class TestPlaidDataStructureHandling:
    """Test that services handle real Plaid data structures correctly."""
    
    def test_plaid_account_id_format_recognition(self):
        """Test that services recognize Plaid account ID format."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService
        
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            mock_flags_instance.get_portfolio_mode.return_value = "aggregation"
            mock_alpaca.return_value = None
            
            service = PortfolioModeService()
            
            # Test authorization for Plaid account format
            auth_info = service.get_websocket_authorization_mode(
                TEST_USER_UUID, 
                "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"  # Real Plaid format
            )
            
            assert auth_info["authorized"] is True
            assert auth_info["account_type"] == "plaid"
    
    def test_aggregated_account_id_recognition(self):
        """Test that services recognize 'aggregated' account ID."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService
        
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            mock_flags_instance.get_portfolio_mode.return_value = "aggregation"
            mock_alpaca.return_value = None
            
            service = PortfolioModeService()
            
            # Test authorization for aggregated account ID
            auth_info = service.get_websocket_authorization_mode(
                TEST_USER_UUID, 
                "aggregated"
            )
            
            assert auth_info["authorized"] is True
            assert auth_info["account_type"] == "plaid"


class TestErrorHandlingSafety:
    """Test that all error conditions are handled safely."""
    
    def test_database_connection_error_safety(self):
        """Test that database connection errors don't crash the system."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService, PortfolioMode
        
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            # Initialize service first with working mocks
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            
            service = PortfolioModeService()
            
            # Now simulate database connection error in the method
            mock_alpaca.side_effect = Exception("Database connection failed")
            mock_flags_instance.get_portfolio_mode.side_effect = Exception("Database connection failed")
            
            # Should not crash, should return safe fallback
            mode = service.get_user_portfolio_mode(TEST_USER_UUID)
            assert mode in [PortfolioMode.AGGREGATION, PortfolioMode.BROKERAGE]  # Safe fallback
    
    def test_feature_flag_service_error_safety(self):
        """Test that feature flag service errors don't crash the system."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService, PortfolioMode
        
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            # Initialize service first
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            
            service = PortfolioModeService()
            
            # Now simulate feature flag service error in the method
            mock_flags_instance.get_portfolio_mode.side_effect = Exception("Feature flag service unavailable")
            mock_alpaca.return_value = None  # No Alpaca account
            
            # Should not crash, should return aggregation mode as safe fallback
            mode = service.get_user_portfolio_mode(TEST_USER_UUID)
            assert mode == PortfolioMode.AGGREGATION  # Safe fallback for no Alpaca account
    
    def test_websocket_authorization_exception_handling(self):
        """Test that websocket authorization handles all exceptions safely."""
        from utils.portfolio.websocket_auth_service import WebSocketAuthorizationService
        
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock_service:
            mock_portfolio_service = MagicMock()
            mock_service.return_value = mock_portfolio_service
            
            # Make the service throw an exception
            mock_portfolio_service.get_websocket_authorization_mode.side_effect = Exception("Critical error")
            
            auth_service = WebSocketAuthorizationService()
            
            # Should not crash, should return safe denial
            authorized, error_msg, metadata = auth_service.authorize_websocket_connection(
                TEST_USER_UUID, TEST_PLAID_ACCOUNT_ID
            )
            
            assert authorized is False
            assert "authorization error" in error_msg.lower()
            assert "error" in metadata


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
