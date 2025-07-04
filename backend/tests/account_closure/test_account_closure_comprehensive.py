#!/usr/bin/env python3
"""
Comprehensive Production-Grade Tests for Account Closure Functionality

This test suite provides extensive coverage for the critical account closure feature,
including edge cases, error conditions, and API integration testing.

CRITICAL SAFETY CHECKS:
- Tests current (non-deprecated) Alpaca API patterns
- Validates all preconditions before closure
- Tests Pattern Day Trader restrictions
- Verifies settlement waiting periods
- Tests ACH withdrawal workflows
- Ensures $0 balance requirement before closure
"""

import pytest
import asyncio
import sys
import os
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, Any, List

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import modules under test
from utils.alpaca.account_closure import (
    AccountClosureManager, 
    ClosureStep,
    check_account_closure_readiness,
    initiate_account_closure,
    get_closure_progress
)

# Mock classes to simulate Alpaca API objects
class MockAccount:
    def __init__(self, **kwargs):
        self.cash = kwargs.get('cash', '1000.00')
        self.equity = kwargs.get('equity', '1000.00')
        self.status = kwargs.get('status', 'ACTIVE')
        # Add cash_withdrawable as a proper attribute
        self.cash_withdrawable = kwargs.get('cash_withdrawable', self.cash)
        self.pattern_day_trader = kwargs.get('pattern_day_trader', False)
        
    def __len__(self):
        # Accounts are singular objects, so return 1 if active, 0 if not
        return 1 if self.status == 'ACTIVE' else 0

class MockPosition:
    def __init__(self, **kwargs):
        self.symbol = kwargs.get('symbol', 'AAPL')
        self.qty = kwargs.get('qty', '10')
        self.market_value = kwargs.get('market_value', '1500.00')
        self.side = kwargs.get('side', 'long')
        
    def __len__(self):
        return 1

class MockOrder:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'order-123')
        self.symbol = kwargs.get('symbol', 'AAPL')
        self.qty = kwargs.get('qty', '10')
        self.side = kwargs.get('side', 'buy')
        self.status = kwargs.get('status', 'new')
        
    def __len__(self):
        return 1

class MockACHRelationship:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'ach-123')
        self.status = kwargs.get('status', 'ACTIVE')
        
    def __len__(self):
        return 1

class MockTransfer:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'transfer-123')
        self.status = kwargs.get('status', 'QUEUED')
        self.amount = kwargs.get('amount', '1000.00')
        self.direction = kwargs.get('direction', 'OUTGOING')
        
    def __len__(self):
        return 1

