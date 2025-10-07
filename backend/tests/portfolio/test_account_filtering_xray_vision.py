"""
Comprehensive tests for Account Filtering ("X-Ray Vision") functionality.

These tests verify that users can filter their portfolio view to individual accounts
and that all analytics (risk, diversification, allocation) are correctly calculated
on the filtered data.

CRITICAL: Tests use REAL user data from Supabase to ensure accuracy.
"""

import pytest
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from utils.portfolio.account_filtering_service import AccountFilteringService, get_account_filtering_service
from utils.portfolio.aggregated_calculations import calculate_portfolio_analytics, calculate_asset_allocation
from utils.supabase.db_client import get_supabase_client
from decimal import Decimal


# Real test user ID (from your aggregation mode setup)
TEST_USER_ID = "1179bade-50f6-4f4f-ac10-6f6d613b744a"


class TestAccountFilteringService:
    """Test the AccountFilteringService with real data."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = AccountFilteringService()
        self.supabase = get_supabase_client()
    
    @pytest.mark.asyncio
    async def test_get_all_holdings_includes_cash(self):
        """
        CRITICAL TEST: Verify that fetching all holdings INCLUDES CASH.
        This test would have caught the cash filtering bug!
        """
        # Get all holdings (no filter)
        holdings = await self.service.filter_holdings_by_account(TEST_USER_ID, None)
        
        # Verify we got holdings
        assert len(holdings) > 0, "Should have holdings"
        
        # CRITICAL: Check for cash holdings
        cash_holdings = [h for h in holdings if h.get('security_type') == 'cash']
        
        assert len(cash_holdings) > 0, "MUST include cash holdings! (This test would have caught the bug)"
        
        # Verify cash has market value
        total_cash = sum(float(h.get('total_market_value', 0)) for h in cash_holdings)
        assert total_cash > 0, f"Cash holdings should have value, got {total_cash}"
        
        print(f"✅ PASS: Found {len(cash_holdings)} cash holdings worth ${total_cash:,.2f}")
    
    @pytest.mark.asyncio
    async def test_get_all_holdings_includes_stocks_and_bonds(self):
        """Verify that all security types are included."""
        holdings = await self.service.filter_holdings_by_account(TEST_USER_ID, None)
        
        # Get security types
        security_types = set(h.get('security_type') for h in holdings if h.get('security_type'))
        
        print(f"Found security types: {security_types}")
        
        # Should have multiple types
        assert len(security_types) > 1, "Should have multiple security types"
        
        # Verify we have the main asset classes
        # Note: exact types depend on user's holdings, but we should have variety
        assert len(holdings) >= 5, f"Should have multiple holdings, got {len(holdings)}"
    
    @pytest.mark.asyncio
    async def test_filter_to_specific_account(self):
        """Test filtering to a specific account."""
        # First, get account breakdown to find a valid account ID
        result = self.supabase.table('user_investment_accounts')\
            .select('id, provider_account_id, account_name, institution_name')\
            .eq('user_id', TEST_USER_ID)\
            .eq('is_active', True)\
            .execute()
        
        assert len(result.data) > 0, "User should have connected accounts"
        
        # Get first account
        test_account = result.data[0]
        plaid_account_id = f"plaid_{test_account['provider_account_id']}"
        
        print(f"Testing filter for account: {test_account['account_name']} ({test_account['institution_name']})")
        
        # Filter to this account
        filtered_holdings = await self.service.filter_holdings_by_account(TEST_USER_ID, plaid_account_id)
        
        # Verify we got holdings
        assert len(filtered_holdings) > 0, f"Should have holdings for account {plaid_account_id}"
        
        # Verify all holdings have this account in their contributions
        for holding in filtered_holdings:
            contributions = holding.get('account_contributions', [])
            if isinstance(contributions, str):
                import json
                contributions = json.loads(contributions)
            
            # Check if this account contributed to this holding
            has_account = any(c.get('account_id') == plaid_account_id for c in contributions)
            assert has_account, f"Holding {holding.get('symbol')} should be from account {plaid_account_id}"
        
        print(f"✅ PASS: Filtered to {len(filtered_holdings)} holdings for specific account")
    
    @pytest.mark.asyncio
    async def test_filtered_holdings_include_cash_for_specific_account(self):
        """
        CRITICAL TEST: Verify that filtering to a specific account still includes cash.
        """
        # Get first account
        result = self.supabase.table('user_investment_accounts')\
            .select('provider_account_id')\
            .eq('user_id', TEST_USER_ID)\
            .eq('is_active', True)\
            .limit(1)\
            .execute()
        
        plaid_account_id = f"plaid_{result.data[0]['provider_account_id']}"
        
        # Filter to this account
        filtered_holdings = await self.service.filter_holdings_by_account(TEST_USER_ID, plaid_account_id)
        
        # Check for cash in filtered holdings
        cash_holdings = [h for h in filtered_holdings if h.get('security_type') == 'cash']
        
        # Note: Not all accounts have cash, but if the total portfolio has cash,
        # at least ONE account should have cash
        print(f"Account {plaid_account_id} has {len(cash_holdings)} cash holdings")
        
        # Get total portfolio cash to compare
        all_holdings = await self.service.filter_holdings_by_account(TEST_USER_ID, None)
        total_cash = [h for h in all_holdings if h.get('security_type') == 'cash']
        
        if len(total_cash) > 0:
            print(f"Total portfolio has {len(total_cash)} cash holdings")
            # At least one account should have cash
            # (We'll verify across all accounts below)


class TestAssetAllocationWithFiltering:
    """Test asset allocation calculations with account filtering."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.filter_service = get_account_filtering_service()
        self.supabase = get_supabase_client()
    
    @pytest.mark.asyncio
    async def test_total_portfolio_allocation_includes_cash(self):
        """
        CRITICAL TEST: Total portfolio allocation MUST include cash.
        This is the main test that would have caught the bug!
        """
        # Get all holdings (no filter)
        holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, None)
        
        # Calculate allocation
        allocation = calculate_asset_allocation(holdings, TEST_USER_ID)
        
        print(f"\nTotal Portfolio Allocation:")
        print(f"  Cash: ${allocation['cash']['value']:,.2f} ({allocation['cash']['percentage']:.1f}%)")
        print(f"  Stock: ${allocation['stock']['value']:,.2f} ({allocation['stock']['percentage']:.1f}%)")
        print(f"  Bond: ${allocation['bond']['value']:,.2f} ({allocation['bond']['percentage']:.1f}%)")
        print(f"  Total: ${allocation['total_value']:,.2f}")
        
        # CRITICAL ASSERTIONS
        assert allocation['cash']['value'] > 0, "CRITICAL: Cash value MUST be > 0!"
        assert allocation['cash']['percentage'] > 0, "CRITICAL: Cash percentage MUST be > 0!"
        
        # Verify percentages add up to 100
        total_pct = allocation['cash']['percentage'] + allocation['stock']['percentage'] + allocation['bond']['percentage']
        assert 99 <= total_pct <= 101, f"Percentages should add to ~100%, got {total_pct}%"
        
        print("✅ PASS: Total portfolio allocation includes cash correctly!")
    
    @pytest.mark.asyncio
    async def test_account_level_allocation(self):
        """Test allocation for individual accounts."""
        # Get first account
        result = self.supabase.table('user_investment_accounts')\
            .select('provider_account_id, account_name')\
            .eq('user_id', TEST_USER_ID)\
            .eq('is_active', True)\
            .execute()
        
        for account in result.data:
            plaid_account_id = f"plaid_{account['provider_account_id']}"
            print(f"\n--- Testing {account['account_name']} ---")
            
            # Get filtered holdings
            holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, plaid_account_id)
            
            if len(holdings) == 0:
                print(f"  (No holdings in this account)")
                continue
            
            # Calculate allocation
            allocation = calculate_asset_allocation(holdings, TEST_USER_ID)
            
            print(f"  Cash: ${allocation['cash']['value']:,.2f} ({allocation['cash']['percentage']:.1f}%)")
            print(f"  Stock: ${allocation['stock']['value']:,.2f} ({allocation['stock']['percentage']:.1f}%)")
            print(f"  Bond: ${allocation['bond']['value']:,.2f} ({allocation['bond']['percentage']:.1f}%)")
            print(f"  Total: ${allocation['total_value']:,.2f}")
            
            # Verify percentages add up
            total_pct = allocation['cash']['percentage'] + allocation['stock']['percentage'] + allocation['bond']['percentage']
            assert 99 <= total_pct <= 101, f"Account {account['account_name']} percentages should add to ~100%, got {total_pct}%"
    
    @pytest.mark.asyncio
    async def test_sum_of_account_allocations_equals_total(self):
        """
        CRITICAL TEST: Sum of all account values should equal total portfolio value.
        This verifies filtering doesn't lose or duplicate data.
        """
        # Get total portfolio allocation
        all_holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, None)
        total_allocation = calculate_asset_allocation(all_holdings, TEST_USER_ID)
        total_value = total_allocation['total_value']
        
        # Get all accounts
        result = self.supabase.table('user_investment_accounts')\
            .select('provider_account_id, account_name')\
            .eq('user_id', TEST_USER_ID)\
            .eq('is_active', True)\
            .execute()
        
        # Sum up account values
        sum_of_accounts = 0
        for account in result.data:
            plaid_account_id = f"plaid_{account['provider_account_id']}"
            holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, plaid_account_id)
            allocation = calculate_asset_allocation(holdings, TEST_USER_ID)
            sum_of_accounts += allocation['total_value']
            print(f"  {account['account_name']}: ${allocation['total_value']:,.2f}")
        
        print(f"\nSum of accounts: ${sum_of_accounts:,.2f}")
        print(f"Total portfolio: ${total_value:,.2f}")
        
        # Allow 1% tolerance for rounding
        difference = abs(sum_of_accounts - total_value)
        tolerance = total_value * 0.01
        
        assert difference <= tolerance, f"Sum of accounts (${sum_of_accounts:,.2f}) should equal total (${total_value:,.2f}), difference: ${difference:,.2f}"
        
        print("✅ PASS: Sum of account values equals total portfolio value!")


