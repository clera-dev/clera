#!/usr/bin/env python3
"""
Account Closure Service

This module provides business logic for account closure operations.
It coordinates between the repository layer and implements business rules,
status derivation, and closure process logic.

Responsibilities:
- Business logic for account closure processes
- Status derivation and closure state management
- Deduplication logic and content hashing
- Closure process coordination
- Log entry creation and validation
"""

import json
import hashlib
import re
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from enum import Enum

from .account_closure_repository import account_closure_repository
from .db_client import CustomJSONEncoder

logger = logging.getLogger(__name__)


class ClosureStatus(Enum):
    """Enumeration of account closure statuses."""
    UNKNOWN = "unknown"
    INITIATED = "initiated"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AccountClosureService:
    """Service for account closure business logic."""
    
    def __init__(self):
        """Initialize the service with repository dependency."""
        self.repository = account_closure_repository
    
    def _remove_timestamp_fields(self, data: Any) -> Any:
        """
        Recursively remove timestamp fields from data to enable proper deduplication.
        
        Args:
            data: The data to process (dict, list, or primitive)
            
        Returns:
            The data with timestamp fields removed
        """
        if isinstance(data, dict):
            timestamp_fields = {'timestamp', 'created_at', 'updated_at', 'date', 'time', 'datetime'}
            cleaned_data = {}
            for key, value in data.items():
                if key.lower() not in timestamp_fields:
                    cleaned_data[key] = self._remove_timestamp_fields(value)
            return cleaned_data
        elif isinstance(data, list):
            return [self._remove_timestamp_fields(item) for item in data]
        else:
            return data
    
    def _generate_content_hash(
        self, 
        account_id: str, 
        step_name: str, 
        log_level: str, 
        message: str, 
        data: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a content hash for deduplication.
        
        Args:
            account_id (str): The account ID
            step_name (str): The step name
            log_level (str): The log level
            message (str): The log message
            data (Optional[Dict[str, Any]]): Additional data
            
        Returns:
            str: The content hash
        """
        # Normalize data for hashing
        normalized_data = data or {}
        deduplication_data = self._remove_timestamp_fields(normalized_data)
        
        # Clean message for deduplication (remove timestamp patterns)
        deduplication_message = message
        timestamp_pattern = r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?'
        deduplication_message = re.sub(timestamp_pattern, '[TIMESTAMP]', message)
        
        # Create content hash
        content_string = f"{account_id}|{step_name}|{log_level}|{deduplication_message}|{json.dumps(deduplication_data, sort_keys=True, cls=CustomJSONEncoder)}"
        return hashlib.sha256(content_string.encode('utf-8')).hexdigest()
    
    def _determine_status_from_logs(self, logs: List[Dict[str, Any]]) -> ClosureStatus:
        """
        Determine the current closure status based on log entries.
        
        Args:
            logs (List[Dict[str, Any]]): List of log entries
            
        Returns:
            ClosureStatus: The derived status
        """
        if not logs:
            return ClosureStatus.UNKNOWN
        
        # Get the latest log message
        latest_log = logs[0]  # Assuming logs are ordered by created_at desc
        latest_message = latest_log.get("message", "").upper()
        
        # Status derivation logic
        if "COMPLETED" in latest_message:
            return ClosureStatus.COMPLETED
        elif "FAILED" in latest_message or "ERROR" in latest_message:
            return ClosureStatus.FAILED
        elif "CANCELLED" in latest_message:
            return ClosureStatus.CANCELLED
        elif "STARTING" in latest_message or "INITIATED" in latest_message:
            return ClosureStatus.INITIATED
        elif any(keyword in latest_message for keyword in ["PROCESSING", "LIQUIDATING", "WITHDRAWING"]):
            return ClosureStatus.IN_PROGRESS
        else:
            return ClosureStatus.UNKNOWN
    
    def save_log_entry(
        self,
        account_id: str,
        step_name: str,
        log_level: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Save a log entry with deduplication.
        
        Args:
            account_id (str): The Alpaca account ID
            step_name (str): The closure step
            log_level (str): Log level (INFO, DEBUG, ERROR, WARNING)
            message (str): The log message
            data (Optional[Dict[str, Any]]): Additional structured data
            user_id (Optional[str]): The Supabase user ID
            
        Returns:
            Optional[Dict[str, Any]]: The created log entry or None if duplicate/error
        """
        try:
            # Generate content hash for deduplication
            content_hash = self._generate_content_hash(
                account_id, step_name, log_level, message, data
            )
            
            # Check for existing duplicate
            existing_log = self.repository.find_by_content_hash(content_hash)
            if existing_log:
                logger.debug(f"Skipping duplicate log entry for {account_id}: {step_name} (hash: {content_hash[:8]}...)")
                return None
            
            # Create log entry
            log_entry = {
                "account_id": account_id,
                "step_name": step_name,
                "log_level": log_level,
                "message": message,
                "data": data or {},
                "user_id": user_id,
                "content_hash": content_hash,
                "created_at": datetime.now().isoformat()
            }
            
            # Save to repository
            result = self.repository.insert_log(log_entry)
            if result:
                logger.debug(f"Saved unique account closure log for {account_id}: {step_name}")
            
            return result
        except Exception as e:
            logger.error(f"Error saving account closure log for {account_id}: {e}")
            return None
    
    def get_account_summary(self, account_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a comprehensive summary of account closure progress.
        
        Args:
            account_id (str): The Alpaca account ID
            
        Returns:
            Optional[Dict[str, Any]]: Summary of closure progress
        """
        try:
            # Get all logs for the account
            logs = self.repository.find_by_account_id(account_id, limit=1000)
            
            if not logs:
                return None
            
            # Calculate summary statistics
            total_logs = len(logs)
            error_logs = len([log for log in logs if log.get("log_level") == "ERROR"])
            warning_logs = len([log for log in logs if log.get("log_level") == "WARNING"])
            
            # Get unique steps
            steps = list(set([log.get("step_name") for log in logs if log.get("step_name")]))
            
            # Get latest and first logs
            latest_log = logs[0] if logs else None
            first_log = logs[-1] if logs else None
            
            # Determine current status
            current_status = self._determine_status_from_logs(logs)
            
            summary = {
                "account_id": account_id,
                "total_logs": total_logs,
                "error_count": error_logs,
                "warning_count": warning_logs,
                "steps_completed": steps,
                "current_status": current_status.value,
                "latest_log": latest_log,
                "first_log": first_log,
                "last_updated": latest_log.get("created_at") if latest_log else None
            }
            
            return summary
        except Exception as e:
            logger.error(f"Error getting account closure summary for {account_id}: {e}")
            return None
    
    def get_logs_with_filters(
        self,
        account_id: Optional[str] = None,
        user_id: Optional[str] = None,
        step_name: Optional[str] = None,
        log_level: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get logs with business logic applied.
        
        Args:
            account_id (Optional[str]): Filter by account ID
            user_id (Optional[str]): Filter by user ID
            step_name (Optional[str]): Filter by step name
            log_level (Optional[str]): Filter by log level
            limit (int): Maximum number of logs to retrieve
            offset (int): Number of logs to skip
            
        Returns:
            List[Dict[str, Any]]: List of log entries
        """
        try:
            logs = self.repository.find_with_filters(
                account_id=account_id,
                user_id=user_id,
                step_name=step_name,
                log_level=log_level,
                limit=limit,
                offset=offset
            )
            
            # Apply business logic transformations if needed
            # For example, enrich logs with additional context
            enriched_logs = []
            for log in logs:
                enriched_log = log.copy()
                # Add business logic enrichment here if needed
                enriched_logs.append(enriched_log)
            
            return enriched_logs
        except Exception as e:
            logger.error(f"Error getting logs with filters: {e}")
            return []
    
    def cleanup_old_logs(self, days_to_keep: int = 180) -> int:
        """
        Clean up old logs based on business rules.
        
        Args:
            days_to_keep (int): Number of days of logs to keep
            
        Returns:
            int: Number of logs deleted
        """
        try:
            cutoff_date = datetime.now() - timedelta(days=days_to_keep)
            deleted_count = self.repository.delete_by_date_range(cutoff_date)
            
            logger.info(f"Cleaned up {deleted_count} account closure logs older than {days_to_keep} days")
            return deleted_count
        except Exception as e:
            logger.error(f"Error cleaning up old account closure logs: {e}")
            return 0
    
    def validate_closure_readiness(self, account_id: str) -> Dict[str, Any]:
        """
        Validate if an account is ready for closure based on business rules.
        
        Args:
            account_id (str): The account ID to validate
            
        Returns:
            Dict[str, Any]: Validation results
        """
        try:
            # Get recent logs to check current state
            recent_logs = self.repository.find_by_account_id(account_id, limit=50)
            
            # Business logic for closure readiness
            validation_result = {
                "account_id": account_id,
                "ready_for_closure": False,
                "blocking_issues": [],
                "warnings": [],
                "last_activity": None
            }
            
            if not recent_logs:
                validation_result["blocking_issues"].append("No closure activity found")
                return validation_result
            
            # Check for recent errors
            recent_errors = [log for log in recent_logs if log.get("log_level") == "ERROR"]
            if recent_errors:
                validation_result["blocking_issues"].append(f"Recent errors found: {len(recent_errors)}")
            
            # Check current status
            current_status = self._determine_status_from_logs(recent_logs)
            if current_status == ClosureStatus.FAILED:
                validation_result["blocking_issues"].append("Account closure has failed")
            elif current_status == ClosureStatus.COMPLETED:
                validation_result["ready_for_closure"] = True
            
            # Set last activity
            validation_result["last_activity"] = recent_logs[0].get("created_at")
            
            # Determine overall readiness
            if not validation_result["blocking_issues"]:
                validation_result["ready_for_closure"] = True
            
            return validation_result
        except Exception as e:
            logger.error(f"Error validating closure readiness for {account_id}: {e}")
            return {
                "account_id": account_id,
                "ready_for_closure": False,
                "blocking_issues": ["Validation error occurred"],
                "warnings": [],
                "last_activity": None
            }


# Create a singleton instance for easy access
account_closure_service = AccountClosureService() 