class TestAccountClosureManager:
    """Test suite for AccountClosureManager class."""

    @pytest.fixture
    def closure_manager(self):
        """Create AccountClosureManager instance for testing."""
        with patch('utils.alpaca.account_closure.get_broker_client') as mock_client_factory:
            mock_client = Mock()
            mock_client_factory.return_value = mock_client
            manager = AccountClosureManager(sandbox=True)
            manager.broker_client = mock_client
            return manager

    def test_check_closure_preconditions_healthy_account(self, closure_manager):
        """Test precondition check for a healthy account ready for closure."""
        # Mock Alpaca API responses
        mock_account = MockAccount(
            status='ACTIVE',
            cash='5000.00',
            equity='5000.00',
            cash_withdrawable='5000.00',
            pattern_day_trader=False
        )
        mock_positions = []  # No positions
        mock_orders = []     # No open orders
        mock_ach_rels = [MockACHRelationship()]
        
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = mock_positions
        closure_manager.broker_client.get_orders_for_account.return_value = mock_orders
        closure_manager.broker_client.get_ach_relationships_for_account.return_value = mock_ach_rels
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is True
        assert result['account_status'] == 'ACTIVE'
        assert result['open_orders'] == 0
        assert result['open_positions'] == 0
        assert result['cash_balance'] == 5000.00
        assert result['has_ach_relationship'] is True
        assert len(result['ach_relationships']) == 1

    def test_check_closure_preconditions_inactive_account(self, closure_manager):
        """Test precondition check for inactive account - should fail."""
        mock_account = MockAccount(status='INACTIVE')
        
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        closure_manager.broker_client.get_orders_for_account.return_value = []
        closure_manager.broker_client.get_ach_relationships_for_account.return_value = []
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'INACTIVE' in result['reason']
        assert result['account_status'] == 'INACTIVE'

    def test_check_closure_preconditions_pdt_restriction(self, closure_manager):
        """Test Pattern Day Trader restriction - should fail if equity < $25k."""
        mock_account = MockAccount(
            status='ACTIVE',
            cash='20000.00',
            equity='20000.00',  # Below $25k threshold
            pattern_day_trader=True
        )
        
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        closure_manager.broker_client.get_orders_for_account.return_value = []
        closure_manager.broker_client.get_ach_relationships_for_account.return_value = []
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'Pattern Day Trader' in result['reason']
        assert result['pattern_day_trader'] is True
        assert result['equity'] == 20000.00

    def test_check_closure_preconditions_pdt_sufficient_equity(self, closure_manager):
        """Test PDT account with sufficient equity - should pass."""
        mock_account = MockAccount(
            status='ACTIVE',
            cash='30000.00',
            equity='30000.00',  # Above $25k threshold
            pattern_day_trader=True
        )
        
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        closure_manager.broker_client.get_orders_for_account.return_value = []
        closure_manager.broker_client.get_ach_relationships_for_account.return_value = [MockACHRelationship()]
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is True
        assert result['equity'] == 30000.00

    def test_cancel_all_orders_success(self, closure_manager):
        """Test successful cancellation of all orders."""
        mock_orders = [
            MockOrder(id='order-1', symbol='AAPL', qty='10', side='buy'),
            MockOrder(id='order-2', symbol='GOOGL', qty='5', side='sell')
        ]
        
        closure_manager.broker_client.get_orders_for_account.return_value = mock_orders
        closure_manager.broker_client.cancel_order_for_account.return_value = None
        
        result = closure_manager.cancel_all_orders('test-account-123')
        
        assert result['success'] is True
        assert result['orders_canceled'] == 2
        assert result['orders_failed'] == 0
        assert len(result['canceled_orders']) == 2
        assert closure_manager.broker_client.cancel_order_for_account.call_count == 2

    def test_cancel_all_orders_no_orders(self, closure_manager):
        """Test order cancellation when no orders exist."""
        closure_manager.broker_client.get_orders_for_account.return_value = []
        
        result = closure_manager.cancel_all_orders('test-account-123')
        
        assert result['success'] is True
        assert result['orders_canceled'] == 0
        assert 'No open orders' in result['message']

    def test_cancel_all_orders_partial_failure(self, closure_manager):
        """Test order cancellation with some failures."""
        mock_orders = [
            MockOrder(id='order-1', symbol='AAPL'),
            MockOrder(id='order-2', symbol='GOOGL')
        ]
        
        closure_manager.broker_client.get_orders_for_account.return_value = mock_orders
        
        def side_effect(account_id, order_id):
            if order_id == 'order-2':
                raise Exception("Order cannot be canceled")
            return None
        
        closure_manager.broker_client.cancel_order_for_account.side_effect = side_effect
        
        result = closure_manager.cancel_all_orders('test-account-123')
        
        assert result['success'] is False  # Not all orders canceled
        assert result['orders_canceled'] == 1
        assert result['orders_failed'] == 1
        assert len(result['failed_orders']) == 1

    def test_liquidate_all_positions_success(self, closure_manager):
        """Test successful liquidation of all positions."""
        mock_positions = [
            MockPosition(symbol='AAPL', qty='10'),
            MockPosition(symbol='GOOGL', qty='5')
        ]
        
        mock_liquidation_orders = [
            MockOrder(id='liq-1', symbol='AAPL', side='sell'),
            MockOrder(id='liq-2', symbol='GOOGL', side='sell')
        ]
        
        closure_manager.broker_client.get_all_positions_for_account.return_value = mock_positions
        closure_manager.broker_client.close_all_positions_for_account.return_value = mock_liquidation_orders
        
        result = closure_manager.liquidate_all_positions('test-account-123')
        
        assert result['success'] is True
        assert result['positions_liquidated'] == 2
        assert len(result['liquidation_orders']) == 2

    def test_liquidate_all_positions_no_positions(self, closure_manager):
        """Test liquidation when no positions exist."""
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        
        result = closure_manager.liquidate_all_positions('test-account-123')
        
        assert result['success'] is True
        assert result['positions_liquidated'] == 0
        assert 'No positions' in result['message']

    def test_check_settlement_status_settled(self, closure_manager):
        """Test settlement status check when trades are settled."""
        # Mock no pending trades (all settled)
        closure_manager.broker_client.get_orders_for_account.return_value = []
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        
        mock_account = MockAccount(cash='5000.00', cash_withdrawable='5000.00')
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        
        result = closure_manager.check_settlement_status('test-account-123')
        
        assert result['settlement_complete'] is True
        assert result['cash_available_for_withdrawal'] == 5000.00

    def test_check_settlement_status_pending(self, closure_manager):
        """Test settlement status when settlement is still pending."""
        mock_account = MockAccount(
            cash='5000.00', 
            cash_withdrawable='3000.00'  # Less than total cash indicates pending settlement
        )
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        # Properly mock positions as an empty list (no positions, but settlement pending)
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        
        result = closure_manager.check_settlement_status('test-account-123')
        
        assert result['settlement_complete'] is False
        assert result['cash_available_for_withdrawal'] == 3000.00
        assert result['pending_settlement'] == 2000.00

    def test_withdraw_all_funds_success(self, closure_manager):
        """Test successful ACH withdrawal."""
        # Mock account with withdrawable funds
        mock_account = MockAccount(cash_withdrawable='1000.00')
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        
        mock_transfer = MockTransfer(id='transfer-123', status='QUEUED')
        closure_manager.broker_client.create_ach_transfer_for_account.return_value = mock_transfer
        
        result = closure_manager.withdraw_all_funds('test-account-123', '12345678-1234-1234-1234-123456789012')
        
        assert result['success'] is True
        assert result['transfer_id'] == 'transfer-123'
        assert result['transfer_status'] == 'QUEUED'

    def test_withdraw_all_funds_insufficient_balance(self, closure_manager):
        """Test withdrawal failure due to insufficient balance."""
        # Mock account with zero withdrawable funds
        mock_account = MockAccount(cash_withdrawable='0.00')
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        
        result = closure_manager.withdraw_all_funds('test-account-123', '12345678-1234-1234-1234-123456789012')
        
        assert result['success'] is False
        assert 'withdrawable funds' in result['error']

    def test_check_withdrawal_status_completed(self, closure_manager):
        """Test checking withdrawal status - completed."""
        mock_transfer = MockTransfer(status='COMPLETED')
        closure_manager.broker_client.get_transfer_for_account.return_value = mock_transfer
        
        result = closure_manager.check_withdrawal_status('test-account-123', 'transfer-123')
        
        assert result['transfer_completed'] is True
        assert result['transfer_status'] == 'COMPLETED'

    def test_check_withdrawal_status_pending(self, closure_manager):
        """Test checking withdrawal status - still pending."""
        mock_transfer = MockTransfer(status='PENDING')
        closure_manager.broker_client.get_transfer_for_account.return_value = mock_transfer
        
        result = closure_manager.check_withdrawal_status('test-account-123', 'transfer-123')
        
        assert result['transfer_completed'] is False
        assert result['transfer_status'] == 'PENDING'

    def test_close_account_success(self, closure_manager):
        """Test successful account closure."""
        # Mock zero balance account
        mock_account = MockAccount(cash='0.00', equity='0.00')
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        closure_manager.broker_client.get_orders_for_account.return_value = []
        
        # Mock successful closure
        closure_manager.broker_client.close_account.return_value = {'status': 'CLOSED'}
        
        result = closure_manager.close_account('test-account-123')
        
        assert result['success'] is True
        assert result['account_status'] == 'CLOSED'

    def test_close_account_non_zero_balance(self, closure_manager):
        """Test account closure failure due to non-zero balance."""
        mock_account = MockAccount(cash='100.00', equity='100.00')  # Non-zero balance
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        closure_manager.broker_client.get_orders_for_account.return_value = []
        
        result = closure_manager.close_account('test-account-123')
        
        assert result['success'] is False
        assert 'balance must be $0' in result['reason']

    def test_close_account_with_open_positions(self, closure_manager):
        """Test account closure failure due to open positions."""
        mock_account = MockAccount(cash='0.00', equity='0.00')
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = [MockPosition()]  # Has position
        closure_manager.broker_client.get_orders_for_account.return_value = []
        
        result = closure_manager.close_account('test-account-123')
        
        assert result['success'] is False
        assert 'open positions' in result['reason']

