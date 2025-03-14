#!/usr/bin/env python3
"""
Unit tests for portfolio_types.py module.
Tests the type definitions and portfolio creation functions.
"""

import unittest
from decimal import Decimal
import sys
import os

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, RiskProfile, AssetAllocation, TargetPortfolio
)


class TestAssetAllocation(unittest.TestCase):
    """Tests for the AssetAllocation class."""
    
    def test_valid_allocation(self):
        """Test creating a valid asset allocation."""
        allocation = AssetAllocation(
            percentage=60.0,
            security_allocations={
                SecurityType.ETF: 70.0,
                SecurityType.INDIVIDUAL_STOCK: 30.0
            }
        )
        self.assertEqual(allocation.percentage, 60.0)
        self.assertEqual(allocation.security_allocations[SecurityType.ETF], 70.0)
        self.assertEqual(allocation.security_allocations[SecurityType.INDIVIDUAL_STOCK], 30.0)
    
    def test_empty_security_allocations(self):
        """Test creating an allocation with no security allocations."""
        allocation = AssetAllocation(percentage=100.0)
        self.assertEqual(allocation.percentage, 100.0)
        self.assertEqual(allocation.security_allocations, {})
    
    def test_invalid_percentage(self):
        """Test creating an allocation with invalid percentage."""
        with self.assertRaises(ValueError):
            AssetAllocation(percentage=110.0)
        
        with self.assertRaises(ValueError):
            AssetAllocation(percentage=-10.0)
    
    def test_invalid_security_allocations(self):
        """Test creating an allocation with invalid security allocations."""
        with self.assertRaises(ValueError):
            AssetAllocation(
                percentage=50.0,
                security_allocations={
                    SecurityType.ETF: 80.0,
                    SecurityType.INDIVIDUAL_STOCK: 30.0  # Sums to 110%
                }
            )


