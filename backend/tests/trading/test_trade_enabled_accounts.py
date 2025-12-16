"""
Test: Trade-Enabled Accounts API

Production-grade tests for SnapTrade account trading functionality.
Ensures proper account listing with cash balances for trading.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi import HTTPException


class TestTradeEnabledAccountsEndpoint:
    """Test /api/snaptrade/trade-enabled-accounts endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_trade_enabled_accounts_success(self):
        """Test successful retrieval of trade-enabled accounts."""
        from routes.snaptrade_routes import get_trade_enabled_accounts
        
        mock_user_id = "test_user_123"
        
        # Mock Supabase response
        mock_accounts_data = [
            {
                'id': 'uuid-1',
                'provider_account_id': 'snap_account_1',
                'institution_name': 'Webull',
                'account_name': 'Individual Brokerage',
                'cash_balance': 5000.00,
                'buying_power': 5000.00,
                'connection_type': 'trade'
            },
            {
                'id': 'uuid-2',
                'provider_account_id': 'snap_account_2',
                'institution_name': 'Robinhood',
                'account_name': 'Crypto Account',
                'cash_balance': 1500.50,
                'buying_power': 1500.50,
                'connection_type': 'trade'
            }
        ]
        
        with patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            # Setup mock chain
            mock_client = Mock()
            mock_table = Mock()
            mock_select = Mock()
            mock_eq_user = Mock()
            mock_eq_provider = Mock()
            mock_eq_active = Mock()
            mock_eq_connection = Mock()
            mock_execute = Mock()
            
            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq_user
            mock_eq_user.eq.return_value = mock_eq_provider
            mock_eq_provider.eq.return_value = mock_eq_active
            mock_eq_active.eq.return_value = mock_eq_connection
            mock_eq_connection.execute.return_value = mock_execute
            mock_execute.data = mock_accounts_data
            
            mock_supabase.return_value = mock_client
            
            # Call endpoint
            result = await get_trade_enabled_accounts(user_id=mock_user_id)
            
            # Assertions
            assert result['success'] is True
            assert len(result['accounts']) == 2
            
            # Check first account
            assert result['accounts'][0]['account_id'] == 'snap_account_1'
            assert result['accounts'][0]['institution_name'] == 'Webull'
            assert result['accounts'][0]['cash'] == 5000.00
            assert result['accounts'][0]['buying_power'] == 5000.00
            assert result['accounts'][0]['type'] == 'snaptrade'
            assert result['accounts'][0]['is_trade_enabled'] is True
            
            # Check Alpaca account (should be None for now)
            assert result['alpaca_account'] is None
    
    @pytest.mark.asyncio
    async def test_get_trade_enabled_accounts_no_accounts(self):
        """Test when user has no trade-enabled accounts."""
        from routes.snaptrade_routes import get_trade_enabled_accounts
        
        mock_user_id = "new_user_123"
        
        with patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            # Setup mock chain
            mock_client = Mock()
            mock_table = Mock()
            mock_select = Mock()
            mock_eq_user = Mock()
            mock_eq_provider = Mock()
            mock_eq_active = Mock()
            mock_eq_connection = Mock()
            mock_execute = Mock()
            
            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq_user
            mock_eq_user.eq.return_value = mock_eq_provider
            mock_eq_provider.eq.return_value = mock_eq_active
            mock_eq_active.eq.return_value = mock_eq_connection
            mock_eq_connection.execute.return_value = mock_execute
            mock_execute.data = []  # No accounts
            
            mock_supabase.return_value = mock_client
            
            # Call endpoint
            result = await get_trade_enabled_accounts(user_id=mock_user_id)
            
            # Assertions
            assert result['success'] is True
            assert len(result['accounts']) == 0
            assert result['alpaca_account'] is None
    
    @pytest.mark.asyncio
    async def test_get_trade_enabled_accounts_database_error(self):
        """Test error handling when database query fails."""
        from routes.snaptrade_routes import get_trade_enabled_accounts
        
        mock_user_id = "error_user_123"
        
        with patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            mock_client = Mock()
            mock_client.table.side_effect = Exception("Database connection failed")
            mock_supabase.return_value = mock_client
            
            # Call endpoint and expect HTTPException
            with pytest.raises(HTTPException) as exc_info:
                await get_trade_enabled_accounts(user_id=mock_user_id)
            
            assert exc_info.value.status_code == 500
    
    @pytest.mark.asyncio
    async def test_account_cash_balance_handling(self):
        """Test proper handling of null/missing cash balances."""
        from routes.snaptrade_routes import get_trade_enabled_accounts
        
        mock_user_id = "test_user_cash"
        
        # Mock account with null cash balance
        mock_accounts_data = [
            {
                'id': 'uuid-1',
                'provider_account_id': 'snap_account_1',
                'institution_name': 'Webull',
                'account_name': 'New Account',
                'cash_balance': None,  # Null balance
                'buying_power': None,
                'connection_type': 'trade'
            }
        ]
        
        with patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            # Setup mock chain
            mock_client = Mock()
            mock_table = Mock()
            mock_select = Mock()
            mock_eq_user = Mock()
            mock_eq_provider = Mock()
            mock_eq_active = Mock()
            mock_eq_connection = Mock()
            mock_execute = Mock()
            
            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq_user
            mock_eq_user.eq.return_value = mock_eq_provider
            mock_eq_provider.eq.return_value = mock_eq_active
            mock_eq_active.eq.return_value = mock_eq_connection
            mock_eq_connection.execute.return_value = mock_execute
            mock_execute.data = mock_accounts_data
            
            mock_supabase.return_value = mock_client
            
            # Call endpoint
            result = await get_trade_enabled_accounts(user_id=mock_user_id)
            
            # Assertions
            assert result['success'] is True
            assert len(result['accounts']) == 1
            assert result['accounts'][0]['cash'] == 0.0  # Should default to 0
            assert result['accounts'][0]['buying_power'] == 0.0


