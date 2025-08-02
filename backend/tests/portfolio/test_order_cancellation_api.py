#!/usr/bin/env python3
"""
Production-Grade API Endpoint Tests for Order Cancellation

This test suite validates the FastAPI endpoint for order cancellation,
ensuring proper request/response handling, error conditions, and security.

TESTED ENDPOINT:
- DELETE /api/portfolio/{account_id}/orders/{order_id}
"""

import pytest
import sys
import os
import uuid
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import HTTPException
import requests
import json

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import the FastAPI app
from api_server import app

class TestOrderCancellationEndpoint:
    """Test suite for order cancellation FastAPI endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client for FastAPI app."""
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Provide authentication headers for testing."""
        return {
            "x-api-key": "test-api-key-123",
            "Authorization": "Bearer test-jwt-token"
        }

    @pytest.fixture(autouse=True)
    def mock_env_vars(self):
        """Mock environment variables."""
        with patch.dict(os.environ, {
            'BACKEND_API_KEY': 'test-api-key-123',
            'SUPABASE_JWT_SECRET': 'test-jwt-secret'
        }):
            yield

    @pytest.fixture
    def sample_account_id(self):
        """Provide a sample UUID account ID."""
        return str(uuid.uuid4())

    @pytest.fixture
    def sample_order_id(self):
        """Provide a sample UUID order ID."""
        return str(uuid.uuid4())

    @pytest.fixture
    def mock_broker_client(self):
        """Mock the Alpaca broker client."""
        with patch('api_server.get_broker_client') as mock_client_dep:
            mock_client = Mock()
            mock_client_dep.return_value = mock_client
            yield mock_client

    @pytest.fixture
    def mock_authentication(self):
        """Mock the authentication system."""
        with patch('api_server.get_authenticated_user_id') as mock_auth:
            mock_auth.return_value = "test-user-123"
            yield mock_auth

    @pytest.fixture
    def mock_account_ownership(self):
        """Mock the account ownership verification."""
        with patch('api_server.verify_account_ownership') as mock_ownership:
            mock_ownership.return_value = "test-user-123"
            yield mock_ownership

    def test_cancel_order_endpoint_exists(self, client, auth_headers, sample_account_id, sample_order_id):
        """Test that the cancel order endpoint exists."""
        with patch('api_server.get_broker_client'), \
             patch('api_server.get_authenticated_user_id'), \
             patch('api_server.verify_account_ownership'):
            
            response = client.delete(
                f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
                headers=auth_headers
            )
            
            # Should not be 404 (endpoint exists)
            assert response.status_code != 404, "Cancel order endpoint must exist"

    def test_cancel_order_success(
        self, 
        client, 
        auth_headers, 
        sample_account_id, 
        sample_order_id,
        mock_broker_client,
        mock_authentication,
        mock_account_ownership
    ):
        """Test successful order cancellation."""
        # Mock successful cancellation (returns None as per Alpaca API)
        mock_broker_client.cancel_order_for_account_by_id.return_value = None
        
        response = client.delete(
            f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert "successfully cancelled" in data["message"].lower()
        assert data["order_id"] == sample_order_id
        assert data["account_id"] == sample_account_id
        
        # Verify the broker client was called correctly
        mock_broker_client.cancel_order_for_account_by_id.assert_called_once_with(
            account_id=sample_account_id,
            order_id=sample_order_id
        )

    def test_cancel_order_invalid_account_id_format(self, client, auth_headers, sample_order_id):
        """Test cancellation with invalid account ID format."""
        invalid_account_id = "not-a-uuid"
        
        with patch('api_server.get_authenticated_user_id'):
            response = client.delete(
                f"/api/portfolio/{invalid_account_id}/orders/{sample_order_id}",
                headers=auth_headers
            )
            
            assert response.status_code == 400
            data = response.json()
            assert "Invalid account_id format" in data["detail"]

    def test_cancel_order_invalid_order_id_format(self, client, auth_headers, sample_account_id):
        """Test cancellation with invalid order ID format."""
        invalid_order_id = "not-a-uuid"
        
        with patch('api_server.get_authenticated_user_id'):
            response = client.delete(
                f"/api/portfolio/{sample_account_id}/orders/{invalid_order_id}",
                headers=auth_headers
            )
            
            assert response.status_code == 400
            data = response.json()
            assert "Invalid order_id format" in data["detail"]

    def test_cancel_order_unauthorized_no_api_key(self, client, sample_account_id, sample_order_id):
        """Test cancellation without API key."""
        response = client.delete(
            f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
            headers={"Authorization": "Bearer test-token"}  # Missing API key
        )
        
        assert response.status_code == 401
        data = response.json()
        assert "Authentication required" in data["detail"]

    def test_cancel_order_unauthorized_no_jwt_token(self, client, sample_account_id, sample_order_id):
        """Test cancellation without JWT token."""
        with patch.dict(os.environ, {'BACKEND_API_KEY': 'test-api-key-123'}):
            response = client.delete(
                f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
                headers={"x-api-key": "test-api-key-123"}  # Missing JWT token
            )
            
            assert response.status_code == 401
            data = response.json()
            assert "valid JWT token required" in data["detail"].lower()

    def test_cancel_order_account_ownership_denied(
        self, 
        client, 
        auth_headers, 
        sample_account_id, 
        sample_order_id,
        mock_authentication
    ):
        """Test cancellation when user doesn't own the account."""
        with patch('api_server.verify_account_ownership') as mock_ownership:
            mock_ownership.side_effect = HTTPException(status_code=403, detail="Unauthorized access to account")
            
            response = client.delete(
                f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
                headers=auth_headers
            )
            
            assert response.status_code == 403
            data = response.json()
            assert "Unauthorized access to account" in data["detail"]

    def test_cancel_order_not_found(
        self, 
        client, 
        auth_headers, 
        sample_account_id, 
        sample_order_id,
        mock_broker_client,
        mock_authentication,
        mock_account_ownership
    ):
        """Test cancellation when order is not found."""
        # Mock Alpaca API 404 error
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.text = "Order not found"
        
        mock_broker_client.cancel_order_for_account_by_id.side_effect = requests.exceptions.HTTPError(response=mock_response)
        
        response = client.delete(
            f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert "Order not found or already processed" in data["detail"]

    def test_cancel_order_cannot_be_cancelled(
        self, 
        client, 
        auth_headers, 
        sample_account_id, 
        sample_order_id,
        mock_broker_client,
        mock_authentication,
        mock_account_ownership
    ):
        """Test cancellation when order cannot be cancelled (filled/already cancelled)."""
        # Mock Alpaca API 422 error
        mock_response = Mock()
        mock_response.status_code = 422
        mock_response.text = "Order is filled and cannot be cancelled"
        
        mock_broker_client.cancel_order_for_account_by_id.side_effect = requests.exceptions.HTTPError(response=mock_response)
        
        response = client.delete(
            f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 422
        data = response.json()
        assert "Order cannot be cancelled" in data["detail"]

    def test_cancel_order_alpaca_server_error(
        self, 
        client, 
        auth_headers, 
        sample_account_id, 
        sample_order_id,
        mock_broker_client,
        mock_authentication,
        mock_account_ownership
    ):
        """Test cancellation when Alpaca API returns server error."""
        # Mock Alpaca API 500 error
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        
        mock_broker_client.cancel_order_for_account_by_id.side_effect = requests.exceptions.HTTPError(response=mock_response)
        
        response = client.delete(
            f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 500
        data = response.json()
        assert "Alpaca error" in data["detail"]

    def test_cancel_order_unexpected_error(
        self, 
        client, 
        auth_headers, 
        sample_account_id, 
        sample_order_id,
        mock_broker_client,
        mock_authentication,
        mock_account_ownership
    ):
        """Test cancellation when unexpected error occurs."""
        # Mock unexpected exception
        mock_broker_client.cancel_order_for_account_by_id.side_effect = Exception("Unexpected error")
        
        response = client.delete(
            f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 500
        data = response.json()
        assert "Internal server error cancelling order" in data["detail"]

    def test_cancel_order_security_validation(
        self, 
        client, 
        auth_headers, 
        sample_account_id, 
        sample_order_id,
        mock_broker_client,
        mock_authentication,
        mock_account_ownership
    ):
        """Test that all security validations are performed in correct order."""
        mock_broker_client.cancel_order_for_account_by_id.return_value = None
        
        response = client.delete(
            f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
            headers=auth_headers
        )
        
        # Verify authentication was called
        mock_authentication.assert_called_once()
        
        # Verify account ownership was verified
        mock_account_ownership.assert_called_once_with(sample_account_id, "test-user-123")
        
        # Verify broker client was called only after security checks
        mock_broker_client.cancel_order_for_account_by_id.assert_called_once()
        
        assert response.status_code == 200

class TestOrderCancellationSecurity:
    """Security-focused tests for order cancellation endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client for FastAPI app."""
        return TestClient(app)

    def test_cancel_order_requires_api_key(self, client):
        """Test that order cancellation requires valid API key."""
        sample_account_id = str(uuid.uuid4())
        sample_order_id = str(uuid.uuid4())
        
        response = client.delete(f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}")
        assert response.status_code == 401

    def test_cancel_order_with_invalid_api_key(self, client):
        """Test order cancellation with invalid API key."""
        sample_account_id = str(uuid.uuid4())
        sample_order_id = str(uuid.uuid4())
        
        with patch.dict(os.environ, {'BACKEND_API_KEY': 'correct-key'}):
            response = client.delete(
                f"/api/portfolio/{sample_account_id}/orders/{sample_order_id}",
                headers={"x-api-key": "invalid-key"}
            )
            assert response.status_code == 401

    def test_cancel_order_prevents_cross_account_access(self, client):
        """Test that users cannot cancel orders from other accounts."""
        user_account_id = str(uuid.uuid4())
        other_account_id = str(uuid.uuid4())
        sample_order_id = str(uuid.uuid4())
        
        with patch.dict(os.environ, {'BACKEND_API_KEY': 'test-key'}), \
             patch('api_server.get_authenticated_user_id') as mock_auth, \
             patch('api_server.verify_account_ownership') as mock_ownership:
            
            mock_auth.return_value = "test-user-123"
            mock_ownership.side_effect = HTTPException(status_code=403, detail="Unauthorized access to account")
            
            response = client.delete(
                f"/api/portfolio/{other_account_id}/orders/{sample_order_id}",
                headers={
                    "x-api-key": "test-key",
                    "Authorization": "Bearer test-token"
                }
            )
            
            assert response.status_code == 403
            data = response.json()
            assert "Unauthorized access to account" in data["detail"]

if __name__ == "__main__":
    # Allow running the test file directly
    pytest.main([__file__, "-v"])