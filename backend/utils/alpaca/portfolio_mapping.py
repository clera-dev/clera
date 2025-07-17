import os
import json
import logging
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from clera_agents.types.portfolio_types import PortfolioPosition, AssetClass, SecurityType
from backend.api_server import OrderResponse  # If OrderResponse is not available elsewhere, this import may need to be adjusted

logger = logging.getLogger(__name__)

ASSET_CACHE_FILE = os.getenv("ASSET_CACHE_FILE", "data/tradable_assets.json")

# If AlpacaTradingAssetClass is not available globally, import or define as needed
try:
    from alpaca.trading.enums import AssetClass as AlpacaTradingAssetClass
except ImportError:
    AlpacaTradingAssetClass = None


def map_alpaca_position_to_portfolio_position(alpaca_pos, asset_details_map: Dict[UUID, Any]) -> Optional[PortfolioPosition]:
    """Maps an Alpaca Position and fetched Asset details to our PortfolioPosition for analytics."""
    if not PortfolioPosition or not AssetClass or not SecurityType:
        logger.error("Portfolio analysis types (PortfolioPosition, AssetClass, SecurityType) not available due to import error.")
        return None
    if not alpaca_pos or not getattr(alpaca_pos, 'asset_class', None):
        logger.warning(f"Skipping position mapping due to missing data: {getattr(alpaca_pos, 'symbol', 'N/A')}")
        return None
    our_asset_class = None
    security_type = None
    asset_details = asset_details_map.get(getattr(alpaca_pos, 'asset_id', None))
    alpaca_asset_class = getattr(alpaca_pos, 'asset_class', None)
    if AlpacaTradingAssetClass and alpaca_asset_class == AlpacaTradingAssetClass.US_EQUITY:
        our_asset_class = AssetClass.EQUITY
        if asset_details:
            asset_name_lower = asset_details.name.lower() if getattr(asset_details, 'name', None) else ""
            asset_symbol_upper = asset_details.symbol.upper() if getattr(asset_details, 'symbol', None) else ""
            if "etf" in asset_name_lower or "fund" in asset_name_lower or "trust" in asset_name_lower or "shares" in asset_name_lower:
                security_type = SecurityType.ETF
            elif "reit" in asset_name_lower:
                security_type = SecurityType.REIT
            else:
                security_type = SecurityType.INDIVIDUAL_STOCK
        else:
            COMMON_ETFS = {
                'SPY', 'VOO', 'IVV', 'VTI', 'QQQ',
                'VXUS', 'EFA', 'VEA', 'EEM', 'VWO',
                'AGG', 'BND', 'VCIT', 'MUB', 'TIP', 'VTIP',
                'VNQ', 'SCHH', 'IYR',
                'GLD', 'IAU', 'SLV', 'USO',
                'XLF', 'XLK', 'XLV', 'XLE',
            }
            is_etf_by_name = False
            try:
                if os.path.exists(ASSET_CACHE_FILE):
                    with open(ASSET_CACHE_FILE, 'r') as f:
                        cached_assets = json.load(f)
                        cached_asset = next((asset for asset in cached_assets if asset.get('symbol') == alpaca_pos.symbol), None)
                        if cached_asset and cached_asset.get('name'):
                            asset_name_lower = cached_asset['name'].lower()
                            if 'etf' in asset_name_lower:
                                is_etf_by_name = True
                                logger.info(f"Identified {alpaca_pos.symbol} as ETF from cached asset name: {cached_asset['name']}")
            except Exception as e:
                logger.debug(f"Could not check cached asset name for {alpaca_pos.symbol}: {e}")
            if alpaca_pos.symbol in COMMON_ETFS or is_etf_by_name:
                security_type = SecurityType.ETF
                if alpaca_pos.symbol in COMMON_ETFS:
                    logger.info(f"Using fallback ETF classification for known symbol {alpaca_pos.symbol}")
                else:
                    logger.info(f"Using fallback ETF classification for {alpaca_pos.symbol} based on asset name containing 'ETF'")
                if alpaca_pos.symbol in ('AGG', 'BND', 'VCIT', 'MUB', 'TIP', 'VTIP'):
                    our_asset_class = AssetClass.FIXED_INCOME
                elif alpaca_pos.symbol in ('VNQ', 'SCHH', 'IYR'):
                    our_asset_class = AssetClass.REAL_ESTATE
                elif alpaca_pos.symbol in ('GLD', 'IAU', 'SLV', 'USO'):
                    our_asset_class = AssetClass.COMMODITIES
            else:
                logger.warning(f"Missing asset details for equity {alpaca_pos.symbol}, defaulting SecurityType to INDIVIDUAL_STOCK.")
                security_type = SecurityType.INDIVIDUAL_STOCK
    elif AlpacaTradingAssetClass and alpaca_asset_class == AlpacaTradingAssetClass.CRYPTO:
        our_asset_class = AssetClass.EQUITY
        security_type = SecurityType.CRYPTOCURRENCY
    elif AlpacaTradingAssetClass and alpaca_asset_class == AlpacaTradingAssetClass.US_OPTION:
        our_asset_class = AssetClass.ALTERNATIVES
        security_type = SecurityType.OPTIONS
    else:
        logger.warning(f"Unmapped Alpaca asset class '{getattr(alpaca_asset_class, 'name', str(alpaca_asset_class))}' for {getattr(alpaca_pos, 'symbol', 'N/A')}. Cannot determine internal types.")
        return None
    if our_asset_class is None or security_type is None:
        logger.warning(f"Could not determine internal AssetClass or SecurityType for {getattr(alpaca_pos, 'symbol', 'N/A')} (Alpaca Class: {getattr(alpaca_asset_class, 'name', str(alpaca_asset_class))}). Skipping.")
        return None
    try:
        return PortfolioPosition(
            symbol=alpaca_pos.symbol,
            asset_class=our_asset_class,
            security_type=security_type,
            market_value=Decimal(alpaca_pos.market_value),
            cost_basis=Decimal(alpaca_pos.cost_basis),
            unrealized_pl=Decimal(alpaca_pos.unrealized_pl),
            quantity=Decimal(alpaca_pos.qty),
            current_price=Decimal(alpaca_pos.current_price)
        )
    except Exception as e:
        logger.error(f"Error creating PortfolioPosition for {getattr(alpaca_pos, 'symbol', 'N/A')}: {e}", exc_info=True)
        return None

