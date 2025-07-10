#!/usr/bin/env python3

import os
import time
import logging
from typing import Dict, Any, Optional, List, Tuple
from enum import Enum
from datetime import datetime, timedelta

from alpaca.broker import BrokerClient
from alpaca.broker.requests import CreateACHTransferRequest
from alpaca.broker.enums import TransferDirection, TransferType, TransferStatus
from .create_account import get_broker_client

logger = logging.getLogger("alpaca-account-closure")

# Import enhanced logging for detailed tracking
try:
    from .account_closure_logger import AccountClosureLogger
except ImportError:
    logger.warning("Enhanced logging not available - using basic logging")
    AccountClosureLogger = None

# Import email service for notifications
try:
    from ..email.email_service import send_account_closure_email, send_account_closure_complete_email
except ImportError:
    logger.warning("Email service not available - email notifications will be skipped")
    send_account_closure_email = None
    send_account_closure_complete_email = None

class ClosureStep(Enum):
    """Enumeration of account closure steps."""
    INITIATED = "initiated"
    CANCELING_ORDERS = "canceling_orders"
    LIQUIDATING_POSITIONS = "liquidating_positions"
    WAITING_SETTLEMENT = "waiting_settlement"
    WITHDRAWING_FUNDS = "withdrawing_funds"
    CLOSING_ACCOUNT = "closing_account"
    COMPLETED = "completed"
    FAILED = "failed"

