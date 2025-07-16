#!/usr/bin/env python3
"""
User Closure Service

This module provides user-specific operations for account closure functionality.
It handles user lookups, onboarding data integration, and user-centric views
of account closure operations.

Responsibilities:
- User-specific closure operations
- Email-based user lookups
- Onboarding data integration
- User context enrichment
- User permission validation
"""

import logging
from typing import Dict, Any, Optional, List

from .account_closure_service import account_closure_service
from .account_closure_analytics import account_closure_analytics
from .db_client import get_user_alpaca_account_id, get_user_data, get_user_id_from_email

logger = logging.getLogger(__name__)


class UserClosureService:
    """Service for user-specific account closure operations."""
    
    def __init__(self):
        """Initialize the service with dependencies."""
        self.closure_service = account_closure_service
        self.analytics = account_closure_analytics
    
    def get_user_closure_logs(
        self, 
        user_id: str, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[Dict[str, Any]]:
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
            return self.closure_service.get_logs_with_filters(
                user_id=user_id, 
                limit=limit, 
                offset=offset
            )
        except Exception as e:
            logger.error(f"Error getting user closure logs for {user_id}: {e}")
            return []
    
    def get_user_closure_logs_by_alpaca_account(
        self, 
        user_id: str, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[Dict[str, Any]]:
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
            # Get the user's Alpaca account ID
            alpaca_account_id = get_user_alpaca_account_id(user_id)
            
            if not alpaca_account_id:
                logger.warning(f"No Alpaca account ID found for user: {user_id}")
                return []
            
            # Get logs for the Alpaca account
            return self.closure_service.get_logs_with_filters(
                account_id=alpaca_account_id, 
                limit=limit, 
                offset=offset
            )
        except Exception as e:
            logger.error(f"Error getting account logs by Alpaca ID for user {user_id}: {e}")
            return []
    
    def get_user_closure_summary(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a closure summary for a specific user.
        
        Args:
            user_id (str): The Supabase user ID
            
        Returns:
            Optional[Dict[str, Any]]: Closure summary or None if not found
        """
        try:
            # Get the user's Alpaca account ID
            alpaca_account_id = get_user_alpaca_account_id(user_id)
            
            if not alpaca_account_id:
                logger.warning(f"No Alpaca account ID found for user: {user_id}")
                return None
            
            # Get closure summary for the Alpaca account
            summary = self.closure_service.get_account_summary(alpaca_account_id)
            
            if summary:
                # Enhance with user context
                summary["user_id"] = user_id
                summary["alpaca_account_id"] = alpaca_account_id
            
            return summary
        except Exception as e:
            logger.error(f"Error getting user closure summary for user {user_id}: {e}")
            return None
    
    def get_user_closure_logs_with_onboarding(
        self, 
        user_id: str, 
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get account closure logs for a user along with their onboarding data.
        
        Args:
            user_id (str): The Supabase user ID
            limit (int): Maximum number of logs to retrieve
            
        Returns:
            List[Dict[str, Any]]: List of log entries with onboarding context
        """
        try:
            # Get user onboarding data
            user_data = get_user_data(user_id)
            
            # Get account closure logs
            logs = self.get_user_closure_logs_by_alpaca_account(user_id, limit=limit)
            
            # Enhance logs with user context
            enhanced_logs = []
            for log in logs:
                enhanced_log = log.copy()
                enhanced_log["user_context"] = user_data
                enhanced_log["user_id"] = user_id
                enhanced_logs.append(enhanced_log)
            
            return enhanced_logs
        except Exception as e:
            logger.error(f"Error getting user closure logs with onboarding for user {user_id}: {e}")
            return []
    
    def get_closure_logs_by_email(
        self, 
        email: str, 
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get account closure logs for a user by their email address.
        
        Args:
            email (str): The user's email address
            limit (int): Maximum number of logs to retrieve
            
        Returns:
            List[Dict[str, Any]]: List of log entries for the user
        """
        try:
            # Get user ID from email
            user_id = get_user_id_from_email(email)
            
            if not user_id:
                logger.warning(f"No user found with email: {email}")
                return []
            
            # Get account closure logs for the user
            return self.get_user_closure_logs_by_alpaca_account(user_id, limit=limit)
        except Exception as e:
            logger.error(f"Error getting account closure logs by email {email}: {e}")
            return []
    
    def get_user_closure_status(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the current closure status for a user.
        
        Args:
            user_id (str): The Supabase user ID
            
        Returns:
            Optional[Dict[str, Any]]: Current closure status or None if not found
        """
        try:
            # Get the latest closure summary
            summary = self.get_user_closure_summary(user_id)
            
            if not summary:
                return None
            
            # Extract current status information
            status = {
                "user_id": user_id,
                "account_id": summary.get("account_id"),
                "alpaca_account_id": summary.get("alpaca_account_id"),
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
    
    def validate_user_closure_permission(
        self, 
        user_id: str, 
        account_id: str
    ) -> Dict[str, Any]:
        """
        Validate if a user has permission to access closure data for an account.
        
        Args:
            user_id (str): The Supabase user ID
            account_id (str): The Alpaca account ID
            
        Returns:
            Dict[str, Any]: Validation result
        """
        try:
            # Get the user's Alpaca account ID
            user_alpaca_account_id = get_user_alpaca_account_id(user_id)
            
            validation_result = {
                "user_id": user_id,
                "account_id": account_id,
                "has_permission": False,
                "reason": None
            }
            
            if not user_alpaca_account_id:
                validation_result["reason"] = "User has no associated Alpaca account"
                return validation_result
            
            if user_alpaca_account_id != account_id:
                validation_result["reason"] = "Account does not belong to user"
                return validation_result
            
            validation_result["has_permission"] = True
            validation_result["reason"] = "User owns the account"
            
            return validation_result
        except Exception as e:
            logger.error(f"Error validating user closure permission: {e}")
            return {
                "user_id": user_id,
                "account_id": account_id,
                "has_permission": False,
                "reason": "Validation error occurred"
            }
    
    def create_user_closure_log(
        self,
        user_id: str,
        step_name: str,
        log_level: str,
        message: str,
        data: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Create a closure log entry for a user.
        
        Args:
            user_id (str): The Supabase user ID
            step_name (str): The closure step
            log_level (str): Log level (INFO, DEBUG, ERROR, WARNING)
            message (str): The log message
            data (Optional[Dict[str, Any]]): Additional structured data
            
        Returns:
            Optional[Dict[str, Any]]: The created log entry or None if failed
        """
        try:
            # Get the user's Alpaca account ID
            alpaca_account_id = get_user_alpaca_account_id(user_id)
            
            if not alpaca_account_id:
                logger.warning(f"Cannot create log - no Alpaca account ID found for user: {user_id}")
                return None
            
            # Create the log entry
            return self.closure_service.save_log_entry(
                account_id=alpaca_account_id,
                step_name=step_name,
                log_level=log_level,
                message=message,
                data=data,
                user_id=user_id
            )
        except Exception as e:
            logger.error(f"Error creating user closure log for user {user_id}: {e}")
            return None
    
    def get_user_closure_analytics(self, user_id: str) -> Dict[str, Any]:
        """
        Get analytics data for a specific user's closure operations.
        
        Args:
            user_id (str): The Supabase user ID
            
        Returns:
            Dict[str, Any]: Analytics data for the user
        """
        try:
            # Get the user's Alpaca account ID
            alpaca_account_id = get_user_alpaca_account_id(user_id)
            
            if not alpaca_account_id:
                return {"error": "No Alpaca account found for user"}
            
            # Get account performance report
            report = self.analytics.generate_account_performance_report(alpaca_account_id)
            
            if "error" not in report:
                # Enhance with user context
                report["user_id"] = user_id
                report["alpaca_account_id"] = alpaca_account_id
            
            return report
        except Exception as e:
            logger.error(f"Error getting user closure analytics for user {user_id}: {e}")
            return {"error": "Failed to generate analytics"}
    
    def search_users_by_closure_activity(
        self, 
        days: int = 30, 
        status_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for users who have had closure activity in the specified period.
        
        Args:
            days (int): Number of days to look back
            status_filter (Optional[str]): Filter by closure status
            
        Returns:
            List[Dict[str, Any]]: List of users with closure activity
        """
        try:
            # This would require a more complex query across multiple tables
            # For now, return a simplified implementation
            logger.info(f"Searching for users with closure activity in last {days} days")
            
            # Get recent statistics to identify active accounts
            stats = self.analytics.generate_statistics(days=days)
            top_accounts = stats.get("top_accounts", [])
            
            # Convert account IDs to user information
            user_activity = []
            for account_info in top_accounts:
                account_id = account_info.get("account_id")
                if account_id:
                    # This is a simplified approach - in a real implementation,
                    # you'd want to join with user tables more efficiently
                    summary = self.closure_service.get_account_summary(account_id)
                    if summary:
                        user_activity.append({
                            "account_id": account_id,
                            "activity_count": account_info.get("log_count", 0),
                            "current_status": summary.get("current_status"),
                            "last_updated": summary.get("last_updated")
                        })
            
            # Apply status filter if provided
            if status_filter:
                user_activity = [
                    user for user in user_activity 
                    if user.get("current_status") == status_filter
                ]
            
            return user_activity
        except Exception as e:
            logger.error(f"Error searching users by closure activity: {e}")
            return []


# Create a singleton instance for easy access
user_closure_service = UserClosureService() 