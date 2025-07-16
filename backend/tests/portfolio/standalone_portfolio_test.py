#!/usr/bin/env python3
"""
Standalone test script for portfolio analysis functionality.
This script contains all necessary classes and logic to test portfolio 
rebalancing without importing from the clera_agents package.
"""

import os
import sys
from decimal import Decimal
from typing import List, Dict, Any, Optional, Union, Tuple
from enum import Enum
from dataclasses import dataclass
import uuid

# ================= Enum Definitions =================

class AssetClass(Enum):
    """Asset class categorization."""
    EQUITIES = "equities"
    FIXED_INCOME = "fixed_income"
    CASH = "cash"
    ALTERNATIVES = "alternatives"


class SecurityType(Enum):
    """Security type categorization."""
    INDIVIDUAL_STOCK = "individual_stock"
    ETF = "etf"
    MUTUAL_FUND = "mutual_fund"
    BOND = "bond"
    CASH = "cash"
    ALTERNATIVE = "alternative"


class RiskProfile(Enum):
    """Risk profile enum for portfolios."""
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


# ================= Data Classes =================

@dataclass
class PortfolioPosition:
    """
    Represents a position in a portfolio.
    """
    symbol: str
    quantity: Decimal
    current_price: Decimal
    market_value: Decimal

    @classmethod
    def from_alpaca_position(cls, position: Any) -> 'PortfolioPosition':
        """
        Convert an Alpaca position to a PortfolioPosition.
        """
        return cls(
            symbol=position.symbol,
            quantity=Decimal(position.qty),
            current_price=Decimal(position.current_price),
            market_value=Decimal(position.market_value),
        )


@dataclass
class TargetPortfolio:
    """
    Represents a target portfolio allocation with percentages for different asset classes.
    """
    name: str
    risk_profile: RiskProfile
    asset_class_targets: Dict[AssetClass, Decimal]

    @classmethod
    def create_conservative_portfolio(cls) -> 'TargetPortfolio':
        """
        Create a conservative portfolio target allocation.
        60% fixed income, 30% equities, 10% cash.
        """
        return cls(
            name="Conservative Portfolio",
            risk_profile=RiskProfile.CONSERVATIVE,
            asset_class_targets={
                AssetClass.FIXED_INCOME: Decimal('60'),
                AssetClass.EQUITIES: Decimal('30'),
                AssetClass.CASH: Decimal('10'),
                AssetClass.ALTERNATIVES: Decimal('0'),
            }
        )

    @classmethod
    def create_balanced_portfolio(cls) -> 'TargetPortfolio':
        """
        Create a balanced portfolio target allocation.
        40% fixed income, 50% equities, 10% cash.
        """
        return cls(
            name="Balanced Portfolio",
            risk_profile=RiskProfile.BALANCED,
            asset_class_targets={
                AssetClass.FIXED_INCOME: Decimal('40'),
                AssetClass.EQUITIES: Decimal('50'),
                AssetClass.CASH: Decimal('10'),
                AssetClass.ALTERNATIVES: Decimal('0'),
            }
        )

    @classmethod
    def create_aggressive_growth_portfolio(cls) -> 'TargetPortfolio':
        """
        Create an aggressive growth portfolio target allocation.
        15% fixed income, 75% equities, 5% cash, 5% alternatives.
        """
        return cls(
            name="Aggressive Growth Portfolio",
            risk_profile=RiskProfile.AGGRESSIVE,
            asset_class_targets={
                AssetClass.FIXED_INCOME: Decimal('15'),
                AssetClass.EQUITIES: Decimal('75'),
                AssetClass.CASH: Decimal('5'),
                AssetClass.ALTERNATIVES: Decimal('5'),
            }
        )


# ================= Mock Data Classes =================

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


# ================= Portfolio Analysis Logic =================

