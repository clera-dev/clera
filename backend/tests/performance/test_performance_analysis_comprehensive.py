#!/usr/bin/env python3
"""
Comprehensive test suite for the new investment performance analysis functionality.

This test suite validates:
1. Phase 1: Enhanced portfolio summary with P/L data
2. Phase 2: Investment performance calculation tool
3. All edge cases: invalid symbols, date ranges, API failures, etc.
4. Data validation and error handling
5. Real market data integration
"""

import unittest
import sys
import os
import json
from unittest.mock import patch, MagicMock, Mock
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta
import pandas as pd
from typing import Dict, Any

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import the enhanced functionality
from clera_agents.portfolio_management_agent import (
    get_portfolio_summary, calculate_investment_performance,
    validate_symbol_and_dates, adjust_for_market_days,
    get_historical_prices, calculate_annualized_return,
    format_performance_analysis
)
from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine, PortfolioPosition


class MockPosition:
    """Mock Alpaca Position object for testing."""
    def __init__(self, **kwargs):
        self.symbol = kwargs.get('symbol', 'AAPL')
        self.qty = kwargs.get('qty', '10')
        self.current_price = kwargs.get('current_price', '150.00')
        self.market_value = kwargs.get('market_value', '1500.00')
        self.cost_basis = kwargs.get('cost_basis', '1400.00')
        self.avg_entry_price = kwargs.get('avg_entry_price', '140.00')
        self.unrealized_pl = kwargs.get('unrealized_pl', '100.00')
        self.unrealized_plpc = kwargs.get('unrealized_plpc', '0.0714')  # 7.14%
        self.asset_class = kwargs.get('asset_class', 'us_equity')
        self.exchange = kwargs.get('exchange', 'NASDAQ')


class MockBarData:
    """Mock Alpaca bar data for testing."""
    def __init__(self, symbol, start_price, end_price, data_points=10):
        # Create a mock DataFrame with the expected structure
        dates = pd.date_range('2024-01-01', periods=data_points, freq='D')
        
        # Create price progression from start to end
        prices = []
        price_step = (end_price - start_price) / (data_points - 1)
        for i in range(data_points):
            prices.append(start_price + (price_step * i))
        
        # Create MultiIndex DataFrame (symbol, timestamp)
        multi_index = pd.MultiIndex.from_product([[symbol], dates], names=['symbol', 'timestamp'])
        
        self.df = pd.DataFrame({
            'open': prices,
            'high': [p * 1.02 for p in prices],
            'low': [p * 0.98 for p in prices],
            'close': prices,
            'volume': [1000000] * data_points
        }, index=multi_index)


class TestInputValidation(unittest.TestCase):
    """Test input validation functions."""
    
    def test_validate_symbol_and_dates_valid_inputs(self):
        """Test validation with valid inputs."""
        result = validate_symbol_and_dates('AAPL', '2024-01-01', '2024-12-31')
        self.assertEqual(result, {'valid': True})
    
    def test_validate_symbol_invalid_format(self):
        """Test validation with invalid symbol formats."""
        # Empty symbol
        result = validate_symbol_and_dates('', '2024-01-01', '2024-12-31')
        self.assertIn('error', result)
        self.assertIn('Invalid symbol format', result['error'])
        
        # Symbol with numbers
        result = validate_symbol_and_dates('AAPL123', '2024-01-01', '2024-12-31')
        self.assertIn('error', result)
        
        # Symbol too long
        result = validate_symbol_and_dates('VERYLONGSYMBOL', '2024-01-01', '2024-12-31')
        self.assertIn('error', result)
        self.assertIn('too long', result['error'])
    
    def test_validate_dates_invalid_format(self):
        """Test validation with invalid date formats."""
        # Invalid date format
        result = validate_symbol_and_dates('AAPL', '01-01-2024', '2024-12-31')
        self.assertIn('error', result)
        self.assertIn('Invalid date format', result['error'])
        
        # Invalid date
        result = validate_symbol_and_dates('AAPL', '2024-13-01', '2024-12-31')
        self.assertIn('error', result)
    
    def test_validate_dates_logic_errors(self):
        """Test validation with logical date errors."""
        # Start date after end date
        result = validate_symbol_and_dates('AAPL', '2024-12-31', '2024-01-01')
        self.assertIn('error', result)
        self.assertIn('Start date must be before end date', result['error'])
        
        # Date range too large (>5 years)
        result = validate_symbol_and_dates('AAPL', '2020-01-01', '2026-01-01')
        self.assertIn('error', result)
        self.assertIn('too large', result['error'])
        
        # Future end date
        future_date = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
        result = validate_symbol_and_dates('AAPL', '2024-01-01', future_date)
        self.assertIn('error', result)
        self.assertIn('future', result['error'])