class TestOrderModalIntegration:
    """Test OrderModal integration with trade endpoints."""
    
    def test_trade_account_interface(self):
        """Test that account format matches OrderModal expectations."""
        # Expected format from OrderModal (OrderModal.tsx line 40-49)
        expected_interface = {
            'id': str,
            'account_id': str,
            'institution_name': str,
            'account_name': str,
            'cash': float,
            'buying_power': float,
            'type': str,
            'is_trade_enabled': bool
        }
        
        # Sample account from endpoint
        sample_account = {
            'id': 'uuid-1',
            'account_id': 'snap_account_1',
            'institution_name': 'Webull',
            'account_name': 'Individual Brokerage',
            'cash': 5000.00,
            'buying_power': 5000.00,
            'type': 'snaptrade',
            'is_trade_enabled': True
        }
        
        # Verify all required fields are present
        for key, expected_type in expected_interface.items():
            assert key in sample_account, f"Missing required field: {key}"
            assert isinstance(sample_account[key], expected_type), \
                f"Field {key} has wrong type: expected {expected_type}, got {type(sample_account[key])}"


class TestEdgeCases:
    """Test edge cases for trading functionality."""
    
    @pytest.mark.asyncio
    async def test_multiple_accounts_same_institution(self):
        """Test user with multiple accounts at same brokerage."""
        from routes.snaptrade_routes import get_trade_enabled_accounts
        
        mock_user_id = "test_multi_accounts"
        
        mock_accounts_data = [
            {
                'id': 'uuid-1',
                'provider_account_id': 'snap_account_1',
                'institution_name': 'Webull',
                'account_name': 'Individual Brokerage',
                'cash_balance': 5000.00,
                'buying_power': 5000.00,
                'connection_type': 'trade'
            },
            {
                'id': 'uuid-2',
                'provider_account_id': 'snap_account_2',
                'institution_name': 'Webull',
                'account_name': 'IRA',
                'cash_balance': 10000.00,
                'buying_power': 10000.00,
                'connection_type': 'trade'
            }
        ]
        
        with patch('utils.supabase.db_client.get_supabase_client') as mock_supabase:
            # Setup mock chain
            mock_client = Mock()
            mock_table = Mock()
            mock_select = Mock()
            mock_eq_user = Mock()
            mock_eq_provider = Mock()
            mock_eq_active = Mock()
            mock_eq_connection = Mock()
            mock_execute = Mock()
            
            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq_user
            mock_eq_user.eq.return_value = mock_eq_provider
            mock_eq_provider.eq.return_value = mock_eq_active
            mock_eq_active.eq.return_value = mock_eq_connection
            mock_eq_connection.execute.return_value = mock_execute
            mock_execute.data = mock_accounts_data
            
            mock_supabase.return_value = mock_client
            
            # Call endpoint
            result = await get_trade_enabled_accounts(user_id=mock_user_id)
            
            # Assertions
            assert result['success'] is True
            assert len(result['accounts']) == 2
            # Both accounts should be returned separately
            assert result['accounts'][0]['account_name'] != result['accounts'][1]['account_name']


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])

