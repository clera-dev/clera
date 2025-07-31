"""
Portfolio Service

This module contains business logic for portfolio operations,
separating business rules from data access and presentation concerns.
"""

import logging
from decimal import Decimal
from typing import Dict, List

from utils.asset_classification import calculate_allocation, get_allocation_pie_data
from repositories.portfolio_repository import PortfolioRepository

logger = logging.getLogger(__name__)


class PortfolioService:
    """Service class for portfolio-related business logic"""
    
    def __init__(self, portfolio_repository: PortfolioRepository):
        self.repository = portfolio_repository
    
    def calculate_cash_stock_bond_allocation(self, account_id: str) -> Dict:
        """
        Calculate portfolio allocation split into cash, stocks, and bonds.
        
        Args:
            account_id: The account ID to get allocation for
            
        Returns:
            Dict with allocation data including cash, stock, bond values and percentages
        """
        try:
            # 1. Get positions data from repository
            positions = self.repository.get_positions(account_id)
            
            # 2. Get cash balance from repository
            cash_balance = self.repository.get_cash_balance(account_id)
            
            # 3. Enrich positions with asset details
            enriched_positions = self._enrich_positions(positions)
            
            # 4. Calculate allocation using business logic
            allocation = calculate_allocation(enriched_positions, cash_balance)
            
            # 5. Generate pie chart data
            pie_data = get_allocation_pie_data(allocation)
            
            logger.info(f"Cash/Stock/Bond allocation calculated for account {account_id}: "
                       f"Cash: {allocation['cash']['percentage']}%, "
                       f"Stock: {allocation['stock']['percentage']}%, "
                       f"Bond: {allocation['bond']['percentage']}%")
            
            return {
                'allocation': allocation,
                'pie_data': pie_data
            }
            
        except Exception as e:
            logger.error(f"Error calculating cash/stock/bond allocation for account {account_id}: {e}", exc_info=True)
            raise
    
    def _enrich_positions(self, positions: List[Dict]) -> List[Dict]:
        """Enrich positions with asset names for better classification"""
        enriched_positions = []
        
        for position in positions:
            enriched_position = position.copy()
            
            # Try to get asset name from repository
            try:
                symbol = position.get('symbol')
                if symbol:
                    asset_name = self.repository.get_asset_name(symbol)
                    if asset_name:
                        enriched_position['name'] = asset_name
            except Exception:
                pass  # Continue without enrichment
            
            enriched_positions.append(enriched_position)
        
        return enriched_positions 