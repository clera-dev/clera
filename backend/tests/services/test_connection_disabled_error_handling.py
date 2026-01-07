"""
Tests for SnapTrade Connection Disabled Error Handling

PRODUCTION-GRADE: Tests to ensure that when a brokerage connection is disabled
(SnapTrade error code 3003), users receive clear, actionable error messages
instead of misleading "symbol not available" errors.

Root cause: When Coinbase was added as a second brokerage account, the connection
to the Webull account expired/disabled. SnapTrade returns error 3003 when trying
to look up symbols for that account, but the old code would just return None
and show "Symbol not available" - which is confusing and incorrect.

Fix: 
1. Detect error code 3003 specifically
2. Raise a dedicated SnapTradeConnectionError 
3. Return user-friendly message prompting them to reconnect
4. Mark accounts with broken connections in trade-enabled-accounts endpoint
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from services.snaptrade_trading_service import (
    SnapTradeTradingService, 
    get_snaptrade_trading_service,
    is_connection_disabled_error,
    is_market_closed_error,
    SnapTradeConnectionError
)


class TestConnectionDisabledErrorDetection:
    """Test suite for connection disabled error detection."""
    
    def test_is_connection_disabled_error_detects_code_3003(self):
        """Error code 3003 should be detected as connection disabled."""
        error_str = "(402) Reason: Payment Required HTTP response body: {'detail': 'Unable to sync with brokerage account because the connection is disabled.', 'status_code': 402, 'code': '3003'}"
        
        assert is_connection_disabled_error(error_str) is True
    
    def test_is_connection_disabled_error_detects_message(self):
        """Connection disabled message should be detected."""
        error_str = "Unable to sync with brokerage account because the connection is disabled."
        
        assert is_connection_disabled_error(error_str) is True
    
    def test_is_connection_disabled_error_case_insensitive(self):
        """Detection should be case-insensitive."""
        error_str = "UNABLE TO SYNC WITH BROKERAGE ACCOUNT BECAUSE THE CONNECTION IS DISABLED"
        
        assert is_connection_disabled_error(error_str) is True
    
    def test_is_connection_disabled_error_returns_false_for_other_errors(self):
        """Other errors should not be detected as connection disabled."""
        # Symbol not found error
        assert is_connection_disabled_error("Symbol FAKE not found") is False
        
        # Market closed error
        assert is_connection_disabled_error("Market is not open for trading") is False
        
        # Insufficient funds error
        assert is_connection_disabled_error("Insufficient buying power") is False
    
    def test_is_market_closed_error_detection(self):
        """Verify market closed errors are still correctly detected."""
        # These should be market closed
        assert is_market_closed_error("Market is not open for trading") is True
        assert is_market_closed_error("NON_TRADING_HOURS") is True
        assert is_market_closed_error("Code 1019") is True
        
        # These should NOT be market closed
        assert is_market_closed_error("Connection is disabled") is False
        assert is_market_closed_error("3003") is False


class TestSnapTradeConnectionError:
    """Test suite for SnapTradeConnectionError exception."""
    
    def test_exception_initialization(self):
        """Test exception can be created with message and account_id."""
        error = SnapTradeConnectionError(
            message="Connection expired",
            account_id="test-account-123"
        )
        
        assert error.message == "Connection expired"
        assert error.account_id == "test-account-123"
        assert str(error) == "Connection expired"
    
    def test_exception_without_account_id(self):
        """Test exception works without account_id."""
        error = SnapTradeConnectionError(message="Connection broken")
        
        assert error.message == "Connection broken"
        assert error.account_id is None


class TestSymbolLookupWithDisabledConnection:
    """Test that symbol lookup properly handles disabled connections."""
    
    @patch('supabase.create_client')
    def test_symbol_lookup_raises_connection_error_on_3003(self, mock_create_client):
        """Symbol lookup should raise SnapTradeConnectionError when connection is disabled."""
        # Setup mock for credentials
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock symbol_search_user_account to raise error with 3003 code
        def raise_connection_disabled(*args, **kwargs):
            raise Exception(
                "(402) Reason: Payment Required HTTP response body: "
                "{'detail': 'Unable to sync with brokerage account because the connection is disabled.', "
                "'status_code': 402, 'code': '3003'}"
            )
        
        service.client.reference_data.symbol_search_user_account = Mock(side_effect=raise_connection_disabled)
        
        # Should raise SnapTradeConnectionError
        with pytest.raises(SnapTradeConnectionError) as excinfo:
            service.get_universal_symbol_id_for_account('AGG', 'user-123', 'account-456')
        
        # Verify error message is user-friendly
        assert "reconnect" in excinfo.value.message.lower()
        assert excinfo.value.account_id == 'account-456'
    
    @patch('supabase.create_client')
    def test_symbol_lookup_returns_none_for_other_errors(self, mock_create_client):
        """Symbol lookup should return None for other API errors (not raise exception)."""
        # Setup mock for credentials
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock a generic API error (not connection disabled)
        def raise_generic_error(*args, **kwargs):
            raise Exception("Network timeout")
        
        service.client.reference_data.symbol_search_user_account = Mock(side_effect=raise_generic_error)
        
        # Should return None, not raise
        result = service.get_universal_symbol_id_for_account('AGG', 'user-123', 'account-456')
        
        assert result is None


class TestPlaceOrderWithDisabledConnection:
    """Test that place_order properly handles disabled connections."""
    
    @patch('supabase.create_client')
    def test_place_order_returns_connection_error(self, mock_create_client):
        """Place order should return user-friendly error when connection is disabled."""
        # Setup mock for credentials
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock symbol lookup to raise connection error
        def raise_connection_disabled(*args, **kwargs):
            raise Exception(
                "(402) Reason: Payment Required HTTP response body: "
                "{'detail': 'Unable to sync with brokerage account because the connection is disabled.', "
                "'status_code': 402, 'code': '3003'}"
            )
        
        service.client.reference_data.symbol_search_user_account = Mock(side_effect=raise_connection_disabled)
        
        result = service.place_order(
            user_id='platform-user-123',
            account_id='account-uuid-456',
            symbol='AGG',
            action='BUY',
            order_type='Market',
            time_in_force='Day',
            notional_value=5.0
        )
        
        assert result['success'] is False
        assert result.get('error_code') == 'CONNECTION_DISABLED'
        assert 'reconnect' in result['error'].lower()
    
    @patch('supabase.create_client')
    def test_place_order_still_returns_symbol_error_when_truly_not_available(self, mock_create_client):
        """Place order should return symbol error when symbol genuinely doesn't exist."""
        # Setup mock for credentials
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock symbol lookup to return empty (symbol not found, but connection is fine)
        mock_response = Mock()
        mock_response.body = []  # No symbols found
        service.client.reference_data.symbol_search_user_account = Mock(return_value=mock_response)
        
        result = service.place_order(
            user_id='platform-user-123',
            account_id='account-uuid-456',
            symbol='FAKESYMBOL',
            action='BUY',
            order_type='Market',
            time_in_force='Day',
            notional_value=5.0
        )
        
        assert result['success'] is False
        # Should be symbol error, NOT connection error
        assert result.get('error_code') is None or result.get('error_code') != 'CONNECTION_DISABLED'
        assert 'FAKESYMBOL' in result['error'] or 'not available' in result['error'].lower()