class PortfolioAnalyzer:
    """
    Analyzes portfolios and generates rebalancing instructions.
    """
    
    @staticmethod
    def get_asset_class(symbol: str) -> AssetClass:
        """
        Determine the asset class of a security based on its symbol.
        
        Simple heuristic-based approach for the test:
        - Bond ETFs (AGG, BND, etc) -> FIXED_INCOME
        - Cash-like symbols -> CASH
        - Alternative asset symbols -> ALTERNATIVES
        - Everything else -> EQUITIES
        """
        # Bond ETFs
        bond_etfs = ["AGG", "BND", "VCIT", "VCSH", "MUB", "TLT", "IEF", "SHY"]
        if symbol in bond_etfs:
            return AssetClass.FIXED_INCOME
            
        # Cash-like
        cash_like = ["SGOV", "BIL", "SHV"]
        if symbol in cash_like:
            return AssetClass.CASH
            
        # Alternative assets
        alternatives = ["GLD", "IAU", "SLV", "PDBC", "GBTC", "ETHE"]
        if symbol in alternatives:
            return AssetClass.ALTERNATIVES
            
        # Default to equities
        return AssetClass.EQUITIES
    
    @staticmethod
    def get_security_type(symbol: str) -> SecurityType:
        """
        Determine the security type based on its symbol.
        
        Simple heuristic-based approach for the test:
        - Three or four letter symbols that are common ETFs -> ETF
        - Bond ETFs -> BOND
        - Cash-like symbols -> CASH
        - Alternative asset symbols -> ALTERNATIVE
        - Everything else -> INDIVIDUAL_STOCK
        """
        # Common ETFs
        etfs = ["SPY", "VOO", "VTI", "QQQ", "IWM", "EFA", "EEM"]
        if symbol in etfs:
            return SecurityType.ETF
            
        # Bond ETFs
        bond_etfs = ["AGG", "BND", "VCIT", "VCSH", "MUB", "TLT", "IEF", "SHY"]
        if symbol in bond_etfs:
            return SecurityType.BOND
            
        # Cash-like
        cash_like = ["SGOV", "BIL", "SHV"]
        if symbol in cash_like:
            return SecurityType.CASH
            
        # Alternative assets
        alternatives = ["GLD", "IAU", "SLV", "PDBC", "GBTC", "ETHE"]
        if symbol in alternatives:
            return SecurityType.ALTERNATIVE
            
        # Default to individual stock
        return SecurityType.INDIVIDUAL_STOCK
    
    @classmethod
    def analyze_portfolio(
        cls, positions: List[PortfolioPosition]
    ) -> Dict[str, Any]:
        """
        Analyze a portfolio and return statistics.
        """
        if not positions:
            return {
                "total_value": Decimal('0'),
                "asset_class_values": {asset_class: Decimal('0') for asset_class in AssetClass},
                "asset_class_percentages": {asset_class: Decimal('0') for asset_class in AssetClass},
                "security_type_values": {security_type: Decimal('0') for security_type in SecurityType},
                "security_type_percentages": {security_type: Decimal('0') for security_type in SecurityType},
            }
        
        total_value = sum(position.market_value for position in positions)
        
        # Calculate asset class values and percentages
        asset_class_values = {asset_class: Decimal('0') for asset_class in AssetClass}
        security_type_values = {security_type: Decimal('0') for security_type in SecurityType}
        
        for position in positions:
            asset_class = cls.get_asset_class(position.symbol)
            security_type = cls.get_security_type(position.symbol)
            
            asset_class_values[asset_class] += position.market_value
            security_type_values[security_type] += position.market_value
        
        # Calculate percentages
        asset_class_percentages = {
            asset_class: (value / total_value * 100) if total_value > 0 else Decimal('0')
            for asset_class, value in asset_class_values.items()
        }
        
        security_type_percentages = {
            security_type: (value / total_value * 100) if total_value > 0 else Decimal('0')
            for security_type, value in security_type_values.items()
        }
        
        return {
            "total_value": total_value,
            "asset_class_values": asset_class_values,
            "asset_class_percentages": asset_class_percentages,
            "security_type_values": security_type_values,
            "security_type_percentages": security_type_percentages,
        }
    
    @classmethod
    def generate_rebalance_instructions(
        cls, positions: List[PortfolioPosition], target_portfolio: TargetPortfolio
    ) -> str:
        """
        Generate rebalancing instructions to align current positions with target portfolio.
        """
        if not positions:
            return "No positions in the portfolio. Consider investing according to the target allocation."
        
        # Analyze current portfolio
        analysis = cls.analyze_portfolio(positions)
        total_value = analysis["total_value"]
        current_asset_class_percentages = analysis["asset_class_percentages"]
        
        # Calculate the differences between current and target percentages
        differences = {}
        for asset_class, target_pct in target_portfolio.asset_class_targets.items():
            current_pct = current_asset_class_percentages.get(asset_class, Decimal('0'))
            diff = target_pct - current_pct
            differences[asset_class] = diff
        
        # Generate instructions based on differences
        instructions = []
        instructions.append(f"# Rebalancing Instructions for: {target_portfolio.name}")
        instructions.append(f"Current Portfolio Value: ${total_value:,.2f}")
        instructions.append("\n## Current Asset Allocation vs Target:")
        
        for asset_class, target_pct in target_portfolio.asset_class_targets.items():
            current_pct = current_asset_class_percentages.get(asset_class, Decimal('0'))
            diff = differences[asset_class]
            diff_value = (diff / 100) * total_value
            
            instructions.append(
                f"- {asset_class.value.title()}: Current {current_pct:.2f}% vs "
                f"Target {target_pct:.2f}% (Difference: {diff:+.2f}%, ${diff_value:,.2f})"
            )
        
        # Detailed rebalancing instructions
        instructions.append("\n## Recommended Actions:")
        
        for asset_class, diff in differences.items():
            action = "INCREASE" if diff > 0 else "DECREASE"
            abs_diff = abs(diff)
            diff_value = (abs_diff / 100) * total_value
            
            if abs_diff < 1:  # Less than 1% difference
                instructions.append(
                    f"- {asset_class.value.title()}: No action needed (difference is less than 1%)"
                )
            else:
                instructions.append(
                    f"- {asset_class.value.title()}: {action} allocation by {abs_diff:.2f}% (${diff_value:,.2f})"
                )
                
                # Provide specific suggestions
                if action == "INCREASE":
                    if asset_class == AssetClass.EQUITIES:
                        instructions.append(
                            "  Suggestion: Consider buying broad market ETFs (e.g., VTI, SPY) "
                            "or individual stocks in underrepresented sectors."
                        )
                    elif asset_class == AssetClass.FIXED_INCOME:
                        instructions.append(
                            "  Suggestion: Consider buying bond ETFs (e.g., AGG, BND) "
                            "to increase fixed income exposure."
                        )
                    elif asset_class == AssetClass.CASH:
                        instructions.append(
                            "  Suggestion: Hold more cash or invest in short-term treasury ETFs (e.g., SHV, BIL)."
                        )
                    elif asset_class == AssetClass.ALTERNATIVES:
                        instructions.append(
                            "  Suggestion: Consider adding alternatives like gold ETFs (e.g., GLD) "
                            "or real estate ETFs (e.g., VNQ)."
                        )
                else:  # DECREASE
                    instructions.append(
                        f"  Suggestion: Consider selling some {asset_class.value} holdings to reduce allocation."
                    )
        
        return "\n".join(instructions)


# ================= Test Data =================

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


# ================= Main Test Function =================

def test_portfolio_analyzer_and_rebalance():
    """
    Test the portfolio analysis and rebalancing functionality directly.
    This is a standalone test that doesn't depend on the clera_agents package.
    """
    print("===== Testing Portfolio Analysis and Rebalancing Functionality =====\n")

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


# ================= Execute Test =================

if __name__ == "__main__":
    test_portfolio_analyzer_and_rebalance() 