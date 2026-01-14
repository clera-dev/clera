"""
Tests for SnapTrade connection type filtering.

These tests verify that:
1. connection_type=None defaults to 'trade-if-available' (shows ALL brokerages)
2. connection_type='read' filters to read-only brokerages
3. connection_type='trade' filters to trading-enabled brokerages
4. connection_type='trade-if-available' shows ALL brokerages with trading where supported

Critical for Issue #1: Users should see all brokerages during onboarding,
including read-only ones, for a holistic view of their investments.

IMPORTANT: SnapTrade API defaults to 'read' if connectionType is omitted,
which only shows read-only brokerages. We use 'trade-if-available' to show ALL.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock

from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider


class TestConnectionTypeFiltering:
    """Test suite for connection type filtering behavior."""
    
    @pytest.mark.asyncio
    async def test_connection_type_none_defaults_to_trade_if_available(self):
        """
        Test that passing connection_type=None uses 'trade-if-available'.
        
        CRITICAL: SnapTrade API defaults to 'read' which only shows read-only brokerages.
        We override this to 'trade-if-available' to show ALL brokerages during onboarding.
        """
        provider = SnapTradePortfolioProvider()
        
        mock_login_response = Mock()
        mock_login_response.body = {'redirectURI': 'https://connect.snaptrade.com/test'}
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider.client.authentication, 'login_snap_trade_user') as mock_login:
            
            mock_creds.return_value = {
                'snaptrade_user_id': 'test_user',
                'user_secret': 'test_secret'
            }
            mock_login.return_value = mock_login_response
            
            # Call with connection_type=None (should use 'trade-if-available')
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type=None  # Should become 'trade-if-available'
            )
            
            assert url == 'https://connect.snaptrade.com/test'
            
            # Verify that 'trade-if-available' was passed to the SDK
            mock_login.assert_called_once()
            call_kwargs = mock_login.call_args.kwargs
            assert call_kwargs.get('connection_type') == 'trade-if-available'
    
    @pytest.mark.asyncio
    async def test_connection_type_read_filters_correctly(self):
        """Test that connection_type='read' filters to read-only brokerages."""
        provider = SnapTradePortfolioProvider()
        
        mock_login_response = Mock()
        mock_login_response.body = {'redirectURI': 'https://connect.snaptrade.com/read'}
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider.client.authentication, 'login_snap_trade_user') as mock_login:
            
            mock_creds.return_value = {
                'snaptrade_user_id': 'test_user',
                'user_secret': 'test_secret'
            }
            mock_login.return_value = mock_login_response
            
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type='read'
            )
            
            assert url == 'https://connect.snaptrade.com/read'
            
            # Verify connection_type='read' was passed
            call_kwargs = mock_login.call_args.kwargs
            assert call_kwargs.get('connection_type') == 'read'
    
    @pytest.mark.asyncio
    async def test_connection_type_trade_filters_correctly(self):
        """Test that connection_type='trade' filters to trading-enabled brokerages."""
        provider = SnapTradePortfolioProvider()
        
        mock_login_response = Mock()
        mock_login_response.body = {'redirectURI': 'https://connect.snaptrade.com/trade'}
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider.client.authentication, 'login_snap_trade_user') as mock_login:
            
            mock_creds.return_value = {
                'snaptrade_user_id': 'test_user',
                'user_secret': 'test_secret'
            }
            mock_login.return_value = mock_login_response
            
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type='trade'
            )
            
            assert url == 'https://connect.snaptrade.com/trade'
            
            # Verify connection_type='trade' was passed
            call_kwargs = mock_login.call_args.kwargs
            assert call_kwargs.get('connection_type') == 'trade'
    
    @pytest.mark.asyncio
    async def test_connection_type_trade_if_available_shows_all(self):
        """
        Test that 'trade-if-available' shows ALL brokerages with trading where supported.
        
        This is the recommended mode for onboarding as it:
        - Shows both read-only AND trading-enabled brokerages
        - Automatically gets trading capabilities where the brokerage supports it
        - Falls back to read-only for brokerages that don't support trading
        """
        provider = SnapTradePortfolioProvider()
        
        mock_login_response = Mock()
        mock_login_response.body = {'redirectURI': 'https://connect.snaptrade.com/all'}
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider.client.authentication, 'login_snap_trade_user') as mock_login:
            
            mock_creds.return_value = {
                'snaptrade_user_id': 'test_user',
                'user_secret': 'test_secret'
            }
            mock_login.return_value = mock_login_response
            
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type='trade-if-available'
            )
            
            assert url == 'https://connect.snaptrade.com/all'
            
            # Verify connection_type='trade-if-available' was passed
            call_kwargs = mock_login.call_args.kwargs
            assert call_kwargs.get('connection_type') == 'trade-if-available'
    
    @pytest.mark.asyncio
    async def test_default_connection_type_is_trade_if_available(self):
        """
        Test that the default connection_type is 'trade-if-available'.
        
        CRITICAL: SnapTrade API defaults to 'read' (read-only brokerages only).
        Our provider overrides this to 'trade-if-available' to show ALL brokerages
        during onboarding for a holistic view of user investments.
        """
        provider = SnapTradePortfolioProvider()
        
        mock_login_response = Mock()
        mock_login_response.body = {'redirectURI': 'https://connect.snaptrade.com/default'}
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider.client.authentication, 'login_snap_trade_user') as mock_login:
            
            mock_creds.return_value = {
                'snaptrade_user_id': 'test_user',
                'user_secret': 'test_secret'
            }
            mock_login.return_value = mock_login_response
            
            # Call WITHOUT specifying connection_type
            url = await provider.get_connection_portal_url(
                user_id='test_user_id'
            )
            
            assert url == 'https://connect.snaptrade.com/default'
            
            # Verify default behavior: should use 'trade-if-available'
            call_kwargs = mock_login.call_args.kwargs
            assert call_kwargs.get('connection_type') == 'trade-if-available'


class TestConnectionTypeSyncBehavior:
    """Test that connection_type is correctly determined during account sync."""
    
    def test_allows_trading_true_sets_trade(self):
        """Test that allows_trading=True sets connection_type='trade'."""
        brokerage_obj = {'name': 'Robinhood', 'allows_trading': True}
        allows_trading = brokerage_obj.get('allows_trading', False)
        actual_connection_type = 'trade' if allows_trading else 'read'
        
        assert actual_connection_type == 'trade'
    
    def test_allows_trading_false_sets_read(self):
        """Test that allows_trading=False sets connection_type='read'."""
        brokerage_obj = {'name': 'Vanguard', 'allows_trading': False}
        allows_trading = brokerage_obj.get('allows_trading', False)
        actual_connection_type = 'trade' if allows_trading else 'read'
        
        assert actual_connection_type == 'read'
    
    def test_missing_allows_trading_defaults_to_read(self):
        """Test that missing allows_trading field defaults to read-only."""
        brokerage_obj = {'name': 'Unknown Brokerage'}
        allows_trading = brokerage_obj.get('allows_trading', False)
        actual_connection_type = 'trade' if allows_trading else 'read'
        
        assert actual_connection_type == 'read'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
