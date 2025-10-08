"""
PRODUCTION-GRADE TESTS FOR ACCOUNT CHART FIXES

Tests for critical bug fixes:
1. 1D Intraday Chart for Individual Accounts (_build_intraday_chart_account)
2. Oscillation Prevention (filtering out $0 securities days)

Edge Cases Covered:
- Account with only cash (should not appear in history)
- Account created today (no historical data)
- Weekend/after-hours 1D chart generation
- Multiple accounts with different start dates
- Gaps in historical data
- Account with zero securities but current cash
"""

import pytest
import asyncio
import json
from datetime import datetime, timedelta, time
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
import os
import pytz

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from utils.portfolio.aggregated_portfolio_service import AggregatedPortfolioService


class TestIntradayChartForAccounts:
    """Test 1D intraday chart generation for individual accounts"""
    
    @pytest.mark.asyncio
    async def test_1d_period_calls_intraday_chart_for_account(self):
        """CRITICAL: Verify 1D period uses intraday chart, not historical snapshots"""
        service = AggregatedPortfolioService()
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            # Mock account lookup
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            # Mock _build_intraday_chart_account method
            with patch.object(service, '_build_intraday_chart_account', new_callable=AsyncMock) as mock_intraday:
                mock_intraday.return_value = {
                    'timestamp': [1, 2, 3],
                    'equity': [1000, 1050, 1100],
                    'data_source': 'account_intraday_interpolated'
                }
                
                result = await service._get_account_specific_history('user123', '1D', 'account-uuid-1')
                
                # Verify intraday chart method was called (not historical query)
                mock_intraday.assert_called_once_with('user123', 'account-uuid-1', 'plaid_account1')
                assert result['data_source'] == 'account_intraday_interpolated'
                assert len(result['equity']) == 3
    
    @pytest.mark.asyncio
    async def test_intraday_chart_generates_hourly_points(self):
        """Test that intraday chart generates multiple data points"""
        service = AggregatedPortfolioService()
        
        # Mock database calls
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            # Mock yesterday's snapshot with account breakdown
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.lte.return_value.in_.return_value.order.return_value.limit.return_value.execute.return_value.data = [
                {
                    'account_breakdown': json.dumps({'plaid_account1': 9500}),
                    'total_value': 20000,
                    'closing_value': 19000
                }
            ]
            
            # Mock cash lookup for account
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {
                    'account_contributions': json.dumps([
                        {'account_id': 'plaid_account1', 'market_value': 500}
                    ]),
                    'total_market_value': 500
                }
            ]
            
            # Mock current account value lookup
            with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                mock_service = AsyncMock()
                mock_service.filter_holdings_by_account.return_value = [
                    {'total_market_value': 10500}
                ]
                mock_filter_service.return_value = mock_service
                
                result = await service._build_intraday_chart_account('user123', 'account-uuid-1', 'plaid_account1')
                
                # Verify multiple data points (hourly interpolation)
                assert len(result['timestamp']) > 1, "Should have multiple hourly points"
                assert result['data_source'] == 'account_intraday_interpolated'
                assert 'base_value' in result
                assert result['timeframe'] == '1D'
    
    @pytest.mark.asyncio
    async def test_intraday_chart_includes_account_cash(self):
        """Test that yesterday's value and current value include account-specific cash"""
        service = AggregatedPortfolioService()
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            # Yesterday: $9000 securities + $1000 cash = $10000
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.lte.return_value.in_.return_value.order.return_value.limit.return_value.execute.return_value.data = [
                {
                    'account_breakdown': json.dumps({'plaid_account1': 9000}),
                    'total_value': 20000
                }
            ]
            
            # Cash for this account: $1000
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {
                    'account_contributions': json.dumps([
                        {'account_id': 'plaid_account1', 'market_value': 1000}
                    ])
                }
            ]
            
            # Current value: $9500 securities + $1000 cash = $10500
            with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                mock_service = AsyncMock()
                mock_service.filter_holdings_by_account.return_value = [
                    {'total_market_value': 9500},  # Securities
                    {'total_market_value': 1000}   # Cash
                ]
                mock_filter_service.return_value = mock_service
                
                result = await service._build_intraday_chart_account('user123', 'account-uuid-1', 'plaid_account1')
                
                # Yesterday's value should include cash
                assert result['base_value'] == 10000.0  # 9000 securities + 1000 cash
                
                # Current value should include cash
                assert result['equity'][-1] == 10500.0  # 9500 securities + 1000 cash
    
    @pytest.mark.asyncio
    async def test_intraday_chart_weekend_handling(self):
        """Test intraday chart generation on weekends (no market open)"""
        service = AggregatedPortfolioService()
        
        # Mock it to be Saturday (no market open)
        with patch('utils.portfolio.aggregated_portfolio_service.datetime') as mock_datetime:
            saturday = datetime(2025, 10, 11, 14, 0, 0, tzinfo=pytz.timezone('US/Eastern'))  # Saturday 2PM
            mock_datetime.now.return_value = saturday
            mock_datetime.combine = datetime.combine
            mock_datetime.side_effect = lambda *args, **kw: datetime(*args, **kw)
            
            with patch.object(service, '_get_supabase_client') as mock_supabase:
                mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.lte.return_value.in_.return_value.order.return_value.limit.return_value.execute.return_value.data = [
                    {'account_breakdown': json.dumps({'plaid_account1': 10000})}
                ]
                
                mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
                
                with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                    mock_service = AsyncMock()
                    mock_service.filter_holdings_by_account.return_value = [
                        {'total_market_value': 10000}
                    ]
                    mock_filter_service.return_value = mock_service
                    
                    result = await service._build_intraday_chart_account('user123', 'account-uuid-1', 'plaid_account1')
                    
                    # Should still generate chart even on weekend
                    assert len(result['timestamp']) >= 1
                    assert result['data_source'] == 'account_intraday_interpolated'