class TestAccountClosureAPI:
    """Test suite for account closure API functions."""

    @patch('utils.alpaca.account_closure.AccountClosureManager')
    def test_check_account_closure_readiness_ready(self, mock_manager_class):
        """Test API function for checking closure readiness - account ready."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        mock_manager.check_closure_preconditions.return_value = {
            'ready': True,
            'account_status': 'ACTIVE',
            'open_orders': 0,
            'open_positions': 0,
            'cash_balance': 5000.00,
            'has_ach_relationship': True
        }
        
        result = check_account_closure_readiness('test-account-123', sandbox=True)
        
        assert result['ready'] is True
        mock_manager.check_closure_preconditions.assert_called_once_with('test-account-123')

    @patch('utils.alpaca.account_closure.AccountClosureManager')
    def test_check_account_closure_readiness_not_ready(self, mock_manager_class):
        """Test API function for checking closure readiness - account not ready."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        mock_manager.check_closure_preconditions.return_value = {
            'ready': False,
            'reason': 'Account has open positions',
            'open_positions': 3
        }
        
        result = check_account_closure_readiness('test-account-123', sandbox=True)
        
        assert result['ready'] is False
        assert 'open positions' in result['reason']

    @patch('utils.alpaca.account_closure.AccountClosureManager')
    def test_initiate_account_closure_success(self, mock_manager_class):
        """Test API function for initiating closure - success with 2025 combined API."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        # Mock successful precondition check
        mock_manager.check_closure_preconditions.return_value = {'ready': True}
        
        # Mock successful combined liquidation (2025 API does cancel + liquidate together)
        mock_manager.liquidate_all_positions.return_value = {
            'success': True,
            'positions_liquidated': 1,
            'liquidation_orders': [
                {'order_id': '12345', 'symbol': 'AAPL', 'side': 'sell'}
            ]
        }
        
        # Mock post-liquidation status check
        mock_manager.get_closure_status.return_value = {
            'account_status': 'ACTIVE',
            'open_positions': 0,
            'open_orders': 0,
            'cash_balance': 1000.00
        }
        
        # Mock broker client calls for data logging
        mock_manager.broker_client.get_account_by_id.return_value = MockAccount(status='ACTIVE')
        mock_manager.broker_client.get_all_positions_for_account.return_value = []
        mock_manager.broker_client.get_orders_for_account.return_value = []
        
        result = initiate_account_closure('test-account-123', '12345678-1234-1234-1234-123456789012', sandbox=True)
        
        assert result['success'] is True
        assert result['step'] == ClosureStep.WAITING_SETTLEMENT.value
        assert 'liquidation_orders' in result  # 2025 API returns liquidation orders instead of separate counts
        assert 'positions_liquidated' in result
        assert result['message'] == "Account closure process initiated. Orders canceled and positions liquidated."

    @patch('utils.alpaca.account_closure.AccountClosureManager')
    def test_initiate_account_closure_not_ready(self, mock_manager_class):
        """Test API function for initiating closure - preconditions not met."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        mock_manager.check_closure_preconditions.return_value = {
            'ready': False,
            'reason': 'Account has Pattern Day Trader restrictions'
        }
        
        result = initiate_account_closure('test-account-123', '12345678-1234-1234-1234-123456789012', sandbox=True)
        
        assert result['success'] is False
        assert 'Pattern Day Trader' in result['reason']

