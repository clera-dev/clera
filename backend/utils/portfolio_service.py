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
from utils.alpaca import get_broker_client

logger = logging.getLogger(__name__)

# Constants
ASSET_CACHE_FILE = "data/tradable_assets.json"


class PortfolioService:
    """Service class for portfolio-related business logic"""
    
    def __init__(self, redis_client=None):
        self.redis_client = redis_client
        if not self.redis_client:
            # Import here to avoid circular imports
            from api_server import get_sync_redis_client
            self.redis_client = get_sync_redis_client()
    
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
            
            logger.info(f"Cash/Stock/Bond allocation calculated for account {account_id}: "
                       f"Cash: {response['cash']['percentage']}%, "
                       f"Stock: {response['stock']['percentage']}%, "
                       f"Bond: {response['bond']['percentage']}%")
            
            return response
            
        except Exception as e:
            logger.error(f"Error calculating cash/stock/bond allocation for account {account_id}: {e}", exc_info=True)
            raise
    
    def _get_positions(self, account_id: str) -> List[Dict]:
        """Get positions from Redis cache or Alpaca API"""
        positions_key = f'account_positions:{account_id}'
        positions_data_json = self.redis_client.get(positions_key)
        
        if not positions_data_json:
            # Fallback: Fetch positions directly from Alpaca
            logger.info(f"Positions not in Redis for account {account_id}, fetching from Alpaca")
            return self._fetch_positions_from_alpaca(account_id)
        
        try:
            return json.loads(positions_data_json)
        except json.JSONDecodeError:
            logger.error(f"Failed to decode positions JSON for account {account_id}")
            return []
    
    def _fetch_positions_from_alpaca(self, account_id: str) -> List[Dict]:
        """Fetch positions directly from Alpaca API"""
        try:
            broker_client = get_broker_client()
            alpaca_positions = broker_client.get_all_positions_for_account(account_id)
            
            # Convert Alpaca positions to dict format
            positions = []
            for pos in alpaca_positions:
                positions.append({
                    'symbol': pos.symbol,
                    'market_value': str(pos.market_value),
                    'asset_class': str(pos.asset_class.value) if pos.asset_class else 'us_equity',
                    'qty': str(pos.qty),
                    'current_price': str(pos.current_price)
                })
            return positions
        except Exception as e:
            logger.error(f"Error fetching positions from Alpaca for account {account_id}: {e}")
            return []
    
    def _get_cash_balance(self, account_id: str) -> Decimal:
        """Get cash balance from Alpaca account"""
        try:
            broker_client = get_broker_client()
            account = broker_client.get_trade_account_by_id(account_id)
            return Decimal(str(account.cash))
        except Exception as e:
            logger.error(f"Error fetching cash balance for account {account_id}: {e}")
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
    
    def _get_asset_name(self, symbol: str) -> Optional[str]:
        """Get asset name from cache or Alpaca API"""
        try:
            # Check if we have cached asset details
            cached_assets = {}
            if os.path.exists(ASSET_CACHE_FILE):
                with open(ASSET_CACHE_FILE, 'r') as f:
                    cached_assets_list = json.load(f)
                    cached_assets = {asset.get('symbol'): asset for asset in cached_assets_list}
            
            if symbol in cached_assets:
                return cached_assets[symbol].get('name')
            else:
                # Try to fetch from Alpaca API (but don't fail if it doesn't work)
                try:
                    broker_client = get_broker_client()
                    asset_details = broker_client.get_asset(symbol)
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