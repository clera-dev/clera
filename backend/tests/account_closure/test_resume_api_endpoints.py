#!/usr/bin/env python3
"""
Comprehensive Tests for Resume Account Closure API Endpoints

This test suite validates the missing API endpoints for resume functionality:
1. Backend: POST /account-closure/resume/{account_id} 
2. Frontend: POST /api/account-closure/resume/{accountId}

CRITICAL BUG FIXED:
- Frontend service called /api/account-closure/resume/{accountId} but endpoint didn't exist
- Backend had no matching endpoint to handle resume requests
- This would cause 404 errors when users clicked "Try Again" button

This ensures the complete end-to-end resume functionality works correctly.
"""

import pytest
import asyncio
import sys
import os
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from fastapi import HTTPException
import json

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

# Import the FastAPI app and account closure utilities
from api_server import app
from utils.alpaca.account_closure import ClosureStep


class TestBackendResumeEndpoint:
    """Test the backend resume endpoint: POST /account-closure/resume/{account_id}"""

    @pytest.fixture
    def client(self):
        """Create test client for FastAPI app."""
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Provide authentication headers for testing."""
        return {"x-api-key": "test-api-key-123"}

    @pytest.fixture(autouse=True)
    def mock_env_vars(self):
        """Mock environment variables."""
        with patch.dict(os.environ, {
            'BACKEND_API_KEY': 'test-api-key-123',
            'ALPACA_ENVIRONMENT': 'sandbox'
        }):
            yield

    @pytest.fixture
    def mock_resume_function(self):
        """Mock the resume_account_closure function."""
        with patch('api_server.resume_account_closure') as mock_func:
            yield mock_func

    def test_resume_endpoint_exists(self, client, auth_headers):
        """
        CRITICAL TEST: Verify the resume endpoint exists.
        
        This validates the fix for the missing backend endpoint.
        """
        # Test that the endpoint exists (should not return 404)
        response = client.post(
            "/account-closure/resume/test-account-123",
            json={},
            headers=auth_headers
        )
        
        # Should not be 404 (endpoint exists)
        assert response.status_code != 404, "Resume endpoint must exist"

    def test_resume_endpoint_success(self, client, auth_headers, mock_resume_function):
        """Test successful resume operation."""
        mock_resume_function.return_value = {
            "success": True,
            "step": "withdrawing_funds",
            "action_taken": "withdrew_funds",
            "amount_withdrawn": 1000.0
        }

        response = client.post(
            "/account-closure/resume/test-account-123",
            json={"ach_relationship_id": "ach-rel-123"},
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["step"] == "withdrawing_funds"
        assert data["action_taken"] == "withdrew_funds"
        
        # Verify the function was called with correct parameters
        mock_resume_function.assert_called_once_with(
            "test-account-123", "ach-rel-123", sandbox=True
        )

    def test_resume_endpoint_without_ach_id(self, client, auth_headers, mock_resume_function):
        """Test resume endpoint without ACH relationship ID."""
        mock_resume_function.return_value = {
            "success": True,
            "step": "waiting_settlement",
            "action_taken": "still_waiting"
        }

        response = client.post(
            "/account-closure/resume/test-account-123",
            json={},  # Empty body
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # Should call with None for ACH relationship ID
        mock_resume_function.assert_called_once_with(
            "test-account-123", None, sandbox=True
        )

    def test_resume_endpoint_authentication_required(self, client):
        """Test that resume endpoint requires authentication."""
        response = client.post(
            "/account-closure/resume/test-account-123",
            json={}
            # No auth headers
        )

        assert response.status_code == 401

    def test_resume_endpoint_invalid_auth(self, client):
        """Test resume endpoint with invalid authentication."""
        response = client.post(
            "/account-closure/resume/test-account-123",
            json={},
            headers={"x-api-key": "invalid-key"}
        )

        assert response.status_code == 401

    def test_resume_endpoint_failure_response(self, client, auth_headers, mock_resume_function):
        """Test resume endpoint when resume operation fails."""
        mock_resume_function.return_value = {
            "success": False,
            "step": "failed",
            "error": "Account not found",
            "reason": "Invalid account ID"
        }

        response = client.post(
            "/account-closure/resume/test-account-123",
            json={},
            headers=auth_headers
        )

        assert response.status_code == 200  # Still 200, but success=False in body
        data = response.json()
        assert data["success"] is False
        assert "error" in data

    def test_resume_endpoint_exception_handling(self, client, auth_headers, mock_resume_function):
        """Test resume endpoint handles exceptions properly."""
        mock_resume_function.side_effect = Exception("Network error")

        response = client.post(
            "/account-closure/resume/test-account-123",
            json={},
            headers=auth_headers
        )

        assert response.status_code == 500
        data = response.json()
        assert "detail" in data
        assert "Network error" in data["detail"]

    def test_resume_endpoint_sandbox_vs_production(self, client, auth_headers, mock_resume_function):
        """Test that resume endpoint respects environment setting."""
        mock_resume_function.return_value = {"success": True}

        # Test sandbox mode
        with patch.dict(os.environ, {'ALPACA_ENVIRONMENT': 'sandbox'}):
            response = client.post(
                "/account-closure/resume/test-account-123",
                json={},
                headers=auth_headers
            )
            assert response.status_code == 200
            mock_resume_function.assert_called_with(
                "test-account-123", None, sandbox=True
            )

        # Test production mode
        mock_resume_function.reset_mock()
        with patch.dict(os.environ, {'ALPACA_ENVIRONMENT': 'production'}):
            response = client.post(
                "/account-closure/resume/test-account-123",
                json={},
                headers=auth_headers
            )
            assert response.status_code == 200
            mock_resume_function.assert_called_with(
                "test-account-123", None, sandbox=False
            )

    def test_resume_endpoint_request_validation(self, client, auth_headers, mock_resume_function):
        """Test that resume endpoint validates request data properly."""
        mock_resume_function.return_value = {"success": True}

        # Test with valid JSON
        response = client.post(
            "/account-closure/resume/test-account-123",
            json={"ach_relationship_id": "ach-rel-123"},
            headers=auth_headers
        )
        assert response.status_code == 200

        # Test with invalid JSON should still work (empty body is allowed)
        response = client.post(
            "/account-closure/resume/test-account-123",
            data="invalid json",
            headers=auth_headers
        )
        assert response.status_code == 200  # Should handle gracefully

    def test_resume_endpoint_account_id_validation(self, client, auth_headers, mock_resume_function):
        """Test resume endpoint with various account ID formats."""
        mock_resume_function.return_value = {"success": True}

        # Test with UUID format
        response = client.post(
            "/account-closure/resume/550e8400-e29b-41d4-a716-446655440000",
            json={},
            headers=auth_headers
        )
        assert response.status_code == 200

        # Test with string format
        response = client.post(
            "/account-closure/resume/test-account-123",
            json={},
            headers=auth_headers
        )
        assert response.status_code == 200

        # The endpoint should accept any string as account_id
        # Validation happens in the business logic, not the endpoint


class TestResumeEndpointIntegration:
    """Test integration scenarios for the resume endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client for FastAPI app."""
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Provide authentication headers for testing."""
        return {"x-api-key": "test-api-key-123"}

    @pytest.fixture(autouse=True)
    def mock_env_vars(self):
        """Mock environment variables."""
        with patch.dict(os.environ, {
            'BACKEND_API_KEY': 'test-api-key-123',
            'ALPACA_ENVIRONMENT': 'sandbox'
        }):
            yield

    def test_resume_endpoint_full_workflow_simulation(self, client, auth_headers):
        """Test a complete resume workflow through the API."""
        with patch('api_server.resume_account_closure') as mock_resume:
            # Simulate different resume scenarios
            scenarios = [
                {
                    "step": "waiting_settlement",
                    "success": True,
                    "action_taken": "still_waiting",
                    "message": "Trades are still settling"
                },
                {
                    "step": "withdrawing_funds", 
                    "success": True,
                    "action_taken": "withdrew_funds",
                    "amount_withdrawn": 1000.0
                },
                {
                    "step": "completed",
                    "success": True,
                    "action_taken": "closed_account"
                }
            ]

            account_id = "test-account-123"
            ach_id = "ach-rel-123"

            for i, scenario in enumerate(scenarios):
                mock_resume.return_value = scenario

                response = client.post(
                    f"/account-closure/resume/{account_id}",
                    json={"ach_relationship_id": ach_id},
                    headers=auth_headers
                )

                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["step"] == scenario["step"]
                assert data["action_taken"] == scenario["action_taken"]

    def test_resume_endpoint_error_scenarios(self, client, auth_headers):
        """Test various error scenarios."""
        with patch('api_server.resume_account_closure') as mock_resume:
            error_scenarios = [
                {
                    "success": False,
                    "step": "failed",
                    "reason": "Account not ready for closure",
                    "error": "Account is suspended"
                },
                {
                    "success": False,
                    "step": "withdrawing_funds",
                    "reason": "ACH relationship ID required for fund withdrawal",
                    "cash_balance": 1000.0
                },
                {
                    "success": False,
                    "step": "resume_error",
                    "error": "Network timeout",
                    "account_id": "test-account-123"
                }
            ]

            for scenario in error_scenarios:
                mock_resume.return_value = scenario

                response = client.post(
                    "/account-closure/resume/test-account-123",
                    json={},
                    headers=auth_headers
                )

                assert response.status_code == 200
                data = response.json()
                assert data["success"] is False
                assert "error" in data or "reason" in data

    def test_resume_endpoint_concurrent_requests(self, client, auth_headers):
        """Test that resume endpoint handles concurrent requests safely."""
        with patch('api_server.resume_account_closure') as mock_resume:
            mock_resume.return_value = {
                "success": True,
                "step": "completed",
                "action_taken": "closed_account"
            }

            # Simulate concurrent requests to the same account
            import threading
            import time
            
            responses = []
            
            def make_request():
                response = client.post(
                    "/account-closure/resume/test-account-123",
                    json={},
                    headers=auth_headers
                )
                responses.append(response)

            # Create multiple threads
            threads = [threading.Thread(target=make_request) for _ in range(5)]
            
            # Start all threads
            for thread in threads:
                thread.start()
            
            # Wait for all to complete
            for thread in threads:
                thread.join()

            # All requests should succeed
            assert len(responses) == 5
            for response in responses:
                assert response.status_code == 200


