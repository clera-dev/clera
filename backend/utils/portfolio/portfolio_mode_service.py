"""
Portfolio Mode Service

This service provides production-grade abstractions for handling different portfolio modes
(aggregation, brokerage, hybrid) without breaking existing functionality.
"""

import os
import logging
from typing import Optional, Dict, Any, List
from enum import Enum
from utils.feature_flags import get_feature_flags
from utils.supabase.db_client import get_user_alpaca_account_id

logger = logging.getLogger(__name__)

class PortfolioMode(Enum):
    """Portfolio mode enumeration."""
    AGGREGATION = "aggregation"
    BROKERAGE = "brokerage" 
    HYBRID = "hybrid"
    DISABLED = "disabled"

class PortfolioModeService:
    """
    Production-grade service for handling different portfolio modes safely.
    Prevents crashes for aggregation-only users while preserving existing functionality.
    """
    
    def __init__(self):
        self.feature_flags = get_feature_flags()
    
    def get_user_portfolio_mode(self, user_id: str) -> PortfolioMode:
        """
        Determine the portfolio mode for a specific user.
        
        Args:
            user_id: The user's ID
            
        Returns:
            PortfolioMode enum value
        """
        try:
            # Check feature flags first
            global_mode = self.feature_flags.get_portfolio_mode(user_id)
            
            if global_mode == "aggregation":
                return PortfolioMode.AGGREGATION
            elif global_mode == "brokerage":
                # For backward compatibility, check if user has Alpaca account
                has_alpaca_account = self.has_alpaca_account_safe(user_id)
                return PortfolioMode.BROKERAGE if has_alpaca_account else PortfolioMode.AGGREGATION
            elif global_mode == "hybrid":
                # For backward compatibility, check if user has Alpaca account
                has_alpaca_account = self.has_alpaca_account_safe(user_id)
                return PortfolioMode.HYBRID if has_alpaca_account else PortfolioMode.AGGREGATION
            elif global_mode == "disabled":
                return PortfolioMode.DISABLED
            else:
                # Unknown mode - check if user has Alpaca account as fallback
                has_alpaca_account = self.has_alpaca_account_safe(user_id)
                return PortfolioMode.BROKERAGE if has_alpaca_account else PortfolioMode.AGGREGATION
                
        except Exception as e:
            logger.error(f"Error determining portfolio mode for user {user_id}: {e}")
            # Safe fallback: if user has Alpaca account, use brokerage mode
            return PortfolioMode.BROKERAGE if self.has_alpaca_account_safe(user_id) else PortfolioMode.AGGREGATION
    
    def has_alpaca_account_safe(self, user_id: str) -> bool:
        """
        Safely check if user has an Alpaca account without raising exceptions.
        
        Args:
            user_id: The user's ID
            
        Returns:
            True if user has Alpaca account, False otherwise
        """
        try:
            alpaca_account_id = get_user_alpaca_account_id(user_id)
            return bool(alpaca_account_id)
        except Exception as e:
            logger.warning(f"Error checking Alpaca account for user {user_id}: {e}")
            return False
    
    def get_alpaca_account_id_safe(self, user_id: str) -> Optional[str]:
        """
        Safely get user's Alpaca account ID with proper error handling.
        
        Args:
            user_id: The user's ID
            
        Returns:
            Alpaca account ID if exists and accessible, None otherwise
        """
        try:
            mode = self.get_user_portfolio_mode(user_id)
            
            # Only try to get Alpaca ID for modes that should have it
            if mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID]:
                return get_user_alpaca_account_id(user_id)
            else:
                logger.debug(f"User {user_id} in {mode.value} mode, skipping Alpaca account lookup")
                return None
                
        except Exception as e:
            logger.warning(f"Error getting Alpaca account ID for user {user_id}: {e}")
            return None
    
    def should_enable_realtime_updates(self, user_id: str) -> bool:
        """
        Determine if real-time updates should be enabled for a user.
        
        Args:
            user_id: The user's ID
            
        Returns:
            True if real-time updates should be enabled
        """
        try:
            mode = self.get_user_portfolio_mode(user_id)
            
            # Enable real-time for brokerage and hybrid modes with Alpaca accounts
            if mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID]:
                return self.has_alpaca_account_safe(user_id)
            
            # For aggregation mode, could enable limited real-time updates in future
            # For now, disable to prevent crashes
            return False
            
        except Exception as e:
            logger.error(f"Error determining real-time updates setting for user {user_id}: {e}")
            return False
    
    def get_portfolio_data_sources(self, user_id: str) -> List[str]:
        """
        Get the data sources that should be used for a user's portfolio.
        
        Args:
            user_id: The user's ID
            
        Returns:
            List of data source names
        """
        try:
            mode = self.get_user_portfolio_mode(user_id)
            
            if mode == PortfolioMode.AGGREGATION:
                return ["plaid"]
            elif mode == PortfolioMode.BROKERAGE:
                return ["alpaca"] if self.has_alpaca_account_safe(user_id) else ["plaid"]
            elif mode == PortfolioMode.HYBRID:
                sources = []
                if self.has_alpaca_account_safe(user_id):
                    sources.append("alpaca")
                sources.append("plaid")  # Always include Plaid in hybrid mode
                return sources
            else:
                return []
                
        except Exception as e:
            logger.error(f"Error determining data sources for user {user_id}: {e}")
            return []
    
    def get_websocket_authorization_mode(self, user_id: str, account_id: str) -> Dict[str, Any]:
        """
        Get websocket authorization information for a user and account.
        
        Args:
            user_id: The user's ID
            account_id: The account ID being requested
            
        Returns:
            Dictionary with authorization info
        """
        try:
            mode = self.get_user_portfolio_mode(user_id)
            
            result = {
                "authorized": False,
                "mode": mode.value,
                "account_type": None,
                "error": None
            }
            
            if mode == PortfolioMode.DISABLED:
                result["error"] = "Portfolio features disabled"
                return result
            
            if mode in [PortfolioMode.BROKERAGE, PortfolioMode.HYBRID]:
                # Check if this is an Alpaca account ID
                alpaca_account_id = self.get_alpaca_account_id_safe(user_id)
                if alpaca_account_id and alpaca_account_id == account_id:
                    result["authorized"] = True
                    result["account_type"] = "alpaca"
                    return result
            
            # For aggregation mode or hybrid mode with Plaid accounts
            if mode in [PortfolioMode.AGGREGATION, PortfolioMode.HYBRID]:
                # SECURITY FIX: Verify user owns the requested Plaid account
                # Don't authorize based solely on ID prefix - verify ownership in database
                if account_id == "aggregated":
                    # Allow access to aggregated view (all user's accounts)
                    result["authorized"] = True
                    result["account_type"] = "plaid"
                    return result
                elif account_id.startswith("plaid_"):
                    # SECURITY FIX: Verify user owns this specific Plaid account
                    # Prevent IDOR where users could subscribe to other users' Plaid portfolios
                    from utils.supabase.db_client import get_supabase_client
                    supabase = get_supabase_client()
                    ownership_check = supabase.table('user_investment_accounts')\
                        .select('id')\
                        .eq('user_id', user_id)\
                        .eq('id', account_id)\
                        .eq('provider', 'plaid')\
                        .execute()
                    
                    if ownership_check.data and len(ownership_check.data) > 0:
                        result["authorized"] = True
                        result["account_type"] = "plaid"
                        return result
                    else:
                        result["error"] = f"User {user_id} does not own Plaid account {account_id}"
                        return result
            
            result["error"] = f"Account {account_id} not authorized for user {user_id} in {mode.value} mode"
            return result
            
        except Exception as e:
            logger.error(f"Error in websocket authorization for user {user_id}, account {account_id}: {e}")
            return {
                "authorized": False,
                "mode": "unknown",
                "account_type": None,
                "error": f"Authorization error: {str(e)}"
            }

# Global service instance
portfolio_mode_service = PortfolioModeService()

def get_portfolio_mode_service() -> PortfolioModeService:
    """Get the global portfolio mode service instance."""
    return portfolio_mode_service
