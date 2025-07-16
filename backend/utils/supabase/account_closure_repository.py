#!/usr/bin/env python3
"""
Account Closure Repository

This module provides low-level database operations for account closure logs.
It follows the Repository pattern, handling only data persistence and retrieval
without business logic or analytics.

Responsibilities:
- Raw database operations (insert, select, delete, update)
- Query building and execution
- Data validation and type conversion
- Error handling for database operations
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from .db_client import get_supabase_client, CustomJSONEncoder

logger = logging.getLogger(__name__)


class AccountClosureRepository:
    """Repository for account closure log data access operations."""
    
    def __init__(self):
        """Initialize the repository."""
        self.supabase = get_supabase_client()
        self.table_name = "account_closure_logs"
    
    def insert_log(self, log_entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Insert a single log entry into the database.
        
        Args:
            log_entry (Dict[str, Any]): The log entry to insert
            
        Returns:
            Optional[Dict[str, Any]]: The inserted log entry or None if failed
        """
        try:
            result = self.supabase.table(self.table_name).insert(log_entry).execute()
            
            if result.data and len(result.data) > 0:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Error inserting log entry: {e}")
            return None
    
    def find_by_content_hash(self, content_hash: str) -> Optional[Dict[str, Any]]:
        """
        Find a log entry by its content hash.
        
        Args:
            content_hash (str): The content hash to search for
            
        Returns:
            Optional[Dict[str, Any]]: The matching log entry or None
        """
        try:
            result = self.supabase.table(self.table_name) \
                .select("*") \
                .eq("content_hash", content_hash) \
                .limit(1) \
                .execute()
            
            if result.data and len(result.data) > 0:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Error finding log by content hash: {e}")
            return None
    
    def find_by_account_id(
        self, 
        account_id: str, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Find log entries by account ID.
        
        Args:
            account_id (str): The account ID to search for
            limit (int): Maximum number of entries to return
            offset (int): Number of entries to skip
            
        Returns:
            List[Dict[str, Any]]: List of matching log entries
        """
        try:
            result = self.supabase.table(self.table_name) \
                .select("*") \
                .eq("account_id", account_id) \
                .order("created_at", desc=True) \
                .range(offset, offset + limit - 1) \
                .execute()
            
            return result.data or []
        except Exception as e:
            logger.error(f"Error finding logs by account ID: {e}")
            return []
    
    def find_by_user_id(
        self, 
        user_id: str, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Find log entries by user ID.
        
        Args:
            user_id (str): The user ID to search for
            limit (int): Maximum number of entries to return
            offset (int): Number of entries to skip
            
        Returns:
            List[Dict[str, Any]]: List of matching log entries
        """
        try:
            result = self.supabase.table(self.table_name) \
                .select("*") \
                .eq("user_id", user_id) \
                .order("created_at", desc=True) \
                .range(offset, offset + limit - 1) \
                .execute()
            
            return result.data or []
        except Exception as e:
            logger.error(f"Error finding logs by user ID: {e}")
            return []
    
    def find_with_filters(
        self,
        account_id: Optional[str] = None,
        user_id: Optional[str] = None,
        step_name: Optional[str] = None,
        log_level: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Find log entries with multiple filters.
        
        Args:
            account_id (Optional[str]): Filter by account ID
            user_id (Optional[str]): Filter by user ID
            step_name (Optional[str]): Filter by step name
            log_level (Optional[str]): Filter by log level
            limit (int): Maximum number of entries to return
            offset (int): Number of entries to skip
            
        Returns:
            List[Dict[str, Any]]: List of matching log entries
        """
        try:
            query = self.supabase.table(self.table_name).select("*")
            
            # Apply filters
            if account_id:
                query = query.eq("account_id", account_id)
            if user_id:
                query = query.eq("user_id", user_id)
            if step_name:
                query = query.eq("step_name", step_name)
            if log_level:
                query = query.eq("log_level", log_level)
            
            # Execute query with ordering and pagination
            result = query.order("created_at", desc=True) \
                .range(offset, offset + limit - 1) \
                .execute()
            
            return result.data or []
        except Exception as e:
            logger.error(f"Error finding logs with filters: {e}")
            return []
    
    def find_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        account_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Find log entries within a date range.
        
        Args:
            start_date (datetime): Start of the date range
            end_date (datetime): End of the date range
            account_id (Optional[str]): Filter by account ID
            user_id (Optional[str]): Filter by user ID
            
        Returns:
            List[Dict[str, Any]]: List of matching log entries
        """
        try:
            query = self.supabase.table(self.table_name) \
                .select("*") \
                .gte("created_at", start_date.isoformat()) \
                .lte("created_at", end_date.isoformat())
            
            # Apply optional filters
            if account_id:
                query = query.eq("account_id", account_id)
            if user_id:
                query = query.eq("user_id", user_id)
            
            result = query.order("created_at", desc=True).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error finding logs by date range: {e}")
            return []
    
    def delete_by_date_range(self, cutoff_date: datetime) -> int:
        """
        Delete log entries older than the cutoff date.
        
        Args:
            cutoff_date (datetime): Delete entries older than this date
            
        Returns:
            int: Number of entries deleted
        """
        try:
            result = self.supabase.table(self.table_name) \
                .delete() \
                .lt("created_at", cutoff_date.isoformat()) \
                .execute()
            
            return len(result.data) if result.data else 0
        except Exception as e:
            logger.error(f"Error deleting logs by date range: {e}")
            return 0
    
    def count_by_filters(
        self,
        account_id: Optional[str] = None,
        user_id: Optional[str] = None,
        step_name: Optional[str] = None,
        log_level: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> int:
        """
        Count log entries matching the given filters.
        
        Args:
            account_id (Optional[str]): Filter by account ID
            user_id (Optional[str]): Filter by user ID
            step_name (Optional[str]): Filter by step name
            log_level (Optional[str]): Filter by log level
            start_date (Optional[datetime]): Filter by start date
            end_date (Optional[datetime]): Filter by end date
            
        Returns:
            int: Number of matching entries
        """
        try:
            query = self.supabase.table(self.table_name).select("id", count="exact")
            
            # Apply filters
            if account_id:
                query = query.eq("account_id", account_id)
            if user_id:
                query = query.eq("user_id", user_id)
            if step_name:
                query = query.eq("step_name", step_name)
            if log_level:
                query = query.eq("log_level", log_level)
            if start_date:
                query = query.gte("created_at", start_date.isoformat())
            if end_date:
                query = query.lte("created_at", end_date.isoformat())
            
            result = query.execute()
            return result.count or 0
        except Exception as e:
            logger.error(f"Error counting logs with filters: {e}")
            return 0


# Create a singleton instance for easy access
account_closure_repository = AccountClosureRepository() 