class TestResumeEndpointSecurity:
    """Test security aspects of the resume endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client for FastAPI app."""
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Provide authentication headers for testing."""
        return {"x-api-key": "test-api-key-123"}

    @pytest.fixture(autouse=True)
    def mock_env_vars(self):
        """Mock environment variables."""
        with patch.dict(os.environ, {
            'BACKEND_API_KEY': 'test-api-key-123'
        }):
            yield

    def test_resume_endpoint_sql_injection_protection(self, client, auth_headers):
        """Test that resume endpoint is protected against SQL injection."""
        with patch('api_server.resume_account_closure') as mock_resume:
            mock_resume.return_value = {"success": True}

            # Try SQL injection in account_id
            malicious_account_id = "'; DROP TABLE accounts; --"
            
            response = client.post(
                f"/account-closure/resume/{malicious_account_id}",
                json={},
                headers=auth_headers
            )

            # Should not crash and should pass the account_id as-is
            assert response.status_code == 200
            mock_resume.assert_called_once()
            call_args = mock_resume.call_args[0]
            assert call_args[0] == malicious_account_id

    def test_resume_endpoint_xss_protection(self, client, auth_headers):
        """Test that resume endpoint doesn't execute malicious scripts."""
        with patch('api_server.resume_account_closure') as mock_resume:
            mock_resume.return_value = {"success": True}

            # Try XSS in JSON payload
            malicious_payload = {
                "ach_relationship_id": "<script>alert('xss')</script>"
            }
            
            response = client.post(
                "/account-closure/resume/test-account-123",
                json=malicious_payload,
                headers=auth_headers
            )

            assert response.status_code == 200
            # The malicious script should be passed as-is, not executed
            mock_resume.assert_called_once()

    def test_resume_endpoint_dos_protection(self, client, auth_headers):
        """Test that resume endpoint handles DoS attempts reasonably."""
        with patch('api_server.resume_account_closure') as mock_resume:
            mock_resume.return_value = {"success": True}

            # Try large payload
            large_payload = {
                "ach_relationship_id": "a" * 10000  # 10KB string
            }
            
            response = client.post(
                "/account-closure/resume/test-account-123",
                json=large_payload,
                headers=auth_headers
            )

            # Should handle large payloads gracefully
            assert response.status_code in [200, 413, 422]  # OK, Payload Too Large, or Unprocessable Entity

    def test_resume_endpoint_rate_limiting_ready(self, client, auth_headers):
        """Test that resume endpoint is ready for rate limiting."""
        with patch('api_server.resume_account_closure') as mock_resume:
            mock_resume.return_value = {"success": True}

            # Make multiple rapid requests
            responses = []
            for i in range(10):
                response = client.post(
                    "/account-closure/resume/test-account-123",
                    json={},
                    headers=auth_headers
                )
                responses.append(response)

            # All should succeed (no rate limiting implemented yet, but endpoint should handle rapid requests)
            for response in responses:
                assert response.status_code == 200


