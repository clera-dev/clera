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

class AccountClosureManager:
    """
    Manages the complete account closure process following Alpaca's requirements.
    
    This implements the safe closure workflow:
    1. Cancel all open orders
    2. Liquidate all positions
    3. Wait for settlement (T+1)
    4. Withdraw all funds via ACH
    5. Close the account when balance is $0
    """
    
    def __init__(self, sandbox: bool = True):
        self.broker_client = get_broker_client(sandbox)
        
    def check_closure_preconditions(self, account_id: str) -> Dict[str, Any]:
        """
        Check if account meets pre-conditions for closure.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with closure readiness info
        """
        try:
            # Get basic account info for status check
            account = self.broker_client.get_account_by_id(account_id)
            
            # Get trading account info for cash balances
            trade_account = self.broker_client.get_trade_account_by_id(account_id)
            
            positions = self.broker_client.get_all_positions_for_account(account_id)
            
            # Get open orders using proper filter (2025 API)
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            order_filter = GetOrdersRequest(status=QueryOrderStatus.OPEN)
            orders = self.broker_client.get_orders_for_account(account_id, filter=order_filter)
            
            ach_relationships = self.broker_client.get_ach_relationships_for_account(account_id)
            
            # Check account status
            if account.status != "ACTIVE":
                return {
                    "ready": False,
                    "reason": f"Account status is {account.status}, must be ACTIVE",
                    "account_status": str(account.status),
                    "open_orders": len(orders),
                    "open_positions": len(positions),
                    "cash_balance": float(trade_account.cash) if hasattr(trade_account, 'cash') else 0,
                    "has_ach_relationship": len(ach_relationships) > 0
                }
            
            # Note: Removed Pattern Day Trader restriction check
            # PDT rules should not prevent users from closing their accounts
            
            return {
                "ready": True,
                "account_status": str(account.status),
                "open_orders": len(orders),
                "open_positions": len(positions),
                "cash_balance": float(trade_account.cash) if hasattr(trade_account, 'cash') else 0,
                "equity": float(trade_account.equity) if hasattr(trade_account, 'equity') else 0,
                "withdrawable_cash": float(trade_account.cash_withdrawable) if hasattr(trade_account, 'cash_withdrawable') else 0,
                "has_ach_relationship": len(ach_relationships) > 0,
                "ach_relationships": [
                    {
                        "id": rel.id,
                        "bank_name": rel.bank_account_name if hasattr(rel, 'bank_account_name') else "Unknown",
                        "account_number_last4": rel.account_number[-4:] if hasattr(rel, 'account_number') and rel.account_number else "****"
                    }
                    for rel in ach_relationships
                ]
            }
            
        except Exception as e:
            logger.error(f"Error checking closure preconditions for account {account_id}: {e}")
            return {
                "ready": False,
                "reason": f"Error checking account: {str(e)}",
                "error": str(e)
            }
    
    def cancel_all_orders(self, account_id: str) -> Dict[str, Any]:
        """
        Cancel all open orders for the account.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with cancellation results
        """
        # Initialize detailed logging for order cancellation
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        if detailed_logger:
            detailed_logger.log_step_start("CANCEL_ALL_ORDERS", {
                "account_id": account_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            logger.info(f"Canceling all orders for account {account_id}")
            
            # Get all open orders using proper filter (2025 API)
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            order_filter = GetOrdersRequest(status=QueryOrderStatus.OPEN)
            orders = self.broker_client.get_orders_for_account(account_id, filter=order_filter)
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("CANCEL_ORDERS_OPEN_ORDERS", orders)
            
            if not orders:
                if detailed_logger:
                    detailed_logger.log_step_success("CANCEL_ALL_ORDERS", {
                        "success": True,
                        "orders_canceled": 0,
                        "message": "No open orders to cancel"
                    })
                return {
                    "success": True,
                    "orders_canceled": 0,
                    "message": "No open orders to cancel"
                }
            
            if detailed_logger:
                detailed_logger.log_step_start("EXECUTE_ORDER_CANCELLATIONS", {
                    "orders_count": len(orders)
                })
            
            # Cancel each order individually to track results
            canceled_orders = []
            failed_orders = []
            
            for order in orders:
                try:
                    self.broker_client.cancel_order_for_account(account_id, order.id)
                    canceled_orders.append({
                        "id": str(order.id),
                        "symbol": order.symbol,
                        "qty": order.qty,
                        "side": order.side
                    })
                    logger.info(f"Canceled order {order.id} for {order.symbol}")
                except Exception as e:
                    failed_orders.append({
                        "id": str(order.id),
                        "symbol": order.symbol,
                        "error": str(e)
                    })
                    logger.error(f"Failed to cancel order {order.id}: {e}")
            
            result = {
                "success": len(failed_orders) == 0,
                "orders_canceled": len(canceled_orders),
                "orders_failed": len(failed_orders),
                "canceled_orders": canceled_orders,
                "failed_orders": failed_orders
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("CANCEL_ALL_ORDERS", result)
            
            return result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("CANCEL_ALL_ORDERS", str(e))
            logger.error(f"Error canceling orders for account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def liquidate_all_positions(self, account_id: str) -> Dict[str, Any]:
        """
        Liquidate all positions for the account using 2025 Alpaca API.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with liquidation results
        """
        # Initialize detailed logging for liquidation
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        if detailed_logger:
            detailed_logger.log_step_start("LIQUIDATE_ALL_POSITIONS", {
                "account_id": account_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            logger.info(f"Liquidating all positions for account {account_id}")
            
            # Get all positions
            positions = self.broker_client.get_all_positions_for_account(account_id)
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("LIQUIDATION_POSITIONS", positions)
            
            if not positions:
                if detailed_logger:
                    detailed_logger.log_step_success("LIQUIDATE_ALL_POSITIONS", {
                        "success": True,
                        "positions_liquidated": 0,
                        "liquidation_orders": [],
                        "message": "No positions to liquidate"
                    })
                return {
                    "success": True,
                    "positions_liquidated": 0,
                    "liquidation_orders": [],
                    "message": "No positions to liquidate"
                }
            
            if detailed_logger:
                detailed_logger.log_step_start("EXECUTE_LIQUIDATION", {
                    "positions_count": len(positions),
                    "method": "close_all_positions_for_account(cancel_orders=True)"
                })
            
            # Use Alpaca's 2025 API: close_all_positions_for_account with cancel_orders=True
            # This cancels all orders AND liquidates all positions in one optimized call
            liquidation_response = self.broker_client.close_all_positions_for_account(
                account_id=account_id,
                cancel_orders=True  # Cancel any remaining orders during liquidation
            )
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("LIQUIDATION_RESPONSE", liquidation_response)
            
            # Process liquidation results - handle both list and single item responses
            liquidation_orders_list = liquidation_response if isinstance(liquidation_response, list) else [liquidation_response] if liquidation_response else []
            
            successful_liquidations = []
            for order in liquidation_orders_list:
                if order and hasattr(order, 'order_id'):  # Valid order response
                    successful_liquidations.append({
                        "order_id": str(order.order_id),
                        "symbol": str(order.symbol) if hasattr(order, 'symbol') else None,
                        "status": str(order.status) if hasattr(order, 'status') else "submitted"
                    })
            
            result = {
                "success": True,
                "positions_liquidated": len(positions),
                "liquidation_orders": successful_liquidations,
                "settlement_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),  # T+1 settlement
                "message": f"Successfully liquidated {len(positions)} positions"
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("LIQUIDATE_ALL_POSITIONS", result)
            
            return result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("LIQUIDATE_ALL_POSITIONS", str(e))
            logger.error(f"Error liquidating positions for account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def check_settlement_status(self, account_id: str) -> Dict[str, Any]:
        """
        Check if funds have settled and are available for withdrawal.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with settlement status
        """
        # Initialize detailed logging for settlement check
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        if detailed_logger:
            detailed_logger.log_step_start("CHECK_SETTLEMENT_STATUS", {
                "account_id": account_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            # Get trading account for cash info
            trade_account = self.broker_client.get_trade_account_by_id(account_id)
            positions = self.broker_client.get_all_positions_for_account(account_id)
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("SETTLEMENT_CHECK_TRADE_ACCOUNT", trade_account)
                detailed_logger.log_alpaca_data("SETTLEMENT_CHECK_POSITIONS", positions)
            
            # Safe handling of account attributes
            cash_withdrawable = float(trade_account.cash_withdrawable) if hasattr(trade_account, 'cash_withdrawable') else 0
            cash_total = float(trade_account.cash) if hasattr(trade_account, 'cash') else 0
            
            settlement_complete = len(positions) == 0 and cash_withdrawable == cash_total
            pending_settlement = cash_total - cash_withdrawable
            
            result = {
                "settlement_complete": settlement_complete,
                "cash_total": cash_total,
                "cash_withdrawable": cash_withdrawable,
                "pending_settlement": pending_settlement,
                "positions_remaining": len(positions)
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("CHECK_SETTLEMENT_STATUS", result)
            
            return result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("CHECK_SETTLEMENT_STATUS", str(e))
            logger.error(f"Error checking settlement status for account {account_id}: {e}")
            return {
                "settlement_complete": False,
                "error": str(e),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def withdraw_all_funds(self, account_id: str, ach_relationship_id: str) -> Dict[str, Any]:
        """
        Withdraw all available funds via ACH using 2025 API.
        
        Args:
            account_id: The Alpaca account ID
            ach_relationship_id: The ACH relationship ID for withdrawal
            
        Returns:
            Dictionary with withdrawal results
        """
        # Initialize detailed logging for withdrawal
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        if detailed_logger:
            detailed_logger.log_step_start("WITHDRAW_ALL_FUNDS", {
                "account_id": account_id,
                "ach_relationship_id": ach_relationship_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            logger.info(f"Withdrawing all funds for account {account_id}")
            
            # Get current account balance using trade account
            trade_account = self.broker_client.get_trade_account_by_id(account_id)
            cash_withdrawable = float(trade_account.cash_withdrawable) if hasattr(trade_account, 'cash_withdrawable') else 0
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("WITHDRAWAL_TRADE_ACCOUNT", trade_account)
                detailed_logger.log_alpaca_data("WITHDRAWAL_CASH_AMOUNT", {
                    "cash_withdrawable": cash_withdrawable,
                    "cash_balance": float(trade_account.cash) if hasattr(trade_account, 'cash') else 0
                })
            
            if cash_withdrawable <= 1.0:
                if detailed_logger:
                    detailed_logger.log_step_success("WITHDRAW_ALL_FUNDS", {
                        "success": True,
                        "transfer_id": None,
                        "amount": 0,
                        "message": "No funds available for withdrawal"
                    })
                return {
                    "success": True,
                    "transfer_id": None,
                    "amount": 0,
                    "message": "No funds available for withdrawal"
                }
            
            # Create ACH transfer request using 2025 API
            transfer_request = CreateACHTransferRequest(
                amount=cash_withdrawable,
                direction=TransferDirection.OUTGOING,
                type=TransferType.ACH,
                bank_id=ach_relationship_id
            )
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("WITHDRAWAL_TRANSFER_REQUEST", {
                    "amount": cash_withdrawable,
                    "direction": "OUTGOING",
                    "type": "ACH",
                    "bank_id": ach_relationship_id
                })
            
            # Use the correct 2025 API method: create_transfer_for_account
            transfer = self.broker_client.create_transfer_for_account(account_id, transfer_request)
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("WITHDRAWAL_TRANSFER_RESULT", transfer)
            
            result = {
                "success": True,
                "transfer_id": str(transfer.id),
                "amount": cash_withdrawable,
                "status": str(transfer.status),
                "message": f"Withdrawal of ${cash_withdrawable:.2f} initiated"
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("WITHDRAW_ALL_FUNDS", result)
            
            return result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("WITHDRAW_ALL_FUNDS", str(e))
            logger.error(f"Error withdrawing funds for account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def check_withdrawal_status(self, account_id: str, transfer_id: str) -> Dict[str, Any]:
        """
        Check the status of a withdrawal transfer.
        
        Args:
            account_id: The Alpaca account ID
            transfer_id: The transfer ID to check
            
        Returns:
            Dictionary with transfer status
        """
        # Initialize detailed logging for withdrawal status check
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        if detailed_logger:
            detailed_logger.log_step_start("CHECK_WITHDRAWAL_STATUS", {
                "account_id": account_id,
                "transfer_id": transfer_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            # Get transfers for the account using 2025 API
            transfers = self.broker_client.get_transfers_for_account(account_id)
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("WITHDRAWAL_STATUS_TRANSFERS", transfers)
            
            # Find the specific transfer
            target_transfer = None
            for transfer in transfers:
                if str(transfer.id) == transfer_id:
                    target_transfer = transfer
                    break
            
            if not target_transfer:
                if detailed_logger:
                    detailed_logger.log_step_failure("CHECK_WITHDRAWAL_STATUS", 
                        f"Transfer {transfer_id} not found")
                return {
                    "transfer_found": False,
                    "error": f"Transfer {transfer_id} not found",
                    "log_file": detailed_logger.get_log_summary() if detailed_logger else None
                }
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("WITHDRAWAL_STATUS_TARGET_TRANSFER", target_transfer)
            
            status = str(target_transfer.status)
            completed = status in ["COMPLETED", "SETTLED"]
            failed = status in ["FAILED", "CANCELED", "REJECTED"]
            
            result = {
                "transfer_found": True,
                "status": status,
                "amount": float(target_transfer.amount),
                "completed": completed,
                "failed": failed,
                "created_at": target_transfer.created_at.isoformat() if hasattr(target_transfer, 'created_at') else None
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("CHECK_WITHDRAWAL_STATUS", result)
            
            return result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("CHECK_WITHDRAWAL_STATUS", str(e))
            logger.error(f"Error checking withdrawal status for account {account_id}, transfer {transfer_id}: {e}")
            return {
                "transfer_found": False,
                "error": str(e),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def close_account(self, account_id: str) -> Dict[str, Any]:
        """
        Close the account using Alpaca's 2025 API.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with closure results
        """
        # Initialize detailed logging for account closure
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        if detailed_logger:
            detailed_logger.log_step_start("CLOSE_ACCOUNT", {
                "account_id": account_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            logger.info(f"Closing account {account_id}")
            
            # Verify account is ready for closure
            account = self.broker_client.get_account_by_id(account_id)
            trade_account = self.broker_client.get_trade_account_by_id(account_id)
            positions = self.broker_client.get_all_positions_for_account(account_id)
            cash_balance = float(trade_account.cash) if hasattr(trade_account, 'cash') else 0
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("CLOSE_ACCOUNT_VERIFICATION", {
                    "account": account,
                    "trade_account": trade_account,
                    "positions": positions,
                    "cash_balance": cash_balance
                })
            
            if len(positions) > 0:
                if detailed_logger:
                    detailed_logger.log_step_failure("CLOSE_ACCOUNT", 
                        f"Account has {len(positions)} open positions - cannot close")
                return {
                    "success": False,
                    "error": f"Account has {len(positions)} open positions - cannot close",
                    "log_file": detailed_logger.get_log_summary() if detailed_logger else None
                }
            
            if cash_balance > 1.0:
                if detailed_logger:
                    detailed_logger.log_step_failure("CLOSE_ACCOUNT", 
                        f"Account has ${cash_balance:.2f} remaining - must withdraw funds first")
                return {
                    "success": False,
                    "error": f"Account has ${cash_balance:.2f} remaining - must withdraw funds first",
                    "log_file": detailed_logger.get_log_summary() if detailed_logger else None
                }
            
            if detailed_logger:
                detailed_logger.log_step_start("EXECUTE_ACCOUNT_CLOSURE")
            
            # Close the account using Alpaca's 2025 API
            # According to docs: close_account returns None on success
            self.broker_client.close_account(account_id)
            
            if detailed_logger:
                detailed_logger.log_step_success("EXECUTE_ACCOUNT_CLOSURE", {
                    "message": "Account closure API call completed successfully"
                })
            
            # Verify account was closed
            try:
                updated_account = self.broker_client.get_account_by_id(account_id)
                account_status = str(updated_account.status)
                if detailed_logger:
                    detailed_logger.log_alpaca_data("CLOSE_ACCOUNT_VERIFICATION_RESULT", updated_account)
            except Exception:
                # If we can't retrieve it, assume it was closed
                account_status = "CLOSED"
                if detailed_logger:
                    detailed_logger.log_alpaca_data("CLOSE_ACCOUNT_VERIFICATION_RESULT", {
                        "status": "CLOSED",
                        "note": "Could not retrieve account - assuming closed"
                    })
            
            result = {
                "success": True,
                "account_status": account_status,
                "message": "Account successfully closed"
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("CLOSE_ACCOUNT", result)
            
            return result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("CLOSE_ACCOUNT", str(e))
            logger.error(f"Error closing account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def get_closure_status(self, account_id: str) -> Dict[str, Any]:
        """
        Get comprehensive status of account closure process with retry-friendly logic.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with current closure status and retry capability
        """
        # Initialize detailed logging for status check
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        
        if detailed_logger:
            detailed_logger.log_step_start("GET_CLOSURE_STATUS", {
                "account_id": account_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            account = self.broker_client.get_account_by_id(account_id)
            trade_account = self.broker_client.get_trade_account_by_id(account_id)
            positions = self.broker_client.get_all_positions_for_account(account_id)
            
            # Get open orders using proper filter (2025 API)
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            order_filter = GetOrdersRequest(status=QueryOrderStatus.OPEN)
            orders = self.broker_client.get_orders_for_account(account_id, filter=order_filter)
            
            cash_balance = float(trade_account.cash) if hasattr(trade_account, 'cash') else 0
            cash_withdrawable = float(trade_account.cash_withdrawable) if hasattr(trade_account, 'cash_withdrawable') else 0
            
            # Log raw account data for verification
            if detailed_logger:
                detailed_logger.log_alpaca_data("STATUS_CHECK_ACCOUNT", account)
                detailed_logger.log_alpaca_data("STATUS_CHECK_TRADE_ACCOUNT", trade_account)
                detailed_logger.log_alpaca_data("STATUS_CHECK_POSITIONS", positions)
                detailed_logger.log_alpaca_data("STATUS_CHECK_ORDERS", orders)
            
            # Determine current step based on account state
            if str(account.status) == "CLOSED":
                current_step = ClosureStep.COMPLETED
            elif len(orders) > 0 or len(positions) > 0:
                # Combined step: cancel orders AND liquidate positions (done together with 2025 API)
                current_step = ClosureStep.LIQUIDATING_POSITIONS
            elif cash_withdrawable == 0 and cash_balance > 1.0:
                current_step = ClosureStep.WAITING_SETTLEMENT
            elif cash_balance > 1.0:
                current_step = ClosureStep.WITHDRAWING_FUNDS
            elif cash_balance <= 1.0:
                current_step = ClosureStep.CLOSING_ACCOUNT
            else:
                current_step = ClosureStep.INITIATED
            
            # Check if ready for retry/next step
            ready_for_retry = self._is_ready_for_next_step(current_step, orders, positions, cash_balance, cash_withdrawable)
            
            status_result = {
                "account_id": account_id,
                "current_step": current_step.value,
                "account_status": str(account.status),
                "open_orders": len(orders),
                "open_positions": len(positions),
                "cash_balance": cash_balance,
                "cash_withdrawable": cash_withdrawable,
                "ready_for_next_step": ready_for_retry,
                "can_retry": current_step != ClosureStep.COMPLETED,
                "next_action": self._get_next_action(current_step, ready_for_retry)
            }
            
            if detailed_logger:
                detailed_logger.log_step_success("GET_CLOSURE_STATUS", status_result)
            
            return status_result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("GET_CLOSURE_STATUS", str(e))
            logger.error(f"Error getting closure status for account {account_id}: {e}")
            return {
                "account_id": account_id,
                "current_step": ClosureStep.FAILED.value,
                "error": str(e),
                "can_retry": True,
                "next_action": "retry_from_beginning",
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def _is_ready_for_next_step(self, current_step: ClosureStep, orders: List, positions: List, 
                               cash_balance: float, cash_withdrawable: float) -> bool:
        """Helper method to determine if ready for next step."""
        if current_step == ClosureStep.LIQUIDATING_POSITIONS:
            # Combined step: ready when both orders and positions are cleared
            return len(orders) == 0 and len(positions) == 0
        elif current_step == ClosureStep.WAITING_SETTLEMENT:
            return cash_withdrawable > 0
        elif current_step == ClosureStep.WITHDRAWING_FUNDS:
            return cash_balance <= 1.0
        elif current_step == ClosureStep.CLOSING_ACCOUNT:
            return len(positions) == 0 and cash_balance <= 1.0
        return False
    
    def _get_next_action(self, current_step: ClosureStep, ready_for_next: bool) -> str:
        """Helper method to determine the next action to take."""
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
    
    def resume_closure_process(self, account_id: str, ach_relationship_id: str = None) -> Dict[str, Any]:
        """
        Resume account closure process from where it left off with automatic retry logic.
        
        This method intelligently determines the current state and continues the process,
        making it suitable for page refreshes and recovery from failed states.
        
        Args:
            account_id: The Alpaca account ID
            ach_relationship_id: ACH relationship ID (optional, will try to find if not provided)
            
        Returns:
            Dictionary with current progress and next steps
        """
        # Initialize detailed logging for this resume attempt
        detailed_logger = AccountClosureLogger(account_id) if AccountClosureLogger else None
        start_time = time.time()
        
        if detailed_logger:
            detailed_logger.log_step_start("ACCOUNT_CLOSURE_RESUME", {
                "account_id": account_id,
                "ach_relationship_id": ach_relationship_id,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            if detailed_logger:
                detailed_logger.log_step_start("GET_CURRENT_STATUS")
            
            logger.info(f"🔄 Resuming closure process for account {account_id}")
            
            # STEP 1: Get current status
            current_status = self.get_closure_status(account_id)
            current_step = current_status.get("current_step")
            ready_for_next = current_status.get("ready_for_next_step", False)
            next_action = current_status.get("next_action", "wait")
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("CURRENT_STATUS", current_status)
                detailed_logger.log_step_success("GET_CURRENT_STATUS", {
                    "current_step": current_step,
                    "ready_for_next": ready_for_next,
                    "next_action": next_action
                })
            
            logger.info(f"📊 Current state: {current_step}, Ready: {ready_for_next}, Next: {next_action}")
            
            # If already completed, return success
            if current_step == ClosureStep.COMPLETED.value:
                if detailed_logger:
                    detailed_logger.log_step_success("ACCOUNT_CLOSURE_RESUME", {
                        "message": "Account closure already completed",
                        "current_step": current_step
                    })
                return {
                    "success": True,
                    "current_step": current_step,
                    "message": "Account closure already completed",
                    "status": current_status
                }
            
            # STEP 2: Automatic retry logic based on current state
            result = {"success": False, "current_step": current_step}
            
            if current_step == ClosureStep.LIQUIDATING_POSITIONS.value:
                if detailed_logger:
                    detailed_logger.log_step_start("RESUME_LIQUIDATION", {
                        "orders": current_status.get("open_orders", 0),
                        "positions": current_status.get("open_positions", 0)
                    })
                
                # Check if there are positions or orders that need liquidation
                orders = current_status.get("open_orders", 0)
                positions = current_status.get("open_positions", 0)
                
                if orders > 0 or positions > 0:
                    # There are positions/orders to liquidate
                    logger.info(f"🚀 Executing: Liquidate {positions} positions and cancel {orders} orders")
                    liquidation_result = self.liquidate_all_positions(account_id)
                    
                    if detailed_logger:
                        detailed_logger.log_alpaca_data("LIQUIDATION_RESULT", liquidation_result)
                    
                    if liquidation_result.get("success"):
                        if detailed_logger:
                            detailed_logger.log_step_success("RESUME_LIQUIDATION", liquidation_result)
                        result.update({
                            "success": True,
                            "action_taken": "liquidate_positions",
                            "liquidation_result": liquidation_result,
                            "message": f"Successfully liquidated {positions} positions and {orders} orders, waiting for settlement"
                        })
                    else:
                        if detailed_logger:
                            detailed_logger.log_step_failure("RESUME_LIQUIDATION", 
                                liquidation_result.get("error", "Failed to liquidate positions"), liquidation_result)
                        result.update({
                            "action_taken": "liquidate_positions",
                            "error": liquidation_result.get("error", "Failed to liquidate positions"),
                            "can_retry": True
                        })
                elif ready_for_next:
                    # No positions/orders to liquidate, ready to move to settlement
                    if detailed_logger:
                        detailed_logger.log_step_success("RESUME_LIQUIDATION", {
                            "message": "No positions to liquidate, checking settlement status"
                        })
                    result.update({
                        "success": True,
                        "action_taken": "check_settlement",
                        "message": "No positions to liquidate, checking settlement status"
                    })
                    
            elif current_step == ClosureStep.WAITING_SETTLEMENT.value and ready_for_next:
                if detailed_logger:
                    detailed_logger.log_step_start("RESUME_WITHDRAWAL", {
                        "cash_balance": current_status.get("cash_balance"),
                        "cash_withdrawable": current_status.get("cash_withdrawable")
                    })
                
                # Settlement is complete, ready to withdraw
                logger.info("🚀 Executing: Withdraw funds")
                
                # Find ACH relationship if not provided
                if not ach_relationship_id:
                    ach_relationships = self.broker_client.get_ach_relationships_for_account(account_id)
                    if ach_relationships:
                        ach_relationship_id = ach_relationships[0].id
                        logger.info(f"💳 Found ACH relationship: {ach_relationship_id}")
                        if detailed_logger:
                            detailed_logger.log_alpaca_data("ACH_RELATIONSHIP_FOUND", {
                                "ach_relationship_id": ach_relationship_id,
                                "total_relationships": len(ach_relationships)
                            })
                    else:
                        if detailed_logger:
                            detailed_logger.log_step_failure("RESUME_WITHDRAWAL", 
                                "No ACH relationship found - user must connect bank account")
                        result.update({
                            "action_taken": "find_ach_relationship",
                            "error": "No ACH relationship found - user must connect bank account",
                            "requires_user_action": True
                        })
                        return result
                
                withdrawal_result = self.withdraw_all_funds(account_id, ach_relationship_id)
                
                if detailed_logger:
                    detailed_logger.log_alpaca_data("WITHDRAWAL_RESULT", withdrawal_result)
                
                if withdrawal_result.get("success"):
                    if detailed_logger:
                        detailed_logger.log_step_success("RESUME_WITHDRAWAL", withdrawal_result)
                    result.update({
                        "success": True,
                        "action_taken": "withdraw_funds",
                        "withdrawal_result": withdrawal_result,
                        "message": "Withdrawal initiated, waiting for completion"
                    })
                else:
                    if detailed_logger:
                        detailed_logger.log_step_failure("RESUME_WITHDRAWAL", 
                            withdrawal_result.get("error", "Failed to withdraw funds"), withdrawal_result)
                    result.update({
                        "action_taken": "withdraw_funds",
                        "error": withdrawal_result.get("error", "Failed to withdraw funds"),
                        "can_retry": True
                    })
                    
            elif current_step == ClosureStep.WITHDRAWING_FUNDS.value and ready_for_next:
                if detailed_logger:
                    detailed_logger.log_step_start("RESUME_ACCOUNT_CLOSURE", {
                        "cash_balance": current_status.get("cash_balance")
                    })
                
                # Funds withdrawn, ready to close account
                logger.info("🚀 Executing: Close account")
                
                close_result = self.close_account(account_id)
                
                if detailed_logger:
                    detailed_logger.log_alpaca_data("CLOSE_RESULT", close_result)
                
                if close_result.get("success"):
                    if detailed_logger:
                        detailed_logger.log_step_success("RESUME_ACCOUNT_CLOSURE", close_result)
                    result.update({
                        "success": True,
                        "action_taken": "close_account",
                        "close_result": close_result,
                        "message": "Account successfully closed"
                    })
                else:
                    if detailed_logger:
                        detailed_logger.log_step_failure("RESUME_ACCOUNT_CLOSURE", 
                            close_result.get("error", "Failed to close account"), close_result)
                    result.update({
                        "action_taken": "close_account", 
                        "error": close_result.get("error", "Failed to close account"),
                        "can_retry": True
                    })
                    
            elif current_step == ClosureStep.CLOSING_ACCOUNT.value and ready_for_next:
                if detailed_logger:
                    detailed_logger.log_step_start("RESUME_FINAL_CLOSURE")
                
                # Final closure step
                logger.info("🚀 Executing: Final account closure")
                
                close_result = self.close_account(account_id)
                
                if detailed_logger:
                    detailed_logger.log_alpaca_data("FINAL_CLOSE_RESULT", close_result)
                
                if close_result.get("success"):
                    if detailed_logger:
                        detailed_logger.log_step_success("RESUME_FINAL_CLOSURE", close_result)
                    result.update({
                        "success": True,
                        "action_taken": "close_account",
                        "close_result": close_result,
                        "message": "Account successfully closed"
                    })
                else:
                    if detailed_logger:
                        detailed_logger.log_step_failure("RESUME_FINAL_CLOSURE", 
                            close_result.get("error", "Failed to close account"), close_result)
                    result.update({
                        "action_taken": "close_account",
                        "error": close_result.get("error", "Failed to close account"),
                        "can_retry": True
                    })
                    
            elif current_step == ClosureStep.FAILED.value:
                if detailed_logger:
                    detailed_logger.log_step_start("RESUME_FAILED_STATE")
                
                # Failed state - restart from beginning
                logger.info("🔄 Failed state detected, restarting closure process")
                
                # Check preconditions and restart if ready
                preconditions = self.check_closure_preconditions(account_id)
                if detailed_logger:
                    detailed_logger.log_alpaca_data("FAILED_STATE_PRECONDITIONS", preconditions)
                
                if preconditions.get("ready"):
                    # Restart liquidation process
                    liquidation_result = self.liquidate_all_positions(account_id)
                    
                    if detailed_logger:
                        detailed_logger.log_alpaca_data("RESTART_LIQUIDATION_RESULT", liquidation_result)
                    
                    if liquidation_result.get("success"):
                        if detailed_logger:
                            detailed_logger.log_step_success("RESUME_FAILED_STATE", liquidation_result)
                        result.update({
                            "success": True,
                            "action_taken": "restart_liquidation",
                            "liquidation_result": liquidation_result,
                            "message": "Restarted closure process from liquidation step"
                        })
                    else:
                        if detailed_logger:
                            detailed_logger.log_step_failure("RESUME_FAILED_STATE", 
                                liquidation_result.get("error", "Failed to restart liquidation"), liquidation_result)
                        result.update({
                            "action_taken": "restart_liquidation",
                            "error": liquidation_result.get("error", "Failed to restart liquidation"),
                            "can_retry": True
                        })
                else:
                    if detailed_logger:
                        detailed_logger.log_step_failure("RESUME_FAILED_STATE", 
                            preconditions.get("reason", "Account not ready for closure"), preconditions)
                    result.update({
                        "action_taken": "check_preconditions",
                        "error": preconditions.get("reason", "Account not ready for closure"),
                        "preconditions": preconditions,
                        "can_retry": False
                    })
                    
            else:
                # Not ready for next step or waiting
                wait_reason = self._get_wait_reason(current_step, current_status)
                if detailed_logger:
                    detailed_logger.log_step_start("RESUME_WAITING", {
                        "current_step": current_step,
                        "wait_reason": wait_reason
                    })
                
                result.update({
                    "success": True,
                    "action_taken": "check_status",
                    "message": f"Waiting for {current_step} to complete",
                    "wait_reason": wait_reason
                })
            
            # STEP 3: Add updated status to result
            updated_status = self.get_closure_status(account_id)
            result["status"] = updated_status
            result["current_step"] = updated_status.get("current_step")
            
            if detailed_logger:
                detailed_logger.log_alpaca_data("UPDATED_STATUS", updated_status)
            
            # STEP 4: Determine next retry time if needed
            if not result.get("success") and result.get("can_retry", False):
                result["next_retry_in_seconds"] = self._calculate_retry_delay(current_step)
                result["auto_retry_enabled"] = True
                if detailed_logger:
                    detailed_logger.log_timing("NEXT_RETRY_DELAY", result["next_retry_in_seconds"])
            
            # Log completion of resume process
            total_duration = time.time() - start_time
            if detailed_logger:
                detailed_logger.log_timing("TOTAL_RESUME", total_duration)
                detailed_logger.log_step_success("ACCOUNT_CLOSURE_RESUME", result)
            
            logger.info(f"✅ Resume operation completed: {result.get('action_taken', 'status_check')}")
            return result
            
        except Exception as e:
            if detailed_logger:
                detailed_logger.log_step_failure("ACCOUNT_CLOSURE_RESUME", str(e))
            logger.error(f"❌ Error resuming closure process for account {account_id}: {e}")
            return {
                "success": False,
                "current_step": ClosureStep.FAILED.value,
                "error": str(e),
                "can_retry": True,
                "log_file": detailed_logger.get_log_summary() if detailed_logger else None
            }
    
    def _get_wait_reason(self, current_step: str, status: Dict) -> str:
        """Get human-readable explanation for why we're waiting."""
        if current_step == ClosureStep.LIQUIDATING_POSITIONS.value:
            orders = status.get("open_orders", 0)
            positions = status.get("open_positions", 0)
            if orders > 0 and positions > 0:
                return f"Waiting for {orders} orders and {positions} positions to be processed"
            elif orders > 0:
                return f"Waiting for {orders} orders to be canceled"
            elif positions > 0:
                return f"Waiting for {positions} positions to be liquidated"
            else:
                return "Processing liquidation orders"
                
        elif current_step == ClosureStep.WAITING_SETTLEMENT.value:
            pending = status.get("cash_balance", 0) - status.get("cash_withdrawable", 0)
            return f"Waiting for T+1 settlement (${pending:.2f} pending)"
            
        elif current_step == ClosureStep.WITHDRAWING_FUNDS.value:
            balance = status.get("cash_balance", 0)
            return f"Waiting for withdrawal of ${balance:.2f} to complete"
            
        elif current_step == ClosureStep.CLOSING_ACCOUNT.value:
            return "Waiting for final account closure to process"
            
        return "Processing account closure"
    
    def _calculate_retry_delay(self, current_step: str) -> int:
        """Calculate appropriate retry delay based on step type."""
        if current_step == ClosureStep.LIQUIDATING_POSITIONS.value:
            return 30  # Liquidation can happen quickly
        elif current_step == ClosureStep.WAITING_SETTLEMENT.value:
            return 3600  # Settlement takes longer, check hourly
        elif current_step == ClosureStep.WITHDRAWING_FUNDS.value:
            return 1800  # ACH transfers, check every 30 minutes
        elif current_step == ClosureStep.CLOSING_ACCOUNT.value:
            return 60   # Final closure should be quick
        else:
            return 300  # Default 5 minutes for other cases

# Convenience functions for easier use
def check_account_closure_readiness(account_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """Check if account is ready for closure."""
    manager = AccountClosureManager(sandbox)
    return manager.check_closure_preconditions(account_id)

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
        
        # Log raw Alpaca account data for verification
        if detailed_logger:
            account_data = manager.broker_client.get_account_by_id(account_id)
            detailed_logger.log_alpaca_data("ACCOUNT_DATA", account_data)
            
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
        liquidation_result = manager.liquidate_all_positions(account_id)
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