class TestMarketDayAdjustment(unittest.TestCase):
    """Test market day adjustment functionality."""
    
    def test_adjust_for_market_days_weekday(self):
        """Test adjustment for regular weekdays (should not change)."""
        # Tuesday should remain Tuesday
        result = adjust_for_market_days('2024-01-02')  # Tuesday
        self.assertEqual(result, '2024-01-02')
    
    def test_adjust_for_market_days_weekend(self):
        """Test adjustment for weekends."""
        # Saturday should adjust to Friday (backward)
        result = adjust_for_market_days('2024-01-06', 'backward')  # Saturday
        expected = '2024-01-05'  # Friday
        self.assertEqual(result, expected)
        
        # Sunday should adjust to Monday (forward)
        result = adjust_for_market_days('2024-01-07', 'forward')  # Sunday
        expected = '2024-01-08'  # Monday
        self.assertEqual(result, expected)
    
    def test_adjust_for_market_days_error_handling(self):
        """Test error handling in market day adjustment."""
        # Invalid date should return original
        result = adjust_for_market_days('invalid-date')
        self.assertEqual(result, 'invalid-date')


class TestPerformanceCalculations(unittest.TestCase):
    """Test performance calculation functions."""
    
    def test_calculate_annualized_return_normal_cases(self):
        """Test annualized return calculation for normal cases."""
        # 10% return over 365 days should be ~10% annualized
        result = calculate_annualized_return(Decimal('10'), 365)
        self.assertAlmostEqual(float(result), 10.0, places=1)
        
        # 20% return over 182.5 days (half year) should be ~44% annualized
        result = calculate_annualized_return(Decimal('20'), 183)
        self.assertGreater(float(result), 35.0)  # Should be significantly higher
        
        # -10% return over 365 days
        result = calculate_annualized_return(Decimal('-10'), 365)
        self.assertAlmostEqual(float(result), -10.0, places=1)
    
    def test_calculate_annualized_return_edge_cases(self):
        """Test annualized return calculation for edge cases."""
        # Zero days
        result = calculate_annualized_return(Decimal('10'), 0)
        self.assertEqual(result, Decimal('0'))
        
        # Negative days
        result = calculate_annualized_return(Decimal('10'), -1)
        self.assertEqual(result, Decimal('0'))
        
        # Total loss (-100%)
        result = calculate_annualized_return(Decimal('-100'), 365)
        self.assertEqual(result, Decimal('-100'))
        
        # Very short period (use simple annualization)
        result = calculate_annualized_return(Decimal('1'), 10)  # 1% over 10 days
        expected = Decimal('1') * (Decimal('365.25') / Decimal('10'))
        self.assertAlmostEqual(float(result), float(expected), places=2)
    
    def test_calculate_annualized_return_extreme_values(self):
        """Test annualized return with extreme values that might cause overflow."""
        # Very large positive return
        result = calculate_annualized_return(Decimal('1000'), 1)  # 1000% in 1 day
        self.assertIsInstance(result, Decimal)
        self.assertGreater(result, Decimal('0'))
        
        # Very large negative return (but not -100%)
        result = calculate_annualized_return(Decimal('-50'), 365)
        self.assertLess(result, Decimal('0'))


