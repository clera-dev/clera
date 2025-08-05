#!/usr/bin/env python3
"""
Test script for portfolio management functionality.
This simulates portfolio positions and tests the rebalancing logic.
"""

import json
from decimal import Decimal
from dataclasses import dataclass
from typing import List, Optional

# Updated imports to work from the tests subdirectory
from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio, RiskProfile
)
from clera_agents.tools.portfolio_analysis import (
    PortfolioPosition, PortfolioAnalyzer
)


@dataclass
class MockPosition:
    """Mock Alpaca position for testing."""
    symbol: str
    qty: str
    current_price: str
    market_value: str
    cost_basis: str
    avg_entry_price: str
    unrealized_pl: str
    unrealized_plpc: str
    
    # Add any other attributes that are accessed in the code


def create_test_positions() -> List[MockPosition]:
    """Create a set of test positions that simulate Alpaca API response."""
    return [
        MockPosition(
            symbol='AAPL',
            qty='10',
            current_price='200.00',
            market_value='2000.00',
            cost_basis='1900.00',
            avg_entry_price='190.00',
            unrealized_pl='100.00',
            unrealized_plpc='0.0526315789'
        ),
        MockPosition(
            symbol='MSFT',
            qty='5',
            current_price='400.00',
            market_value='2000.00',
            cost_basis='1850.00',
            avg_entry_price='370.00',
            unrealized_pl='150.00',
            unrealized_plpc='0.0810810811'
        ),
        MockPosition(
            symbol='SPY',
            qty='4',
            current_price='500.00',
            market_value='2000.00',
            cost_basis='1800.00',
            avg_entry_price='450.00',
            unrealized_pl='200.00',
            unrealized_plpc='0.1111111111'
        ),
        # Add a fixed income ETF
        MockPosition(
            symbol='AGG',
            qty='20',
            current_price='100.00',
            market_value='2000.00',
            cost_basis='2100.00',
            avg_entry_price='105.00',
            unrealized_pl='-100.00',
            unrealized_plpc='-0.0476190476'
        ),
    ]


def test_portfolio_analyzer():
    """Test portfolio analysis and rebalancing instructions."""
    # Create test positions
    mock_positions = create_test_positions()
    
    # Convert to our internal PortfolioPosition format
    positions = [PortfolioPosition.from_alpaca_position(pos) for pos in mock_positions]
    
    # Run basic portfolio analysis
    analysis = PortfolioAnalyzer.analyze_portfolio(positions)
    
    print("Portfolio Analysis Results:")
    print(f"Total Value: ${analysis['total_value']:,.2f}")
    print("Asset Class Breakdown:")
    for asset_class, percentage in analysis['asset_class_percentages'].items():
        if percentage > 0:
            print(f"  {asset_class.value.title()}: {percentage:.2f}%")
    
    print("\nSecurity Type Breakdown:")
    for security_type, percentage in analysis['security_type_percentages'].items():
        if percentage > 0:
            print(f"  {security_type.value.title()}: {percentage:.2f}%")


def test_rebalance_instructions():
    """Test generating rebalance instructions for different target portfolios."""
    # Create test positions
    mock_positions = create_test_positions()
    
    # Convert to our internal PortfolioPosition format
    positions = [PortfolioPosition.from_alpaca_position(pos) for pos in mock_positions]
    
    # Test with different portfolio types
    portfolio_types = [
        ("Aggressive", TargetPortfolio.create_aggressive_growth_portfolio()),
        ("Balanced", TargetPortfolio.create_balanced_portfolio()),
        ("Conservative", TargetPortfolio.create_conservative_portfolio())
    ]
    
    for name, portfolio in portfolio_types:
        print(f"\n{'-'*80}")
        print(f"{name} Portfolio Rebalancing:")
        print(f"{'-'*80}")
        
        instructions = PortfolioAnalyzer.generate_rebalance_instructions(
            positions=positions,
            target_portfolio=portfolio
        )
        
        print(instructions)


if __name__ == "__main__":
    print("\n" + "="*80)
    print("PORTFOLIO ANALYZER TEST")
    print("="*80)
    test_portfolio_analyzer()
    
    print("\n" + "="*80)
    print("REBALANCE INSTRUCTIONS TEST")
    print("="*80)
    test_rebalance_instructions() 