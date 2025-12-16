"""
Safe Account Service

Production-grade service for safely handling account operations across different 
portfolio modes without breaking existing functionality.
"""

import logging
from typing import Optional, Dict, Any, List, Tuple
from utils.portfolio.portfolio_mode_service import get_portfolio_mode_service, PortfolioMode
from utils.supabase.db_client import get_user_alpaca_account_id

logger = logging.getLogger(__name__)

class SafeAccountService:
    """
    Safe account service that prevents crashes for aggregation-only users
    while preserving existing Alpaca-based functionality.
    """
    
    def __init__(self):
        self.portfolio_service = get_portfolio_mode_service()
    
    def get_user_account_id_safe(self, user_id: str, required: bool = True) -> Optional[str]:
        """
        Safely get a user's account ID with proper error handling.
        
        Args:
            user_id: The user's ID
            required: Whether an account ID is required (affects logging level)
            
        Returns:
            Account ID if available, None otherwise
        """
        try:
            mode = self.portfolio_service.get_user_portfolio_mode(user_id)
            
            # For aggregation mode, no Alpaca account is expected
            if mode == PortfolioMode.AGGREGATION:
                if required:
                    logger.debug(f"User {user_id} in aggregation mode, no Alpaca account expected")
                return None
            
            # For other modes, try to get Alpaca account ID
            if mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID]:
                alpaca_id = get_user_alpaca_account_id(user_id)
                if not alpaca_id and required:
                    logger.warning(f"User {user_id} in {mode.value} mode but no Alpaca account found")
                return alpaca_id
            
            # Disabled mode
            if required:
                logger.debug(f"User {user_id} in disabled mode")
            return None
            
        except Exception as e:
            log_level = logging.WARNING if required else logging.DEBUG
            logger.log(log_level, f"Error getting account ID for user {user_id}: {e}")
            return None
    
    def validate_account_access(self, user_id: str, account_id: str) -> Tuple[bool, Optional[str]]:
        """
        Validate if a user has access to a specific account.
        
        Args:
            user_id: The user's ID
            account_id: The account ID to validate
            
        Returns:
            Tuple of (is_valid: bool, error_message: Optional[str])
        """
        try:
            mode = self.portfolio_service.get_user_portfolio_mode(user_id)
            
            if mode == PortfolioMode.DISABLED:
                return False, "Portfolio features are disabled"
            
            # For Alpaca accounts
            if mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID]:
                user_alpaca_id = self.get_user_account_id_safe(user_id, required=False)
                if user_alpaca_id and user_alpaca_id == account_id:
                    return True, None
            
            # For Plaid/aggregated accounts
            if mode in [PortfolioMode.AGGREGATION, PortfolioMode.HYBRID]:
                # Validate Plaid account format or allow aggregated account
                if account_id.startswith("plaid_") or account_id == "aggregated":
                    return True, None
            
            return False, f"Account {account_id} not accessible for user {user_id} in {mode.value} mode"
            
        except Exception as e:
            logger.error(f"Error validating account access for user {user_id}, account {account_id}: {e}")
            return False, f"Account validation error: {str(e)}"
    
    def get_user_accounts_info(self, user_id: str) -> Dict[str, Any]:
        """
        Get comprehensive account information for a user.
        
        Args:
            user_id: The user's ID
            
        Returns:
            Dictionary with account information
        """
        try:
            mode = self.portfolio_service.get_user_portfolio_mode(user_id)
            
            info = {
                "user_id": user_id,
                "portfolio_mode": mode.value,
                "has_alpaca_account": False,
                "has_plaid_accounts": False,  # TODO: Implement Plaid account detection
                "alpaca_account_id": None,
                "realtime_updates_enabled": False,
                "data_sources": []
            }
            
            # Check for Alpaca account
            if mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID]:
                alpaca_id = self.get_user_account_id_safe(user_id, required=False)
                if alpaca_id:
                    info["has_alpaca_account"] = True
                    info["alpaca_account_id"] = alpaca_id
                    info["realtime_updates_enabled"] = True
            
            # Get data sources
            info["data_sources"] = self.portfolio_service.get_portfolio_data_sources(user_id)
            
            return info
            
        except Exception as e:
            logger.error(f"Error getting account info for user {user_id}: {e}")
            return {
                "user_id": user_id,
                "portfolio_mode": "error",
                "error": str(e)
            }
    
    def is_endpoint_available_for_user(self, user_id: str, endpoint_type: str) -> bool:
        """
        Check if a specific endpoint type is available for a user.
        
        Args:
            user_id: The user's ID
            endpoint_type: Type of endpoint ('portfolio', 'realtime', 'trading', etc.)
            
        Returns:
            True if endpoint is available for the user
        """
        try:
            mode = self.portfolio_service.get_user_portfolio_mode(user_id)
            
            if mode == PortfolioMode.DISABLED:
                return False
            
            # Portfolio endpoints - available in all active modes
            if endpoint_type == "portfolio":
                return mode in [PortfolioMode.AGGREGATION, PortfolioMode.BROKERAGE, PortfolioMode.HYBRID]
            
            # Real-time endpoints - only available with Alpaca accounts
            elif endpoint_type == "realtime":
                return (
                    mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID] and
                    self.portfolio_service.has_alpaca_account_safe(user_id)
                )
            
            # Trading endpoints - only available in brokerage/hybrid mode with Alpaca accounts
            elif endpoint_type == "trading":
                return (
                    mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID] and
                    self.portfolio_service.has_alpaca_account_safe(user_id)
                )
            
            # Account management endpoints - always available for authenticated users
            elif endpoint_type == "account":
                return True
            
            # Default: endpoint not recognized
            else:
                logger.warning(f"Unknown endpoint type requested: {endpoint_type}")
                return False
                
        except Exception as e:
            logger.error(f"Error checking endpoint availability for user {user_id}, endpoint {endpoint_type}: {e}")
            return False

# Global service instance
safe_account_service = SafeAccountService()

def get_safe_account_service() -> SafeAccountService:
    """Get the global safe account service instance."""
    return safe_account_service

# Convenience functions for easy migration from existing code
def get_user_alpaca_account_id_safe(user_id: str) -> Optional[str]:
    """
    Drop-in replacement for get_user_alpaca_account_id that won't crash.
    
    Args:
        user_id: The user's ID
        
    Returns:
        Alpaca account ID if available, None otherwise (no exceptions)
    """
    return safe_account_service.get_user_account_id_safe(user_id, required=False)

def validate_user_account_access(user_id: str, account_id: str) -> bool:
    """
    Simple validation function for user account access.
    
    Args:
        user_id: The user's ID
        account_id: The account ID to validate
        
    Returns:
        True if user has access to the account
    """
    is_valid, _ = safe_account_service.validate_account_access(user_id, account_id)
    return is_valid
