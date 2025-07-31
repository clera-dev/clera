"""
Portfolio Formatter

This module handles formatting of portfolio data for API responses,
separating presentation concerns from business logic.
"""

import logging
from typing import Dict, List

logger = logging.getLogger(__name__)


class PortfolioFormatter:
    """Formatter for portfolio-related API responses"""
    
    @staticmethod
    def format_allocation_response(allocation: Dict, pie_data: List[Dict]) -> Dict:
        """
        Format the allocation response for API consumption
        
        Args:
            allocation: Raw allocation data from business logic
            pie_data: Pie chart data from business logic
            
        Returns:
            Formatted response for API consumption
        """
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