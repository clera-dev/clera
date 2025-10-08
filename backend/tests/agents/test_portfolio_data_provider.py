"""
Tests for the unified Portfolio Data Provider.

This service abstracts data fetching from multiple sources (Alpaca, Plaid)
and is critical for the AI agents to work correctly with all account types.
"""

import pytest
from decimal import Decimal
from clera_agents.services.portfolio_data_provider import (
    PortfolioDataProvider,
    UserPortfolioMode,
    PortfolioHolding
)


class TestUserPortfolioMode:
    """Test the UserPortfolioMode dataclass"""
    
    def test_brokerage_mode(self):
        """Test brokerage-only mode detection"""
        mode = UserPortfolioMode(
            has_alpaca=True,
            has_plaid=False,
            alpaca_account_id='test123',
            user_id='user1'
        )
        assert mode.mode == 'brokerage'
        assert mode.is_valid
    
    def test_aggregation_mode(self):
        """Test aggregation-only mode detection"""
        mode = UserPortfolioMode(
            has_alpaca=False,
            has_plaid=True,
            alpaca_account_id=None,
            user_id='user1'
        )
        assert mode.mode == 'aggregation'
        assert mode.is_valid
    
    def test_hybrid_mode(self):
        """Test hybrid mode detection"""
        mode = UserPortfolioMode(
            has_alpaca=True,
            has_plaid=True,
            alpaca_account_id='test123',
            user_id='user1'
        )
        assert mode.mode == 'hybrid'
        assert mode.is_valid
    
    def test_no_accounts_mode(self):
        """Test invalid mode (no accounts)"""
        mode = UserPortfolioMode(
            has_alpaca=False,
            has_plaid=False,
            alpaca_account_id=None,
            user_id='user1'
        )
        assert mode.mode == 'none'
        assert not mode.is_valid


class TestPortfolioHolding:
    """Test the PortfolioHolding dataclass"""
    
    def test_create_holding(self):
        """Test creating a portfolio holding"""
        holding = PortfolioHolding(
            symbol='AAPL',
            security_name='Apple Inc.',
            security_type='equity',
            quantity=Decimal('10'),
            market_value=Decimal('1500'),
            cost_basis=Decimal('1400'),
            unrealized_pl=Decimal('100'),
            unrealized_plpc=Decimal('0.0714'),  # 7.14%
            source='alpaca'
        )
        
        assert holding.symbol == 'AAPL'
        assert holding.quantity == Decimal('10')
        assert holding.source == 'alpaca'


class TestPortfolioDataProvider:
    """Test the PortfolioDataProvider service"""
    
    @pytest.fixture
    def plaid_user_id(self):
        """User ID for testing (Plaid-only user from system)"""
        return '1179bade-50f6-4f4f-ac10-6f6d613b744a'
    
    def test_get_user_mode_plaid_only(self, plaid_user_id):
        """Test getting mode for a Plaid-only user"""
        provider = PortfolioDataProvider(plaid_user_id)
        mode = provider.get_user_mode()
        
        assert mode.user_id == plaid_user_id
        assert mode.has_plaid
        assert not mode.has_alpaca
        assert mode.mode == 'aggregation'
        assert mode.is_valid
    
    def test_get_cash_balance_plaid_only(self, plaid_user_id):
        """Test getting cash balance for Plaid-only user (should be 0)"""
        provider = PortfolioDataProvider(plaid_user_id)
        cash = provider.get_cash_balance()
        
        # Plaid cash is included in holdings, so separate cash balance is 0
        assert cash == Decimal('0')
    
    def test_get_holdings_plaid_only(self, plaid_user_id):
        """Test getting holdings for a Plaid-only user"""
        provider = PortfolioDataProvider(plaid_user_id)
        holdings = provider.get_holdings()
        
        # Should have some holdings
        assert isinstance(holdings, list)
        assert len(holdings) > 0
        
        # All holdings should be from Plaid
        for holding in holdings:
            assert isinstance(holding, PortfolioHolding)
            assert holding.source == 'plaid'
            # Should not be cash
            assert holding.security_type != 'cash'
            assert holding.symbol != 'U S Dollar'
    
    def test_get_holdings_structure(self, plaid_user_id):
        """Test that holdings have all required fields"""
        provider = PortfolioDataProvider(plaid_user_id)
        holdings = provider.get_holdings()
        
        assert len(holdings) > 0
        
        for holding in holdings:
            # Check all required fields exist
            assert holding.symbol
            assert holding.security_name
            assert holding.security_type
            assert isinstance(holding.quantity, Decimal)
            assert isinstance(holding.market_value, Decimal)
            assert isinstance(holding.cost_basis, Decimal)
            assert isinstance(holding.unrealized_pl, Decimal)
            assert isinstance(holding.unrealized_plpc, Decimal)
            assert holding.source in ['alpaca', 'plaid']
    
    def test_get_plaid_activities(self, plaid_user_id):
        """Test getting Plaid investment transactions"""
        provider = PortfolioDataProvider(plaid_user_id)
        activities = provider.get_account_activities_plaid(months_back=12)
        
        # Should return a list (may be empty if no transactions)
        assert isinstance(activities, list)
        
        # If there are activities, check structure
        if activities:
            for act in activities:
                assert 'date' in act
                assert 'type' in act
                assert 'source' in act
                assert act['source'] == 'plaid'
    
    def test_invalid_user_raises_error(self):
        """Test that invalid user ID raises appropriate error"""
        provider = PortfolioDataProvider('invalid-user-id-12345')
        
        with pytest.raises(ValueError) as exc_info:
            provider.get_user_mode()
        
        # Should mention invalid user ID format
        assert 'invalid' in str(exc_info.value).lower()
        assert 'user' in str(exc_info.value).lower()
    
    def test_provider_caches_mode(self, plaid_user_id):
        """Test that provider caches the user mode"""
        provider = PortfolioDataProvider(plaid_user_id)
        
        # First call - fetches from DB
        mode1 = provider.get_user_mode()
        
        # Second call - should use cached value
        mode2 = provider.get_user_mode()
        
        # Should be the same object (cached)
        assert mode1 is mode2


class TestPortfolioDataProviderEdgeCases:
    """Test edge cases and error handling"""
    
    @pytest.fixture
    def plaid_user_id(self):
        return '1179bade-50f6-4f4f-ac10-6f6d613b744a'
    
    def test_holdings_with_unreliable_cost_basis(self, plaid_user_id):
        """Test handling of Plaid holdings with unreliable cost basis (sentinel value)"""
        provider = PortfolioDataProvider(plaid_user_id)
        holdings = provider.get_holdings()
        
        # Look for holdings with unreliable returns (should be converted from -999999)
        for holding in holdings:
            # unrealized_plpc should never be the raw sentinel value
            assert holding.unrealized_plpc != Decimal('-999999')
            # It should be 0 if the original was the sentinel
            if holding.market_value > 100 and holding.cost_basis < 50:
                # This likely had unreliable data
                assert holding.unrealized_plpc == Decimal('0')
    
    def test_empty_plaid_transactions_handled(self, plaid_user_id):
        """Test that provider handles case where no Plaid transactions exist"""
        provider = PortfolioDataProvider(plaid_user_id)
        
        # Query for very short time period (should be empty)
        activities = provider.get_account_activities_plaid(months_back=0)
        
        # Should return empty list, not error
        assert isinstance(activities, list)
        assert len(activities) == 0


if __name__ == '__main__':
    # Run tests with verbose output
    pytest.main([__file__, '-v', '-s'])