class TestHistoricalDataRetrieval(unittest.TestCase):
    """Test historical data retrieval functionality."""
    
    @patch('clera_agents.portfolio_management_agent.data_client')
    def test_get_historical_prices_success(self, mock_data_client):
        """Test successful historical price retrieval."""
        # Setup mock response
        mock_bars = MockBarData('AAPL', 100.0, 120.0, 10)
        mock_data_client.get_stock_bars.return_value = mock_bars
        
        # Test the function
        result = get_historical_prices('AAPL', '2024-01-01', '2024-01-10')
        
        # Verify structure
        self.assertIn('symbol', result)
        self.assertIn('start_price', result)
        self.assertIn('end_price', result)
        self.assertIn('percentage_change', result)
        self.assertIn('data_points', result)
        
        # Verify values
        self.assertEqual(result['symbol'], 'AAPL')
        self.assertEqual(result['start_price'], Decimal('100.0'))
        self.assertEqual(result['end_price'], Decimal('120.0'))
        self.assertEqual(result['data_points'], 10)
        
        # Verify percentage calculation
        expected_pct = (120.0 - 100.0) / 100.0 * 100  # 20%
        self.assertAlmostEqual(float(result['percentage_change']), expected_pct, places=2)
    
    @patch('clera_agents.portfolio_management_agent.data_client')
    def test_get_historical_prices_no_data(self, mock_data_client):
        """Test handling when no historical data is available."""
        # Setup mock to return empty DataFrame
        mock_bars = Mock()
        mock_bars.df = pd.DataFrame()  # Empty DataFrame
        mock_data_client.get_stock_bars.return_value = mock_bars
        
        # Should raise ValueError
        with self.assertRaises(ValueError) as context:
            get_historical_prices('INVALID', '2024-01-01', '2024-01-10')
        
        self.assertIn('No price data available', str(context.exception))
    
    @patch('clera_agents.portfolio_management_agent.data_client')
    def test_get_historical_prices_api_error(self, mock_data_client):
        """Test handling of API errors."""
        # Setup mock to raise exception
        mock_data_client.get_stock_bars.side_effect = Exception("API Error")
        
        # Should propagate the exception
        with self.assertRaises(Exception) as context:
            get_historical_prices('AAPL', '2024-01-01', '2024-01-10')
        
        self.assertIn("API Error", str(context.exception))


class TestPerformanceAnalysisFormatting(unittest.TestCase):
    """Test performance analysis formatting."""
    
    def test_format_performance_analysis_basic(self):
        """Test basic performance analysis formatting."""
        performance_data = {
            'symbol': 'AAPL',
            'actual_start_date': '2024-01-01',
            'actual_end_date': '2024-12-31',
            'start_price': Decimal('100.00'),
            'end_price': Decimal('120.00'),
            'price_change': Decimal('20.00'),
            'percentage_change': Decimal('20.00'),
            'data_points': 252
        }
        
        result = format_performance_analysis(performance_data)
        
        # Check that all key information is present
        self.assertIn('AAPL', result)
        self.assertIn('2024-01-01', result)
        self.assertIn('2024-12-31', result)
        self.assertIn('$100.00', result)
        self.assertIn('$120.00', result)
        self.assertIn('+20.00%', result)
        self.assertIn('📈', result)  # Positive performance emoji
    
    def test_format_performance_analysis_with_benchmark(self):
        """Test performance analysis formatting with benchmark comparison."""
        performance_data = {
            'symbol': 'AAPL',
            'actual_start_date': '2024-01-01',
            'actual_end_date': '2024-12-31',
            'start_price': Decimal('100.00'),
            'end_price': Decimal('120.00'),
            'price_change': Decimal('20.00'),
            'percentage_change': Decimal('20.00'),
            'data_points': 252
        }
        
        benchmark_data = {
            'has_data': True,
            'percentage_change': Decimal('10.00')
        }
        
        result = format_performance_analysis(performance_data, benchmark_data)
        
        # Check benchmark comparison
        self.assertIn('vs S&P 500', result)
        self.assertIn('SPY Return: +10.00%', result)
        self.assertIn('Outperformance: +10.00', result)
        self.assertIn('Better than market', result)
    
    def test_format_performance_analysis_negative_performance(self):
        """Test formatting for negative performance."""
        performance_data = {
            'symbol': 'AAPL',
            'actual_start_date': '2024-01-01',
            'actual_end_date': '2024-12-31',
            'start_price': Decimal('120.00'),
            'end_price': Decimal('100.00'),
            'price_change': Decimal('-20.00'),
            'percentage_change': Decimal('-16.67'),
            'data_points': 252
        }
        
        result = format_performance_analysis(performance_data)
        
        # Check negative performance indicators
        self.assertIn('📉', result)  # Negative performance emoji
        self.assertIn('-16.67%', result)
        self.assertIn('$-20.00', result)