class TestEdgeCasesAndErrorHandling:
    """Test suite for edge cases and error conditions."""

    @pytest.fixture
    def closure_manager(self):
        """Create AccountClosureManager instance for testing."""
        with patch('utils.alpaca.account_closure.get_broker_client') as mock_client_factory:
            mock_client = Mock()
            mock_client_factory.return_value = mock_client
            manager = AccountClosureManager(sandbox=True)
            manager.broker_client = mock_client
            return manager

    def test_api_timeout_handling(self, closure_manager):
        """Test handling of API timeouts."""
        from requests.exceptions import Timeout
        
        closure_manager.broker_client.get_account_by_id.side_effect = Timeout("API timeout")
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'timeout' in result['error'].lower()

    def test_network_error_handling(self, closure_manager):
        """Test handling of network errors."""
        from requests.exceptions import ConnectionError
        
        closure_manager.broker_client.get_account_by_id.side_effect = ConnectionError("Network error")
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'network' in result['error'].lower()

    def test_alpaca_api_error_handling(self, closure_manager):
        """Test handling of Alpaca API errors."""
        # Create a mock API error instead of importing
        # Mock APIError with realistic error structure
        api_error = Exception("Account not found")
        api_error.status_code = 404
        
        closure_manager.broker_client.get_account_by_id.side_effect = api_error
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'not found' in result['error'].lower()

    def test_insufficient_permissions_error(self, closure_manager):
        """Test handling of insufficient permissions."""
        permission_error = Exception("Insufficient permissions for account closure")
        
        closure_manager.broker_client.close_account.side_effect = permission_error
        
        # Mock zero balance account ready for closure
        mock_account = MockAccount(cash='0.00', equity='0.00')
        closure_manager.broker_client.get_account_by_id.return_value = mock_account
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        closure_manager.broker_client.get_orders_for_account.return_value = []
        
        result = closure_manager.close_account('test-account-123')
        
        assert result['success'] is False
        assert 'permissions' in result['error'].lower()

    def test_concurrent_modification_handling(self, closure_manager):
        """Test handling of concurrent account modifications."""
        # Simulate account being modified between checks using side_effect
        account_responses = [
            MockAccount(cash='1000.00', equity='1000.00', status='ACTIVE'),  # First call
            MockAccount(cash='500.00', equity='1500.00', status='ACTIVE')    # Second call - changed
        ]
        
        closure_manager.broker_client.get_account_by_id.side_effect = account_responses
        closure_manager.broker_client.get_all_positions_for_account.return_value = []
        closure_manager.broker_client.get_orders_for_account.return_value = []
        closure_manager.broker_client.get_ach_relationships_for_account.return_value = [MockACHRelationship()]
        
        # First check should pass
        result1 = closure_manager.check_closure_preconditions('test-account-123')
        assert result1['ready'] is True
        assert result1['equity'] == 1000.00
        
        # Second check should detect change
        result2 = closure_manager.check_closure_preconditions('test-account-123')
        assert result2['equity'] == 1500.00  # Account changed
        assert result2['cash_balance'] == 500.00  # Cash also changed

