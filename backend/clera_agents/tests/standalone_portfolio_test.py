#!/usr/bin/env python3
"""
Completely standalone portfolio test.
This script contains all the necessary code to test portfolio analysis
without importing from the main application.
"""

import json
from decimal import Decimal
from dataclasses import dataclass
from typing import List, Dict, Optional
from enum import Enum


# Define the types needed for testing
class AssetClass(Enum):
    """Major asset class categories for investments."""
    EQUITY = "equity"
    FIXED_INCOME = "fixed_income"
    CASH = "cash"
    REAL_ESTATE = "real_estate"
    COMMODITIES = "commodities"
    ALTERNATIVES = "alternatives"


class SecurityType(Enum):
    """Types of securities within asset classes."""
    INDIVIDUAL_STOCK = "individual_stock"
    ETF = "etf"
    INDEX_FUND = "index_fund"
    MUTUAL_FUND = "mutual_fund"
    BOND = "bond"
    CERTIFICATE_OF_DEPOSIT = "cd"
    REIT = "reit"
    MONEY_MARKET = "money_market"
    CRYPTOCURRENCY = "cryptocurrency"
    OPTIONS = "options"


class RiskProfile(Enum):
    """Risk tolerance profiles for investment strategies."""
    CONSERVATIVE = "conservative"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"
    VERY_AGGRESSIVE = "very_aggressive"


@dataclass
class AssetAllocation:
    """Allocation for an asset class with details on security types."""
    percentage: float  # 0-100 percentage of total portfolio
    security_allocations: Dict[SecurityType, float] = None  # Security type to percentage within this asset class
    
    def __post_init__(self):
        """Validate and initialize the allocations."""
        if self.percentage < 0 or self.percentage > 100:
            raise ValueError("Percentage must be between 0 and 100")
            
        # Initialize empty dict if None
        if self.security_allocations is None:
            self.security_allocations = {}
            
        # Validate that security allocations sum to 100% (or 0 if empty)
        if self.security_allocations and abs(sum(self.security_allocations.values()) - 100) > 0.01:
            raise ValueError("Security type allocations must sum to 100%")