class TestCheckOrderImpactWithDisabledConnection:
    """Test that check_order_impact handles disabled connections."""
    
    @patch('supabase.create_client')
    def test_check_order_impact_returns_connection_error(self, mock_create_client):
        """check_order_impact should return user-friendly error when connection is disabled."""
        # Setup mock for credentials
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # Mock symbol lookup to raise connection error
        def raise_connection_disabled(*args, **kwargs):
            raise Exception(
                "(402) Reason: Payment Required HTTP response body: "
                "{'detail': 'Unable to sync with brokerage account because the connection is disabled.', "
                "'status_code': 402, 'code': '3003'}"
            )
        
        service.client.reference_data.symbol_search_user_account = Mock(side_effect=raise_connection_disabled)
        
        result = service.check_order_impact(
            user_id='platform-user-123',
            account_id='account-uuid-456',
            symbol='AGG',
            action='BUY',
            order_type='Market',
            time_in_force='Day',
            notional_value=5.0
        )
        
        assert result['success'] is False
        assert result.get('error_code') == 'CONNECTION_DISABLED'
        assert 'reconnect' in result['error'].lower()


class TestEdgeCases:
    """Test edge cases and boundary conditions."""
    
    def test_error_detection_with_empty_string(self):
        """Empty string should not be detected as connection disabled."""
        assert is_connection_disabled_error("") is False
    
    def test_error_detection_with_none_like_values(self):
        """Various non-string values should be handled gracefully."""
        # Note: The function expects a string, but should handle edge cases
        assert is_connection_disabled_error("None") is False
        assert is_connection_disabled_error("null") is False
    
    def test_error_detection_partial_match(self):
        """Partial matches should work (substring detection)."""
        # Code 3003 anywhere in the string
        assert is_connection_disabled_error("Error 3003 occurred") is True
        
        # "connection is disabled" phrase anywhere
        assert is_connection_disabled_error("The brokerage connection is disabled. Please retry.") is True


class TestMultiAccountScenario:
    """
    Test the specific scenario that caused this bug:
    User has Webull (healthy) + Coinbase (added later, causing Webull connection to break)
    """
    
    @patch('supabase.create_client')
    def test_multi_account_one_broken(self, mock_create_client):
        """
        When one account works and another has disabled connection,
        trading on the broken account should give clear error.
        """
        # Setup mock for credentials
        mock_supabase = Mock()
        mock_create_client.return_value = mock_supabase
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={
                'snaptrade_user_id': 'test-user-123',
                'snaptrade_user_secret': 'test-secret-456'
            }
        )
        
        service = SnapTradeTradingService()
        
        # For account A (Webull - working), return symbol normally
        webull_account_id = 'webull-account-123'
        
        # For account B (Coinbase - broken connection), raise 3003
        coinbase_account_id = 'coinbase-account-456'
        
        def mock_symbol_search(*args, **kwargs):
            account_id = kwargs.get('account_id')
            if account_id == coinbase_account_id:
                raise Exception(
                    "(402) Reason: Payment Required HTTP response body: "
                    "{'detail': 'Unable to sync with brokerage account because the connection is disabled.', "
                    "'status_code': 402, 'code': '3003'}"
                )
            else:
                # Working account - return symbol
                mock_response = Mock()
                mock_response.body = [{'id': 'symbol-uuid', 'symbol': 'AGG', 'exchange': {'code': 'NYSE'}}]
                return mock_response
        
        service.client.reference_data.symbol_search_user_account = Mock(side_effect=mock_symbol_search)
        
        # Try to trade on broken Coinbase account - should get CONNECTION_DISABLED error
        result_broken = service.place_order(
            user_id='platform-user-123',
            account_id=coinbase_account_id,
            symbol='AGG',
            action='BUY',
            order_type='Market',
            time_in_force='Day',
            notional_value=5.0
        )
        
        assert result_broken['success'] is False
        assert result_broken.get('error_code') == 'CONNECTION_DISABLED'
        assert 'reconnect' in result_broken['error'].lower()
        
        # Trade on working Webull account should proceed normally
        # (Would need to mock order impact and place order too for full test)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

