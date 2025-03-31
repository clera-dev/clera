#!/usr/bin/env python3
"""
Supabase client utility for fetching data from the database.
This provides helper functions to interact with user onboarding data,
particularly for retrieving Alpaca account IDs.
"""

import os
from typing import Dict, Any, Optional, Tuple, List
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

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
        
        logger.info(f"Fetching alpaca_account_id for user: {user_id}")
        
        # Query the user_onboarding table
        response = supabase.table("user_onboarding") \
            .select("alpaca_account_id") \
            .eq("user_id", user_id) \
            .execute()
        
        # Extract the Alpaca account ID
        data = response.data
        
        # Log the raw response data for debugging
        logger.info(f"Supabase response data: {data}")
        
        if not data or len(data) == 0:
            logger.warning(f"No user_onboarding record found for user: {user_id}")
            return None
            
        account_id = data[0].get("alpaca_account_id") if data and len(data) > 0 else None
        
        if not account_id:
            logger.warning(f"alpaca_account_id is null or empty for user: {user_id}")
            return None
        
        logger.info(f"Successfully found Alpaca account ID for user {user_id}: {account_id}")
        return account_id
    
    except Exception as e:
        logger.error(f"Error fetching Alpaca account ID for user {user_id}: {e}", exc_info=True)
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
            logger.info(f"Found user ID for email {email}: {user_id}")
            return user_id
        
        return None
    
    except Exception as e:
        logger.error(f"Error fetching user ID for email {email}: {e}")
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
            logger.warning(f"No onboarding data found for user: {user_id}")
            return None
        
        return data
    
    except Exception as e:
        logger.error(f"Error fetching user data for user {user_id}: {e}")
        return None


def save_conversation(user_id: str, portfolio_id: str, message: str, response: str) -> Dict[str, Any]:
    """
    Save a conversation entry to the database.
    
    Args:
        user_id (str): The user's Supabase ID
        portfolio_id (str): The Alpaca account ID
        message (str): The user's message
        response (str): The assistant's response
        
    Returns:
        Dict[str, Any]: The created conversation entry or None if error
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Insert the conversation
        result = supabase.table("conversations").insert({
            "user_id": user_id,
            "portfolio_id": portfolio_id,
            "message": message,
            "response": response
        }).execute()
        
        # Check if insert was successful
        if result.data and len(result.data) > 0:
            logger.info(f"Saved conversation for user {user_id} with portfolio {portfolio_id}")
            return result.data[0]
        else:
            logger.warning(f"No data returned when saving conversation for user {user_id}")
            return None
    
    except Exception as e:
        logger.error(f"Error saving conversation for user {user_id}: {e}")
        return None


def get_user_conversations(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Get conversation history for a specific user.
    
    Args:
        user_id (str): The user's Supabase ID
        limit (int): Maximum number of conversations to retrieve
        
    Returns:
        List[Dict[str, Any]]: List of conversation entries, newest first
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query the conversations table
        response = supabase.table("conversations") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        
        # Return the conversation data
        if response.data:
            logger.info(f"Retrieved {len(response.data)} conversations for user {user_id}")
            return response.data
        else:
            logger.info(f"No conversations found for user {user_id}")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving conversations for user {user_id}: {e}")
        return []


def get_portfolio_conversations(user_id: str, portfolio_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Get conversation history for a specific user and portfolio.
    
    Args:
        user_id (str): The user's Supabase ID
        portfolio_id (str): The Alpaca account ID
        limit (int): Maximum number of conversations to retrieve
        
    Returns:
        List[Dict[str, Any]]: List of conversation entries, newest first
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query the conversations table
        response = supabase.table("conversations") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("portfolio_id", portfolio_id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        
        # Return the conversation data
        if response.data:
            logger.info(f"Retrieved {len(response.data)} conversations for user {user_id} with portfolio {portfolio_id}")
            return response.data
        else:
            logger.info(f"No conversations found for user {user_id} with portfolio {portfolio_id}")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving conversations for user {user_id} with portfolio {portfolio_id}: {e}")
        return []


def create_chat_session(user_id: str, portfolio_id: str, title: str) -> Optional[Dict[str, Any]]:
    """
    Create a new chat session for a user.
    
    Args:
        user_id (str): The user's Supabase ID
        portfolio_id (str): The Alpaca account ID
        title (str): The title of the chat session
        
    Returns:
        Optional[Dict[str, Any]]: The created chat session or None if error
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Insert the chat session
        result = supabase.table("chat_sessions").insert({
            "user_id": user_id,
            "portfolio_id": portfolio_id,
            "title": title
        }).execute()
        
        # Check if insert was successful
        if result.data and len(result.data) > 0:
            logger.info(f"Created chat session for user {user_id} with portfolio {portfolio_id}")
            return result.data[0]
        else:
            logger.warning(f"No data returned when creating chat session for user {user_id}")
            return None
    
    except Exception as e:
        logger.error(f"Error creating chat session for user {user_id}: {e}")
        return None


