#!/usr/bin/env python3
"""
Account Closure Database Operations

This module provides specialized database operations for account closure workflows.
It handles all account closure logging, statistics, and monitoring functionality
while maintaining separation of concerns from the generic database client.

Key Features:
- Account closure log management
- Smart deduplication with timestamp filtering
- Statistics and analytics
- User-specific closure tracking
- Cleanup and maintenance operations
"""

import os
import json
import hashlib
import re
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from uuid import UUID

from .db_client import get_supabase_client, CustomJSONEncoder
import logging

# Configure logging
logger = logging.getLogger(__name__)


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
    Clean up old account closure logs to maintain database performance.
    
    Args:
        days_to_keep (int): Number of days of logs to keep (default: 180)
        
    Returns:
        int: Number of logs deleted
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        cutoff_iso = cutoff_date.isoformat()
        
        # Delete old logs
        result = supabase.table("account_closure_logs") \
            .delete() \
            .lt("created_at", cutoff_iso) \
            .execute()
        
        deleted_count = len(result.data) if result.data else 0
        
        logger.info(f"Cleaned up {deleted_count} account closure logs older than {days_to_keep} days")
        return deleted_count
    
    except Exception as e:
        logger.error(f"Error cleaning up old account closure logs: {e}")
        return 0


def get_account_closure_statistics(days: int = 30) -> Dict[str, Any]:
    """
    Get comprehensive statistics about account closure operations.
    
    Args:
        days (int): Number of days to analyze (default: 30)
        
    Returns:
        Dict[str, Any]: Statistics about account closure operations
    """
    try:
        # Create Supabase client
        supabase = get_supabase_client()
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Get logs within date range
        response = supabase.table("account_closure_logs") \
            .select("*") \
            .gte("created_at", start_date.isoformat()) \
            .lte("created_at", end_date.isoformat()) \
            .execute()
        
        logs = response.data or []
        
        # Calculate statistics
        total_logs = len(logs)
        unique_accounts = len(set([log.get("account_id") for log in logs if log.get("account_id")]))
        
        # Count by log level
        log_levels = {}
        for log in logs:
            level = log.get("log_level", "UNKNOWN")
            log_levels[level] = log_levels.get(level, 0) + 1
        
        # Count by step
        steps = {}
        for log in logs:
            step = log.get("step_name", "UNKNOWN")
            steps[step] = steps.get(step, 0) + 1
        
        # Count by day
        daily_counts = {}
        for log in logs:
            created_at = log.get("created_at", "")
            if created_at:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    date_key = date_obj.strftime('%Y-%m-%d')
                    daily_counts[date_key] = daily_counts.get(date_key, 0) + 1
                except:
                    pass
        
        # Find most active accounts
        account_activity = {}
        for log in logs:
            account_id = log.get("account_id")
            if account_id:
                account_activity[account_id] = account_activity.get(account_id, 0) + 1
        
        # Sort accounts by activity
        top_accounts = sorted(account_activity.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Calculate success/failure rates
        success_logs = len([log for log in logs if "COMPLETED" in log.get("message", "")])
        failure_logs = len([log for log in logs if "FAILED" in log.get("message", "")])
        
        statistics = {
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "days": days
            },
            "overview": {
                "total_logs": total_logs,
                "unique_accounts": unique_accounts,
                "success_logs": success_logs,
                "failure_logs": failure_logs,
                "success_rate": round(success_logs / max(success_logs + failure_logs, 1) * 100, 2)
            },
            "by_log_level": log_levels,
            "by_step": steps,
            "daily_activity": daily_counts,
            "top_accounts": [{"account_id": acc, "log_count": count} for acc, count in top_accounts],
            "generated_at": datetime.now().isoformat()
        }
        
        return statistics
    
    except Exception as e:
        logger.error(f"Error generating account closure statistics: {e}")
        return {}


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
    return get_account_closure_logs(user_id=user_id, limit=limit, offset=offset)