@dataclass
class TargetPortfolio:
    """Specification for a target portfolio allocation."""
    # Core allocations by asset class - must sum to 100%
    asset_allocations: Dict[AssetClass, AssetAllocation]
    
    # Risk profile associated with this allocation
    risk_profile: RiskProfile
    
    # Optional descriptive name
    name: Optional[str] = None
    
    # Optional notes about the strategy
    notes: Optional[str] = None
    
    def __post_init__(self):
        """Validate the target portfolio."""
        # Check that allocations sum to 100%
        total_allocation = sum(alloc.percentage for alloc in self.asset_allocations.values())
        if abs(total_allocation - 100) > 0.01:
            raise ValueError(f"Asset allocations must sum to 100%, got {total_allocation}")

    def get_etf_allocation(self) -> float:
        """Get the percentage of the portfolio allocated to ETFs."""
        etf_percentage = 0
        for asset_class, allocation in self.asset_allocations.items():
            if SecurityType.ETF in allocation.security_allocations:
                # Calculate % of this asset class that goes to ETFs, then multiply by asset class %
                etf_percentage += (allocation.security_allocations[SecurityType.ETF] / 100) * allocation.percentage
        return etf_percentage
    
    def get_individual_stocks_allocation(self) -> float:
        """Get the percentage of the portfolio allocated to individual stocks."""
        stocks_percentage = 0
        for asset_class, allocation in self.asset_allocations.items():
            if SecurityType.INDIVIDUAL_STOCK in allocation.security_allocations:
                # Calculate % of this asset class that goes to stocks, then multiply by asset class %
                stocks_percentage += (allocation.security_allocations[SecurityType.INDIVIDUAL_STOCK] / 100) * allocation.percentage
        return stocks_percentage
    
    @classmethod
    def create_aggressive_growth_portfolio(cls) -> 'TargetPortfolio':
        """Create a pre-defined aggressive growth portfolio (100% equity, 50% ETF, 50% stocks)."""
        equity_allocation = AssetAllocation(
            percentage=100.0,
            security_allocations={
                SecurityType.ETF: 50.0,
                SecurityType.INDIVIDUAL_STOCK: 50.0
            }
        )
        
        return cls(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation
            },
            risk_profile=RiskProfile.AGGRESSIVE,
            name="Aggressive Growth Portfolio",
            notes="100% equity allocation with 50% in ETFs and 50% in individual stocks. Suitable for long-term investors with high risk tolerance."
        )
    
    @classmethod
    def create_balanced_portfolio(cls) -> 'TargetPortfolio':
        """Create a pre-defined balanced portfolio (60% equity, 40% fixed income)."""
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
        
        return cls(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation,
                AssetClass.FIXED_INCOME: fixed_income_allocation
            },
            risk_profile=RiskProfile.MODERATE,
            name="Balanced Portfolio",
            notes="60% equity, 40% fixed income. Balances growth with stability for medium-term goals."
        )
    
    @classmethod
    def create_conservative_portfolio(cls) -> 'TargetPortfolio':
        """Create a pre-defined conservative portfolio (30% equity, 60% fixed income, 10% cash)."""
        equity_allocation = AssetAllocation(
            percentage=30.0,
            security_allocations={
                SecurityType.ETF: 80.0,
                SecurityType.INDIVIDUAL_STOCK: 20.0
            }
        )
        
        fixed_income_allocation = AssetAllocation(
            percentage=60.0,
            security_allocations={
                SecurityType.ETF: 70.0,
                SecurityType.BOND: 30.0
            }
        )
        
        cash_allocation = AssetAllocation(
            percentage=10.0,
            security_allocations={
                SecurityType.MONEY_MARKET: 100.0
            }
        )
        
        return cls(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation,
                AssetClass.FIXED_INCOME: fixed_income_allocation,
                AssetClass.CASH: cash_allocation
            },
            risk_profile=RiskProfile.CONSERVATIVE,
            name="Conservative Portfolio",
            notes="30% equity, 60% fixed income, 10% cash. Focused on capital preservation with modest growth."
        )


@dataclass
class PortfolioPosition:
    """Represents a position in a portfolio with normalized fields."""
    symbol: str
    quantity: Decimal
    current_price: Decimal
    market_value: Decimal
    cost_basis: Optional[Decimal] = None
    unrealized_pl: Optional[Decimal] = None
    unrealized_plpc: Optional[Decimal] = None
    
    # Classification fields
    asset_class: Optional[AssetClass] = None
    security_type: Optional[SecurityType] = None
    
    @classmethod
    def from_alpaca_position(cls, position) -> 'PortfolioPosition':
        """Create a PortfolioPosition from an Alpaca Position object."""
        return cls(
            symbol=position.symbol,
            quantity=Decimal(position.qty),
            current_price=Decimal(position.current_price),
            market_value=Decimal(position.market_value),
            cost_basis=Decimal(position.cost_basis) if hasattr(position, 'cost_basis') else None,
            unrealized_pl=Decimal(position.unrealized_pl) if hasattr(position, 'unrealized_pl') else None,
            unrealized_plpc=Decimal(position.unrealized_plpc) if hasattr(position, 'unrealized_plpc') else None,
            # We'll apply classification in a separate step
            asset_class=None,
            security_type=None
        )


