"""
ETF Categorization Service

This service provides intelligent categorization of ETFs to distinguish between:
1. Broad Market ETFs (SPY, VTI, QQQ) - categorized as "Broad ETFs"
2. Sector-Specific ETFs (XLK, XLF, XLV) - categorized by their actual sector
3. Asset Class ETFs (AGG, VNQ, GLD) - categorized by their asset class
4. Geographic ETFs (VEA, EEM) - categorized as "International ETFs"

This follows SOLID principles:
- Single Responsibility: Only handles ETF categorization
- Open/Closed: Easy to extend with new ETF categories
- Liskov Substitution: Can be used anywhere an ETF categorizer is needed
- Interface Segregation: Clean interface with minimal dependencies
- Dependency Inversion: Depends on abstractions, not concrete implementations
"""

import logging
from typing import Dict, Optional, Set, Tuple
from enum import Enum
from dataclasses import dataclass

logger = logging.getLogger(__name__)


class ETFCategory(Enum):
    """ETF categories for sector allocation purposes."""
    BROAD_MARKET = "Broad ETFs"
    TECHNOLOGY = "Technology"
    HEALTHCARE = "Healthcare"
    FINANCIAL_SERVICES = "Financial Services"
    INDUSTRIALS = "Industrials"
    CONSUMER_DISCRETIONARY = "Consumer Discretionary"
    CONSUMER_STAPLES = "Consumer Staples"
    ENERGY = "Energy"
    UTILITIES = "Utilities"
    REAL_ESTATE = "Real Estate"
    COMMUNICATION_SERVICES = "Communication Services"
    BASIC_MATERIALS = "Basic Materials"
    FIXED_INCOME = "Fixed Income"
    COMMODITIES = "Commodities"
    INTERNATIONAL = "International ETFs"
    UNKNOWN = "Unknown"


@dataclass
class ETFClassification:
    """Result of ETF classification."""
    symbol: str
    category: ETFCategory
    description: str
    confidence: float  # 0.0 to 1.0


