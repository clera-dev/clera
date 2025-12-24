"""
Aggregated Portfolio Calculations

Production-grade calculation utilities for aggregated portfolio data.
Follows SOLID principles with pure functions that are easily testable.
"""

import logging
from typing import Dict, Any, List, Optional
from decimal import Decimal
from datetime import datetime

logger = logging.getLogger(__name__)

def calculate_portfolio_value(holdings_data: List[Dict[str, Any]], user_id: str) -> Dict[str, Any]:
    """
    Calculate portfolio value from aggregated holdings data.
    
    Args:
        holdings_data: List of aggregated holdings from database
        user_id: User ID for logging
        
    Returns:
        Portfolio value response dictionary
    """
    if not holdings_data:
        return _empty_portfolio_value_response()
    
    # Calculate totals
    total_market_value = sum(float(holding.get('total_market_value', 0)) for holding in holdings_data)
    total_cost_basis = sum(float(holding.get('total_cost_basis', 0)) for holding in holdings_data)
    
    # Conservative daily return estimate (Plaid doesn't provide intraday data)
    todays_return = 0.0
    return_percent = 0.0
    
    if total_market_value > 1000:  # Only for substantial portfolios
        todays_return = total_market_value * 0.001  # 0.1% conservative estimate
        return_percent = (todays_return / (total_market_value - todays_return)) * 100 if total_market_value > todays_return else 0.0
    
    # Format return for display
    return_formatted = f"+${todays_return:.2f}" if todays_return >= 0 else f"-${abs(todays_return):.2f}"
    
    logger.info(f"Portfolio value calculated for user {user_id}: ${total_market_value:.2f} (return: {return_formatted})")
    
    return {
        "account_id": "aggregated",
        "total_value": f"${total_market_value:.2f}",
        "today_return": f"{return_formatted} ({return_percent:.2f}%)",
        "raw_value": total_market_value,
        "raw_return": todays_return,
        "raw_return_percent": return_percent,
        "timestamp": datetime.now().isoformat(),
        "data_source": "plaid_aggregated",
        "holdings_count": len(holdings_data)
    }

def calculate_portfolio_analytics(holdings_data: List[Dict[str, Any]], user_id: str) -> Dict[str, Any]:
    """
    Calculate portfolio analytics from aggregated holdings data.
    
    PRODUCTION-GRADE: Uses live market prices for accurate analytics.
    
    Args:
        holdings_data: List of aggregated holdings from database
        user_id: User ID for logging
        
    Returns:
        Analytics response dictionary with risk and diversification scores
    """
    if not holdings_data:
        return {"risk_score": "0.0", "diversification_score": "0.0"}
    
    try:
        # CRITICAL: Enrich with live prices for accurate analytics
        from utils.portfolio.live_enrichment_service import get_enrichment_service
        enrichment_service = get_enrichment_service()
        enriched_holdings = enrichment_service.enrich_holdings(holdings_data, user_id)
        
        # Convert to PortfolioPosition objects
        portfolio_positions = []
        
        for holding in enriched_holdings:
            try:
                # Use live-enriched market value and current price
                total_market_value = float(holding.get('total_market_value', 0))
                total_quantity = float(holding.get('total_quantity', 0))
                
                current_price = Decimal('0')
                if total_quantity > 0 and total_market_value > 0:
                    current_price = Decimal(str(total_market_value)) / Decimal(str(total_quantity))
                
                # Import analytics components
                from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyzer, PortfolioAnalyticsEngine
                
                position = PortfolioPosition(
                    symbol=holding['symbol'],
                    quantity=Decimal(str(total_quantity)),
                    current_price=current_price,
                    market_value=Decimal(str(total_market_value)),
                    cost_basis=Decimal(str(holding.get('total_cost_basis', 0))),
                    unrealized_pl=Decimal(str(holding.get('unrealized_gain_loss', 0))),
                    unrealized_plpc=None
                )
                
                # Classify the position for proper analytics
                position = PortfolioAnalyzer.classify_position(position)
                portfolio_positions.append(position)
                
            except Exception as e:
                logger.warning(f"Error creating PortfolioPosition for {holding.get('symbol', 'unknown')}: {e}")
                continue
        
        if not portfolio_positions:
            logger.warning(f"No valid positions created for analytics calculation for user {user_id}")
            return {"risk_score": "0.0", "diversification_score": "0.0"}
        
        # Calculate analytics with live data
        logger.info(f"Calculating analytics for {len(portfolio_positions)} aggregated positions (live-enriched)")
        
        risk_score = PortfolioAnalyticsEngine.calculate_risk_score(portfolio_positions)
        diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(portfolio_positions)
        
        logger.info(f"Portfolio analytics calculated for user {user_id}: risk={risk_score}, diversification={diversification_score}")
        
        return {
            "risk_score": str(risk_score),
            "diversification_score": str(diversification_score)
        }
        
    except Exception as e:
        logger.error(f"Error calculating portfolio analytics for user {user_id}: {e}")
        return {"risk_score": "0.0", "diversification_score": "0.0"}

