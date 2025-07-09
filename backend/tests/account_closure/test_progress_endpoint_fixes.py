#!/usr/bin/env python3
"""
Comprehensive tests for account closure progress endpoint and fixes.
Tests the specific issues that were causing 500 errors.
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import uuid
from fastapi.testclient import TestClient

# Import the FastAPI app
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api_server import app

class TestAccountClosureProgressEndpoint:
    """Test the account closure progress endpoint specifically."""
    
    @pytest.fixture
    def client(self):
        """Create a test client."""
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers(self):
        """Authentication headers."""
        return {"x-api-key": "clera-is-the-goat-tok8s825nvjdk0482mc6"}
    
    @pytest.fixture
    def real_account_id(self):
        """Real account ID that's currently in closure process."""
        return "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
    
    @pytest.fixture
    def mock_supabase_data(self):
        """Mock Supabase data for the account."""
        return {
            "account_closure_confirmation_number": "CLA-MCNPB9PL-OYJ7TR",
            "account_closure_initiated_at": "2025-07-03T18:10:37.133391+00:00",
            "onboarding_data": {
                "account_closure": {
                    "reason": "User requested closure",
                    "notes": "Test closure process"
                }
            }
        }
    
    @pytest.fixture
    def mock_progress_data(self):
        """Mock progress data from account closure manager."""
        return {
            "current_step": "withdrawing_funds",
            "account_status": "AccountStatus.ACTIVE",
            "cash_balance": 98013.88,
            "open_positions": 0,
            "open_orders": 0,
            "ready_for_next_step": False,
            "estimated_completion": None
        }
    
    def test_progress_endpoint_success(self, client, auth_headers, real_account_id, mock_progress_data, mock_supabase_data):
        """Test that the progress endpoint works with real account ID."""
        
        with patch('api_server.get_closure_progress') as mock_get_progress, \
             patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            
            # Mock the progress function
            mock_get_progress.return_value = mock_progress_data
            
            # Mock Supabase client
            mock_supabase_instance = Mock()
            mock_supabase_instance.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [mock_supabase_data]
            mock_supabase.return_value = mock_supabase_instance
            
            # Make the request
            response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            
            # Assertions
            assert response.status_code == 200
            data = response.json()
            
            # Check required fields
            assert data["account_id"] == real_account_id
            assert data["current_step"] == "withdrawing_funds"
            assert data["steps_completed"] == 3
            assert data["total_steps"] == 5
            
            # Check status details
            assert "status_details" in data
            status_details = data["status_details"]
            assert status_details["account_status"] == "AccountStatus.ACTIVE"
            assert status_details["cash_balance"] == 98013.88
            assert status_details["open_positions"] == 0
            assert status_details["open_orders"] == 0
            
            # Check Supabase data is included
            assert data["confirmation_number"] == "CLA-MCNPB9PL-OYJ7TR"
            assert data["initiated_at"] == "2025-07-03T18:10:37.133391+00:00"
            assert "closure_details" in data
            
            # Check timestamp format (should be ISO format with timezone)
            assert "last_updated" in data
            timestamp = data["last_updated"]
            # Should be ISO format with timezone (timezone.utc format)
            assert "T" in timestamp
            assert timestamp.endswith("Z") or "+00:00" in timestamp
    
    def test_progress_endpoint_invalid_account_id(self, client, auth_headers):
        """Test progress endpoint with invalid account ID format."""
        
        invalid_account_ids = [
            "invalid-uuid",
            "not-a-uuid",
            "123",
            "",
            "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8-invalid"
        ]
        
        for invalid_id in invalid_account_ids:
            response = client.get(f"/api/account-closure/progress/{invalid_id}", headers=auth_headers)
            # The endpoint should handle invalid UUIDs gracefully and return 500
            # because the underlying function will fail with UUID validation
            assert response.status_code == 500
    
    def test_progress_endpoint_missing_api_key(self, client, real_account_id):
        """Test progress endpoint without API key."""
        response = client.get(f"/api/account-closure/progress/{real_account_id}")
        assert response.status_code == 401
    
    def test_progress_endpoint_invalid_api_key(self, client, real_account_id):
        """Test progress endpoint with invalid API key."""
        response = client.get(
            f"/api/account-closure/progress/{real_account_id}",
            headers={"x-api-key": "invalid-key"}
        )
        assert response.status_code == 401
    
    def test_progress_endpoint_supabase_error(self, client, auth_headers, real_account_id, mock_progress_data):
        """Test progress endpoint when Supabase query fails."""
        
        with patch('api_server.get_closure_progress') as mock_get_progress, \
             patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            
            # Mock the progress function
            mock_get_progress.return_value = mock_progress_data
            
            # Mock Supabase to raise an exception
            mock_supabase.side_effect = Exception("Supabase connection error")
            
            # Make the request
            response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            
            # Should still work, just without Supabase data
            assert response.status_code == 200
            data = response.json()
            
            # Check that basic progress data is still returned
            assert data["account_id"] == real_account_id
            assert data["current_step"] == "withdrawing_funds"
            
            # Supabase data should be None or empty
            assert data.get("confirmation_number") is None
            assert data.get("initiated_at") is None
    
    def test_progress_endpoint_no_supabase_data(self, client, auth_headers, real_account_id, mock_progress_data):
        """Test progress endpoint when no Supabase data is found."""
        
        with patch('api_server.get_closure_progress') as mock_get_progress, \
             patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            
            # Mock the progress function
            mock_get_progress.return_value = mock_progress_data
            
            # Mock Supabase to return no data
            mock_supabase_instance = Mock()
            mock_supabase_instance.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
            mock_supabase.return_value = mock_supabase_instance
            
            # Make the request
            response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            
            # Should still work
            assert response.status_code == 200
            data = response.json()
            
            # Check that basic progress data is still returned
            assert data["account_id"] == real_account_id
            assert data["current_step"] == "withdrawing_funds"
            
            # Supabase data should be None
            assert data.get("confirmation_number") is None
            assert data.get("initiated_at") is None
    
    def test_progress_endpoint_different_steps(self, client, auth_headers, real_account_id, mock_supabase_data):
        """Test progress endpoint with different closure steps."""
        
        step_test_cases = [
            ("initiated", 0),
            ("liquidating_positions", 1),
            ("waiting_settlement", 2),
            ("withdrawing_funds", 3),
            ("closing_account", 4),
            ("completed", 5),
            ("failed", -1)
        ]
        
        for step, expected_completed in step_test_cases:
            with patch('api_server.get_closure_progress') as mock_get_progress, \
                 patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
                
                # Mock the progress function with different step
                mock_progress_data = {
                    "current_step": step,
                    "account_status": "AccountStatus.ACTIVE",
                    "cash_balance": 0.0,
                    "open_positions": 0,
                    "open_orders": 0,
                    "ready_for_next_step": True,
                    "estimated_completion": "2025-07-10T12:00:00Z"
                }
                mock_get_progress.return_value = mock_progress_data
                
                # Mock Supabase
                mock_supabase_instance = Mock()
                mock_supabase_instance.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [mock_supabase_data]
                mock_supabase.return_value = mock_supabase_instance
                
                # Make the request
                response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
                
                # Should work for all steps
                assert response.status_code == 200
                data = response.json()
                
                assert data["current_step"] == step
                assert data["steps_completed"] == expected_completed
                assert data["total_steps"] == 5
    
    def test_progress_endpoint_error_handling(self, client, auth_headers, real_account_id):
        """Test progress endpoint when underlying function raises an error."""
        
        with patch('api_server.get_closure_progress') as mock_get_progress:
            # Mock the progress function to raise an exception
            mock_get_progress.side_effect = Exception("Test error")
            
            # Make the request
            response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            
            # Should return 500
            assert response.status_code == 500
            data = response.json()
            assert "error" in data["detail"]
            assert "Failed to get closure progress" in data["detail"]


