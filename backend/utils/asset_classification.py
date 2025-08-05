"""
Asset Classification Utilities

This module provides utilities for classifying financial assets into cash, stocks, and bonds.
Designed specifically for Alpaca trading platform integration.
"""

import logging
from typing import Dict, List, Optional, Tuple
from decimal import Decimal
import decimal
import re

logger = logging.getLogger(__name__)

class AssetClassification:
    """Classification categories for portfolio allocation"""
    CASH = "cash"
    STOCK = "stock" 
    BOND = "bond"

# Comprehensive list of bond ETFs and fixed income instruments
# Updated as of 2025 with major bond ETFs available on Alpaca
BOND_ETFS = {
    # Core Bond ETFs
    'AGG': 'iShares Core U.S. Aggregate Bond ETF',
    'BND': 'Vanguard Total Bond Market ETF', 
    'VTEB': 'Vanguard Tax-Exempt Bond ETF',
    'VGIT': 'Vanguard Intermediate-Term Treasury ETF',
    'VGLT': 'Vanguard Long-Term Treasury ETF',
    'VGSH': 'Vanguard Short-Term Treasury ETF',
    
    # Corporate Bond ETFs
    'VCIT': 'Vanguard Intermediate-Term Corporate Bond ETF',
    'VCSH': 'Vanguard Short-Term Corporate Bond ETF',
    'VCLT': 'Vanguard Long-Term Corporate Bond ETF',
    'LQD': 'iShares iBoxx $ Investment Grade Corporate Bond ETF',
    'IGSB': 'iShares 1-3 Year Credit Bond ETF',
    'IGIB': 'iShares Intermediate Credit Bond ETF',
    'IGLB': 'iShares 10+ Year Credit Bond ETF',
    'USIG': 'iShares Broad USD Investment Grade Corporate Bond ETF',
    
    # Government Bond ETFs
    'IEF': 'iShares 7-10 Year Treasury Bond ETF',
    'SHY': 'iShares 1-3 Year Treasury Bond ETF',
    'TLT': 'iShares 20+ Year Treasury Bond ETF',
    'TLH': 'iShares 10-20 Year Treasury Bond ETF',
    'IEI': 'iShares 3-7 Year Treasury Bond ETF',
    'SHV': 'iShares Short Treasury Bond ETF',
    'GOVT': 'iShares U.S. Treasury Bond ETF',
    'VGIT': 'Vanguard Intermediate-Term Treasury ETF',
    
    # Municipal Bond ETFs
    'MUB': 'iShares National Muni Bond ETF',
    'VTEB': 'Vanguard Tax-Exempt Bond ETF',
    'TFI': 'SPDR Nuveen Bloomberg Municipal Bond ETF',
    'MUA': 'BlackRock MuniAssets Fund',
    'MUNI': 'PIMCO Intermediate Municipal Bond ETF',
    'PZA': 'Invesco National AMT-Free Municipal Bond ETF',
    
    # High Yield Bond ETFs
    'HYG': 'iShares iBoxx $ High Yield Corporate Bond ETF',
    'JNK': 'SPDR Bloomberg High Yield Bond ETF',
    'USHY': 'iShares Broad USD High Yield Corporate Bond ETF',
    'SHYG': 'iShares 0-5 Year High Yield Corporate Bond ETF',
    'BKLN': 'Invesco Senior Loan ETF',
    
    # International Bond ETFs
    'BNDX': 'Vanguard Total International Bond ETF',
    'VTFB': 'Vanguard Total International Bond ETF (Hedged)',
    'VWOB': 'Vanguard Emerging Markets Government Bond ETF',
    'EMB': 'iShares J.P. Morgan USD Emerging Markets Bond ETF',
    'PCY': 'Invesco Emerging Markets Sovereign Debt ETF',
    
    # Inflation-Protected Bond ETFs
    'TIP': 'iShares TIPS Bond ETF',
    'VTIP': 'Vanguard Short-Term Inflation-Protected Securities ETF',
    'SCHP': 'Schwab U.S. TIPS ETF',
    'LTPZ': 'PIMCO 15+ Year U.S. TIPS Index ETF',
    'STIP': 'iShares 0-5 Year TIPS Bond ETF',
    
    # Floating Rate Bond ETFs
    'FLOT': 'iShares Floating Rate Bond ETF',
    'FLRN': 'SPDR Bloomberg Investment Grade Floating Rate ETF',
    'TFLO': 'iShares Treasury Floating Rate Bond ETF',
    
    # Mortgage-Backed Securities ETFs
    'MBB': 'iShares MBS ETF',
    'VMBS': 'Vanguard Mortgage-Backed Securities ETF',
    'GNMA': 'iShares GNMA Bond ETF',
    
    # Schwab Bond ETFs
    'SCHZ': 'Schwab U.S. Aggregate Bond ETF',
    'SCHR': 'Schwab Intermediate-Term U.S. Treasury ETF',
    'SCHO': 'Schwab Short-Term U.S. Treasury ETF',
    'SPTS': 'SPDR Portfolio Short Term Treasury ETF',
    'SPTL': 'SPDR Portfolio Long Term Treasury ETF',
    
    # Other Popular Bond ETFs
    'BOND': 'PIMCO Active Bond ETF',
    'TOTL': 'SPDR DoubleLine Total Return Tactical ETF',
    'BSV': 'Vanguard Short-Term Bond ETF',
    'BIV': 'Vanguard Intermediate-Term Bond ETF',
    'BLV': 'Vanguard Long-Term Bond ETF'
}

