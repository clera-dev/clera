"""
WebSocket Authorization Service

Production-grade authorization service for websocket connections that safely handles
different portfolio modes without breaking existing functionality.
"""

import logging
from typing import Optional, Dict, Any, Tuple
from utils.portfolio.portfolio_mode_service import get_portfolio_mode_service, PortfolioMode
from utils.supabase.db_client import get_user_alpaca_account_id

logger = logging.getLogger(__name__)

class WebSocketAuthorizationService:
    """
    Safe websocket authorization that handles all portfolio modes.
    Prevents crashes for aggregation-only users while maintaining security.
    """
    
    def __init__(self):
        self.portfolio_service = get_portfolio_mode_service()
    
    def authorize_websocket_connection(self, user_id: str, account_id: str) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Authorize a websocket connection for portfolio updates.
        
        Args:
            user_id: The authenticated user's ID
            account_id: The account ID being requested for connection
            
        Returns:
            Tuple of (authorized: bool, error_message: Optional[str], metadata: dict)
        """
        try:
            logger.info(f"Authorizing websocket connection for user {user_id}, account {account_id}")
            
            # Get authorization info from portfolio mode service
            auth_info = self.portfolio_service.get_websocket_authorization_mode(user_id, account_id)
            
            if not auth_info["authorized"]:
                error_msg = auth_info.get("error", "Unauthorized")
                logger.warning(f"WebSocket authorization failed for user {user_id}, account {account_id}: {error_msg}")
                return False, error_msg, auth_info
            
            logger.info(f"WebSocket authorization successful for user {user_id}, account {account_id}, mode: {auth_info['mode']}, type: {auth_info['account_type']}")
            
            return True, None, auth_info
            
        except Exception as e:
            error_msg = f"WebSocket authorization error: {str(e)}"
            logger.error(f"Error authorizing websocket for user {user_id}, account {account_id}: {e}", exc_info=True)
            return False, error_msg, {"error": error_msg}
    
    def get_account_authorization_legacy(self, user_id: str, requested_account_id: str) -> Tuple[bool, Optional[str]]:
        """
        Legacy authorization method for backward compatibility.
        This maintains the old behavior for existing Alpaca-based connections.
        
        Args:
            user_id: The authenticated user's ID  
            requested_account_id: The account ID being requested
            
        Returns:
            Tuple of (authorized: bool, error_message: Optional[str])
        """
        try:
            # Check if user has Alpaca account (legacy behavior)
            alpaca_account_id = get_user_alpaca_account_id(user_id)
            
            if not alpaca_account_id:
                # User doesn't have Alpaca account - this would have failed in old system
                return False, "No Alpaca account found"
            
            if alpaca_account_id != requested_account_id:
                # Account mismatch - this would have failed in old system  
                return False, f"Account mismatch: user owns {alpaca_account_id}, requested {requested_account_id}"
            
            return True, None
            
        except Exception as e:
            logger.error(f"Legacy authorization error for user {user_id}: {e}")
            return False, f"Authorization lookup failed: {str(e)}"
    
    def should_use_legacy_authorization(self, user_id: str, account_id: str) -> bool:
        """
        Determine if legacy authorization should be used.
        This helps with gradual migration and testing.
        
        Args:
            user_id: The user's ID
            account_id: The account ID
            
        Returns:
            True if legacy authorization should be used
        """
        try:
            mode = self.portfolio_service.get_user_portfolio_mode(user_id)
            
            # Use legacy for pure brokerage mode users
            return mode == PortfolioMode.BROKERAGE
            
        except Exception as e:
            logger.error(f"Error determining authorization mode for user {user_id}: {e}")
            # Default to legacy for safety
            return True

# Global service instance
websocket_auth_service = WebSocketAuthorizationService()

def get_websocket_auth_service() -> WebSocketAuthorizationService:
    """Get the global websocket authorization service instance.""" 
    return websocket_auth_service

def authorize_websocket_connection_safe(user_id: str, account_id: str) -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Safe websocket connection authorization function.
    This is the main function that should be used in websocket_server.py
    
    Args:
        user_id: The authenticated user's ID
        account_id: The account ID being requested
        
    Returns:
        Tuple of (authorized: bool, error_message: Optional[str], metadata: dict)
    """
    return websocket_auth_service.authorize_websocket_connection(user_id, account_id)
