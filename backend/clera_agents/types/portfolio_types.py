"""
Type definitions for portfolio management.

This module contains classes and enums for portfolio management,
including:
- Asset classes (Equity, Fixed Income, etc.)
- Security types (Individual Stock, ETF, etc.)
- Risk profiles
- Target portfolio allocation specifications
"""

from enum import Enum, auto
from dataclasses import dataclass
from typing import Dict, Optional, List


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
    CONSERVATIVE = "conservative"  # Low risk, stable returns
    MODERATE = "moderate"          # Balanced risk-return profile
    AGGRESSIVE = "aggressive"      # Higher risk, higher potential returns
    VERY_AGGRESSIVE = "very_aggressive"  # Highest risk, highest potential returns


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