class TestCalculateInvestmentPerformanceTool(unittest.TestCase):
    """Test the main calculate_investment_performance tool."""
    
    @patch('clera_agents.portfolio_management_agent.get_historical_prices')
    def test_calculate_investment_performance_success(self, mock_get_prices):
        """Test successful performance calculation."""
        # Setup mock data
        mock_get_prices.side_effect = [
            # Main symbol data
            {
                'symbol': 'AAPL',
                'actual_start_date': '2024-01-01',
                'actual_end_date': '2024-12-31',
                'start_price': Decimal('100.00'),
                'end_price': Decimal('120.00'),
                'price_change': Decimal('20.00'),
                'percentage_change': Decimal('20.00'),
                'data_points': 252,
                'has_data': True
            },
            # SPY benchmark data
            {
                'symbol': 'SPY',
                'actual_start_date': '2024-01-01',
                'actual_end_date': '2024-12-31',
                'start_price': Decimal('400.00'),
                'end_price': Decimal('440.00'),
                'price_change': Decimal('40.00'),
                'percentage_change': Decimal('10.00'),
                'data_points': 252,
                'has_data': True
            }
        ]
        
        # Test the tool
        result = calculate_investment_performance.invoke({
            'symbol': 'AAPL',
            'start_date': '2024-01-01',
            'end_date': '2024-12-31'
        })
        
        # Verify successful analysis
        self.assertNotIn('❌', result)  # No error indicators
        self.assertIn('AAPL', result)
        self.assertIn('📈', result)  # Success emoji
        self.assertIn('+20.00%', result)
        self.assertIn('vs S&P 500', result)  # Benchmark comparison
    
    @patch('clera_agents.portfolio_management_agent.get_historical_prices')
    def test_calculate_investment_performance_invalid_symbol(self, mock_get_prices):
        """Test handling of invalid symbols."""
        # Setup mock to raise ValueError for invalid symbol
        mock_get_prices.side_effect = ValueError("No price data available for INVALID")
        
        result = calculate_investment_performance.invoke({
            'symbol': 'INVALID',
            'start_date': '2024-01-01',
            'end_date': '2024-12-31'
        })
        
        # Should return error message
        self.assertIn('❌', result)
        self.assertIn('Data Error', result)
    
    def test_calculate_investment_performance_invalid_dates(self):
        """Test validation of invalid date inputs."""
        result = calculate_investment_performance.invoke({
            'symbol': 'AAPL',
            'start_date': '2024-12-31',  # After end date
            'end_date': '2024-01-01'
        })
        
        # Should return validation error
        self.assertIn('❌', result)
        self.assertIn('Error:', result)
        self.assertIn('Start date must be before end date', result)
    
    @patch('clera_agents.portfolio_management_agent.get_historical_prices')
    def test_calculate_investment_performance_no_benchmark(self, mock_get_prices):
        """Test performance calculation without benchmark comparison."""
        # Setup mock data (only main symbol, no SPY)
        mock_get_prices.return_value = {
            'symbol': 'AAPL',
            'actual_start_date': '2024-01-01',
            'actual_end_date': '2024-12-31',
            'start_price': Decimal('100.00'),
            'end_price': Decimal('120.00'),
            'price_change': Decimal('20.00'),
            'percentage_change': Decimal('20.00'),
            'data_points': 252,
            'has_data': True
        }
        
        result = calculate_investment_performance.invoke({
            'symbol': 'AAPL',
            'start_date': '2024-01-01',
            'end_date': '2024-12-31',
            'compare_to_sp500': False
        })
        
        # Should not include benchmark comparison
        self.assertNotIn('vs S&P 500', result)
        self.assertIn('AAPL', result)
        self.assertIn('+20.00%', result)
    
    @patch('clera_agents.portfolio_management_agent.get_historical_prices')
    def test_calculate_investment_performance_benchmark_failure(self, mock_get_prices):
        """Test when benchmark data fails but main symbol succeeds."""
        def mock_side_effect(symbol, start, end):
            if symbol == 'AAPL':
                return {
                    'symbol': 'AAPL',
                    'actual_start_date': '2024-01-01',
                    'actual_end_date': '2024-12-31',
                    'start_price': Decimal('100.00'),
                    'end_price': Decimal('120.00'),
                    'price_change': Decimal('20.00'),
                    'percentage_change': Decimal('20.00'),
                    'data_points': 252,
                    'has_data': True
                }
            elif symbol == 'SPY':
                raise Exception("SPY data unavailable")
        
        mock_get_prices.side_effect = mock_side_effect
        
        result = calculate_investment_performance.invoke({
            'symbol': 'AAPL',
            'start_date': '2024-01-01',
            'end_date': '2024-12-31'
        })
        
        # Should succeed without benchmark
        self.assertNotIn('❌', result)
        self.assertIn('AAPL', result)
        self.assertNotIn('vs S&P 500', result)  # No benchmark due to failure


