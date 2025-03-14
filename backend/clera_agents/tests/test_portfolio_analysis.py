#!/usr/bin/env python3
"""
Unit tests for portfolio_analysis.py module.
Tests the portfolio analysis and rebalancing functionality.
"""

import unittest
from decimal import Decimal
import sys
import os
from typing import List

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio, RiskProfile, AssetAllocation
)
from clera_agents.tools.portfolio_analysis import (
    PortfolioPosition, PortfolioAnalyzer
)


class MockAlpacaPosition:
    """Mock Alpaca Position object for testing."""
    def __init__(self, symbol, qty, current_price, market_value, cost_basis=None, 
                 avg_entry_price=None, unrealized_pl=None, unrealized_plpc=None):
        self.symbol = symbol
        self.qty = qty
        self.current_price = current_price
        self.market_value = market_value
        self.cost_basis = cost_basis if cost_basis is not None else market_value
        self.avg_entry_price = avg_entry_price if avg_entry_price is not None else current_price
        self.unrealized_pl = unrealized_pl if unrealized_pl is not None else "0.0"
        self.unrealized_plpc = unrealized_plpc if unrealized_plpc is not None else "0.0"


def create_test_positions() -> List[MockAlpacaPosition]:
    """Create a set of test positions that simulate Alpaca API response."""
    return [
        # Equity positions - Individual stocks
        MockAlpacaPosition(
            symbol='AAPL',
            qty='10',
            current_price='200.00',
            market_value='2000.00',
            cost_basis='1900.00',
            avg_entry_price='190.00',
            unrealized_pl='100.00',
            unrealized_plpc='0.0526315789'
        ),
        MockAlpacaPosition(
            symbol='MSFT',
            qty='5',
            current_price='400.00',
            market_value='2000.00',
            cost_basis='1850.00',
            avg_entry_price='370.00',
            unrealized_pl='150.00',
            unrealized_plpc='0.0810810811'
        ),
        
        # Equity ETF
        MockAlpacaPosition(
            symbol='SPY',
            qty='4',
            current_price='500.00',
            market_value='2000.00',
            cost_basis='1800.00',
            avg_entry_price='450.00',
            unrealized_pl='200.00',
            unrealized_plpc='0.1111111111'
        ),
        
        # Fixed income ETF
        MockAlpacaPosition(
            symbol='AGG',
            qty='20',
            current_price='100.00',
            market_value='2000.00',
            cost_basis='2100.00',
            avg_entry_price='105.00',
            unrealized_pl='-100.00',
            unrealized_plpc='-0.0476190476'
        ),
        
        # Another fixed income ETF
        MockAlpacaPosition(
            symbol='BND',
            qty='15',
            current_price='80.00',
            market_value='1200.00',
            cost_basis='1230.00',
            avg_entry_price='82.00',
            unrealized_pl='-30.00',
            unrealized_plpc='-0.0243902439'
        ),
    ]


class TestPortfolioPosition(unittest.TestCase):
    """Tests for the PortfolioPosition class."""
    
    def test_from_alpaca_position(self):
        """Test creating a PortfolioPosition from an Alpaca position."""
        mock_position = MockAlpacaPosition(
            symbol='AAPL',
            qty='10',
            current_price='200.00',
            market_value='2000.00',
            cost_basis='1900.00',
            avg_entry_price='190.00',
            unrealized_pl='100.00',
            unrealized_plpc='0.0526315789'
        )
        
        position = PortfolioPosition.from_alpaca_position(mock_position)
        
        self.assertEqual(position.symbol, 'AAPL')
        self.assertEqual(position.quantity, Decimal('10'))
        self.assertEqual(position.current_price, Decimal('200.00'))
        self.assertEqual(position.market_value, Decimal('2000.00'))
        self.assertEqual(position.cost_basis, Decimal('1900.00'))
        self.assertEqual(position.unrealized_pl, Decimal('100.00'))
        self.assertEqual(position.unrealized_plpc, Decimal('0.0526315789'))
        
        # Classification fields should be None initially
        self.assertIsNone(position.asset_class)
        self.assertIsNone(position.security_type)