def get_user_account_logs_by_alpaca_id(user_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Get account closure logs for a user by looking up their Alpaca account ID.
    
    Args:
        user_id (str): The Supabase user ID
        limit (int): Maximum number of logs to retrieve
        offset (int): Number of logs to skip
        
    Returns:
        List[Dict[str, Any]]: List of log entries for the user's Alpaca account
    """
    try:
        from .db_client import get_user_alpaca_account_id
        
        # Get the user's Alpaca account ID
        alpaca_account_id = get_user_alpaca_account_id(user_id)
        
        if not alpaca_account_id:
            logger.warning(f"No Alpaca account ID found for user: {user_id}")
            return []
        
        # Get logs for the Alpaca account
        return get_account_closure_logs(account_id=alpaca_account_id, limit=limit, offset=offset)
    
    except Exception as e:
        logger.error(f"Error getting account logs by Alpaca ID for user {user_id}: {e}")
        return []


def get_user_closure_summary(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a closure summary for a specific user.
    
    Args:
        user_id (str): The Supabase user ID
        
    Returns:
        Optional[Dict[str, Any]]: Closure summary or None if not found
    """
    try:
        from .db_client import get_user_alpaca_account_id
        
        # Get the user's Alpaca account ID
        alpaca_account_id = get_user_alpaca_account_id(user_id)
        
        if not alpaca_account_id:
            logger.warning(f"No Alpaca account ID found for user: {user_id}")
            return None
        
        # Get closure summary for the Alpaca account
        return get_account_closure_summary(alpaca_account_id)
    
    except Exception as e:
        logger.error(f"Error getting user closure summary for user {user_id}: {e}")
        return None


def get_user_closure_logs_with_onboarding(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Get account closure logs for a user along with their onboarding data.
    
    Args:
        user_id (str): The Supabase user ID
        limit (int): Maximum number of logs to retrieve
        
    Returns:
        List[Dict[str, Any]]: List of log entries with onboarding context
    """
    try:
        from .db_client import get_user_data
        
        # Get user onboarding data
        user_data = get_user_data(user_id)
        
        # Get account closure logs
        logs = get_user_account_logs_by_alpaca_id(user_id, limit=limit)
        
        # Enhance logs with user context
        enhanced_logs = []
        for log in logs:
            enhanced_log = log.copy()
            enhanced_log["user_context"] = user_data
            enhanced_logs.append(enhanced_log)
        
        return enhanced_logs
    
    except Exception as e:
        logger.error(f"Error getting user closure logs with onboarding for user {user_id}: {e}")
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
        from .db_client import get_user_id_from_email
        
        # Get user ID from email
        user_id = get_user_id_from_email(email)
        
        if not user_id:
            logger.warning(f"No user found with email: {email}")
            return []
        
        # Get account closure logs for the user
        return get_user_account_logs_by_alpaca_id(user_id, limit=limit)
    
    except Exception as e:
        logger.error(f"Error getting account closure logs by email {email}: {e}")
        return []


def get_user_closure_status(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the current closure status for a user.
    
    Args:
        user_id (str): The Supabase user ID
        
    Returns:
        Optional[Dict[str, Any]]: Current closure status or None if not found
    """
    try:
        # Get the latest closure summary
        summary = get_user_closure_summary(user_id)
        
        if not summary:
            return None
        
        # Extract current status information
        status = {
            "user_id": user_id,
            "account_id": summary.get("account_id"),
            "current_status": summary.get("current_status"),
            "last_updated": summary.get("last_updated"),
            "total_logs": summary.get("total_logs"),
            "error_count": summary.get("error_count"),
            "warning_count": summary.get("warning_count"),
            "latest_log": summary.get("latest_log")
        }
        
        return status
    
    except Exception as e:
        logger.error(f"Error getting user closure status for user {user_id}: {e}")
        return None 