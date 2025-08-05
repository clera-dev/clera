#!/usr/bin/env python3
"""
Comprehensive Production-Grade Tests for Account Closure Functionality

This test suite provides extensive coverage for the critical account closure feature,
testing the ACTUAL current implementation with service-based architecture.

CRITICAL SAFETY CHECKS:
- Tests current service-based architecture (BrokerService, ClosureStateManager, AccountClosureManager)
- Validates all preconditions before closure
- Tests the actual automated closure process
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
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

# Import modules under test - ACTUAL current implementation
from utils.alpaca.account_closure import (
    AccountClosureManager, 
    BrokerService,
    ClosureStateManager,
    ClosureStep,
    check_account_closure_readiness,
    initiate_account_closure,
    get_closure_progress
)

from utils.alpaca.automated_account_closure import (
    AutomatedAccountClosureProcessor,
    ClosureProcessStatus
)

# Mock classes to simulate Alpaca API objects
class MockAccount:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'test-account-123')
        self.status = kwargs.get('status', 'ACTIVE')
        self.created_at = kwargs.get('created_at', datetime.now())
        
class MockTradeAccount:
    def __init__(self, **kwargs):
        self.cash = kwargs.get('cash', '1000.00')
        self.cash_withdrawable = kwargs.get('cash_withdrawable', '1000.00')
        self.equity = kwargs.get('equity', '1000.00')
        self.pattern_day_trader = kwargs.get('pattern_day_trader', False)

class MockPosition:
    def __init__(self, **kwargs):
        self.symbol = kwargs.get('symbol', 'AAPL')
        self.qty = kwargs.get('qty', '10')
        self.market_value = kwargs.get('market_value', '1500.00')
        self.side = kwargs.get('side', 'long')

class MockOrder:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'order-123')
        self.symbol = kwargs.get('symbol', 'AAPL')
        self.qty = kwargs.get('qty', '10')
        self.side = kwargs.get('side', 'buy')
        self.status = kwargs.get('status', 'new')

class MockTransfer:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'transfer-123')
        self.status = kwargs.get('status', 'QUEUED')
        self.amount = kwargs.get('amount', '1000.00')
        self.direction = kwargs.get('direction', 'OUTGOING')
        
class TestBrokerService:
    """Test suite for BrokerService class - the actual current implementation."""

    @pytest.fixture
    def broker_service(self):
        """Create BrokerService instance for testing."""
        mock_broker_client = Mock()
        return BrokerService(mock_broker_client)

    def test_get_account_info_success(self, broker_service):
        """Test successful account info retrieval."""
        # Setup mocks
        mock_account = MockAccount(status='ACTIVE')
        mock_trade_account = MockTradeAccount(cash='5000.00', cash_withdrawable='5000.00')
        mock_positions = []
        mock_orders = []
        
        broker_service.broker_client.get_account_by_id.return_value = mock_account
        broker_service.broker_client.get_trade_account_by_id.return_value = mock_trade_account
        broker_service.broker_client.get_all_positions_for_account.return_value = mock_positions
        broker_service.broker_client.get_orders_for_account.return_value = mock_orders
        
        result = broker_service.get_account_info('test-account-123')
        
        assert result['account'] == mock_account
        assert result['trade_account'] == mock_trade_account
        assert result['positions'] == mock_positions
        assert result['orders'] == mock_orders
        assert result['cash_balance'] == 5000.00
        assert result['cash_withdrawable'] == 5000.00

    def test_liquidate_positions_success(self, broker_service):
        """Test successful position liquidation."""
        mock_positions = [
            MockPosition(symbol='AAPL', qty='10'),
            MockPosition(symbol='GOOGL', qty='5')
        ]
        mock_orders = [Mock(), Mock()]  # Mock liquidation orders
        
        broker_service.broker_client.get_all_positions_for_account.return_value = mock_positions
        broker_service.broker_client.close_position_for_account.side_effect = mock_orders
        
        result = broker_service.liquidate_positions('test-account-123')
        
        assert result['success'] is True
        assert result['liquidation_orders'] == 2
        assert 'liquidation of 2 positions' in result['message']

    def test_liquidate_positions_no_positions(self, broker_service):
        """Test liquidation when no positions exist."""
        broker_service.broker_client.get_all_positions_for_account.return_value = []
        
        result = broker_service.liquidate_positions('test-account-123')
        
        assert result['success'] is True
        assert 'No positions to liquidate' in result['message']

    def test_withdraw_funds_success(self, broker_service):
        """Test successful funds withdrawal."""
        mock_transfer = MockTransfer(id='transfer-123', status='QUEUED', amount='1000.00')
        broker_service.broker_client.create_ach_transfer_for_account.return_value = mock_transfer
        
        # Use a valid UUID format for relationship_id
        result = broker_service.withdraw_funds('test-account-123', '12345678-1234-1234-1234-123456789012', 1000.00)
        
        assert result['success'] is True
        assert result['transfer_id'] == 'transfer-123'
        assert result['amount'] == 1000.00
        assert result['status'] == 'QUEUED'

    def test_close_account_success(self, broker_service):
        """Test successful account closure."""
        broker_service.broker_client.close_account.return_value = None
        
        result = broker_service.close_account('test-account-123')
        
        assert result['success'] is True
        assert 'Account closure initiated' in result['message']

class TestClosureStateManager:
    """Test suite for ClosureStateManager class."""

    @pytest.fixture
    def state_manager(self):
        """Create ClosureStateManager instance for testing."""
        return ClosureStateManager()

    def test_determine_current_step_completed(self, state_manager):
        """Test step determination for completed closure."""
        account_info = {
            "account": MockAccount(status='CLOSED'),
            "orders": [],
            "positions": [],
            "cash_balance": 0.0,
            "cash_withdrawable": 0.0
        }
        
        step = state_manager.determine_current_step(account_info)
        assert step == ClosureStep.COMPLETED

    def test_determine_current_step_liquidating(self, state_manager):
        """Test step determination for liquidation phase."""
        account_info = {
            "account": MockAccount(status='ACTIVE'),
            "orders": [MockOrder()],
            "positions": [MockPosition()],
            "cash_balance": 1000.0,
            "cash_withdrawable": 1000.0
        }
        
        step = state_manager.determine_current_step(account_info)
        assert step == ClosureStep.LIQUIDATING_POSITIONS

    def test_determine_current_step_waiting_settlement(self, state_manager):
        """Test step determination for settlement waiting."""
        account_info = {
            "account": MockAccount(status='ACTIVE'),
            "orders": [],
            "positions": [],
            "cash_balance": 1000.0,
            "cash_withdrawable": 500.0  # Less than balance - waiting settlement
        }
        
        step = state_manager.determine_current_step(account_info)
        assert step == ClosureStep.WAITING_SETTLEMENT

    def test_determine_current_step_withdrawing_funds(self, state_manager):
        """Test step determination for fund withdrawal."""
        account_info = {
            "account": MockAccount(status='ACTIVE'),
            "orders": [],
            "positions": [],
            "cash_balance": 1000.0,
            "cash_withdrawable": 1000.0  # Equal - ready for withdrawal
        }
        
        step = state_manager.determine_current_step(account_info)
        assert step == ClosureStep.WITHDRAWING_FUNDS

    def test_determine_current_step_closing_account(self, state_manager):
        """Test step determination for account closure."""
        account_info = {
            "account": MockAccount(status='ACTIVE'),
            "orders": [],
            "positions": [],
            "cash_balance": 0.5,  # Less than $1
            "cash_withdrawable": 0.5
        }
        
        step = state_manager.determine_current_step(account_info)
        assert step == ClosureStep.CLOSING_ACCOUNT

    def test_is_ready_for_next_step_liquidation_complete(self, state_manager):
        """Test readiness check for completed liquidation."""
        account_info = {
            "orders": [],
            "positions": [],
            "cash_balance": 1000.0,
            "cash_withdrawable": 1000.0
        }
        
        ready = state_manager.is_ready_for_next_step(ClosureStep.LIQUIDATING_POSITIONS, account_info)
        assert ready is True

    def test_is_ready_for_next_step_liquidation_incomplete(self, state_manager):
        """Test readiness check for incomplete liquidation."""
        account_info = {
            "orders": [MockOrder()],  # Still has orders
            "positions": [],
            "cash_balance": 1000.0,
            "cash_withdrawable": 1000.0
        }
        
        ready = state_manager.is_ready_for_next_step(ClosureStep.LIQUIDATING_POSITIONS, account_info)
        assert ready is False

class TestAccountClosureManager:
    """Test suite for AccountClosureManager orchestrator class."""

    @pytest.fixture
    def closure_manager(self):
        """Create AccountClosureManager instance for testing."""
        with patch('utils.alpaca.account_closure.BrokerClient') as mock_client_class:
            mock_client = Mock()
            mock_client_class.return_value = mock_client
            
            manager = AccountClosureManager(sandbox=True)
            manager.broker_client = mock_client
            return manager

    def test_check_closure_preconditions_ready(self, closure_manager):
        """Test precondition check for account ready for closure."""
        # Mock the broker service response
        mock_account_info = {
            "account": MockAccount(status='ACTIVE'),
            "trade_account": MockTradeAccount(),
            "positions": [],
            "orders": [],
            "cash_balance": 1000.0,
            "cash_withdrawable": 1000.0
        }
        
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is True
        assert result['account_status'] == 'ACTIVE'
        assert result['positions_count'] == 0
        assert result['orders_count'] == 0
        assert result['cash_balance'] == 1000.0

    def test_check_closure_preconditions_inactive_account(self, closure_manager):
        """Test precondition check for inactive account."""
        mock_account_info = {
            "account": MockAccount(status='INACTIVE'),
            "trade_account": MockTradeAccount(),
            "positions": [],
            "orders": [],
            "cash_balance": 1000.0,
            "cash_withdrawable": 1000.0
        }
        
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'INACTIVE' in result['reason']

    def test_check_closure_preconditions_already_closed(self, closure_manager):
        """Test precondition check for already closed account."""
        mock_account_info = {
            "account": MockAccount(status='CLOSED'),
            "trade_account": MockTradeAccount(),
            "positions": [],
            "orders": [],
            "cash_balance": 0.0,
            "cash_withdrawable": 0.0
        }
        
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'already closed' in result['reason']

    def test_get_closure_status_success(self, closure_manager):
        """Test getting closure status."""
        mock_account_info = {
            "account": MockAccount(status='ACTIVE'),
            "orders": [],
            "positions": [],
            "cash_balance": 1000.0,
            "cash_withdrawable": 1000.0
        }
        
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        result = closure_manager.get_closure_status('test-account-123')
        
        assert result['account_id'] == 'test-account-123'
        assert result['current_step'] == ClosureStep.WITHDRAWING_FUNDS.value
        assert result['can_retry'] is True

    def test_liquidate_positions_success(self, closure_manager):
        """Test position liquidation."""
        mock_liquidation_result = {
            "success": True,
            "liquidation_orders": 2,
            "message": "Initiated liquidation of 2 positions"
        }
        
        closure_manager.broker_service.liquidate_positions = Mock(return_value=mock_liquidation_result)
        
        result = closure_manager.liquidate_positions('test-account-123')
        
        assert result['success'] is True
        assert result['liquidation_orders'] == 2

    def test_withdraw_funds_success(self, closure_manager):
        """Test funds withdrawal."""
        # Mock account info for auto-amount determination
        mock_account_info = {
            "cash_withdrawable": 1000.0
        }
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        # Mock withdrawal result
        mock_withdrawal_result = {
            "success": True,
            "transfer_id": "transfer-123",
            "amount": 1000.0,
            "status": "QUEUED"
        }
        closure_manager.broker_service.withdraw_funds = Mock(return_value=mock_withdrawal_result)
        
        result = closure_manager.withdraw_funds('test-account-123', '12345678-1234-1234-1234-123456789012')
        
        assert result['success'] is True
        assert result['transfer_id'] == 'transfer-123'
        assert result['amount'] == 1000.0

    def test_withdraw_funds_insufficient_balance(self, closure_manager):
        """Test withdrawal with insufficient balance."""
        mock_account_info = {
            "cash_withdrawable": 0.5  # Less than $1
        }
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        result = closure_manager.withdraw_funds('test-account-123', '12345678-1234-1234-1234-123456789012')
        
        assert result['success'] is False
        assert 'No withdrawable funds' in result['error']

    def test_close_account_success(self, closure_manager):
        """Test successful account closure."""
        # Mock account info for final validation
        mock_account_info = {
            "positions": [],
            "cash_balance": 0.0
        }
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        # Mock closure result
        mock_closure_result = {
            "success": True,
            "message": "Account closure initiated"
        }
        closure_manager.broker_service.close_account = Mock(return_value=mock_closure_result)
        
        result = closure_manager.close_account('test-account-123')
        
        assert result['success'] is True
        assert 'Account closure initiated' in result['message']

    def test_close_account_with_positions(self, closure_manager):
        """Test account closure with remaining positions."""
        mock_account_info = {
            "positions": [MockPosition()],  # Still has positions
            "cash_balance": 0.0
        }
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        result = closure_manager.close_account('test-account-123')
        
        assert result['success'] is False
        assert 'open positions' in result['error']

    def test_close_account_with_cash_balance(self, closure_manager):
        """Test account closure with remaining cash balance."""
        mock_account_info = {
            "positions": [],
            "cash_balance": 100.0  # Too much cash remaining
        }
        closure_manager.broker_service.get_account_info = Mock(return_value=mock_account_info)
        
        result = closure_manager.close_account('test-account-123')
        
        assert result['success'] is False
        assert '$100.00 remaining' in result['error']

class TestAutomatedAccountClosureProcessor:
    """Test suite for AutomatedAccountClosureProcessor."""

    @pytest.fixture
    def processor(self):
        """Create AutomatedAccountClosureProcessor instance for testing."""
        with patch('utils.alpaca.automated_account_closure.AccountClosureManager'):
            processor = AutomatedAccountClosureProcessor(sandbox=True)
            processor.manager = Mock()
            processor.supabase = Mock()
            return processor

    @pytest.mark.asyncio
    async def test_initiate_automated_closure_success(self, processor):
        """Test successful automated closure initiation."""
        # Mock the manager's precondition check
        processor.manager.check_closure_preconditions.return_value = {"ready": True}
        
        # Disable Supabase to avoid mocking complexity
        processor.supabase = None
        
        # Mock the detailed logger to avoid file system operations
        with patch('utils.alpaca.automated_account_closure.AccountClosureLogger') as mock_logger:
            mock_logger.return_value.log_step_start = Mock()
            mock_logger.return_value.log_step_success = Mock()
            mock_logger.return_value.log_step_failure = Mock()
            
            result = await processor.initiate_automated_closure(
                user_id="user-123",
                account_id="account-123", 
                ach_relationship_id="12345678-1234-1234-1234-123456789012"  # Valid UUID
            )
            
            assert result['success'] is True
            assert 'confirmation_number' in result
            assert result['status'] == 'pending_closure'
            assert 'estimated_completion' in result

    @pytest.mark.asyncio
    async def test_initiate_automated_closure_not_ready(self, processor):
        """Test automated closure initiation when account not ready."""
        # Mock the manager's precondition check
        processor.manager.check_closure_preconditions.return_value = {
            "ready": False,
            "reason": "Account has open positions"
        }
        
        # Disable Supabase to avoid mocking complexity
        processor.supabase = None
        
        # Mock the detailed logger to avoid file system operations
        with patch('utils.alpaca.automated_account_closure.AccountClosureLogger') as mock_logger:
            mock_logger.return_value.log_step_start = Mock()
            mock_logger.return_value.log_step_success = Mock()
            mock_logger.return_value.log_step_failure = Mock()
            
            result = await processor.initiate_automated_closure(
                user_id="user-123",
                account_id="account-123",
                ach_relationship_id="12345678-1234-1234-1234-123456789012"  # Valid UUID
            )
            
            assert result['success'] is False
            assert 'open positions' in result['error']

class TestAPIFunctions:
    """Test suite for API convenience functions."""

    @patch('utils.alpaca.account_closure.AccountClosureManager')
    def test_check_account_closure_readiness(self, mock_manager_class):
        """Test check_account_closure_readiness function."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        mock_manager.check_closure_preconditions.return_value = {"ready": True}
        
        result = check_account_closure_readiness('test-account-123')
        
        assert result['ready'] is True
        mock_manager_class.assert_called_once_with(True)  # sandbox=True by default
        mock_manager.check_closure_preconditions.assert_called_once_with('test-account-123')

    @patch('utils.alpaca.account_closure.AccountClosureManager')
    def test_initiate_account_closure_success(self, mock_manager_class):
        """Test initiate_account_closure function."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        # Mock precondition check
        mock_manager.check_closure_preconditions.return_value = {"ready": True}
        
        # Mock liquidation
        mock_manager.liquidate_positions.return_value = {"success": True}
        
        # Mock broker client for post-liquidation check
        mock_manager.broker_client.get_account_by_id.return_value = MockAccount()
        mock_manager.broker_client.get_all_positions_for_account.return_value = []
        mock_manager.broker_client.get_orders_for_account.return_value = []
        
        # Mock Supabase with proper data structure
        with patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
            
            # Mock the detailed logger to avoid file system operations
            with patch('utils.alpaca.account_closure.AccountClosureLogger') as mock_logger:
                mock_logger.return_value.log_step_start = Mock()
                mock_logger.return_value.log_step_success = Mock()
                mock_logger.return_value.log_step_failure = Mock()
                mock_logger.return_value.log_alpaca_data = Mock()
                mock_logger.return_value.log_safety_check = Mock()
                mock_logger.return_value.log_timing = Mock()
                mock_logger.return_value.get_log_summary = Mock(return_value="test_log")
                
                result = initiate_account_closure('test-account-123', '12345678-1234-1234-1234-123456789012')
        
        assert result['success'] is True
        assert 'confirmation_number' in result

    @patch('utils.alpaca.account_closure.AccountClosureManager')
    def test_get_closure_progress(self, mock_manager_class):
        """Test get_closure_progress function."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        mock_manager.get_closure_status.return_value = {
            "account_id": "test-account-123",
            "current_step": "liquidating_positions"
        }
        
        result = get_closure_progress('test-account-123')
        
        assert result['account_id'] == 'test-account-123'
        assert result['current_step'] == 'liquidating_positions'

