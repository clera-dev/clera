#!/usr/bin/env python3
"""
Authorization Module

This module handles all authorization-related operations including:
- User account ownership verification
- Permission checks
- Access control validation

This follows separation of concerns by extracting authorization logic from the main API server.
"""

import logging
from typing import Optional

# Custom exception for authorization errors
class AuthorizationError(Exception):
    """
    Exception raised for authorization failures in the business logic layer.
    This decouples core logic from FastAPI and allows for framework-agnostic error handling.
    """
    def __init__(self, message, status_code=403):
        super().__init__(message)
        self.status_code = status_code

from utils.supabase.db_client import get_user_alpaca_account_id

logger = logging.getLogger(__name__)


class AuthorizationService:
    """
    Service class for handling authorization operations.
    Handles the business logic for access control and permissions.
    """
    
    @staticmethod
    def verify_user_account_ownership(account_id: str, user_id: str) -> str:
        """
        Verify that the specified user owns the specified account.
        This prevents unauthorized access to PII data and other account-specific resources.
        
        Args:
            account_id: The Alpaca account ID being accessed
            user_id: The user ID claiming ownership of the account
            
        Returns:
            The user_id if verification succeeds
            
        Raises:
            AuthorizationError: If verification fails
        """
        try:
            # Get the account ID that this user actually owns
            user_account_id = get_user_alpaca_account_id(user_id)
            
            if not user_account_id:
                logger.warning(f"User has no associated Alpaca account")
                raise AuthorizationError(message="User account not found", status_code=404)
            
            # Verify that the requested account ID matches the user's account ID
            if user_account_id != account_id:
                logger.warning(f"User attempted to access account but owns account")
                raise AuthorizationError(message="Unauthorized access to account", status_code=403)
            
            logger.info(f"Successfully verified user owns account")
            return user_id
            
        except AuthorizationError:
            raise
        except Exception as e:
            logger.error(f"Error verifying user account ownership: {e}")
            raise AuthorizationError(message="Error verifying account ownership", status_code=500)
    
    @staticmethod
    def get_user_account_id(user_id: str) -> Optional[str]:
        """
        Get the Alpaca account ID associated with a user.
        
        Args:
            user_id: The user ID to look up
            
        Returns:
            The Alpaca account ID if found, None otherwise
        """
        try:
            return get_user_alpaca_account_id(user_id)
        except Exception as e:
            logger.error(f"Error getting account ID for user: {e}")
            return None
    
    @staticmethod
    def verify_user_has_account(user_id: str) -> str:
        """
        Verify that a user has an associated Alpaca account.
        
        Args:
            user_id: The user ID to verify
            
        Returns:
            The user's Alpaca account ID if found
            
        Raises:
            AuthorizationError: If user has no associated account
        """
        account_id = AuthorizationService.get_user_account_id(user_id)
        
        if not account_id:
            logger.warning(f"User has no associated Alpaca account")
            raise AuthorizationError(message="User account not found", status_code=404)
        
        return account_id
    
    @staticmethod
    def verify_account_access(user_id: str, account_id: str) -> bool:
        """
        Verify that a user has access to a specific account.
        This is a boolean version of verify_user_account_ownership for cases
        where you want to check access without raising exceptions.
        
        Args:
            user_id: The user ID to check
            account_id: The account ID to check access for
            
        Returns:
            True if user has access, False otherwise
        """
        try:
            user_account_id = AuthorizationService.get_user_account_id(user_id)
            return user_account_id == account_id
        except Exception as e:
            logger.error(f"Error checking account access for user: {e}")
            return False 