class TestProductionReadiness:
    """Test suite to ensure production readiness."""

    def test_current_alpaca_api_patterns(self):
        """Verify we're using current (non-deprecated) Alpaca API patterns."""
        # This test ensures we're following current API patterns
        import inspect
        from utils.alpaca.account_closure import AccountClosureManager
        
        # Get all methods
        methods = inspect.getmembers(AccountClosureManager, predicate=inspect.isfunction)
        
        # Check for deprecated patterns (these should NOT be found)
        deprecated_patterns = [
            'delete_account',  # Deprecated - should use close_account
            'liquidate_position(',  # Deprecated function call - should use close_all_positions_for_account
        ]
        
        # Read the source code
        source_file = inspect.getfile(AccountClosureManager)
        with open(source_file, 'r') as f:
            source_code = f.read()
        
        for pattern in deprecated_patterns:
            assert pattern not in source_code, f"Found deprecated API pattern: {pattern}"
        
        # Check for current patterns (these SHOULD be found)
        current_patterns = [
            'close_account',  # Current API
            'close_all_positions_for_account',  # Current API
            'create_ach_transfer_for_account',  # Current API
        ]
        
        for pattern in current_patterns:
            assert pattern in source_code, f"Missing current API pattern: {pattern}"

    def test_closure_step_enum_completeness(self):
        """Verify ClosureStep enum covers all necessary states."""
        from utils.alpaca.account_closure import ClosureStep
        
        required_steps = [
            'INITIATED',
            'CANCELING_ORDERS', 
            'LIQUIDATING_POSITIONS',
            'WAITING_SETTLEMENT',
            'WITHDRAWING_FUNDS',
            'CLOSING_ACCOUNT',
            'COMPLETED',
            'FAILED'
        ]
        
        enum_values = [step.name for step in ClosureStep]
        
        for step in required_steps:
            assert step in enum_values, f"Missing required closure step: {step}"

    def test_error_logging_coverage(self):
        """Verify comprehensive error logging for audit trails."""
        import inspect
        from utils.alpaca.account_closure import AccountClosureManager
        
        # Get source code
        source_file = inspect.getfile(AccountClosureManager)
        with open(source_file, 'r') as f:
            source_code = f.read()
        
        # Check that logger.error() is used in exception handlers
        error_patterns = [
            'logger.error',
            'except Exception as e:',
            'except',
        ]
        
        for pattern in error_patterns:
            assert pattern in source_code, f"Missing error handling pattern: {pattern}"

if __name__ == "__main__":
    # Run the tests
    pytest.main([__file__, "-v", "--tb=short"])