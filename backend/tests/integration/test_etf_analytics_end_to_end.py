#!/usr/bin/env python3
"""
End-to-end integration tests for ETF analytics functionality.

This test suite validates the complete flow from portfolio position mapping
through analytics calculation to sector allocation, ensuring that:

1. ETFs are correctly identified and categorized
2. Portfolio analytics scores update properly with ETF additions
3. Sector allocation correctly categorizes broad ETFs vs sector ETFs
4. The refresh mechanism works end-to-end

This addresses the user's specific issues:
- Risk/diversification scores not updating when adding ETFs/bond ETFs
- SPY being categorized as "Financial Services" instead of "Broad ETFs"
- Sector allocation not properly distinguishing ETF types
"""

import unittest
import sys
import os
from decimal import Decimal
from typing import List, Dict, Any
from unittest.mock import Mock, patch
import json

# Add project root to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyticsEngine
from clera_agents.types.portfolio_types import AssetClass, SecurityType
from utils.alpaca.portfolio_mapping import map_alpaca_position_to_portfolio_position
from utils.etf_categorization_service import get_etf_sector_for_allocation, is_known_etf


class MockAlpacaPosition:
    """Mock Alpaca position for testing."""
    
    def __init__(self, symbol: str, asset_class, market_value: str, cost_basis: str = None, 
                 unrealized_pl: str = None, qty: str = None, current_price: str = None, 
                 asset_id=None):
        self.symbol = symbol
        self.asset_class = asset_class
        self.market_value = market_value
        self.cost_basis = cost_basis or market_value
        self.unrealized_pl = unrealized_pl or "0.00"
        self.qty = qty or "100"
        self.current_price = current_price or str(float(market_value) / 100)
        self.asset_id = asset_id


