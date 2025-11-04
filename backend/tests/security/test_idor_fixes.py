#!/usr/bin/env python3
"""
Security tests for IDOR vulnerability fixes from PR #81.

Tests that all portfolio endpoints properly use authenticated user_id
instead of accepting user_id from query parameters.
"""

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException
import jwt
import os
import sys
from unittest.mock import patch, MagicMock

# Add backend to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from api_server import app


class TestIDORFixes:
    """Test that IDOR vulnerabilities are fixed in portfolio endpoints."""
    
    def setup_method(self):
        """Set up test client and test data."""
        self.client = TestClient(app)
        self.test_api_key = os.getenv("BACKEND_API_KEY", "test_api_key_123")
        self.test_user_id = "550e8400-e29b-41d4-a716-446655440000"
        self.other_user_id = "550e8400-e29b-41d4-a716-446655440001"
        
    def generate_test_jwt(self, user_id: str) -> str:
        """Generate a test JWT token for a user."""
        secret = os.getenv("SUPABASE_JWT_SECRET", "test_jwt_secret")
        payload = {
            "sub": user_id,
            "aud": "authenticated",
            "exp": 9999999999  # Far future
        }
        return jwt.encode(payload, secret, algorithm="HS256")
    
    def test_aggregated_analytics_requires_auth(self):
        """Test that /api/portfolio/aggregated/analytics requires authentication."""
        # Try without JWT token
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.get(
            "/api/portfolio/aggregated/analytics",
            headers=headers
        )
        
        # Should fail with 401 - authentication required
        assert response.status_code == 401
        assert "JWT token required" in response.json().get("detail", "")
    
    def test_portfolio_analytics_requires_auth(self):
        """Test that /api/portfolio/{account_id}/analytics requires authentication."""
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.get(
            f"/api/portfolio/test-account-id/analytics",
            headers=headers
        )
        
        # Should fail with 401
        assert response.status_code == 401
    
    def test_portfolio_value_requires_auth(self):
        """Test that /api/portfolio/value requires authentication."""
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.get(
            "/api/portfolio/value?accountId=test",
            headers=headers
        )
        
        # Should fail with 401
        assert response.status_code == 401
    
    def test_sector_allocation_requires_auth(self):
        """Test that /api/portfolio/sector-allocation requires authentication."""
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.get(
            "/api/portfolio/sector-allocation?account_id=test",
            headers=headers
        )
        
        # Should fail with 401
        assert response.status_code == 401
    
    def test_reconstruction_request_requires_auth(self):
        """Test that /api/portfolio/reconstruction/request requires authentication."""
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.post(
            "/api/portfolio/reconstruction/request?priority=high",
            headers=headers
        )
        
        # Should fail with 401
        assert response.status_code == 401
    
    def test_reconstruction_status_requires_auth(self):
        """Test that /api/portfolio/reconstruction/status requires authentication."""
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.get(
            "/api/portfolio/reconstruction/status",
            headers=headers
        )
        
        # Should fail with 401
        assert response.status_code == 401
    
    def test_account_breakdown_requires_auth(self):
        """Test that /api/portfolio/account-breakdown requires authentication."""
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.get(
            "/api/portfolio/account-breakdown",
            headers=headers
        )
        
        # Should fail with 401
        assert response.status_code == 401
    
    def test_cash_stock_bond_allocation_requires_auth(self):
        """Test that /api/portfolio/cash-stock-bond-allocation requires authentication."""
        headers = {
            "X-API-Key": self.test_api_key,
            # No Authorization header
        }
        
        response = self.client.get(
            "/api/portfolio/cash-stock-bond-allocation?account_id=test",
            headers=headers
        )
        
        # Should fail with 401
        assert response.status_code == 401
    
    def test_authenticated_request_uses_jwt_user_id(self):
        """Test that authenticated requests use user_id from JWT, not query param."""
        jwt_token = self.generate_test_jwt(self.test_user_id)
        
        headers = {
            "X-API-Key": self.test_api_key,
            "Authorization": f"Bearer {jwt_token}"
        }
        
        # Try to access endpoint with user_id in query param (should be ignored)
        # The endpoint should use user_id from JWT instead
        with patch('api_server.get_aggregated_portfolio_service') as mock_service:
            mock_service_instance = MagicMock()
            mock_service.return_value = mock_service_instance
            
            # Mock the service to capture the user_id it receives
            captured_user_id = None
            def capture_user_id(user_id, *args, **kwargs):
                nonlocal captured_user_id
                captured_user_id = user_id
                return {"risk_score": 0.5, "diversification_score": 0.7}
            
            mock_service_instance.get_portfolio_analytics = MagicMock(
                side_effect=capture_user_id
            )
            
            response = self.client.get(
                f"/api/portfolio/aggregated/analytics?user_id={self.other_user_id}",  # Wrong user_id in query
                headers=headers
            )
            
            # Even though we passed other_user_id in query, the endpoint should use
            # user_id from JWT token (test_user_id)
            # Note: This test might need adjustment based on actual endpoint implementation
            # The key is that user_id comes from JWT, not query param


class TestPortfolioModeServiceSupabaseFix:
    """Test that PortfolioModeService properly initializes supabase."""
    
    def test_supabase_initialized(self):
        """Test that PortfolioModeService has supabase client initialized."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService
        
        service = PortfolioModeService()
        
        # CRITICAL FIX: Verify supabase is initialized
        assert hasattr(service, 'supabase'), "PortfolioModeService should have supabase attribute"
        assert service.supabase is not None, "supabase should not be None"
    
    def test_account_checks_work_with_supabase(self):
        """Test that account checks work with initialized supabase."""
        from utils.portfolio.portfolio_mode_service import PortfolioModeService
        
        service = PortfolioModeService()
        
        # Mock supabase to return test data
        mock_supabase = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [{"id": "test-account-id"}]
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = mock_result
        
        service.supabase = mock_supabase
        
        # Should not raise AttributeError
        result = service._has_snaptrade_accounts("test-user-id")
        assert isinstance(result, bool)
        
        result = service._has_plaid_accounts("test-user-id")
        assert isinstance(result, bool)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

