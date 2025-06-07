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

# Module-level variable to store the last valid account ID
_LAST_VALID_ACCOUNT_ID = None
_LAST_VALID_USER_ID = None

def get_account_id(config: RunnableConfig = None) -> str:
    """Get the account ID for the human.

    Primarily uses get_config() when running in LangGraph Cloud.
    Falls back to last known ID or Supabase lookup if needed.

    Args:
        config: Optional RunnableConfig (automatically passed or retrieved).

    Returns:
        str: Account ID to use for operations.
    """
    global _LAST_VALID_ACCOUNT_ID, _LAST_VALID_USER_ID

    current_user_id = None
    current_account_id = None

    # ---- STRATEGY 1: Use get_config() (Primary for LangGraph Cloud) ----
    retrieved_config = config
    if retrieved_config is None:
        try:
            retrieved_config = get_config()
            logger.info(f"[Account Utils] Retrieved config via get_config(): {retrieved_config}")
        except Exception as e:
            logger.warning(f"[Account Utils] Failed to get config via get_config(), proceeding with fallback strategies: {e}")
            retrieved_config = None

    if retrieved_config and isinstance(retrieved_config.get('configurable'), dict):
        configurable = retrieved_config['configurable']
        current_account_id = configurable.get('account_id')
        current_user_id = configurable.get('user_id') # Get user_id as well

        if current_account_id:
            logger.info(f"[Account Utils] Using account_id from config: {current_account_id}")
            _LAST_VALID_ACCOUNT_ID = current_account_id
            if current_user_id: _LAST_VALID_USER_ID = current_user_id
            return current_account_id
        elif current_user_id:
            _LAST_VALID_USER_ID = current_user_id
            logger.info(f"[Account Utils] User ID found in config ({current_user_id}), but no account_id. Will try Supabase lookup.")
        else:
            logger.info(f"[Account Utils] Config retrieved but lacks account_id and user_id.")
    else:
        logger.info(f"[Account Utils] No valid config retrieved via get_config() or passed argument.")

    # ---- STRATEGY 2: Use User ID (from config if available) for Supabase Lookup ----
    if current_user_id:
        logger.info(f"[Account Utils] Attempting Supabase lookup for user_id from config: {current_user_id}")
        try:
            db_account_id = get_user_alpaca_account_id(current_user_id)
            if db_account_id:
                logger.info(f"[Account Utils] Found account_id via Supabase: {db_account_id}")
                _LAST_VALID_ACCOUNT_ID = db_account_id
                return db_account_id
            else:
                 logger.warning(f"[Account Utils] Supabase lookup failed for user_id: {current_user_id}")
        except Exception as e:
            logger.error(f"[Account Utils] Error during Supabase lookup for {current_user_id}: {e}", exc_info=True)

    # ---- STRATEGY 3: Use last known valid account_id ----
    if _LAST_VALID_ACCOUNT_ID:
        logger.info(f"[Account Utils] Using last known valid account_id: {_LAST_VALID_ACCOUNT_ID}")
        return _LAST_VALID_ACCOUNT_ID

    # ---- STRATEGY 4: Try to get account_id from last known user_id ----
    if _LAST_VALID_USER_ID:
        logger.info(f"[Account Utils] Attempting Supabase lookup for last known user_id: {_LAST_VALID_USER_ID}")
        try:
            db_account_id = get_user_alpaca_account_id(_LAST_VALID_USER_ID)
            if db_account_id:
                logger.info(f"[Account Utils] Found account_id via Supabase (last known user): {db_account_id}")
                _LAST_VALID_ACCOUNT_ID = db_account_id
                return db_account_id
        except Exception as e:
             logger.error(f"[Account Utils] Error during Supabase lookup for last known user {_LAST_VALID_USER_ID}: {e}", exc_info=True)

    # ---- FALLBACK ----
    fallback_account_id = "4a045111-ef77-46aa-9f33-6002703376f6" # static account id for testing
    logger.error("[Account Utils] CRITICAL: Using fallback account_id - all retrieval strategies failed")
    return fallback_account_id 