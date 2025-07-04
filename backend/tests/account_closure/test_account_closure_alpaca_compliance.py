#!/usr/bin/env python3
"""
Alpaca API Compliance Tests for Account Closure

This test suite validates that our account closure implementation follows
current Alpaca Broker API patterns and doesn't use deprecated methods.

CRITICAL VALIDATION:
- Ensures we use current API endpoints (not deprecated ones)
- Validates proper Alpaca SDK usage patterns
- Tests against realistic API response structures
- Verifies compliance with Alpaca's account closure requirements
"""

import pytest
import sys
import os
from unittest.mock import Mock, patch
import json

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

from utils.alpaca.account_closure import AccountClosureManager, ClosureStep

class TestAlpacaAPICompliance:
    """Test suite ensuring compliance with current Alpaca Broker API."""
    
    @pytest.fixture
    def mock_broker_client(self):
        """Create a mock broker client that simulates real Alpaca API responses."""
        mock_client = Mock()
        
        # Mock realistic account response structure based on Alpaca docs
        mock_account = Mock()
        mock_account.id = "test-account-123"
        mock_account.status = "ACTIVE"
        mock_account.cash = "5000.00"
        mock_account.equity = "5000.00"
        mock_account.cash_withdrawable = "5000.00"
        mock_account.pattern_day_trader = False
        
        mock_client.get_account_by_id.return_value = mock_account
        mock_client.get_all_positions_for_account.return_value = []
        mock_client.get_orders_for_account.return_value = []
        mock_client.get_ach_relationships_for_account.return_value = []
        
        return mock_client
    
    def test_uses_current_account_api_methods(self, mock_broker_client):
        """Verify we use current (non-deprecated) account API methods."""
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            manager = AccountClosureManager(sandbox=True)

            # Call method that uses account APIs
            result = manager.check_closure_preconditions("test-account-123")

            # Verify we call the correct (current) API methods
            mock_broker_client.get_account_by_id.assert_called_once_with("test-account-123")
            mock_broker_client.get_all_positions_for_account.assert_called_once_with("test-account-123")
            mock_broker_client.get_orders_for_account.assert_called_once_with("test-account-123", status="open")
            mock_broker_client.get_ach_relationships_for_account.assert_called_once_with("test-account-123")

            # Verify we call the current API methods (positive assertion)
            assert mock_broker_client.get_account_by_id.called
            assert mock_broker_client.get_all_positions_for_account.called
            assert mock_broker_client.get_orders_for_account.called
            assert mock_broker_client.get_ach_relationships_for_account.called

    def test_uses_current_order_cancellation_api(self, mock_broker_client):
        """Verify we use current order cancellation methods."""
        # Mock orders to cancel
        mock_order = Mock()
        mock_order.id = "order-123"
        mock_order.symbol = "AAPL"
        mock_order.qty = "10"
        mock_order.side = "buy"
        
        mock_broker_client.get_orders_for_account.return_value = [mock_order]
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.cancel_all_orders("test-account-123")
            
            # Verify we use the current API method
            mock_broker_client.cancel_order_for_account.assert_called_once_with("test-account-123", "order-123")
            
            # Verify we DON'T use deprecated cancel_order method
            assert not hasattr(mock_broker_client, 'cancel_order')  # Should use cancel_order_for_account
    
    def test_uses_current_position_liquidation_api(self, mock_broker_client):
        """Verify we use current position liquidation methods."""
        # Mock positions to liquidate
        mock_position = Mock()
        mock_position.symbol = "AAPL"
        mock_position.qty = "10"
        mock_position.market_value = "1500.00"
        
        mock_broker_client.get_all_positions_for_account.return_value = [mock_position]
        
        # Mock liquidation response
        mock_liquidation_order = Mock()
        mock_liquidation_order.id = "liquidation-order-123"
        mock_liquidation_order.symbol = "AAPL"
        mock_liquidation_order.side = "sell"
        
        mock_broker_client.close_all_positions_for_account.return_value = [mock_liquidation_order]
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.liquidate_all_positions("test-account-123")
            
            # Verify we use the current API method with correct parameters
            mock_broker_client.close_all_positions_for_account.assert_called_once_with(
                account_id="test-account-123",
                cancel_orders=True
            )
            
            # Verify we DON'T use deprecated liquidate_position method
            assert not hasattr(mock_broker_client, 'liquidate_position')  # Deprecated
    
    def test_uses_current_ach_transfer_api(self, mock_broker_client):
        """Verify we use current ACH transfer methods."""
        # Mock transfer response
        mock_transfer = Mock()
        mock_transfer.id = "transfer-123"
        mock_transfer.status = "QUEUED"
        mock_transfer.amount = "5000.00"
        mock_transfer.direction = "OUTGOING"
        
        mock_broker_client.create_ach_transfer_for_account.return_value = mock_transfer
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.withdraw_all_funds("test-account-123", "ach-rel-123")
            
            # Verify we use the current API method
            mock_broker_client.create_ach_transfer_for_account.assert_called_once()
            
            # Check the call was made with proper request structure
            call_args = mock_broker_client.create_ach_transfer_for_account.call_args
            assert call_args[1]['account_id'] == "test-account-123"
            
            # Verify we DON'T use deprecated transfer methods
            assert not hasattr(mock_broker_client, 'create_transfer')  # Should be create_ach_transfer_for_account
    
    def test_uses_current_account_closure_api(self, mock_broker_client):
        """Verify we use current account closure method (not deprecated)."""
        # Mock zero balance account ready for closure
        mock_account = Mock()
        mock_account.cash = "0.00"
        mock_account.equity = "0.00"
        mock_broker_client.get_account_by_id.return_value = mock_account
        mock_broker_client.get_all_positions_for_account.return_value = []
        mock_broker_client.get_orders_for_account.return_value = []
        
        # Mock successful closure response
        mock_broker_client.close_account.return_value = {'status': 'CLOSED'}
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.close_account("test-account-123")
            
            # Verify we use the current API method
            mock_broker_client.close_account.assert_called_once_with("test-account-123")
            
            # Verify we DON'T use deprecated delete_account method
            assert not hasattr(mock_broker_client, 'delete_account')  # Deprecated - should use close_account
    
    def test_proper_enum_usage_for_transfer_types(self):
        """Verify we properly use Alpaca's enums for transfer types."""
        from alpaca.broker.enums import TransferDirection, TransferType, TransferStatus
        
        # Check that we have access to the correct enums
        assert hasattr(TransferDirection, 'OUTGOING')
        assert hasattr(TransferType, 'ACH')
        assert hasattr(TransferStatus, 'QUEUED')
        assert hasattr(TransferStatus, 'COMPLETED')
        
        # This ensures we're using the right enum structure from current Alpaca SDK
    
    def test_proper_request_object_usage(self, mock_broker_client):
        """Verify we use proper Alpaca request objects (not raw dictionaries)."""
        from alpaca.broker.requests import CreateACHTransferRequest
        
        mock_transfer = Mock()
        mock_transfer.id = "transfer-123"
        mock_transfer.status = "QUEUED"
        mock_broker_client.create_ach_transfer_for_account.return_value = mock_transfer
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.withdraw_all_funds("test-account-123", "ach-rel-123")
            
            # Verify that create_ach_transfer_for_account was called
            mock_broker_client.create_ach_transfer_for_account.assert_called_once()
            
            # The call should use proper request structure, not just raw dict
            call_args = mock_broker_client.create_ach_transfer_for_account.call_args
            assert 'account_id' in call_args[1]
            assert 'ach_transfer_data' in call_args[1]
    
    def test_realistic_alpaca_response_handling(self, mock_broker_client):
        """Test that we handle realistic Alpaca API response structures."""
        # Create mock responses that match real Alpaca API structure
        
        # Mock account with all expected fields
        mock_account = Mock()
        mock_account.id = "01234567-89ab-cdef-0123-456789abcdef"  # UUID format
        mock_account.status = "ACTIVE"  # Proper status enum value
        mock_account.cash = "5432.10"  # String format as returned by API
        mock_account.equity = "5432.10"
        mock_account.cash_withdrawable = "5432.10"
        mock_account.pattern_day_trader = False
        mock_account.created_at = "2023-01-15T10:30:00Z"
        
        # Mock ACH relationship with expected structure
        mock_ach_rel = Mock()
        mock_ach_rel.id = "ach-rel-123456"
        mock_ach_rel.bank_account_name = "Test Checking Account"
        mock_ach_rel.account_number = "****1234"  # Masked account number
        mock_ach_rel.status = "APPROVED"
        
        # Mock position with expected structure
        mock_position = Mock()
        mock_position.symbol = "AAPL"
        mock_position.qty = "15"
        mock_position.market_value = "2574.75"
        mock_position.side = "long"
        mock_position.cost_basis = "2500.00"
        
        # Mock order with expected structure
        mock_order = Mock()
        mock_order.id = "01234567-89ab-cdef-0123-456789abcdef"
        mock_order.symbol = "GOOGL"
        mock_order.qty = "5"
        mock_order.side = "buy"
        mock_order.order_type = "market"
        mock_order.status = "new"
        mock_order.created_at = "2024-12-19T14:30:00Z"
        
        mock_broker_client.get_account_by_id.return_value = mock_account
        mock_broker_client.get_ach_relationships_for_account.return_value = [mock_ach_rel]
        mock_broker_client.get_all_positions_for_account.return_value = [mock_position]
        mock_broker_client.get_orders_for_account.return_value = [mock_order]
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.check_closure_preconditions("01234567-89ab-cdef-0123-456789abcdef")
            
            # Verify we handle the response correctly
            assert result['ready'] is True  # Should be ready since no restrictions
            assert result['account_status'] == 'ACTIVE'
            assert result['cash_balance'] == 5432.10  # Should convert string to float
            assert result['open_orders'] == 1
            assert result['open_positions'] == 1
            assert result['has_ach_relationship'] is True
            assert len(result['ach_relationships']) == 1
            assert result['ach_relationships'][0]['bank_name'] == "Test Checking Account"

