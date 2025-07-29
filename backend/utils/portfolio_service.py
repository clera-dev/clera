"""
Portfolio Service Layer

This module provides business logic for portfolio operations, separating concerns
from the API layer and following SOLID principles.
"""

import json
import logging
import os
from decimal import Decimal
from typing import Dict, List, Optional, Union

from utils.asset_classification import calculate_allocation, get_allocation_pie_data
from utils.alpaca import get_broker_client

logger = logging.getLogger(__name__)

# Constants
ASSET_CACHE_FILE = "data/tradable_assets.json"


class PortfolioService:
    """Service class for portfolio-related business logic"""
    
    def __init__(self, redis_client=None, is_async: bool = True):
        self.redis_client = redis_client
        self.is_async = is_async
        if not self.redis_client:
            # Import here to avoid circular imports
            from api_server import get_sync_redis_client
            self.redis_client = get_sync_redis_client()
            self.is_async = False  # Default to sync if no client provided
    
    def get_cash_stock_bond_allocation(self, account_id: str) -> Dict:
        """
        Get portfolio allocation split into cash, stocks, and bonds.
        
        Args:
            account_id: The account ID to get allocation for
            
        Returns:
            Dict with allocation data including cash, stock, bond values and percentages
        """
        try:
            if self.is_async:
                # For async calls, we need to handle this differently
                # This should only be called from async contexts
                raise RuntimeError("Async method should be called with await")
            else:
                return self._get_allocation_sync(account_id)
        except Exception as e:
            logger.error(f"Error calculating cash/stock/bond allocation for account {account_id}: {e}", exc_info=True)
            raise
    
    async def get_cash_stock_bond_allocation_async(self, account_id: str) -> Dict:
        """
        Async version of get_cash_stock_bond_allocation.
        
        Args:
            account_id: The account ID to get allocation for
            
        Returns:
            Dict with allocation data including cash, stock, bond values and percentages
        """
        try:
            if self.is_async:
                return await self._get_allocation_async(account_id)
            else:
                return self._get_allocation_sync(account_id)
        except Exception as e:
            logger.error(f"Error calculating cash/stock/bond allocation for account {account_id}: {e}", exc_info=True)
            raise
    
    async def _get_allocation_async(self, account_id: str) -> Dict:
        """Async implementation of allocation calculation"""
        # 1. Get positions data
        positions = await self._get_positions_async(account_id)
        
        # 2. Get cash balance
        cash_balance = await self._get_cash_balance_async(account_id)
        
        # 3. Enrich positions with asset details
        enriched_positions = await self._enrich_positions_async(positions)
        
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
    
    def _get_allocation_sync(self, account_id: str) -> Dict:
        """Sync implementation of allocation calculation"""
        # 1. Get positions data
        positions = self._get_positions_sync(account_id)
        
        # 2. Get cash balance
        cash_balance = self._get_cash_balance_sync(account_id)
        
        # 3. Enrich positions with asset details
        enriched_positions = self._enrich_positions_sync(positions)
        
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
    
    async def _get_positions_async(self, account_id: str) -> List[Dict]:
        """Get positions from Redis cache or Alpaca API (async)"""
        positions_key = f'account_positions:{account_id}'
        positions_data_json = await self.redis_client.get(positions_key)
        
        if not positions_data_json:
            # Fallback: Fetch positions directly from Alpaca
            logger.info(f"Positions not in Redis for account {account_id}, fetching from Alpaca")
            return await self._fetch_positions_from_alpaca_async(account_id)
        
        try:
            return json.loads(positions_data_json)
        except json.JSONDecodeError:
            logger.error(f"Failed to decode positions JSON for account {account_id}")
            return []
    
    def _get_positions_sync(self, account_id: str) -> List[Dict]:
        """Get positions from Redis cache or Alpaca API (sync)"""
        positions_key = f'account_positions:{account_id}'
        positions_data_json = self.redis_client.get(positions_key)
        
        if not positions_data_json:
            # Fallback: Fetch positions directly from Alpaca
            logger.info(f"Positions not in Redis for account {account_id}, fetching from Alpaca")
            return self._fetch_positions_from_alpaca_sync(account_id)
        
        try:
            return json.loads(positions_data_json)
        except json.JSONDecodeError:
            logger.error(f"Failed to decode positions JSON for account {account_id}")
            return []
    
    async def _fetch_positions_from_alpaca_async(self, account_id: str) -> List[Dict]:
        """Fetch positions directly from Alpaca API (async)"""
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
    
    def _fetch_positions_from_alpaca_sync(self, account_id: str) -> List[Dict]:
        """Fetch positions directly from Alpaca API (sync)"""
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
    
    async def _get_cash_balance_async(self, account_id: str) -> Decimal:
        """Get cash balance from Alpaca account (async)"""
        try:
            broker_client = get_broker_client()
            account = broker_client.get_trade_account_by_id(account_id)
            return Decimal(str(account.cash))
        except Exception as e:
            logger.error(f"Error fetching cash balance for account {account_id}: {e}")
            return Decimal('0')
    
    def _get_cash_balance_sync(self, account_id: str) -> Decimal:
        """Get cash balance from Alpaca account (sync)"""
        try:
            broker_client = get_broker_client()
            account = broker_client.get_trade_account_by_id(account_id)
            return Decimal(str(account.cash))
        except Exception as e:
            logger.error(f"Error fetching cash balance for account {account_id}: {e}")
            return Decimal('0')
    
    async def _enrich_positions_async(self, positions: List[Dict]) -> List[Dict]:
        """Enrich positions with asset names for better classification (async)"""
        enriched_positions = []
        
        for position in positions:
            enriched_position = position.copy()
            
            # Try to get asset name from cache or API
            try:
                symbol = position.get('symbol')
                if symbol:
                    asset_name = await self._get_asset_name_async(symbol)
                    if asset_name:
                        enriched_position['name'] = asset_name
            except Exception:
                pass  # Continue without enrichment
            
            enriched_positions.append(enriched_position)
        
        return enriched_positions
    
    def _enrich_positions_sync(self, positions: List[Dict]) -> List[Dict]:
        """Enrich positions with asset names for better classification (sync)"""
        enriched_positions = []
        
        for position in positions:
            enriched_position = position.copy()
            
            # Try to get asset name from cache or API
            try:
                symbol = position.get('symbol')
                if symbol:
                    asset_name = self._get_asset_name_sync(symbol)
                    if asset_name:
                        enriched_position['name'] = asset_name
            except Exception:
                pass  # Continue without enrichment
            
            enriched_positions.append(enriched_position)
        
        return enriched_positions
    
    async def _get_asset_name_async(self, symbol: str) -> Optional[str]:
        """Get asset name from cache or Alpaca API (async)"""
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
    
    def _get_asset_name_sync(self, symbol: str) -> Optional[str]:
        """Get asset name from cache or Alpaca API (sync)"""
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