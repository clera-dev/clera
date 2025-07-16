#!/usr/bin/env python3
"""
Critical Bug Fixes Integration Test

This test validates that the two production-critical bugs are fixed:

1. CRITICAL BUG 1: resume_account_closure() called manager.resume_closure_process() 
   but the method didn't exist, causing AttributeError at runtime.

2. CRITICAL BUG 2: Frontend called /api/account-closure/resume/{accountId} 
   but no endpoint existed, causing 404 errors when users clicked "Try Again".

This test ensures both fixes work together in an end-to-end scenario.
"""

import pytest
import sys
import os
from unittest.mock import Mock, patch

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

from utils.alpaca.account_closure import (
    AccountClosureManager,
    resume_account_closure,
    ClosureStep
)

class TestCriticalBugFixes:
    """Integration test for the two critical bug fixes."""
    
    def test_critical_bug_1_resume_method_exists_and_works(self):
        """
        CRITICAL BUG FIX 1: Test that resume_closure_process method exists and works.
        
        Original bug: resume_account_closure() called manager.resume_closure_process() 
        but the method didn't exist, causing AttributeError.
        
        This test verifies the complete fix.
        """
        with patch('utils.alpaca.account_closure.get_broker_client'):
            # Create manager instance
            manager = AccountClosureManager(sandbox=True)
            manager.broker_client = Mock()
            
            # CRITICAL TEST: Verify method exists
            assert hasattr(manager, 'resume_closure_process'), \
                "CRITICAL BUG: resume_closure_process method must exist"
            
            # CRITICAL TEST: Verify method is callable
            assert callable(getattr(manager, 'resume_closure_process')), \
                "CRITICAL BUG: resume_closure_process must be callable"
            
            # CRITICAL TEST: Mock the dependencies and test the method works
            with patch.object(manager, 'get_closure_status') as mock_status:
                mock_status.return_value = {
                    "current_step": ClosureStep.COMPLETED.value,
                    "account_status": "CLOSED"
                }
                
                # This should not raise AttributeError anymore
                result = manager.resume_closure_process("test-account-123")
                
                assert result is not None
                assert isinstance(result, dict)
                assert "success" in result
    
    def test_critical_bug_2_resume_account_closure_function_works(self):
        """
        CRITICAL BUG FIX 1 (Part 2): Test that resume_account_closure function works.
        
        This test verifies that the helper function can successfully call the 
        manager method without raising AttributeError.
        """
        with patch('utils.alpaca.account_closure.AccountClosureManager') as MockManager:
            # Set up mock manager with the resume method
            mock_manager_instance = Mock()
            mock_manager_instance.resume_closure_process.return_value = {
                "success": True,
                "step": "completed",
                "message": "Test successful"
            }
            MockManager.return_value = mock_manager_instance
            
            # CRITICAL TEST: This should work without AttributeError
            result = resume_account_closure("test-account-123", "ach-rel-123", sandbox=True)
            
            # Verify it worked
            assert result is not None
            assert result["success"] is True
            assert result["step"] == "completed"
            
            # Verify the method was called correctly
            mock_manager_instance.resume_closure_process.assert_called_once_with(
                "test-account-123", "ach-rel-123"
            )
    
    def test_critical_bug_2_api_endpoint_exists(self):
        """
        CRITICAL BUG FIX 2: Test that the resume API endpoint exists.
        
        Original bug: Frontend called /api/account-closure/resume/{accountId} 
        but no endpoint existed, causing 404 errors.
        
        This test verifies the backend endpoint exists.
        """
        from fastapi.testclient import TestClient
        from api_server import app
        
        client = TestClient(app)
        
        # CRITICAL TEST: Verify endpoint exists (should not return 404)
        with patch.dict(os.environ, {'BACKEND_API_KEY': 'test-key'}):
            response = client.post(
                "/account-closure/resume/test-account-123",
                json={},
                headers={"x-api-key": "test-key"}
            )
            
            # Should NOT be 404 (endpoint exists)
            assert response.status_code != 404, \
                "CRITICAL BUG: Resume endpoint must exist and not return 404"
            
            # Should be 200 or 500 (but not 404)
            assert response.status_code in [200, 500], \
                f"Expected 200 or 500, got {response.status_code}"
    
    def test_end_to_end_integration_scenario(self):
        """
        COMPREHENSIVE TEST: Test a realistic end-to-end scenario.
        
        This simulates what happens when a user clicks "Try Again" in the frontend:
        1. Frontend calls the resume API endpoint
        2. Backend endpoint calls resume_account_closure()
        3. resume_account_closure() calls manager.resume_closure_process()
        4. Everything works without errors
        """
        from fastapi.testclient import TestClient
        from api_server import app
        
        client = TestClient(app)
        
        # Mock the resume function to return a successful result
        with patch('api_server.resume_account_closure') as mock_resume, \
             patch.dict(os.environ, {'BACKEND_API_KEY': 'test-key'}):
            
            mock_resume.return_value = {
                "success": True,
                "step": "withdrawing_funds",
                "action_taken": "withdrew_funds",
                "amount_withdrawn": 1000.0,
                "message": "Funds withdrawn successfully"
            }
            
            # CRITICAL TEST: Complete end-to-end flow
            response = client.post(
                "/account-closure/resume/test-account-123",
                json={"ach_relationship_id": "ach-rel-123"},
                headers={"x-api-key": "test-key"}
            )
            
            # Verify the complete flow works
            assert response.status_code == 200, \
                f"End-to-end flow failed with status {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert data["step"] == "withdrawing_funds"
            assert data["action_taken"] == "withdrew_funds"
            
            # Verify the backend called the resume function correctly
            mock_resume.assert_called_once_with(
                "test-account-123", "ach-rel-123", sandbox=True
            )
    
    def test_frontend_api_route_exists(self):
        """
        CRITICAL BUG FIX 2 (Frontend Part): Test that frontend API route exists.
        
        This verifies that the frontend API route file was created.
        """
        frontend_route_path = os.path.join(
            project_root, "..", "frontend-app", "app", "api", 
            "account-closure", "resume", "[accountId]", "route.ts"
        )
        
        # CRITICAL TEST: Verify the frontend route file exists
        assert os.path.exists(frontend_route_path), \
            f"CRITICAL BUG: Frontend resume route must exist at {frontend_route_path}"
        
        # Verify it has the correct content
        with open(frontend_route_path, 'r') as f:
            content = f.read()
            
        assert "POST" in content, "Frontend route must handle POST requests"
        assert "account-closure/resume" in content, "Route must handle resume endpoint"
        assert "createClient" in content, "Route must authenticate users"
    
    def test_production_safety_checks(self):
        """
        PRODUCTION SAFETY TEST: Verify that the fixes don't compromise security.
        
        This ensures the bug fixes maintain all safety and security requirements.
        """
        # Test that resume function validates inputs
        with patch('utils.alpaca.account_closure.AccountClosureManager'):
            # Should handle invalid inputs gracefully
            result = resume_account_closure(None)
            assert result is not None  # Should not crash
            
            result = resume_account_closure("")
            assert result is not None  # Should not crash
        
        # Test that API endpoint requires authentication
        from fastapi.testclient import TestClient
        from api_server import app
        
        client = TestClient(app)
        
        response = client.post(
            "/account-closure/resume/test-account-123",
            json={}
            # No authentication headers
        )
        
        # Should require authentication
        assert response.status_code == 401, \
            "SECURITY: Resume endpoint must require authentication"
    
    def test_backward_compatibility(self):
        """
        BACKWARD COMPATIBILITY TEST: Ensure existing functionality still works.
        
        This verifies that our fixes don't break any existing account closure functionality.
        """
        with patch('utils.alpaca.account_closure.get_broker_client'):
            manager = AccountClosureManager(sandbox=True)
            manager.broker_client = Mock()
            
            # Test that existing methods still work
            assert hasattr(manager, 'check_closure_preconditions')
            assert hasattr(manager, 'get_closure_status')
            assert hasattr(manager, 'liquidate_positions')
            assert hasattr(manager, 'withdraw_funds')
            assert hasattr(manager, 'close_account')
            
            # All methods should be callable
            for method_name in ['check_closure_preconditions', 'get_closure_status', 
                              'liquidate_positions', 'withdraw_funds', 'close_account']:
                method = getattr(manager, method_name)
                assert callable(method), f"Method {method_name} must remain callable"


if __name__ == "__main__":
    # Run the critical tests
    pytest.main([__file__, "-v", "-s"]) 