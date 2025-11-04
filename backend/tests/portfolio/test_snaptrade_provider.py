"""
Comprehensive tests for SnapTrade portfolio provider.

Tests cover:
- Provider initialization
- Account fetching
- Position fetching
- Transaction fetching
- Performance metrics
- User registration
- Connection portal URL generation
- Error handling and edge cases
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal
from datetime import datetime, timedelta

from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
from utils.portfolio.abstract_provider import Account, Position, Transaction, ProviderError


class TestSnapTradeProviderInitialization:
    """Test suite for provider initialization."""
    
    def test_provider_initialization_success(self):
        """Test provider initializes successfully with valid credentials."""
        with patch.dict('os.environ', {
            'SNAPTRADE_CONSUMER_KEY': 'test_key',
            'SNAPTRADE_CLIENT_ID': 'test_id'
        }):
            provider = SnapTradePortfolioProvider()
            assert provider.get_provider_name() == 'snaptrade'
            assert provider.client is not None
    
    def test_provider_initialization_missing_credentials(self):
        """Test provider raises error when credentials are missing."""
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ProviderError) as exc_info:
                provider = SnapTradePortfolioProvider()
            
            # The error gets wrapped in INITIALIZATION_ERROR, but message contains MISSING_CREDENTIALS info
            assert 'SNAPTRADE_CONSUMER_KEY' in str(exc_info.value) or 'SNAPTRADE_CLIENT_ID' in str(exc_info.value)
            assert exc_info.value.error_code in ['MISSING_CREDENTIALS', 'INITIALIZATION_ERROR']


class TestSnapTradeAccountFetching:
    """Test suite for account fetching."""
    
    @pytest.mark.asyncio
    async def test_get_accounts_success(self):
        """Test successfully fetching accounts from SnapTrade."""
        provider = SnapTradePortfolioProvider()
        
        # Mock database response
        mock_db_response = Mock()
        mock_db_response.data = [{
            'snaptrade_user_id': 'test_user',
            'snaptrade_user_secret': 'test_secret'
        }]
        
        # Mock SnapTrade API response
        mock_api_response = Mock()
        mock_api_response.body = [
            {
                'id': 'acc_123',
                'name': 'Test Brokerage Account',
                'type': 'investment',
                'institution_name': 'Test Broker',
                'balance': {'total': 10000}
            }
        ]
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider.client.account_information, 'list_user_accounts') as mock_api:
            
            mock_creds.return_value = {
                'snaptrade_user_id': 'test_user',
                'user_secret': 'test_secret'
            }
            mock_api.return_value = mock_api_response
            
            accounts = await provider.get_accounts('test_user_id')
            
            assert len(accounts) == 1
            assert isinstance(accounts[0], Account)
            assert accounts[0].provider == 'snaptrade'
            assert accounts[0].institution_name == 'Test Broker'
            assert accounts[0].balance == Decimal('10000')
    
    @pytest.mark.asyncio
    async def test_get_accounts_no_credentials(self):
        """Test getting accounts when user has no SnapTrade credentials."""
        provider = SnapTradePortfolioProvider()
        
        with patch.object(provider, '_get_user_credentials') as mock_creds:
            mock_creds.return_value = None
            
            accounts = await provider.get_accounts('test_user_id')
            
            assert accounts == []
    
    @pytest.mark.asyncio
    async def test_get_accounts_api_error(self):
        """Test handling SnapTrade API errors."""
        from snaptrade_client.exceptions import ApiException
        
        provider = SnapTradePortfolioProvider()
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider.client.account_information, 'list_user_accounts') as mock_api:
            
            mock_creds.return_value = {
                'snaptrade_user_id': 'test_user',
                'user_secret': 'test_secret'
            }
            mock_api.side_effect = ApiException(status=500, reason="Internal Server Error")
            
            with pytest.raises(ProviderError) as exc_info:
                await provider.get_accounts('test_user_id')
            
            assert exc_info.value.error_code == 'FETCH_ACCOUNTS_ERROR'


class TestSnapTradePositionFetching:
    """Test suite for position fetching."""
    
    @pytest.mark.asyncio
    async def test_get_positions_success(self):
        """Test successfully fetching positions."""
        provider = SnapTradePortfolioProvider()
        
        # Mock credentials
        mock_creds = {
            'snaptrade_user_id': 'test_user',
            'user_secret': 'test_secret'
        }
        
        # Mock positions response
        mock_positions_response = Mock()
        mock_positions_response.body = [
            {
                'symbol': {'symbol': 'AAPL', 'description': 'Apple Inc', 'type': {'id': 'equity'}, 'id': 'symbol_123'},
                'units': 10.5,
                'price': 150.0,
                'value': 1575.0,
                'average_purchase_price': 140.0
            }
        ]
        
        # Mock account details
        mock_account_details = Mock()
        mock_account_details.body = {'institution_name': 'Test Broker'}
        
        # Mock accounts list
        mock_accounts_response = Mock()
        mock_accounts_response.body = [{'id': 'acc_123'}]
        
        with patch.object(provider, '_get_user_credentials') as mock_creds_func, \
             patch.object(provider.client.account_information, 'list_user_accounts') as mock_accounts, \
             patch.object(provider.client.account_information, 'get_user_account_positions') as mock_positions, \
             patch.object(provider.client.account_information, 'get_user_account_details') as mock_details:
            
            mock_creds_func.return_value = mock_creds
            mock_accounts.return_value = mock_accounts_response
            mock_positions.return_value = mock_positions_response
            mock_details.return_value = mock_account_details
            
            positions = await provider.get_positions('test_user_id')
            
            assert len(positions) > 0
            assert isinstance(positions[0], Position)
            assert positions[0].symbol == 'AAPL'
            assert positions[0].quantity == Decimal('10.5')
            assert positions[0].market_value == Decimal('1575.0')
            assert positions[0].universal_symbol_id == 'symbol_123'


class TestSnapTradeTransactionFetching:
    """Test suite for transaction fetching."""
    
    @pytest.mark.asyncio
    async def test_get_transactions_success(self):
        """Test successfully fetching transactions."""
        provider = SnapTradePortfolioProvider()
        
        mock_creds = {
            'snaptrade_user_id': 'test_user',
            'user_secret': 'test_secret'
        }
        
        mock_activities_response = Mock()
        mock_activities_response.body = {
            'data': [
                {
                    'id': 'txn_123',
                    'symbol': 'AAPL',
                    'type': 'BUY',
                    'quantity': 10.0,
                    'price': 150.0,
                    'amount': 1500.0,
                    'fee': 0.0,
                    'trade_date': '2025-01-01',
                    'description': 'BUY AAPL'
                }
            ]
        }
        
        mock_accounts_response = Mock()
        mock_accounts_response.body = [{'id': 'acc_123'}]
        
        with patch.object(provider, '_get_user_credentials') as mock_creds_func, \
             patch.object(provider.client.account_information, 'list_user_accounts') as mock_accounts, \
             patch.object(provider.client.account_information, 'get_account_activities') as mock_activities:
            
            mock_creds_func.return_value = mock_creds
            mock_accounts.return_value = mock_accounts_response
            mock_activities.return_value = mock_activities_response
            
            transactions = await provider.get_transactions('test_user_id')
            
            assert len(transactions) > 0
            assert isinstance(transactions[0], Transaction)
            assert transactions[0].symbol == 'AAPL'
            assert transactions[0].transaction_type == 'buy'
            assert transactions[0].quantity == Decimal('10.0')


class TestSnapTradeUserRegistration:
    """Test suite for user registration."""
    
    @pytest.mark.asyncio
    async def test_register_user_success(self):
        """Test successful user registration."""
        provider = SnapTradePortfolioProvider()
        
        mock_register_response = Mock()
        mock_register_response.body = {'userSecret': 'generated_secret_123'}
        
        mock_db_insert = Mock()
        mock_db_insert.execute = Mock()
        
        with patch.object(provider.client.authentication, 'register_snap_trade_user') as mock_register, \
             patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            
            mock_register.return_value = mock_register_response
            mock_supabase.return_value.table.return_value.insert.return_value = mock_db_insert
            
            result = await provider.register_user('test_user_id')
            
            assert result['user_id'] == 'test_user_id'
            assert result['user_secret'] == 'generated_secret_123'
            mock_register.assert_called_once()
            mock_db_insert.execute.assert_called_once()


class TestSnapTradeConnectionPortal:
    """Test suite for connection portal URL generation."""
    
    @pytest.mark.asyncio
    async def test_get_connection_portal_url_existing_user(self):
        """Test getting connection URL for existing registered user."""
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
            
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type='trade'
            )
            
            assert url == 'https://connect.snaptrade.com/test'
            mock_login.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_connection_portal_url_new_user(self):
        """Test getting connection URL triggers user registration for new users."""
        provider = SnapTradePortfolioProvider()
        
        mock_register_response = Mock()
        mock_register_response.body = {'userSecret': 'new_secret'}
        
        mock_login_response = Mock()
        mock_login_response.body = {'redirectURI': 'https://connect.snaptrade.com/test'}
        
        with patch.object(provider, '_get_user_credentials') as mock_creds, \
             patch.object(provider, 'register_user') as mock_register, \
             patch.object(provider.client.authentication, 'login_snap_trade_user') as mock_login:
            
            mock_creds.return_value = None  # User not registered
            mock_register.return_value = {'user_id': 'test_user', 'user_secret': 'new_secret'}
            mock_login.return_value = mock_login_response
            
            url = await provider.get_connection_portal_url(
                user_id='test_user_id',
                connection_type='trade'
            )
            
            assert url == 'https://connect.snaptrade.com/test'
            mock_register.assert_called_once_with('test_user_id')


class TestSnapTradeHealthCheck:
    """Test suite for health check."""
    
    @pytest.mark.asyncio
    async def test_health_check_healthy(self):
        """Test health check returns healthy status."""
        provider = SnapTradePortfolioProvider()
        
        mock_status_response = Mock()
        mock_status_response.body = {'status': 'ok'}
        
        with patch.object(provider.client.api_status, 'check') as mock_status:
            mock_status.return_value = mock_status_response
            
            health = await provider.health_check()
            
            assert health['provider'] == 'snaptrade'
            assert health['status'] == 'healthy'
            assert 'timestamp' in health
    
    @pytest.mark.asyncio
    async def test_health_check_unhealthy(self):
        """Test health check handles errors gracefully."""
        provider = SnapTradePortfolioProvider()
        
        with patch.object(provider.client.api_status, 'check') as mock_status:
            mock_status.side_effect = Exception("API unavailable")
            
            health = await provider.health_check()
            
            assert health['provider'] == 'snaptrade'
            assert health['status'] == 'unhealthy'
            assert 'error' in health


class TestSnapTradeEdgeCases:
    """Test edge cases and error scenarios."""
    
    @pytest.mark.asyncio
    async def test_get_positions_with_account_filter(self):
        """Test fetching positions for specific account."""
        provider = SnapTradePortfolioProvider()
        
        mock_creds = {
            'snaptrade_user_id': 'test_user',
            'user_secret': 'test_secret'
        }
        
        mock_positions_response = Mock()
        mock_positions_response.body = [
            {
                'symbol': {'symbol': 'AAPL', 'description': 'Apple', 'type': {'id': 'equity'}, 'id': 'sym_123'},
                'units': 5.0,
                'price': 150.0,
                'value': 750.0,
                'average_purchase_price': 140.0
            }
        ]
        
        mock_account_details = Mock()
        mock_account_details.body = {'institution_name': 'Test Broker'}
        
        with patch.object(provider, '_get_user_credentials') as mock_creds_func, \
             patch.object(provider.client.account_information, 'get_user_account_positions') as mock_positions, \
             patch.object(provider.client.account_information, 'get_user_account_details') as mock_details:
            
            mock_creds_func.return_value = mock_creds
            mock_positions.return_value = mock_positions_response
            mock_details.return_value = mock_account_details
            
            positions = await provider.get_positions('test_user_id', account_id='snaptrade_acc_123')
            
            assert len(positions) > 0
            assert positions[0].account_id == 'snaptrade_acc_123'
    
    @pytest.mark.asyncio
    async def test_get_transactions_with_date_range(self):
        """Test fetching transactions with custom date range."""
        provider = SnapTradePortfolioProvider()
        
        start_date = datetime.now() - timedelta(days=30)
        end_date = datetime.now()
        
        mock_creds = {'snaptrade_user_id': 'test_user', 'user_secret': 'test_secret'}
        mock_accounts = Mock(body=[{'id': 'acc_123'}])
        mock_activities = Mock(body={'data': []})
        
        with patch.object(provider, '_get_user_credentials') as mock_creds_func, \
             patch.object(provider.client.account_information, 'list_user_accounts') as mock_acc, \
             patch.object(provider.client.account_information, 'get_account_activities') as mock_act:
            
            mock_creds_func.return_value = mock_creds
            mock_acc.return_value = mock_accounts
            mock_act.return_value = mock_activities
            
            transactions = await provider.get_transactions(
                'test_user_id',
                start_date=start_date,
                end_date=end_date
            )
            
            # Verify date range was passed to API
            mock_act.assert_called()
            call_args = mock_act.call_args
            assert call_args[1]['start_date'] == start_date.date()
            assert call_args[1]['end_date'] == end_date.date()
    
    @pytest.mark.asyncio
    async def test_refresh_data_success(self):
        """Test manual data refresh."""
        provider = SnapTradePortfolioProvider()
        
        mock_creds = {'snaptrade_user_id': 'test_user', 'user_secret': 'test_secret'}
        mock_auths = Mock(body=[{'id': 'auth_123'}])
        mock_refresh = Mock()
        
        with patch.object(provider, '_get_user_credentials') as mock_creds_func, \
             patch.object(provider.client.connections, 'list_brokerage_authorizations') as mock_list, \
             patch.object(provider.client.connections, 'refresh_brokerage_authorization') as mock_ref:
            
            mock_creds_func.return_value = mock_creds
            mock_list.return_value = mock_auths
            mock_ref.return_value = mock_refresh
            
            result = await provider.refresh_data('test_user_id')
            
            assert result is True
            mock_ref.assert_called_once()


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