class TestTargetPortfolio(unittest.TestCase):
    """Tests for the TargetPortfolio class."""
    
    def test_valid_portfolio(self):
        """Test creating a valid target portfolio."""
        equity_allocation = AssetAllocation(
            percentage=60.0,
            security_allocations={
                SecurityType.ETF: 70.0,
                SecurityType.INDIVIDUAL_STOCK: 30.0
            }
        )
        
        fixed_income_allocation = AssetAllocation(
            percentage=40.0,
            security_allocations={
                SecurityType.ETF: 80.0,
                SecurityType.BOND: 20.0
            }
        )
        
        portfolio = TargetPortfolio(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation,
                AssetClass.FIXED_INCOME: fixed_income_allocation
            },
            risk_profile=RiskProfile.MODERATE,
            name="Test Portfolio"
        )
        
        self.assertEqual(portfolio.name, "Test Portfolio")
        self.assertEqual(portfolio.risk_profile, RiskProfile.MODERATE)
        self.assertEqual(len(portfolio.asset_allocations), 2)
        self.assertEqual(portfolio.asset_allocations[AssetClass.EQUITY].percentage, 60.0)
        self.assertEqual(portfolio.asset_allocations[AssetClass.FIXED_INCOME].percentage, 40.0)
    
    def test_invalid_total_allocation(self):
        """Test creating a portfolio with invalid total allocation."""
        equity_allocation = AssetAllocation(percentage=60.0)
        fixed_income_allocation = AssetAllocation(percentage=50.0)  # Total is 110%
        
        with self.assertRaises(ValueError):
            TargetPortfolio(
                asset_allocations={
                    AssetClass.EQUITY: equity_allocation,
                    AssetClass.FIXED_INCOME: fixed_income_allocation
                },
                risk_profile=RiskProfile.MODERATE
            )
    
    def test_get_etf_allocation(self):
        """Test getting ETF allocation percentage."""
        # Create a portfolio with 60% equity (of which 80% is ETFs) and 
        # 40% fixed income (of which 100% is ETFs)
        equity_allocation = AssetAllocation(
            percentage=60.0,
            security_allocations={
                SecurityType.ETF: 80.0,
                SecurityType.INDIVIDUAL_STOCK: 20.0
            }
        )
        
        fixed_income_allocation = AssetAllocation(
            percentage=40.0,
            security_allocations={
                SecurityType.ETF: 100.0
            }
        )
        
        portfolio = TargetPortfolio(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation,
                AssetClass.FIXED_INCOME: fixed_income_allocation
            },
            risk_profile=RiskProfile.MODERATE
        )
        
        # Expected: (60% * 80%) + (40% * 100%) = 48% + 40% = 88%
        self.assertEqual(portfolio.get_etf_allocation(), 88.0)
    
    def test_get_individual_stocks_allocation(self):
        """Test getting individual stocks allocation percentage."""
        # Create a portfolio with 80% equity (of which 25% is individual stocks)
        # and 20% fixed income (of which 0% is individual stocks)
        equity_allocation = AssetAllocation(
            percentage=80.0,
            security_allocations={
                SecurityType.ETF: 75.0,
                SecurityType.INDIVIDUAL_STOCK: 25.0
            }
        )
        
        fixed_income_allocation = AssetAllocation(
            percentage=20.0,
            security_allocations={
                SecurityType.ETF: 100.0
            }
        )
        
        portfolio = TargetPortfolio(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation,
                AssetClass.FIXED_INCOME: fixed_income_allocation
            },
            risk_profile=RiskProfile.MODERATE
        )
        
        # Expected: (80% * 25%) + (20% * 0%) = 20%
        self.assertEqual(portfolio.get_individual_stocks_allocation(), 20.0)
    
    def test_create_aggressive_growth_portfolio(self):
        """Test creating an aggressive growth portfolio."""
        portfolio = TargetPortfolio.create_aggressive_growth_portfolio()
        
        self.assertEqual(portfolio.name, "Aggressive Growth Portfolio")
        self.assertEqual(portfolio.risk_profile, RiskProfile.AGGRESSIVE)
        self.assertEqual(len(portfolio.asset_allocations), 1)
        self.assertEqual(list(portfolio.asset_allocations.keys())[0], AssetClass.EQUITY)
        self.assertEqual(portfolio.asset_allocations[AssetClass.EQUITY].percentage, 100.0)
        self.assertEqual(portfolio.get_etf_allocation(), 50.0)
        self.assertEqual(portfolio.get_individual_stocks_allocation(), 50.0)
    
    def test_create_balanced_portfolio(self):
        """Test creating a balanced portfolio."""
        portfolio = TargetPortfolio.create_balanced_portfolio()
        
        self.assertEqual(portfolio.name, "Balanced Portfolio")
        self.assertEqual(portfolio.risk_profile, RiskProfile.MODERATE)
        self.assertEqual(len(portfolio.asset_allocations), 2)
        self.assertIn(AssetClass.EQUITY, portfolio.asset_allocations)
        self.assertIn(AssetClass.FIXED_INCOME, portfolio.asset_allocations)
        self.assertEqual(portfolio.asset_allocations[AssetClass.EQUITY].percentage, 60.0)
        self.assertEqual(portfolio.asset_allocations[AssetClass.FIXED_INCOME].percentage, 40.0)
    
    def test_create_conservative_portfolio(self):
        """Test creating a conservative portfolio."""
        portfolio = TargetPortfolio.create_conservative_portfolio()
        
        self.assertEqual(portfolio.name, "Conservative Portfolio")
        self.assertEqual(portfolio.risk_profile, RiskProfile.CONSERVATIVE)
        self.assertEqual(len(portfolio.asset_allocations), 3)
        self.assertIn(AssetClass.EQUITY, portfolio.asset_allocations)
        self.assertIn(AssetClass.FIXED_INCOME, portfolio.asset_allocations)
        self.assertIn(AssetClass.CASH, portfolio.asset_allocations)
        self.assertEqual(portfolio.asset_allocations[AssetClass.EQUITY].percentage, 30.0)
        self.assertEqual(portfolio.asset_allocations[AssetClass.FIXED_INCOME].percentage, 60.0)
        self.assertEqual(portfolio.asset_allocations[AssetClass.CASH].percentage, 10.0)


if __name__ == "__main__":
    unittest.main() 