# Additional bond keywords for name-based detection
BOND_KEYWORDS = [
    'bond', 'treasury', 'municipal', 'corporate', 'government', 
    'tips', 'inflation', 'fixed income', 'credit', 'sovereign',
    'floating rate', 'mortgage', 'mbs', 'municipal', 'muni'
]

def classify_asset(symbol: str, asset_name: Optional[str] = None, asset_class: Optional[str] = None) -> str:
    """
    Classify an asset as cash, stock, or bond based on symbol, name, and asset class.
    
    Args:
        symbol: The asset symbol (e.g., 'AAPL', 'AGG', 'BTC/USD')
        asset_name: Optional asset name for additional context
        asset_class: Alpaca asset class ('us_equity', 'crypto', 'us_option')
        
    Returns:
        str: Classification as 'cash', 'stock', or 'bond'
    """
    if not symbol:
        return AssetClassification.STOCK  # Default fallback
    
    symbol = symbol.upper().strip()
    
    # Handle crypto assets
    if asset_class == 'crypto' or '/' in symbol:
        return AssetClassification.STOCK  # Treat crypto as stock-like for allocation
    
    # Check if it's a known bond ETF by symbol
    if symbol in BOND_ETFS:
        logger.debug(f"Classified {symbol} as bond via symbol lookup: {BOND_ETFS[symbol]}")
        return AssetClassification.BOND
    
    # Check asset name for bond keywords if available
    if asset_name:
        asset_name_lower = asset_name.lower()
        for keyword in BOND_KEYWORDS:
            if keyword in asset_name_lower:
                logger.debug(f"Classified {symbol} as bond via name keyword '{keyword}': {asset_name}")
                return AssetClassification.BOND
        
        # Additional ETF detection
        if 'etf' in asset_name_lower:
            # Look for bond-related terms in ETF name
            bond_terms = ['bond', 'treasury', 'credit', 'fixed', 'tips', 'municipal', 'corporate']
            if any(term in asset_name_lower for term in bond_terms):
                logger.debug(f"Classified {symbol} as bond via ETF name analysis: {asset_name}")
                return AssetClassification.BOND
    
    # Default to stock for us_equity and other asset classes
    return AssetClassification.STOCK

def calculate_allocation(positions: List[Dict], cash_balance: Decimal) -> Dict[str, Dict]:
    """
    Calculate cash/stock/bond allocation from positions and cash balance.
    
    Args:
        positions: List of position dictionaries with symbol, market_value, etc.
        cash_balance: Cash balance as Decimal
        
    Returns:
        Dict with allocation data:
        {
            'cash': {'value': Decimal, 'percentage': float},
            'stock': {'value': Decimal, 'percentage': float}, 
            'bond': {'value': Decimal, 'percentage': float},
            'total_value': Decimal
        }
    """
    allocations = {
        AssetClassification.CASH: Decimal('0'),
        AssetClassification.STOCK: Decimal('0'),
        AssetClassification.BOND: Decimal('0')
    }
    
    # Add cash balance (safely handle NaN or invalid values)
    try:
        allocations[AssetClassification.CASH] = max(cash_balance, Decimal('0'))
    except decimal.InvalidOperation:
        logger.warning(f"Invalid cash balance value (NaN or invalid), defaulting to 0: {cash_balance}")
        allocations[AssetClassification.CASH] = Decimal('0')
    
    # Process positions
    for position in positions:
        try:
            symbol = position.get('symbol', '')
            market_value_str = position.get('market_value', '0')
            
            # Handle invalid market_value strings
            try:
                market_value = Decimal(str(market_value_str))
            except (ValueError, TypeError, decimal.InvalidOperation):
                logger.warning(f"Invalid market_value '{market_value_str}' for position {symbol}, skipping")
                continue
                
            asset_name = position.get('name')  # May be available from asset details
            asset_class = position.get('asset_class', 'us_equity')
            
            if market_value <= 0:
                continue
                
            classification = classify_asset(symbol, asset_name, asset_class)
            allocations[classification] += market_value
            
            logger.debug(f"Position {symbol}: ${market_value} -> {classification}")
            
        except (ValueError, TypeError) as e:
            logger.warning(f"Error processing position {position.get('symbol', 'Unknown')}: {e}")
            continue
    
    # Calculate total value
    total_value = sum(allocations.values())
    
    # Calculate percentages
    result = {}
    for category, value in allocations.items():
        percentage = float(value / total_value * 100) if total_value > 0 else 0.0
        result[category] = {
            'value': value,
            'percentage': round(percentage, 2)
        }
    
    result['total_value'] = total_value
    
    logger.info(f"Allocation calculated - Total: ${total_value}, "
               f"Cash: {result['cash']['percentage']}%, "
               f"Stock: {result['stock']['percentage']}%, "
               f"Bond: {result['bond']['percentage']}%")
    
    return result

def get_allocation_pie_data(allocation: Dict[str, Dict]) -> List[Dict]:
    """
    Convert allocation data to pie chart format.
    
    Args:
        allocation: Output from calculate_allocation()
        
    Returns:
        List of pie chart data points with name, value, percentage, category
    """
    pie_data = []
    
    for category in [AssetClassification.CASH, AssetClassification.STOCK, AssetClassification.BOND]:
        if category in allocation and allocation[category]['percentage'] > 0:
            display_name = category.title()
            percentage = allocation[category]['percentage']
            raw_value = allocation[category]['value']
            
            pie_data.append({
                'name': f"{display_name} ({percentage}%)",
                'value': percentage,
                'rawValue': float(raw_value),
                'category': category
            })
    
    # Sort by value (descending)
    pie_data.sort(key=lambda x: x['rawValue'], reverse=True)
    
    return pie_data