def get_chat_sessions(user_id: str, portfolio_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get all chat sessions for a user, optionally filtered by portfolio ID.
    
    Args:
        user_id (str): The user's Supabase ID
        portfolio_id (Optional[str]): The Alpaca account ID (optional filter)
        
    Returns:
        List[Dict[str, Any]]: List of chat sessions
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Start the query
        query = supabase.table("chat_sessions") \
            .select("*") \
            .eq("user_id", user_id)
        
        # Add portfolio filter if provided
        if portfolio_id:
            query = query.eq("portfolio_id", portfolio_id)
        
        # Execute the query
        response = query.order("created_at", desc=True).execute()
        
        # Return the chat sessions
        if response.data:
            logger.info(f"Retrieved {len(response.data)} chat sessions for user {user_id}")
            return response.data
        else:
            logger.info(f"No chat sessions found for user {user_id}")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving chat sessions for user {user_id}: {e}")
        return []


def get_conversations_by_session(session_id: str) -> List[Dict[str, Any]]:
    """
    Get all conversations for a specific chat session.
    
    Args:
        session_id (str): The chat session ID
        
    Returns:
        List[Dict[str, Any]]: List of conversations in the session
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query the conversations table
        response = supabase.table("conversations") \
            .select("*") \
            .eq("session_id", session_id) \
            .order("created_at", asc=True) \
            .execute()
        
        # Return the conversations
        if response.data:
            logger.info(f"Retrieved {len(response.data)} conversations for session {session_id}")
            return response.data
        else:
            logger.info(f"No conversations found for session {session_id}")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving conversations for session {session_id}: {e}")
        return []


def delete_chat_session(user_id: str, session_id: str) -> bool:
    """
    Delete a chat session and all its conversations.
    
    Args:
        user_id (str): The user's Supabase ID (for validation)
        session_id (str): The chat session ID to delete
        
    Returns:
        bool: True if deleted successfully, False otherwise
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # First verify that the session belongs to the user
        verify_response = supabase.table("chat_sessions") \
            .select("id") \
            .eq("id", session_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not verify_response.data or len(verify_response.data) == 0:
            logger.warning(f"User {user_id} attempted to delete session {session_id} which doesn't belong to them")
            return False
        
        # Delete the session (will cascade to conversations)
        delete_response = supabase.table("chat_sessions") \
            .delete() \
            .eq("id", session_id) \
            .execute()
        
        logger.info(f"Deleted chat session {session_id} for user {user_id}")
        return True
    
    except Exception as e:
        logger.error(f"Error deleting chat session {session_id} for user {user_id}: {e}")
        return False


def save_conversation_with_session(user_id: str, portfolio_id: str, message: str, response: str, session_id: str) -> Optional[Dict[str, Any]]:
    """
    Save a conversation to a specific chat session.
    
    Args:
        user_id (str): The user's Supabase ID
        portfolio_id (str): The Alpaca account ID
        message (str): The user's message
        response (str): The assistant's response
        session_id (str): The chat session ID
        
    Returns:
        Optional[Dict[str, Any]]: The created conversation or None if error
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Verify session exists and belongs to user
        verify_response = supabase.table("chat_sessions") \
            .select("id") \
            .eq("id", session_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not verify_response.data or len(verify_response.data) == 0:
            logger.warning(f"User {user_id} attempted to save to session {session_id} which doesn't belong to them")
            return None
        
        # Insert the conversation
        result = supabase.table("conversations").insert({
            "user_id": user_id,
            "portfolio_id": portfolio_id,
            "message": message,
            "response": response,
            "session_id": session_id
        }).execute()
        
        # Check if insert was successful
        if result.data and len(result.data) > 0:
            logger.info(f"Saved conversation to session {session_id} for user {user_id}")
            return result.data[0]
        else:
            logger.warning(f"No data returned when saving conversation to session {session_id}")
            return None
    
    except Exception as e:
        logger.error(f"Error saving conversation to session {session_id} for user {user_id}: {e}")
        return None


def conversations_to_messages(conversations: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Convert a list of database conversation records to chat messages."""
    messages: List[Dict[str, str]] = []
    
    # Sort conversations by created_at (oldest first)
    sorted_conversations = sorted(
        conversations,
        key=lambda conv: conv.get('created_at', '1970-01-01T00:00:00+00:00')
    )
    
    # Convert each conversation to a pair of messages
    for conversation in sorted_conversations:
        if conversation.get('message'):
            messages.append({"role": 'user', "content": conversation['message']})
        if conversation.get('response'):
            messages.append({"role": 'assistant', "content": conversation['response']})
            
    return messages 