#!/usr/bin/env python3
"""
Supabase client utility for fetching data from the database.
This provides helper functions to interact with user onboarding data,
particularly for retrieving Alpaca account IDs.
"""

import os
from typing import Dict, Any, Optional, Tuple, List
import logging
import hashlib
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


def _remove_timestamp_fields(data: Any) -> Any:
    """
    Recursively remove timestamp fields from data to enable proper deduplication.
    
    This function removes fields that contain timestamps to ensure that logs
    with the same content but different timestamps are considered duplicates.
    
    Args:
        data: The data to process (dict, list, or primitive)
        
    Returns:
        The data with timestamp fields removed
    """
    if isinstance(data, dict):
        # Remove timestamp-related fields
        timestamp_fields = {'timestamp', 'created_at', 'updated_at', 'date', 'time', 'datetime'}
        cleaned_data = {}
        for key, value in data.items():
            if key.lower() not in timestamp_fields:
                cleaned_data[key] = _remove_timestamp_fields(value)
        return cleaned_data
    elif isinstance(data, list):
        return [_remove_timestamp_fields(item) for item in data]
    else:
        return data


def save_account_closure_log(
    account_id: str,
    step_name: str,
    log_level: str,
    message: str,
    data: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Save an account closure log entry to the database with industry-grade hash-based deduplication.
    
    This function implements comprehensive deduplication using content hashing:
    1. Creates a unique hash of the log content (account_id + step_name + log_level + message + data)
    2. Checks for existing logs with the same hash
    3. Only inserts if the hash is unique
    4. Handles complex data structures reliably
    5. Removes timestamp fields to prevent timestamp-based duplicates
    
    Benefits:
    - No JSON serialization issues
    - Fast hash-based lookups
    - Handles complex nested data structures
    - True content-based deduplication
    - Timestamp-agnostic deduplication
    
    Args:
        account_id (str): The Alpaca account ID
        step_name (str): The closure step (e.g., 'INITIATION', 'LIQUIDATION')
        log_level (str): Log level (INFO, DEBUG, ERROR, WARNING)
        message (str): The log message
        data (Optional[Dict[str, Any]]): Additional structured data
        user_id (Optional[str]): The Supabase user ID (if available)
        
    Returns:
        Optional[Dict[str, Any]]: The created log entry or None if duplicate/error
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Prepare data for hashing (normalize JSON and remove timestamps)
        normalized_data = data or {}
        
        # Remove timestamp fields for deduplication
        deduplication_data = _remove_timestamp_fields(normalized_data)
        
        # Clean message for deduplication (remove timestamp patterns)
        deduplication_message = message
        import re
        # Remove timestamp patterns like "2025-07-10T11:53:27.726232"
        timestamp_pattern = r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?'
        deduplication_message = re.sub(timestamp_pattern, '[TIMESTAMP]', message)
        
        # Create content hash for deduplication (without timestamps)
        # This ensures we can detect exact duplicates regardless of data complexity
        content_string = f"{account_id}|{step_name}|{log_level}|{deduplication_message}|{json.dumps(deduplication_data, sort_keys=True, cls=CustomJSONEncoder)}"
        content_hash = hashlib.sha256(content_string.encode('utf-8')).hexdigest()
        
        # INDUSTRY-GRADE DEDUPLICATION: Check for existing hash
        # This is much more reliable than trying to compare complex JSON in queries
        existing_log_query = supabase.table("account_closure_logs") \
            .select("id") \
            .eq("content_hash", content_hash) \
            .limit(1) \
            .execute()
        
        if existing_log_query.data:
            # Exact duplicate found - skip logging
            logger.debug(f"Skipping duplicate log entry for {account_id}: {step_name} (hash: {content_hash[:8]}...)")
            return None
        
        # Prepare log entry with hash
        log_entry = {
            "account_id": account_id,
            "step_name": step_name,
            "log_level": log_level,
            "message": message,
            "data": normalized_data,
            "user_id": user_id,
            "content_hash": content_hash,  # Add hash for deduplication
            "created_at": datetime.now().isoformat()
        }
        
        # Insert the log entry
        result = supabase.table("account_closure_logs").insert(log_entry).execute()
        
        # Check if insert was successful
        if result.data and len(result.data) > 0:
            logger.debug(f"Saved unique account closure log for {account_id}: {step_name} (hash: {content_hash[:8]}...)")
            return result.data[0]
        else:
            logger.warning(f"No data returned when saving account closure log for {account_id}")
            return None
    
    except Exception as e:
        logger.error(f"Error saving account closure log for {account_id}: {e}")
        return None


def get_account_closure_logs(
    account_id: Optional[str] = None,
    user_id: Optional[str] = None,
    step_name: Optional[str] = None,
    log_level: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Retrieve account closure logs with filtering options.
    
    Args:
        account_id (Optional[str]): Filter by specific account ID
        user_id (Optional[str]): Filter by user ID
        step_name (Optional[str]): Filter by step name
        log_level (Optional[str]): Filter by log level
        limit (int): Maximum number of logs to retrieve
        offset (int): Number of logs to skip
        
    Returns:
        List[Dict[str, Any]]: List of log entries
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Start the query
        query = supabase.table("account_closure_logs").select("*")
        
        # Add filters
        if account_id:
            query = query.eq("account_id", account_id)
        if user_id:
            query = query.eq("user_id", user_id)
        if step_name:
            query = query.eq("step_name", step_name)
        if log_level:
            query = query.eq("log_level", log_level)
        
        # Execute the query with ordering and pagination
        response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        
        # Return the log entries
        if response.data:
            logger.info(f"Retrieved {len(response.data)} account closure logs")
            return response.data
        else:
            logger.info("No account closure logs found")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving account closure logs: {e}")
        return []


def get_account_closure_summary(account_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a summary of account closure progress and status.
    
    Args:
        account_id (str): The Alpaca account ID
        
    Returns:
        Optional[Dict[str, Any]]: Summary of closure progress
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Get all logs for this account
        response = supabase.table("account_closure_logs") \
            .select("*") \
            .eq("account_id", account_id) \
            .order("created_at", desc=True) \
            .execute()
        
        if not response.data:
            return None
        
        logs = response.data
        
        # Calculate summary statistics
        total_logs = len(logs)
        error_logs = len([log for log in logs if log.get("log_level") == "ERROR"])
        warning_logs = len([log for log in logs if log.get("log_level") == "WARNING"])
        
        # Get unique steps
        steps = list(set([log.get("step_name") for log in logs]))
        
        # Get latest log
        latest_log = logs[0] if logs else None
        
        # Determine current status based on latest logs
        current_status = "unknown"
        if latest_log:
            if "COMPLETED" in latest_log.get("message", ""):
                current_status = "completed"
            elif "FAILED" in latest_log.get("message", ""):
                current_status = "failed"
            elif "STARTING" in latest_log.get("message", ""):
                current_status = "in_progress"
        
        summary = {
            "account_id": account_id,
            "total_logs": total_logs,
            "error_count": error_logs,
            "warning_count": warning_logs,
            "steps_completed": steps,
            "current_status": current_status,
            "latest_log": latest_log,
            "first_log": logs[-1] if logs else None,
            "last_updated": latest_log.get("created_at") if latest_log else None
        }
        
        return summary
    
    except Exception as e:
        logger.error(f"Error getting account closure summary for {account_id}: {e}")
        return None


def cleanup_old_account_closure_logs(days_to_keep: int = 180) -> int:
    """
    Clean up old account closure logs to manage database size.
    
    Args:
        days_to_keep (int): Number of days to keep logs (default: 180 for 6 months)
        
    Returns:
        int: Number of logs deleted
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Safety check: don't allow deletion of logs newer than 90 days (3 months)
        if days_to_keep < 90:
            logger.warning("Cannot delete logs newer than 90 days for compliance and safety")
            return 0
        
        # Calculate cutoff date
        cutoff_date = (datetime.now() - timedelta(days=days_to_keep)).isoformat()
        
        # Delete old logs
        response = supabase.table("account_closure_logs") \
            .delete() \
            .lt("created_at", cutoff_date) \
            .execute()
        
        deleted_count = len(response.data) if response.data else 0
        logger.info(f"Cleaned up {deleted_count} old account closure logs (older than {days_to_keep} days)")
        
        return deleted_count
    
    except Exception as e:
        if "permission denied" in str(e).lower() or "insufficient privilege" in str(e).lower():
            logger.warning("Cleanup function not available - DELETE permissions were removed for safety")
            logger.info("To enable cleanup, uncomment the cleanup function in account_closure_logs_schema.sql")
            return 0
        else:
            logger.error(f"Error cleaning up old account closure logs: {e}")
            return 0


def get_account_closure_statistics(days: int = 30) -> Dict[str, Any]:
    """
    Get statistics about account closures over a time period.
    
    Args:
        days (int): Number of days to analyze
        
    Returns:
        Dict[str, Any]: Statistics about account closures
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Calculate start date
        start_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        # Get logs in date range
        response = supabase.table("account_closure_logs") \
            .select("*") \
            .gte("created_at", start_date) \
            .execute()
        
        if not response.data:
            return {
                "total_closures": 0,
                "successful_closures": 0,
                "failed_closures": 0,
                "average_duration_minutes": 0,
                "most_common_errors": [],
                "step_completion_rates": {}
            }
        
        logs = response.data
        
        # Group by account_id
        account_logs = {}
        for log in logs:
            account_id = log.get("account_id")
            if account_id not in account_logs:
                account_logs[account_id] = []
            account_logs[account_id].append(log)
        
        # Calculate statistics
        total_closures = len(account_logs)
        successful_closures = 0
        failed_closures = 0
        total_duration = 0
        error_counts = {}
        step_counts = {}
        
        for account_id, account_logs_list in account_logs.items():
            # Sort by timestamp
            account_logs_list.sort(key=lambda x: x.get("created_at", ""))
            
            # Check if closure was successful
            has_completion = any("COMPLETED" in log.get("message", "") for log in account_logs_list)
            has_failure = any("FAILED" in log.get("message", "") for log in account_logs_list)
            
            if has_completion:
                successful_closures += 1
            elif has_failure:
                failed_closures += 1
            
            # Calculate duration
            if len(account_logs_list) >= 2:
                start_time = datetime.fromisoformat(account_logs_list[0].get("created_at", ""))
                end_time = datetime.fromisoformat(account_logs_list[-1].get("created_at", ""))
                duration = (end_time - start_time).total_seconds() / 60  # minutes
                total_duration += duration
            
            # Count errors
            for log in account_logs_list:
                if log.get("log_level") == "ERROR":
                    error_msg = log.get("message", "").split("|")[0] if "|" in log.get("message", "") else log.get("message", "")
                    error_counts[error_msg] = error_counts.get(error_msg, 0) + 1
            
            # Count steps
            for log in account_logs_list:
                step = log.get("step_name", "")
                step_counts[step] = step_counts.get(step, 0) + 1
        
        # Calculate averages
        average_duration = total_duration / total_closures if total_closures > 0 else 0
        
        # Get most common errors
        most_common_errors = sorted(error_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        
        # Calculate step completion rates
        step_completion_rates = {}
        for step, count in step_counts.items():
            step_completion_rates[step] = (count / total_closures) * 100 if total_closures > 0 else 0
        
        return {
            "total_closures": total_closures,
            "successful_closures": successful_closures,
            "failed_closures": failed_closures,
            "success_rate": (successful_closures / total_closures) * 100 if total_closures > 0 else 0,
            "average_duration_minutes": round(average_duration, 2),
            "most_common_errors": most_common_errors,
            "step_completion_rates": step_completion_rates,
            "analysis_period_days": days
        }
    
    except Exception as e:
        logger.error(f"Error getting account closure statistics: {e}")
        return {
            "error": str(e),
            "total_closures": 0,
            "successful_closures": 0,
            "failed_closures": 0,
            "average_duration_minutes": 0,
            "most_common_errors": [],
            "step_completion_rates": {}
        } 


def get_user_account_closure_logs(user_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Get account closure logs for a specific user.
    
    Args:
        user_id (str): The Supabase user ID
        limit (int): Maximum number of logs to retrieve
        offset (int): Number of logs to skip
        
    Returns:
        List[Dict[str, Any]]: List of log entries for the user
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Call the database function
        response = supabase.rpc(
            'get_user_account_closure_logs',
            {
                'p_user_id': user_id,
                'p_limit': limit,
                'p_offset': offset
            }
        ).execute()
        
        # Return the log entries
        if response.data:
            logger.info(f"Retrieved {len(response.data)} account closure logs for user {user_id}")
            return response.data
        else:
            logger.info(f"No account closure logs found for user {user_id}")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving user account closure logs for {user_id}: {e}")
        return []


def get_user_account_logs_by_alpaca_id(user_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Get account closure logs for a user's Alpaca account.
    
    Args:
        user_id (str): The Supabase user ID
        limit (int): Maximum number of logs to retrieve
        offset (int): Number of logs to skip
        
    Returns:
        List[Dict[str, Any]]: List of log entries for the user's account
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Call the database function
        response = supabase.rpc(
            'get_user_account_logs_by_alpaca_id',
            {
                'p_user_id': user_id,
                'p_limit': limit,
                'p_offset': offset
            }
        ).execute()
        
        # Return the log entries
        if response.data:
            logger.info(f"Retrieved {len(response.data)} account closure logs for user {user_id}'s Alpaca account")
            return response.data
        else:
            logger.info(f"No account closure logs found for user {user_id}'s Alpaca account")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving user account logs by Alpaca ID for {user_id}: {e}")
        return []


def get_user_closure_summary(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a summary of account closure progress for a specific user.
    
    Args:
        user_id (str): The Supabase user ID
        
    Returns:
        Optional[Dict[str, Any]]: Summary of closure progress for the user
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Call the database function
        response = supabase.rpc(
            'get_user_closure_summary',
            {'p_user_id': user_id}
        ).execute()
        
        if response.data:
            logger.info(f"Retrieved closure summary for user {user_id}")
            return response.data
        else:
            logger.warning(f"No closure summary found for user {user_id}")
            return None
    
    except Exception as e:
        logger.error(f"Error getting user closure summary for {user_id}: {e}")
        return None


def get_user_closure_logs_with_onboarding(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Get account closure logs with user onboarding information.
    
    Args:
        user_id (str): The Supabase user ID
        limit (int): Maximum number of logs to retrieve
        
    Returns:
        List[Dict[str, Any]]: List of log entries with onboarding data
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Query the view that joins logs with onboarding data
        response = supabase.from_('user_closure_logs_view') \
            .select('*') \
            .eq('user_id', user_id) \
            .order('created_at', desc=True) \
            .limit(limit) \
            .execute()
        
        # Return the log entries
        if response.data:
            logger.info(f"Retrieved {len(response.data)} user closure logs with onboarding data for user {user_id}")
            return response.data
        else:
            logger.info(f"No user closure logs with onboarding data found for user {user_id}")
            return []
    
    except Exception as e:
        logger.error(f"Error retrieving user closure logs with onboarding for {user_id}: {e}")
        return []


def get_account_closure_logs_by_user_email(email: str, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Get account closure logs for a user by their email address.
    
    Args:
        email (str): The user's email address
        limit (int): Maximum number of logs to retrieve
        
    Returns:
        List[Dict[str, Any]]: List of log entries for the user
    """
    try:
        # First get the user ID from email
        user_id = get_user_id_from_email(email)
        if not user_id:
            logger.warning(f"No user found with email: {email}")
            return []
        
        # Then get the logs for that user
        return get_user_account_closure_logs(user_id, limit)
    
    except Exception as e:
        logger.error(f"Error retrieving account closure logs by email {email}: {e}")
        return []


def get_user_closure_status(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the current closure status for a user from both onboarding and logs.
    
    Args:
        user_id (str): The Supabase user ID
        
    Returns:
        Optional[Dict[str, Any]]: User's closure status information
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Get user onboarding data
        onboarding_response = supabase.table("user_onboarding") \
            .select("status, alpaca_account_id, account_closure_initiated_at, account_closure_completed_at, account_closure_confirmation_number") \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        
        if not onboarding_response.data:
            logger.warning(f"No onboarding data found for user {user_id}")
            return None
        
        onboarding_data = onboarding_response.data
        
        # Get recent logs for context
        recent_logs = get_user_account_closure_logs(user_id, limit=5)
        
        # Determine current status
        current_status = "unknown"
        if onboarding_data.get("account_closure_completed_at"):
            current_status = "completed"
        elif onboarding_data.get("account_closure_initiated_at"):
            current_status = "in_progress"
        elif onboarding_data.get("status") == "pending_closure":
            current_status = "pending"
        elif onboarding_data.get("status") == "closed":
            current_status = "closed"
        
        result = {
            "user_id": user_id,
            "alpaca_account_id": onboarding_data.get("alpaca_account_id"),
            "onboarding_status": onboarding_data.get("status"),
            "closure_status": current_status,
            "closure_initiated_at": onboarding_data.get("account_closure_initiated_at"),
            "closure_completed_at": onboarding_data.get("account_closure_completed_at"),
            "confirmation_number": onboarding_data.get("account_closure_confirmation_number"),
            "recent_logs_count": len(recent_logs),
            "latest_log": recent_logs[0] if recent_logs else None
        }
        
        logger.info(f"Retrieved closure status for user {user_id}: {current_status}")
        return result
    
    except Exception as e:
        logger.error(f"Error getting user closure status for {user_id}: {e}")
        return None 