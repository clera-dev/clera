"""
Account utilities shared across agents.
"""

import logging
import os
from typing import Optional
from langgraph.types import RunnableConfig
from langgraph.config import get_config

# Import our Supabase helper
from utils.supabase import get_user_alpaca_account_id

logger = logging.getLogger(__name__)

# REMOVED: Global module-level variables that were shared between users
# These were causing account data to be shared between different user sessions
# _LAST_VALID_ACCOUNT_ID = None
# _LAST_VALID_USER_ID = None

def get_account_id(config: RunnableConfig = None) -> str:
    """Get the account ID for the current user.

    SECURITY-CRITICAL FUNCTION: This function determines which Alpaca account
    the AI agent will access. It MUST return the correct account ID for the
    current user, or raise an exception to prevent data leakage.

    Strategy:
    1. Extract user_id from LangGraph config (primary method)
    2. Look up account_id in Supabase using the user_id
    3. If either fails, RAISE EXCEPTION (do NOT use fallback)

    Args:
        config: Optional RunnableConfig (automatically passed by LangGraph).

    Returns:
        str: Account ID for the current authenticated user.

    Raises:
        ValueError: If account ID cannot be securely determined.
        SecurityError: If authentication context is missing.
    """
    
    current_user_id = None
    current_account_id = None

    # ---- STRATEGY 1: Extract user context from LangGraph config ----
    retrieved_config = config
    if retrieved_config is None:
        try:
            retrieved_config = get_config()
            logger.debug(f"[Account Utils] Retrieved config via get_config()")
        except Exception as e:
            logger.warning(f"[Account Utils] Failed to get config via get_config(): {e}")
            retrieved_config = None

    if retrieved_config and isinstance(retrieved_config.get('configurable'), dict):
        configurable = retrieved_config['configurable']
        current_account_id = configurable.get('account_id')
        current_user_id = configurable.get('user_id')

        logger.info(f"[Account Utils] Config extracted - user_id: {current_user_id}, account_id: {current_account_id}")

        # If we have a direct account_id, validate it has an associated user_id
        if current_account_id and current_user_id:
            logger.info(f"[Account Utils] Using account_id from config: {current_account_id}")
            return current_account_id
        elif current_account_id and not current_user_id:
            logger.error(f"[Account Utils] SECURITY VIOLATION: account_id provided without user_id context")
            raise ValueError("Account ID provided without user authentication context")
        elif current_user_id and not current_account_id:
            logger.info(f"[Account Utils] User ID found ({current_user_id}), attempting Supabase lookup for account_id")
            # Continue to strategy 2
        else:
            logger.warning(f"[Account Utils] Config exists but lacks both user_id and account_id")
    else:
        logger.warning(f"[Account Utils] No valid config available")

    # ---- STRATEGY 2: Use User ID for Supabase Account Lookup ----
    if current_user_id:
        logger.info(f"[Account Utils] Attempting Supabase lookup for user_id: {current_user_id}")
        try:
            db_account_id = get_user_alpaca_account_id(current_user_id)
            if db_account_id:
                logger.info(f"[Account Utils] Successfully found account_id via Supabase: {db_account_id}")
                return db_account_id
            else:
                logger.error(f"[Account Utils] No Alpaca account found for user_id: {current_user_id}")
                raise ValueError(f"No Alpaca account found for user {current_user_id}")
        except Exception as e:
            logger.error(f"[Account Utils] Error during Supabase lookup for user {current_user_id}: {e}", exc_info=True)
            raise ValueError(f"Failed to retrieve account for user {current_user_id}: {str(e)}")

    # ---- SECURE FAILURE: No fallback account ----
    logger.error("[Account Utils] CRITICAL SECURITY ERROR: Cannot determine account ID - no valid user context")
    raise ValueError(
        "Cannot determine account ID: No user authentication context available. "
        "This request cannot be processed safely."
    )


def validate_account_access(account_id: str, user_id: str) -> bool:
    """Validate that a user has access to a specific account.
    
    Args:
        account_id: The Alpaca account ID to validate
        user_id: The Supabase user ID making the request
        
    Returns:
        bool: True if user has access, False otherwise
    """
    try:
        # Look up the account ID associated with this user
        user_account_id = get_user_alpaca_account_id(user_id)
        
        if user_account_id == account_id:
            logger.info(f"[Account Utils] Access validated: user {user_id} owns account {account_id}")
            return True
        else:
            logger.warning(f"[Account Utils] Access denied: user {user_id} does not own account {account_id}")
            return False
            
    except Exception as e:
        logger.error(f"[Account Utils] Error validating account access: {e}", exc_info=True)
        return False


def get_user_id_from_config(config: RunnableConfig = None) -> str:
    """Extract user ID from LangGraph config.
    
    Args:
        config: Optional RunnableConfig
        
    Returns:
        str: User ID
        
    Raises:
        ValueError: If user ID cannot be determined
    """
    retrieved_config = config
    if retrieved_config is None:
        try:
            retrieved_config = get_config()
        except Exception as e:
            logger.warning(f"[Account Utils] Failed to get config: {e}")
            raise ValueError("No configuration context available")

    if retrieved_config and isinstance(retrieved_config.get('configurable'), dict):
        user_id = retrieved_config['configurable'].get('user_id')
        if user_id:
            return user_id
    
    raise ValueError("No user ID found in configuration context") 