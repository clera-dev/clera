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
            account = self.broker_client.get_account_by_id(account_id)
            positions = self.broker_client.get_all_positions_for_account(account_id)
            orders = self.broker_client.get_orders_for_account(account_id, status="open")
            ach_relationships = self.broker_client.get_ach_relationships_for_account(account_id)
            
            # Check account status
            if account.status != "ACTIVE":
                return {
                    "ready": False,
                    "reason": f"Account status is {account.status}, must be ACTIVE",
                    "account_status": str(account.status),
                    "open_orders": len(orders),
                    "open_positions": len(positions),
                    "cash_balance": float(account.cash),
                    "has_ach_relationship": len(ach_relationships) > 0
                }
            
            # Check for Pattern Day Trader restrictions
            if hasattr(account, 'pattern_day_trader') and account.pattern_day_trader:
                equity = float(account.equity) if account.equity else 0
                if equity > 0 and equity < 25000:
                    return {
                        "ready": False,
                        "reason": "Account is flagged as Pattern Day Trader with less than $25k equity",
                        "account_status": str(account.status),
                        "open_orders": len(orders),
                        "open_positions": len(positions),
                        "cash_balance": float(account.cash),
                        "equity": equity,
                        "pattern_day_trader": True,
                        "has_ach_relationship": len(ach_relationships) > 0
                    }
            
            return {
                "ready": True,
                "account_status": str(account.status),
                "open_orders": len(orders),
                "open_positions": len(positions),
                "cash_balance": float(account.cash),
                "equity": float(account.equity) if account.equity else 0,
                "withdrawable_cash": float(account.cash_withdrawable) if hasattr(account, 'cash_withdrawable') else 0,
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
        try:
            logger.info(f"Canceling all orders for account {account_id}")
            
            # Get all open orders
            orders = self.broker_client.get_orders_for_account(account_id, status="open")
            
            if not orders:
                return {
                    "success": True,
                    "orders_canceled": 0,
                    "message": "No open orders to cancel"
                }
            
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
            
            return {
                "success": len(failed_orders) == 0,
                "orders_canceled": len(canceled_orders),
                "orders_failed": len(failed_orders),
                "canceled_orders": canceled_orders,
                "failed_orders": failed_orders
            }
            
        except Exception as e:
            logger.error(f"Error canceling orders for account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def liquidate_all_positions(self, account_id: str) -> Dict[str, Any]:
        """
        Liquidate all positions for the account.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with liquidation results
        """
        try:
            logger.info(f"Liquidating all positions for account {account_id}")
            
            # Get all positions
            positions = self.broker_client.get_all_positions_for_account(account_id)
            
            if not positions:
                return {
                    "success": True,
                    "positions_liquidated": 0,
                    "message": "No positions to liquidate"
                }
            
            # Liquidate using Alpaca's close all positions endpoint
            liquidation_orders = self.broker_client.close_all_positions_for_account(
                account_id=account_id,
                cancel_orders=True  # Cancel any remaining orders during liquidation
            )
            
            # Process liquidation results - handle both list and single item responses
            liquidation_orders_list = liquidation_orders if isinstance(liquidation_orders, list) else [liquidation_orders] if liquidation_orders else []
            
            successful_liquidations = []
            for order in liquidation_orders_list:
                if order:  # Valid order response
                    successful_liquidations.append({
                        "order_id": str(order.id) if hasattr(order, 'id') else None,
                        "symbol": str(order.symbol) if hasattr(order, 'symbol') else None,
                        "side": str(order.side) if hasattr(order, 'side') else "sell"
                    })
            
            return {
                "success": True,
                "positions_liquidated": len(positions),
                "liquidation_orders": successful_liquidations,
                "settlement_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")  # T+1 settlement
            }
            
        except Exception as e:
            logger.error(f"Error liquidating positions for account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def check_settlement_status(self, account_id: str) -> Dict[str, Any]:
        """
        Check if funds have settled and are available for withdrawal.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with settlement status
        """
        try:
            account = self.broker_client.get_account_by_id(account_id)
            positions = self.broker_client.get_all_positions_for_account(account_id)
            
            # Safe handling of account attributes
            cash_withdrawable = float(str(account.cash_withdrawable)) if hasattr(account, 'cash_withdrawable') and account.cash_withdrawable else 0
            cash_total = float(str(account.cash)) if hasattr(account, 'cash') and account.cash else 0
            
            settlement_complete = len(positions) == 0 and cash_withdrawable == cash_total
            pending_settlement = cash_total - cash_withdrawable
            
            return {
                "settlement_complete": settlement_complete,
                "positions_remaining": len(positions),
                "cash_total": cash_total,
                "cash_available_for_withdrawal": cash_withdrawable,
                "pending_settlement": pending_settlement,
                "estimated_settlement_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d") if not settlement_complete else None
            }
            
        except Exception as e:
            logger.error(f"Error checking settlement status for account {account_id}: {e}")
            return {
                "settlement_complete": False,
                "positions_remaining": 0,
                "cash_total": 0,
                "cash_available_for_withdrawal": 0,
                "pending_settlement": 0,
                "estimated_settlement_date": None,
                "error": str(e)
            }
    
    def withdraw_all_funds(self, account_id: str, ach_relationship_id: str) -> Dict[str, Any]:
        """
        Withdraw all available funds via ACH.
        
        Args:
            account_id: The Alpaca account ID
            ach_relationship_id: The ACH relationship ID for withdrawal
            
        Returns:
            Dictionary with withdrawal results
        """
        try:
            logger.info(f"Withdrawing all funds for account {account_id}")
            
            account = self.broker_client.get_account_by_id(account_id)
            
            # Safe handling of withdrawable amount
            withdrawable_amount = 0
            if hasattr(account, 'cash_withdrawable') and account.cash_withdrawable:
                withdrawable_amount = float(str(account.cash_withdrawable))
            
            if withdrawable_amount <= 0:
                return {
                    "success": False,
                    "error": "No withdrawable funds available"
                }
            
            # Create ACH withdrawal
            from alpaca.broker.enums import TransferTiming
            
            transfer_request = CreateACHTransferRequest(
                amount=str(withdrawable_amount),
                direction=TransferDirection.OUTGOING,
                timing=TransferTiming.IMMEDIATE,  # Required field
                relationship_id=ach_relationship_id
            )
            
            transfer = self.broker_client.create_ach_transfer_for_account(
                account_id=account_id,
                ach_transfer_data=transfer_request
            )
            
            return {
                "success": True,
                "transfer_id": str(transfer.id),
                "transfer_status": str(transfer.status),
                "amount": str(withdrawable_amount),
                "estimated_completion": "3-5 business days"
            }
            
        except Exception as e:
            logger.error(f"Error withdrawing funds for account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e)
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
        try:
            # Get transfer details using the single transfer endpoint
            transfer = self.broker_client.get_transfer_for_account(account_id, transfer_id)
            
            if not transfer:
                return {
                    "transfer_completed": False,
                    "error": "Transfer not found"
                }
            
            status = str(transfer.status)
            completed = status in ["COMPLETED", "SETTLED"]
            
            result = {
                "transfer_completed": completed,
                "transfer_status": status,
            }
            
            # Safe handling of amount
            if hasattr(transfer, 'amount') and transfer.amount:
                result["amount"] = str(transfer.amount)
            
            # Add completion date if completed
            if completed and hasattr(transfer, 'updated_at'):
                result["completion_date"] = str(transfer.updated_at)
            elif not completed:
                result["estimated_completion"] = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
            
            return result
            
        except Exception as e:
            logger.error(f"Error checking withdrawal status for account {account_id}, transfer {transfer_id}: {e}")
            return {
                "transfer_completed": False,
                "error": str(e)
            }
    
    def close_account(self, account_id: str) -> Dict[str, Any]:
        """
        Close the account after all positions are liquidated and funds withdrawn.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with closure results
        """
        try:
            logger.info(f"Closing account {account_id}")
            
            # Final verification before closure
            account = self.broker_client.get_account_by_id(account_id)
            positions = self.broker_client.get_all_positions_for_account(account_id)
            orders = self.broker_client.get_orders_for_account(account_id, status="open")
            
            # Safe handling of cash balance
            cash_balance = 0
            if hasattr(account, 'cash') and account.cash:
                cash_balance = float(str(account.cash))
            
            if len(positions) > 0:
                return {
                    "success": False,
                    "reason": f"Cannot close account with {len(positions)} open positions"
                }
            
            if len(orders) > 0:
                return {
                    "success": False,
                    "reason": f"Cannot close account with {len(orders)} open orders"
                }
            
            if cash_balance > 1.0:  # Allow for small rounding differences
                return {
                    "success": False,
                    "reason": f"Account balance must be $0 before closure. Current balance: ${cash_balance:.2f}"
                }
            
            # Close the account using Alpaca's close account endpoint
            closure_response = self.broker_client.close_account(account_id)
            
            return {
                "success": True,
                "account_status": "CLOSED",
                "closure_date": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "message": "Account successfully closed"
            }
            
        except Exception as e:
            logger.error(f"Error closing account {account_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_closure_status(self, account_id: str) -> Dict[str, Any]:
        """
        Get comprehensive status of account closure process.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary with current closure status
        """
        try:
            account = self.broker_client.get_account_by_id(account_id)
            positions = self.broker_client.get_all_positions_for_account(account_id)
            orders = self.broker_client.get_orders_for_account(account_id, status="open")
            
            cash_balance = float(account.cash) if account.cash else 0
            cash_withdrawable = float(account.cash_withdrawable) if hasattr(account, 'cash_withdrawable') else 0
            
            # Determine current step
            if str(account.status) == "CLOSED":
                current_step = ClosureStep.COMPLETED
            elif len(orders) > 0:
                current_step = ClosureStep.CANCELING_ORDERS
            elif len(positions) > 0:
                current_step = ClosureStep.LIQUIDATING_POSITIONS
            elif cash_withdrawable == 0 and cash_balance > 1.0:
                current_step = ClosureStep.WAITING_SETTLEMENT
            elif cash_balance > 1.0:
                current_step = ClosureStep.WITHDRAWING_FUNDS
            elif cash_balance <= 1.0:
                current_step = ClosureStep.CLOSING_ACCOUNT
            else:
                current_step = ClosureStep.INITIATED
            
            return {
                "account_id": account_id,
                "current_step": current_step.value,
                "account_status": str(account.status),
                "open_orders": len(orders),
                "open_positions": len(positions),
                "cash_balance": cash_balance,
                "cash_withdrawable": cash_withdrawable,
                "ready_for_next_step": self._is_ready_for_next_step(current_step, orders, positions, cash_balance, cash_withdrawable)
            }
            
        except Exception as e:
            logger.error(f"Error getting closure status for account {account_id}: {e}")
            return {
                "account_id": account_id,
                "current_step": ClosureStep.FAILED.value,
                "error": str(e)
            }
    
    def _is_ready_for_next_step(self, current_step: ClosureStep, orders: List, positions: List, 
                               cash_balance: float, cash_withdrawable: float) -> bool:
        """Helper method to determine if ready for next step."""
        if current_step == ClosureStep.CANCELING_ORDERS:
            return len(orders) == 0
        elif current_step == ClosureStep.LIQUIDATING_POSITIONS:
            return len(positions) == 0
        elif current_step == ClosureStep.WAITING_SETTLEMENT:
            return cash_withdrawable > 0
        elif current_step == ClosureStep.WITHDRAWING_FUNDS:
            return cash_balance <= 1.0
        elif current_step == ClosureStep.CLOSING_ACCOUNT:
            return len(positions) == 0 and cash_balance <= 1.0
        return False

# Convenience functions for easier use
def check_account_closure_readiness(account_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """Check if account is ready for closure."""
    manager = AccountClosureManager(sandbox)
    return manager.check_closure_preconditions(account_id)

def initiate_account_closure(account_id: str, ach_relationship_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """
    Initiate the complete account closure process.
    
    This is a high-level function that orchestrates the entire closure workflow.
    In a production environment, this should be implemented as an async job.
    """
    manager = AccountClosureManager(sandbox)
    
    # Step 1: Check preconditions
    preconditions = manager.check_closure_preconditions(account_id)
    if not preconditions.get("ready", False):
        return {
            "success": False,
            "step": "preconditions",
            "reason": preconditions.get("reason", "Account not ready for closure")
        }
    
    # Step 2: Cancel orders
    order_result = manager.cancel_all_orders(account_id)
    if not order_result.get("success", False):
        return {
            "success": False,
            "step": "cancel_orders",
            "reason": order_result.get("error", "Failed to cancel orders")
        }
    
    # Step 3: Liquidate positions
    liquidation_result = manager.liquidate_all_positions(account_id)
    if not liquidation_result.get("success", False):
        return {
            "success": False,
            "step": "liquidate_positions",
            "reason": liquidation_result.get("error", "Failed to liquidate positions")
        }
    
    # The rest of the process (settlement, withdrawal, closure) should be handled
    # by separate API calls or background jobs due to timing requirements
    
    return {
        "success": True,
        "step": ClosureStep.WAITING_SETTLEMENT.value,
        "orders_canceled": order_result.get("orders_canceled", 0),
        "positions_liquidated": liquidation_result.get("positions_liquidated", 0),
        "message": "Account closure process initiated. Positions are being liquidated.",
        "next_steps": [
            "Wait for settlement (T+1)",
            "Withdraw funds via ACH",
            "Close account when balance is $0"
        ],
        "settlement_date": liquidation_result.get("settlement_date")
    }

def get_closure_progress(account_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """Get current progress of account closure."""
    manager = AccountClosureManager(sandbox)
    return manager.get_closure_status(account_id) 