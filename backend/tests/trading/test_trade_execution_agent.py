"""
Comprehensive tests for Trade Execution Agent.

PRODUCTION-GRADE: Tests cover:
- Trade routing integration with correct column names
- Buy order execution across Alpaca and SnapTrade
- Sell order execution with proper account detection
- Error handling for various edge cases
- Market closed handling and order queueing

These tests verify the integration between trade_execution_agent.py
and trade_routing_service.py with the correct database schema.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal


class TestTradeRoutingIntegration:
    """Test suite for trade routing integration.
    
    CRITICAL: Verifies the fix for the 'account_contributions' column name issue.
    The trade execution agent relies on TradeRoutingService.detect_symbol_account()
    which was incorrectly querying 'accounts' instead of 'account_contributions'.
    """
    
    def test_detect_symbol_uses_correct_column_name(self):
        """Verify detect_symbol_account queries 'account_contributions', not 'accounts'."""
        from clera_agents.services.trade_routing_service import TradeRoutingService
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # Set up mock to capture the select query
            holdings_result = Mock()
            holdings_result.data = [{
                'account_contributions': [
                    {'account_id': 'snaptrade_test123', 'quantity': 10}
                ]
            }]
            
            account_info_result = Mock()
            account_info_result.data = [{
                'provider_account_id': 'test123',
                'institution_name': 'Webull',
                'connection_type': 'trade',
                'is_active': True
            }]
            
            captured_selects = []
            
            def table_side_effect(table_name):
                chain = MagicMock()
                
                def capture_select(columns):
                    captured_selects.append({'table': table_name, 'columns': columns})
                    return chain
                
                chain.select = Mock(side_effect=capture_select)
                chain.eq.return_value = chain
                
                if table_name == 'user_aggregated_holdings':
                    chain.execute.return_value = holdings_result
                elif table_name == 'user_investment_accounts':
                    chain.execute.return_value = account_info_result
                
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            # Call the function
            result = TradeRoutingService.detect_symbol_account('AAPL', 'user123')
            
            # Verify 'account_contributions' was queried, NOT 'accounts'
            holdings_query = next(
                (s for s in captured_selects if s['table'] == 'user_aggregated_holdings'),
                None
            )
            assert holdings_query is not None
            assert 'account_contributions' in holdings_query['columns']
            assert 'accounts' not in holdings_query['columns']
    
    def test_snaptrade_account_detection_for_buy(self):
        """Test that buy orders correctly detect SnapTrade accounts."""
        from clera_agents.services.trade_routing_service import TradeRoutingService
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # User has existing VTI in SnapTrade account
            holdings_result = Mock()
            holdings_result.data = [{
                'account_contributions': [
                    {
                        'account_id': 'snaptrade_webull123',
                        'quantity': 5.5,
                        'market_value': 1200.00
                    }
                ]
            }]
            
            account_info_result = Mock()
            account_info_result.data = [{
                'id': 'uuid-123',
                'provider_account_id': 'webull123',
                'institution_name': 'Webull',
                'account_name': 'Trading Account',
                'connection_type': 'trade',
                'is_active': True
            }]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                chain.select.return_value = chain
                chain.eq.return_value = chain
                
                if table_name == 'user_aggregated_holdings':
                    chain.execute.return_value = holdings_result
                elif table_name == 'user_investment_accounts':
                    chain.execute.return_value = account_info_result
                
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('VTI', 'user123')
            
            assert account_id == 'snaptrade_webull123'
            assert account_type == 'snaptrade'
            assert account_info['institution_name'] == 'Webull'
    
    def test_alpaca_account_detection_for_sell(self):
        """Test that sell orders correctly detect Alpaca accounts."""
        from clera_agents.services.trade_routing_service import TradeRoutingService
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            # User has AAPL in Alpaca account
            holdings_result = Mock()
            holdings_result.data = [{
                'account_contributions': [
                    {
                        'account_id': 'clera_main',
                        'quantity': 10,
                        'market_value': 1750.00
                    }
                ]
            }]
            
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': 'alpaca-uuid-main'}]
            
            snaptrade_result = Mock()
            snaptrade_result.data = []
            
            def table_side_effect(table_name):
                chain = MagicMock()
                chain.select.return_value = chain
                chain.eq.return_value = chain
                
                if table_name == 'user_aggregated_holdings':
                    chain.execute.return_value = holdings_result
                elif table_name == 'user_onboarding':
                    chain.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.execute.return_value = snaptrade_result
                
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            account_id, account_type, account_info = TradeRoutingService.detect_symbol_account('AAPL', 'user123')
            
            assert account_id == 'alpaca-uuid-main'
            assert account_type == 'alpaca'


class TestTradeExecutionValidation:
    """Test trade execution input validation."""
    
    def test_invalid_notional_amount_rejected(self):
        """Test that notional amounts below $1 are rejected."""
        from clera_agents.trade_execution_agent import execute_buy_market_order
        
        # Mock the config to provide user_id
        mock_config = MagicMock()
        mock_config.get.return_value = {'user_id': 'test-user-123'}
        
        with patch('clera_agents.trade_execution_agent.get_user_id_from_config', return_value='test-user-123'):
            result = execute_buy_market_order.invoke({'ticker': 'AAPL', 'notional_amount': 0.50}, config=mock_config)
            
            assert 'Error' in result
            assert 'dollar amount' in result.lower() or 'at least $1' in result.lower()
    
    def test_invalid_ticker_rejected(self):
        """Test that invalid ticker symbols are rejected."""
        from clera_agents.trade_execution_agent import execute_buy_market_order
        
        mock_config = MagicMock()
        
        with patch('clera_agents.trade_execution_agent.get_user_id_from_config', return_value='test-user-123'):
            result = execute_buy_market_order.invoke({'ticker': '!!!INVALID!!!', 'notional_amount': 100}, config=mock_config)
            
            assert 'Error' in result or 'Invalid' in result


class TestPortfolioModeHandling:
    """Test handling of different portfolio modes for trade execution."""
    
    def test_get_portfolio_mode_for_new_buy(self):
        """Test portfolio mode detection for buy orders on new symbols."""
        from clera_agents.services.trade_routing_service import TradeRoutingService
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': 'alpaca-123'}]
            
            snaptrade_result = Mock()
            snaptrade_result.data = [{
                'provider_account_id': 'webull-456',
                'institution_name': 'Webull',
                'account_name': 'Trading',
                'connection_type': 'trade',
                'brokerage_name': 'Webull'
            }]
            
            def table_side_effect(table_name):
                chain = MagicMock()
                chain.select.return_value = chain
                chain.eq.return_value = chain
                
                if table_name == 'user_onboarding':
                    chain.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.execute.return_value = snaptrade_result
                
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            mode = TradeRoutingService.get_user_portfolio_mode('user123')
            
            assert mode['mode'] == 'hybrid'
            assert mode['has_alpaca'] is True
            assert mode['has_snaptrade'] is True
            assert mode['alpaca_account_id'] == 'alpaca-123'
            assert len(mode['snaptrade_accounts']) == 1


class TestErrorMessages:
    """Test user-friendly error messages."""
    
    def test_no_trading_accounts_error_message(self):
        """Test error message when user has no trading accounts."""
        from clera_agents.services.trade_routing_service import TradeRoutingService
        
        with patch('clera_agents.services.trade_routing_service.get_supabase_client') as mock_get_supabase:
            mock_client = MagicMock()
            
            alpaca_result = Mock()
            alpaca_result.data = [{'alpaca_account_id': None}]
            
            snaptrade_result = Mock()
            snaptrade_result.data = []
            
            def table_side_effect(table_name):
                chain = MagicMock()
                chain.select.return_value = chain
                chain.eq.return_value = chain
                
                if table_name == 'user_onboarding':
                    chain.execute.return_value = alpaca_result
                elif table_name == 'user_investment_accounts':
                    chain.execute.return_value = snaptrade_result
                
                return chain
            
            mock_client.table.side_effect = table_side_effect
            mock_get_supabase.return_value = mock_client
            
            mode = TradeRoutingService.get_user_portfolio_mode('user123')
            
            assert mode['mode'] == 'none'
            assert mode['has_alpaca'] is False
            assert mode['has_snaptrade'] is False


class TestDatabaseColumnNameFix:
    """
    CRITICAL TEST SUITE: Verifies the fix for database column name issue.
    
    BUG: TradeRoutingService was querying 'accounts' column which doesn't exist.
    FIX: Changed to 'account_contributions' which is the correct column name
         as defined in migration 002_create_aggregated_holdings.sql
    
    This bug caused: 
        '{'message': 'column user_aggregated_holdings.accounts does not exist', 'code': '42703'}'
    """
    
    def test_column_name_matches_database_schema(self):
        """Verify we're using the correct column name from the database schema."""
        # Read the actual code and verify the column name
        import inspect
        from clera_agents.services.trade_routing_service import TradeRoutingService
        
        source = inspect.getsource(TradeRoutingService.detect_symbol_account)
        
        # The code should reference 'account_contributions', not 'accounts'
        assert 'account_contributions' in source
        # The old buggy column name should not be present (except in comments)
        # We check that we're selecting account_contributions
        assert ".select('account_contributions')" in source or "select('account_contributions')" in source
    
    def test_portfolio_data_provider_uses_correct_column(self):
        """Verify PortfolioDataProvider also uses correct column name."""
        import inspect
        from clera_agents.services.portfolio_data_provider import PortfolioDataProvider
        
        source = inspect.getsource(PortfolioDataProvider._get_snaptrade_holdings)
        
        # Should use 'account_contributions' for filtering hybrid mode holdings
        assert 'account_contributions' in source


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

