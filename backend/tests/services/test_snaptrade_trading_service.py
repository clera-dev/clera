"""
Tests for SnapTradeTradingService

PRODUCTION-GRADE: Comprehensive tests for trade execution via SnapTrade API.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from services.snaptrade_trading_service import SnapTradeTradingService, get_snaptrade_trading_service


class TestSnapTradeTradingService:
    """Test suite for SnapTradeTradingService."""
    
    def test_service_initialization(self):
        """Test that the service initializes correctly."""
        service = SnapTradeTradingService()
        assert service.client is not None
        assert hasattr(service.client, 'trading')
        assert hasattr(service.client, 'reference_data')
        assert hasattr(service.client, 'account_information')
    
    def test_get_snaptrade_trading_service_singleton(self):
        """Test that get_snaptrade_trading_service returns a singleton."""
        service1 = get_snaptrade_trading_service()
        service2 = get_snaptrade_trading_service()
        assert service1 is service2
    
    @patch('supabase.create_client')
    def test_get_user_credentials_success(self, mock_create_client):
        """Test fetching user credentials successfully."""
        # Setup mock
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        result = service.get_user_credentials('platform-user-123')
        
        assert result is not None
        assert result['snaptrade_user_id'] == 'test-user-123'
        assert result['snaptrade_user_secret'] == 'test-secret-456'
    
    @patch('supabase.create_client')
    def test_get_user_credentials_not_found(self, mock_create_client):
        """Test fetching credentials for non-existent user."""
        # Setup mock
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data=None
        )
        
        service = SnapTradeTradingService()
        result = service.get_user_credentials('non-existent-user')
        
        assert result is None
    
    def test_get_universal_symbol_id_mocked(self):
        """Test symbol lookup with mocked SnapTrade response."""
        service = SnapTradeTradingService()
        
        # Mock the SnapTrade client response
        mock_response = Mock()
        mock_response.body = [{'id': 'symbol-uuid-123', 'symbol': 'AAPL'}]
        service.client.reference_data.get_symbols_by_ticker = Mock(return_value=mock_response)
        
        result = service.get_universal_symbol_id('AAPL')
        
        assert result == 'symbol-uuid-123'
    
    def test_get_universal_symbol_id_not_found(self):
        """Test symbol lookup for invalid symbol."""
        service = SnapTradeTradingService()
        
        # Mock the SnapTrade client response - empty result
        mock_response = Mock()
        mock_response.body = []
        service.client.reference_data.get_symbols_by_ticker = Mock(return_value=mock_response)
        
        result = service.get_universal_symbol_id('INVALID')
        
        assert result is None
    
    @patch('supabase.create_client')
    def test_place_order_force_mode(self, mock_create_client):
        """Test force placing an order (without trade_id)."""
        # Setup mocks
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock symbol lookup
        mock_symbol_response = Mock()
        mock_symbol_response.body = [{'id': 'symbol-uuid-123', 'symbol': 'AAPL'}]
        service.client.reference_data.get_symbols_by_ticker = Mock(return_value=mock_symbol_response)
        
        # Mock order placement
        mock_order_response = Mock()
        mock_order_response.body = {
            'brokerage_order_id': 'order-123',
            'status': 'PENDING',
            'universal_symbol': {'symbol': 'AAPL'},
            'action': 'BUY',
            'total_quantity': '10',
            'filled_quantity': '0',
            'execution_price': None,
            'order_type': 'Market',
            'time_placed': '2025-10-28T12:00:00Z'
        }
        service.client.trading.place_force_order = Mock(return_value=mock_order_response)
        
        result = service.place_order(
            user_id='platform-user-123',
            account_id='account-uuid-456',
            symbol='AAPL',
            action='BUY',
            order_type='Market',
            time_in_force='Day',
            notional_value=1000.0
        )
        
        assert result['success'] is True
        assert result['order']['brokerage_order_id'] == 'order-123'
        assert result['order']['status'] == 'PENDING'
        assert result['order']['symbol'] == 'AAPL'
    
    @patch('supabase.create_client')
    def test_place_order_missing_credentials(self, mock_create_client):
        """Test placing order with missing user credentials."""
        # Setup mock
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data=None
        )
        
        service = SnapTradeTradingService()
        
        result = service.place_order(
            user_id='non-existent-user',
            account_id='account-uuid-456',
            symbol='AAPL',
            action='BUY',
            order_type='Market',
            time_in_force='Day',
            notional_value=1000.0
        )
        
        assert result['success'] is False
        assert 'credentials not found' in result['error'].lower()
    
    @patch('supabase.create_client')
    def test_cancel_order(self, mock_create_client):
        """Test cancelling an order."""
        # Setup mocks
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock cancel order response
        mock_cancel_response = Mock()
        mock_cancel_response.body = {
            'brokerage_order_id': 'order-123',
            'raw_response': {'status': 'CANCELLED'}
        }
        service.client.trading.cancel_order = Mock(return_value=mock_cancel_response)
        
        result = service.cancel_order(
            user_id='platform-user-123',
            account_id='account-uuid-456',
            brokerage_order_id='order-123'
        )
        
        assert result['success'] is True
        assert 'cancelled successfully' in result['message'].lower()
    
    @patch('supabase.create_client')
    def test_get_account_orders(self, mock_create_client):
        """Test fetching account orders."""
        # Setup mocks
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock get orders response
        mock_orders_response = Mock()
        mock_orders_response.body = [
            {
                'brokerage_order_id': 'order-1',
                'status': 'OPEN',
                'symbol': 'AAPL',
                'action': 'BUY'
            },
            {
                'brokerage_order_id': 'order-2',
                'status': 'EXECUTED',
                'symbol': 'TSLA',
                'action': 'SELL'
            }
        ]
        service.client.account_information.get_user_account_orders = Mock(return_value=mock_orders_response)
        
        result = service.get_account_orders(
            user_id='platform-user-123',
            account_id='account-uuid-456'
        )
        
        assert result['success'] is True
        assert len(result['orders']) == 2
        
        # Test status filter
        result_filtered = service.get_account_orders(
            user_id='platform-user-123',
            account_id='account-uuid-456',
            status='OPEN'
        )
        
        assert result_filtered['success'] is True
        assert len(result_filtered['orders']) == 1
        assert result_filtered['orders'][0]['status'] == 'OPEN'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

