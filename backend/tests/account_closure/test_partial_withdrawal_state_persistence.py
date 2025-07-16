#!/usr/bin/env python3

import pytest
import os
import redis
import json
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta

# Import the classes we're testing
from utils.alpaca.account_closure import (
    AccountClosureManager, 
    ClosureStateManager, 
    ClosureStep,
    BrokerService
)

class TestPartialWithdrawalStatePersistence:
    """Test state persistence for partial withdrawals to prevent double withdrawals."""
    
    @pytest.fixture
    def mock_redis_client(self):
        """Mock Redis client for testing."""
        return MagicMock()
    
    @pytest.fixture
    def state_manager(self, mock_redis_client):
        """State manager with mocked Redis."""
        manager = ClosureStateManager()
        manager.redis_client = mock_redis_client
        return manager
    
    @pytest.fixture
    def account_closure_manager(self, state_manager):
        """Account closure manager with mocked dependencies."""
        with patch('utils.alpaca.account_closure.BrokerService') as mock_broker_service:
            manager = AccountClosureManager()
            manager.state_manager = state_manager
            manager.broker_service = mock_broker_service.return_value
            return manager
    
    def test_partial_withdrawal_state_storage(self, account_closure_manager, mock_redis_client):
        """Test that partial withdrawal state is stored in Redis."""
        account_id = "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
        ach_relationship_id = "9fc0f98e-f03d-4a6e-989d-8a713e76b298"
        
        # Mock broker service to return partial withdrawal
        withdrawal_result = {
            "success": True,
            "transfer_id": "a8a53f10-6092-48f4-a72d-c853c2de80b1",
            "amount_withdrawn": 50000.0,
            "total_requested": 98013.88,
            "remaining_amount": 48013.88,
            "is_partial_withdrawal": True,
            "next_withdrawal_date": "2025-07-16",
            "status": "QUEUED"
        }
        account_closure_manager.broker_service.withdraw_funds.return_value = withdrawal_result
        
        # Call withdraw_funds
        result = account_closure_manager.withdraw_funds(account_id, ach_relationship_id, 98013.88)
        
        # Verify Redis state was stored
        mock_redis_client.setex.assert_called_once()
        call_args = mock_redis_client.setex.call_args
        
        # Check that the key is correct
        assert call_args[0][0] == f"partial_withdrawal:{account_id}"
        
        # Check that the stored state contains expected data
        stored_state = json.loads(call_args[0][2])
        assert stored_state["total_requested"] == 98013.88
        assert stored_state["amount_withdrawn"] == 50000.0
        assert stored_state["remaining_amount"] == 48013.88
        assert stored_state["transfer_id"] == "a8a53f10-6092-48f4-a72d-c853c2de80b1"
        assert stored_state["ach_relationship_id"] == ach_relationship_id
    
    def test_determine_current_step_with_partial_withdrawal_state(self, state_manager, mock_redis_client):
        """Test that determine_current_step returns PARTIAL_WITHDRAWAL_WAITING when state exists."""
        account_id = "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
        
        # Mock Redis to return partial withdrawal state
        partial_state = {
            "total_requested": 98013.88,
            "amount_withdrawn": 50000.0,
            "remaining_amount": 48013.88,
            "next_withdrawal_date": "2025-07-16",
            "transfer_id": "a8a53f10-6092-48f4-a72d-c853c2de80b1"
        }
        mock_redis_client.get.return_value = json.dumps(partial_state)
        
        # Account info showing funds ready (this would normally trigger WITHDRAWING_FUNDS)
        account_info = {
            "account": MagicMock(status="ACTIVE"),
            "orders": [],
            "positions": [],
            "cash_balance": 48013.88,
            "cash_withdrawable": 48013.88
        }
        
        # Call determine_current_step with account_id
        step = state_manager.determine_current_step(account_info, account_id)
        
        # Should return PARTIAL_WITHDRAWAL_WAITING instead of WITHDRAWING_FUNDS
        assert step == ClosureStep.PARTIAL_WITHDRAWAL_WAITING
        
        # Verify Redis was checked
        mock_redis_client.get.assert_called_with(f"partial_withdrawal:{account_id}")
    
    def test_determine_current_step_without_partial_withdrawal_state(self, state_manager, mock_redis_client):
        """Test normal behavior when no partial withdrawal state exists."""
        account_id = "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
        
        # Mock Redis to return no state
        mock_redis_client.get.return_value = None
        
        # Account info showing funds ready
        account_info = {
            "account": MagicMock(status="ACTIVE"),
            "orders": [],
            "positions": [],
            "cash_balance": 48013.88,
            "cash_withdrawable": 48013.88
        }
        
        # Call determine_current_step
        step = state_manager.determine_current_step(account_info, account_id)
        
        # Should return normal WITHDRAWING_FUNDS
        assert step == ClosureStep.WITHDRAWING_FUNDS
    
    def test_state_clearing_when_withdrawal_complete(self, state_manager, mock_redis_client):
        """Test that partial withdrawal state is cleared when balance drops to $1."""
        account_id = "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
        
        # Account info showing withdrawal completed (balance <= $1)
        account_info = {
            "account": MagicMock(status="ACTIVE"),
            "orders": [],
            "positions": [],
            "cash_balance": 0.50,
            "cash_withdrawable": 0.50
        }
        
        # Call is_ready_for_next_step for PARTIAL_WITHDRAWAL_WAITING
        ready = state_manager.is_ready_for_next_step(
            ClosureStep.PARTIAL_WITHDRAWAL_WAITING, 
            account_info, 
            account_id
        )
        
        # Should be ready and should have cleared the state
        assert ready == True
        mock_redis_client.delete.assert_called_with(f"partial_withdrawal:{account_id}")
    
    def test_exact_bug_scenario_reproduction(self, account_closure_manager, mock_redis_client):
        """Test the exact scenario that caused the double withdrawal bug."""
        account_id = "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
        ach_relationship_id = "9fc0f98e-f03d-4a6e-989d-8a713e76b298"
        
        # STEP 1: First call - should initiate partial withdrawal and store state
        mock_redis_client.get.return_value = None  # No existing state
        
        withdrawal_result = {
            "success": True,
            "transfer_id": "a8a53f10-6092-48f4-a72d-c853c2de80b1",
            "amount_withdrawn": 50000.0,
            "total_requested": 98013.88,
            "remaining_amount": 48013.88,
            "is_partial_withdrawal": True,
            "next_withdrawal_date": "2025-07-16"
        }
        account_closure_manager.broker_service.withdraw_funds.return_value = withdrawal_result
        
        # Mock account info for first call
        first_account_info = {
            "account": MagicMock(status="ACTIVE"),
            "orders": [],
            "positions": [],
            "cash_balance": 98013.88,
            "cash_withdrawable": 98013.88
        }
        account_closure_manager.broker_service.get_account_info.return_value = first_account_info
        
        # First call - should store partial withdrawal state
        result1 = account_closure_manager.withdraw_funds(account_id, ach_relationship_id, 98013.88)
        assert result1["is_partial_withdrawal"] == True
        assert mock_redis_client.setex.call_count == 1
        
        # STEP 2: Second call (minutes later) - should NOT trigger another withdrawal
        # Mock Redis to return the stored state with recent timestamp (< 24 hours ago)
        stored_state = {
            "total_requested": 98013.88,
            "amount_withdrawn": 50000.0,
            "remaining_amount": 48013.88,
            "next_withdrawal_date": "2025-07-16",
            "transfer_id": "a8a53f10-6092-48f4-a72d-c853c2de80b1",
            "initiated_at": (datetime.now() - timedelta(minutes=5)).isoformat()  # 5 minutes ago
        }
        mock_redis_client.get.return_value = json.dumps(stored_state)
        
        # Mock account info after first withdrawal (balance dropped to $48K)
        second_account_info = {
            "account": MagicMock(status="ACTIVE"),
            "orders": [],
            "positions": [],
            "cash_balance": 48013.88,
            "cash_withdrawable": 48013.88
        }
        account_closure_manager.broker_service.get_account_info.return_value = second_account_info
        
        # Check status - should show PARTIAL_WITHDRAWAL_WAITING, not WITHDRAWING_FUNDS
        status = account_closure_manager.get_closure_status(account_id)
        assert status["current_step"] == "partial_withdrawal_waiting"
        assert status["ready_for_next_step"] == False  # Should wait for next day
        assert status["next_action"] == "wait"
        
        # Verify that withdraw_funds was NOT called again
        assert account_closure_manager.broker_service.withdraw_funds.call_count == 1
    
    def test_redis_connection_failure_graceful_degradation(self, state_manager):
        """Test that system works even if Redis is unavailable."""
        # Simulate Redis connection failure
        state_manager.redis_client = None
        
        account_id = "test-account"
        account_info = {
            "account": MagicMock(status="ACTIVE"),
            "orders": [],
            "positions": [],
            "cash_balance": 48013.88,
            "cash_withdrawable": 48013.88
        }
        
        # Should not crash and should return normal step
        step = state_manager.determine_current_step(account_info, account_id)
        assert step == ClosureStep.WITHDRAWING_FUNDS
        
        # Should not crash on ready check either
        ready = state_manager.is_ready_for_next_step(step, account_info, account_id)
        assert ready == True
    
    def test_state_ttl_configuration(self, account_closure_manager, mock_redis_client):
        """Test that partial withdrawal state has appropriate TTL."""
        account_id = "test-account"
        ach_relationship_id = "test-ach"
        
        # Mock partial withdrawal result
        withdrawal_result = {
            "success": True,
            "transfer_id": "test-transfer",
            "amount_withdrawn": 50000.0,
            "total_requested": 98013.88,
            "remaining_amount": 48013.88,
            "is_partial_withdrawal": True,
            "next_withdrawal_date": "2025-07-16"
        }
        account_closure_manager.broker_service.withdraw_funds.return_value = withdrawal_result
        
        # Call withdraw_funds
        account_closure_manager.withdraw_funds(account_id, ach_relationship_id, 98013.88)
        
        # Verify TTL was set (72 hours)
        call_args = mock_redis_client.setex.call_args
        ttl_timedelta = call_args[0][1]
        assert ttl_timedelta == timedelta(hours=72)
    
    def test_24_hour_delay_allows_next_withdrawal(self, state_manager, mock_redis_client):
        """Test that after 24+ hours, the system allows the next partial withdrawal."""
        account_id = "72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8"
        
        # Mock Redis to return partial withdrawal state from 25 hours ago
        partial_state = {
            "total_requested": 98013.88,
            "amount_withdrawn": 50000.0,
            "remaining_amount": 48013.88,
            "next_withdrawal_date": "2025-07-16",
            "transfer_id": "a8a53f10-6092-48f4-a72d-c853c2de80b1",
            "initiated_at": (datetime.now() - timedelta(hours=25)).isoformat()  # 25 hours ago
        }
        mock_redis_client.get.return_value = json.dumps(partial_state)
        
        # Account info showing funds settled and ready
        account_info = {
            "account": MagicMock(status="ACTIVE"),
            "orders": [],
            "positions": [],
            "cash_balance": 48013.88,
            "cash_withdrawable": 48013.88
        }
        
        # Should be in PARTIAL_WITHDRAWAL_WAITING state
        step = state_manager.determine_current_step(account_info, account_id)
        assert step == ClosureStep.PARTIAL_WITHDRAWAL_WAITING
        
        # Should be ready for next step after 24+ hours
        ready = state_manager.is_ready_for_next_step(step, account_info, account_id)
        assert ready == True  # 25 hours passed, ready for next withdrawal

if __name__ == "__main__":
    pytest.main([__file__, "-v"]) 