class TestErrorHandling:
    """Test suite for error handling scenarios."""

    @pytest.fixture
    def closure_manager(self):
        """Create AccountClosureManager instance for testing."""
        with patch('utils.alpaca.account_closure.BrokerClient') as mock_client_class:
            mock_client = Mock()
            mock_client_class.return_value = mock_client
            
            manager = AccountClosureManager(sandbox=True)
            manager.broker_client = mock_client
            return manager

    def test_broker_api_error_handling(self, closure_manager):
        """Test handling of broker API errors."""
        # Mock broker service to raise exception
        closure_manager.broker_service.get_account_info = Mock(side_effect=Exception("API Error"))
        
        result = closure_manager.check_closure_preconditions('test-account-123')
        
        assert result['ready'] is False
        assert 'API Error' in result['error']

    def test_network_timeout_handling(self, closure_manager):
        """Test handling of network timeouts."""
        import requests
        closure_manager.broker_service.liquidate_positions = Mock(
            side_effect=requests.exceptions.Timeout("Request timed out")
        )
        
        result = closure_manager.liquidate_positions('test-account-123')
        
        assert result['success'] is False
        assert 'Request timed out' in result['error']

class TestProductionReadiness:
    """Test suite for production readiness checks."""

    def test_current_api_patterns(self):
        """Test that we're using current Alpaca API patterns."""
        # Import the actual modules to ensure they exist
        from utils.alpaca.account_closure import AccountClosureManager, BrokerService, ClosureStateManager
        from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
        
        # Test that classes have expected methods
        assert hasattr(AccountClosureManager, 'check_closure_preconditions')
        assert hasattr(AccountClosureManager, 'liquidate_positions')
        assert hasattr(AccountClosureManager, 'withdraw_funds')
        assert hasattr(AccountClosureManager, 'close_account')
        
        assert hasattr(BrokerService, 'get_account_info')
        assert hasattr(BrokerService, 'liquidate_positions')
        assert hasattr(BrokerService, 'withdraw_funds')
        assert hasattr(BrokerService, 'close_account')
        
        assert hasattr(ClosureStateManager, 'determine_current_step')
        assert hasattr(ClosureStateManager, 'is_ready_for_next_step')
        
        assert hasattr(AutomatedAccountClosureProcessor, 'initiate_automated_closure')

    def test_closure_step_enum_completeness(self):
        """Test that ClosureStep enum has all required steps."""
        expected_steps = [
            'INITIATED', 'CANCELING_ORDERS', 'LIQUIDATING_POSITIONS',
            'WAITING_SETTLEMENT', 'WITHDRAWING_FUNDS', 'CLOSING_ACCOUNT',
            'COMPLETED', 'FAILED'
        ]
        
        for step in expected_steps:
            assert hasattr(ClosureStep, step)

    def test_imports_work_correctly(self):
        """Test that all imports work without errors."""
        # This test ensures the module structure is correct
        from utils.alpaca.account_closure import (
            AccountClosureManager, BrokerService, ClosureStateManager, ClosureStep
        )
        from utils.alpaca.automated_account_closure import (
            AutomatedAccountClosureProcessor, ClosureProcessStatus
        )
        
        # If we get here without import errors, the test passes
        assert True

if __name__ == "__main__":
    pytest.main([__file__, "-v"])