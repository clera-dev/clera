"""
Tests for Plaid data integration with the websocket safety system.

Tests that the new safety services correctly handle real Plaid data structures
and account formats that come from the Plaid API.
"""

import os
import sys
import pytest
import json
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Real Plaid data structures based on API documentation and our test data
REAL_PLAID_HOLDINGS_RESPONSE = {
    "accounts": [
        {
            "account_id": "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp",
            "balances": {
                "available": 1230.0,
                "current": 1230.0,
                "currency": "USD"
            },
            "mask": "0000",
            "name": "Plaid IRA",
            "official_name": "Plaid Gold Standard IRA",
            "subtype": "ira",
            "type": "investment"
        }
    ],
    "holdings": [
        {
            "account_id": "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp",
            "cost_basis": 40.0,
            "institution_price": 42.15,
            "institution_value": 210.75,
            "quantity": 5.0,
            "security_id": "EWZ_security_id"
        },
        {
            "account_id": "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp",
            "cost_basis": 16.0,
            "institution_price": 20.0,
            "institution_value": 430.0,
            "quantity": 21.5,
            "security_id": "TRP_security_id"
        }
    ],
    "securities": [
        {
            "security_id": "EWZ_security_id",
            "name": "iShares Inc MSCI Brazil",
            "ticker_symbol": "EWZ",
            "type": "etf",
            "close_price": 42.15
        },
        {
            "security_id": "TRP_security_id", 
            "name": "Trp Equity Income",
            "ticker_symbol": "Trp Equity Income",
            "type": "mutual fund",
            "close_price": 20.0
        }
    ]
}

# Our aggregated format (what comes from portfolio service)
AGGREGATED_PORTFOLIO_DATA = {
    "positions": [
        {
            "symbol": "EWZ",
            "security_name": "iShares Inc MSCI Brazil",
            "security_type": "etf",
            "total_quantity": 5.0,
            "total_market_value": 210.75,
            "total_cost_basis": 40.0,
            "average_cost_basis": 8.0,
            "unrealized_gain_loss": 170.75,
            "unrealized_gain_loss_percent": 426.875,
            "accounts": [
                {
                    "account_id": "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp",
                    "quantity": 5.0,
                    "market_value": 210.75,
                    "cost_basis": 40.0,
                    "institution": "Charles Schwab"
                }
            ],
            "institutions": ["Charles Schwab"]
        }
    ],
    "metadata": {
        "last_updated": "2025-09-16T22:39:57.42558+00:00",
        "total_accounts": 1,
        "total_positions": 1
    }
}

