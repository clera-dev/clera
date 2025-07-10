"""
Account Closure Smart Logging System

This module provides intelligent logging for account closure operations
with deduplication, rate limiting, and performance optimization.

Features:
- Supabase-only logging (no local files)
- Smart deduplication to prevent duplicate entries
- Rate limiting for high-frequency operations
- Only logs meaningful events and state changes
- Performance optimized for real-time monitoring
"""

import json
from datetime import datetime
from typing import Dict, Any, List, Optional
import os

# Import database logging functions
try:
    from ..supabase.account_closure_db import save_account_closure_log
    DATABASE_LOGGING_AVAILABLE = True
except ImportError:
    save_account_closure_log = None
    DATABASE_LOGGING_AVAILABLE = False

# Global cache for logger instances (singleton pattern)
_logger_instances = {}

class AccountClosureLogger:
    """
    Smart account closure logger that only uses Supabase database logging.
    
    Features:
    - Singleton pattern prevents multiple loggers per account
    - Smart deduplication prevents duplicate entries
    - Rate limiting for high-frequency operations
    - Only logs meaningful events and state changes
    """
    
    def __init__(self, account_id: str, user_id: Optional[str] = None):
        """
        Initialize the logger for an account.
        
        Args:
            account_id (str): The Alpaca account ID
            user_id (Optional[str]): The Supabase user ID
        """
        self.account_id = account_id
        self.user_id = user_id
        
        # Check if we already have a logger instance for this account
        if account_id in _logger_instances:
            existing_logger = _logger_instances[account_id]
            # Update user_id if not set
            if not existing_logger.user_id and user_id:
                existing_logger.user_id = user_id
            # Return the existing instance by updating this instance
            self.__dict__.update(existing_logger.__dict__)
            return
        
        # Log initialization to database only once per account
        if DATABASE_LOGGING_AVAILABLE:
            try:
                save_account_closure_log(
                    account_id=account_id,
                    step_name="LOGGER_INITIALIZATION",
                    log_level="INFO",
                    message="Account closure logger initialized",
                    data={"user_id": user_id, "logging_system": "supabase_only"},
                    user_id=user_id
                )
            except Exception as e:
                print(f"⚠️ Database logging not available: {e}")
        
        # Store this instance in the global cache
        _logger_instances[account_id] = self
        
    def _log_to_database(self, step_name: str, log_level: str, message: str, data: Optional[Dict[str, Any]] = None):
        """Helper method to log to database if available."""
        if DATABASE_LOGGING_AVAILABLE and save_account_closure_log:
            try:
                save_account_closure_log(
                    account_id=self.account_id,
                    step_name=step_name,
                    log_level=log_level,
                    message=message,
                    data=data,
                    user_id=self.user_id
                )
            except Exception as e:
                # Don't fail if database logging fails
                print(f"⚠️ Database logging failed: {e}")
        
    def log_step_start(self, step_name: str, step_data: Dict[str, Any] = None):
        """Log the start of a closure step with context."""
        message = f"STARTING {step_name.upper()}"
        if step_data:
            message += f" | Data: {json.dumps(step_data, indent=2)}"
        
        # Log to database only
        self._log_to_database(
            step_name=step_name,
            log_level="INFO",
            message=message,
            data=step_data
        )
        
    def log_step_success(self, step_name: str, result_data: Dict[str, Any] = None):
        """Log successful completion of a step."""
        message = f"✅ COMPLETED {step_name.upper()}"
        if result_data:
            message += f" | Result: {json.dumps(result_data, indent=2)}"
        
        # Log to database only
        self._log_to_database(
            step_name=step_name,
            log_level="INFO",
            message=message,
            data=result_data
        )
        
    def log_step_failure(self, step_name: str, error: str, context: Dict[str, Any] = None):
        """Log step failure with detailed context."""
        message = f"❌ FAILED {step_name.upper()} | Error: {error}"
        if context:
            message += f" | Context: {json.dumps(context, indent=2)}"
        
        # Log to database only
        self._log_to_database(
            step_name=step_name,
            log_level="ERROR",
            message=message,
            data={"error": error, "context": context}
        )
        
    def log_safety_check(self, check_name: str, passed: bool, details: Dict[str, Any]):
        """Log safety check results."""
        status = "✅ PASSED" if passed else "⚠️ FAILED"
        message = f"SAFETY CHECK {check_name.upper()}: {status} | Details: {json.dumps(details, indent=2)}"
        
        # Log to database only
        self._log_to_database(
            step_name=f"SAFETY_CHECK_{check_name}",
            log_level="WARNING" if not passed else "INFO",
            message=message,
            data={"passed": passed, "details": details}
        )
        
    def log_alpaca_data(self, data_type: str, data: Any):
        """Log raw Alpaca API data for verification (only important events)."""
        try:
            # Handle Mock objects in tests
            if hasattr(data, '_mock_name') or str(type(data)).startswith("<class 'unittest.mock"):
                message = f"ALPACA {data_type.upper()}: [MOCK OBJECT - Test Environment]"
                # Only log to database for test tracking
                self._log_to_database(
                    step_name=f"ALPACA_{data_type}",
                    log_level="DEBUG",
                    message=message,
                    data={"data_type": data_type, "environment": "test"}
                )
                return
                
            # Convert Alpaca objects to dict for logging
            if hasattr(data, '__dict__'):
                data_dict = data.__dict__
            elif isinstance(data, list):
                data_dict = [item.__dict__ if hasattr(item, '__dict__') else str(item) for item in data]
            else:
                data_dict = str(data)
                
            message = f"ALPACA {data_type.upper()} data received"
            
            # Only log to database (DEBUG level, but with structured data)
            # The deduplication logic in save_account_closure_log will handle rate limiting
            self._log_to_database(
                step_name=f"ALPACA_{data_type}",
                log_level="DEBUG",
                message=message,
                data={"data_type": data_type, "data": data_dict}
            )
            
        except Exception as e:
            # Log errors to database
            self._log_to_database(
                step_name=f"ALPACA_{data_type}",
                log_level="ERROR",
                message=f"Could not log Alpaca data for {data_type}: {e}",
                data={"data_type": data_type, "error": str(e)}
            )
            
    def log_email_notification(self, email_type: str, recipient: str, success: bool, details: str = ""):
        """Log email notification attempts."""
        status = "✅ SENT" if success else "❌ FAILED"
        message = f"EMAIL {email_type.upper()}: {status} | To: {recipient} | Details: {details}"
        
        # Log to database only
        self._log_to_database(
            step_name=f"EMAIL_{email_type}",
            log_level="INFO",
            message=message,
            data={"email_type": email_type, "recipient": recipient, "success": success, "details": details}
        )
        
    def log_timing(self, operation: str, duration_seconds: float):
        """Log operation timing."""
        message = f"⏱️ TIMING {operation.upper()}: {duration_seconds:.2f} seconds"
        
        # Log to database only
        self._log_to_database(
            step_name=f"TIMING_{operation}",
            log_level="INFO",
            message=message,
            data={"operation": operation, "duration_seconds": duration_seconds}
        )
        
    def log_debug(self, step_name: str, message: str, data: Optional[Dict[str, Any]] = None):
        """Log debug information."""
        # Log to database only (if data is provided)
        if data:
            self._log_to_database(
                step_name=step_name,
                log_level="DEBUG",
                message=message,
                data=data
            )
        
    def log_warning(self, step_name: str, message: str, data: Optional[Dict[str, Any]] = None):
        """Log warning information."""
        # Log to database only
        self._log_to_database(
            step_name=step_name,
            log_level="WARNING",
            message=message,
            data=data
        )
        
    def get_log_summary(self) -> str:
        """Get a summary of the logging system."""
        return f"Account closure logging for {self.account_id} - Supabase database only"
        
    def get_database_logs_url(self) -> Optional[str]:
        """Get the URL to view logs in Supabase dashboard."""
        if not DATABASE_LOGGING_AVAILABLE:
            return None
        
        # This would be a link to the Supabase dashboard
        # You can customize this based on your Supabase project URL
        return f"https://supabase.com/dashboard/project/[YOUR_PROJECT_ID]/table/account_closure_logs?filter=account_id.eq.{self.account_id}" 