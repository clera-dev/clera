#!/usr/bin/env python3
"""
Supabase client utility for fetching data from the database.
This provides helper functions to interact with user onboarding data,
particularly for retrieving Alpaca account IDs.
"""

import os
from typing import Dict, Any, Optional, Tuple, List
import logging
import json
from uuid import UUID
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_service_key:
    logger.error("Supabase URL or service role key not found in environment variables")

class CustomJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle UUID and other non-serializable objects."""
    def default(self, obj):
        if isinstance(obj, UUID):
            return str(obj)
        elif hasattr(obj, '__dict__'):
            return str(obj)
        elif hasattr(obj, 'isoformat'):  # datetime objects
            return obj.isoformat()
        return super().default(obj)


def get_supabase_client() -> Client:
    """
    Create and return a Supabase client using the service role key.
    This provides admin access to the database for server-side operations.
    
    Returns:
        Client: Initialized Supabase client
    """
    try:
        return create_client(supabase_url, supabase_service_key)
    except Exception as e:
        logger.error(f"Failed to create Supabase client: {e}")
        raise


def get_user_alpaca_account_id(user_id: str) -> Optional[str]:
    """
    Retrieve the Alpaca account ID for a specific user from the user_onboarding table.
    
    Args:
        user_id (str): The Supabase user ID
        
    Returns:
        Optional[str]: The Alpaca account ID or None if not found
    """
    if not user_id:
        logger.warning("Empty user_id provided to get_user_alpaca_account_id")
        return None
        
    try:
        # Create Supabase client
        supabase = get_supabase_client()
                
        # Query the user_onboarding table
        response = supabase.table("user_onboarding") \
            .select("alpaca_account_id") \
            .eq("user_id", user_id) \
            .execute()
        
        # Extract the Alpaca account ID
        data = response.data
        
        # Log the response structure for debugging (without sensitive data)
        logger.info(f"Supabase response received for user, data present: {data is not None}")
        
        if not data or len(data) == 0:
            logger.warning(f"No user_onboarding record found for user")
            return None
            
        account_id = data[0].get("alpaca_account_id") if data and len(data) > 0 else None
        
        if not account_id:
            logger.warning(f"alpaca_account_id is null or empty for user")
            return None
        
        logger.info(f"Successfully found Alpaca account ID for user")
        return account_id
    
    except Exception as e:
        logger.error(f"Error fetching Alpaca account ID for user: {e}", exc_info=True)
        return None


def get_user_id_from_email(email: str) -> Optional[str]:
    """
    Retrieve the user ID for a given email address.
    
    Args:
        email (str): The user's email address
        
    Returns:
        Optional[str]: The user ID or None if not found
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query the auth.users table
        response = supabase.rpc(
            "get_user_id_by_email", 
            {"email_input": email}
        ).execute()
        
        data = response.data
        
        if not data or len(data) == 0:
            logger.warning(f"No user found with email: {email}")
            return None
        
        user_id = data[0]["id"] if isinstance(data, list) and len(data) > 0 else None
        
        if user_id:
            logger.info(f"Found user ID for email")
            return user_id
        
        return None
    
    except Exception as e:
        logger.error(f"Error fetching user ID for email (redacted): {e}")
        return None


def get_alpaca_account_id_by_email(email: str) -> Optional[str]:
    """
    Retrieve the Alpaca account ID for a user with the given email.
    This is a convenience function that combines get_user_id_from_email and get_user_alpaca_account_id.
    
    Args:
        email (str): The user's email address
        
    Returns:
        Optional[str]: The Alpaca account ID or None if not found
    """
    user_id = get_user_id_from_email(email)
    if not user_id:
        return None
    
    return get_user_alpaca_account_id(user_id)