class TestRealAccountClosureProgress:
    """Test the progress endpoint with the real account that's currently in closure."""
    
    @pytest.fixture
    def client(self):
        """Create a test client."""
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers(self):
        """Authentication headers."""
        return {"x-api-key": "clera-is-the-goat-tok8s825nvjdk0482mc6"}
    
    @pytest.fixture
    def real_account_id(self):
        """Real account ID that's currently in closure process."""
        return "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
    
    def test_real_progress_endpoint(self, client, auth_headers, real_account_id):
        """Test the progress endpoint with the real account that's currently in closure."""
        
        # Make the request to the real endpoint
        response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
        
        # Should return 200
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert data["account_id"] == real_account_id
        assert "current_step" in data
        assert "steps_completed" in data
        assert "total_steps" in data
        assert data["total_steps"] == 5
        
        # Check status details
        assert "status_details" in data
        status_details = data["status_details"]
        assert "account_status" in status_details
        assert "cash_balance" in status_details
        assert "open_positions" in status_details
        assert "open_orders" in status_details
        
        # Check that confirmation number and initiation date are present
        assert "confirmation_number" in data
        assert "initiated_at" in data
        assert data["confirmation_number"] is not None
        assert data["initiated_at"] is not None
        
        # Check timestamp format
        assert "last_updated" in data
        timestamp = data["last_updated"]
        assert "T" in timestamp
        
        print(f"✅ Real progress endpoint test passed!")
        print(f"   Account ID: {data['account_id']}")
        print(f"   Current Step: {data['current_step']}")
        print(f"   Steps Completed: {data['steps_completed']}/{data['total_steps']}")
        print(f"   Confirmation Number: {data['confirmation_number']}")
        print(f"   Initiated At: {data['initiated_at']}")
        print(f"   Cash Balance: ${data['status_details']['cash_balance']}")
    
    def test_real_progress_endpoint_consistency(self, client, auth_headers, real_account_id):
        """Test that the progress endpoint returns consistent data for the same account."""
        
        # Make multiple requests
        responses = []
        for i in range(3):
            response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            assert response.status_code == 200
            responses.append(response.json())
        
        # Check that confirmation number is consistent
        confirmation_numbers = [r.get("confirmation_number") for r in responses]
        assert len(set(confirmation_numbers)) == 1, f"Confirmation numbers should be consistent: {confirmation_numbers}"
        
        # Check that initiation date is consistent
        initiation_dates = [r.get("initiated_at") for r in responses]
        assert len(set(initiation_dates)) == 1, f"Initiation dates should be consistent: {initiation_dates}"
        
        # Check that current step is consistent
        current_steps = [r.get("current_step") for r in responses]
        assert len(set(current_steps)) == 1, f"Current steps should be consistent: {current_steps}"
        
        print(f"✅ Consistency test passed!")
        print(f"   Confirmation Number: {confirmation_numbers[0]}")
        print(f"   Initiation Date: {initiation_dates[0]}")
        print(f"   Current Step: {current_steps[0]}")


