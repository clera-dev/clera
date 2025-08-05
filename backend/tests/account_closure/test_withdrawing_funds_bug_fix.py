#!/usr/bin/env python3
"""
CRITICAL BUG FIX TESTS: WITHDRAWING_FUNDS Step Logic

This test suite validates the fix for the critical bug where accounts
would get stuck in WITHDRAWING_FUNDS step without ever initiating the withdrawal.

ORIGINAL BUG:
- Account had cash_balance = cash_withdrawable = $98,013.88 (fully settled)
- System was stuck in WITHDRAWING_FUNDS step for over a week
- ready_for_next_step = False, next_action = "wait"
- No withdrawal was ever initiated

ROOT CAUSE:
- is_ready_for_next_step() for WITHDRAWING_FUNDS only returned True when cash_balance <= 1.0
- resume_closure_process() assumed withdrawal was already initiated and just waited

FIX:
- is_ready_for_next_step() now returns True when funds are ready to withdraw OR withdrawal is complete
- resume_closure_process() now actually initiates withdrawal when funds are settled

This test ensures this critical bug never happens again.
"""

import pytest
import sys
import os
from unittest.mock import Mock, patch, MagicMock

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.append(project_root)

from utils.alpaca.account_closure import AccountClosureManager, ClosureStep, ClosureStateManager


