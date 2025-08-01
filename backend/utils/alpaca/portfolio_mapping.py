import os
import json
import logging
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from clera_agents.tools.portfolio_analysis import PortfolioPosition
from clera_agents.types.portfolio_types import AssetClass, SecurityType, OrderResponse, PositionResponse

logger = logging.getLogger(__name__)

# Import ETF categorization service using proper relative imports
try:
    from ..etf_categorization_service import is_known_etf, etf_categorization_service
    ETF_SERVICE_AVAILABLE = True
    logger.info("ETF categorization service loaded successfully")
except ImportError as e:
    logger.warning(f"ETF categorization service not available: {e}")
    ETF_SERVICE_AVAILABLE = False
    # Fallback functions
    def is_known_etf(symbol):
        return False
    def etf_categorization_service():
        return None

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
        
        # PRODUCTION-GRADE APPROACH: Our intelligent ETF service is PRIMARY, Alpaca data is FALLBACK
        if ETF_SERVICE_AVAILABLE and is_known_etf(alpaca_pos.symbol):
            # PRIMARY: Use our comprehensive ETF categorization service
            asset_name = getattr(asset_details, 'name', None) if asset_details else None
            classification = etf_categorization_service.classify_etf(alpaca_pos.symbol, asset_name)
            security_type = SecurityType.ETF
            
            logger.info(f"PRIMARY: Intelligent ETF classification for {alpaca_pos.symbol}: {classification.category.value} (confidence: {classification.confidence})")
            
            # Map ETF category to proper asset class
            if classification.category.value in ['Fixed Income']:
                our_asset_class = AssetClass.FIXED_INCOME
            elif classification.category.value in ['Real Estate']:
                our_asset_class = AssetClass.REAL_ESTATE
            elif classification.category.value in ['Commodities']:
                our_asset_class = AssetClass.COMMODITIES
            # All other ETFs (broad market, sector, international) remain as EQUITY
            
        elif asset_details:
            # FALLBACK 1: Use Alpaca asset details for unknown securities
            asset_name_lower = getattr(asset_details, 'name', '').lower()
            
            if any(keyword in asset_name_lower for keyword in ['etf', 'fund', 'trust', 'shares']):
                security_type = SecurityType.ETF
                logger.info(f"FALLBACK 1: Alpaca ETF detection for {alpaca_pos.symbol}: {getattr(asset_details, 'name', 'N/A')}")
                
                # Smart asset class inference from asset name
                if any(keyword in asset_name_lower for keyword in ['bond', 'treasury', 'fixed income', 'debt', 'floating rate']):
                    our_asset_class = AssetClass.FIXED_INCOME
                    logger.info(f"FALLBACK 1: Inferred Fixed Income for {alpaca_pos.symbol} from name")
                elif any(keyword in asset_name_lower for keyword in ['reit', 'real estate']):
                    our_asset_class = AssetClass.REAL_ESTATE
                    logger.info(f"FALLBACK 1: Inferred Real Estate for {alpaca_pos.symbol} from name")
                elif any(keyword in asset_name_lower for keyword in ['gold', 'silver', 'commodity', 'oil', 'copper']):
                    our_asset_class = AssetClass.COMMODITIES
                    logger.info(f"FALLBACK 1: Inferred Commodities for {alpaca_pos.symbol} from name")
                # Otherwise remains EQUITY (broad market, sector, international ETFs)
                
            elif 'reit' in asset_name_lower:
                security_type = SecurityType.REIT
                our_asset_class = AssetClass.REAL_ESTATE
                logger.info(f"FALLBACK 1: REIT detected for {alpaca_pos.symbol}")
            else:
                security_type = SecurityType.INDIVIDUAL_STOCK
                logger.info(f"FALLBACK 1: Individual stock classification for {alpaca_pos.symbol}")
                
        else:
            # FALLBACK 2: Legacy hardcoded ETF list for when no asset details are available
            LEGACY_ETFS = {
                # Broad Market
                'SPY', 'VOO', 'IVV', 'VTI', 'QQQ',
                # International  
                'VXUS', 'EFA', 'VEA', 'EEM', 'VWO',
                # Fixed Income
                'AGG', 'BND', 'VCIT', 'MUB', 'TIP', 'VTIP',
                # Real Estate
                'VNQ', 'SCHH', 'IYR',
                # Commodities
                'GLD', 'IAU', 'SLV', 'USO',
                # Sectors
                'XLF', 'XLK', 'XLV', 'XLE',
            }
            
            # Check cached asset data as additional fallback
            is_etf_by_cache = False
            try:
                if os.path.exists(ASSET_CACHE_FILE):
                    with open(ASSET_CACHE_FILE, 'r') as f:
                        cached_assets = json.load(f)
                        cached_asset = next((asset for asset in cached_assets if asset.get('symbol') == alpaca_pos.symbol), None)
                        if cached_asset and cached_asset.get('name'):
                            cache_name_lower = cached_asset['name'].lower()
                            if 'etf' in cache_name_lower:
                                is_etf_by_cache = True
                                logger.info(f"FALLBACK 2: Cache ETF detection for {alpaca_pos.symbol}: {cached_asset['name']}")
            except Exception as e:
                logger.debug(f"Cache lookup failed for {alpaca_pos.symbol}: {e}")
                
            if alpaca_pos.symbol in LEGACY_ETFS or is_etf_by_cache:
                security_type = SecurityType.ETF
                logger.info(f"FALLBACK 2: Legacy ETF classification for {alpaca_pos.symbol}")
                
                # Legacy asset class mapping
                if alpaca_pos.symbol in ('AGG', 'BND', 'VCIT', 'MUB', 'TIP', 'VTIP'):
                    our_asset_class = AssetClass.FIXED_INCOME
                elif alpaca_pos.symbol in ('VNQ', 'SCHH', 'IYR'):
                    our_asset_class = AssetClass.REAL_ESTATE
                elif alpaca_pos.symbol in ('GLD', 'IAU', 'SLV', 'USO'):
                    our_asset_class = AssetClass.COMMODITIES
                # Otherwise remains EQUITY
            else:
                security_type = SecurityType.INDIVIDUAL_STOCK
                logger.info(f"FALLBACK 2: Individual stock default for {alpaca_pos.symbol}")
                if not asset_details:
                    logger.warning(f"No classification data available for {alpaca_pos.symbol}, defaulting to individual stock")
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

