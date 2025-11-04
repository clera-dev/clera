"""
Comprehensive tests for Trade Routing Service.

Tests cover:
- Portfolio mode detection
- Symbol account detection
- Trading account enumeration
- Edge cases (no accounts, hybrid mode, etc.)
"""

import pytest
from unittest.mock import Mock, patch

from clera_agents.services.trade_routing_service import TradeRoutingService


class TestPortfolioModeDetection:
    """Test suite for portfolio mode detection."""
    
    def test_brokerage_mode_only_alpaca(self):
        """Test detection of brokerage-only mode (Alpaca only)."""
        # Mock Alpaca account exists
        alpaca_result = Mock()
        alpaca_result.data = [{'alpaca_account_id': 'alpaca_123'}]
        
        # Mock no SnapTrade accounts
        snaptrade_result = Mock()
        snaptrade_result.data = []
        
        # Create properly chained mocks
        mock_execute_alpaca = Mock(return_value=alpaca_result)
        mock_execute_snap = Mock(return_value=snaptrade_result)
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase = Mock()
            
            # Setup chainable mock for Alpaca query
            mock_alpaca_chain = Mock()
            mock_alpaca_chain.select.return_value.eq.return_value.execute = mock_execute_alpaca
            
            # Setup chainable mock for SnapTrade query
            mock_snap_chain = Mock()
            mock_snap_chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute = mock_execute_snap
            
            # Configure table() to return appropriate chain
            def table_side_effect(table_name):
                if table_name == 'user_onboarding':
                    return mock_alpaca_chain
                elif table_name == 'user_investment_accounts':
                    return mock_snap_chain
                return Mock()
            
            mock_supabase.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_supabase
            
            mode = TradeRoutingService.get_user_portfolio_mode('test_user')
            
            assert mode['mode'] == 'brokerage'
            assert mode['has_alpaca'] is True
            assert mode['has_snaptrade'] is False
            assert mode['alpaca_account_id'] == 'alpaca_123'
    
    def test_aggregation_mode_only_snaptrade(self):
        """Test detection of aggregation-only mode (SnapTrade only)."""
        mock_supabase = Mock()
        
        # Mock no Alpaca account
        alpaca_result = Mock()
        alpaca_result.data = []
        
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
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
                alpaca_result,
                snaptrade_result
            ]
            mock_get_supabase.return_value = mock_supabase
            
            mode = TradeRoutingService.get_user_portfolio_mode('test_user')
            
            assert mode['mode'] == 'aggregation'
            assert mode['has_alpaca'] is False
            assert mode['has_snaptrade'] is True
            assert len(mode['snaptrade_accounts']) == 1
    
    def test_hybrid_mode_both_providers(self):
        """Test detection of hybrid mode (Alpaca + SnapTrade)."""
        mock_supabase = Mock()
        
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
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
                alpaca_result,
                snaptrade_result
            ]
            mock_get_supabase.return_value = mock_supabase
            
            mode = TradeRoutingService.get_user_portfolio_mode('test_user')
            
            assert mode['mode'] == 'hybrid'
            assert mode['has_alpaca'] is True
            assert mode['has_snaptrade'] is True


class TestSymbolAccountDetection:
    """Test suite for detecting which account holds a symbol."""
    
    def test_detect_symbol_in_snaptrade_account(self):
        """Test detecting symbol in SnapTrade account."""
        mock_supabase = Mock()
        
        # Mock holdings result
        holdings_result = Mock()
        holdings_result.data = [{
            'accounts': [
                {'account_id': 'snaptrade_acc_123', 'quantity': 10}
            ]
        }]
        
        # Mock account info
        account_info_result = Mock()
        account_info_result.data = [{
            'provider_account_id': 'acc_123',
            'institution_name': 'Test Broker',
            'connection_type': 'trade',
            'is_active': True
        }]
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
                holdings_result,
                account_info_result
            ]
            mock_get_supabase.return_value = mock_supabase
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('AAPL', 'test_user')
            
            assert account_id == 'snaptrade_acc_123'
            assert account_type == 'snaptrade'
            assert account_info is not None
    
    def test_detect_symbol_not_found(self):
        """Test when symbol is not found in any account."""
        mock_supabase = Mock()
        
        holdings_result = Mock()
        holdings_result.data = []
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = holdings_result
            mock_get_supabase.return_value = mock_supabase
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('TSLA', 'test_user')
            
            assert account_id is None
            assert account_type is None
            assert account_info is None


class TestTradingAccountsList:
    """Test suite for getting trading accounts."""
    
    def test_get_trading_accounts_hybrid_mode(self):
        """Test getting all trading accounts in hybrid mode."""
        mock_supabase = Mock()
        
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
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
                alpaca_result,
                snaptrade_result
            ]
            mock_get_supabase.return_value = mock_supabase
            
            accounts = TradeRoutingService.get_trading_accounts('test_user')
            
            assert len(accounts) == 3  # 1 Alpaca + 2 SnapTrade
            assert accounts[0]['account_type'] == 'alpaca'
            assert accounts[0]['institution_name'] == 'Clera Brokerage'
            assert accounts[1]['account_type'] == 'snaptrade'
            assert accounts[1]['brokerage_name'] == 'Charles Schwab'
            assert accounts[2]['account_type'] == 'snaptrade'
            assert accounts[2]['brokerage_name'] == 'Fidelity'


class TestUserCredentials:
    """Test suite for getting SnapTrade user credentials."""
    
    def test_get_credentials_success(self):
        """Test successfully retrieving user credentials."""
        mock_supabase = Mock()
        
        creds_result = Mock()
        creds_result.data = [{
            'snaptrade_user_id': 'user_123',
            'snaptrade_user_secret': 'secret_456'
        }]
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = creds_result
            mock_get_supabase.return_value = mock_supabase
            
            creds = TradeRoutingService.get_snaptrade_user_credentials('test_user')
            
            assert creds is not None
            assert creds['user_id'] == 'user_123'
            assert creds['user_secret'] == 'secret_456'
    
    def test_get_credentials_not_found(self):
        """Test when user has no SnapTrade credentials."""
        mock_supabase = Mock()
        
        creds_result = Mock()
        creds_result.data = []
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = creds_result
            mock_get_supabase.return_value = mock_supabase
            
            creds = TradeRoutingService.get_snaptrade_user_credentials('test_user')
            
            assert creds is None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