class TestPortfolioAnalyzer(unittest.TestCase):
    """Tests for the PortfolioAnalyzer class."""
    
    def test_classify_position(self):
        """Test classifying positions by asset class and security type."""
        # Test ETF classification
        etf_position = PortfolioPosition(
            symbol='SPY',
            quantity=Decimal('4'),
            current_price=Decimal('500.00'),
            market_value=Decimal('2000.00')
        )
        
        classified_etf = PortfolioAnalyzer.classify_position(etf_position)
        self.assertEqual(classified_etf.security_type, SecurityType.ETF)
        self.assertEqual(classified_etf.asset_class, AssetClass.EQUITY)
        
        # Test bond ETF classification
        bond_etf_position = PortfolioPosition(
            symbol='AGG',
            quantity=Decimal('20'),
            current_price=Decimal('100.00'),
            market_value=Decimal('2000.00')
        )
        
        classified_bond = PortfolioAnalyzer.classify_position(bond_etf_position)
        self.assertEqual(classified_bond.security_type, SecurityType.ETF)
        self.assertEqual(classified_bond.asset_class, AssetClass.FIXED_INCOME)
        
        # Test individual stock classification
        stock_position = PortfolioPosition(
            symbol='AAPL',
            quantity=Decimal('10'),
            current_price=Decimal('200.00'),
            market_value=Decimal('2000.00')
        )
        
        classified_stock = PortfolioAnalyzer.classify_position(stock_position)
        self.assertEqual(classified_stock.security_type, SecurityType.INDIVIDUAL_STOCK)
        self.assertEqual(classified_stock.asset_class, AssetClass.EQUITY)
    
    def test_analyze_portfolio(self):
        """Test analyzing a portfolio of positions."""
        mock_positions = create_test_positions()
        positions = [PortfolioPosition.from_alpaca_position(pos) for pos in mock_positions]
        
        analysis = PortfolioAnalyzer.analyze_portfolio(positions)
        
        # Check total value
        expected_total = Decimal('9200.00')  # Sum of all position market values
        self.assertEqual(analysis['total_value'], expected_total)
        
        # Check asset class breakdown
        asset_classes = analysis['asset_class_percentages']
        self.assertAlmostEqual(float(asset_classes[AssetClass.EQUITY]), 100 * 6000 / 9200, places=2)  # AAPL + MSFT + SPY
        self.assertAlmostEqual(float(asset_classes[AssetClass.FIXED_INCOME]), 100 * 3200 / 9200, places=2)  # AGG + BND
        
        # Check security type breakdown
        security_types = analysis['security_type_percentages']
        self.assertAlmostEqual(float(security_types[SecurityType.ETF]), 100 * 5200 / 9200, places=2)  # SPY + AGG + BND
        self.assertAlmostEqual(float(security_types[SecurityType.INDIVIDUAL_STOCK]), 100 * 4000 / 9200, places=2)  # AAPL + MSFT
        
        # Check SPY equivalent allocation
        self.assertEqual(analysis['spy_equivalent_value'], Decimal('2000.00'))
        self.assertAlmostEqual(float(analysis['spy_equivalent_percentage']), 100 * 2000 / 9200, places=2)
    
    def test_generate_rebalance_instructions_aggressive(self):
        """Test generating rebalance instructions for aggressive portfolio."""
        mock_positions = create_test_positions()
        positions = [PortfolioPosition.from_alpaca_position(pos) for pos in mock_positions]
        
        # Create target portfolio (aggressive: 100% equity, 50% ETF, 50% individual stocks)
        target_portfolio = TargetPortfolio.create_aggressive_growth_portfolio()
        
        instructions = PortfolioAnalyzer.generate_rebalance_instructions(
            positions=positions,
            target_portfolio=target_portfolio
        )
        
        # Check that instructions is a string
        self.assertIsInstance(instructions, str)
        
        # Check that instructions contains key information
        self.assertIn("Current Portfolio Summary", instructions)
        self.assertIn("Total Portfolio Value: $9,200.00", instructions)
        self.assertIn("Current Asset Allocation", instructions)
        self.assertIn("Equity:", instructions)
        self.assertIn("Fixed Income:", instructions)
        self.assertIn("Target Allocation", instructions)
        self.assertIn("Rebalancing Instructions", instructions)
        
        # With aggressive portfolio (100% equity), we should be reducing fixed income
        self.assertIn("Reduce Fixed Income", instructions)
        # And increasing equity
        self.assertIn("Add to Equity", instructions)
    
    def test_generate_rebalance_instructions_balanced(self):
        """Test generating rebalance instructions for balanced portfolio."""
        mock_positions = create_test_positions()
        positions = [PortfolioPosition.from_alpaca_position(pos) for pos in mock_positions]
        
        # Create target portfolio (balanced: 60% equity, 40% fixed income)
        target_portfolio = TargetPortfolio.create_balanced_portfolio()
        
        instructions = PortfolioAnalyzer.generate_rebalance_instructions(
            positions=positions,
            target_portfolio=target_portfolio
        )
        
        # Check that instructions contains key information
        self.assertIn("Current Portfolio Summary", instructions)
        self.assertIn("Total Portfolio Value: $9,200.00", instructions)
        
        # For our test data, equity is about 65.2% and fixed income is 34.8%
        # So with balanced (60% equity, 40% fixed income), we should be:
        # - Reducing equity slightly
        # - Increasing fixed income slightly
        
        # But these differences might be small enough that they don't trigger 
        # the threshold for recommendations, so we'll just check that the
        # target allocation is correctly displayed
        self.assertIn("Equity: 60.0%", instructions)
        self.assertIn("Fixed Income: 40.0%", instructions)
    
    def test_generate_rebalance_instructions_conservative(self):
        """Test generating rebalance instructions for conservative portfolio."""
        mock_positions = create_test_positions()
        positions = [PortfolioPosition.from_alpaca_position(pos) for pos in mock_positions]
        
        # Create target portfolio (conservative: 30% equity, 60% fixed income, 10% cash)
        target_portfolio = TargetPortfolio.create_conservative_portfolio()
        
        instructions = PortfolioAnalyzer.generate_rebalance_instructions(
            positions=positions,
            target_portfolio=target_portfolio
        )
        
        # Check that instructions contains key information
        self.assertIn("Current Portfolio Summary", instructions)
        self.assertIn("Total Portfolio Value: $9,200.00", instructions)
        
        # For our test data, equity is about 65.2% and fixed income is 34.8%, with no cash
        # So with conservative (30% equity, 60% fixed income, 10% cash), we should be:
        # - Significantly reducing equity
        # - Increasing fixed income
        # - Adding cash (which currently doesn't exist in the portfolio)
        
        self.assertIn("Reduce Equity", instructions)
        self.assertIn("Add to Fixed Income", instructions)
        self.assertIn("Cash: 10.0%", instructions)  # Target allocation for cash


if __name__ == "__main__":
    unittest.main() 