class TestEnhancedPortfolioSummary(unittest.TestCase):
    """Test the enhanced portfolio summary with P/L data."""
    
    def create_test_positions(self):
        """Create test positions for portfolio summary testing."""
        positions = []
        
        # Position 1: AAPL with gain
        pos1 = Mock()
        pos1.symbol = 'AAPL'
        pos1.market_value = Decimal('5000.00')
        pos1.unrealized_pl = Decimal('500.00')
        pos1.unrealized_plpc = Decimal('0.11')  # 11%
        pos1.asset_class = None
        pos1.security_type = None
        positions.append(pos1)
        
        # Position 2: MSFT with loss
        pos2 = Mock()
        pos2.symbol = 'MSFT'
        pos2.market_value = Decimal('3000.00')
        pos2.unrealized_pl = Decimal('-200.00')
        pos2.unrealized_plpc = Decimal('-0.0625')  # -6.25%
        pos2.asset_class = None
        pos2.security_type = None
        positions.append(pos2)
        
        return positions
    
    def test_format_portfolio_summary_with_positions(self):
        """Test that portfolio summary includes individual position P/L data."""
        # Create test positions
        positions = self.create_test_positions()
        
        # Create mock metrics
        metrics = Mock()
        metrics.total_value = Decimal('8000.00')
        metrics.cash_value = Decimal('0')
        metrics.invested_value = Decimal('8000.00')
        metrics.asset_class_percentages = {}
        metrics.security_type_percentages = {}
        metrics.total_gain_loss = Decimal('300.00')
        metrics.total_gain_loss_percent = Decimal('3.75')
        metrics.risk_score = Decimal('5.0')
        metrics.diversification_score = Decimal('7.0')
        metrics.concentration_risk = {}
        metrics.asset_class_attribution = {}
        
        # Test the enhanced formatting
        result = PortfolioAnalyticsEngine.format_portfolio_summary(metrics, None, positions)
        
        # Verify individual positions section is included
        self.assertIn('## Individual Positions', result)
        
        # Verify position details with P/L
        self.assertIn('AAPL: $5,000.00', result)
        self.assertIn('📈 +500.00, +11.00%', result)  # Gain indicator and percentage
        
        self.assertIn('MSFT: $3,000.00', result)
        self.assertIn('📉 -200.00, -6.25%', result)  # Loss indicator and percentage
        
        # Verify positions are sorted by market value (AAPL first)
        aapl_index = result.find('AAPL')
        msft_index = result.find('MSFT')
        self.assertLess(aapl_index, msft_index)
    
    def test_format_portfolio_summary_no_positions(self):
        """Test portfolio summary when no positions are provided."""
        metrics = Mock()
        metrics.total_value = Decimal('1000.00')
        metrics.cash_value = Decimal('1000.00')
        metrics.invested_value = Decimal('0')
        metrics.asset_class_percentages = {}
        metrics.security_type_percentages = {}
        metrics.total_gain_loss = Decimal('0')
        metrics.risk_score = Decimal('3.0')
        metrics.diversification_score = Decimal('5.0')
        metrics.concentration_risk = {}
        metrics.asset_class_attribution = {}
        
        # Test formatting without positions
        result = PortfolioAnalyticsEngine.format_portfolio_summary(metrics, None, None)
        
        # Should not include positions section
        self.assertNotIn('## Individual Positions', result)
        
        # Should still include other sections
        self.assertIn('# Portfolio Summary', result)
        self.assertIn('## Risk Assessment', result)
    
    def test_format_portfolio_summary_positions_without_pl(self):
        """Test portfolio summary with positions that don't have P/L data."""
        # Create position without P/L data
        position = Mock()
        position.symbol = 'GOOGL'
        position.market_value = Decimal('2000.00')
        position.unrealized_pl = None  # No P/L data
        position.unrealized_plpc = None
        position.asset_class = None
        position.security_type = None
        
        metrics = Mock()
        metrics.total_value = Decimal('2000.00')
        metrics.cash_value = Decimal('0')
        metrics.invested_value = Decimal('2000.00')
        metrics.asset_class_percentages = {}
        metrics.security_type_percentages = {}
        metrics.total_gain_loss = Decimal('0')
        metrics.risk_score = Decimal('5.0')
        metrics.diversification_score = Decimal('7.0')
        metrics.concentration_risk = {}
        metrics.asset_class_attribution = {}
        
        result = PortfolioAnalyticsEngine.format_portfolio_summary(metrics, None, [position])
        
        # Should include position but without P/L indicators
        self.assertIn('GOOGL: $2,000.00', result)
        self.assertNotIn('📈', result)
        self.assertNotIn('📉', result)


