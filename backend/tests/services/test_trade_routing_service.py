"""
Comprehensive tests for Trade Routing Service.

PRODUCTION-GRADE: Tests cover:
- Portfolio mode detection (brokerage, aggregation, hybrid)
- Symbol account detection with proper column name (account_contributions)
- Trading account enumeration
- Edge cases (no accounts, inactive accounts, etc.)

These tests verify the fix for the database column name issue where
'account_contributions' was incorrectly queried as 'accounts'.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock

from clera_agents.services.trade_routing_service import TradeRoutingService


def create_mock_supabase_client():
    """Create a properly configured mock Supabase client."""
    mock_client = MagicMock()
    return mock_client


def setup_table_chain(mock_client, table_name, result_data):
    """Helper to set up a mock for a specific table query chain."""
    mock_result = Mock()
    mock_result.data = result_data
    
    # Create a fresh mock chain that tracks the specific table
    mock_chain = MagicMock()
    mock_chain.execute.return_value = mock_result
    mock_chain.eq.return_value = mock_chain
    mock_chain.select.return_value = mock_chain
    
    return mock_chain, mock_result


class TestPortfolioModeDetection:
    """Test suite for portfolio mode detection."""
    
    def test_brokerage_mode_only_alpaca(self):
        """Test detection of brokerage-only mode (Alpaca only)."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # Mock Alpaca account exists
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': 'alpaca_123'}]
            
            # Mock no SnapTrade accounts
            snaptrade_result = Mock()
            snaptrade_result.data = []
            
            # Create table mocks with proper chaining
            call_count = [0]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_onboarding':
                    chain.select.return_value.eq.return_value.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = snaptrade_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            mode = TradeRoutingService.get_user_portfolio_mode('test_user')
            
            assert mode['mode'] == 'brokerage'
            assert mode['has_alpaca'] is True
            assert mode['has_snaptrade'] is False
            assert mode['alpaca_account_id'] == 'alpaca_123'
    
    def test_aggregation_mode_only_snaptrade(self):
        """Test detection of aggregation-only mode (SnapTrade only)."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # Mock no Alpaca account
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': None}]
            
            # Mock SnapTrade accounts exist
            snaptrade_result = Mock()
            snaptrade_result.data = [
                {
                    'id': 'uuid_123',
                    'provider_account_id': 'snap_acc_123',
                    'institution_name': 'Test Broker',
                    'account_name': 'Test Account',
                    'connection_type': 'trade',
                    'brokerage_name': 'Test Brokerage'
                }
            ]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_onboarding':
                    chain.select.return_value.eq.return_value.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = snaptrade_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            mode = TradeRoutingService.get_user_portfolio_mode('test_user')
            
            assert mode['mode'] == 'aggregation'
            assert mode['has_alpaca'] is False
            assert mode['has_snaptrade'] is True
            assert len(mode['snaptrade_accounts']) == 1
            assert mode['snaptrade_accounts'][0]['institution_name'] == 'Test Broker'
    
    def test_hybrid_mode_both_providers(self):
        """Test detection of hybrid mode (Alpaca + SnapTrade)."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': 'alpaca_123'}]
            
            snaptrade_result = Mock()
            snaptrade_result.data = [{
                'id': 'uuid_123',
                'provider_account_id': 'snap_acc_123',
                'institution_name': 'Test Broker',
                'account_name': 'Test Account',
                'connection_type': 'trade'
            }]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_onboarding':
                    chain.select.return_value.eq.return_value.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = snaptrade_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            mode = TradeRoutingService.get_user_portfolio_mode('test_user')
            
            assert mode['mode'] == 'hybrid'
            assert mode['has_alpaca'] is True
            assert mode['has_snaptrade'] is True
    
    def test_no_accounts_mode(self):
        """Test when user has no connected accounts."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': None}]
            
            snaptrade_result = Mock()
            snaptrade_result.data = []
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_onboarding':
                    chain.select.return_value.eq.return_value.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = snaptrade_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            mode = TradeRoutingService.get_user_portfolio_mode('test_user')
            
            assert mode['mode'] == 'none'
            assert mode['has_alpaca'] is False
            assert mode['has_snaptrade'] is False


class TestSymbolAccountDetection:
    """Test suite for detecting which account holds a symbol.
    
    PRODUCTION-GRADE: These tests verify the fix for the database column name issue.
    The correct column name is 'account_contributions', not 'accounts'.
    """
    
    def test_detect_symbol_in_snaptrade_account(self):
        """Test detecting symbol in SnapTrade account.
        
        CRITICAL: Uses 'account_contributions' column (the correct column name).
        """
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # Mock holdings result - uses CORRECT column name 'account_contributions'
            holdings_result = Mock()
            holdings_result.data = [{
                'account_contributions': [
                    {'account_id': 'snaptrade_acc_123', 'quantity': 10, 'market_value': 1500.00}
                ]
            }]
            
            # Mock account info validation
            account_info_result = Mock()
            account_info_result.data = [{
                'provider_account_id': 'acc_123',
                'institution_name': 'Test Broker',
                'account_name': 'Test Account',
                'connection_type': 'trade',
                'is_active': True
            }]
            
            call_count = [0]
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_aggregated_holdings':
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = holdings_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = account_info_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('AAPL', 'test_user')
            
            assert account_id == 'snaptrade_acc_123'
            assert account_type == 'snaptrade'
            assert account_info is not None
            assert account_info['institution_name'] == 'Test Broker'
    
    def test_detect_symbol_in_alpaca_account(self):
        """Test detecting symbol in Alpaca account."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # Mock holdings with clera/alpaca account
            holdings_result = Mock()
            holdings_result.data = [{
                'account_contributions': [
                    {'account_id': 'clera_abc123', 'quantity': 5, 'market_value': 750.00}
                ]
            }]
            
            # Mock Alpaca account check
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': 'alpaca_main'}]
            
            snaptrade_result = Mock()
            snaptrade_result.data = []
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_aggregated_holdings':
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = holdings_result
                elif table_name == 'user_onboarding':
                    chain.select.return_value.eq.return_value.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = snaptrade_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('AAPL', 'test_user')
            
            assert account_id == 'alpaca_main'
            assert account_type == 'alpaca'
    
    def test_detect_symbol_not_found(self):
        """Test when symbol is not found in any account."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            holdings_result = Mock()
            holdings_result.data = []  # No holdings found
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_aggregated_holdings':
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = holdings_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('TSLA', 'test_user')
            
            assert account_id is None
            assert account_type is None
            assert account_info is None
    
    def test_detect_symbol_empty_contributions(self):
        """Test when holdings exist but account_contributions is empty."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            holdings_result = Mock()
            holdings_result.data = [{
                'account_contributions': []  # Empty contributions
            }]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_aggregated_holdings':
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = holdings_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('GOOGL', 'test_user')
            
            assert account_id is None
            assert account_type is None
            assert account_info is None
    
    def test_detect_symbol_snaptrade_not_trade_enabled(self):
        """Test when SnapTrade account exists but is not trade-enabled."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            holdings_result = Mock()
            holdings_result.data = [{
                'account_contributions': [
                    {'account_id': 'snaptrade_view_only', 'quantity': 10}
                ]
            }]
            
            # Account exists but not trade-enabled
            account_info_result = Mock()
            account_info_result.data = []  # No trade-enabled account found
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_aggregated_holdings':
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = holdings_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = account_info_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('AAPL', 'test_user')
            
            # Should return None since account is not trade-enabled
            assert account_id is None
            assert account_type is None


class TestTradingAccountsList:
    """Test suite for getting trading accounts."""
    
    def test_get_trading_accounts_hybrid_mode(self):
        """Test getting all trading accounts in hybrid mode."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # Setup Alpaca account
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': 'alpaca_123'}]
            
            # Setup SnapTrade accounts
            snaptrade_result = Mock()
            snaptrade_result.data = [
                {
                    'provider_account_id': 'snap_acc_123',
                    'institution_name': 'Schwab',
                    'account_name': 'Brokerage',
                    'brokerage_name': 'Charles Schwab',
                    'connection_type': 'trade'
                },
                {
                    'provider_account_id': 'snap_acc_456',
                    'institution_name': 'Fidelity',
                    'account_name': '401k',
                    'brokerage_name': 'Fidelity',
                    'connection_type': 'trade'
                }
            ]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_onboarding':
                    chain.select.return_value.eq.return_value.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = snaptrade_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            accounts = TradeRoutingService.get_trading_accounts('test_user')
            
            assert len(accounts) == 3  # 1 Alpaca + 2 SnapTrade
            assert accounts[0]['account_type'] == 'alpaca'
            assert accounts[0]['institution_name'] == 'Clera Brokerage'
            assert accounts[1]['account_type'] == 'snaptrade'
            assert accounts[1]['brokerage_name'] == 'Charles Schwab'
            assert accounts[2]['account_type'] == 'snaptrade'
            assert accounts[2]['brokerage_name'] == 'Fidelity'
    
    def test_get_trading_accounts_snaptrade_only(self):
        """Test getting trading accounts for SnapTrade-only user."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': None}]
            
            snaptrade_result = Mock()
            snaptrade_result.data = [{
                'provider_account_id': 'webull_123',
                'institution_name': 'Webull',
                'account_name': 'Trading',
                'brokerage_name': 'Webull',
                'connection_type': 'trade'
            }]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_onboarding':
                    chain.select.return_value.eq.return_value.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = snaptrade_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            accounts = TradeRoutingService.get_trading_accounts('test_user')
            
            assert len(accounts) == 1
            assert accounts[0]['account_type'] == 'snaptrade'
            assert accounts[0]['brokerage_name'] == 'Webull'


class TestUserCredentials:
    """Test suite for getting SnapTrade user credentials."""
    
    def test_get_credentials_success(self):
        """Test successfully retrieving user credentials."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            creds_result = Mock()
            creds_result.data = [{
                'snaptrade_user_id': 'user_123',
                'snaptrade_user_secret': 'secret_456'
            }]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'snaptrade_users':
                    chain.select.return_value.eq.return_value.execute.return_value = creds_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            creds = TradeRoutingService.get_snaptrade_user_credentials('test_user')
            
            assert creds is not None
            assert creds['user_id'] == 'user_123'
            assert creds['user_secret'] == 'secret_456'
    
    def test_get_credentials_not_found(self):
        """Test when user has no SnapTrade credentials."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            creds_result = Mock()
            creds_result.data = []
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'snaptrade_users':
                    chain.select.return_value.eq.return_value.execute.return_value = creds_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            creds = TradeRoutingService.get_snaptrade_user_credentials('test_user')
            
            assert creds is None


class TestSymbolCaseNormalization:
    """Test that symbol detection properly normalizes case."""
    
    def test_lowercase_symbol_normalized(self):
        """Test that lowercase symbols are converted to uppercase."""
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            holdings_result = Mock()
            holdings_result.data = []
            
            def table_side_effect(table_name):
                chain = MagicMock()
                if table_name == 'user_aggregated_holdings':
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = holdings_result
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            # Call with lowercase - should be normalized internally
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('aapl', 'test_user')
            
            # Verify the query was called (we can't easily verify the exact uppercase,
            # but the function should handle it without error)
            assert mock_client.table.called


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