class ETFCategorizationService:
    """Service for intelligent ETF categorization."""
    
    def __init__(self):
        """Initialize the ETF categorization service."""
        self._broad_market_etfs = self._get_broad_market_etfs()
        self._sector_etfs = self._get_sector_etfs()
        self._asset_class_etfs = self._get_asset_class_etfs()
        self._international_etfs = self._get_international_etfs()
        
    def _get_broad_market_etfs(self) -> Dict[str, str]:
        """Get broad market ETFs that should be categorized as 'Broad ETFs'."""
        return {
            # US Broad Market
            'SPY': 'SPDR S&P 500 ETF Trust',
            'VOO': 'Vanguard S&P 500 ETF',
            'IVV': 'iShares Core S&P 500 ETF',
            'VTI': 'Vanguard Total Stock Market ETF',
            'QQQ': 'Invesco QQQ Trust (Nasdaq 100)',
            'DIA': 'SPDR Dow Jones Industrial Average ETF',
            'IJH': 'iShares Core S&P Mid-Cap ETF',
            'IJR': 'iShares Core S&P Small-Cap ETF',
            'VXF': 'Vanguard Extended Market ETF',
            'ITOT': 'iShares Core S&P Total US Stock Market ETF',
            'SCHA': 'Schwab US Small-Cap ETF',
            'SCHB': 'Schwab US Broad Market ETF',
            'SCHM': 'Schwab US Mid-Cap ETF',
            'VB': 'Vanguard Small-Cap ETF',
            'VO': 'Vanguard Mid-Cap ETF',
            'MGC': 'Vanguard Mega Cap ETF',
            'MGK': 'Vanguard Mega Cap Growth ETF',
            'MGV': 'Vanguard Mega Cap Value ETF',
        }
        
    def _get_sector_etfs(self) -> Dict[str, ETFCategory]:
        """Get sector-specific ETFs mapped to their actual sectors."""
        return {
            # Technology
            'XLK': ETFCategory.TECHNOLOGY,
            'VGT': ETFCategory.TECHNOLOGY,
            'FTEC': ETFCategory.TECHNOLOGY,
            'IYW': ETFCategory.TECHNOLOGY,
            'SOXX': ETFCategory.TECHNOLOGY,
            'SMH': ETFCategory.TECHNOLOGY,
            'IGV': ETFCategory.TECHNOLOGY,
            
            # Healthcare
            'XLV': ETFCategory.HEALTHCARE,
            'VHT': ETFCategory.HEALTHCARE,
            'IYH': ETFCategory.HEALTHCARE,
            'FHLC': ETFCategory.HEALTHCARE,
            'IBB': ETFCategory.HEALTHCARE,
            'XBI': ETFCategory.HEALTHCARE,
            
            # Financial Services
            'XLF': ETFCategory.FINANCIAL_SERVICES,
            'VFH': ETFCategory.FINANCIAL_SERVICES,
            'FNCL': ETFCategory.FINANCIAL_SERVICES,
            'IYF': ETFCategory.FINANCIAL_SERVICES,
            'KBE': ETFCategory.FINANCIAL_SERVICES,
            'IAI': ETFCategory.FINANCIAL_SERVICES,
            
            # Energy
            'XLE': ETFCategory.ENERGY,
            'VDE': ETFCategory.ENERGY,
            'FENY': ETFCategory.ENERGY,
            'IYE': ETFCategory.ENERGY,
            'IEO': ETFCategory.ENERGY,
            'XOP': ETFCategory.ENERGY,
            
            # Industrials
            'XLI': ETFCategory.INDUSTRIALS,
            'VIS': ETFCategory.INDUSTRIALS,
            'FIDU': ETFCategory.INDUSTRIALS,
            'IYJ': ETFCategory.INDUSTRIALS,
            'ITA': ETFCategory.INDUSTRIALS,
            'IHI': ETFCategory.INDUSTRIALS,
            
            # Consumer Discretionary
            'XLY': ETFCategory.CONSUMER_DISCRETIONARY,
            'VCR': ETFCategory.CONSUMER_DISCRETIONARY,
            'FDIS': ETFCategory.CONSUMER_DISCRETIONARY,
            'IYC': ETFCategory.CONSUMER_DISCRETIONARY,
            'RTH': ETFCategory.CONSUMER_DISCRETIONARY,
            
            # Consumer Staples
            'XLP': ETFCategory.CONSUMER_STAPLES,
            'VDC': ETFCategory.CONSUMER_STAPLES,
            'FSTA': ETFCategory.CONSUMER_STAPLES,
            'IYK': ETFCategory.CONSUMER_STAPLES,
            
            # Utilities
            'XLU': ETFCategory.UTILITIES,
            'VPU': ETFCategory.UTILITIES,
            'FUTY': ETFCategory.UTILITIES,
            'IDU': ETFCategory.UTILITIES,
            
            # Real Estate
            'XLRE': ETFCategory.REAL_ESTATE,
            'VNQ': ETFCategory.REAL_ESTATE,
            'FREL': ETFCategory.REAL_ESTATE,
            'IYR': ETFCategory.REAL_ESTATE,
            'SCHH': ETFCategory.REAL_ESTATE,
            'USRT': ETFCategory.REAL_ESTATE,
            
            # Communication Services
            'XLC': ETFCategory.COMMUNICATION_SERVICES,
            'VOX': ETFCategory.COMMUNICATION_SERVICES,
            'FCOM': ETFCategory.COMMUNICATION_SERVICES,
            'IYZ': ETFCategory.COMMUNICATION_SERVICES,
            
            # Basic Materials
            'XLB': ETFCategory.BASIC_MATERIALS,
            'VAW': ETFCategory.BASIC_MATERIALS,
            'FMAT': ETFCategory.BASIC_MATERIALS,
            'IYM': ETFCategory.BASIC_MATERIALS,
        }
        
    def _get_asset_class_etfs(self) -> Dict[str, ETFCategory]:
        """Get asset class ETFs mapped to their asset class categories."""
        return {
            # Fixed Income
            'AGG': ETFCategory.FIXED_INCOME,
            'BND': ETFCategory.FIXED_INCOME,
            'VCIT': ETFCategory.FIXED_INCOME,
            'VCSH': ETFCategory.FIXED_INCOME,
            'VGIT': ETFCategory.FIXED_INCOME,
            'VGLT': ETFCategory.FIXED_INCOME,
            'MUB': ETFCategory.FIXED_INCOME,
            'TIP': ETFCategory.FIXED_INCOME,
            'VTIP': ETFCategory.FIXED_INCOME,
            'FLOT': ETFCategory.FIXED_INCOME,
            'SHY': ETFCategory.FIXED_INCOME,
            'IEF': ETFCategory.FIXED_INCOME,
            'TLT': ETFCategory.FIXED_INCOME,
            'LQD': ETFCategory.FIXED_INCOME,
            'HYG': ETFCategory.FIXED_INCOME,
            'JNK': ETFCategory.FIXED_INCOME,
            'EMB': ETFCategory.FIXED_INCOME,
            'BNDX': ETFCategory.FIXED_INCOME,
            
            # Commodities
            'GLD': ETFCategory.COMMODITIES,
            'IAU': ETFCategory.COMMODITIES,
            'SLV': ETFCategory.COMMODITIES,
            'USO': ETFCategory.COMMODITIES,
            'UNG': ETFCategory.COMMODITIES,
            'DBA': ETFCategory.COMMODITIES,
            'DBC': ETFCategory.COMMODITIES,
            'PDBC': ETFCategory.COMMODITIES,
            'SGOL': ETFCategory.COMMODITIES,
            'SIVR': ETFCategory.COMMODITIES,
            'PALL': ETFCategory.COMMODITIES,
            'PPLT': ETFCategory.COMMODITIES,
        }
        
    def _get_international_etfs(self) -> Dict[str, str]:
        """Get international ETFs that should be categorized as 'International ETFs'."""
        return {
            # Developed Markets
            'VXUS': 'Vanguard Total International Stock ETF',
            'EFA': 'iShares MSCI EAFE ETF',
            'VEA': 'Vanguard FTSE Developed Markets ETF',
            'IEFA': 'iShares Core MSCI EAFE IMI Index ETF',
            'SCHF': 'Schwab International Equity ETF',
            'FTIHX': 'Fidelity Total International Index Fund',
            
            # Emerging Markets
            'EEM': 'iShares MSCI Emerging Markets ETF',
            'VWO': 'Vanguard FTSE Emerging Markets ETF',
            'IEMG': 'iShares Core MSCI Emerging Markets IMI Index ETF',
            'SCHE': 'Schwab Emerging Markets Equity ETF',
            
            # Regional
            'EWJ': 'iShares MSCI Japan ETF',
            'EWZ': 'iShares MSCI Brazil ETF',
            'FXI': 'iShares China Large-Cap ETF',
            'EWG': 'iShares MSCI Germany ETF',
            'EWU': 'iShares MSCI United Kingdom ETF',
            'EWC': 'iShares MSCI Canada ETF',
            'EWA': 'iShares MSCI Australia ETF',
            'EWS': 'iShares MSCI Singapore ETF',
            'EWH': 'iShares MSCI Hong Kong ETF',
            'EWT': 'iShares MSCI Taiwan ETF',
            'EWY': 'iShares MSCI South Korea ETF',
            'INDA': 'iShares MSCI India ETF',
        }
        
    def classify_etf(self, symbol: str, asset_name: Optional[str] = None) -> ETFClassification:
        """
        Classify an ETF symbol into the appropriate category.
        
        Args:
            symbol: The ETF symbol (e.g., 'SPY', 'XLK')
            asset_name: Optional asset name for additional context
            
        Returns:
            ETFClassification with category and confidence level
        """
        symbol = symbol.upper().strip()
        
        # Check broad market ETFs first (highest priority)
        if symbol in self._broad_market_etfs:
            return ETFClassification(
                symbol=symbol,
                category=ETFCategory.BROAD_MARKET,
                description=self._broad_market_etfs[symbol],
                confidence=1.0
            )
            
        # Check sector-specific ETFs
        if symbol in self._sector_etfs:
            category = self._sector_etfs[symbol]
            return ETFClassification(
                symbol=symbol,
                category=category,
                description=f"Sector ETF - {category.value}",
                confidence=1.0
            )
            
        # Check asset class ETFs
        if symbol in self._asset_class_etfs:
            category = self._asset_class_etfs[symbol]
            return ETFClassification(
                symbol=symbol,
                category=category,
                description=f"Asset Class ETF - {category.value}",
                confidence=1.0
            )
            
        # Check international ETFs
        if symbol in self._international_etfs:
            return ETFClassification(
                symbol=symbol,
                category=ETFCategory.INTERNATIONAL,
                description=self._international_etfs[symbol],
                confidence=1.0
            )
            
        # Try to infer from asset name if provided
        if asset_name:
            confidence = 0.7  # Lower confidence for name-based classification
            asset_name_lower = asset_name.lower()
            
            # Check for sector keywords in name
            sector_keywords = {
                'technology': ETFCategory.TECHNOLOGY,
                'tech': ETFCategory.TECHNOLOGY,
                'healthcare': ETFCategory.HEALTHCARE,
                'health': ETFCategory.HEALTHCARE,
                'financial': ETFCategory.FINANCIAL_SERVICES,
                'banking': ETFCategory.FINANCIAL_SERVICES,
                'energy': ETFCategory.ENERGY,
                'industrial': ETFCategory.INDUSTRIALS,
                'consumer': ETFCategory.CONSUMER_DISCRETIONARY,
                'utility': ETFCategory.UTILITIES,
                'utilities': ETFCategory.UTILITIES,
                'real estate': ETFCategory.REAL_ESTATE,
                'reit': ETFCategory.REAL_ESTATE,
                'communication': ETFCategory.COMMUNICATION_SERVICES,
                'materials': ETFCategory.BASIC_MATERIALS,
                'bond': ETFCategory.FIXED_INCOME,
                'treasury': ETFCategory.FIXED_INCOME,
                'fixed income': ETFCategory.FIXED_INCOME,
                'gold': ETFCategory.COMMODITIES,
                'commodity': ETFCategory.COMMODITIES,
                'international': ETFCategory.INTERNATIONAL,
                'emerging': ETFCategory.INTERNATIONAL,
                'developed': ETFCategory.INTERNATIONAL,
            }
            
            for keyword, category in sector_keywords.items():
                if keyword in asset_name_lower:
                    return ETFClassification(
                        symbol=symbol,
                        category=category,
                        description=f"Inferred from name: {asset_name}",
                        confidence=confidence
                    )
                    
            # Check for broad market keywords
            broad_keywords = ['s&p 500', 'total market', 'nasdaq', 'dow jones', 'russell']
            for keyword in broad_keywords:
                if keyword in asset_name_lower:
                    return ETFClassification(
                        symbol=symbol,
                        category=ETFCategory.BROAD_MARKET,
                        description=f"Inferred broad market from name: {asset_name}",
                        confidence=confidence
                    )
        
        # Default to unknown
        return ETFClassification(
            symbol=symbol,
            category=ETFCategory.UNKNOWN,
            description="Unknown ETF type",
            confidence=0.0
        )
        
    def is_etf(self, symbol: str) -> bool:
        """Check if a symbol is a known ETF."""
        symbol = symbol.upper().strip()
        return (symbol in self._broad_market_etfs or 
                symbol in self._sector_etfs or 
                symbol in self._asset_class_etfs or 
                symbol in self._international_etfs)
                
    def get_sector_for_allocation(self, symbol: str, asset_name: Optional[str] = None) -> str:
        """
        Get the sector category for sector allocation chart purposes.
        
        This is the main method to use for sector allocation charts.
        It returns the string category that should be used for grouping.
        
        Args:
            symbol: The ETF symbol
            asset_name: Optional asset name for additional context
            
        Returns:
            String category for sector allocation (e.g., "Broad ETFs", "Technology")
        """
        classification = self.classify_etf(symbol, asset_name)
        return classification.category.value
        
    def get_all_known_etfs(self) -> Set[str]:
        """Get all known ETF symbols."""
        all_etfs = set()
        all_etfs.update(self._broad_market_etfs.keys())
        all_etfs.update(self._sector_etfs.keys())
        all_etfs.update(self._asset_class_etfs.keys())
        all_etfs.update(self._international_etfs.keys())
        return all_etfs