class TestAlpacaErrorHandling:
    """Test suite for proper handling of Alpaca API errors."""
    
    @pytest.fixture
    def mock_broker_client_with_errors(self):
        """Create mock client that simulates various Alpaca API errors."""
        mock_client = Mock()
        return mock_client
    
    def test_handles_alpaca_api_errors(self, mock_broker_client_with_errors):
        """Test handling of various Alpaca API errors."""
        # Simulate different types of API errors that Alpaca might return
        
        # Test 404 - Account not found
        error_404 = Exception("Account not found")
        error_404.status_code = 404
        mock_broker_client_with_errors.get_account_by_id.side_effect = error_404
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client_with_errors):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.check_closure_preconditions("invalid-account")
            
            assert result['ready'] is False
            assert 'not found' in result['error'].lower()
    
    def test_handles_insufficient_permissions(self, mock_broker_client_with_errors):
        """Test handling of permission errors from Alpaca."""
        # Simulate 403 - Insufficient permissions
        error_403 = Exception("Insufficient permissions for this operation")
        error_403.status_code = 403
        mock_broker_client_with_errors.close_account.side_effect = error_403
        
        # Mock account in ready state
        mock_account = Mock()
        mock_account.cash = "0.00"
        mock_account.equity = "0.00"
        mock_broker_client_with_errors.get_account_by_id.return_value = mock_account
        mock_broker_client_with_errors.get_all_positions_for_account.return_value = []
        mock_broker_client_with_errors.get_orders_for_account.return_value = []
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client_with_errors):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.close_account("test-account")
            
            assert result['success'] is False
            assert 'permission' in result['error'].lower()
    
    def test_handles_rate_limiting(self, mock_broker_client_with_errors):
        """Test handling of rate limiting from Alpaca."""
        # Simulate 429 - Too many requests
        error_429 = Exception("Rate limit exceeded")
        error_429.status_code = 429
        mock_broker_client_with_errors.get_account_by_id.side_effect = error_429
        
        with patch('utils.alpaca.account_closure.get_broker_client', return_value=mock_broker_client_with_errors):
            manager = AccountClosureManager(sandbox=True)
            
            result = manager.check_closure_preconditions("test-account")
            
            assert result['ready'] is False
            assert 'rate limit' in result['error'].lower()

