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
    
    PRODUCTION-GRADE: Calculates actual Today's Return using yesterday's portfolio value.
    
    MARKET-AWARE BEHAVIOR (Industry Standard):
    - On trading days: Shows actual return (current value vs previous close)
    - On non-trading days (weekends/holidays):
      - Stocks-only portfolio: Shows "$0.00 (Markets Closed)" since stock prices are stale
      - Portfolio with crypto: Shows crypto-only return (crypto trades 24/7)
      - This matches Robinhood, Fidelity, Schwab behavior
    
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
    
    # PRODUCTION-GRADE: Check if market is open today
    from utils.trading_calendar import get_trading_calendar
    from datetime import date, timedelta
    
    trading_calendar = get_trading_calendar()
    today = date.today()
    is_market_open = trading_calendar.is_market_open_today(today)
    
    # Detect if portfolio has crypto (crypto trades 24/7)
    has_crypto = _portfolio_has_crypto(holdings_data)
    
    # CRITICAL: Calculate today's return with market-awareness
    todays_return = 0.0
    return_percent = 0.0
    market_status = "open" if is_market_open else "closed"
    
    try:
        from utils.supabase.db_client import get_supabase_client
        
        supabase = get_supabase_client()
        
        # PRODUCTION-GRADE: On non-trading days for stocks-only portfolios,
        # return $0.00 immediately - no need to calculate stale price differences
        if not is_market_open and not has_crypto:
            logger.info(f"📅 Market CLOSED, stocks-only portfolio for user {user_id} - showing $0 return")
            return {
                "account_id": "aggregated",
                "total_value": f"${total_market_value:.2f}",
                "today_return": "$0.00 (0.00%)",
                "today_return_label": "Markets Closed",
                "raw_value": total_market_value,
                "raw_return": 0.0,
                "raw_return_percent": 0.0,
                "market_status": "closed",
                "timestamp": datetime.now().isoformat(),
                "data_source": "plaid_aggregated",
                "holdings_count": len(holdings_data)
            }
        
        # Look for the most recent portfolio snapshot (yesterday or last trading day)
        # Look back up to 5 days to find last trading day (weekends/holidays)
        yesterday_value = None
        reference_date = None
        for days_back in range(1, 6):
            check_date = today - timedelta(days=days_back)
            result = supabase.table('user_portfolio_history')\
                .select('total_value, value_date')\
                .eq('user_id', user_id)\
                .eq('value_date', check_date.isoformat())\
                .in_('snapshot_type', ['reconstructed', 'daily_eod'])\
                .limit(1)\
                .execute()
            
            if result.data and len(result.data) > 0:
                yesterday_value = float(result.data[0]['total_value'])
                reference_date = check_date
                logger.debug(f"Found previous value for {check_date}: ${yesterday_value:.2f}")
                break
        
        if yesterday_value and yesterday_value > 0:
            # On non-trading days with crypto: Calculate return but note it's crypto-only
            if not is_market_open and has_crypto:
                # For mixed portfolios on weekends, the return is from crypto movement only
                # Stock prices are stale, so any change is crypto
                todays_return = total_market_value - yesterday_value
                return_percent = (todays_return / yesterday_value) * 100
                logger.info(f"📅 Market CLOSED, crypto portfolio for user {user_id}: "
                           f"${todays_return:.2f} ({return_percent:.2f}%) - crypto movement only")
            else:
                # Normal trading day calculation
                todays_return = total_market_value - yesterday_value
                return_percent = (todays_return / yesterday_value) * 100
                logger.info(f"Today's return for user {user_id}: ${todays_return:.2f} ({return_percent:.2f}%) "
                           f"vs {reference_date} ${yesterday_value:.2f}")
        else:
            # No historical data yet - show $0 return (not estimated)
            logger.info(f"No historical data for user {user_id}, showing $0 return")
            todays_return = 0.0
            return_percent = 0.0
            
    except Exception as e:
        logger.warning(f"Error calculating today's return for user {user_id}: {e}")
        # Fall back to $0 if we can't get historical data
        todays_return = 0.0
        return_percent = 0.0
    
    # Format return for display
    return_formatted = f"+${todays_return:.2f}" if todays_return >= 0 else f"-${abs(todays_return):.2f}"
    
    # Add market status label for non-trading days
    return_label = None
    if not is_market_open:
        if has_crypto:
            return_label = "Crypto Only"
        else:
            return_label = "Markets Closed"
    
    logger.info(f"Portfolio value calculated for user {user_id}: ${total_market_value:.2f} "
               f"(return: {return_formatted}, market: {market_status})")
    
    response = {
        "account_id": "aggregated",
        "total_value": f"${total_market_value:.2f}",
        "today_return": f"{return_formatted} ({return_percent:.2f}%)",
        "raw_value": total_market_value,
        "raw_return": todays_return,
        "raw_return_percent": return_percent,
        "market_status": market_status,
        "timestamp": datetime.now().isoformat(),
        "data_source": "plaid_aggregated",
        "holdings_count": len(holdings_data)
    }
    
    if return_label:
        response["today_return_label"] = return_label
    
    return response


def _portfolio_has_crypto(holdings_data: List[Dict[str, Any]]) -> bool:
    """
    Check if portfolio contains any cryptocurrency holdings.
    
    This is used to determine if weekend returns should be shown (crypto trades 24/7).
    
    Args:
        holdings_data: List of aggregated holdings
        
    Returns:
        True if portfolio has crypto, False otherwise
    """
    from utils.asset_classification import classify_asset, AssetClassification
    from utils.portfolio.constants import UNAMBIGUOUS_CRYPTO
    
    for holding in holdings_data:
        security_type = holding.get('security_type', '').lower()
        symbol = holding.get('symbol', '').upper()
        security_name = holding.get('security_name', '')
        
        # Check explicit crypto security type
        if security_type in ['crypto', 'cryptocurrency']:
            return True
        
        # Check unambiguous crypto symbols (BTC, ETH, etc.)
        if symbol in UNAMBIGUOUS_CRYPTO:
            return True
        
        # Use comprehensive classification
        classification = classify_asset(symbol, security_name)
        if classification == AssetClassification.CRYPTO:
            return True
    
    return False

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
    
    # CRITICAL FIX: Check for UNAMBIGUOUS crypto symbols FIRST, BEFORE applying the us_equity override
    # This handles the case where SnapTrade/Coinbase returns security_type='equity' for crypto assets
    # Only symbols that are NEVER valid US stock tickers are in UNAMBIGUOUS_CRYPTO
    from utils.portfolio.constants import UNAMBIGUOUS_CRYPTO
    
    if symbol in UNAMBIGUOUS_CRYPTO:
        return 'crypto'
    
    # Map Plaid security types to asset_class for proper classification
    # This prevents stocks like ONE (One Gas Inc) from being misclassified as crypto (Harmony ONE)
    if security_type in ['equity', 'etf', 'mutual_fund']:
        asset_class = 'us_equity'  # Tell classifier this is a stock, not crypto
    else:
        asset_class = None
    
    # Use the comprehensive classify_asset function for symbol-based crypto detection
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
    """Return empty allocation response with consistent API shape."""
    response = {
        'cash': {'value': 0.0, 'percentage': 100.0},
        'stock': {'value': 0.0, 'percentage': 0.0},
        'bond': {'value': 0.0, 'percentage': 0.0},
        'crypto': {'value': 0.0, 'percentage': 0.0},  # CRITICAL: Include crypto key for API consistency
        'total_value': 0.0,
        'pie_data': []
    }
    if error:
        response["error"] = error
    return response