class TestFrontendIntegration:
    """Test that the frontend can successfully call the progress endpoint."""
    
    @pytest.fixture
    def client(self):
        """Create a test client."""
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers(self):
        """Authentication headers."""
        return {"x-api-key": "clera-is-the-goat-tok8s825nvjdk0482mc6"}
    
    @pytest.fixture
    def real_account_id(self):
        """Real account ID that's currently in closure process."""
        return "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
    
    def test_frontend_progress_call_simulation(self, client, auth_headers, real_account_id):
        """Simulate the exact call that the frontend makes."""
        
        # This is the exact URL pattern the frontend uses
        url = f"/api/account-closure/progress/{real_account_id}"
        
        # Make the request
        response = client.get(url, headers=auth_headers)
        
        # Should return 200 (not 500 as the frontend was getting)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        
        # Check that all required fields are present for frontend consumption
        required_fields = [
            "account_id", "current_step", "steps_completed", "total_steps",
            "status_details", "confirmation_number", "initiated_at", "last_updated"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Check that status_details has all required sub-fields
        status_details = data["status_details"]
        required_status_fields = ["account_status", "cash_balance", "open_positions", "open_orders"]
        
        for field in required_status_fields:
            assert field in status_details, f"Missing required status field: {field}"
        
        print(f"✅ Frontend integration test passed!")
        print(f"   URL: {url}")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Keys: {list(data.keys())}")
        print(f"   Status Details Keys: {list(status_details.keys())}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"]) 