#!/usr/bin/env python3
"""
Isolated test script for the portfolio analysis functionality.
This script creates test data and calls the PortfolioAnalyzer directly
without importing through the main application.
"""

import os
import sys
from decimal import Decimal
from typing import List, Dict, Optional
from enum import Enum
from dataclasses import dataclass
import uuid

# Add the project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(current_dir)
sys.path.insert(0, project_root)

# Directly import the classes we need
# First import portfolio_types
from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio, RiskProfile
)

# Then import the tools
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


def create_test_positions() -> List[MockPosition]:
    """Create a diverse set of test positions to simulate an actual portfolio."""
    return [
        # Apple - Tech stock
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
        # Microsoft - Tech stock
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
        # S&P 500 ETF - Broad market ETF
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
        # Bond ETF - Fixed income
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


def create_sample_positions() -> List[MockPosition]:
    """
    Create the exact sample positions as provided in the example.
    """
    return [
        # Apple 
        MockPosition(
            symbol='AAPL',
            qty='8',
            current_price='237.0981',
            market_value='1896.7848',
            cost_basis='1917.76',
            avg_entry_price='239.72',
            unrealized_pl='-20.9752',
            unrealized_plpc='-0.0109373435674954',
        ),
        # Nvidia
        MockPosition(
            symbol='NVDA',
            qty='1',
            current_price='120.94',
            market_value='120.94',
            cost_basis='122.76',
            avg_entry_price='122.76',
            unrealized_pl='-1.82',
            unrealized_plpc='-0.0148256761159987',
        )
    ]


def test_portfolio_analyzer_and_rebalance():
    """
    Test the portfolio analysis and rebalancing functionality directly.
    This bypasses the agent structure and calls the underlying functionality.
    """
    print("Testing portfolio analysis and rebalancing with the new file structure\n")

    try:
        # Create test portfolios
        test_portfolios = [
            {
                "name": "Diverse Portfolio",
                "positions": create_test_positions(),
            },
            {
                "name": "Sample Portfolio",
                "positions": create_sample_positions(),
            },
        ]
        
        for portfolio in test_portfolios:
            print(f"{'=' * 80}")
            print(f"PORTFOLIO: {portfolio['name']}")
            print(f"{'=' * 80}")
            
            # Convert the mock positions to PortfolioPosition objects
            positions = [
                PortfolioPosition.from_alpaca_position(position) 
                for position in portfolio['positions']
            ]
            
            # Run portfolio analysis
            analysis = PortfolioAnalyzer.analyze_portfolio(positions)
            
            # Print analysis results
            print("\nPortfolio Analysis Results:")
            print(f"Total Value: ${analysis['total_value']:,.2f}")
            print("\nAsset Class Breakdown:")
            for asset_class, percentage in analysis['asset_class_percentages'].items():
                if percentage > 0:
                    print(f"  {asset_class.value.title()}: {float(percentage):.2f}%")
            
            print("\nSecurity Type Breakdown:")
            for security_type, percentage in analysis['security_type_percentages'].items():
                if percentage > 0:
                    print(f"  {security_type.value.replace('_', ' ').title()}: {float(percentage):.2f}%")
            
            # Test with different portfolio types
            for portfolio_type in ["aggressive", "balanced", "conservative"]:
                # Get the target portfolio for rebalancing
                if portfolio_type == "balanced":
                    target = TargetPortfolio.create_balanced_portfolio()
                elif portfolio_type == "conservative":
                    target = TargetPortfolio.create_conservative_portfolio()
                else:
                    target = TargetPortfolio.create_aggressive_growth_portfolio()
                
                print(f"\n{'-' * 60}")
                print(f"{portfolio_type.upper()} PORTFOLIO REBALANCING:")
                print(f"{'-' * 60}")
                
                # Generate rebalance instructions
                instructions = PortfolioAnalyzer.generate_rebalance_instructions(
                    positions=positions,
                    target_portfolio=target
                )
                
                # Print rebalancing instructions
                print(instructions)
                
        print("\nAll tests completed successfully!")
        
    except Exception as e:
        print(f"Error during testing: {type(e).__name__}: {e}")


if __name__ == "__main__":
    test_portfolio_analyzer_and_rebalance() 