class TestOscillationPrevention:
    """Test that cash-only days are excluded to prevent oscillations"""
    
    @pytest.mark.asyncio
    async def test_excludes_zero_securities_days(self):
        """CRITICAL: Days with $0 securities should be excluded even if cash exists"""
        service = AggregatedPortfolioService()
        
        # Scenario: Account didn't exist on days 1-2 (securities = 0), 
        # but started on day 3 with $5000 securities
        # Current cash: $1000 (should NOT be added to days 1-2)
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'account_breakdown': '{"plaid_account1": 0, "plaid_other": 10000}',  # $0 for this account
                'total_value': 10000
            },
            {
                'value_date': '2025-10-02',
                'account_breakdown': '{"plaid_account1": 0, "plaid_other": 10500}',  # Still $0
                'total_value': 10500
            },
            {
                'value_date': '2025-10-03',
                'account_breakdown': '{"plaid_account1": 5000, "plaid_other": 6000}',  # Account started!
                'total_value': 11000
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            # Mock historical snapshots
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            # Mock cash lookup (current cash = $1000)
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {
                    'account_contributions': json.dumps([
                        {'account_id': 'plaid_account1', 'market_value': 1000}
                    ]),
                    'total_market_value': 1000
                }
            ]
            
            # Mock live value append
            with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                mock_service = AsyncMock()
                mock_service.filter_holdings_by_account.return_value = [
                    {'total_market_value': 6000}  # Current value
                ]
                mock_filter_service.return_value = mock_service
                
                result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
                
                # CRITICAL: Should only have 2 data points (day 3 + today's live)
                # Days 1-2 should be EXCLUDED (not show as $1000 cash-only)
                assert len(result['equity']) == 2, f"Should have 2 points, got {len(result['equity'])}: {result['equity']}"
                
                # First point should be day 3: $5000 securities + $1000 cash = $6000
                assert result['equity'][0] == 6000.0, f"Day 3 should be $6000, got {result['equity'][0]}"
                
                # No oscillations: values should NOT include days with $0 securities
                assert 1000.0 not in result['equity'], "Should not have cash-only values like $1000"
                assert 0.0 not in result['equity'], "Should not have $0 values"
    
    @pytest.mark.asyncio
    async def test_account_with_only_cash_excluded_from_history(self):
        """Test account that has only cash (no securities) is excluded"""
        service = AggregatedPortfolioService()
        
        mock_snapshots = [
            {
                'value_date': '2025-10-01',
                'account_breakdown': '{"plaid_account1": 0}',  # Only cash, no securities
                'total_value': 1000
            },
            {
                'value_date': '2025-10-02',
                'account_breakdown': '{"plaid_account1": 0}',
                'total_value': 1000
            }
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            # Current cash: $1000
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {'account_contributions': json.dumps([{'account_id': 'plaid_account1', 'market_value': 1000}])}
            ]
            
            with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                mock_service = AsyncMock()
                mock_service.filter_holdings_by_account.return_value = [{'total_market_value': 1000}]  # Only cash
                mock_filter_service.return_value = mock_service
                
                result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
                
                # Should have 1 point: today's live value (with cash)
                # Historical days with $0 securities should be excluded
                assert len(result['equity']) == 1
    
    @pytest.mark.asyncio
    async def test_smooth_progression_no_jumps(self):
        """Test that chart has smooth progression without unnatural jumps"""
        service = AggregatedPortfolioService()
        
        # Realistic scenario: Account grew naturally over time
        mock_snapshots = [
            {'value_date': '2025-10-01', 'account_breakdown': '{"plaid_account1": 9500}', 'total_value': 15000},
            {'value_date': '2025-10-02', 'account_breakdown': '{"plaid_account1": 9600}', 'total_value': 15100},
            {'value_date': '2025-10-03', 'account_breakdown': '{"plaid_account1": 9700}', 'total_value': 15200},
            {'value_date': '2025-10-04', 'account_breakdown': '{"plaid_account1": 9800}', 'total_value': 15300},
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            # Cash: $500
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {'account_contributions': json.dumps([{'account_id': 'plaid_account1', 'market_value': 500}])}
            ]
            
            with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                mock_service = AsyncMock()
                mock_service.filter_holdings_by_account.return_value = [{'total_market_value': 10300}]
                mock_filter_service.return_value = mock_service
                
                result = await service._get_account_specific_history('user123', '1W', 'account-uuid-1')
                
                # Values should progress smoothly: 10000, 10100, 10200, 10300, 10800
                equity_values = result['equity']
                
                # Check all values are positive and increasing (roughly)
                for i in range(len(equity_values) - 1):
                    assert equity_values[i] > 0, "All values should be positive"
                
                # No huge jumps (> 50% change day-to-day for this scenario)
                for i in range(1, len(equity_values)):
                    change_pct = abs((equity_values[i] - equity_values[i-1]) / equity_values[i-1] * 100)
                    assert change_pct < 50, f"Day-to-day change should be reasonable, got {change_pct}%"


