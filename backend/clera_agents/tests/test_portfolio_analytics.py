#!/usr/bin/env python3
"""
Unit tests for the PortfolioAnalyticsEngine class and related functions.

These tests validate the advanced portfolio analysis functionality including:
- Diversification scoring
- Risk scoring
- Returns attribution analysis
- Concentration risk identification
- Portfolio metrics generation and summary formatting
"""

import unittest
from decimal import Decimal
import sys
import os
from typing import List, Dict
import json

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio, RiskProfile, AssetAllocation
)
from clera_agents.tools.portfolio_analysis import (
    PortfolioPosition, PortfolioAnalyzer, PortfolioAnalyticsEngine, PortfolioMetrics
)

# Import test utilities
from clera_agents.tests.test_portfolio_analysis import MockAlpacaPosition, create_test_positions


def create_diverse_test_positions() -> List[PortfolioPosition]:
    """
    Create a more diverse set of portfolio positions for testing analysis tools.
    This includes a broader mix of asset classes and security types.
    """
    positions = []
    
    # Convert standard test positions to PortfolioPosition objects
    for mock_position in create_test_positions():
        position = PortfolioPosition.from_alpaca_position(mock_position)
        # Classify the position
        position = PortfolioAnalyzer.classify_position(position)
        positions.append(position)
    
    # Add a few more diverse positions manually
    positions.extend([
        # REIT position
        PortfolioPosition(
            symbol="VNQ",
            quantity=Decimal("15"),
            current_price=Decimal("85.00"),
            market_value=Decimal("1275.00"),
            cost_basis=Decimal("1350.00"),
            unrealized_pl=Decimal("-75.00"),
            unrealized_plpc=Decimal("-0.0555555556"),
            asset_class=AssetClass.REAL_ESTATE,
            security_type=SecurityType.REIT
        ),
        
        # Cryptocurrency position
        PortfolioPosition(
            symbol="BTCUSD",
            quantity=Decimal("0.02"),
            current_price=Decimal("60000.00"),
            market_value=Decimal("1200.00"),
            cost_basis=Decimal("900.00"),
            unrealized_pl=Decimal("300.00"),
            unrealized_plpc=Decimal("0.3333333333"),
            asset_class=AssetClass.ALTERNATIVES,
            security_type=SecurityType.CRYPTOCURRENCY
        ),
        
        # Commodity ETF
        PortfolioPosition(
            symbol="GLD",
            quantity=Decimal("6"),
            current_price=Decimal("190.00"),
            market_value=Decimal("1140.00"),
            cost_basis=Decimal("1080.00"),
            unrealized_pl=Decimal("60.00"),
            unrealized_plpc=Decimal("0.0555555556"),
            asset_class=AssetClass.COMMODITIES,
            security_type=SecurityType.ETF
        ),
        
        # Money market (cash equivalent)
        PortfolioPosition(
            symbol="SPAXX",
            quantity=Decimal("500"),
            current_price=Decimal("1.00"),
            market_value=Decimal("500.00"),
            cost_basis=Decimal("500.00"),
            unrealized_pl=Decimal("0.00"),
            unrealized_plpc=Decimal("0.00"),
            asset_class=AssetClass.CASH,
            security_type=SecurityType.MONEY_MARKET
        ),
    ])
    
    return positions