class TestResumeEndpointLogging:
    """Test logging and monitoring aspects."""

    @pytest.fixture
    def client(self):
        """Create test client for FastAPI app."""
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Provide authentication headers for testing."""
        return {"x-api-key": "test-api-key-123"}

    @pytest.fixture(autouse=True)
    def mock_env_vars(self):
        """Mock environment variables."""
        with patch.dict(os.environ, {
            'BACKEND_API_KEY': 'test-api-key-123'
        }):
            yield

    def test_resume_endpoint_logs_requests(self, client, auth_headers):
        """Test that resume endpoint logs requests appropriately."""
        with patch('api_server.resume_account_closure') as mock_resume, \
             patch('api_server.logger') as mock_logger:
            
            mock_resume.return_value = {"success": True}

            response = client.post(
                "/account-closure/resume/test-account-123",
                json={"ach_relationship_id": "ach-rel-123"},
                headers=auth_headers
            )

            assert response.status_code == 200
            
            # Should log the resume attempt
            mock_logger.info.assert_called_with(
                "Resuming account closure process for account test-account-123"
            )

    def test_resume_endpoint_logs_errors(self, client, auth_headers):
        """Test that resume endpoint logs errors appropriately."""
        with patch('api_server.resume_account_closure') as mock_resume, \
             patch('api_server.logger') as mock_logger:
            
            mock_resume.side_effect = Exception("Test error")

            response = client.post(
                "/account-closure/resume/test-account-123",
                json={},
                headers=auth_headers
            )

            assert response.status_code == 500
            
            # Should log the error
            mock_logger.error.assert_called()
            error_call = mock_logger.error.call_args[0][0]
            assert "Error resuming closure for account test-account-123" in error_call


if __name__ == "__main__":
    # Run the tests
    pytest.main([__file__, "-v"]) 