class TestEdgeCasesProduction:
    """Additional production-critical edge cases"""
    
    @pytest.mark.asyncio
    async def test_account_created_today_no_historical_data(self):
        """Test account that was just created today"""
        service = AggregatedPortfolioService()
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            # No historical snapshots
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = []
            
            # Mock fallback
            with patch.object(service, '_get_current_account_value_fallback', new_callable=AsyncMock) as mock_fallback:
                mock_fallback.return_value = {
                    'equity': [5000.0],
                    'timestamp': [int(datetime.now().timestamp())],
                    'data_source': 'current_value_fallback'
                }
                
                result = await service._get_account_specific_history('user123', '1W', 'account-uuid-1')
                
                # Should use fallback
                mock_fallback.assert_called_once()
                assert result['data_source'] == 'current_value_fallback'
    
    @pytest.mark.asyncio
    async def test_gaps_in_historical_data(self):
        """Test that gaps in data (missing days) are handled correctly"""
        service = AggregatedPortfolioService()
        
        # Data with gap: day 1, day 5, day 10 (missing days 2-4, 6-9)
        # Using dates in the past so today's value will be appended
        mock_snapshots = [
            {'value_date': '2025-09-25', 'account_breakdown': '{"plaid_account1": 5000}'},
            {'value_date': '2025-09-29', 'account_breakdown': '{"plaid_account1": 5200}'},
            {'value_date': '2025-10-02', 'account_breakdown': '{"plaid_account1": 5400}'},
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
            
            with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                mock_service = AsyncMock()
                mock_service.filter_holdings_by_account.return_value = [{'total_market_value': 5600}]
                mock_filter_service.return_value = mock_service
                
                result = await service._get_account_specific_history('user123', '1M', 'account-uuid-1')
                
                # Should have 4 data points (3 historical + 1 today)
                assert len(result['equity']) == 4
                # Values should match snapshots
                assert result['equity'][0] == 5000.0
                assert result['equity'][1] == 5200.0
                assert result['equity'][2] == 5400.0
                assert result['equity'][3] == 5600.0
    
    @pytest.mark.asyncio
    async def test_multiple_accounts_different_start_dates(self):
        """Test filtering works correctly when multiple accounts have different histories"""
        service = AggregatedPortfolioService()
        
        # Snapshots contain multiple accounts starting at different times
        mock_snapshots = [
            {'value_date': '2025-09-01', 'account_breakdown': '{"plaid_account1": 5000}'},  # Only account1
            {'value_date': '2025-09-15', 'account_breakdown': '{"plaid_account1": 5200, "plaid_account2": 3000}'},  # account2 starts
            {'value_date': '2025-10-01', 'account_breakdown': '{"plaid_account1": 5400, "plaid_account2": 3200}'},
        ]
        
        with patch.object(service, '_get_supabase_client') as mock_supabase:
            # Query for account1
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'provider_account_id': 'account1'
            }
            
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = mock_snapshots
            
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
            
            with patch('utils.portfolio.account_filtering_service.get_account_filtering_service') as mock_filter_service:
                mock_service = AsyncMock()
                mock_service.filter_holdings_by_account.return_value = [{'total_market_value': 5600}]
                mock_filter_service.return_value = mock_service
                
                result = await service._get_account_specific_history('user123', 'MAX', 'account-uuid-1')
                
                # Account1 should have all 3 historical points + today
                assert len(result['equity']) == 4
                # Should only contain account1 values, not account2
                assert result['equity'][0] == 5000.0  # Account1 only
                assert result['equity'][1] == 5200.0  # Account1 (account2 also present but filtered out)
                assert result['equity'][2] == 5400.0
                assert result['equity'][3] == 5600.0


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])

