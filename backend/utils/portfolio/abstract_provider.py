"""
Abstract portfolio provider interface for multi-provider investment account management.

This module defines the contract that all portfolio providers must implement,
following the Interface Segregation and Dependency Inversion principles.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass, asdict
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

@dataclass
class Account:
    """Investment account representation across all providers."""
    id: str                     # Internal account ID (provider_accountId format)
    provider: str               # 'plaid', 'alpaca', 'manual'
    provider_account_id: str    # Provider's native account ID
    account_type: str           # 'brokerage', '401k', 'ira', 'roth_ira', '529', 'hsa'
    institution_name: str       # Financial institution name
    account_name: str           # Display name for account
    balance: Decimal            # Current cash balance
    is_active: bool             # Whether account is active for syncing
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

@dataclass  
class Position:
    """Investment position/holding representation across all providers."""
    symbol: str                 # Ticker symbol or security identifier
    quantity: Decimal           # Number of shares/units held
    market_value: Decimal       # Current market value
    cost_basis: Decimal         # Total cost basis
    account_id: str             # Reference to account ID
    institution_name: str       # Institution holding this position
    security_type: str          # 'equity', 'bond', 'etf', 'mutual_fund', 'option', 'cash'
    security_name: Optional[str] = None  # Full security name
    price: Optional[Decimal] = None      # Current price per share
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

@dataclass
class Transaction:
    """Investment transaction representation across all providers."""
    id: str                     # Unique transaction ID
    account_id: str             # Reference to account ID  
    symbol: Optional[str]       # Ticker symbol (None for cash transactions)
    transaction_type: str       # 'buy', 'sell', 'dividend', 'interest', 'fee', etc.
    quantity: Decimal           # Number of shares (0 for cash transactions)
    price: Decimal              # Price per share (0 for non-security transactions)
    amount: Decimal             # Total transaction amount (negative for outflows)
    date: datetime              # Transaction date
    description: str            # Transaction description
    fees: Optional[Decimal] = None       # Transaction fees
    settlement_date: Optional[datetime] = None  # Settlement date
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        data = asdict(self)
        # Convert datetime objects to ISO strings
        data['date'] = self.date.isoformat() if self.date else None
        data['settlement_date'] = self.settlement_date.isoformat() if self.settlement_date else None
        return data

@dataclass
class PerformanceData:
    """Portfolio performance metrics across all providers."""
    total_return: Decimal           # Total gain/loss amount
    total_return_percentage: Decimal # Total gain/loss percentage  
    daily_return: Decimal           # Today's gain/loss amount
    daily_return_percentage: Decimal # Today's gain/loss percentage
    period_returns: Dict[str, Decimal]  # Returns by period (1D, 1W, 1M, 3M, 1Y)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

class AbstractPortfolioProvider(ABC):
    """
    Abstract base class for portfolio data providers.
    
    Implements the Strategy pattern for different data sources (Plaid, Alpaca, etc.)
    and follows Interface Segregation principle by defining only essential methods.
    """
    
    @abstractmethod
    async def get_accounts(self, user_id: str) -> List[Account]:
        """
        Get all investment accounts for a user.
        
        Args:
            user_id: Unique user identifier
            
        Returns:
            List of Account objects
            
        Raises:
            ProviderError: If unable to fetch accounts
        """
        pass
    
    @abstractmethod
    async def get_positions(self, user_id: str, account_id: Optional[str] = None) -> List[Position]:
        """
        Get investment positions/holdings for user's accounts.
        
        Args:
            user_id: Unique user identifier
            account_id: Optional specific account ID to filter by
            
        Returns:
            List of Position objects
            
        Raises:
            ProviderError: If unable to fetch positions
        """
        pass
    
    @abstractmethod
    async def get_transactions(self, user_id: str, account_id: Optional[str] = None, 
                              start_date: Optional[datetime] = None, 
                              end_date: Optional[datetime] = None) -> List[Transaction]:
        """
        Get investment transactions for user's accounts.
        
        Args:
            user_id: Unique user identifier
            account_id: Optional specific account ID to filter by
            start_date: Optional start date for transaction range
            end_date: Optional end date for transaction range
            
        Returns:
            List of Transaction objects
            
        Raises:
            ProviderError: If unable to fetch transactions
        """
        pass
    
    @abstractmethod
    async def get_performance(self, user_id: str, account_id: Optional[str] = None) -> PerformanceData:
        """
        Calculate performance metrics from positions and transactions.
        
        Args:
            user_id: Unique user identifier
            account_id: Optional specific account ID to filter by
            
        Returns:
            PerformanceData object with calculated metrics
            
        Raises:
            ProviderError: If unable to calculate performance
        """
        pass
    
    @abstractmethod
    async def refresh_data(self, user_id: str, account_id: Optional[str] = None) -> bool:
        """
        Refresh cached data by re-fetching from the provider.
        
        Args:
            user_id: Unique user identifier
            account_id: Optional specific account ID to refresh
            
        Returns:
            True if refresh was successful, False otherwise
        """
        pass
    
    @abstractmethod 
    def get_provider_name(self) -> str:
        """
        Get the name of this provider.
        
        Returns:
            Provider name string (e.g., 'plaid', 'alpaca')
        """
        pass
    
    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """
        Check provider API health and connectivity.
        
        Returns:
            Dictionary with health status information
        """
        pass

class ProviderError(Exception):
    """Custom exception for portfolio provider errors."""
    
    def __init__(self, message: str, provider: str, error_code: Optional[str] = None, 
                 original_error: Optional[Exception] = None):
        self.message = message
        self.provider = provider
        self.error_code = error_code
        self.original_error = original_error
        super().__init__(f"[{provider}] {message}")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            'error': True,
            'message': self.message,
            'provider': self.provider,
            'error_code': self.error_code,
            'timestamp': datetime.now().isoformat()
        }