def get_user_data(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get complete user onboarding data for a specific user.
    
    Args:
        user_id (str): The Supabase user ID
        
    Returns:
        Optional[Dict[str, Any]]: User onboarding data or None if not found
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query the user_onboarding table
        response = supabase.table("user_onboarding") \
            .select("*") \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        
        data = response.data
        
        if not data:
            logger.warning(f"No onboarding data found for user")
            return None
        
        return data
    
    except Exception as e:
        logger.error(f"Error fetching user data for user: {e}")
        return None


def save_conversation(user_id: str, portfolio_id: str, message: str, response: str) -> Dict[str, Any]:
    """
    Save a conversation to the database.
    
    Args:
        user_id (str): The user ID
        portfolio_id (str): The portfolio ID
        message (str): The user's message
        response (str): The assistant's response
        
    Returns:
        Dict[str, Any]: The saved conversation data
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Prepare conversation data
        conversation_data = {
            "user_id": user_id,
            "portfolio_id": portfolio_id,
            "message": message,
            "response": response,
            "created_at": datetime.now().isoformat()
        }
        
        # Insert the conversation
        result = supabase.table("conversations").insert(conversation_data).execute()
        
        if result.data and len(result.data) > 0:
            logger.info(f"Saved conversation for user (redacted)")
            return result.data[0]
        else:
            logger.warning(f"No data returned when saving conversation for user (redacted)")
            return {}
    
    except Exception as e:
        logger.error(f"Error saving conversation for user (redacted): {e}")
        return {}


def get_user_conversations(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Retrieve conversations for a specific user.
    
    Args:
        user_id (str): The user ID
        limit (int): Maximum number of conversations to retrieve
        
    Returns:
        List[Dict[str, Any]]: List of conversation records
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query conversations for the user
        response = supabase.table("conversations") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        
        if response.data:
            logger.info(f"Retrieved {len(response.data)} conversations for user (redacted)")
            return response.data
        else:
            logger.info(f"No conversations found for user (redacted)")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving conversations for user (redacted): {e}")
        return []


def get_portfolio_conversations(user_id: str, portfolio_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Retrieve conversations for a specific user and portfolio.
    
    Args:
        user_id (str): The user ID
        portfolio_id (str): The portfolio ID
        limit (int): Maximum number of conversations to retrieve
        
    Returns:
        List[Dict[str, Any]]: List of conversation records
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query conversations for the user and portfolio
        response = supabase.table("conversations") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("portfolio_id", portfolio_id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        
        if response.data:
            logger.info(f"Retrieved {len(response.data)} conversations for user and portfolio")
            return response.data
        else:
            logger.info(f"No conversations found for user and portfolio")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving portfolio conversations for user: {e}")
        return []



def update_user_onboarding_data(user_id: str, updated_fields: Dict[str, Any]) -> bool:
    """
    Update specific fields in the user's onboarding_data JSON column.
    This is used to sync changes made via Alpaca API back to Supabase.
    
    Args:
        user_id (str): The Supabase user ID
        updated_fields (Dict[str, Any]): Dictionary of fields to update in onboarding_data
        
    Returns:
        bool: True if update was successful, False otherwise
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        logger.info(f"Updating onboarding data for user")
        logger.info(f"Fields to update (keys only): {list(updated_fields.keys())}")
        
        # First, get the current onboarding data
        response = supabase.table("user_onboarding") \
            .select("onboarding_data") \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        
        if not response.data:
            logger.error(f"No onboarding data found for user")
            return False
        
        current_data = response.data.get("onboarding_data", {})
        
        # Update the specific fields
        updated_data = (current_data or {}).copy()
        for field_path, new_value in updated_fields.items():
            # Handle nested field paths like "contact.email"
            if "." in field_path:
                parts = field_path.split(".")
                current = updated_data
                for part in parts[:-1]:
                    if part not in current:
                        current[part] = {}
                    current = current[part]
                current[parts[-1]] = new_value
            else:
                updated_data[field_path] = new_value
        
        # Update the onboarding_data column
        update_response = supabase.table("user_onboarding") \
            .update({"onboarding_data": updated_data}) \
            .eq("user_id", user_id) \
            .execute()
        
        if update_response.data:
            logger.info(f"Successfully updated onboarding data for user")
            return True
        else:
            logger.error(f"Failed to update onboarding data for user")
            return False
    
    except Exception as e:
        logger.error(f"Error updating onboarding data for user: {e}", exc_info=True)
        return False


def get_user_id_by_alpaca_account_id(alpaca_account_id: str) -> Optional[str]:
    """
    Retrieve the user ID for a given Alpaca account ID.
    
    Args:
        alpaca_account_id (str): The Alpaca account ID
        
    Returns:
        Optional[str]: The user ID or None if not found
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query the user_onboarding table
        response = supabase.table("user_onboarding") \
            .select("user_id") \
            .eq("alpaca_account_id", alpaca_account_id) \
            .single() \
            .execute()
        
        data = response.data
        
        if not data:
            logger.warning(f"No user found with Alpaca account ID")
            return None
        
        user_id = data.get("user_id")
        
        if user_id:
            logger.info(f"Found user ID for Alpaca account")
            return user_id
        
        return None
    
    except Exception as e:
        logger.error(f"Error fetching user ID for Alpaca account: {e}")
        return None 