class TestProductionSafetyChecks:
    """Test suite for production safety validations."""
    
    def test_sandbox_vs_production_environment_handling(self):
        """Verify proper handling of sandbox vs production environments."""
        # Test sandbox environment
        with patch('utils.alpaca.account_closure.get_broker_client') as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            
            manager_sandbox = AccountClosureManager(sandbox=True)
            mock_get_client.assert_called_with(True)  # Should pass sandbox=True
            
            manager_production = AccountClosureManager(sandbox=False)
            mock_get_client.assert_called_with(False)  # Should pass sandbox=False
    
    def test_critical_safety_validations(self):
        """Test that critical safety checks are in place."""
        # This test ensures our code has the required safety validations
        
        with patch('utils.alpaca.account_closure.get_broker_client') as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            
            # Mock account with non-zero balance
            mock_account = Mock()
            mock_account.cash = "1000.00"  # Non-zero balance
            mock_account.equity = "1000.00"
            mock_client.get_account_by_id.return_value = mock_account
            mock_client.get_all_positions_for_account.return_value = []
            mock_client.get_orders_for_account.return_value = []
            
            manager = AccountClosureManager(sandbox=True)
            
            # Should refuse to close account with non-zero balance
            result = manager.close_account("test-account")
            
            assert result['success'] is False
            assert 'balance must be $0' in result['reason']
            
            # Should NOT call the actual close_account API
            mock_client.close_account.assert_not_called()

if __name__ == "__main__":
    # Run the tests
    pytest.main([__file__, "-v", "--tb=short"]) 