class PortfolioAnalyzer:
    """Analyzes portfolio positions against target allocations."""
    
    # Common ETF symbols
    COMMON_ETFS = {
        # US Broad Market
        'SPY': 'S&P 500 ETF',
        'VOO': 'Vanguard S&P 500 ETF',
        'IVV': 'iShares Core S&P 500 ETF',
        'VTI': 'Vanguard Total Stock Market ETF',
        'QQQ': 'Invesco QQQ (Nasdaq 100) ETF',
        
        # Fixed Income
        'AGG': 'iShares Core U.S. Aggregate Bond ETF',
        'BND': 'Vanguard Total Bond Market ETF',
    }
    
    @classmethod
    def classify_position(cls, position: PortfolioPosition) -> PortfolioPosition:
        """Classify a position by asset class and security type."""
        # Simple classification based on symbol - could be enhanced with external data
        if position.symbol in cls.COMMON_ETFS:
            position.security_type = SecurityType.ETF
            
            # Rough asset class classification
            if position.symbol in ('AGG', 'BND'):
                position.asset_class = AssetClass.FIXED_INCOME
            else:
                position.asset_class = AssetClass.EQUITY
        else:
            # Assume individual stock for now - could be enhanced
            position.security_type = SecurityType.INDIVIDUAL_STOCK
            position.asset_class = AssetClass.EQUITY
            
        return position
    
    @classmethod
    def analyze_portfolio(cls, positions: List[PortfolioPosition]) -> Dict:
        """Analyze a portfolio of positions and return summary statistics."""
        # Classify positions if not already classified
        for i, position in enumerate(positions):
            if position.asset_class is None or position.security_type is None:
                positions[i] = cls.classify_position(position)
        
        # Calculate total value
        total_value = sum(position.market_value for position in positions)
        
        # Calculate asset class breakdown
        asset_class_values = {}
        for asset_class in AssetClass:
            asset_class_values[asset_class] = Decimal('0')
            
        for position in positions:
            if position.asset_class:
                asset_class_values[position.asset_class] += position.market_value
        
        asset_class_percentages = {
            asset_class: (value / total_value * 100 if total_value > 0 else 0)
            for asset_class, value in asset_class_values.items()
        }
        
        # Calculate security type breakdown
        security_type_values = {}
        for security_type in SecurityType:
            security_type_values[security_type] = Decimal('0')
            
        for position in positions:
            if position.security_type:
                security_type_values[position.security_type] += position.market_value
        
        security_type_percentages = {
            security_type: (value / total_value * 100 if total_value > 0 else 0)
            for security_type, value in security_type_values.items()
        }
        
        # Calculate SPY equivalent allocation
        spy_equivalents = ('SPY', 'VOO', 'IVV')  # S&P 500 ETFs
        spy_equivalent_value = sum(
            position.market_value 
            for position in positions 
            if position.symbol in spy_equivalents
        )
        
        return {
            'total_value': total_value,
            'asset_class_values': asset_class_values,
            'asset_class_percentages': asset_class_percentages,
            'security_type_values': security_type_values,
            'security_type_percentages': security_type_percentages,
            'etf_percentage': security_type_percentages.get(SecurityType.ETF, 0),
            'individual_stock_percentage': security_type_percentages.get(SecurityType.INDIVIDUAL_STOCK, 0),
            'spy_equivalent_value': spy_equivalent_value,
            'spy_equivalent_percentage': (spy_equivalent_value / total_value * 100 if total_value > 0 else 0),
        }
    
    @classmethod
    def generate_rebalance_instructions(
        cls, 
        positions: List[PortfolioPosition], 
        target_portfolio: TargetPortfolio
    ) -> str:
        """Generate rebalancing instructions based on current positions and target portfolio."""
        # Analyze the portfolio
        analysis = cls.analyze_portfolio(positions)
        
        # Build rebalancing instructions
        instructions = []
        
        # Add portfolio summary
        instructions.append(f"Current Portfolio Summary:")
        instructions.append(f"Total Portfolio Value: ${analysis['total_value']:,.2f}")
        
        # Add asset class breakdown
        instructions.append("\nCurrent Asset Allocation:")
        for asset_class, percentage in analysis['asset_class_percentages'].items():
            if percentage > 0:
                instructions.append(f"  {asset_class.value.title()}: ${analysis['asset_class_values'][asset_class]:,.2f} ({float(percentage):.1f}%)")
        
        # Add security type breakdown
        instructions.append("\nCurrent Security Type Allocation:")
        for security_type, percentage in analysis['security_type_percentages'].items():
            if percentage > 0:
                instructions.append(f"  {security_type.value.replace('_', ' ').title()}: {float(percentage):.1f}%")
        
        instructions.append("\nTarget Allocation:")
        for asset_class, allocation in target_portfolio.asset_allocations.items():
            instructions.append(f"  {asset_class.value.title()}: {allocation.percentage:.1f}%")
            if allocation.security_allocations:
                for security_type, sec_percentage in allocation.security_allocations.items():
                    instructions.append(f"    - {security_type.value.replace('_', ' ').title()}: {sec_percentage:.1f}% of {asset_class.value.title()}")
        
        instructions.append("\nRebalancing Instructions:")
        
        # Calculate rebalancing for asset classes
        for asset_class, target_allocation in target_portfolio.asset_allocations.items():
            current_percentage = float(analysis['asset_class_percentages'].get(asset_class, 0))
            target_percentage = float(target_allocation.percentage)
            
            current_value = analysis['asset_class_values'].get(asset_class, Decimal('0'))
            target_value = analysis['total_value'] * (Decimal(str(target_percentage)) / Decimal('100'))
            
            difference = target_value - current_value
            
            # Only suggest changes above a threshold
            if abs(difference) > Decimal('50'):  # $50 threshold
                action = "Add to" if difference > 0 else "Reduce"
                instructions.append(f"  {action} {asset_class.value.title()}: ${abs(difference):,.2f} " +
                                    f"(from {current_percentage:.1f}% to {target_percentage:.1f}%)")
        
        # Specific ETF allocation instructions
        target_etf_percentage = float(target_portfolio.get_etf_allocation())
        current_etf_percentage = float(analysis['etf_percentage'])
        
        if abs(target_etf_percentage - current_etf_percentage) > 1:  # 1% threshold
            target_etf_value = analysis['total_value'] * (Decimal(str(target_etf_percentage)) / Decimal('100'))
            current_etf_value = analysis['total_value'] * (Decimal(str(current_etf_percentage)) / Decimal('100'))
            difference = target_etf_value - current_etf_value
            
            action = "Add to" if difference > 0 else "Reduce"
            instructions.append(f"  {action} ETFs: ${abs(difference):,.2f} " +
                                f"(from {current_etf_percentage:.1f}% to {target_etf_percentage:.1f}%)")
            
            # Specifics for SPY if it's a significant part of the ETF allocation
            if target_etf_percentage > 10:  # If ETFs are at least 10% of the portfolio
                instructions.append(f"    - Consider using SPY or VOO (S&P 500 ETFs) for broad market exposure")
        
        # Specific individual stock allocation instructions
        target_stock_percentage = float(target_portfolio.get_individual_stocks_allocation())
        current_stock_percentage = float(analysis['individual_stock_percentage'])
        
        if abs(target_stock_percentage - current_stock_percentage) > 1:  # 1% threshold
            target_stock_value = analysis['total_value'] * (Decimal(str(target_stock_percentage)) / Decimal('100'))
            current_stock_value = analysis['total_value'] * (Decimal(str(current_stock_percentage)) / Decimal('100'))
            difference = target_stock_value - current_stock_value
            
            action = "Add to" if difference > 0 else "Reduce"
            instructions.append(f"  {action} Individual Stocks: ${abs(difference):,.2f} " +
                                f"(from {current_stock_percentage:.1f}% to {target_stock_percentage:.1f}%)")
        
        # Add note if portfolio is reasonably aligned with target
        if len(instructions) <= 6:  # Only has summaries, no specific instructions
            instructions.append("  Your portfolio is already well-aligned with your target allocation.")
            
        return "\n".join(instructions)


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