class TestPlaidDataIntegration:
    """Test integration with real Plaid data structures."""
    
    def test_websocket_authorization_with_real_plaid_account_id(self):
        """Test websocket authorization with real Plaid account ID format."""
        from utils.portfolio.websocket_auth_service import authorize_websocket_connection_safe
        
        real_plaid_account_id = "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"
        user_id = "550e8400-e29b-41d4-a716-446655440000"
        
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock_service:
            mock_portfolio_service = mock_service.return_value
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": True,
                "mode": "aggregation",
                "account_type": "plaid",
                "error": None
            }
            
            authorized, error_msg, metadata = authorize_websocket_connection_safe(
                user_id, real_plaid_account_id
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["account_type"] == "plaid"
            assert metadata["mode"] == "aggregation"
    
    def test_realtime_service_categorizes_plaid_accounts_correctly(self):
        """Test that RealtimeDataService correctly categorizes Plaid accounts."""
        from utils.portfolio.realtime_data_service import RealtimeDataService
        
        redis_client = MagicMock()
        service = RealtimeDataService(redis_client)
        
        # Mock Redis to return real Plaid account structure
        real_plaid_account_id = "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"
        redis_client.keys.return_value = [f"account_positions:{real_plaid_account_id}".encode()]
        
        # Mock account metadata
        redis_client.get.return_value = json.dumps({
            "type": "plaid",
            "institution_name": "Charles Schwab",
            "last_updated": "2025-09-16T22:39:57.42558+00:00"
        })
        
        accounts_by_mode = service.get_active_account_ids_by_mode()
        
        assert real_plaid_account_id in accounts_by_mode["plaid"]
        assert len(accounts_by_mode["alpaca"]) == 0
        assert len(accounts_by_mode["unknown"]) == 0
    
    def test_realtime_service_handles_mixed_accounts(self):
        """Test RealtimeDataService with mixed Alpaca and Plaid accounts."""
        from utils.portfolio.realtime_data_service import RealtimeDataService
        
        redis_client = MagicMock()
        service = RealtimeDataService(redis_client)
        
        # Mock Redis with mixed account types
        alpaca_account = "alpaca-account-123"
        plaid_account = "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"
        
        redis_client.keys.return_value = [
            f"account_positions:{alpaca_account}".encode(),
            f"account_positions:{plaid_account}".encode()
        ]
        
        # Mock metadata responses
        def mock_get(key):
            if key == f"account_meta:{alpaca_account}":
                return json.dumps({"type": "alpaca"})
            elif key == f"account_meta:{plaid_account}":
                return json.dumps({"type": "plaid"})
            return None
        
        redis_client.get.side_effect = mock_get
        
        accounts_by_mode = service.get_active_account_ids_by_mode()
        
        assert alpaca_account in accounts_by_mode["alpaca"]
        assert plaid_account in accounts_by_mode["plaid"]
        assert len(accounts_by_mode["unknown"]) == 0
    
    @pytest.mark.asyncio
    async def test_realtime_service_refresh_plaid_accounts(self):
        """Test that Plaid account refresh works correctly."""
        from utils.portfolio.realtime_data_service import RealtimeDataService
        
        redis_client = MagicMock()
        service = RealtimeDataService(redis_client)
        
        # Mock Redis to show Plaid account exists
        redis_client.exists.return_value = True
        
        plaid_accounts = ["plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"]
        result = await service.refresh_plaid_accounts(plaid_accounts)
        
        assert result == 1  # Should process 1 account
        redis_client.exists.assert_called_with("account_positions:plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp")


class TestPortfolioModeServiceWithRealData:
    """Test PortfolioModeService with real user scenarios."""
    
    def test_aggregation_user_workflow(self):
        """Test complete workflow for an aggregation-only user."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService, PortfolioMode
        
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            # Setup for aggregation mode user
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            mock_flags_instance.get_portfolio_mode.return_value = "aggregation"
            mock_alpaca.return_value = None  # No Alpaca account
            
            service = PortfolioModeService()
            user_id = "550e8400-e29b-41d4-a716-446655440000"
            
            # Test mode detection
            mode = service.get_user_portfolio_mode(user_id)
            assert mode == PortfolioMode.AGGREGATION
            
            # Test data sources
            sources = service.get_portfolio_data_sources(user_id)
            assert sources == ["plaid"]
            
            # Test Alpaca account check
            has_alpaca = service.has_alpaca_account_safe(user_id)
            assert has_alpaca is False
            
            # Test websocket authorization for Plaid account
            auth_info = service.get_websocket_authorization_mode(
                user_id, "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"
            )
            assert auth_info["authorized"] is True
            assert auth_info["account_type"] == "plaid"
    
    def test_brokerage_user_workflow(self):
        """Test complete workflow for a brokerage user."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService, PortfolioMode
        
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            # Setup for brokerage mode user
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            mock_flags_instance.get_portfolio_mode.return_value = "brokerage"
            mock_alpaca.return_value = "alpaca-account-123"  # Has Alpaca account
            
            service = PortfolioModeService()
            user_id = "550e8400-e29b-41d4-a716-446655440001"
            
            # Test mode detection
            mode = service.get_user_portfolio_mode(user_id)
            assert mode == PortfolioMode.BROKERAGE
            
            # Test data sources
            sources = service.get_portfolio_data_sources(user_id)
            assert sources == ["alpaca"]
            
            # Test Alpaca account check
            has_alpaca = service.has_alpaca_account_safe(user_id)
            assert has_alpaca is True
            
            # Test websocket authorization for Alpaca account
            auth_info = service.get_websocket_authorization_mode(
                user_id, "alpaca-account-123"
            )
            assert auth_info["authorized"] is True
            assert auth_info["account_type"] == "alpaca"


class TestWebSocketServerIntegrationWithRealData:
    """Test websocket server integration with real data scenarios."""
    
    def test_websocket_server_has_safe_imports(self):
        """Verify websocket server imported all safety components."""
        try:
            # Import websocket server module
            from portfolio_realtime.websocket_server import (
                authorize_websocket_connection_safe,
                RealtimeDataService,
                verify_token
            )
            
            # All imports should succeed
            assert True
            
        except ImportError as e:
            pytest.fail(f"Websocket server missing critical safety imports: {e}")
    
    def test_aggregation_user_websocket_flow_simulation(self):
        """Simulate the complete websocket flow for an aggregation user."""
        from utils.portfolio.websocket_auth_service import authorize_websocket_connection_safe
        
        # Mock the portfolio mode service to return aggregation mode
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock_service:
            mock_portfolio_service = mock_service.return_value
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": True,
                "mode": "aggregation",
                "account_type": "plaid",
                "error": None
            }
            
            user_id = "550e8400-e29b-41d4-a716-446655440000"
            plaid_account_id = "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"
            
            # This is what the websocket server would call
            authorized, error_msg, metadata = authorize_websocket_connection_safe(
                user_id, plaid_account_id
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["mode"] == "aggregation"
            assert metadata["account_type"] == "plaid"
            
            # Verify the service was called with correct parameters
            mock_portfolio_service.get_websocket_authorization_mode.assert_called_once_with(
                user_id, plaid_account_id
            )
    
    def test_brokerage_user_websocket_flow_simulation(self):
        """Simulate the complete websocket flow for a brokerage user."""
        from utils.portfolio.websocket_auth_service import authorize_websocket_connection_safe
        
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock_service:
            mock_portfolio_service = mock_service.return_value
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": True,
                "mode": "brokerage",
                "account_type": "alpaca",
                "error": None
            }
            
            user_id = "550e8400-e29b-41d4-a716-446655440001"
            alpaca_account_id = "alpaca-account-123"
            
            authorized, error_msg, metadata = authorize_websocket_connection_safe(
                user_id, alpaca_account_id
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["mode"] == "brokerage"
            assert metadata["account_type"] == "alpaca"


class TestDataStructureCompatibility:
    """Test compatibility with actual data structures from our system."""
    
    def test_realtime_service_redis_data_format(self):
        """Test RealtimeDataService with our actual Redis data format."""
        from utils.portfolio.realtime_data_service import RealtimeDataService
        
        redis_client = MagicMock()
        service = RealtimeDataService(redis_client)
        
        # Mock our actual Redis data structure
        user_aggregated_holdings_data = {
            "id": "0fab7135-7372-48b7-b1b5-6c1aab6f5041",
            "user_id": "10e48255-5a2b-492f-8545-0a745be37757",
            "symbol": "EWZ",
            "security_name": "iShares Inc MSCI Brazil",
            "security_type": "etf",
            "total_quantity": 5.0,
            "total_market_value": 210.75,
            "total_cost_basis": 40.0,
            "data_source": "plaid"
        }
        
        # Simulate Redis account detection
        redis_client.keys.return_value = [b"account_positions:plaid_account_123"]
        redis_client.get.return_value = json.dumps({
            "type": "plaid",
            "holdings": [user_aggregated_holdings_data]
        })
        
        accounts_by_mode = service.get_active_account_ids_by_mode()
        
        assert "plaid_account_123" in accounts_by_mode["plaid"]
        assert len(accounts_by_mode["alpaca"]) == 0
    
    def test_portfolio_mode_service_with_feature_flag_values(self):
        """Test PortfolioModeService with actual feature flag values."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService, PortfolioMode
        
        with patch('utils.portfolio.portfolio_mode_service.get_feature_flags') as mock_flags, \
             patch('utils.portfolio.portfolio_mode_service.get_user_alpaca_account_id') as mock_alpaca:
            
            mock_flags_instance = MagicMock()
            mock_flags.return_value = mock_flags_instance
            
            service = PortfolioModeService()
            user_id = "550e8400-e29b-41d4-a716-446655440000"
            
            # Test with actual environment variable values
            test_scenarios = [
                ("aggregation", None, PortfolioMode.AGGREGATION),
                ("brokerage", "alpaca-123", PortfolioMode.BROKERAGE),
                ("hybrid", "alpaca-123", PortfolioMode.HYBRID),
                ("disabled", None, PortfolioMode.DISABLED)
            ]
            
            for flag_value, alpaca_id, expected_mode in test_scenarios:
                mock_flags_instance.get_portfolio_mode.return_value = flag_value
                mock_alpaca.return_value = alpaca_id
                
                mode = service.get_user_portfolio_mode(user_id)
                assert mode == expected_mode, f"Failed for flag_value={flag_value}, alpaca_id={alpaca_id}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
