#!/usr/bin/env python3
"""
Comprehensive tests for portfolio analytics refresh functionality.

This test suite validates that risk and diversification scores update correctly
when portfolio composition changes, addressing the user's issue where scores
weren't updating properly after adding ETFs and bond ETFs.

Tests cover:
1. Risk score changes when adding/removing different asset types
2. Diversification score changes when portfolio composition changes
3. ETF addition impact on both scores
4. Bond ETF addition impact on risk scores
5. Position size changes impact on scores
6. Edge cases and boundary conditions
"""

import unittest
import sys
import os
from decimal import Decimal
from typing import List

# Add project root to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

from clera_agents.tools.portfolio_analysis import (
    PortfolioPosition, 
    PortfolioAnalyticsEngine
)
from clera_agents.types.portfolio_types import AssetClass, SecurityType


class TestAnalyticsRefreshFunctionality(unittest.TestCase):
    """Test that analytics scores update correctly when portfolio changes."""
    
    def create_test_position(self, symbol: str, asset_class: AssetClass, 
                           security_type: SecurityType, market_value: Decimal) -> PortfolioPosition:
        """Helper to create test portfolio positions."""
        return PortfolioPosition(
            symbol=symbol,
            asset_class=asset_class,
            security_type=security_type,
            market_value=market_value,
            cost_basis=market_value,  # Assume no gain/loss for testing
            unrealized_pl=Decimal('0'),
            quantity=Decimal('100'),
            current_price=market_value / Decimal('100')
        )
    
    def test_risk_score_changes_with_asset_addition(self):
        """Test that risk scores change when adding different asset types."""
        
        # Start with a single high-risk stock
        initial_positions = [
            self.create_test_position('AAPL', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('10000'))
        ]
        
        initial_risk = PortfolioAnalyticsEngine.calculate_risk_score(initial_positions)
        
        # Add a low-risk bond ETF
        with_bond_positions = initial_positions + [
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('10000'))
        ]
        
        with_bond_risk = PortfolioAnalyticsEngine.calculate_risk_score(with_bond_positions)
        
        # Risk score should decrease when adding bonds
        self.assertLess(
            with_bond_risk, 
            initial_risk,
            "Risk score should decrease when adding bond ETFs to a stock portfolio"
        )
        
        # The difference should be meaningful (at least 0.5 points)
        self.assertGreaterEqual(
            initial_risk - with_bond_risk,
            Decimal('0.5'),
            "Risk score change should be meaningful when adding significant bond allocation"
        )
    
    def test_diversification_score_changes_with_etf_addition(self):
        """Test that diversification scores change when adding ETFs."""
        
        # Start with a single stock (poor diversification)
        single_stock_positions = [
            self.create_test_position('AAPL', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('10000'))
        ]
        
        single_stock_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(single_stock_positions)
        
        # Add a broad market ETF
        with_broad_etf_positions = single_stock_positions + [
            self.create_test_position('SPY', AssetClass.EQUITY, SecurityType.ETF, Decimal('10000'))
        ]
        
        with_broad_etf_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(with_broad_etf_positions)
        
        # Diversification should improve when adding broad market ETF
        self.assertGreater(
            with_broad_etf_diversification,
            single_stock_diversification,
            "Diversification score should increase when adding broad market ETF"
        )
        
        # Add different asset class ETFs
        multi_asset_positions = with_broad_etf_positions + [
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('5000')),
            self.create_test_position('VNQ', AssetClass.REAL_ESTATE, SecurityType.ETF, Decimal('3000')),
            self.create_test_position('GLD', AssetClass.COMMODITIES, SecurityType.ETF, Decimal('2000'))
        ]
        
        multi_asset_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(multi_asset_positions)
        
        # Diversification should further improve with multiple asset classes
        self.assertGreater(
            multi_asset_diversification,
            with_broad_etf_diversification,
            "Diversification score should increase when adding multiple asset class ETFs"
        )
    
    def test_score_changes_with_position_size_changes(self):
        """Test that scores change when position sizes change."""
        
        # Create a balanced portfolio
        balanced_positions = [
            self.create_test_position('SPY', AssetClass.EQUITY, SecurityType.ETF, Decimal('5000')),
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('5000'))
        ]
        
        balanced_risk = PortfolioAnalyticsEngine.calculate_risk_score(balanced_positions)
        balanced_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(balanced_positions)
        
        # Create a concentrated equity portfolio (same symbols, different weights)
        concentrated_positions = [
            self.create_test_position('SPY', AssetClass.EQUITY, SecurityType.ETF, Decimal('9000')),
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('1000'))
        ]
        
        concentrated_risk = PortfolioAnalyticsEngine.calculate_risk_score(concentrated_positions)
        concentrated_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(concentrated_positions)
        
        # Risk should be higher when more concentrated in equity
        self.assertGreater(
            concentrated_risk,
            balanced_risk,
            "Risk score should increase when portfolio is more concentrated in equity"
        )
        
        # Diversification should be lower when more concentrated
        self.assertLess(
            concentrated_diversification,
            balanced_diversification,
            "Diversification score should decrease when portfolio is more concentrated"
        )
    
    def test_sector_etf_vs_broad_etf_impact(self):
        """Test different impact of sector ETFs vs broad market ETFs."""
        
        # Portfolio with broad market ETF
        broad_etf_positions = [
            self.create_test_position('SPY', AssetClass.EQUITY, SecurityType.ETF, Decimal('10000'))
        ]
        
        # Portfolio with sector ETF (same total value)
        sector_etf_positions = [
            self.create_test_position('XLK', AssetClass.EQUITY, SecurityType.ETF, Decimal('10000'))
        ]
        
        broad_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(broad_etf_positions)
        sector_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(sector_etf_positions)
        
        # Both should be similar since they're single positions
        # But this tests that the scoring system recognizes ETFs appropriately
        self.assertEqual(
            broad_diversification,
            sector_diversification,
            "Single ETF positions should have similar diversification scores regardless of type"
        )
        
        # Now test with multiple positions
        broad_multi_positions = [
            self.create_test_position('SPY', AssetClass.EQUITY, SecurityType.ETF, Decimal('5000')),
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('5000'))
        ]
        
        sector_multi_positions = [
            self.create_test_position('XLK', AssetClass.EQUITY, SecurityType.ETF, Decimal('2500')),
            self.create_test_position('XLF', AssetClass.EQUITY, SecurityType.ETF, Decimal('2500')),
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('5000'))
        ]
        
        broad_multi_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(broad_multi_positions)
        sector_multi_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(sector_multi_positions)
        
        # Sector portfolio might have slightly better diversification due to more positions
        # This tests that the system properly accounts for position count
        self.assertGreaterEqual(
            sector_multi_diversification,
            broad_multi_diversification,
            "Multiple sector ETFs should provide equal or better diversification than single broad ETF"
        )
    
    def test_progressive_portfolio_building(self):
        """Test scores as portfolio is progressively built up."""
        
        # Track score changes as we build the portfolio
        portfolios = []
        risk_scores = []
        diversification_scores = []
        
        # 1. Start with cash equivalent
        portfolios.append([
            self.create_test_position('CASH', AssetClass.CASH, SecurityType.MONEY_MARKET, Decimal('10000'))
        ])
        
        # 2. Add broad market ETF
        portfolios.append(portfolios[-1] + [
            self.create_test_position('SPY', AssetClass.EQUITY, SecurityType.ETF, Decimal('10000'))
        ])
        
        # 3. Add bond ETF
        portfolios.append(portfolios[-1] + [
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('5000'))
        ])
        
        # 4. Add real estate ETF
        portfolios.append(portfolios[-1] + [
            self.create_test_position('VNQ', AssetClass.REAL_ESTATE, SecurityType.ETF, Decimal('3000'))
        ])
        
        # 5. Add international ETF
        portfolios.append(portfolios[-1] + [
            self.create_test_position('VEA', AssetClass.EQUITY, SecurityType.ETF, Decimal('4000'))
        ])
        
        # 6. Add individual stock
        portfolios.append(portfolios[-1] + [
            self.create_test_position('AAPL', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('3000'))
        ])
        
        # Calculate scores for each portfolio stage
        for portfolio in portfolios:
            risk_scores.append(PortfolioAnalyticsEngine.calculate_risk_score(portfolio))
            diversification_scores.append(PortfolioAnalyticsEngine.calculate_diversification_score(portfolio))
        
        # Test that each addition changes the scores meaningfully
        for i in range(1, len(portfolios)):
            with self.subTest(stage=i):
                # Scores should change when adding new positions
                self.assertNotEqual(
                    risk_scores[i],
                    risk_scores[i-1],
                    f"Risk score should change when adding position at stage {i}"
                )
                
                if i <= 4:  # Until we add individual stock
                    # Diversification should generally improve when adding different asset classes
                    self.assertGreaterEqual(
                        diversification_scores[i],
                        diversification_scores[i-1],
                        f"Diversification should improve or stay same when adding asset class at stage {i}"
                    )
    
    def test_empty_portfolio_handling(self):
        """Test that empty portfolios are handled correctly."""
        
        empty_positions = []
        
        risk_score = PortfolioAnalyticsEngine.calculate_risk_score(empty_positions)
        diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(empty_positions)
        
        # Empty portfolio should have zero scores
        self.assertEqual(risk_score, Decimal('0'))
        self.assertEqual(diversification_score, Decimal('0'))
    
    def test_single_position_vs_multiple_positions(self):
        """Test score differences between single and multiple positions."""
        
        # Single large position
        single_position = [
            self.create_test_position('AAPL', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('10000'))
        ]
        
        # Multiple smaller positions (same total value)
        multiple_positions = [
            self.create_test_position('AAPL', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('2500')),
            self.create_test_position('MSFT', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('2500')),
            self.create_test_position('GOOGL', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('2500')),
            self.create_test_position('AMZN', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('2500'))
        ]
        
        single_risk = PortfolioAnalyticsEngine.calculate_risk_score(single_position)
        single_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(single_position)
        
        multiple_risk = PortfolioAnalyticsEngine.calculate_risk_score(multiple_positions)
        multiple_diversification = PortfolioAnalyticsEngine.calculate_diversification_score(multiple_positions)
        
        # Risk should be similar (same asset class and security type)
        # But diversification should be better with multiple positions
        self.assertGreater(
            multiple_diversification,
            single_diversification,
            "Multiple positions should provide better diversification than single position"
        )
    
    def test_score_precision_and_consistency(self):
        """Test that scores are calculated with appropriate precision and are consistent."""
        
        test_positions = [
            self.create_test_position('SPY', AssetClass.EQUITY, SecurityType.ETF, Decimal('5000')),
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('3000')),
            self.create_test_position('VNQ', AssetClass.REAL_ESTATE, SecurityType.ETF, Decimal('2000'))
        ]
        
        # Calculate scores multiple times
        risk_scores = []
        diversification_scores = []
        
        for _ in range(5):
            risk_scores.append(PortfolioAnalyticsEngine.calculate_risk_score(test_positions))
            diversification_scores.append(PortfolioAnalyticsEngine.calculate_diversification_score(test_positions))
        
        # All calculations should be identical (deterministic)
        for i in range(1, len(risk_scores)):
            self.assertEqual(
                risk_scores[i],
                risk_scores[0],
                "Risk score calculations should be deterministic"
            )
            self.assertEqual(
                diversification_scores[i],
                diversification_scores[0],
                "Diversification score calculations should be deterministic"
            )
        
        # Scores should be within reasonable ranges
        self.assertGreaterEqual(risk_scores[0], Decimal('0'))
        self.assertLessEqual(risk_scores[0], Decimal('10'))
        self.assertGreaterEqual(diversification_scores[0], Decimal('0'))
        self.assertLessEqual(diversification_scores[0], Decimal('10'))
    
    def test_extreme_portfolio_compositions(self):
        """Test score behavior with extreme portfolio compositions."""
        
        # Extremely conservative portfolio (all cash and bonds)
        conservative_positions = [
            self.create_test_position('CASH', AssetClass.CASH, SecurityType.MONEY_MARKET, Decimal('5000')),
            self.create_test_position('AGG', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('3000')),
            self.create_test_position('TIP', AssetClass.FIXED_INCOME, SecurityType.ETF, Decimal('2000'))
        ]
        
        # Extremely aggressive portfolio (all individual stocks and options)
        aggressive_positions = [
            self.create_test_position('TSLA', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('3000')),
            self.create_test_position('GME', AssetClass.EQUITY, SecurityType.INDIVIDUAL_STOCK, Decimal('3000')),
            self.create_test_position('OPTS', AssetClass.ALTERNATIVES, SecurityType.OPTIONS, Decimal('4000'))
        ]
        
        conservative_risk = PortfolioAnalyticsEngine.calculate_risk_score(conservative_positions)
        aggressive_risk = PortfolioAnalyticsEngine.calculate_risk_score(aggressive_positions)
        
        # Aggressive portfolio should have significantly higher risk
        self.assertGreater(
            aggressive_risk,
            conservative_risk,
            "Aggressive portfolio should have higher risk score than conservative portfolio"
        )
        
        # The difference should be substantial
        self.assertGreaterEqual(
            aggressive_risk - conservative_risk,
            Decimal('3.0'),
            "Risk score difference between aggressive and conservative portfolios should be substantial"
        )


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)