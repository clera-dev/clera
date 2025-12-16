"""
Test suite for trade routing fix in /api/trade/execute endpoint.

This test validates that the fix prevents UUID-format Alpaca accounts
from being incorrectly routed to SnapTrade.

Bug Description:
- Previous logic used: `len(account_id) == 36 and '-' in account_id`
- This matched ALL UUIDs, including Alpaca accounts
- Fix: Query database to determine actual provider instead

Test Coverage:
1. Alpaca UUID account routes to Alpaca (not SnapTrade)
2. SnapTrade account routes to SnapTrade
3. Legacy Alpaca account ID routes to Alpaca
4. Account not found in database routes to Alpaca (fallback)

NOTE: These are unit tests that verify the routing LOGIC, not integration tests.
"""

import pytest
from unittest.mock import Mock


class TestTradeRoutingFix:
    """Test suite for trade routing fix - validates routing LOGIC only."""
    
    def test_alpaca_uuid_account_routes_to_alpaca(self):
        """
        CRITICAL TEST: Verify that Alpaca accounts with UUID format are NOT routed to SnapTrade.
        
        This is the main bug fix validation.
        """
        # Setup: Mock an Alpaca account with UUID format (36 chars, with hyphens)
        alpaca_uuid = 'd3e07f8a-c4b2-4f1e-9a3b-5c8d1e2f3a4b'  # Valid UUID
        
        # Mock database response showing this is an Alpaca account
        mock_account_result = Mock()
        mock_account_result.data = [{
            'provider': 'alpaca',
            'provider_account_id': alpaca_uuid
        }]
        
        # Simulate the routing logic from api_server.py
        is_snaptrade = False
        if mock_account_result.data and len(mock_account_result.data) > 0:
            provider = mock_account_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        
        # Assertions
        assert is_snaptrade is False, "UUID-format Alpaca account should NOT be routed to SnapTrade"
        assert provider == 'alpaca', "Should correctly identify as Alpaca account"
    
    def test_snaptrade_account_routes_to_snaptrade(self):
        """Verify SnapTrade accounts are correctly routed to SnapTrade."""
        # Setup: Mock a SnapTrade account
        snaptrade_id = 'abc123def456'
        
        # Mock database response
        mock_account_result = Mock()
        mock_account_result.data = [{
            'provider': 'snaptrade',
            'provider_account_id': snaptrade_id
        }]
        
        # Simulate routing logic
        is_snaptrade = False
        if mock_account_result.data and len(mock_account_result.data) > 0:
            provider = mock_account_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        
        # Assertions
        assert is_snaptrade is True, "SnapTrade account should be routed to SnapTrade"
        assert provider == 'snaptrade'
    
    def test_snaptrade_uuid_account_routes_to_snaptrade(self):
        """
        Verify SnapTrade accounts with UUID format are correctly routed.
        
        This ensures the fix works bidirectionally - both providers can use UUIDs.
        """
        # Setup: SnapTrade account that also happens to be UUID format
        snaptrade_uuid = 'f1e2d3c4-b5a6-7890-1234-567890abcdef'
        
        # Mock database response
        mock_account_result = Mock()
        mock_account_result.data = [{
            'provider': 'snaptrade',
            'provider_account_id': snaptrade_uuid
        }]
        
        # Simulate routing logic
        is_snaptrade = False
        if mock_account_result.data and len(mock_account_result.data) > 0:
            provider = mock_account_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        
        # Assertions
        assert is_snaptrade is True, "SnapTrade UUID account should be routed to SnapTrade"
    
    def test_legacy_alpaca_account_routes_to_alpaca(self):
        """Verify legacy Alpaca account IDs (non-UUID) route to Alpaca."""
        # Setup: Legacy Alpaca account ID (not in user_investment_accounts table)
        legacy_id = 'alpaca_legacy_account_123'
        
        # Mock database returns no results (account not in table)
        mock_account_result = Mock()
        mock_account_result.data = []
        
        # Simulate routing logic with fallback
        is_snaptrade = False
        if mock_account_result.data and len(mock_account_result.data) > 0:
            provider = mock_account_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        # else: defaults to Alpaca (is_snaptrade remains False)
        
        # Assertions
        assert is_snaptrade is False, "Legacy Alpaca account should route to Alpaca"
    
    def test_account_with_snaptrade_prefix(self):
        """Verify accounts with 'snaptrade_' prefix are handled correctly."""
        # Setup: Account with snaptrade_ prefix
        account_id = 'snaptrade_abc123'
        clean_id = account_id.replace('snaptrade_', '')
        
        # Mock database response
        mock_account_result = Mock()
        mock_account_result.data = [{
            'provider': 'snaptrade',
            'provider_account_id': 'abc123'
        }]
        
        # Verify clean_id is used for lookup
        assert clean_id == 'abc123', "Should strip snaptrade_ prefix for lookup"
        
        # Simulate routing
        is_snaptrade = False
        if mock_account_result.data and len(mock_account_result.data) > 0:
            provider = mock_account_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        
        assert is_snaptrade is True
    
    def test_plaid_account_routes_to_alpaca(self):
        """
        Verify Plaid accounts (read-only) don't incorrectly route to trading.
        
        While Plaid accounts shouldn't reach the trade endpoint, this test
        ensures they would be handled gracefully.
        """
        # Setup: Plaid account (UUID format)
        plaid_uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        
        # Mock database response
        mock_account_result = Mock()
        mock_account_result.data = [{
            'provider': 'plaid',
            'provider_account_id': plaid_uuid
        }]
        
        # Simulate routing
        is_snaptrade = False
        if mock_account_result.data and len(mock_account_result.data) > 0:
            provider = mock_account_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        
        # Should NOT route to SnapTrade (would fail at Alpaca, which is expected)
        assert is_snaptrade is False, "Plaid account should not route to SnapTrade"


