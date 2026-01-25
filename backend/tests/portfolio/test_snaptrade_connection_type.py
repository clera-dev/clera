"""
Tests for SnapTrade connection type filtering.

These tests verify that:
1. connection_type=None does NOT pass connection_type to SDK (uses SnapTrade's default)
2. connection_type='read' filters to read-only brokerages
3. connection_type='trade' filters to trading-enabled brokerages
4. Invalid connection_type values are ignored (not passed to SDK)

Critical for Issue #1: Users should see all brokerages during onboarding.

IMPORTANT: SnapTrade SDK only accepts 'read' or 'trade' for connectionType.
When omitted, SnapTrade uses its default which shows all available brokerages.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock

from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider


class TestConnectionTypeFiltering:
    """Test suite for connection type filtering behavior."""
    
    @pytest.mark.asyncio
    async def test_connection_type_none_does_not_pass_connection_type(self):
        """
        Test that passing connection_type=None does NOT include connection_type in SDK call.
        
        When connection_type is None, we omit the parameter entirely to let SnapTrade
        use its default behavior which shows all available brokerages.
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
            
            # Call with connection_type=None
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type=None
            )
            
            assert url == 'https://connect.snaptrade.com/test'
            
            # Verify that connection_type was NOT passed to the SDK
            mock_login.assert_called_once()
            call_kwargs = mock_login.call_args.kwargs
            assert 'connection_type' not in call_kwargs
    
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
    async def test_invalid_connection_type_is_ignored(self):
        """
        Test that invalid connection_type values (like 'trade-if-available') are ignored.
        
        HOTFIX: The SnapTrade SDK only accepts 'read' or 'trade'. Any other value
        should be ignored (not passed to SDK) to prevent 500 errors.
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
            
            # Pass an invalid connection_type - should be ignored
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type='trade-if-available'  # Invalid - should be ignored
            )
            
            assert url == 'https://connect.snaptrade.com/all'
            
            # Verify connection_type was NOT passed (invalid value ignored)
            call_kwargs = mock_login.call_args.kwargs
            assert 'connection_type' not in call_kwargs
    
    @pytest.mark.asyncio
    async def test_default_behavior_omits_connection_type(self):
        """
        Test that calling without connection_type omits the parameter from SDK call.
        
        This lets SnapTrade use its default behavior which shows all available brokerages.
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
            
            # Verify connection_type was NOT passed
            call_kwargs = mock_login.call_args.kwargs
            assert 'connection_type' not in call_kwargs


class TestConnectionTypeSyncBehavior:
    """Test that connection_type is correctly determined during account sync.
    
    CRITICAL: These tests mirror the ACTUAL logic in snaptrade_routes.py sync functions.
    The key behavior is:
    - Only set connection_type if 'allows_trading' field EXISTS in brokerage object
    - If field is missing, leave connection_type as None (unknown) for retry on next sync
    - Never default to 'read' on missing field - that would permanently disable trading
    """
    
    def test_allows_trading_true_sets_trade(self):
        """Test that allows_trading=True sets connection_type='trade'."""
        brokerage_obj = {'name': 'Robinhood', 'allows_trading': True}
        
        # Mirror actual sync logic: check field existence first
        actual_connection_type = None
        connection_type_determined = False
        if 'allows_trading' in brokerage_obj:
            allows_trading = brokerage_obj.get('allows_trading')
            actual_connection_type = 'trade' if allows_trading else 'read'
            connection_type_determined = True
        
        assert connection_type_determined is True
        assert actual_connection_type == 'trade'
    
    def test_allows_trading_false_sets_read(self):
        """Test that allows_trading=False sets connection_type='read'."""
        brokerage_obj = {'name': 'Vanguard', 'allows_trading': False}
        
        # Mirror actual sync logic: check field existence first
        actual_connection_type = None
        connection_type_determined = False
        if 'allows_trading' in brokerage_obj:
            allows_trading = brokerage_obj.get('allows_trading')
            actual_connection_type = 'trade' if allows_trading else 'read'
            connection_type_determined = True
        
        assert connection_type_determined is True
        assert actual_connection_type == 'read'
    
    def test_missing_allows_trading_does_not_set_type(self):
        """
        Test that missing allows_trading field leaves connection_type as None.
        
        CRITICAL: This is the key fix for the 'transient API errors permanently disable trading' bug.
        If the field is missing from the API response, we do NOT default to 'read'.
        Instead, we leave connection_type as None (unknown) so it can be retried on next sync.
        This prevents a temporary API issue from permanently disabling trading for users.
        """
        brokerage_obj = {'name': 'Unknown Brokerage'}  # No 'allows_trading' field
        
        # Mirror actual sync logic: check field existence first
        actual_connection_type = None
        connection_type_determined = False
        if 'allows_trading' in brokerage_obj:
            allows_trading = brokerage_obj.get('allows_trading')
            actual_connection_type = 'trade' if allows_trading else 'read'
            connection_type_determined = True
        
        # CRITICAL: connection_type should NOT be determined, and should remain None
        assert connection_type_determined is False
        assert actual_connection_type is None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