def map_order_to_response(order):
    """Maps an Alpaca Order object to our OrderResponse model."""
    return OrderResponse(
        id=order.id,
        client_order_id=order.client_order_id,
        created_at=order.created_at,
        updated_at=order.updated_at,
        submitted_at=order.submitted_at,
        filled_at=order.filled_at,
        expired_at=order.expired_at,
        canceled_at=order.canceled_at,
        failed_at=order.failed_at,
        replaced_at=order.replaced_at,
        replaced_by=order.replaced_by,
        replaces=order.replaces,
        asset_id=order.asset_id,
        symbol=order.symbol,
        asset_class=str(order.asset_class.value) if order.asset_class else None,
        notional=Decimal(order.notional) if order.notional is not None else None,
        qty=Decimal(order.qty) if order.qty is not None else None,
        filled_qty=Decimal(order.filled_qty) if order.filled_qty is not None else None,
        filled_avg_price=Decimal(order.filled_avg_price) if order.filled_avg_price is not None else None,
        order_class=str(order.order_class.value) if order.order_class else None,
        order_type=str(order.order_type.value) if order.order_type else None,
        type=str(order.type.value) if order.type else None,
        side=str(order.side.value) if order.side else None,
        time_in_force=str(order.time_in_force.value) if order.time_in_force else None,
        limit_price=Decimal(order.limit_price) if order.limit_price is not None else None,
        stop_price=Decimal(order.stop_price) if order.stop_price is not None else None,
        status=str(order.status.value) if order.status else None,
        extended_hours=order.extended_hours,
        legs=order.legs,
        trail_percent=Decimal(order.trail_percent) if order.trail_percent is not None else None,
        trail_price=Decimal(order.trail_price) if order.trail_price is not None else None,
        hwm=Decimal(order.hwm) if order.hwm is not None else None,
        commission=Decimal(order.commission) if order.commission is not None else None,
    ) 