class TestWithdrawingFundsBugFix:
    """Test the critical WITHDRAWING_FUNDS step bug fix."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.manager = AccountClosureManager(sandbox=True)
        self.state_manager = ClosureStateManager()
    
    def test_original_bug_scenario_fixed(self):
        """
        🔥 CRITICAL TEST: Verify the exact bug scenario is now fixed.
        
        Original bug: account with fully settled funds would get stuck
        waiting instead of initiating withdrawal.
        """
        # Exact scenario from the bug report
        account_info = {
            'account': Mock(status='ACTIVE'),
            'orders': [],
            'positions': [],
            'cash_balance': 98013.88,  # Fully settled funds
            'cash_withdrawable': 98013.88  # Equal to cash_balance = ready to withdraw
        }
        
        # Test state determination
        current_step = self.state_manager.determine_current_step(account_info)
        assert current_step == ClosureStep.WITHDRAWING_FUNDS, "Should be in WITHDRAWING_FUNDS step"
        
        # Test readiness (this was the bug - should be True, was False)
        ready_for_next = self.state_manager.is_ready_for_next_step(current_step, account_info)
        assert ready_for_next == True, "Should be ready to proceed when funds are settled"
        
        # Test next action (should be able to proceed, not wait)
        next_action = self.state_manager.get_next_action(current_step, ready_for_next)
        assert next_action != "wait", "Should not wait when funds are ready to withdraw"
        
        print("✅ CRITICAL BUG FIX VERIFIED: System now correctly identifies ready-to-withdraw funds")
    
    def test_withdrawing_funds_state_transitions(self):
        """Test all possible state transitions for WITHDRAWING_FUNDS step."""
        
        # Case 1: Funds fully settled and ready to withdraw
        settled_funds = {
            'account': Mock(status='ACTIVE'),
            'orders': [],
            'positions': [],
            'cash_balance': 50000.0,
            'cash_withdrawable': 50000.0  # Equal = settled
        }
        
        step = self.state_manager.determine_current_step(settled_funds)
        ready = self.state_manager.is_ready_for_next_step(step, settled_funds)
        assert step == ClosureStep.WITHDRAWING_FUNDS
        assert ready == True, "Should be ready when funds are settled"
        
        # Case 2: Withdrawal completed (low balance)
        completed_withdrawal = {
            'account': Mock(status='ACTIVE'),
            'orders': [],
            'positions': [],
            'cash_balance': 0.50,
            'cash_withdrawable': 0.50
        }
        
        step = self.state_manager.determine_current_step(completed_withdrawal)
        ready = self.state_manager.is_ready_for_next_step(step, completed_withdrawal)
        assert step == ClosureStep.CLOSING_ACCOUNT
        assert ready == True, "Should be ready to close when balance is low"
        
        # Case 3: Funds not yet settled
        unsettled_funds = {
            'account': Mock(status='ACTIVE'),
            'orders': [],
            'positions': [],
            'cash_balance': 50000.0,
            'cash_withdrawable': 25000.0  # Less than balance = not settled
        }
        
        step = self.state_manager.determine_current_step(unsettled_funds)
        ready = self.state_manager.is_ready_for_next_step(step, unsettled_funds)
        assert step == ClosureStep.WAITING_SETTLEMENT
        assert ready == False, "Should wait when funds are not settled"
    
    @patch('utils.alpaca.account_closure.AccountClosureManager.withdraw_funds')
    @patch('utils.alpaca.account_closure.AccountClosureManager.get_closure_status')
    def test_resume_closure_initiates_withdrawal(self, mock_get_status, mock_withdraw):
        """
        🔥 CRITICAL TEST: Verify resume_closure_process actually initiates withdrawal.
        
        This was the core bug - system would say "waiting for withdrawal" 
        without ever starting one.
        """
        # Mock current status showing settled funds ready for withdrawal
        mock_get_status.return_value = {
            'current_step': 'withdrawing_funds',
            'account_status': 'ACTIVE',
            'open_orders': 0,
            'open_positions': 0,
            'cash_balance': 98013.88,
            'cash_withdrawable': 98013.88,
            'ready_for_next_step': True,
            'can_retry': True,
            'next_action': 'continue_process'
        }
        
        # Mock successful withdrawal
        mock_withdraw.return_value = {
            'success': True,
            'transfer_id': 'test-transfer-123',
            'amount': 98013.88,
            'status': 'QUEUED'
        }
        
        # Call resume with ACH relationship ID
        result = self.manager.resume_closure_process(
            account_id='test-account-123',
            ach_relationship_id='test-ach-456'
        )
        
        # Verify withdrawal was initiated
        mock_withdraw.assert_called_once_with(
            'test-account-123',
            'test-ach-456', 
            98013.88
        )
        
        # Verify result indicates withdrawal was initiated
        assert result['success'] == True
        assert result['action_taken'] == 'initiated_withdrawal'
        assert result['amount_to_withdraw'] == 98013.88
        assert 'withdraw_result' in result
        
        print("✅ VERIFIED: resume_closure_process now actually initiates withdrawal")
    
    @patch('utils.alpaca.account_closure.AccountClosureManager.get_closure_status')
    def test_resume_closure_requires_ach_relationship(self, mock_get_status):
        """Test that system properly handles missing ACH relationship ID."""
        
        # Mock current status showing settled funds ready for withdrawal
        mock_get_status.return_value = {
            'current_step': 'withdrawing_funds',
            'account_status': 'ACTIVE',
            'open_orders': 0,
            'open_positions': 0,
            'cash_balance': 50000.0,
            'cash_withdrawable': 50000.0,
            'ready_for_next_step': True,
            'can_retry': True,
            'next_action': 'continue_process'
        }
        
        # Call resume without ACH relationship ID
        result = self.manager.resume_closure_process(account_id='test-account-123')
        
        # Verify proper error handling
        assert result['success'] == False
        assert 'ACH relationship ID required' in result['reason']
        assert result['cash_balance'] == 50000.0
        assert result['cash_withdrawable'] == 50000.0
        
        print("✅ VERIFIED: Proper error handling for missing ACH relationship ID")
    
    @patch('utils.alpaca.account_closure.AccountClosureManager.withdraw_funds')
    @patch('utils.alpaca.account_closure.AccountClosureManager.get_closure_status')
    def test_resume_closure_handles_withdrawal_failure(self, mock_get_status, mock_withdraw):
        """Test that system properly handles withdrawal failures."""
        
        # Mock current status
        mock_get_status.return_value = {
            'current_step': 'withdrawing_funds',
            'account_status': 'ACTIVE',
            'open_orders': 0,
            'open_positions': 0,
            'cash_balance': 50000.0,
            'cash_withdrawable': 50000.0,
            'ready_for_next_step': True,
            'can_retry': True,
            'next_action': 'continue_process'
        }
        
        # Mock withdrawal failure
        mock_withdraw.return_value = {
            'success': False,
            'error': 'Insufficient ACH relationship balance'
        }
        
        # Call resume
        result = self.manager.resume_closure_process(
            account_id='test-account-123',
            ach_relationship_id='test-ach-456'
        )
        
        # Verify failure is handled properly
        assert result['success'] == False
        assert result['action_taken'] == 'withdrawal_failed'
        assert 'Withdrawal failed' in result['message']
        assert 'Insufficient ACH relationship balance' in result['message']
        
        print("✅ VERIFIED: Proper handling of withdrawal failures")
    
    def test_edge_case_very_low_balance(self):
        """Test edge case where balance is exactly at the $1 threshold."""
        
        # Exactly $1.00
        exactly_one_dollar = {
            'account': Mock(status='ACTIVE'),
            'orders': [],
            'positions': [],
            'cash_balance': 1.0,
            'cash_withdrawable': 1.0
        }
        
        step = self.state_manager.determine_current_step(exactly_one_dollar)
        ready = self.state_manager.is_ready_for_next_step(step, exactly_one_dollar)
        
        # Should be in CLOSING_ACCOUNT step when balance is exactly $1
        assert step == ClosureStep.CLOSING_ACCOUNT
        assert ready == True
        
        # Just over $1.00
        just_over_one = {
            'account': Mock(status='ACTIVE'),
            'orders': [],
            'positions': [],
            'cash_balance': 1.01,
            'cash_withdrawable': 1.01
        }
        
        step = self.state_manager.determine_current_step(just_over_one)
        ready = self.state_manager.is_ready_for_next_step(step, just_over_one)
        
        # Should be in WITHDRAWING_FUNDS step when balance is over $1
        assert step == ClosureStep.WITHDRAWING_FUNDS
        assert ready == True, "Should be ready to withdraw when funds are settled"
        
        print("✅ VERIFIED: Correct handling of $1 threshold edge cases")
    
    def test_regression_prevention(self):
        """
        🔥 REGRESSION TEST: Ensure the exact bug scenario can never happen again.
        
        This test specifically prevents the regression where:
        - cash_balance == cash_withdrawable (settled funds)
        - ready_for_next_step returns False
        - next_action returns "wait"
        """
        test_cases = [
            # Various amounts of fully settled funds
            {'cash_balance': 98013.88, 'cash_withdrawable': 98013.88},
            {'cash_balance': 50000.0, 'cash_withdrawable': 50000.0}, 
            {'cash_balance': 10000.0, 'cash_withdrawable': 10000.0},
            {'cash_balance': 1000.0, 'cash_withdrawable': 1000.0},
            {'cash_balance': 100.0, 'cash_withdrawable': 100.0},
            {'cash_balance': 2.0, 'cash_withdrawable': 2.0},
        ]
        
        for case in test_cases:
            account_info = {
                'account': Mock(status='ACTIVE'),
                'orders': [],
                'positions': [],
                'cash_balance': case['cash_balance'],
                'cash_withdrawable': case['cash_withdrawable']
            }
            
            current_step = self.state_manager.determine_current_step(account_info)
            ready_for_next = self.state_manager.is_ready_for_next_step(current_step, account_info)
            next_action = self.state_manager.get_next_action(current_step, ready_for_next)
            
            # For any settled funds > $1, must not get stuck waiting
            if case['cash_balance'] > 1.0:
                assert current_step == ClosureStep.WITHDRAWING_FUNDS
                assert ready_for_next == True, f"Must be ready when ${case['cash_balance']} is settled"
                assert next_action != "wait", f"Must not wait when ${case['cash_balance']} is ready to withdraw"
        
        print("✅ REGRESSION PREVENTION: Bug scenario can never happen again")


if __name__ == "__main__":
    test = TestWithdrawingFundsBugFix()
    test.setup_method()
    
    print("🔥 RUNNING CRITICAL BUG FIX TESTS...")
    test.test_original_bug_scenario_fixed()
    test.test_withdrawing_funds_state_transitions()
    test.test_edge_case_very_low_balance()
    test.test_regression_prevention()
    print("\n🎉 ALL CRITICAL TESTS PASSED!") 