# Factory function for creating instances (follows Dependency Injection pattern)
def create_etf_categorization_service() -> ETFCategorizationService:
    """
    Factory function to create ETF categorization service instances.
    
    This follows Dependency Injection principles:
    - Allows easy testing with different configurations
    - Enables A/B testing of different categorization strategies
    - Supports multi-tenant scenarios
    - Facilitates hot-swapping of configurations
    
    Returns:
        New instance of ETFCategorizationService
    """
    return ETFCategorizationService()

# Cached instance for performance (lazy-loaded, not global singleton)
_cached_service: Optional[ETFCategorizationService] = None

def get_etf_categorization_service() -> ETFCategorizationService:
    """
    Get a cached instance of the ETF categorization service.
    
    This provides performance benefits while maintaining testability:
    - Creates instance only when first needed (lazy loading)
    - Caches for performance in production
    - Can be easily mocked in tests
    - Allows explicit service creation when needed
    
    Returns:
        Cached instance of ETFCategorizationService
    """
    global _cached_service
    if _cached_service is None:
        _cached_service = create_etf_categorization_service()
    return _cached_service

def clear_etf_categorization_cache() -> None:
    """
    Clear the cached service instance.
    
    Useful for:
    - Testing (ensures clean state between tests)
    - Configuration updates (forces new instance creation)
    - Memory management in long-running processes
    """
    global _cached_service
    _cached_service = None


