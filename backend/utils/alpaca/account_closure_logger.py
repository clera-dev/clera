"""
Account Closure Detailed Logging System

This module provides comprehensive logging for account closure operations
to ensure complete transparency and auditability of the process.
"""

import logging
import json
from datetime import datetime
from typing import Dict, Any, List
import os

class AccountClosureLogger:
    def __init__(self, account_id: str):
        self.account_id = account_id
        self.logger = logging.getLogger(f"account-closure-{account_id}")
        
        # Create detailed log file for this specific account closure
        log_dir = "logs/account_closures"
        os.makedirs(log_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = f"{log_dir}/closure_{account_id}_{timestamp}.log"
        
        # Configure file handler with detailed formatting
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        
        # Console handler for real-time monitoring
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        
        # Detailed formatter
        formatter = logging.Formatter(
            '%(asctime)s | %(levelname)s | STEP: %(message)s'
        )
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        # Clear any existing handlers and add ours
        self.logger.handlers.clear()
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
        self.logger.setLevel(logging.DEBUG)
        
        self.log_file_path = log_file
        print(f"🔍 Account closure logging initialized: {log_file}")
        
    def log_step_start(self, step_name: str, step_data: Dict[str, Any] = None):
        """Log the start of a closure step with context."""
        message = f"STARTING {step_name.upper()}"
        if step_data:
            message += f" | Data: {json.dumps(step_data, indent=2)}"
        self.logger.info(message)
        
    def log_step_success(self, step_name: str, result_data: Dict[str, Any] = None):
        """Log successful completion of a step."""
        message = f"✅ COMPLETED {step_name.upper()}"
        if result_data:
            message += f" | Result: {json.dumps(result_data, indent=2)}"
        self.logger.info(message)
        
    def log_step_failure(self, step_name: str, error: str, context: Dict[str, Any] = None):
        """Log step failure with detailed context."""
        message = f"❌ FAILED {step_name.upper()} | Error: {error}"
        if context:
            message += f" | Context: {json.dumps(context, indent=2)}"
        self.logger.error(message)
        
    def log_safety_check(self, check_name: str, passed: bool, details: Dict[str, Any]):
        """Log safety check results."""
        status = "✅ PASSED" if passed else "⚠️ FAILED"
        message = f"SAFETY CHECK {check_name.upper()}: {status} | Details: {json.dumps(details, indent=2)}"
        self.logger.warning(message) if not passed else self.logger.info(message)
        
    def log_alpaca_data(self, data_type: str, data: Any):
        """Log raw Alpaca API data for verification."""
        try:
            # Handle Mock objects in tests
            if hasattr(data, '_mock_name') or str(type(data)).startswith("<class 'unittest.mock"):
                message = f"ALPACA {data_type.upper()}: [MOCK OBJECT - Test Environment]"
                self.logger.debug(message)
                return
                
            # Convert Alpaca objects to dict for logging
            if hasattr(data, '__dict__'):
                data_dict = data.__dict__
            elif isinstance(data, list):
                data_dict = [item.__dict__ if hasattr(item, '__dict__') else str(item) for item in data]
            else:
                data_dict = str(data)
                
            message = f"ALPACA {data_type.upper()}: {json.dumps(data_dict, indent=2, default=str)}"
            self.logger.debug(message)
        except Exception as e:
            self.logger.warning(f"Could not log Alpaca data for {data_type}: {e}")
            
    def log_email_notification(self, email_type: str, recipient: str, success: bool, details: str = ""):
        """Log email notification attempts."""
        status = "✅ SENT" if success else "❌ FAILED"
        message = f"EMAIL {email_type.upper()}: {status} | To: {recipient} | Details: {details}"
        self.logger.info(message)
        
    def log_timing(self, operation: str, duration_seconds: float):
        """Log operation timing."""
        message = f"⏱️ TIMING {operation.upper()}: {duration_seconds:.2f} seconds"
        self.logger.info(message)
        
    def get_log_summary(self) -> str:
        """Get a summary of the log file location."""
        return f"📄 Full logs available at: {self.log_file_path}" 