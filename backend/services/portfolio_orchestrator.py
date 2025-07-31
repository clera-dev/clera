"""
Portfolio Orchestrator

This module orchestrates the interaction between repository, service, and formatter layers,
providing a clean interface for the API layer while maintaining proper separation of concerns.
"""

import logging
from typing import Dict

from repositories.portfolio_repository import PortfolioRepository
from services.portfolio_service import PortfolioService
from formatters.portfolio_formatter import PortfolioFormatter
from utils.redis_utils import get_sync_redis_client

logger = logging.getLogger(__name__)


class PortfolioOrchestrator:
    """Orchestrator for portfolio operations, coordinating between layers"""
    
    def __init__(self, redis_client=None, broker_client=None):
        # Initialize repository with data access dependencies
        self.repository = PortfolioRepository(redis_client=redis_client, broker_client=broker_client)
        
        # Initialize service with repository dependency
        self.service = PortfolioService(portfolio_repository=self.repository)
        
        # Initialize formatter (stateless, no dependencies)
        self.formatter = PortfolioFormatter()
    
    def get_cash_stock_bond_allocation(self, account_id: str) -> Dict:
        """
        Get portfolio allocation with proper layering and separation of concerns.
        
        This method orchestrates the flow:
        1. Repository layer handles data access
        2. Service layer handles business logic
        3. Formatter layer handles presentation
        
        Args:
            account_id: The account ID to get allocation for
            
        Returns:
            Formatted allocation response for API consumption
        """
        try:
            # 1. Business logic layer calculates allocation
            result = self.service.calculate_cash_stock_bond_allocation(account_id)
            
            # 2. Presentation layer formats the response
            formatted_response = self.formatter.format_allocation_response(
                allocation=result['allocation'],
                pie_data=result['pie_data']
            )
            
            logger.info(f"Successfully orchestrated allocation calculation for account {account_id}")
            return formatted_response
            
        except Exception as e:
            logger.error(f"Error in portfolio orchestration for account {account_id}: {e}", exc_info=True)
            raise 