def calculate_asset_allocation(holdings_data: List[Dict[str, Any]], user_id: str) -> Dict[str, Any]:
    """
    Calculate asset allocation from aggregated holdings data.
    
    PRODUCTION-GRADE: Uses live market prices for accurate allocation.
    
    Args:
        holdings_data: List of aggregated holdings from database
        user_id: User ID for logging
        
    Returns:
        Asset allocation response dictionary with cash/stock/bond breakdown
    """
    if not holdings_data:
        return _empty_allocation_response()
    
    # CRITICAL: Enrich with live prices for accurate allocation
    from utils.portfolio.live_enrichment_service import get_enrichment_service
    enrichment_service = get_enrichment_service()
    enriched_holdings = enrichment_service.enrich_holdings(holdings_data, user_id)
    
    # Map security types to asset categories (including crypto)
    allocations = {
        'cash': Decimal('0'),
        'stock': Decimal('0'),
        'bond': Decimal('0'),
        'crypto': Decimal('0')  # Cryptocurrency assets
    }
    
    for holding in enriched_holdings:
        market_value = Decimal(str(holding.get('total_market_value', 0)))
        security_type = holding.get('security_type', 'equity')
        
        # Intelligent classification based on security types
        category = _classify_security_type(security_type, holding)
        allocations[category] += market_value
    
    # Build response
    return _build_allocation_response(allocations, user_id)

def _classify_security_type(security_type: str, holding: Dict[str, Any]) -> str:
    """
    Classify a Plaid security type into cash/stock/bond/crypto categories.
    
    Args:
        security_type: Plaid security type
        holding: Full holding data for additional context
        
    Returns:
        Category string: 'cash', 'stock', 'bond', or 'crypto'
    """
    # Use the comprehensive crypto classification from asset_classification module
    from utils.asset_classification import classify_asset, AssetClassification
    
    symbol = holding.get('symbol', '').upper()
    security_name = holding.get('security_name', '')
    
    # CRITICAL: Check for crypto FIRST using the comprehensive classification
    # This handles both security_type='crypto' AND symbol-based detection (BTC, ETH, etc.)
    if security_type in ['crypto', 'cryptocurrency']:
        return 'crypto'
    
    # Use the comprehensive classify_asset function for symbol-based crypto detection
    asset_class = 'crypto' if security_type == 'crypto' else None
    classification = classify_asset(symbol, security_name, asset_class)
    if classification == AssetClassification.CRYPTO:
        return 'crypto'
    
    # Standard classifications
    if security_type in ['equity']:
        return 'stock'
    elif security_type in ['etf']:
        # ETFs could be stock or bond - use comprehensive classification
        if classification == AssetClassification.BOND:
            return 'bond'
        return 'stock'
    elif security_type in ['mutual_fund']:
        # Classify mutual funds based on name
        name = security_name.lower()
        if any(keyword in name for keyword in ['bond', 'income', 'treasury', 'fixed']):
            return 'bond'
        return 'stock'
    elif security_type in ['bond', 'fixed_income']:
        return 'bond'
    elif security_type in ['cash']:
        return 'cash'
    elif security_type in ['option', 'derivative']:
        return 'stock'  # Options are equity-related
    else:
        return 'stock'  # Default unknown types to stock

def _build_allocation_response(allocations: Dict[str, Decimal], user_id: str) -> Dict[str, Any]:
    """
    Build allocation response with percentages and pie chart data.
    
    Args:
        allocations: Dictionary with cash/stock/bond decimal values
        user_id: User ID for logging
        
    Returns:
        Formatted allocation response
    """
    total_value = sum(allocations.values())
    
    # Build response
    response = {}
    pie_data = []
    
    for category, value in allocations.items():
        percentage = float(value / total_value * 100) if total_value > 0 else 0.0
        response[category] = {
            'value': float(value),
            'percentage': round(percentage, 2)
        }
        
        # Add to pie data if substantial (lowered threshold to show small cash amounts)
        if percentage > 0.1:  # Show categories > 0.1% (was 1.0%)
            pie_data.append({
                'name': f'{category.title()} ({percentage:.1f}%)',
                'value': percentage,
                'rawValue': float(value),
                'color': _get_category_color(category),
                'category': category  # Add category for frontend filtering
            })
    
    response['total_value'] = float(total_value)
    response['pie_data'] = pie_data
    
    logger.info(f"Asset allocation calculated for user {user_id}: "
               f"Cash: {response['cash']['percentage']}%, "
               f"Stock: {response['stock']['percentage']}%, "  
               f"Bond: {response['bond']['percentage']}%, "
               f"Crypto: {response.get('crypto', {}).get('percentage', 0)}%")
    
    return response

def _get_category_color(category: str) -> str:
    """Get color for asset allocation category - MATCHES FRONTEND COLORS."""
    colors = {
        'cash': '#87CEEB',    # Sky Blue (matching frontend)
        'stock': '#4A90E2',   # Medium Blue (matching frontend)
        'bond': '#2E5BBA',    # Deep Blue (matching frontend)
        'crypto': '#F7931A'   # Bitcoin Orange - distinctive crypto color
    }
    return colors.get(category, '#6b7280')

def _empty_portfolio_value_response(error: Optional[str] = None) -> Dict[str, Any]:
    """Return empty portfolio value response."""
    response = {
        "account_id": "aggregated",
        "total_value": "$0.00",
        "today_return": "+$0.00 (0.00%)",
        "raw_value": 0.0,
        "raw_return": 0.0,
        "raw_return_percent": 0.0,
        "timestamp": datetime.now().isoformat(),
        "data_source": "plaid_aggregated"
    }
    if error:
        response["error"] = error
    return response

def _empty_allocation_response(error: Optional[str] = None) -> Dict[str, Any]:
    """Return empty allocation response."""
    response = {
        'cash': {'value': 0.0, 'percentage': 100.0},
        'stock': {'value': 0.0, 'percentage': 0.0},
        'bond': {'value': 0.0, 'percentage': 0.0},
        'total_value': 0.0,
        'pie_data': []
    }
    if error:
        response["error"] = error
    return response