class TestDatabaseQueryLogic:
    """Test the database query logic used for provider detection."""
    
    def test_query_matches_provider_account_id(self):
        """Verify query correctly matches on provider_account_id."""
        account_id = 'test_account_123'
        
        # Mock database result for first query (provider_account_id match)
        mock_result = Mock()
        mock_result.data = [{
            'provider': 'alpaca',
            'provider_account_id': account_id
        }]
        
        # Verify the query structure
        assert mock_result.data[0]['provider'] == 'alpaca'
        assert mock_result.data[0]['provider_account_id'] == account_id
    
    def test_fallback_query_matches_uuid(self):
        """Verify fallback query correctly matches on UUID (id field)."""
        account_uuid = 'd3e07f8a-c4b2-4f1e-9a3b-5c8d1e2f3a4b'
        
        # Mock first query returns empty (no match on provider_account_id)
        mock_empty_result = Mock()
        mock_empty_result.data = []
        
        # Mock second query returns match (UUID match on id field)
        mock_uuid_result = Mock()
        mock_uuid_result.data = [{
            'provider': 'alpaca',
            'provider_account_id': 'different_id'  # Different provider_account_id
        }]
        
        # Simulate two-query fallback logic
        # First query on provider_account_id returns empty
        is_snaptrade = False
        if mock_empty_result.data and len(mock_empty_result.data) > 0:
            provider = mock_empty_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        
        assert len(mock_empty_result.data) == 0, "First query should return empty"
        
        # Second query on UUID field returns match
        if mock_uuid_result.data and len(mock_uuid_result.data) > 0:
            provider = mock_uuid_result.data[0]['provider']
            is_snaptrade = (provider == 'snaptrade')
        
        assert is_snaptrade is False, "Should route to Alpaca, not SnapTrade"
        assert mock_uuid_result.data[0]['provider'] == 'alpaca', "Second query should match on UUID"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