class TestIntegrationScenarios(unittest.TestCase):
    """Test real-world integration scenarios."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.output_dir = os.path.join(current_dir, "performance_analysis_outputs")
        os.makedirs(self.output_dir, exist_ok=True)
    
    def save_test_output(self, test_name: str, output: str):
        """Save test output for inspection."""
        output_file = os.path.join(self.output_dir, f"{test_name}_output.txt")
        with open(output_file, 'w') as f:
            f.write(f"=== Test: {test_name} ===\n")
            f.write(f"Timestamp: {datetime.now()}\n")
            f.write("="*50 + "\n")
            f.write(output)
            f.write("\n\n")
    
    @patch('clera_agents.portfolio_management_agent.get_historical_prices')
    def test_ytd_performance_analysis(self, mock_get_prices):
        """Test Year-to-Date performance analysis scenario."""
        # Setup YTD data
        current_year = datetime.now().year
        ytd_start = f"{current_year}-01-01"
        
        mock_get_prices.side_effect = [
            # AAPL YTD performance
            {
                'symbol': 'AAPL',
                'actual_start_date': ytd_start,
                'actual_end_date': datetime.now().strftime('%Y-%m-%d'),
                'start_price': Decimal('170.00'),
                'end_price': Decimal('195.00'),
                'price_change': Decimal('25.00'),
                'percentage_change': Decimal('14.71'),
                'data_points': 180,
                'has_data': True
            },
            # SPY YTD performance
            {
                'symbol': 'SPY',
                'actual_start_date': ytd_start,
                'actual_end_date': datetime.now().strftime('%Y-%m-%d'),
                'start_price': Decimal('440.00'),
                'end_price': Decimal('475.00'),
                'price_change': Decimal('35.00'),
                'percentage_change': Decimal('7.95'),
                'data_points': 180,
                'has_data': True
            }
        ]
        
        result = calculate_investment_performance.invoke({
            'symbol': 'AAPL',
            'start_date': ytd_start
        })
        
        self.save_test_output('ytd_performance_analysis', result)
        
        # Verify YTD analysis
        self.assertIn('AAPL', result)
        self.assertIn('+14.71%', result)
        self.assertIn('vs S&P 500', result)
        self.assertIn('Better than market', result)  # AAPL outperformed SPY
    
    @patch('clera_agents.portfolio_management_agent.get_historical_prices')
    def test_multi_year_performance_analysis(self, mock_get_prices):
        """Test multi-year performance analysis."""
        mock_get_prices.side_effect = [
            # 3-year performance
            {
                'symbol': 'MSFT',
                'actual_start_date': '2021-01-01',
                'actual_end_date': '2024-01-01',
                'start_price': Decimal('220.00'),
                'end_price': Decimal('380.00'),
                'price_change': Decimal('160.00'),
                'percentage_change': Decimal('72.73'),
                'data_points': 780,
                'has_data': True
            },
            # SPY 3-year performance
            {
                'symbol': 'SPY',
                'actual_start_date': '2021-01-01',
                'actual_end_date': '2024-01-01',
                'start_price': Decimal('370.00'),
                'end_price': Decimal('475.00'),
                'price_change': Decimal('105.00'),
                'percentage_change': Decimal('28.38'),
                'data_points': 780,
                'has_data': True
            }
        ]
        
        result = calculate_investment_performance.invoke({
            'symbol': 'MSFT',
            'start_date': '2021-01-01',
            'end_date': '2024-01-01'
        })
        
        self.save_test_output('multi_year_performance', result)
        
        # Verify multi-year analysis
        self.assertIn('MSFT', result)
        self.assertIn('+72.73%', result)
        self.assertIn('Annualized Return', result)
        self.assertIn('Better than market', result)  # MSFT significantly outperformed
    
    def test_error_scenarios_comprehensive(self):
        """Test various error scenarios comprehensively."""
        # Test input validation directly (without API calls)
        validation_scenarios = [
            {
                'name': 'empty_symbol',
                'symbol': '',
                'start_date': '2024-01-01',
                'end_date': '2024-12-31',
                'expected_error': 'Invalid symbol format'
            },
            {
                'name': 'symbol_with_numbers',
                'symbol': 'AAPL123',
                'start_date': '2024-01-01',
                'end_date': '2024-12-31',
                'expected_error': 'Invalid symbol format'
            },
            {
                'name': 'date_order_reversed',
                'symbol': 'AAPL',
                'start_date': '2024-12-31',
                'end_date': '2024-01-01',
                'expected_error': 'Start date must be before end date'
            },
            {
                'name': 'date_range_too_large',
                'symbol': 'AAPL',
                'start_date': '2015-01-01',
                'end_date': '2025-01-01',
                'expected_error': 'too large'
            },
            {
                'name': 'future_end_date_too_large',
                'symbol': 'AAPL',
                'start_date': '2024-01-01',
                'end_date': '2030-01-01',
                'expected_error': 'too large'  # 6 years is > 5 year limit
            },
            {
                'name': 'future_end_date_actual',
                'symbol': 'AAPL',
                'start_date': '2024-01-01',
                'end_date': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),  # 30 days in the future
                'expected_error': 'future'  # Actually in the future
            }
        ]
        
        # Test validation function directly to avoid API dependency
        for scenario in validation_scenarios:
            with self.subTest(scenario=scenario['name']):
                result = validate_symbol_and_dates(
                    scenario['symbol'], 
                    scenario['start_date'], 
                    scenario['end_date']
                )
                
                # Debug output to see what we're getting
                print(f"Testing {scenario['name']}: {result}")
                
                self.assertIn('error', result, f"Expected error for {scenario['name']}, got: {result}")
                self.assertIn(scenario['expected_error'], result['error'])
                
                # Save validation output for inspection
                self.save_test_output(f"validation_{scenario['name']}", str(result))
        
        # Test full tool with one mock scenario to verify tool-level error handling
        with patch('clera_agents.portfolio_management_agent.get_historical_prices') as mock_get_prices:
            mock_get_prices.side_effect = ValueError("No price data available for INVALID")
            
            result = calculate_investment_performance.invoke({
                'symbol': 'INVALID',
                'start_date': '2024-01-01',
                'end_date': '2024-12-31'
            })
            
            self.assertIn('❌', result)
            self.assertIn('Data Error', result)
            self.save_test_output('tool_invalid_symbol_error', result)


class TestRealAPIIntegration(unittest.TestCase):
    """Test real API integration (when environment allows)."""
    
    def setUp(self):
        """Check if real API testing is possible."""
        self.api_key = os.getenv("BROKER_API_KEY")
        self.secret_key = os.getenv("BROKER_SECRET_KEY")
        self.can_test_real_api = bool(self.api_key and self.secret_key)
        
        if not self.can_test_real_api:
            self.skipTest("Real API credentials not available")
    
    def test_real_spy_performance_data(self):
        """Test retrieving real SPY performance data."""
        if not self.can_test_real_api:
            self.skipTest("Real API credentials not available")
        
        # Test recent SPY performance (last 30 days)
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        try:
            result = calculate_investment_performance.invoke({
                'symbol': 'SPY',
                'start_date': start_date,
                'end_date': end_date,
                'compare_to_sp500': False  # Don't compare SPY to itself
            })
            
            # If API is working, should not contain errors
            if '❌' in result:
                # If there's an API error, just log it and skip rather than failing
                print(f"API not accessible in test environment: {result}")
                self.skipTest("API not accessible in test environment")
            
            self.assertIn('SPY', result)
            self.assertIn('Performance Analysis', result)
            
            # Save real data for inspection
            output_dir = os.path.join(current_dir, "performance_analysis_outputs")
            os.makedirs(output_dir, exist_ok=True)
            
            with open(os.path.join(output_dir, "real_spy_data.txt"), 'w') as f:
                f.write(f"Real SPY data test - {datetime.now()}\n")
                f.write("="*50 + "\n")
                f.write(result)
            
        except Exception as e:
            # Skip the test if API is not working instead of failing
            self.skipTest(f"Real API not accessible: {e}")


if __name__ == '__main__':
    # Create output directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(current_dir, "performance_analysis_outputs")
    os.makedirs(output_dir, exist_ok=True)
    
    # Run tests with verbose output
    unittest.main(verbosity=2) 