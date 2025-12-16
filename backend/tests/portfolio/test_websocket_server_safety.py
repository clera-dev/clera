"""
Tests for websocket server safety with production-grade portfolio mode support.

Tests the modified websocket_server.py to ensure it safely handles different user types
without crashing and maintains proper authorization for all portfolio modes.
"""

import asyncio
import json
import os
import pytest
import websockets
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
import jwt
from datetime import datetime, timedelta

# Add parent directory to path for imports
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.websocket_server import app, verify_token, authorize_websocket_connection_safe


class TestWebSocketServerSafety:
    """Test the websocket server with the new safety layer."""
    
    @pytest.fixture
    def client(self):
        """Create a test client for FastAPI endpoints."""
        return TestClient(app)
    
    @pytest.fixture
    def valid_jwt_token(self):
        """Create a valid JWT token for testing."""
        payload = {
            "sub": "user123",
            "aud": "authenticated",
            "exp": datetime.utcnow() + timedelta(hours=1),
            "iat": datetime.utcnow()
        }
        # Use a test secret - in production this would be the real Supabase JWT secret
        secret = "test-secret-key"
        return jwt.encode(payload, secret, algorithm="HS256")
    
    def test_health_endpoint(self, client):
        """Test that the health endpoint still works after modifications."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "connections" in data
        assert "version" in data
    
    def test_verify_token_valid(self, valid_jwt_token):
        """Test JWT token verification with valid token."""
        with patch('portfolio_realtime.websocket_server.SUPABASE_JWT_SECRET', 'test-secret-key'):
            user_id = verify_token(valid_jwt_token)
            assert user_id == "user123"
    
    def test_verify_token_invalid(self):
        """Test JWT token verification with invalid token."""
        with patch('portfolio_realtime.websocket_server.SUPABASE_JWT_SECRET', 'test-secret-key'):
            user_id = verify_token("invalid-token")
            assert user_id is None
    
    def test_verify_token_expired(self):
        """Test JWT token verification with expired token."""
        expired_payload = {
            "sub": "user123",
            "aud": "authenticated", 
            "exp": datetime.utcnow() - timedelta(hours=1),  # Expired
            "iat": datetime.utcnow() - timedelta(hours=2)
        }
        expired_token = jwt.encode(expired_payload, "test-secret-key", algorithm="HS256")
        
        with patch('portfolio_realtime.websocket_server.SUPABASE_JWT_SECRET', 'test-secret-key'):
            user_id = verify_token(expired_token)
            assert user_id is None
    
    @pytest.mark.asyncio
    async def test_websocket_aggregation_user_authorization(self):
        """Test websocket authorization for aggregation mode user."""
        with patch('portfolio_realtime.websocket_server.authorize_websocket_connection_safe') as mock_auth:
            mock_auth.return_value = (True, None, {
                "mode": "aggregation",
                "account_type": "plaid"
            })
            
            # Test that authorization is successful
            authorized, error_msg, metadata = await asyncio.to_thread(
                authorize_websocket_connection_safe, 
                "user123", 
                "plaid_account_456"
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["mode"] == "aggregation"
            assert metadata["account_type"] == "plaid"
    
    @pytest.mark.asyncio
    async def test_websocket_brokerage_user_authorization(self):
        """Test websocket authorization for brokerage mode user."""
        with patch('portfolio_realtime.websocket_server.authorize_websocket_connection_safe') as mock_auth:
            mock_auth.return_value = (True, None, {
                "mode": "brokerage", 
                "account_type": "alpaca"
            })
            
            # Test that authorization is successful
            authorized, error_msg, metadata = await asyncio.to_thread(
                authorize_websocket_connection_safe,
                "user456", 
                "alpaca-123"
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["mode"] == "brokerage"
            assert metadata["account_type"] == "alpaca"
    
    @pytest.mark.asyncio 
    async def test_websocket_unauthorized_user(self):
        """Test websocket authorization denial for unauthorized user."""
        with patch('portfolio_realtime.websocket_server.authorize_websocket_connection_safe') as mock_auth:
            mock_auth.return_value = (False, "Account mismatch", {
                "authorized": False,
                "error": "Account mismatch"
            })
            
            # Test that authorization is denied
            authorized, error_msg, metadata = await asyncio.to_thread(
                authorize_websocket_connection_safe,
                "user789",
                "wrong-account"
            )
            
            assert authorized is False
            assert error_msg == "Account mismatch"
            assert metadata["authorized"] is False
    
    def test_connection_manager_stats(self, client):
        """Test that connection manager still provides stats correctly."""
        # Import the manager from the server
        from portfolio_realtime.websocket_server import manager
        
        stats = manager.get_connection_stats()
        assert "accounts" in stats
        assert "connections" in stats
        assert "timestamp" in stats
        assert isinstance(stats["accounts"], int)
        assert isinstance(stats["connections"], int)


class TestPeriodicDataRefreshSafety:
    """Test the periodic data refresh with the new safety layer."""
    
    @pytest.fixture
    def mock_realtime_service(self):
        """Mock the RealtimeDataService."""
        with patch('portfolio_realtime.websocket_server.RealtimeDataService') as mock:
            service_instance = mock.return_value
            service_instance.perform_periodic_refresh = AsyncMock(return_value={
                "timestamp": datetime.now().isoformat(),
                "alpaca_refreshed": 2,
                "plaid_refreshed": 1,
                "sector_success": True,
                "errors": [],
                "duration_seconds": 5.5
            })
            service_instance.refresh_sector_data = AsyncMock(return_value=True)
            yield service_instance
    
    @pytest.mark.asyncio
    async def test_periodic_refresh_mixed_accounts(self, mock_realtime_service):
        """Test periodic refresh handles mixed account types safely."""
        from portfolio_realtime.websocket_server import periodic_data_refresh
        
        # Mock redis_client
        with patch('portfolio_realtime.websocket_server.redis_client') as mock_redis:
            mock_redis.get.return_value = None  # No existing sector data
            
            # Create a task for the periodic refresh but cancel it quickly
            refresh_task = asyncio.create_task(periodic_data_refresh(refresh_interval=0.1))
            
            # Let it run for a short time to test initialization
            await asyncio.sleep(0.2)
            refresh_task.cancel()
            
            try:
                await refresh_task
            except asyncio.CancelledError:
                pass
            
            # Verify the service was created and called
            assert mock_realtime_service.perform_periodic_refresh.called
    
    @pytest.mark.asyncio
    async def test_periodic_refresh_handles_errors_gracefully(self, mock_realtime_service):
        """Test periodic refresh handles errors without crashing."""
        # Make the service throw an exception
        mock_realtime_service.perform_periodic_refresh.side_effect = Exception("Test error")
        mock_realtime_service.refresh_sector_data.side_effect = Exception("Sector error")
        
        from portfolio_realtime.websocket_server import periodic_data_refresh
        
        with patch('portfolio_realtime.websocket_server.redis_client') as mock_redis:
            mock_redis.get.return_value = None
            
            # Create a task for the periodic refresh but cancel it quickly
            refresh_task = asyncio.create_task(periodic_data_refresh(refresh_interval=0.1))
            
            # Let it run for a short time
            await asyncio.sleep(0.2)
            refresh_task.cancel()
            
            try:
                await refresh_task
            except asyncio.CancelledError:
                pass
            
            # Should not crash despite the exceptions
            assert True  # If we reach here, no crash occurred


class TestRealPlaidDataStructures:
    """Test that the websocket server handles real Plaid data structures correctly."""
    
    @pytest.fixture
    def sample_plaid_holdings_response(self):
        """Sample Plaid holdings response matching actual API structure."""
        return {
            "accounts": [
                {
                    "account_id": "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp",
                    "balances": {
                        "available": 1230.0,
                        "current": 1230.0,
                        "currency": "USD",
                        "limit": None
                    },
                    "mask": "0000",
                    "name": "Plaid Checking",
                    "official_name": "Plaid Gold Standard 0% Interest Checking",
                    "subtype": "checking",
                    "type": "depository"
                }
            ],
            "holdings": [
                {
                    "account_id": "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp",
                    "cost_basis": 1.0,
                    "institution_price": 1.0,
                    "institution_price_as_of": "2023-01-15",
                    "institution_price_datetime": None,
                    "institution_value": 0.01,
                    "iso_currency_code": "USD",
                    "quantity": 0.01,
                    "security_id": "d6ePmbPxgWCWmMVv66q9iPV94n91vMtov5Are"
                },
                {
                    "account_id": "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp", 
                    "cost_basis": 10.0,
                    "institution_price": 20.0,
                    "institution_price_as_of": "2023-01-15",
                    "institution_price_datetime": None,
                    "institution_value": 200.0,
                    "iso_currency_code": "USD",
                    "quantity": 10.0,
                    "security_id": "KDwjlXj1rAHoMqjpvpPyUGWdXzJ8zxCQZAoJM"
                }
            ],
            "securities": [
                {
                    "close_price": 0.01,
                    "close_price_as_of": "2023-01-14",
                    "cusip": None,
                    "institution_id": None,
                    "institution_security_id": None,
                    "isin": None,
                    "name": "U S Dollar",
                    "proxy_security_id": None,
                    "security_id": "d6ePmbPxgWCWmMVv66q9iPV94n91vMtov5Are",
                    "sedol": None,
                    "ticker_symbol": "USD",
                    "type": "cash",
                    "unofficial_currency_code": None,
                    "update_datetime": None
                },
                {
                    "close_price": 20.0,
                    "close_price_as_of": "2023-01-14", 
                    "cusip": "037833100",
                    "institution_id": None,
                    "institution_security_id": None,
                    "isin": "US0378331005",
                    "name": "Apple Inc.",
                    "proxy_security_id": None,
                    "security_id": "KDwjlXj1rAHoMqjpvpPyUGWdXzJ8zxCQZAoJM",
                    "sedol": None,
                    "ticker_symbol": "AAPL",
                    "type": "equity",
                    "unofficial_currency_code": None,
                    "update_datetime": None
                }
            ],
            "total_investment_transactions": 0,
            "item": {
                "available_products": ["investments"],
                "billed_products": ["investments"],
                "consent_expiration_time": None,
                "error": None,
                "institution_id": "ins_109508",
                "item_id": "eVBnVMp7zdTJLkRNr33ytDrglEBM77iZkpM6B",
                "update_type": "background",
                "webhook": ""
            },
            "request_id": "bkVE1BHWMAZ9Rnr"
        }
    
    def test_realtime_service_processes_plaid_data(self, sample_plaid_holdings_response):
        """Test that RealtimeDataService can process real Plaid data structures."""
        from utils.portfolio.realtime_data_service import RealtimeDataService
        
        redis_client = MagicMock()
        service = RealtimeDataService(redis_client)
        
        # Mock Redis to simulate having Plaid account data
        plaid_account_id = "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"
        redis_client.keys.return_value = [f"account_positions:{plaid_account_id}".encode()]
        redis_client.get.return_value = json.dumps({
            "type": "plaid",
            "holdings": sample_plaid_holdings_response["holdings"],
            "securities": sample_plaid_holdings_response["securities"]
        })
        
        accounts_by_mode = service.get_active_account_ids_by_mode()
        
        # Should categorize as Plaid account
        assert plaid_account_id in accounts_by_mode["plaid"]
        assert len(accounts_by_mode["alpaca"]) == 0
    
    def test_websocket_auth_handles_plaid_account_ids(self, sample_plaid_holdings_response):
        """Test websocket authorization with real Plaid account ID format."""
        from utils.portfolio.websocket_auth_service import authorize_websocket_connection_safe
        
        plaid_account_id = "plaid_BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp"
        
        with patch('utils.portfolio.websocket_auth_service.get_portfolio_mode_service') as mock_service:
            mock_portfolio_service = mock_service.return_value
            mock_portfolio_service.get_websocket_authorization_mode.return_value = {
                "authorized": True,
                "mode": "aggregation", 
                "account_type": "plaid",
                "error": None
            }
            
            authorized, error_msg, metadata = authorize_websocket_connection_safe(
                "user123",
                plaid_account_id
            )
            
            assert authorized is True
            assert error_msg is None
            assert metadata["account_type"] == "plaid"
    
    def test_portfolio_aggregation_with_real_data_structure(self, sample_plaid_holdings_response):
        """Test portfolio aggregation logic with real Plaid data structures."""
        # This simulates how the portfolio service would process real Plaid data
        holdings = sample_plaid_holdings_response["holdings"]
        securities = sample_plaid_holdings_response["securities"]
        
        # Create a mapping of security_id to security info
        securities_map = {sec["security_id"]: sec for sec in securities}
        
        processed_positions = []
        for holding in holdings:
            security = securities_map.get(holding["security_id"])
            if security:
                position = {
                    "symbol": security["ticker_symbol"],
                    "quantity": holding["quantity"],
                    "market_value": holding["institution_value"],
                    "cost_basis": holding["cost_basis"],
                    "security_type": security["type"],
                    "security_name": security["name"],
                    "account_id": holding["account_id"]
                }
                processed_positions.append(position)
        
        # Should have processed both USD cash and AAPL positions
        assert len(processed_positions) == 2
        
        # Check AAPL position
        aapl_position = next(p for p in processed_positions if p["symbol"] == "AAPL")
        assert aapl_position["quantity"] == 10.0
        assert aapl_position["market_value"] == 200.0
        assert aapl_position["security_type"] == "equity"
        assert aapl_position["security_name"] == "Apple Inc."
        
        # Check USD cash position
        usd_position = next(p for p in processed_positions if p["symbol"] == "USD")
        assert usd_position["quantity"] == 0.01
        assert usd_position["security_type"] == "cash"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