# Convenience functions for backward compatibility and easy usage
def get_etf_sector_for_allocation(symbol: str, asset_name: Optional[str] = None) -> str:
    """
    Convenience function to get ETF sector for allocation charts.
    
    This maintains backward compatibility while using the improved architecture.
    
    This is the main function that should be used throughout the codebase
    for determining ETF sectors in allocation charts.
    
    Args:
        symbol: The ETF symbol
        asset_name: Optional asset name for additional context
        
    Returns:
        String category for sector allocation
    """
    service = get_etf_categorization_service()
    return service.get_sector_for_allocation(symbol, asset_name)


def is_known_etf(symbol: str) -> bool:
    """
    Check if a symbol is a known ETF.
    
    This maintains backward compatibility while using the improved architecture.
    
    Args:
        symbol: The ETF symbol to check
        
    Returns:
        True if the symbol is a known ETF, False otherwise
    """
    service = get_etf_categorization_service()
    return service.is_etf(symbol)


def classify_etf(symbol: str, asset_name: Optional[str] = None) -> ETFClassification:
    """
    Classify an ETF symbol into the appropriate category.
    
    This maintains backward compatibility while using the improved architecture.
    
    Args:
        symbol: The ETF symbol (e.g., 'SPY', 'XLK')
        asset_name: Optional asset name for additional context
        
    Returns:
        ETFClassification with category and confidence level
    """
    service = get_etf_categorization_service()
    return service.classify_etf(symbol, asset_name)


# Test utilities for dependency injection
def inject_etf_categorization_service(service: ETFCategorizationService) -> None:
    """
    Inject a custom ETF categorization service for testing.
    
    This enables easy testing with mock services or custom configurations.
    Useful for:
    - Unit testing with mock services
    - Integration testing with test data
    - A/B testing different categorization strategies
    
    Args:
        service: Custom ETFCategorizationService instance
    """
    global _cached_service
    _cached_service = service