def map_position_to_response(position):
    """Maps an Alpaca Position object to our PositionResponse model."""
    # Access asset_class via position.asset_class which should be AlpacaTradingAssetClass
    asset_class_value = str(position.asset_class.value) if position.asset_class else 'unknown'

    return PositionResponse(
        asset_id=position.asset_id,
        symbol=position.symbol,
        exchange=str(position.exchange.value) if position.exchange else 'unknown', # Convert enum
        asset_class=asset_class_value,
        avg_entry_price=Decimal(position.avg_entry_price),
        qty=Decimal(position.qty),
        side=str(position.side.value),
        market_value=Decimal(position.market_value),
        cost_basis=Decimal(position.cost_basis),
        unrealized_pl=Decimal(position.unrealized_pl),
        unrealized_plpc=Decimal(position.unrealized_plpc),
        unrealized_intraday_pl=Decimal(position.unrealized_intraday_pl),
        unrealized_intraday_plpc=Decimal(position.unrealized_intraday_plpc),
        current_price=Decimal(position.current_price),
        lastday_price=Decimal(position.lastday_price),
        change_today=Decimal(position.change_today),
        asset_marginable=getattr(position, 'marginable', None), # Get optional asset attributes
        asset_shortable=getattr(position, 'shortable', None),
        asset_easy_to_borrow=getattr(position, 'easy_to_borrow', None)
    ) 
