"""
Portfolio Service Layer

This module provides business logic for portfolio operations, separating concerns
from the API layer and following SOLID principles.
"""

import json
import logging
import os
from decimal import Decimal
from typing import Dict, List, Optional

from utils.asset_classification import calculate_allocation, get_allocation_pie_data
from utils.redis_client import get_sync_redis_client

logger = logging.getLogger(__name__)

# Constants
ASSET_CACHE_FILE = "data/tradable_assets.json"


class PortfolioService:
    """Service class for portfolio-related business logic"""
    
    def __init__(self, redis_client=None, broker_client=None):
        self.redis_client = redis_client
        if not self.redis_client:
            self.redis_client = get_sync_redis_client()
        
        self.broker_client = broker_client
        
        # Cache for asset details to avoid repeated file reads
        self._asset_cache = None
        self._asset_cache_loaded = False
    
    def get_cash_stock_bond_allocation(self, account_id: str) -> Dict:
        """
        Get portfolio allocation split into cash, stocks, and bonds.
        
        Args:
            account_id: The account ID to get allocation for
            
        Returns:
            Dict with allocation data including cash, stock, bond values and percentages
        """
        try:
            # 1. Get positions data
            positions = self._get_positions(account_id)
            
            # 2. Get cash balance
            cash_balance = self._get_cash_balance(account_id)
            
            # 3. Enrich positions with asset details
            enriched_positions = self._enrich_positions(positions)
            
            # 4. Calculate allocation using business logic
            allocation = calculate_allocation(enriched_positions, cash_balance)
            
            # 5. Generate pie chart data
            pie_data = get_allocation_pie_data(allocation)
            
            # 6. Format response
            response = self._format_allocation_response(allocation, pie_data)
            
            logger.info(f"Cash/Stock/Bond allocation calculated successfully: "
                       f"Cash: {response['cash']['percentage']}%, "
                       f"Stock: {response['stock']['percentage']}%, "
                       f"Bond: {response['bond']['percentage']}%")
            
            return response
            
        except Exception as e:
            logger.error(f"Error calculating cash/stock/bond allocation: {e}", exc_info=True)
            raise
    
    def _get_positions(self, account_id: str) -> List[Dict]:
        """Get positions from Redis cache or Alpaca API"""
        positions_key = f'account_positions:{account_id}'
        positions_data_json = self.redis_client.get(positions_key)
        
        if not positions_data_json:
            # Fallback: Fetch positions directly from Alpaca
            logger.info("Positions not in Redis, fetching from Alpaca")
            return self._fetch_positions_from_alpaca(account_id)
        
        try:
            # Decode bytes to string before parsing JSON
            positions_data_str = positions_data_json.decode('utf-8') if isinstance(positions_data_json, bytes) else positions_data_json
            return json.loads(positions_data_str)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.error(f"Failed to decode positions JSON: {e}")
            return []
    
    def _fetch_positions_from_alpaca(self, account_id: str) -> List[Dict]:
        """Fetch positions directly from Alpaca API"""
        if not self.broker_client:
            logger.error("Broker client not provided")
            return []
            
        try:
            alpaca_positions = self.broker_client.get_all_positions_for_account(account_id)
            
            # Convert Alpaca positions to dict format
            positions = []
            for pos in alpaca_positions:
                positions.append({
                    'symbol': pos.symbol,
                    'market_value': str(pos.market_value),
                    'asset_class': str(pos.asset_class.value if hasattr(pos.asset_class, 'value') else pos.asset_class) if pos.asset_class else 'us_equity',
                    'qty': str(pos.qty),
                    'current_price': str(pos.current_price)
                })
            return positions
        except Exception as e:
            logger.error(f"Error fetching positions from Alpaca: {e}")
            return []
    
    def _get_cash_balance(self, account_id: str) -> Decimal:
        """Get cash balance from Alpaca account"""
        if not self.broker_client:
            logger.error("Broker client not provided")
            return Decimal('0')
            
        try:
            account = self.broker_client.get_trade_account_by_id(account_id)
            return Decimal(str(account.cash))
        except Exception as e:
            logger.error(f"Error fetching cash balance: {e}")
            return Decimal('0')
    
    def _enrich_positions(self, positions: List[Dict]) -> List[Dict]:
        """Enrich positions with asset names for better classification"""
        enriched_positions = []
        
        for position in positions:
            enriched_position = position.copy()
            
            # Try to get asset name from cache or API
            try:
                symbol = position.get('symbol')
                if symbol:
                    asset_name = self._get_asset_name(symbol)
                    if asset_name:
                        enriched_position['name'] = asset_name
            except Exception:
                pass  # Continue without enrichment
            
            enriched_positions.append(enriched_position)
        
        return enriched_positions
    
    def _load_asset_cache(self) -> Dict[str, Dict]:
        """Load asset cache from file once and cache it in memory"""
        if self._asset_cache_loaded:
            return self._asset_cache
        
        try:
            if os.path.exists(ASSET_CACHE_FILE):
                with open(ASSET_CACHE_FILE, 'r') as f:
                    cached_assets_list = json.load(f)
                    self._asset_cache = {asset.get('symbol'): asset for asset in cached_assets_list}
                    self._asset_cache_loaded = True
                    logger.debug(f"Loaded {len(self._asset_cache)} assets into cache")
                    return self._asset_cache
            else:
                self._asset_cache = {}
                self._asset_cache_loaded = True
                logger.debug("Asset cache file not found, using empty cache")
                return self._asset_cache
        except Exception as e:
            logger.warning(f"Failed to load asset cache: {e}")
            self._asset_cache = {}
            self._asset_cache_loaded = True
            return self._asset_cache

    def _get_asset_name(self, symbol: str) -> Optional[str]:
        """Get asset name from cache or Alpaca API"""
        try:
            # Load asset cache once and reuse
            cached_assets = self._load_asset_cache()
            
            if symbol in cached_assets:
                return cached_assets[symbol].get('name')
            else:
                # Try to fetch from Alpaca API (but don't fail if it doesn't work)
                if self.broker_client:
                    try:
                        asset_details = self.broker_client.get_asset(symbol)
                        if asset_details and hasattr(asset_details, 'name'):
                            return asset_details.name
                    except Exception:
                        pass  # Continue without name
            
            return None
        except Exception:
            return None
    
    def _format_allocation_response(self, allocation: Dict, pie_data: List[Dict]) -> Dict:
        """Format the allocation response for API consumption"""
        return {
            'cash': {
                'value': float(allocation['cash']['value']),
                'percentage': allocation['cash']['percentage']
            },
            'stock': {
                'value': float(allocation['stock']['value']),
                'percentage': allocation['stock']['percentage']
            },
            'bond': {
                'value': float(allocation['bond']['value']),
                'percentage': allocation['bond']['percentage']
            },
            'total_value': float(allocation['total_value']),
            'pie_data': pie_data
        } 