class BrokerService:
    """Handles all broker API interactions for account closure."""
    
    def __init__(self, broker_client):
        self.broker_client = broker_client
    
    def get_account_info(self, account_id: str) -> Dict[str, Any]:
        """Get comprehensive account information."""
        account = self.broker_client.get_account_by_id(account_id)
        trade_account = self.broker_client.get_trade_account_by_id(account_id)
        positions = self.broker_client.get_all_positions_for_account(account_id)
        
        # Get open orders using proper filter
        from alpaca.trading.requests import GetOrdersRequest
        from alpaca.trading.enums import QueryOrderStatus
        order_filter = GetOrdersRequest(status=QueryOrderStatus.OPEN)
        orders = self.broker_client.get_orders_for_account(account_id, filter=order_filter)
        
        return {
            "account": account,
            "trade_account": trade_account,
            "positions": positions,
            "orders": orders,
            "cash_balance": float(trade_account.cash) if hasattr(trade_account, 'cash') else 0,
            "cash_withdrawable": float(trade_account.cash_withdrawable) if hasattr(trade_account, 'cash_withdrawable') else 0
        }
    
    def liquidate_positions(self, account_id: str) -> Dict[str, Any]:
        """Liquidate all positions for an account."""
        try:
            positions = self.broker_client.get_all_positions_for_account(account_id)
            if not positions:
                return {"success": True, "message": "No positions to liquidate"}
            
            liquidation_orders = []
            for position in positions:
                try:
                    order = self.broker_client.close_position_for_account(account_id, position.symbol)
                    liquidation_orders.append(order)
                except Exception as e:
                    logger.error(f"Failed to liquidate position {position.symbol}: {e}")
            
            return {
                "success": True,
                "liquidation_orders": len(liquidation_orders),
                "message": f"Initiated liquidation of {len(liquidation_orders)} positions"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def withdraw_funds(self, account_id: str, ach_relationship_id: str, amount: float) -> Dict[str, Any]:
        """Withdraw funds from the account."""
        try:
            from alpaca.broker.requests import ACHTransferRequest
            from alpaca.broker.enums import TransferDirection
            
            transfer_request = ACHTransferRequest(
                transfer_type="ach",
                relationship_id=ach_relationship_id,
                amount=str(amount),
                direction=TransferDirection.OUTGOING
            )
            
            transfer = self.broker_client.create_ach_transfer_for_account(account_id, transfer_request)
            
            return {
                "success": True,
                "transfer_id": str(transfer.id),
                "amount": amount,
                "status": str(transfer.status)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def close_account(self, account_id: str) -> Dict[str, Any]:
        """Close the account."""
        try:
            self.broker_client.close_account(account_id)
            return {"success": True, "message": "Account closure initiated"}
        except Exception as e:
            return {"success": False, "error": str(e)}

class ClosureStateManager:
    """Manages closure state transitions and validation."""
    
    def determine_current_step(self, account_info: Dict[str, Any]) -> ClosureStep:
        """Determine current step based on account state."""
        account = account_info["account"]
        orders = account_info["orders"]
        positions = account_info["positions"]
        cash_balance = account_info["cash_balance"]
        cash_withdrawable = account_info["cash_withdrawable"]
        
        if str(account.status) == "CLOSED":
            return ClosureStep.COMPLETED
        elif len(orders) > 0 or len(positions) > 0:
            return ClosureStep.LIQUIDATING_POSITIONS
        elif cash_withdrawable < cash_balance and cash_balance > 1.0:
            return ClosureStep.WAITING_SETTLEMENT
        elif cash_withdrawable == cash_balance and cash_balance > 1.0:
            return ClosureStep.WITHDRAWING_FUNDS
        elif cash_balance <= 1.0:
            return ClosureStep.CLOSING_ACCOUNT
        else:
            return ClosureStep.INITIATED
    
    def is_ready_for_next_step(self, current_step: ClosureStep, account_info: Dict[str, Any]) -> bool:
        """Check if ready for next step."""
        orders = account_info["orders"]
        positions = account_info["positions"]
        cash_balance = account_info["cash_balance"]
        cash_withdrawable = account_info["cash_withdrawable"]
        
        if current_step == ClosureStep.LIQUIDATING_POSITIONS:
            return len(orders) == 0 and len(positions) == 0
        elif current_step == ClosureStep.WAITING_SETTLEMENT:
            return cash_withdrawable == cash_balance and cash_withdrawable > 0
        elif current_step == ClosureStep.WITHDRAWING_FUNDS:
            return cash_balance <= 1.0
        elif current_step == ClosureStep.CLOSING_ACCOUNT:
            return len(positions) == 0 and cash_balance <= 1.0
        return False
    
    def get_next_action(self, current_step: ClosureStep, ready_for_next: bool) -> str:
        """Determine the next action to take."""
        if not ready_for_next:
            return "wait"
        
        if current_step == ClosureStep.LIQUIDATING_POSITIONS:
            return "check_settlement"
        elif current_step == ClosureStep.WAITING_SETTLEMENT:
            return "withdraw_funds"
        elif current_step == ClosureStep.WITHDRAWING_FUNDS:
            return "close_account"
        elif current_step == ClosureStep.CLOSING_ACCOUNT:
            return "close_account"
        
        return "continue_process"

class AccountClosureManager:
    """
    Coordinates the account closure process using extracted services.
    Now focuses on orchestration rather than handling all responsibilities.
    """
    
    def __init__(self, sandbox: bool = True):
        """Initialize the manager with required services."""
        from alpaca.broker.client import BrokerClient
        
        self.sandbox = sandbox
        self._setup_broker_client()
        
        # Initialize service dependencies
        self.broker_service = BrokerService(self.broker_client)
        self.state_manager = ClosureStateManager()
        
    def _setup_broker_client(self):
        """Setup broker client with proper configuration."""
        import os
        
        api_key = os.getenv('BROKER_API_KEY')
        secret_key = os.getenv('BROKER_SECRET_KEY')
        
        if not api_key or not secret_key:
            raise ValueError("BROKER_API_KEY and BROKER_SECRET_KEY environment variables are required")
        
        from alpaca.broker.client import BrokerClient
        
        if self.sandbox:
            self.broker_client = BrokerClient(
                api_key=api_key,
                secret_key=secret_key,
                sandbox=True
            )
        else:
            self.broker_client = BrokerClient(
                api_key=api_key,
                secret_key=secret_key,
                sandbox=False
            )
    
    def check_closure_preconditions(self, account_id: str) -> Dict[str, Any]:
        """Check if account is ready for closure process."""
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        try:
            if detailed_logger:
                detailed_logger.log_step_start("CHECK_CLOSURE_PRECONDITIONS", {"account_id": account_id})
            
            account_info = self.broker_service.get_account_info(account_id)
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("PRECONDITIONS_ACCOUNT_INFO", account_info)
            
            # Basic validations
            if str(account_info["account"].status) == "CLOSED":
                return {"ready": False, "reason": "Account is already closed"}
            
            if str(account_info["account"].status) != "ACTIVE":
                return {"ready": False, "reason": f"Account status is {account_info['account'].status}, must be ACTIVE"}
            
            # More complex business rules can be added here
            result = {
                "ready": True,
                "account_status": str(account_info["account"].status),
                "positions_count": len(account_info["positions"]),
                "orders_count": len(account_info["orders"]),
                "cash_balance": account_info["cash_balance"]
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("CHECK_CLOSURE_PRECONDITIONS", result)
            
            return result
            
        except Exception as e:
            error_result = {"ready": False, "error": str(e)}
            if detailed_logger:
                detailed_logger.log_step_failure("CHECK_CLOSURE_PRECONDITIONS", str(e))
                error_result["log_file"] = detailed_logger.get_log_summary()
            return error_result
    
    def get_closure_status(self, account_id: str) -> Dict[str, Any]:
        """Get comprehensive status of account closure process."""
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        try:
            if detailed_logger:
                detailed_logger.log_step_start("GET_CLOSURE_STATUS", {"account_id": account_id})
            
            account_info = self.broker_service.get_account_info(account_id)
            current_step = self.state_manager.determine_current_step(account_info)
            ready_for_next = self.state_manager.is_ready_for_next_step(current_step, account_info)
            next_action = self.state_manager.get_next_action(current_step, ready_for_next)
            
            status_result = {
                "account_id": account_id,
                "current_step": current_step.value,
                "account_status": str(account_info["account"].status),
                "open_orders": len(account_info["orders"]),
                "open_positions": len(account_info["positions"]),
                "cash_balance": account_info["cash_balance"],
                "cash_withdrawable": account_info["cash_withdrawable"],
                "ready_for_next_step": ready_for_next,
                "can_retry": current_step != ClosureStep.COMPLETED,
                "next_action": next_action
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("GET_CLOSURE_STATUS", status_result)
            
            return status_result
            
        except Exception as e:
            error_result = {
                "account_id": account_id,
                "current_step": ClosureStep.FAILED.value,
                "error": str(e),
                "can_retry": True,
                "next_action": "retry_from_beginning"
            }
            if detailed_logger:
                detailed_logger.log_step_failure("GET_CLOSURE_STATUS", str(e))
                error_result["log_file"] = detailed_logger.get_log_summary()
            return error_result
    
    def liquidate_positions(self, account_id: str) -> Dict[str, Any]:
        """Liquidate all positions in the account."""
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        try:
            if detailed_logger:
                detailed_logger.log_step_start("LIQUIDATE_POSITIONS", {"account_id": account_id})
            
            result = self.broker_service.liquidate_positions(account_id)
            
            if detailed_logger:
                if result.get("success"):
                    detailed_logger.log_step_success("LIQUIDATE_POSITIONS", result)
                else:
                    detailed_logger.log_step_failure("LIQUIDATE_POSITIONS", result.get("error", "Unknown error"))
            
            return result
            
        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            if detailed_logger:
                detailed_logger.log_step_failure("LIQUIDATE_POSITIONS", str(e))
                error_result["log_file"] = detailed_logger.get_log_summary()
            return error_result
    
    def withdraw_funds(self, account_id: str, ach_relationship_id: str, amount: float = None) -> Dict[str, Any]:
        """Withdraw funds from the account."""
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        try:
            if detailed_logger:
                detailed_logger.log_step_start("WITHDRAW_FUNDS", {
                    "account_id": account_id,
                    "ach_relationship_id": ach_relationship_id,
                    "amount": amount
                })
            
            # Auto-determine amount if not provided
            if amount is None:
                account_info = self.broker_service.get_account_info(account_id)
                amount = account_info["cash_withdrawable"]
                
                if amount <= 1.0:
                    return {"success": False, "error": "No withdrawable funds (amount <= $1.00)"}
            
            result = self.broker_service.withdraw_funds(account_id, ach_relationship_id, amount)
            
            if detailed_logger:
                if result.get("success"):
                    detailed_logger.log_step_success("WITHDRAW_FUNDS", result)
                else:
                    detailed_logger.log_step_failure("WITHDRAW_FUNDS", result.get("error", "Unknown error"))
            
            return result
            
        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            if detailed_logger:
                detailed_logger.log_step_failure("WITHDRAW_FUNDS", str(e))
                error_result["log_file"] = detailed_logger.get_log_summary()
            return error_result
    
    def close_account(self, account_id: str) -> Dict[str, Any]:
        """Close the account after all preconditions are met."""
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        try:
            if detailed_logger:
                detailed_logger.log_step_start("CLOSE_ACCOUNT", {"account_id": account_id})
            
            # Final validation
            account_info = self.broker_service.get_account_info(account_id)
            
            if len(account_info["positions"]) > 0:
                return {"success": False, "error": f"Account has {len(account_info['positions'])} open positions"}
            
            if account_info["cash_balance"] > 1.0:
                return {"success": False, "error": f"Account has ${account_info['cash_balance']:.2f} remaining"}
            
            result = self.broker_service.close_account(account_id)
            
            if detailed_logger:
                if result.get("success"):
                    detailed_logger.log_step_success("CLOSE_ACCOUNT", result)
                else:
                    detailed_logger.log_step_failure("CLOSE_ACCOUNT", result.get("error", "Unknown error"))
            
            return result
            
        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            if detailed_logger:
                detailed_logger.log_step_failure("CLOSE_ACCOUNT", str(e))
                error_result["log_file"] = detailed_logger.get_log_summary()
            return error_result

# Convenience functions for easier use
def check_account_closure_readiness(account_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """Check if account is ready for closure."""
    manager = AccountClosureManager(sandbox)
    return manager.check_closure_preconditions(account_id)

def _redact_account_data(account_data):
    """Redact PII from account data before logging."""
    if not account_data:
        return {}
    # Only log non-sensitive fields
    redacted = {}
    # Always include status and id
    for field in ["id", "status", "type", "created_at", "updated_at"]:
        if hasattr(account_data, field):
            redacted[field] = getattr(account_data, field)
        elif isinstance(account_data, dict) and field in account_data:
            redacted[field] = account_data[field]
    # Optionally include other non-PII fields
    # Add more fields as needed, but never include names, emails, bank info, etc.
    return redacted

def initiate_account_closure(account_id: str, ach_relationship_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """
    Initiate the complete account closure process with comprehensive logging and safety checks.
    
    This function uses Alpaca's 2025 API close_all_positions_for_account(cancel_orders=True)
    which cancels all orders AND liquidates all positions in a single optimized call.
    """
    # Initialize detailed logging for this closure attempt
    detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
    start_time = time.time()
    
    if detailed_logger:
        detailed_logger.log_step_start("ACCOUNT_CLOSURE_INITIATION", {
            "account_id": account_id,
            "ach_relationship_id": ach_relationship_id,
            "sandbox_mode": sandbox,
            "timestamp": datetime.now().isoformat()
        })
    
    manager = AccountClosureManager(sandbox)
    
    try:
        # STEP 1: COMPREHENSIVE PRECONDITION CHECKS
        if detailed_logger:
            detailed_logger.log_step_start("PRECONDITION_CHECKS")
            
        preconditions = manager.check_closure_preconditions(account_id)
        
        # Log redacted Alpaca account data for verification
        if detailed_logger:
            account_data = manager.broker_client.get_account_by_id(account_id)
            detailed_logger.log_alpaca_data("ACCOUNT_DATA", _redact_account_data(account_data))
            
            positions_data = manager.broker_client.get_all_positions_for_account(account_id)
            detailed_logger.log_alpaca_data("POSITIONS_DATA", positions_data)
            
            # Get open orders using proper filter for logging (2025 API)
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            order_filter = GetOrdersRequest(status=QueryOrderStatus.OPEN)
            orders_data = manager.broker_client.get_orders_for_account(account_id, filter=order_filter)
            detailed_logger.log_alpaca_data("ORDERS_DATA", orders_data)
        
        # SAFETY CHECK: Verify account is ready
        if not preconditions.get("ready", False):
            if detailed_logger:
                detailed_logger.log_safety_check("ACCOUNT_READINESS", False, preconditions)
                detailed_logger.log_step_failure("PRECONDITION_CHECKS", 
                    preconditions.get("reason", "Account not ready"), preconditions)
            return {
                "success": False,
                "step": "preconditions",
                "reason": preconditions.get("reason", "Account not ready for closure"),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
        
        if detailed_logger:
            detailed_logger.log_safety_check("ACCOUNT_READINESS", True, preconditions)
            detailed_logger.log_step_success("PRECONDITION_CHECKS", preconditions)
        
        # STEP 2: CANCEL ORDERS AND LIQUIDATE POSITIONS (2025 ALPACA API)
        if detailed_logger:
            detailed_logger.log_step_start("CANCEL_AND_LIQUIDATE", {
                "open_orders": preconditions.get("open_orders", 0),
                "open_positions": preconditions.get("open_positions", 0),
                "method": "close_all_positions_for_account(cancel_orders=True)"
            })
        
        liquidation_start = time.time()
        liquidation_result = manager.liquidate_positions(account_id)
        liquidation_duration = time.time() - liquidation_start
        
        if detailed_logger:
            detailed_logger.log_timing("LIQUIDATION_OPERATION", liquidation_duration)
        
        # SAFETY CHECK: Verify liquidation succeeded
        if not liquidation_result.get("success", False):
            if detailed_logger:
                detailed_logger.log_safety_check("LIQUIDATION_SUCCESS", False, liquidation_result)
                detailed_logger.log_step_failure("CANCEL_AND_LIQUIDATE", 
                    liquidation_result.get("error", "Unknown error"), liquidation_result)
            return {
                "success": False,
                "step": "cancel_and_liquidate",
                "reason": liquidation_result.get("error", "Failed to cancel orders and liquidate positions"),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
        
        if detailed_logger:
            detailed_logger.log_safety_check("LIQUIDATION_SUCCESS", True, liquidation_result)
            detailed_logger.log_step_success("CANCEL_AND_LIQUIDATE", liquidation_result)
        
        # STEP 3: GET CONFIRMATION NUMBER FROM SUPABASE (don't generate new one)
        confirmation_number = None
        try:
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            # Find user by account_id and get existing confirmation number
            result = supabase.table("user_onboarding").select(
                "account_closure_confirmation_number, user_id"
            ).eq("alpaca_account_id", account_id).execute()
            
            if result.data and result.data[0].get("account_closure_confirmation_number"):
                confirmation_number = result.data[0]["account_closure_confirmation_number"]
                logger.info(f"Using existing confirmation number from Supabase: {confirmation_number}")
            else:
                # Fallback: generate new confirmation number if none exists
                confirmation_number = f"CLA-{datetime.now().strftime('%Y%m%d%H%M%S')}-{account_id[-6:]}"
                logger.warning(f"No confirmation number found in Supabase, generated new one: {confirmation_number}")
        except Exception as e:
            # Fallback: generate new confirmation number if Supabase lookup fails
            confirmation_number = f"CLA-{datetime.now().strftime('%Y%m%d%H%M%S')}-{account_id[-6:]}"
            logger.warning(f"Failed to get confirmation number from Supabase: {e}, generated new one: {confirmation_number}")
        
        # STEP 4: VERIFY POST-LIQUIDATION STATE
        if detailed_logger:
            detailed_logger.log_step_start("POST_LIQUIDATION_VERIFICATION")
            
        post_liquidation_check = manager.get_closure_status(account_id)
        if detailed_logger:
            detailed_logger.log_alpaca_data("POST_LIQUIDATION_STATUS", post_liquidation_check)
            
        # SAFETY CHECK: Ensure positions are actually cleared
        remaining_positions = post_liquidation_check.get("open_positions", 0)
        remaining_orders = post_liquidation_check.get("open_orders", 0)
        
        if detailed_logger:
            detailed_logger.log_safety_check("POSITIONS_CLEARED", remaining_positions == 0, {
                "remaining_positions": remaining_positions,
                "remaining_orders": remaining_orders
            })
        
        # Calculate estimated settlement date (T+1 business day)
        settlement_date = datetime.now() + timedelta(days=1)
        # Skip weekends
        while settlement_date.weekday() >= 5:  # Saturday = 5, Sunday = 6
            settlement_date += timedelta(days=1)
        
        result = {
            "success": True,
            "step": ClosureStep.WAITING_SETTLEMENT.value,
            "positions_liquidated": liquidation_result.get("positions_liquidated", 0),
            "liquidation_orders": liquidation_result.get("liquidation_orders", []),
            "confirmation_number": confirmation_number,
            "message": "Account closure process initiated. Orders canceled and positions liquidated.",
            "next_steps": [
                "Wait for settlement (T+1 business day)",
                "Withdraw funds via ACH", 
                "Close account when balance is $0"
            ],
            "settlement_date": settlement_date.strftime("%Y-%m-%d"),
            "estimated_completion": (settlement_date + timedelta(days=2)).strftime("%Y-%m-%d"),
            "real_time_data": {
                "account_status": post_liquidation_check.get("account_status"),
                "cash_balance": post_liquidation_check.get("cash_balance"),
                "positions_remaining": remaining_positions,
                "orders_remaining": remaining_orders
            },
            "log_file": detailed_logger.get_log_summary() if detailed_logger else None
        }
        
        # STEP 5: SEND EMAIL NOTIFICATION
        if detailed_logger:
            detailed_logger.log_step_start("EMAIL_NOTIFICATION")
            
        # Send initial email notification if email service is available
        if send_account_closure_email:
            try:
                # Get account details for email
                temp_manager = AccountClosureManager(sandbox)
                account = temp_manager.broker_client.get_account_by_id(account_id)
                user_name = "Valued Customer"  # Default fallback
                user_email = None
                
                if hasattr(account, 'contact') and account.contact:
                    if hasattr(account.contact, 'email_address'):
                        user_email = account.contact.email_address
                    
                    # Try to get name from contact info
                    if hasattr(account.contact, 'given_name') and hasattr(account.contact, 'family_name'):
                        user_name = f"{account.contact.given_name} {account.contact.family_name}"
                
                if user_email:
                    email_sent = send_account_closure_email(
                        user_email=user_email,
                        user_name=user_name,
                        account_id=account_id,
                        confirmation_number=confirmation_number,
                        estimated_completion="3-5 business days"
                    )
                    
                    if detailed_logger:
                        detailed_logger.log_email_notification("INITIATION_EMAIL", user_email, email_sent)
                    
                    if email_sent:
                        logger.info(f"Account closure initiation email sent to {user_email}")
                        result["email_notification_sent"] = True
                    else:
                        logger.warning(f"Failed to send account closure initiation email to {user_email}")
                        result["email_notification_sent"] = False
                else:
                    if detailed_logger:
                        detailed_logger.log_email_notification("INITIATION_EMAIL", "N/A", False, "No email address found")
                    logger.warning(f"No email address found for account {account_id} - initiation email not sent")
                    result["email_notification_sent"] = False
                    
            except Exception as e:
                if detailed_logger:
                    detailed_logger.log_step_failure("EMAIL_NOTIFICATION", str(e))
                logger.error(f"Error sending initiation email for account {account_id}: {e}")
                result["email_notification_sent"] = False
        else:
            if detailed_logger:
                detailed_logger.log_email_notification("INITIATION_EMAIL", "N/A", False, "Email service not available")
            result["email_notification_sent"] = False
        
        # Log completion of initiation process
        total_duration = time.time() - start_time
        if detailed_logger:
            detailed_logger.log_timing("TOTAL_INITIATION", total_duration)
            detailed_logger.log_step_success("ACCOUNT_CLOSURE_INITIATION", result)
        
        return result
        
    except Exception as e:
        # Handle any unexpected errors during the initiation process
        if detailed_logger:
            detailed_logger.log_step_failure("ACCOUNT_CLOSURE_INITIATION", str(e))
        logger.error(f"Unexpected error during account closure initiation for {account_id}: {e}")
        return {
            "success": False,
            "step": "initiation_error",
            "error": str(e),
            "log_file": detailed_logger.get_log_summary() if detailed_logger else None
        }

def get_closure_progress(account_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """Get current progress of account closure."""
    manager = AccountClosureManager(sandbox)
    return manager.get_closure_status(account_id)

def resume_account_closure(account_id: str, ach_relationship_id: str = None, sandbox: bool = True) -> Dict[str, Any]:
    """
    Resume account closure process with automatic retry logic.
    
    This is the main entry point for resuming closure processes and handles
    all the retry logic automatically.
    """
    manager = AccountClosureManager(sandbox)
    return manager.resume_closure_process(account_id, ach_relationship_id) 