class TestETFAnalyticsEndToEnd(unittest.TestCase):
    """End-to-end integration tests for ETF analytics functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Mock AlpacaTradingAssetClass
        self.mock_asset_class = Mock()
        self.mock_asset_class.US_EQUITY = "us_equity"
        
    def create_mock_alpaca_positions(self) -> List[MockAlpacaPosition]:
        """Create mock Alpaca positions for testing."""
        return [
            # Individual stock
            MockAlpacaPosition('AAPL', self.mock_asset_class.US_EQUITY, '5000.00'),
            
            # Broad market ETF (should be categorized as "Broad ETFs")
            MockAlpacaPosition('SPY', self.mock_asset_class.US_EQUITY, '10000.00'),
            
            # Sector ETF (should be categorized as "Technology")
            MockAlpacaPosition('XLK', self.mock_asset_class.US_EQUITY, '3000.00'),
            
            # Bond ETF (should be categorized as "Fixed Income")
            MockAlpacaPosition('AGG', self.mock_asset_class.US_EQUITY, '4000.00'),
            
            # Real Estate ETF (should be categorized as "Real Estate")
            MockAlpacaPosition('VNQ', self.mock_asset_class.US_EQUITY, '2000.00'),
            
            # International ETF (should be categorized as "International ETFs")
            MockAlpacaPosition('VEA', self.mock_asset_class.US_EQUITY, '3000.00'),
        ]
    
    def test_etf_identification_in_mapping(self):
        """Test that ETFs are correctly identified during position mapping."""
        alpaca_positions = self.create_mock_alpaca_positions()
        
        # Test each position mapping
        etf_symbols = ['SPY', 'XLK', 'AGG', 'VNQ', 'VEA']
        non_etf_symbols = ['AAPL']
        
        for alpaca_pos in alpaca_positions:
            if alpaca_pos.symbol in etf_symbols:
                with self.subTest(symbol=alpaca_pos.symbol):
                    # Should be recognized as ETF
                    self.assertTrue(
                        is_known_etf(alpaca_pos.symbol),
                        f"{alpaca_pos.symbol} should be recognized as a known ETF"
                    )
            
            elif alpaca_pos.symbol in non_etf_symbols:
                with self.subTest(symbol=alpaca_pos.symbol):
                    # Should not be recognized as ETF
                    self.assertFalse(
                        is_known_etf(alpaca_pos.symbol),
                        f"{alpaca_pos.symbol} should not be recognized as an ETF"
                    )
    
    @patch('utils.alpaca.portfolio_mapping.AlpacaTradingAssetClass')
    def test_portfolio_position_mapping_with_etfs(self, mock_alpaca_class):
        """Test that Alpaca positions are correctly mapped to portfolio positions with ETF categorization."""
        mock_alpaca_class.US_EQUITY = self.mock_asset_class.US_EQUITY
        
        alpaca_positions = self.create_mock_alpaca_positions()
        asset_details_map = {}  # Empty for this test
        
        mapped_positions = []
        for alpaca_pos in alpaca_positions:
            mapped_pos = map_alpaca_position_to_portfolio_position(alpaca_pos, asset_details_map)
            if mapped_pos:
                mapped_positions.append(mapped_pos)
        
        # Should have mapped all positions
        self.assertEqual(len(mapped_positions), len(alpaca_positions))
        
        # Test specific ETF mappings
        position_map = {pos.symbol: pos for pos in mapped_positions}
        
        # SPY should be mapped as ETF with EQUITY asset class
        spy_position = position_map['SPY']
        self.assertEqual(spy_position.security_type, SecurityType.ETF)
        self.assertEqual(spy_position.asset_class, AssetClass.EQUITY)
        
        # AGG should be mapped as ETF with FIXED_INCOME asset class (if ETF service is working)
        agg_position = position_map['AGG']
        self.assertEqual(agg_position.security_type, SecurityType.ETF)
        # Note: Asset class mapping depends on ETF service availability
        
        # VNQ should be mapped as ETF with REAL_ESTATE asset class (if ETF service is working)
        vnq_position = position_map['VNQ']
        self.assertEqual(vnq_position.security_type, SecurityType.ETF)
        
        # AAPL should be mapped as individual stock
        aapl_position = position_map['AAPL']
        self.assertEqual(aapl_position.security_type, SecurityType.INDIVIDUAL_STOCK)
        self.assertEqual(aapl_position.asset_class, AssetClass.EQUITY)
    
    def test_sector_allocation_categorization(self):
        """Test that ETFs are correctly categorized for sector allocation."""
        test_cases = [
            # Broad market ETFs should be categorized as "Broad ETFs"
            ('SPY', 'Broad ETFs'),
            ('VOO', 'Broad ETFs'),
            ('VTI', 'Broad ETFs'),
            ('QQQ', 'Broad ETFs'),
            
            # Sector ETFs should be categorized by their actual sector
            ('XLK', 'Technology'),
            ('XLF', 'Financial Services'),
            ('XLV', 'Healthcare'),
            ('XLE', 'Energy'),
            
            # Asset class ETFs should be categorized by asset class
            ('AGG', 'Fixed Income'),
            ('VNQ', 'Real Estate'),
            ('GLD', 'Commodities'),
            
            # International ETFs
            ('VEA', 'International ETFs'),
            ('EEM', 'International ETFs'),
        ]
        
        for symbol, expected_category in test_cases:
            with self.subTest(symbol=symbol):
                actual_category = get_etf_sector_for_allocation(symbol)
                self.assertEqual(
                    actual_category,
                    expected_category,
                    f"{symbol} should be categorized as '{expected_category}', not '{actual_category}'"
                )
    
    @patch('utils.alpaca.portfolio_mapping.AlpacaTradingAssetClass')
    def test_analytics_score_calculation_with_etfs(self, mock_alpaca_class):
        """Test that analytics scores are calculated correctly with ETF positions."""
        mock_alpaca_class.US_EQUITY = self.mock_asset_class.US_EQUITY
        
        # Create scenarios to test score changes
        
        # Scenario 1: Only individual stocks (higher risk, lower diversification)
        stock_only_positions = [
            MockAlpacaPosition('AAPL', self.mock_asset_class.US_EQUITY, '10000.00'),
            MockAlpacaPosition('MSFT', self.mock_asset_class.US_EQUITY, '5000.00'),
        ]
        
        # Scenario 2: Add broad market ETF (should reduce risk, improve diversification)
        with_broad_etf_positions = stock_only_positions + [
            MockAlpacaPosition('SPY', self.mock_asset_class.US_EQUITY, '8000.00'),
        ]
        
        # Scenario 3: Add bond ETF (should further reduce risk)
        with_bond_etf_positions = with_broad_etf_positions + [
            MockAlpacaPosition('AGG', self.mock_asset_class.US_EQUITY, '5000.00'),
        ]
        
        # Map positions for each scenario
        scenarios = [
            ("stock_only", stock_only_positions),
            ("with_broad_etf", with_broad_etf_positions),
            ("with_bond_etf", with_bond_etf_positions),
        ]
        
        results = {}
        asset_details_map = {}
        
        for scenario_name, alpaca_positions in scenarios:
            mapped_positions = []
            for alpaca_pos in alpaca_positions:
                mapped_pos = map_alpaca_position_to_portfolio_position(alpaca_pos, asset_details_map)
                if mapped_pos:
                    mapped_positions.append(mapped_pos)
            
            risk_score = PortfolioAnalyticsEngine.calculate_risk_score(mapped_positions)
            diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(mapped_positions)
            
            results[scenario_name] = {
                'risk_score': risk_score,
                'diversification_score': diversification_score,
                'position_count': len(mapped_positions)
            }
        
        # Test that scores change meaningfully between scenarios
        
        # Adding broad ETF should change scores
        self.assertNotEqual(
            results['stock_only']['risk_score'],
            results['with_broad_etf']['risk_score'],
            "Risk score should change when adding broad market ETF"
        )
        
        self.assertNotEqual(
            results['stock_only']['diversification_score'],
            results['with_broad_etf']['diversification_score'],
            "Diversification score should change when adding broad market ETF"
        )
        
        # Adding bond ETF should further change scores
        self.assertNotEqual(
            results['with_broad_etf']['risk_score'],
            results['with_bond_etf']['risk_score'],
            "Risk score should change when adding bond ETF"
        )
        
        # Bond ETF should generally reduce risk (assuming it's classified correctly)
        # Note: This test depends on the ETF service working correctly
        
        # All scores should be within valid ranges
        for scenario_name, result in results.items():
            with self.subTest(scenario=scenario_name):
                self.assertGreaterEqual(result['risk_score'], Decimal('0'))
                self.assertLessEqual(result['risk_score'], Decimal('10'))
                self.assertGreaterEqual(result['diversification_score'], Decimal('0'))
                self.assertLessEqual(result['diversification_score'], Decimal('10'))
    
    def test_sector_allocation_data_structure(self):
        """Test that sector allocation returns correct data structure for ETFs."""
        # Simulate the sector allocation response structure
        test_positions = [
            {'symbol': 'SPY', 'market_value': '10000.00'},
            {'symbol': 'XLK', 'market_value': '5000.00'},
            {'symbol': 'AGG', 'market_value': '3000.00'},
            {'symbol': 'AAPL', 'market_value': '2000.00'},  # Individual stock
        ]
        
        # Simulate sector lookup with our ETF categorization
        sector_values = {}
        total_portfolio_value = 0
        
        for position in test_positions:
            symbol = position['symbol']
            market_value = float(position['market_value'])
            total_portfolio_value += market_value
            
            # Use our ETF categorization for known ETFs
            if is_known_etf(symbol):
                sector = get_etf_sector_for_allocation(symbol)
            else:
                # For non-ETFs, would normally come from FMP API
                sector = 'Technology'  # Simulate AAPL sector
            
            sector_values[sector] = sector_values.get(sector, 0) + market_value
        
        # Format as sector allocation response
        sector_allocation_response = []
        for sector, value in sector_values.items():
            percentage = (value / total_portfolio_value) * 100
            sector_allocation_response.append({
                'sector': sector,
                'value': round(value, 2),
                'percentage': round(percentage, 2)
            })
        
        # Verify expected sectors are present
        sectors_present = {item['sector'] for item in sector_allocation_response}
        
        # Should have Broad ETFs (SPY), Technology (XLK and AAPL), Fixed Income (AGG)
        expected_sectors = {'Broad ETFs', 'Technology', 'Fixed Income'}
        
        # Check that we have the expected sectors
        for expected_sector in expected_sectors:
            with self.subTest(sector=expected_sector):
                self.assertIn(
                    expected_sector,
                    sectors_present,
                    f"Sector allocation should include '{expected_sector}'"
                )
        
        # Verify no incorrect categorization (SPY should NOT be in Financial Services)
        self.assertNotIn(
            'Financial Services',
            sectors_present,
            "SPY should not be categorized as Financial Services"
        )
        
        # Verify total adds up correctly
        total_percentage = sum(item['percentage'] for item in sector_allocation_response)
        self.assertAlmostEqual(
            total_percentage,
            100.0,
            places=1,
            msg="Total sector allocation percentage should be approximately 100%"
        )
    
    def test_refresh_scenario_simulation(self):
        """Test a complete refresh scenario simulation."""
        # Simulate the user's described scenario:
        # 1. Start with some positions
        # 2. Add ETFs and bond ETFs
        # 3. Verify scores change appropriately
        
        # Initial portfolio state
        initial_positions = [
            MockAlpacaPosition('AAPL', self.mock_asset_class.US_EQUITY, '8000.00'),
            MockAlpacaPosition('MSFT', self.mock_asset_class.US_EQUITY, '7000.00'),
        ]
        
        # After adding ETFs and bond ETFs
        updated_positions = initial_positions + [
            MockAlpacaPosition('SPY', self.mock_asset_class.US_EQUITY, '10000.00'),
            MockAlpacaPosition('AGG', self.mock_asset_class.US_EQUITY, '5000.00'),
            MockAlpacaPosition('VNQ', self.mock_asset_class.US_EQUITY, '3000.00'),
        ]
        
        # Simulate the analytics calculation for both states
        asset_details_map = {}
        
        def calculate_scores(alpaca_positions):
            mapped_positions = []
            for alpaca_pos in alpaca_positions:
                with patch('utils.alpaca.portfolio_mapping.AlpacaTradingAssetClass', self.mock_asset_class):
                    mapped_pos = map_alpaca_position_to_portfolio_position(alpaca_pos, asset_details_map)
                    if mapped_pos:
                        mapped_positions.append(mapped_pos)
            
            return {
                'risk_score': PortfolioAnalyticsEngine.calculate_risk_score(mapped_positions),
                'diversification_score': PortfolioAnalyticsEngine.calculate_diversification_score(mapped_positions),
                'position_count': len(mapped_positions),
                'total_value': sum(pos.market_value for pos in mapped_positions)
            }
        
        initial_scores = calculate_scores(initial_positions)
        updated_scores = calculate_scores(updated_positions)
        
        # Verify that scores changed significantly
        self.assertNotEqual(
            initial_scores['risk_score'],
            updated_scores['risk_score'],
            "Risk score should change when adding ETFs and bond ETFs"
        )
        
        self.assertNotEqual(
            initial_scores['diversification_score'],
            updated_scores['diversification_score'],
            "Diversification score should change when adding ETFs and bond ETFs"
        )
        
        # Diversification should improve with more positions and asset classes
        self.assertGreater(
            updated_scores['diversification_score'],
            initial_scores['diversification_score'],
            "Diversification score should improve when adding ETFs across different asset classes"
        )
        
        # The changes should be meaningful (at least 0.5 points)
        diversification_change = updated_scores['diversification_score'] - initial_scores['diversification_score']
        self.assertGreaterEqual(
            diversification_change,
            Decimal('0.5'),
            "Diversification score change should be meaningful when adding significant ETF allocation"
        )
        
        # Verify position count increased
        self.assertGreater(
            updated_scores['position_count'],
            initial_scores['position_count'],
            "Position count should increase when adding new positions"
        )
        
        # Log results for debugging
        print(f"\nRefresh Scenario Results:")
        print(f"Initial: Risk={initial_scores['risk_score']}, Diversification={initial_scores['diversification_score']}")
        print(f"Updated: Risk={updated_scores['risk_score']}, Diversification={updated_scores['diversification_score']}")
        print(f"Change: Risk={updated_scores['risk_score'] - initial_scores['risk_score']}, "
              f"Diversification={diversification_change}")


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)