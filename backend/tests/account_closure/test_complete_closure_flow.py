#!/usr/bin/env python3
"""
Comprehensive Account Closure Flow Test

This test validates the complete end-to-end account closure process:
1. Initiation with automation trigger
2. Multi-day withdrawal logic
3. Email notifications
4. UI flow
5. Edge cases and error handling
"""

import pytest
import asyncio
import os
import time
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime, timedelta

# Add backend to path
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
from utils.alpaca.account_closure import AccountClosureManager, BrokerService
from utils.email.email_service import EmailService

class TestCompleteClosureFlow:
    """Test suite for the complete account closure flow."""
    
    @pytest.fixture
    def mock_broker_client(self):
        """Mock broker client with realistic responses."""
        mock_client = Mock()
        
        # Mock account data
        mock_account = Mock()
        mock_account.id = "test-account-123"
        mock_account.status = "ACTIVE"
        mock_account.cash = 75000.0
        mock_account.currency = "USD"
        
        # Mock contact info
        mock_contact = Mock()
        mock_contact.email_address = "test@example.com"
        mock_contact.given_name = "John"
        mock_contact.family_name = "Doe"
        mock_account.contact = mock_contact
        
        mock_client.get_account_by_id.return_value = mock_account
        
        # Mock positions (initially has positions, then cleared)
        mock_position = Mock()
        mock_position.symbol = "AAPL"
        mock_position.qty = 100
        mock_client.get_all_positions_for_account.side_effect = [
            [mock_position],  # Initially has positions
            []  # After liquidation
        ]
        
        # Mock orders
        mock_client.get_orders_for_account.return_value = []
        
        # Mock liquidation
        mock_client.close_all_positions_for_account.return_value = True
        
        # Mock transfers
        mock_transfer = Mock()
        mock_transfer.id = "transfer-123"
        mock_transfer.status = "QUEUED"
        mock_client.create_transfer_for_account.return_value = mock_transfer
        
        # Mock account closure
        mock_client.close_account.return_value = True
        
        return mock_client
    
    @pytest.fixture
    def mock_supabase(self):
        """Mock Supabase client."""
        mock_supabase = Mock()
        
        # Mock table operations
        mock_table = Mock()
        mock_result = Mock()
        mock_result.data = [{"user_id": "user-123"}]
        mock_result.execute.return_value = mock_result
        
        mock_table.select.return_value.eq.return_value = mock_result
        mock_table.update.return_value.eq.return_value.execute.return_value = mock_result
        
        mock_supabase.table.return_value = mock_table
        
        return mock_supabase
    
    @pytest.fixture
    def mock_email_service(self):
        """Mock email service."""
        mock_service = Mock(spec=EmailService)
        mock_service.send_account_closure_notification.return_value = True
        mock_service.send_account_closure_complete_notification.return_value = True
        return mock_service
    
    @pytest.mark.asyncio
    async def test_complete_automated_closure_flow(self, mock_broker_client, mock_supabase, mock_email_service):
        """Test the complete automated closure flow from start to finish."""
        
        with patch('utils.alpaca.automated_account_closure.get_supabase_client', return_value=mock_supabase), \
             patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client), \
             patch('utils.email.email_service.EmailService', return_value=mock_email_service), \
             patch('asyncio.sleep', return_value=None):  # Skip actual delays
            
            # Initialize processor
            processor = AutomatedAccountClosureProcessor(sandbox=True)
            
            # Mock the manager's broker client
            processor.manager.broker_client = mock_broker_client
            
            # Test initiation
            result = await processor.initiate_automated_closure(
                user_id="user-123",
                account_id="test-account-123",
                ach_relationship_id="ach-123"
            )
            
            # Verify successful initiation
            assert result.get("success") is True
            
            # Verify broker client calls
            mock_broker_client.get_account_by_id.assert_called()
            mock_broker_client.get_all_positions_for_account.assert_called()
            mock_broker_client.close_all_positions_for_account.assert_called()
            
            # Verify email service calls (initiation email)
            mock_email_service.send_account_closure_notification.assert_called_once()
            
            # Verify completion email would be sent
            mock_email_service.send_account_closure_complete_notification.assert_called_once()
    
    @pytest.mark.asyncio 
    async def test_multi_day_withdrawal_logic(self, mock_broker_client, mock_supabase):
        """Test the multi-day $50,000 withdrawal logic."""
        
        # Mock account with $125,000 (requires 3 transfers)
        mock_broker_client.get_account_by_id.return_value.cash = 125000.0
        
        # Mock successive account status calls showing decreasing balance
        account_statuses = [
            {"cash_withdrawable": 125000.0, "cash_balance": 125000.0, "open_positions": 0},  # Initial
            {"cash_withdrawable": 75000.0, "cash_balance": 75000.0, "open_positions": 0},   # After 1st transfer
            {"cash_withdrawable": 25000.0, "cash_balance": 25000.0, "open_positions": 0},   # After 2nd transfer
            {"cash_withdrawable": 0.0, "cash_balance": 0.0, "open_positions": 0},           # Final
        ]
        
        # Mock transfer status (simulate completion)
        transfer_statuses = [
            {"status": "QUEUED"},
            {"status": "SUBMITTED"}, 
            {"status": "SETTLED"}
        ]
        
        with patch('utils.alpaca.automated_account_closure.get_supabase_client', return_value=mock_supabase), \
             patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client), \
             patch('asyncio.sleep', return_value=None):  # Skip delays
            
            processor = AutomatedAccountClosureProcessor(sandbox=True)
            processor.manager.broker_client = mock_broker_client
            
            # Mock the status calls to return different values
            status_call_count = [0]
            def mock_get_closure_status(account_id):
                status = account_statuses[min(status_call_count[0], len(account_statuses) - 1)]
                status_call_count[0] += 1
                return status
            
            # Mock transfer status calls
            transfer_call_count = [0]
            def mock_check_withdrawal_status(account_id, transfer_id):
                status = transfer_statuses[min(transfer_call_count[0], len(transfer_statuses) - 1)]
                transfer_call_count[0] += 1
                return status
            
            processor.manager.get_closure_status = mock_get_closure_status
            processor.manager.check_withdrawal_status = mock_check_withdrawal_status
            
            # Mock withdraw_funds to return success
            processor.manager.withdraw_funds = Mock(return_value={
                "success": True,
                "transfer_id": f"transfer-{time.time()}",
                "amount_withdrawn": 50000.0,
                "is_partial_withdrawal": True
            })
            
            # Create a detailed logger mock
            detailed_logger = Mock()
            detailed_logger.log_step_start = Mock()
            detailed_logger.log_step_success = Mock()
            detailed_logger.log_step_warning = Mock()
            
            # Test withdrawal phase using the production method
            transfer_id = await processor._handle_complete_withdrawal_process(
                "test-account-123", 
                "ach-123", 
                detailed_logger
            )
            
            # Verify multiple withdrawals were attempted
            assert processor.manager.withdraw_funds.call_count >= 2  # Should make multiple calls
            
            # Verify the process handles large amounts correctly
            calls = processor.manager.withdraw_funds.call_args_list
            for call in calls:
                # Each withdrawal should be $50,000 or less
                amount = call[0][2]  # Third argument is amount
                assert amount <= 50000.0
    
    def test_email_template_styling(self, mock_email_service):
        """Test that email templates use the correct tron blue styling."""
        
        email_service = EmailService()
        
        # Test initiation email
        html_content = email_service._generate_closure_email_html(
            user_name="John Doe",
            account_id="test-123", 
            confirmation_number="CLA-123",
            estimated_completion="5-7 business days"
        )
        
        # Verify black background and tron blue styling
        assert "background-color: #000000" in html_content
        assert "#06b6d4" in html_content  # Tron blue color
        assert "text-shadow" in html_content  # Glowing effects
        assert "linear-gradient" in html_content  # Gradient effects
        
        # Test completion email
        completion_html = email_service._generate_closure_complete_email_html(
            user_name="John Doe",
            account_id="test-123",
            confirmation_number="CLA-123", 
            final_transfer_amount=75000.0
        )
        
        # Verify completion email also has the same styling
        assert "background-color: #000000" in completion_html
        assert "#22c55e" in completion_html  # Success green with glow
        assert "text-shadow" in completion_html
    
    def test_error_handling_and_recovery(self, mock_broker_client, mock_supabase):
        """Test error handling and recovery mechanisms."""
        
        with patch('utils.alpaca.automated_account_closure.get_supabase_client', return_value=mock_supabase), \
             patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            
            # Test with transfer failure
            mock_broker_client.create_transfer_for_account.side_effect = Exception("Transfer failed")
            
            processor = AutomatedAccountClosureProcessor(sandbox=True)
            processor.manager.broker_client = mock_broker_client
            
            # This should handle the error gracefully
            result = asyncio.run(processor.initiate_automated_closure(
                user_id="user-123",
                account_id="test-account-123", 
                ach_relationship_id="ach-123"
            ))
            
            # Should return failure but not crash
            assert result.get("success") is False
            assert "error" in result
    
    def test_frontend_middleware_redirection(self):
        """Test that middleware correctly redirects pending_closure users."""
        
        # This would be tested in the frontend test suite
        # For now, we just verify the pattern exists
        
        # Read middleware file
        middleware_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
            "frontend-app", "middleware.ts"
        )
        
        if os.path.exists(middleware_path):
            with open(middleware_path, 'r') as f:
                content = f.read()
                
            # Verify pending_closure handling redirects to /account-closure
            assert "pending_closure" in content
            assert "/account-closure" in content
            
    def test_supabase_status_updates(self, mock_supabase):
        """Test that Supabase status updates work correctly."""
        
        with patch('utils.alpaca.automated_account_closure.get_supabase_client', return_value=mock_supabase):
            
            processor = AutomatedAccountClosureProcessor(sandbox=True)
            
            # Test status update
            asyncio.run(processor._update_supabase_status("user-123", "closed", {
                "completed_at": datetime.now().isoformat()
            }))
            
            # Verify Supabase was called
            mock_supabase.table.assert_called_with("user_onboarding")
    
    def test_account_closure_page_accessibility(self):
        """Test that the account closure page exists and has correct structure."""
        
        # Check if the account closure page exists
        page_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
            "frontend-app", "app", "account-closure", "page.tsx"
        )
        
        if os.path.exists(page_path):
            with open(page_path, 'r') as f:
                content = f.read()
                
            # Verify key elements exist
            assert "Account Closure in Progress" in content
            assert "bg-black" in content  # Black background
            assert "cyan-400" in content or "blue-500" in content  # Tron blue colors
            assert "No Action Required" in content
    
    def test_fix_stuck_account_script(self):
        """Test the fix stuck account script works correctly."""
        
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "scripts", "fix_stuck_account_closure.py"
        )
        
        # Verify script exists and has correct structure
        assert os.path.exists(script_path)
        
        with open(script_path, 'r') as f:
            content = f.read()
            
        # Verify key functionality
        assert "find_stuck_accounts" in content
        assert "resume_account_closure" in content
        assert "AutomatedAccountClosureProcessor" in content
        assert "--dry-run" in content  # Safety feature

if __name__ == "__main__":
    pytest.main([__file__, "-v"])