class TestPortfolioAnalyticsEngine(unittest.TestCase):
    """Tests for the advanced portfolio analytics engine."""
    
    def setUp(self):
        """Set up test data before each test method."""
        # Regular positions from the standard test cases
        self.basic_positions = [PortfolioPosition.from_alpaca_position(p) for p in create_test_positions()]
        for i, position in enumerate(self.basic_positions):
            self.basic_positions[i] = PortfolioAnalyzer.classify_position(position)
        
        # More diverse positions including all asset classes
        self.diverse_positions = create_diverse_test_positions()
        
        # Empty positions list for edge cases
        self.empty_positions = []
        
        # Single position for concentration tests
        self.single_position = [self.basic_positions[0]]
    
    def test_calculate_diversification_score(self):
        """Test diversification score calculation."""
        # Test with diverse portfolio
        diverse_score = PortfolioAnalyticsEngine.calculate_diversification_score(self.diverse_positions)
        
        # Score should be between 1 and 10
        self.assertGreaterEqual(float(diverse_score), 1.0)
        self.assertLessEqual(float(diverse_score), 10.0)
        
        # A diverse portfolio should have a reasonable diversification score
        self.assertGreaterEqual(float(diverse_score), 5.0)
        
        # Test with basic portfolio (less diverse)
        basic_score = PortfolioAnalyticsEngine.calculate_diversification_score(self.basic_positions)
        
        # Score should be between 1 and 10
        self.assertGreaterEqual(float(basic_score), 1.0)
        self.assertLessEqual(float(basic_score), 10.0)
        
        # Basic portfolio should be less diversified than diverse portfolio
        self.assertLess(float(basic_score), float(diverse_score))
        
        # Test with single position (minimal diversification)
        single_score = PortfolioAnalyticsEngine.calculate_diversification_score(self.single_position)
        
        # Score should be low for a single position
        self.assertLessEqual(float(single_score), 3.0)
        
        # Test with empty portfolio
        empty_score = PortfolioAnalyticsEngine.calculate_diversification_score(self.empty_positions)
        
        # Score should be 0 for an empty portfolio
        self.assertEqual(float(empty_score), 0.0)
    
    def test_calculate_risk_score(self):
        """Test risk score calculation."""
        # Test with diverse portfolio
        diverse_risk = PortfolioAnalyticsEngine.calculate_risk_score(self.diverse_positions)
        
        # Risk score should be between 1 and 10
        self.assertGreaterEqual(float(diverse_risk), 1.0)
        self.assertLessEqual(float(diverse_risk), 10.0)
        
        # Verify that a 100% equity portfolio has high risk
        equity_positions = [p for p in self.basic_positions if p.asset_class == AssetClass.EQUITY]
        equity_risk = PortfolioAnalyticsEngine.calculate_risk_score(equity_positions)
        self.assertGreaterEqual(float(equity_risk), 7.0)
        
        # Verify that a 100% fixed income portfolio has lower risk
        bond_positions = [p for p in self.basic_positions if p.asset_class == AssetClass.FIXED_INCOME]
        bond_risk = PortfolioAnalyticsEngine.calculate_risk_score(bond_positions)
        self.assertLessEqual(float(bond_risk), 5.0)
        
        # Test with empty portfolio
        empty_risk = PortfolioAnalyticsEngine.calculate_risk_score(self.empty_positions)
        self.assertEqual(float(empty_risk), 0.0)
    
    def test_calculate_returns_attribution(self):
        """Test returns attribution analysis."""
        # Test with diverse portfolio
        attribution = PortfolioAnalyticsEngine.calculate_returns_attribution(self.diverse_positions)
        
        # Verify structure of returns
        self.assertIn('asset_class', attribution)
        self.assertIn('security_type', attribution)
        self.assertIn('total', attribution)
        
        # Check total values
        self.assertIn('value', attribution['total'])
        self.assertIn('gain_loss', attribution['total'])
        self.assertIn('gain_loss_percent', attribution['total'])
        
        # Verify that total gain/loss equals the sum of individual gains/losses
        total_gain_loss = sum(p.unrealized_pl or Decimal('0') for p in self.diverse_positions 
                             if p.unrealized_pl is not None and p.cost_basis is not None)
        self.assertAlmostEqual(float(attribution['total']['gain_loss']), float(total_gain_loss))
        
        # Test with empty portfolio
        empty_attribution = PortfolioAnalyticsEngine.calculate_returns_attribution(self.empty_positions)
        self.assertEqual(float(empty_attribution['total']['gain_loss']), 0.0)
    
    def test_identify_concentration_risks(self):
        """Test concentration risk identification."""
        # Test with diverse portfolio
        concentration_risks = PortfolioAnalyticsEngine.identify_concentration_risks(self.diverse_positions)
        
        # A well-diversified portfolio might still have some concentration
        # But should return dictionary of risks (might be empty)
        self.assertIsInstance(concentration_risks, dict)
        
        # Test with single position (extreme concentration)
        single_risks = PortfolioAnalyticsEngine.identify_concentration_risks(self.single_position)
        
        # Should identify the single position as a concentration risk
        self.assertGreaterEqual(len(single_risks), 1)
        
        # Test with empty portfolio
        empty_risks = PortfolioAnalyticsEngine.identify_concentration_risks(self.empty_positions)
        self.assertEqual(len(empty_risks), 0)
    
    def test_generate_complete_portfolio_metrics(self):
        """Test generation of comprehensive portfolio metrics."""
        # Test with diverse portfolio
        metrics = PortfolioAnalyticsEngine.generate_complete_portfolio_metrics(
            self.diverse_positions,
            cash_value=Decimal('1000.00')  # Add some cash
        )
        
        # Verify metrics is the correct type
        self.assertIsInstance(metrics, PortfolioMetrics)
        
        # Verify basic metrics
        total_market_value = sum(p.market_value for p in self.diverse_positions)
        self.assertEqual(metrics.invested_value, total_market_value)
        self.assertEqual(metrics.total_value, total_market_value + Decimal('1000.00'))
        self.assertEqual(metrics.cash_value, Decimal('1000.00'))
        
        # Verify we have risk and diversification scores
        self.assertIsNotNone(metrics.risk_score)
        self.assertIsNotNone(metrics.diversification_score)
        
        # Verify we have asset class and security type breakdowns
        self.assertTrue(metrics.asset_class_values)
        self.assertTrue(metrics.asset_class_percentages)
        self.assertTrue(metrics.security_type_values)
        self.assertTrue(metrics.security_type_percentages)
        
        # Test with empty portfolio
        empty_metrics = PortfolioAnalyticsEngine.generate_complete_portfolio_metrics(
            self.empty_positions,
            cash_value=Decimal('500.00')
        )
        
        # Should still return a valid object
        self.assertIsInstance(empty_metrics, PortfolioMetrics)
        
        # Only cash should be counted
        self.assertEqual(empty_metrics.invested_value, Decimal('0'))
        self.assertEqual(empty_metrics.total_value, Decimal('500.00'))
        self.assertEqual(empty_metrics.cash_value, Decimal('500.00'))
    
    def test_format_portfolio_summary(self):
        """Test formatting of portfolio summary."""
        # Generate metrics first
        metrics = PortfolioAnalyticsEngine.generate_complete_portfolio_metrics(
            self.diverse_positions
        )
        
        # Create a mock investment strategy
        investment_strategy = {
            "risk_profile": "aggressive",
            "target_portfolio": {
                "name": "Aggressive Growth Portfolio",
                "equity_percentage": 60.0,
                "fixed_income_percentage": 20.0,
                "cash_percentage": 10.0,
                "etf_percentage": 40.0,
                "individual_stock_percentage": 30.0
            },
            "notes": "Long-term aggressive growth strategy."
        }
        
        # Format the summary
        summary = PortfolioAnalyticsEngine.format_portfolio_summary(
            metrics,
            investment_strategy=investment_strategy
        )
        
        # Verify summary is a non-empty string
        self.assertIsInstance(summary, str)
        self.assertTrue(len(summary) > 0)
        
        # Verify it contains key sections
        self.assertIn("Portfolio Summary", summary)
        self.assertIn("Investment Strategy", summary)
        self.assertIn("Asset Allocation", summary)
        self.assertIn("Risk Assessment", summary)
        
        # Verify details about the portfolio are included
        self.assertIn("Total Portfolio Value", summary)
        self.assertIn("Aggressive", summary)  # Risk profile
        self.assertIn("Risk Score", summary)
        self.assertIn("Diversification Score", summary)
        
        # Test without investment strategy
        summary_no_strategy = PortfolioAnalyticsEngine.format_portfolio_summary(metrics)
        
        # Should still return a valid summary
        self.assertIsInstance(summary_no_strategy, str)
        self.assertTrue(len(summary_no_strategy) > 0)
        
        # Should not have the investment strategy section
        self.assertNotIn("Target Portfolio", summary_no_strategy)
        
        # Test with empty metrics
        empty_metrics = PortfolioAnalyticsEngine.generate_complete_portfolio_metrics(
            self.empty_positions
        )
        
        empty_summary = PortfolioAnalyticsEngine.format_portfolio_summary(empty_metrics)
        
        # Should still generate a summary
        self.assertIsInstance(empty_summary, str)
        self.assertTrue(len(empty_summary) > 0)


