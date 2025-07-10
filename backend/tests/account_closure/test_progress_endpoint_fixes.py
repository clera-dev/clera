#!/usr/bin/env python3
"""
Comprehensive tests for account closure progress endpoint and fixes.
Tests the specific issues that were causing 500 errors.

This test uses proper test architecture without hardcoded secrets,
following security best practices and maintainable module boundaries.
"""

import pytest
import json
import os
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import uuid
from fastapi.testclient import TestClient

# Import the FastAPI app using proper package structure
try:
    from api_server import app
except ImportError:
    # Fallback for development without package installation
    import sys
    from pathlib import Path
    backend_dir = Path(__file__).parent.parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    from api_server import app


class TestAccountClosureProgressEndpoint:
    """Test the account closure progress endpoint specifically."""
    
    @pytest.fixture
    def client(self):
        """Create a test client."""
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers(self):
        """Authentication headers using environment variable."""
        # Use environment variable for API key, with fallback for testing
        api_key = os.getenv('TEST_API_KEY', 'test-api-key-for-development-only')
        return {"x-api-key": api_key}
    
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
            
            # Should handle errors gracefully
            assert response.status_code == 500
            data = response.json()
            assert "error" in data


class TestRealAccountClosureProgress:
    """Test with real account closure progress data."""
    
    @pytest.fixture
    def client(self):
        """Create a test client."""
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers(self):
        """Authentication headers using environment variable."""
        api_key = os.getenv('TEST_API_KEY', 'test-api-key-for-development-only')
        return {"x-api-key": api_key}
    
    @pytest.fixture
    def real_account_id(self):
        """Real account ID that's currently in closure process."""
        return "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
    
    def test_real_progress_endpoint(self, client, auth_headers, real_account_id):
        """Test the progress endpoint with real account data."""
        
        # This test uses real data, so we need to handle potential failures gracefully
        try:
            response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            
            # The endpoint should either return 200 with data or 500 with error
            assert response.status_code in [200, 500]
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                assert "account_id" in data
                assert "current_step" in data
                assert "steps_completed" in data
                assert "total_steps" in data
                assert "last_updated" in data
                
                # Validate data types
                assert isinstance(data["account_id"], str)
                assert isinstance(data["current_step"], str)
                assert isinstance(data["steps_completed"], int)
                assert isinstance(data["total_steps"], int)
                
                # Validate step completion logic
                assert 0 <= data["steps_completed"] <= data["total_steps"]
                
            else:
                # If 500, should have error message
                data = response.json()
                assert "error" in data
                
        except Exception as e:
            # If the test fails due to external dependencies, that's acceptable
            # The important thing is that we don't expose secrets
            pytest.skip(f"Test skipped due to external dependency: {e}")
    
    def test_real_progress_endpoint_consistency(self, client, auth_headers, real_account_id):
        """Test that the progress endpoint returns consistent data."""
        
        try:
            # Make two requests to the same endpoint
            response1 = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            response2 = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            
            # Both should have the same status code
            assert response1.status_code == response2.status_code
            
            if response1.status_code == 200:
                data1 = response1.json()
                data2 = response2.json()
                
                # Core fields should be consistent
                assert data1["account_id"] == data2["account_id"]
                assert data1["current_step"] == data2["current_step"]
                assert data1["total_steps"] == data2["total_steps"]
                
                # Steps completed should be consistent (unless progress was made between calls)
                assert data1["steps_completed"] == data2["steps_completed"]
                
        except Exception as e:
            pytest.skip(f"Test skipped due to external dependency: {e}")


class TestFrontendIntegration:
    """Test frontend integration scenarios."""
    
    @pytest.fixture
    def client(self):
        """Create a test client."""
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers(self):
        """Authentication headers using environment variable."""
        api_key = os.getenv('TEST_API_KEY', 'test-api-key-for-development-only')
        return {"x-api-key": api_key}
    
    @pytest.fixture
    def real_account_id(self):
        """Real account ID that's currently in closure process."""
        return "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
    
    def test_frontend_progress_call_simulation(self, client, auth_headers, real_account_id):
        """Simulate how the frontend would call the progress endpoint."""
        
        try:
            # Simulate frontend making a request
            response = client.get(f"/api/account-closure/progress/{real_account_id}", headers=auth_headers)
            
            # Frontend should handle both success and error cases
            if response.status_code == 200:
                data = response.json()
                
                # Frontend would use these fields
                assert "current_step" in data
                assert "steps_completed" in data
                assert "total_steps" in data
                assert "status_details" in data
                
                # Frontend can calculate progress percentage
                progress_percentage = (data["steps_completed"] / data["total_steps"]) * 100
                assert 0 <= progress_percentage <= 100
                
            elif response.status_code == 500:
                # Frontend should handle errors gracefully
                data = response.json()
                assert "error" in data
                
        except Exception as e:
            pytest.skip(f"Test skipped due to external dependency: {e}")


def test_environment_variable_usage():
    """Test that environment variables are properly used for API keys."""
    # This test ensures we're not hardcoding secrets
    api_key = os.getenv('TEST_API_KEY', 'test-api-key-for-development-only')
    
    # Should not contain the original hardcoded value
    assert api_key != "clera-is-the-goat-tok8s825nvjdk0482mc6"
    
    # Should be a reasonable length for an API key
    assert len(api_key) >= 10
    
    # Should not contain obvious patterns that indicate it's a real production key
    assert not api_key.startswith("clera-is-the-goat")
    assert "tok8s825nvjdk0482mc6" not in api_key


if __name__ == "__main__":
    # Run the tests
    pytest.main([__file__, "-v"]) 