"""
Integration tests for SnapTrade functionality.

These tests verify the complete flow from frontend to SnapTrade API.
They use real database connections but mock external API calls.
"""

import pytest
from unittest.mock import Mock, patch
from decimal import Decimal

from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
from utils.portfolio.portfolio_service import PortfolioService
from clera_agents.services.trade_routing_service import TradeRoutingService


class TestSnapTradeIntegration:
    """Integration tests for SnapTrade provider."""
    
    def test_portfolio_service_includes_snaptrade(self):
        """Test that portfolio service initializes SnapTrade provider."""
        with patch.dict('os.environ', {
            'SNAPTRADE_CONSUMER_KEY': 'test_key',
            'SNAPTRADE_CLIENT_ID': 'test_id',
            'PLAID_CLIENT_ID': 'plaid_id',
            'PLAID_SECRET': 'plaid_secret'
        }):
            service = PortfolioService()
            
            assert 'snaptrade' in service.providers
            assert 'plaid' in service.providers
            assert 'alpaca' in service.providers
            
            # Verify SnapTrade provider is properly initialized
            snaptrade_provider = service.providers['snaptrade']
            assert snaptrade_provider.get_provider_name() == 'snaptrade'
    
    def test_trade_routing_service_available(self):
        """Test trade routing service functions are available."""
        # These should not raise import errors
        assert hasattr(TradeRoutingService, 'get_user_portfolio_mode')
        assert hasattr(TradeRoutingService, 'detect_symbol_account')
        assert hasattr(TradeRoutingService, 'get_trading_accounts')
        assert hasattr(TradeRoutingService, 'get_snaptrade_user_credentials')
    
    @pytest.mark.asyncio
    async def test_snaptrade_provider_health_check(self):
        """Test SnapTrade provider health check."""
        with patch.dict('os.environ', {
            'SNAPTRADE_CONSUMER_KEY': 'test_key',
            'SNAPTRADE_CLIENT_ID': 'test_id'
        }):
            provider = SnapTradePortfolioProvider()
            
            # Mock API status check
            mock_response = Mock()
            mock_response.body = {'status': 'ok'}
            
            with patch.object(provider.client.api_status, 'check') as mock_check:
                mock_check.return_value = mock_response
                
                health = await provider.health_check()
                
                assert health['provider'] == 'snaptrade'
                assert health['status'] == 'healthy'
                assert 'timestamp' in health


class TestTradeExecutionFlow:
    """Integration tests for trade execution with routing."""
    
    def test_trade_execution_agent_imports(self):
        """Test that trade execution agent imports successfully with SnapTrade."""
        try:
            from clera_agents.trade_execution_agent import (
                execute_buy_market_order,
                execute_sell_market_order
            )
            
            # Verify tools are properly decorated
            assert hasattr(execute_buy_market_order, 'name')
            assert hasattr(execute_sell_market_order, 'name')
            
        except ImportError as e:
            pytest.fail(f"Failed to import trade execution agent: {e}")


class TestPortfolioDataProvider:
    """Integration tests for portfolio data provider with SnapTrade."""
    
    def test_portfolio_data_provider_snaptrade_support(self):
        """Test portfolio data provider recognizes SnapTrade."""
        from clera_agents.services.portfolio_data_provider import UserPortfolioMode
        
        # Test UserPortfolioMode with SnapTrade
        mode = UserPortfolioMode(
            has_alpaca=False,
            has_plaid=False,
            has_snaptrade=True,
            alpaca_account_id=None,
            user_id='test_user'
        )
        
        assert mode.mode == 'aggregation'
        assert mode.is_valid is True
    
    def test_portfolio_data_provider_hybrid_mode(self):
        """Test hybrid mode with Alpaca + SnapTrade."""
        from clera_agents.services.portfolio_data_provider import UserPortfolioMode
        
        mode = UserPortfolioMode(
            has_alpaca=True,
            has_plaid=False,
            has_snaptrade=True,
            alpaca_account_id='alpaca_123',
            user_id='test_user'
        )
        
        assert mode.mode == 'hybrid'
        assert mode.is_valid is True
        assert mode.has_alpaca is True
        assert mode.has_snaptrade is True


class TestDatabaseSchema:
    """Test database schema supports SnapTrade."""
    
    @pytest.mark.asyncio
    async def test_snaptrade_tables_accessible(self):
        """Test that SnapTrade tables can be queried (verifies migration ran)."""
        from utils.supabase.db_client import get_supabase_client
        
        supabase = get_supabase_client()
        
        # Test snaptrade_users table
        try:
            result = supabase.table('snaptrade_users').select('*').limit(1).execute()
            assert result is not None  # Table exists
        except Exception as e:
            pytest.fail(f"snaptrade_users table not accessible: {e}")
        
        # Test snaptrade_brokerage_connections table
        try:
            result = supabase.table('snaptrade_brokerage_connections').select('*').limit(1).execute()
            assert result is not None
        except Exception as e:
            pytest.fail(f"snaptrade_brokerage_connections table not accessible: {e}")
        
        # Test snaptrade_orders table
        try:
            result = supabase.table('snaptrade_orders').select('*').limit(1).execute()
            assert result is not None
        except Exception as e:
            pytest.fail(f"snaptrade_orders table not accessible: {e}")
    
    @pytest.mark.asyncio
    async def test_user_investment_accounts_has_snaptrade_columns(self):
        """Test that user_investment_accounts table has SnapTrade columns."""
        from utils.supabase.db_client import get_supabase_client
        
        supabase = get_supabase_client()
        
        try:
            # Query with SnapTrade-specific columns
            result = supabase.table('user_investment_accounts')\
                .select('account_mode, connection_type, snaptrade_authorization_id')\
                .limit(1)\
                .execute()
            
            # If this doesn't raise an error, columns exist
            assert result is not None
        except Exception as e:
            pytest.fail(f"SnapTrade columns not found in user_investment_accounts: {e}")


class TestFeatureFlags:
    """Test feature flags support SnapTrade."""
    
    def test_snaptrade_feature_flags_exist(self):
        """Test that SnapTrade feature flags are defined."""
        from utils.feature_flags import FeatureFlagKey, get_feature_flags
        
        # Verify enum keys exist
        assert hasattr(FeatureFlagKey, 'SNAPTRADE_INVESTMENT_SYNC')
        # REMOVED: SNAPTRADE_TRADE_EXECUTION test - flag no longer exists (account-based permissions)
        
        # Verify flags are loaded
        flags = get_feature_flags()
        assert 'snaptrade_investment_sync' in flags.flags
        # REMOVED: snaptrade_trade_execution check - flag no longer exists


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

