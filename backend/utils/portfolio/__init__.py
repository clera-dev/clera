"""
Portfolio aggregation utilities for multi-provider investment account management.

This module provides abstractions for working with investment data from multiple
providers (Plaid, Alpaca, etc.) in a consistent way.
"""

from .abstract_provider import (
    AbstractPortfolioProvider,
    Account,
    Position, 
    Transaction,
    PerformanceData
)
from .portfolio_service import PortfolioService

__all__ = [
    'AbstractPortfolioProvider',
    'Account',
    'Position',
    'Transaction', 
    'PerformanceData',
    'PortfolioService'
]
