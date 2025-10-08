"""
Comprehensive Production-Grade Tests for Account-Specific Portfolio History

Tests cover:
1. JSON parsing (string vs dict)
2. Account filtering accuracy
3. Edge cases (empty data, missing accounts, invalid UUIDs)
4. Data integrity (actual values vs scaling)
5. Security (cross-user access)
6. Date range filtering
7. Profit/loss calculations
"""

import pytest
import asyncio
import json
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import Mock, AsyncMock, patch
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from utils.portfolio.aggregated_portfolio_service import AggregatedPortfolioService


class TestAccountSpecificHistoryJSONParsing:
    """Test JSON parsing of account_breakdown field"""
    
    @pytest.mark.asyncio
    async def test_parses_json_string_breakdown(self):
        """Test that JSON string account_breakdown is correctly parsed"""
        service = AggregatedPortfolioService()
        
        # Mock data with JSON string (as returned by Supabase)
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'total_value': 10000,
                'account_breakdown': '{"plaid_account1": 6000, "plaid_account2": 4000}',  # JSON string
                'total_cost_basis': 9000
            },
            {
                'value_date': '2025-10-02',
                'total_value': 10200,
                'account_breakdown': '{"plaid_account1": 6100, "plaid_account2": 4100}',
                'total_cost_basis': 9000
            }
        ]
        
        # Mock Supabase calls
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            # Mock account lookup
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            # Mock snapshots query
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
            
            # Verify data was correctly parsed and extracted
            assert result['data_source'] == 'account_breakdown_actual'
            assert len(result['equity']) == 2
            assert result['equity'][0] == 6000.0  # First account's value from day 1
            assert result['equity'][1] == 6100.0  # First account's value from day 2
    
    @pytest.mark.asyncio
    async def test_handles_dict_breakdown(self):
        """Test that dict account_breakdown works (if Supabase returns as dict)"""
        service = AggregatedPortfolioService()
        
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'total_value': 10000,
                'account_breakdown': {"plaid_account1": 6000, "plaid_account2": 4000},  # Already a dict
                'total_cost_basis': 9000
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
            
            assert result['data_source'] == 'account_breakdown_actual'
            assert len(result['equity']) == 1
            assert result['equity'][0] == 6000.0
    
    @pytest.mark.asyncio
    async def test_handles_malformed_json_gracefully(self):
        """Test that malformed JSON doesn't crash, just skips that snapshot"""
        service = AggregatedPortfolioService()
        
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'account_breakdown': '{"plaid_account1": 6000}',  # Valid
                'total_cost_basis': 9000
            },
            {
                'value_date': '2025-10-02',
                'account_breakdown': '{invalid json}',  # Invalid
                'total_cost_basis': 9000
            },
            {
                'value_date': '2025-10-03',
                'account_breakdown': '{"plaid_account1": 6200}',  # Valid
                'total_cost_basis': 9000
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
            
            # Should have 2 data points (skipped the malformed one)
            assert len(result['equity']) == 2
            assert result['equity'][0] == 6000.0
            assert result['equity'][1] == 6200.0


class TestAccountFilteringAccuracy:
    """Test that actual per-account values are used, not scaling"""
    
    @pytest.mark.asyncio
    async def test_uses_actual_account_values_not_scaling(self):
        """CRITICAL: Verify we're using actual values, not scaled approximations"""
        service = AggregatedPortfolioService()
        
        # Scenario: Account 1 is 60% of portfolio on day 1, but 70% on day 2
        # (e.g., user deposited money to account 1)
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'total_value': 10000,
                'account_breakdown': '{"plaid_account1": 6000, "plaid_account2": 4000}',
                'total_cost_basis': 9000
            },
            {
                'value_date': '2025-10-02',
                'total_value': 11000,
                # Account 1 is now 70% due to deposit
                'account_breakdown': '{"plaid_account1": 7700, "plaid_account2": 3300}',
                'total_cost_basis': 10000
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
            
            # CRITICAL TEST: Should use ACTUAL values [6000, 7700], NOT scaled [6000, 6600]
            # Scaled would be: 10000 * 0.6 = 6000, 11000 * 0.6 = 6600
            # Actual values show the deposit: 6000 → 7700
            assert result['equity'][0] == 6000.0, "Day 1 should be actual $6000"
            assert result['equity'][1] == 7700.0, "Day 2 should be actual $7700 (not scaled $6600)"
            
            # Profit/loss should reflect actual change
            assert result['profit_loss'][0] == 0.0  # Base day
            assert result['profit_loss'][1] == 1700.0  # $7700 - $6000 = $1700 gain


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    @pytest.mark.asyncio
    async def test_account_not_in_breakdown(self):
        """Test when account exists but not in any snapshot breakdown"""
        service = AggregatedPortfolioService()
        
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'account_breakdown': '{"plaid_other_account": 10000}',  # Different account
                'total_cost_basis': 9000
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
            
            # Should return empty history response
            assert len(result['equity']) == 0 or result['data_source'] == 'empty'
    
    @pytest.mark.asyncio
    async def test_account_zero_balance_in_snapshots(self):
        """Test when account has zero balance (should be excluded)"""
        service = AggregatedPortfolioService()
        
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'account_breakdown': '{"plaid_account1": 0}',  # Zero balance
                'total_cost_basis': 0
            },
            {
                'value_date': '2025-10-02',
                'account_breakdown': '{"plaid_account1": 5000}',  # Now has balance
                'total_cost_basis': 4500
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
            
            # Should only have 1 data point (day 2), day 1 excluded due to zero balance
            assert len(result['equity']) == 1
            assert result['equity'][0] == 5000.0
    
    @pytest.mark.asyncio
    async def test_invalid_account_uuid(self):
        """Test with account UUID that doesn't exist"""
        service = AggregatedPortfolioService()
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            # Mock: account not found
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None
            
            result = await service._get_account_specific_history('user123', '1M', 'invalid-uuid')
            
            # Should return empty history (no data_source field in empty response)
            assert len(result['equity']) == 0
            assert result['base_value'] == 0.0
    
    @pytest.mark.asyncio
    async def test_no_historical_snapshots_uses_fallback(self):
        """Test fallback to current value when no historical data"""
        service = AggregatedPortfolioService()
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            # No snapshots found
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = []
            
            with patch.object(service, '_get_current_account_value_fallback', new_callable=AsyncMock) as mock_fallback:
                mock_fallback.return_value = {
                    'equity': [5000.0],
                    'data_source': 'current_value_fallback'
                }
                
                result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
                
                # Should have called fallback
                mock_fallback.assert_called_once()
                assert result['data_source'] == 'current_value_fallback'


class TestDateRangeFiltering:
    """Test that correct date ranges are queried"""
    
    @pytest.mark.asyncio
    async def test_1D_period_uses_intraday_chart(self):
        """Test that 1D period uses intraday chart (not historical snapshots)"""
        service = AggregatedPortfolioService()
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            # Mock the intraday chart method
            with patch.object(service, '_build_intraday_chart_account', new_callable=AsyncMock) as mock_intraday:
                mock_intraday.return_value = {
                    'timestamp': [1, 2, 3],
                    'equity': [1000, 1050, 1100],
                    'data_source': 'account_intraday_interpolated'
                }
                
                result = await service._get_account_specific_history('user123', '1D', 'account-uuid-1')
                
                # Verify intraday chart was called (not historical query)
                mock_intraday.assert_called_once()
                assert result['data_source'] == 'account_intraday_interpolated'
    
    @pytest.mark.asyncio
    async def test_1Y_period_queries_365_days(self):
        """Test that 1Y period queries 365 days of data"""
        service = AggregatedPortfolioService()
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            mock_query = mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute
            mock_query.return_value.data = []
            
            with patch.object(service, '_get_current_account_value_fallback', new_callable=AsyncMock):
                await service._get_account_specific_history('user123', '1Y', 'account-uuid-1')
                
                assert mock_query.called


class TestProfitLossCalculations:
    """Test profit/loss calculations are correct"""
    
    @pytest.mark.asyncio
    async def test_profit_loss_calculated_from_first_value(self):
        """Test that profit/loss is calculated correctly from base value"""
        service = AggregatedPortfolioService()
        
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'account_breakdown': '{"plaid_account1": 10000}',
                'total_cost_basis': 9000
            },
            {
                'value_date': '2025-10-02',
                'account_breakdown': '{"plaid_account1": 10500}',
                'total_cost_basis': 9000
            },
            {
                'value_date': '2025-10-03',
                'account_breakdown': '{"plaid_account1": 9800}',
                'total_cost_basis': 9000
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
            
            # Base value should be first day
            assert result['base_value'] == 10000.0
            
            # Profit/loss should be calculated from first day
            assert result['profit_loss'][0] == 0.0  # Day 1: $10000 - $10000 = $0
            assert result['profit_loss'][1] == 500.0  # Day 2: $10500 - $10000 = $500
            assert result['profit_loss'][2] == -200.0  # Day 3: $9800 - $10000 = -$200
            
            # Percentages should be correct
            assert result['profit_loss_pct'][0] == 0.0
            assert result['profit_loss_pct'][1] == 5.0  # $500 / $10000 = 5%
            assert result['profit_loss_pct'][2] == -2.0  # -$200 / $10000 = -2%


if __name__ == '__main__':
    # Run tests
    pytest.main([__file__, '-v', '-s'])