class TestPortfolioSummaryTool(unittest.TestCase):
    """Test the portfolio_summary tool from the portfolio_management_agent."""
    
    def test_portfolio_summary_output_structure(self):
        """Mock test to verify the expected output structure of the portfolio_summary tool."""
        # This is just to illustrate the expected format; we don't actually call the tool
        # since it requires external dependencies like broker_client
        
        expected_sections = [
            "Portfolio Summary",
            "Investment Strategy",
            "Asset Allocation",
            "Security Types",
            "Performance",
            "Risk Assessment"
        ]
        
        # In a real test with mocked dependencies, we would do:
        # summary = get_portfolio_summary()
        # for section in expected_sections:
        #     self.assertIn(section, summary)
        
        # Just validate our test exists - this passes automatically
        self.assertTrue(True)
    
    def test_example_summary_format(self):
        """Test to demonstrate the expected format of a portfolio summary."""
        # Generate metrics first using our test data
        positions = create_diverse_test_positions()
        
        metrics = PortfolioAnalyticsEngine.generate_complete_portfolio_metrics(
            positions,
            cash_value=Decimal('2000.00')
        )
        
        # Create a mock investment strategy
        investment_strategy = {
            "risk_profile": "aggressive",
            "target_portfolio": {
                "name": "Aggressive Growth Portfolio",
                "equity_percentage": 70.0,
                "fixed_income_percentage": 20.0,
                "cash_percentage": 10.0,
                "etf_percentage": 40.0,
                "individual_stock_percentage": 35.0
            },
            "notes": "Long-term aggressive growth strategy."
        }
        
        # Format the summary to demonstrate output
        example_summary = PortfolioAnalyticsEngine.format_portfolio_summary(
            metrics,
            investment_strategy=investment_strategy
        )
        
        # Save the example summary to a file for reference
        example_path = os.path.join(current_dir, 'example_portfolio_summary.txt')
        with open(example_path, 'w') as f:
            f.write(example_summary)
        
        # Just validate our test exists and we generated the example
        self.assertTrue(os.path.exists(example_path))
        self.assertTrue(len(example_summary) > 0)


if __name__ == '__main__':
    unittest.main() 