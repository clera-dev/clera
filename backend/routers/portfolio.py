"""
Portfolio Router

This module contains portfolio-related API endpoints, providing proper separation
of concerns and following SOLID principles by isolating portfolio functionality
from the main API server.
"""

import asyncio
import logging
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from services.portfolio_orchestrator import PortfolioOrchestrator
from utils.authentication import get_authenticated_user_id, verify_account_ownership
from utils.auth_utils import verify_api_key
from utils.alpaca.broker_client_factory import get_broker_client
from utils.redis_utils import get_sync_redis_client

logger = logging.getLogger(__name__)

# Create router with prefix for portfolio endpoints
router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

# Response models
class PositionResponse(BaseModel):
    symbol: str
    qty: str
    side: str
    market_value: str
    current_price: str
    unrealized_pl: str
    unrealized_plpc: str
    asset_class: str

class PortfolioHistoryResponse(BaseModel):
    timestamp: List[int]
    equity: List[Optional[float]]
    profit_loss: List[Optional[float]]
    profit_loss_pct: List[Optional[float]]
    base_value: Optional[float]
    timeframe: str
    base_value_asof: Optional[str] = None

class PortfolioAnalyticsResponse(BaseModel):
    risk_score: Decimal
    diversification_score: Decimal

class AssetDetailsResponse(BaseModel):
    id: uuid.UUID
    asset_class: str
    exchange: str
    symbol: str
    name: Optional[str] = None
    status: str
    tradable: bool
    marginable: bool
    shortable: bool
    easy_to_borrow: bool
    fractionable: bool
    maintenance_margin_requirement: Optional[float] = None

@router.get("/cash-stock-bond-allocation")
async def get_cash_stock_bond_allocation(
    request: Request,
    account_id: str = Query(..., description="The account ID"),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Get portfolio allocation split into cash, stocks, and bonds.
    
    This endpoint provides a more accurate allocation breakdown compared to 
    the simple asset_class grouping, specifically identifying bond ETFs as bonds
    rather than equities.
    
    Returns:
        {
            'cash': {'value': float, 'percentage': float},
            'stock': {'value': float, 'percentage': float}, 
            'bond': {'value': float, 'percentage': float},
            'total_value': float,
            'pie_data': [{'name': str, 'value': float, 'percentage': float, 'category': str}]
        }
    """
    # Verify account ownership
    try:
        verify_account_ownership(account_id, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {account_id}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Use orchestrator with proper layering
        sync_redis = get_sync_redis_client()
        broker_client = get_broker_client()
        portfolio_orchestrator = PortfolioOrchestrator(redis_client=sync_redis, broker_client=broker_client)
        return await asyncio.to_thread(portfolio_orchestrator.get_cash_stock_bond_allocation, account_id)
        
    except Exception as e:
        logger.error(f"Error calculating cash/stock/bond allocation for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error occurred while calculating allocation")

@router.get("/{account_id}/history", response_model=PortfolioHistoryResponse)
async def get_portfolio_history(
    account_id: str,
    period: Optional[str] = '1M',
    timeframe: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    intraday_reporting: Optional[str] = 'market_hours',
    pnl_reset: Optional[str] = 'no_reset',
    extended_hours: Optional[bool] = None,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get portfolio history with various timeframes and parameters"""
    # Verify account ownership
    try:
        verify_account_ownership(account_id, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {account_id}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Implementation would go here
        # For now, return a placeholder response
        return PortfolioHistoryResponse(
            timestamp=[],
            equity=[],
            profit_loss=[],
            profit_loss_pct=[],
            base_value=None,
            timeframe=timeframe or '1D'
        )
    except Exception as e:
        logger.error(f"Error getting portfolio history for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{account_id}/positions", response_model=List[PositionResponse])
async def get_account_positions(
    account_id: str,
    client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get account positions"""
    # Verify account ownership
    try:
        verify_account_ownership(account_id, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {account_id}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Implementation would go here
        # For now, return empty list
        return []
    except Exception as e:
        logger.error(f"Error getting positions for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{account_id}/analytics", response_model=PortfolioAnalyticsResponse)
async def get_portfolio_analytics(
    account_id: str,
    client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get portfolio analytics"""
    # Verify account ownership
    try:
        verify_account_ownership(account_id, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {account_id}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Implementation would go here
        # For now, return placeholder response
        return PortfolioAnalyticsResponse(
            risk_score=Decimal('0.0'),
            diversification_score=Decimal('0.0')
        )
    except Exception as e:
        logger.error(f"Error getting analytics for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{account_id}/orders")
async def get_account_orders(
    account_id: str,
    status: Optional[str] = 'all',
    limit: Optional[int] = 50,
    after: Optional[datetime] = None,
    until: Optional[datetime] = None,
    direction: Optional[str] = 'desc',
    nested: Optional[bool] = False,
    symbols: Optional[List[str]] = None,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get account orders"""
    # Verify account ownership
    try:
        verify_account_ownership(account_id, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {account_id}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Implementation would go here
        # For now, return empty list
        return []
    except Exception as e:
        logger.error(f"Error getting orders for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/value")
async def get_portfolio_value(
    accountId: str = Query(..., description="Alpaca account ID"),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get portfolio value"""
    # Verify account ownership
    try:
        verify_account_ownership(accountId, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {accountId}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Implementation would go here
        # For now, return placeholder response
        return {"value": 0.0}
    except Exception as e:
        logger.error(f"Error getting portfolio value for account {accountId}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/activities")
async def get_portfolio_activities(
    accountId: str = Query(..., description="Alpaca account ID"),
    limit: Optional[int] = 100,
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get portfolio activities"""
    # Verify account ownership
    try:
        verify_account_ownership(accountId, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {accountId}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Implementation would go here
        # For now, return empty list
        return []
    except Exception as e:
        logger.error(f"Error getting activities for account {accountId}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/sector-allocation")
async def get_sector_allocation(
    request: Request, 
    account_id: str = Query(..., description="The account ID"),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get sector allocation"""
    # Verify account ownership
    try:
        verify_account_ownership(account_id, user_id)
    except Exception as e:
        logger.error(f"Account ownership verification failed for account {account_id}: {e}")
        raise HTTPException(status_code=403, detail="Access denied - account ownership verification failed")
    
    try:
        # Implementation would go here
        # For now, return placeholder response
        return {"sectors": [], "total_portfolio_value": 0.0}
    except Exception as e:
        logger.error(f"Error getting sector allocation for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error") 