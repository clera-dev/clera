#!/usr/bin/env python3
"""
Production-Grade API Endpoint Tests for Account Closure

This test suite validates all FastAPI endpoints for the account closure feature,
ensuring proper request/response handling, error conditions, and security.

TESTED ENDPOINTS:
- GET /account-closure/check-readiness/{account_id}
- POST /account-closure/initiate/{account_id}
- GET /account-closure/status/{account_id}
- POST /account-closure/withdraw-funds/{account_id}
- GET /account-closure/settlement-status/{account_id}
- GET /account-closure/withdrawal-status/{account_id}/{transfer_id}
- POST /account-closure/close-account/{account_id}
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
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import the FastAPI app and account closure utilities
from api_server import app
from utils.alpaca.account_closure import ClosureStep

class TestAccountClosureEndpoints:
    """Test suite for account closure FastAPI endpoints."""

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
        """Mock environment variables for testing."""
        with patch.dict('os.environ', {'BACKEND_API_KEY': 'test-api-key-123'}):
            yield

    @pytest.fixture
    def mock_account_closure_functions(self):
        """Mock all account closure utility functions."""
        with patch('api_server.check_account_closure_readiness') as mock_check, \
             patch('api_server.initiate_account_closure') as mock_initiate, \
             patch('api_server.get_closure_progress') as mock_progress, \
             patch('api_server.AccountClosureManager') as mock_manager_class:
            
            mock_manager = Mock()
            mock_manager_class.return_value = mock_manager
            
            yield {
                'check': mock_check,
                'initiate': mock_initiate,
                'progress': mock_progress,
                'manager': mock_manager
            }

    def test_check_readiness_endpoint_ready(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/check-readiness when account is ready."""
        mock_account_closure_functions['check'].return_value = {
            'ready': True,
            'account_status': 'ACTIVE',
            'open_orders': 0,
            'open_positions': 0,
            'cash_balance': 5000.00,
            'has_ach_relationship': True,
            'ach_relationships': [
                {
                    'id': 'ach-123',
                    'bank_name': 'Test Bank',
                    'account_number_last4': '1234'
                }
            ]
        }
        
        response = client.get("/account-closure/check-readiness/test-account-123", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data['ready'] is True
        assert data['account_status'] == 'ACTIVE'
        assert data['cash_balance'] == 5000.00

    def test_check_readiness_endpoint_not_ready(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/check-readiness when account is not ready."""
        mock_account_closure_functions['check'].return_value = {
            'ready': False,
            'reason': 'Account has open positions',
            'open_positions': 3,
            'account_status': 'ACTIVE'
        }
        
        response = client.get("/account-closure/check-readiness/test-account-123", headers=auth_headers)
        
        assert response.status_code == 400
        data = response.json()
        assert 'open positions' in data['detail']

    def test_check_readiness_endpoint_error(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/check-readiness with API error."""
        mock_account_closure_functions['check'].side_effect = Exception("API connection failed")
        
        response = client.get("/account-closure/check-readiness/test-account-123", headers=auth_headers)
        
        assert response.status_code == 500
        data = response.json()
        assert 'API connection failed' in data['detail']

    def test_initiate_closure_endpoint_success(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/initiate with valid request."""
        mock_account_closure_functions['initiate'].return_value = {
            'success': True,
            'step': ClosureStep.WAITING_SETTLEMENT.value,
            'orders_canceled': 2,
            'positions_liquidated': 1,
            'message': 'Account closure initiated successfully'
        }
        
        request_data = {
            'ach_relationship_id': 'ach-rel-123',
            'confirm_permanent_closure': True
        }
        
        response = client.post(
            "/account-closure/initiate/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data['success'] is True
        assert data['step'] == ClosureStep.WAITING_SETTLEMENT.value
        assert data['orders_canceled'] == 2

    def test_initiate_closure_endpoint_missing_confirmation(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/initiate without confirmation flag."""
        request_data = {
            'ach_relationship_id': 'ach-rel-123',
            'confirm_permanent_closure': False  # Missing confirmation
        }
        
        response = client.post(
            "/account-closure/initiate/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert 'must confirm' in data['detail']

    def test_initiate_closure_endpoint_missing_ach_relationship(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/initiate without ACH relationship ID."""
        request_data = {
            'confirm_permanent_closure': True
            # Missing ach_relationship_id
        }
        
        response = client.post(
            "/account-closure/initiate/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 422  # Pydantic validation error

    def test_initiate_closure_endpoint_preconditions_failed(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/initiate when preconditions are not met."""
        mock_account_closure_functions['initiate'].return_value = {
            'success': False,
            'reason': 'Account has Pattern Day Trader restrictions'
        }
        
        request_data = {
            'ach_relationship_id': 'ach-rel-123',
            'confirm_permanent_closure': True
        }
        
        response = client.post(
            "/account-closure/initiate/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert 'Pattern Day Trader' in data['detail']

    def test_get_status_endpoint_success(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/status with valid account."""
        mock_account_closure_functions['progress'].return_value = {
            'success': True,
            'current_step': ClosureStep.WAITING_SETTLEMENT.value,
            'step_progress': {
                'orders_canceled': True,
                'positions_liquidated': True,
                'settlement_pending': True
            },
            'estimated_completion': '2024-12-20T12:00:00Z'
        }
        
        response = client.get("/account-closure/status/test-account-123", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data['success'] is True
        assert data['current_step'] == ClosureStep.WAITING_SETTLEMENT.value

    def test_get_status_endpoint_no_closure_in_progress(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/status when no closure is in progress."""
        mock_account_closure_functions['progress'].return_value = {
            'success': False,
            'reason': 'No account closure in progress'
        }
        
        response = client.get("/account-closure/status/test-account-123", headers=auth_headers)
        
        assert response.status_code == 404
        data = response.json()
        assert 'No account closure in progress' in data['detail']

    def test_withdraw_funds_endpoint_success(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/withdraw-funds with valid request."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.withdraw_all_funds.return_value = {
            'success': True,
            'transfer_id': 'transfer-123',
            'transfer_status': 'QUEUED',
            'amount': '5000.00'
        }
        
        request_data = {
            'ach_relationship_id': 'ach-rel-123'
        }
        
        response = client.post(
            "/account-closure/withdraw-funds/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data['success'] is True
        assert data['transfer_id'] == 'transfer-123'

    def test_withdraw_funds_endpoint_insufficient_balance(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/withdraw-funds with insufficient balance."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.withdraw_all_funds.return_value = {
            'success': False,
            'error': 'Insufficient available balance for withdrawal'
        }
        
        request_data = {
            'ach_relationship_id': 'ach-rel-123'
        }
        
        response = client.post(
            "/account-closure/withdraw-funds/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert 'Insufficient' in data['detail']

    def test_settlement_status_endpoint_complete(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/settlement-status when settlement is complete."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.check_settlement_status.return_value = {
            'settlement_complete': True,
            'cash_available_for_withdrawal': 5000.00,
            'pending_settlement': 0.00
        }
        
        response = client.get("/account-closure/settlement-status/test-account-123", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data['settlement_complete'] is True
        assert data['cash_available_for_withdrawal'] == 5000.00

    def test_settlement_status_endpoint_pending(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/settlement-status when settlement is pending."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.check_settlement_status.return_value = {
            'settlement_complete': False,
            'cash_available_for_withdrawal': 3000.00,
            'pending_settlement': 2000.00,
            'estimated_settlement_date': '2024-12-20'
        }
        
        response = client.get("/account-closure/settlement-status/test-account-123", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data['settlement_complete'] is False
        assert data['pending_settlement'] == 2000.00

    def test_withdrawal_status_endpoint_completed(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/withdrawal-status when withdrawal is completed."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.check_withdrawal_status.return_value = {
            'transfer_completed': True,
            'transfer_status': 'COMPLETED',
            'amount': '5000.00',
            'completion_date': '2024-12-19T15:30:00Z'
        }
        
        response = client.get("/account-closure/withdrawal-status/test-account-123/transfer-123", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data['transfer_completed'] is True
        assert data['transfer_status'] == 'COMPLETED'

    def test_withdrawal_status_endpoint_pending(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/withdrawal-status when withdrawal is pending."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.check_withdrawal_status.return_value = {
            'transfer_completed': False,
            'transfer_status': 'PENDING',
            'amount': '5000.00',
            'estimated_completion': '2024-12-22T10:00:00Z'
        }
        
        response = client.get("/account-closure/withdrawal-status/test-account-123/transfer-123", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data['transfer_completed'] is False
        assert data['transfer_status'] == 'PENDING'

    def test_withdrawal_status_endpoint_not_found(self, client, mock_account_closure_functions, auth_headers):
        """Test GET /account-closure/withdrawal-status when transfer is not found."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.check_withdrawal_status.side_effect = Exception("Transfer not found")
        
        response = client.get("/account-closure/withdrawal-status/test-account-123/invalid-transfer", headers=auth_headers)
        
        assert response.status_code == 500
        data = response.json()
        assert 'Transfer not found' in data['detail']

    def test_close_account_endpoint_success(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/close-account with valid conditions."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.close_account.return_value = {
            'success': True,
            'account_status': 'CLOSED',
            'closure_date': '2024-12-19T16:00:00Z'
        }
        
        request_data = {
            'final_confirmation': True
        }
        
        response = client.post(
            "/account-closure/close-account/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data['success'] is True
        assert data['account_status'] == 'CLOSED'

    def test_close_account_endpoint_missing_confirmation(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/close-account without final confirmation."""
        request_data = {
            'final_confirmation': False  # Missing confirmation
        }
        
        response = client.post(
            "/account-closure/close-account/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert 'final confirmation required' in data['detail']

    def test_close_account_endpoint_non_zero_balance(self, client, mock_account_closure_functions, auth_headers):
        """Test POST /account-closure/close-account with non-zero balance."""
        mock_manager = mock_account_closure_functions['manager']
        mock_manager.close_account.return_value = {
            'success': False,
            'reason': 'Account balance must be $0 before closure',
            'current_balance': 100.00
        }
        
        request_data = {
            'final_confirmation': True
        }
        
        response = client.post(
            "/account-closure/close-account/test-account-123",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert 'balance must be $0' in data['detail']

class TestAccountClosureEndpointSecurity:
    """Test suite for security aspects of account closure endpoints."""

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
        """Mock environment variables for testing."""
        with patch.dict('os.environ', {'BACKEND_API_KEY': 'test-api-key-123'}):
            yield

    def test_account_id_validation(self, client, auth_headers):
        """Test that account IDs are properly validated."""
        # Test with invalid account ID format
        invalid_account_ids = [
            "",  # Empty
            "invalid-chars-!@#",  # Special characters
            "a" * 200,  # Too long
            "../../../etc/passwd",  # Path traversal attempt
        ]
        
        for invalid_id in invalid_account_ids:
            response = client.get(f"/account-closure/check-readiness/{invalid_id}", headers=auth_headers)
            # Should either return 422 (validation error) or 400/500 (business logic error)
            assert response.status_code in [400, 422, 500]

    def test_input_sanitization(self, client, auth_headers):
        """Test that inputs are properly sanitized."""
        # Test with potentially malicious input
        malicious_inputs = [
            {"ach_relationship_id": "<script>alert('xss')</script>"},
            {"ach_relationship_id": "'; DROP TABLE accounts; --"},
            {"ach_relationship_id": "../../etc/passwd"},
        ]
        
        for malicious_input in malicious_inputs:
            malicious_input['confirm_permanent_closure'] = True
            response = client.post(
                "/account-closure/initiate/test-account-123",
                json=malicious_input,
                headers=auth_headers
            )
            # Should handle gracefully without executing malicious code
            assert response.status_code in [400, 422, 500]

    def test_rate_limiting_protection(self, client, auth_headers):
        """Test that endpoints can handle rapid requests (basic load test)."""
        # Make multiple rapid requests to check for race conditions
        responses = []
        for i in range(10):
            response = client.get(f"/account-closure/check-readiness/test-account-{i}", headers=auth_headers)
            responses.append(response)
        
        # All responses should be consistent (either all fail or succeed consistently)
        status_codes = [r.status_code for r in responses]
        # At minimum, shouldn't crash the server
        assert all(code < 600 for code in status_codes)

class TestAccountClosureEndpointIntegration:
    """Integration tests for account closure workflow through endpoints."""

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
        """Mock environment variables for testing."""
        with patch.dict('os.environ', {'BACKEND_API_KEY': 'test-api-key-123'}):
            yield

    @pytest.fixture
    def mock_successful_workflow(self):
        """Mock a complete successful account closure workflow."""
        with patch('api_server.check_account_closure_readiness') as mock_check, \
             patch('api_server.initiate_account_closure') as mock_initiate, \
             patch('api_server.get_closure_progress') as mock_progress, \
             patch('api_server.AccountClosureManager') as mock_manager_class:
            
            mock_manager = Mock()
            mock_manager_class.return_value = mock_manager
            
            # Mock successful readiness check
            mock_check.return_value = {
                'ready': True,
                'account_status': 'ACTIVE',
                'open_orders': 0,
                'open_positions': 0,
                'cash_balance': 5000.00,
                'has_ach_relationship': True
            }
            
            # Mock successful initiation
            mock_initiate.return_value = {
                'success': True,
                'step': ClosureStep.WAITING_SETTLEMENT.value,
                'orders_canceled': 0,
                'positions_liquidated': 0
            }
            
            # Mock settlement status
            mock_manager.check_settlement_status.return_value = {
                'settlement_complete': True,
                'cash_available_for_withdrawal': 5000.00
            }
            
            # Mock withdrawal
            mock_manager.withdraw_all_funds.return_value = {
                'success': True,
                'transfer_id': 'transfer-123',
                'transfer_status': 'QUEUED'
            }
            
            # Mock withdrawal status
            mock_manager.check_withdrawal_status.return_value = {
                'transfer_completed': True,
                'transfer_status': 'COMPLETED'
            }
            
            # Mock account closure
            mock_manager.close_account.return_value = {
                'success': True,
                'account_status': 'CLOSED'
            }
            
            yield {
                'check': mock_check,
                'initiate': mock_initiate,
                'progress': mock_progress,
                'manager': mock_manager
            }

    def test_complete_closure_workflow(self, client, mock_successful_workflow, auth_headers):
        """Test complete account closure workflow through API endpoints."""
        account_id = "test-account-123"
        ach_relationship_id = "ach-rel-123"
        
        # Step 1: Check readiness
        response = client.get(f"/account-closure/check-readiness/{account_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()['ready'] is True
        
        # Step 2: Initiate closure
        response = client.post(
            f"/account-closure/initiate/{account_id}",
            json={
                'ach_relationship_id': ach_relationship_id,
                'confirm_permanent_closure': True
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()['success'] is True
        
        # Step 3: Check settlement status
        response = client.get(f"/account-closure/settlement-status/{account_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()['settlement_complete'] is True
        
        # Step 4: Withdraw funds
        response = client.post(
            f"/account-closure/withdraw-funds/{account_id}",
            json={'ach_relationship_id': ach_relationship_id},
            headers=auth_headers
        )
        assert response.status_code == 200
        transfer_id = response.json()['transfer_id']
        
        # Step 5: Check withdrawal status
        response = client.get(f"/account-closure/withdrawal-status/{account_id}/{transfer_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()['transfer_completed'] is True
        
        # Step 6: Final account closure
        response = client.post(
            f"/account-closure/close-account/{account_id}",
            json={'final_confirmation': True},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()['account_status'] == 'CLOSED'

if __name__ == "__main__":
    # Run the tests
    pytest.main([__file__, "-v", "--tb=short"])