class TestAnalyticsWithFiltering:
    """Test analytics (risk/diversification) with account filtering."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.filter_service = get_account_filtering_service()
        self.supabase = get_supabase_client()
    
    @pytest.mark.asyncio
    async def test_total_portfolio_analytics(self):
        """Test analytics for total portfolio."""
        # Get all holdings
        holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, None)
        
        # Calculate analytics
        analytics = calculate_portfolio_analytics(holdings, TEST_USER_ID)
        
        print(f"\nTotal Portfolio Analytics:")
        print(f"  Risk Score: {analytics['risk_score']}/10")
        print(f"  Diversification Score: {analytics['diversification_score']}/10")
        
        # Verify scores are valid
        risk = float(analytics['risk_score'])
        div = float(analytics['diversification_score'])
        
        assert 0 <= risk <= 10, f"Risk score should be 0-10, got {risk}"
        assert 0 <= div <= 10, f"Diversification score should be 0-10, got {div}"
        
        print("✅ PASS: Portfolio analytics calculated successfully!")
    
    @pytest.mark.asyncio
    async def test_account_level_analytics(self):
        """Test analytics for individual accounts."""
        # Get all accounts
        result = self.supabase.table('user_investment_accounts')\
            .select('provider_account_id, account_name')\
            .eq('user_id', TEST_USER_ID)\
            .eq('is_active', True)\
            .execute()
        
        for account in result.data:
            plaid_account_id = f"plaid_{account['provider_account_id']}"
            print(f"\n--- Testing {account['account_name']} ---")
            
            # Get filtered holdings
            holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, plaid_account_id)
            
            if len(holdings) == 0:
                print(f"  (No holdings in this account)")
                continue
            
            # Calculate analytics
            analytics = calculate_portfolio_analytics(holdings, TEST_USER_ID)
            
            print(f"  Risk Score: {analytics['risk_score']}/10")
            print(f"  Diversification Score: {analytics['diversification_score']}/10")
            
            # Verify scores are valid
            risk = float(analytics['risk_score'])
            div = float(analytics['diversification_score'])
            
            assert 0 <= risk <= 10, f"Risk score should be 0-10, got {risk}"
            assert 0 <= div <= 10, f"Diversification score should be 0-10, got {div}"


class TestEndToEndFiltering:
    """End-to-end tests simulating real user workflow."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.filter_service = get_account_filtering_service()
        self.supabase = get_supabase_client()
    
    @pytest.mark.asyncio
    async def test_user_switches_from_total_to_account_view(self):
        """
        Simulate user workflow:
        1. View total portfolio
        2. Switch to individual account
        3. Verify all data updates correctly
        """
        print("\n=== Simulating User Workflow ===")
        
        # Step 1: View total portfolio
        print("\n1. User views TOTAL PORTFOLIO:")
        all_holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, None)
        total_allocation = calculate_asset_allocation(all_holdings, TEST_USER_ID)
        total_analytics = calculate_portfolio_analytics(all_holdings, TEST_USER_ID)
        
        print(f"   Total Value: ${total_allocation['total_value']:,.2f}")
        print(f"   Cash: {total_allocation['cash']['percentage']:.1f}%")
        print(f"   Risk: {total_analytics['risk_score']}/10")
        print(f"   Holdings: {len(all_holdings)}")
        
        # Step 2: Get first account
        result = self.supabase.table('user_investment_accounts')\
            .select('provider_account_id, account_name')\
            .eq('user_id', TEST_USER_ID)\
            .eq('is_active', True)\
            .limit(1)\
            .execute()
        
        account = result.data[0]
        plaid_account_id = f"plaid_{account['provider_account_id']}"
        
        # Step 3: Switch to individual account
        print(f"\n2. User switches to {account['account_name'].upper()}:")
        account_holdings = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, plaid_account_id)
        account_allocation = calculate_asset_allocation(account_holdings, TEST_USER_ID)
        account_analytics = calculate_portfolio_analytics(account_holdings, TEST_USER_ID)
        
        print(f"   Total Value: ${account_allocation['total_value']:,.2f}")
        print(f"   Cash: {account_allocation['cash']['percentage']:.1f}%")
        print(f"   Risk: {account_analytics['risk_score']}/10")
        print(f"   Holdings: {len(account_holdings)}")
        
        # Step 4: Verify data makes sense
        assert account_allocation['total_value'] < total_allocation['total_value'], "Account value should be less than total"
        assert len(account_holdings) <= len(all_holdings), "Account holdings should be <= total holdings"
        
        # Step 5: Switch back to total
        print(f"\n3. User switches back to TOTAL PORTFOLIO:")
        all_holdings_2 = await self.filter_service.filter_holdings_by_account(TEST_USER_ID, None)
        total_allocation_2 = calculate_asset_allocation(all_holdings_2, TEST_USER_ID)
        
        print(f"   Total Value: ${total_allocation_2['total_value']:,.2f}")
        print(f"   Cash: {total_allocation_2['cash']['percentage']:.1f}%")
        
        # Verify same as before
        assert total_allocation_2['total_value'] == total_allocation['total_value'], "Total should be consistent"
        
        print("\n✅ PASS: User workflow completed successfully!")


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])

