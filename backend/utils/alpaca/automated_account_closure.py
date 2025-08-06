"""
Automated Account Closure Background Process

This module handles the complete automated account closure process:
1. User clicks "Close Account" → immediate response
2. Background process handles everything automatically
3. No user intervention required after initial confirmation
4. Supabase status tracking throughout process
"""

import asyncio
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from enum import Enum

from .account_closure import AccountClosureManager, ClosureStep, ClosureStateManager
from .account_closure_logger import AccountClosureLogger
logger = logging.getLogger("automated-account-closure")

# Import Supabase client
try:
    from ..supabase.db_client import get_supabase_client
except ImportError:
    logger.warning("Supabase client not available")
    get_supabase_client = None


class ClosureProcessStatus(Enum):
    """Status tracking for the entire closure process."""
    INITIATED = "initiated"
    LIQUIDATING = "liquidating" 
    WAITING_SETTLEMENT = "waiting_settlement"
    WITHDRAWING_FUNDS = "withdrawing_funds"
    WAITING_TRANSFER = "waiting_transfer"
    CLOSING_ACCOUNT = "closing_account"
    COMPLETED = "completed"
    FAILED = "failed"

class AutomatedAccountClosureProcessor:
    """
    Handles the complete automated account closure process.
    
    This runs in the background and monitors the entire process
    without requiring any user intervention after initial confirmation.
    """
    
    def __init__(self, sandbox: bool = True):
        self.sandbox = sandbox
        self.manager = AccountClosureManager(sandbox)
        self.state_manager = ClosureStateManager()
        self.supabase = get_supabase_client() if get_supabase_client else None
        
        # PRODUCTION FIX: Store active background tasks to prevent garbage collection
        # and enable proper task management
        self.active_tasks = {}  # Dict[account_id, asyncio.Task]
        
    async def initiate_automated_closure(self, user_id: str, account_id: str, 
                                       ach_relationship_id: str) -> Dict[str, Any]:
        """
        Initiate the automated account closure process.
        
        This is called immediately when user clicks "Close Account".
        Returns immediately while background process handles everything.
        """
        detailed_logger = AccountClosureLogger(account_id)
        
        try:
            # STEP 0: Check preconditions before starting the process
            detailed_logger.log_step_start("PRECONDITION_CHECK", {
                "user_id": user_id,
                "account_id": account_id
            })
            
            preconditions = self.manager.check_closure_preconditions(account_id)
            
            if not preconditions.get("ready", False):
                detailed_logger.log_step_failure("PRECONDITION_CHECK", 
                    preconditions.get("reason", "Account not ready for closure"))
                return {
                    "success": False,
                    "error": preconditions.get("reason", "Account not ready for closure")
                }
            
            detailed_logger.log_step_success("PRECONDITION_CHECK", preconditions)
            
            # STEP 1: Get existing confirmation number from Supabase (don't generate new one)
            confirmation_number = None
            try:
                result = self.supabase.table("user_onboarding").select(
                    "account_closure_confirmation_number"
                ).eq("user_id", user_id).execute()
                
                if result.data and result.data[0].get("account_closure_confirmation_number"):
                    confirmation_number = result.data[0]["account_closure_confirmation_number"]
                    detailed_logger.log_step_success("CONFIRMATION_NUMBER_RETRIEVED", {
                        "confirmation_number": confirmation_number,
                        "source": "supabase"
                    })
                else:
                    # Fallback: generate new confirmation number if none exists
                    confirmation_number = f"CLA-{datetime.now().strftime('%Y%m%d%H%M%S')}-{account_id[-6:]}"
                    detailed_logger.log_step_warning("CONFIRMATION_NUMBER_GENERATED", {
                        "confirmation_number": confirmation_number,
                        "reason": "No existing confirmation number found in Supabase"
                    })
            except Exception as e:
                # Fallback: generate new confirmation number if Supabase lookup fails
                confirmation_number = f"CLA-{datetime.now().strftime('%Y%m%d%H%M%S')}-{account_id[-6:]}"
                detailed_logger.log_step_warning("CONFIRMATION_NUMBER_GENERATED", {
                    "confirmation_number": confirmation_number,
                    "reason": f"Supabase lookup failed: {str(e)}"
                })
            
            # STEP 2: Update Supabase to pending_closure immediately (if not already done)
            if self.supabase:
                await self._update_supabase_status(user_id, "pending_closure", {
                    "confirmation_number": confirmation_number,
                    "initiated_at": datetime.now().isoformat()
                })
                detailed_logger.log_step_success("SUPABASE_STATUS_UPDATE", {
                    "status": "pending_closure",
                    "confirmation_number": confirmation_number
                })
            
            # STEP 3: Store initial state in Redis for persistence
            self.state_manager.set_closure_state(account_id, {
                "user_id": user_id,
                "account_id": account_id,
                "ach_relationship_id": ach_relationship_id,
                "confirmation_number": confirmation_number,
                "phase": "starting",
                "initiated_at": datetime.now().isoformat()
            })
            
            # STEP 4: Start background process with proper task management
            # PRODUCTION FIX: Store task reference to prevent garbage collection and enable monitoring
            task = asyncio.create_task(self._run_automated_closure_process(
                user_id, account_id, ach_relationship_id, confirmation_number, detailed_logger
            ))
            
            # Store task reference for proper management
            self.active_tasks[account_id] = task
            
            # Add task completion callback for cleanup and error handling
            task.add_done_callback(lambda t: self._handle_task_completion(account_id, t))
            
            detailed_logger.log_step_success("BACKGROUND_PROCESS_STARTED", {
                "method": "asyncio.create_task_with_reference",
                "task": "automated_account_closure",
                "task_id": id(task)
            })
            
            # STEP 5: Return immediate response to frontend
            return {
                "success": True,
                "message": "Account closure process initiated successfully",
                "confirmation_number": confirmation_number,
                "status": "pending_closure",
                "estimated_completion": "3-5 business days",
                "next_steps": [
                    "Positions are being liquidated",
                    "Funds will be transferred to your bank account ending in " + ach_relationship_id[-4:],
                    "You will receive email confirmations throughout the process"
                ]
                # log_file removed for security
            }
            
        except Exception as e:
            detailed_logger.log_step_failure("AUTOMATED_CLOSURE_INITIATION", str(e))
            
            # Update Supabase to failed status
            if self.supabase:
                await self._update_supabase_status(user_id, "approved", {
                    "closure_failed": True,
                    "failure_reason": str(e)
                })
            
            return {
                "success": False,
                "error": "Account closure process failed. Please contact support if the issue persists."
                # "log_file": detailed_logger.get_log_summary()  # Removed for security
            }
    
    def _handle_task_completion(self, account_id: str, task: asyncio.Task):
        """
        Handle completion of background closure task.
        
        PRODUCTION FIX: This callback ensures proper cleanup and error handling
        when background tasks complete, fail, or are cancelled.
        """
        try:
            # Remove task from active tasks
            self.active_tasks.pop(account_id, None)
            
            if task.cancelled():
                logger.warning(f"Account closure task for {account_id} was cancelled")
                return
            
            # Check if task failed with exception
            exception = task.exception()
            if exception:
                logger.error(f"Account closure task for {account_id} failed with exception: {exception}")
                
                # Update Redis state to indicate task failure
                self.state_manager.update_closure_state(account_id, {
                    "phase": "background_task_failed",
                    "task_failure_reason": str(exception),
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                    "requires_manual_intervention": True
                })
                
                # Could trigger alerting/monitoring here
                return
            
            # Task completed successfully
            logger.info(f"Account closure task for {account_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Error in task completion handler for {account_id}: {e}")
    
    def get_active_task_status(self, account_id: str) -> Dict[str, Any]:
        """
        Get status of active background task for an account.
        
        PRODUCTION IMPROVEMENT: Enables monitoring of active closure processes.
        """
        task = self.active_tasks.get(account_id)
        if not task:
            return {"active": False, "status": "no_active_task"}
        
        return {
            "active": True,
            "done": task.done(),
            "cancelled": task.cancelled(),
            "exception": str(task.exception()) if task.done() and task.exception() else None,
            "task_id": id(task)
        }
    
    def cancel_active_task(self, account_id: str) -> bool:
        """
        Cancel active background task for an account.
        
        PRODUCTION IMPROVEMENT: Enables stopping runaway processes.
        """
        task = self.active_tasks.get(account_id)
        if task and not task.done():
            task.cancel()
            logger.info(f"Cancelled active closure task for account {account_id}")
            return True
        return False
    
    async def _run_automated_closure_process(self, user_id: str, account_id: str, 
                                           ach_relationship_id: str, confirmation_number: str,
                                           detailed_logger: AccountClosureLogger):
        """
        Background process that handles the complete closure automatically.
        
        This runs completely independently and handles everything:
        - Liquidation monitoring
        - Settlement waiting  
        - Automatic fund withdrawal
        - Account closure
        - Status updates
        """
        try:
            detailed_logger.log_step_start("AUTOMATED_BACKGROUND_PROCESS", {
                "user_id": user_id,
                "account_id": account_id,
                "confirmation_number": confirmation_number
            })
            
            # PHASE 1: LIQUIDATION (immediate)
            self.state_manager.update_closure_state(account_id, {"phase": "liquidation"})
            await self._handle_liquidation_phase(account_id, detailed_logger)
            
            # PHASE 2: SETTLEMENT MONITORING (T+1 waiting)
            self.state_manager.update_closure_state(account_id, {"phase": "settlement"})
            await self._handle_settlement_phase(account_id, detailed_logger)
            
            # PHASE 3: AUTOMATIC FUND WITHDRAWAL (with built-in multi-day handling)
            self.state_manager.update_closure_state(account_id, {"phase": "withdrawal"})
            transfer_id = await self._handle_complete_withdrawal_process(account_id, ach_relationship_id, detailed_logger)
            
            # PRODUCTION FIX: Check if process needs to exit for external scheduler resumption
            if transfer_id == "scheduled_for_resume":
                detailed_logger.log_step_success("PROCESS_SCHEDULED_FOR_RESUME", {
                    "reason": "Multi-day withdrawal requires external scheduler",
                    "next_phase": "withdrawal_24hr_wait",
                    "resume_method": "account_closure_scheduler.py"
                })
                return transfer_id  # Exit process, external scheduler will resume
            
            # PHASE 4: TRANSFER COMPLETION MONITORING (only if not scheduled for resume)
            self.state_manager.update_closure_state(account_id, {"phase": "transfer_completion"})
            await self._handle_transfer_completion_phase(account_id, transfer_id, detailed_logger)
            
            # PHASE 5: ACCOUNT CLOSURE
            self.state_manager.update_closure_state(account_id, {"phase": "final_closure"})
            await self._handle_account_closure_phase(account_id, user_id, confirmation_number, detailed_logger)
            
            # PHASE 6: SEND COMPLETION EMAIL
            self.state_manager.update_closure_state(account_id, {"phase": "sending_completion_email"})
            await self._send_completion_email(account_id, user_id, confirmation_number, detailed_logger)
            
            # PHASE 7: FINAL SUPABASE UPDATE
            self.state_manager.update_closure_state(account_id, {"phase": "updating_final_status"})
            if self.supabase:
                # PRODUCTION FIX: Ensure proper status update to 'closed' with completion timestamp
                await self._update_supabase_status(user_id, "closed", {
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "confirmation_number": confirmation_number,
                    "account_closure_completed": True
                })
            
            # PHASE 8: CLEANUP REDIS STATE (process completed)
            self.state_manager.update_closure_state(account_id, {
                "phase": "completed",
                "completed_at": datetime.now().isoformat()
            })
            
            detailed_logger.log_step_success("AUTOMATED_BACKGROUND_PROCESS", {
                "final_status": "completed",
                "total_duration": time.time()
            })
            
        except Exception as e:
            detailed_logger.log_step_failure("AUTOMATED_BACKGROUND_PROCESS", str(e))
            
            # PRODUCTION IMPROVEMENT: Enhanced error handling with better state tracking
            error_info = {
                "process_failed": True,
                "failure_reason": str(e),
                "failure_type": type(e).__name__,
                "requires_manual_review": True,
                "failed_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Update Redis state with detailed error information
            self.state_manager.update_closure_state(account_id, {
                "phase": "background_process_failed",
                **error_info
            })
            
            # Update Supabase to show failure but keep pending_closure for manual review
            if self.supabase:
                await self._update_supabase_status(user_id, "pending_closure", error_info)
            
            # Log critical error for monitoring/alerting
            logger.critical(f"Account closure background process failed for {account_id}: {e}")
            
            # Re-raise exception so task completion callback can handle it
            raise
    
    async def _handle_liquidation_phase(self, account_id: str, detailed_logger: AccountClosureLogger):
        """Handle position liquidation and order cancellation."""
        detailed_logger.log_step_start("LIQUIDATION_PHASE")
        
        # Call our existing liquidation system (run in thread pool to avoid blocking)
        liquidation_result = await asyncio.to_thread(
            self.manager.liquidate_all_positions, account_id
        )
        
        if not liquidation_result.get("success", False):
            raise Exception(f"Liquidation failed: {liquidation_result.get('error', 'Unknown error')}")
        
        # Verify liquidation completed
        await self._wait_for_positions_cleared(account_id, detailed_logger)
        
        detailed_logger.log_step_success("LIQUIDATION_PHASE", liquidation_result)
    
    async def _handle_settlement_phase(self, account_id: str, detailed_logger: AccountClosureLogger):
        """Wait for T+1 settlement to complete."""
        detailed_logger.log_step_start("SETTLEMENT_PHASE")
        
        # Calculate settlement date (T+1 business days)
        settlement_date = datetime.now() + timedelta(days=1)
        while settlement_date.weekday() >= 5:  # Skip weekends
            settlement_date += timedelta(days=1)
        
        detailed_logger.log_step_start("SETTLEMENT_MONITORING", {
            "settlement_date": settlement_date.strftime("%Y-%m-%d"),
            "business_rule": "T+1 settlement required by SEC"
        })
        
        # Monitor settlement status
        while True:
            settlement_status = await asyncio.to_thread(
                self.manager.check_settlement_status, account_id
            )
            
            if settlement_status.get("settled", False):
                detailed_logger.log_step_success("SETTLEMENT_COMPLETE", settlement_status)
                break
            
            # Log current status
            detailed_logger.log_step_start("SETTLEMENT_CHECK", {
                "cash_withdrawable": settlement_status.get("withdrawable_amount", 0),
                "next_check_in": "1 hour"
            })
            
            # Wait 1 hour before checking again
            await asyncio.sleep(3600)
        
        detailed_logger.log_step_success("SETTLEMENT_PHASE")
    

    async def _handle_complete_withdrawal_process(self, account_id: str, ach_relationship_id: str, 
                                                detailed_logger: AccountClosureLogger) -> str:
        """
        Handle the complete multi-day withdrawal process without exiting early.
        
        This method manages the entire withdrawal flow including 24-hour waits,
        keeping the main process alive and continuing naturally when complete.
        
        ARCHITECTURE IMPROVEMENT: Instead of killing the background process when 
        hitting daily limits, this method pauses and resumes within the same process,
        maintaining the natural flow while handling multi-day transfers.
        """
        detailed_logger.log_step_start("COMPLETE_WITHDRAWAL_PROCESS_START")
        
        DAILY_LIMIT = 50000.0
        last_transfer_id = None
        
        # Get existing withdrawal state or create new one (CRITICAL: preserve existing transfers)
        existing_state = self.state_manager.get_withdrawal_state(account_id) or {}
        transfers_completed = existing_state.get("transfers_completed", [])
        
        # Update withdrawal state while preserving completed transfers
        self.state_manager.set_withdrawal_state(account_id, {
            "phase": "multi_day_withdrawal",
            "ach_relationship_id": ach_relationship_id,
            "daily_limit": DAILY_LIMIT,
            "started_at": existing_state.get("started_at", datetime.now().isoformat()),
            "transfers_completed": transfers_completed,  # CRITICAL: Preserve existing transfers
            "resumed_at": datetime.now().isoformat() if transfers_completed else None
        })
        
        while True:
            # Check current withdrawable balance
            account_status = await asyncio.to_thread(
                self.manager.get_closure_status, account_id
            )
            
            withdrawable_amount = account_status.get("cash_withdrawable", 0)
            
            detailed_logger.log_step_start("WITHDRAWAL_CHECK", {
                "withdrawable_amount": withdrawable_amount,
                "daily_limit": DAILY_LIMIT
            })
            
            # If balance is $1 or less, we're completely done
            if withdrawable_amount <= 1.0:
                detailed_logger.log_step_success("ALL_WITHDRAWALS_COMPLETE", {
                    "final_balance": withdrawable_amount,
                    "total_transfers": len(self.state_manager.get_withdrawal_state(account_id).get("transfers_completed", []))
                })
                break
            
            # Determine withdrawal amount for this iteration
            withdrawal_amount = min(withdrawable_amount, DAILY_LIMIT)
            is_final_withdrawal = withdrawable_amount <= DAILY_LIMIT
            
            # Execute withdrawal
            detailed_logger.log_step_start("INITIATING_WITHDRAWAL", {
                "amount": withdrawal_amount,
                "is_final": is_final_withdrawal,
                "remaining_after": withdrawable_amount - withdrawal_amount
            })
            
            withdrawal_result = await asyncio.to_thread(
                self.manager.withdraw_funds, account_id, ach_relationship_id, withdrawal_amount
            )
            
            if not withdrawal_result.get("success", False):
                raise Exception(f"Withdrawal failed: {withdrawal_result.get('error', 'Unknown error')}")
            
            transfer_id = withdrawal_result.get("transfer_id")
            last_transfer_id = transfer_id
            
            # Update withdrawal state with transfer info
            current_state = self.state_manager.get_withdrawal_state(account_id) or {}
            current_state["transfers_completed"] = current_state.get("transfers_completed", [])
            current_state["transfers_completed"].append({
                "transfer_id": transfer_id,
                "amount": withdrawal_amount,
                "initiated_at": datetime.now().isoformat(),
                "is_final": is_final_withdrawal
            })
            current_state["last_transfer_id"] = transfer_id
            self.state_manager.set_withdrawal_state(account_id, current_state)
            
            detailed_logger.log_step_success("WITHDRAWAL_INITIATED", {
                "transfer_id": transfer_id,
                "amount_withdrawn": withdrawal_amount,
                "remaining_balance": withdrawable_amount - withdrawal_amount,
                "is_final_withdrawal": is_final_withdrawal
            })
            
            # Wait for this transfer to complete
            detailed_logger.log_step_start("WAITING_TRANSFER_COMPLETION", {
                "transfer_id": transfer_id,
                "wait_reason": "Transfer must settle before continuing"
            })
            
            await self._wait_for_transfer_completion(account_id, transfer_id, detailed_logger)
            
            # If this was the final withdrawal, we're done
            if is_final_withdrawal:
                detailed_logger.log_step_success("FINAL_WITHDRAWAL_COMPLETE", {
                    "transfer_id": transfer_id,
                    "total_amount": withdrawal_amount
                })
                break
            
            # Multiple withdrawals needed - schedule next withdrawal for 24 hours later
            next_withdrawal_time = datetime.now(timezone.utc) + timedelta(hours=24)
            detailed_logger.log_step_start("SCHEDULING_NEXT_WITHDRAWAL", {
                "reason": "Alpaca daily withdrawal limit reached ($50,000/day)",
                "next_withdrawal_time": next_withdrawal_time.isoformat(),
                "process_status": "Exiting process - external scheduler will resume"
            })
            
            # PRODUCTION FIX: Use external scheduler instead of in-process 24-hour sleep
            # This prevents resource waste and makes the system resilient to deployments
            self.state_manager.update_closure_state(account_id, {
                "phase": "withdrawal_24hr_wait",
                "next_action_time": next_withdrawal_time.isoformat(),
                "waiting_reason": "24_hour_alpaca_withdrawal_cooldown",
                "process_status": "scheduled_for_resume",
                "scheduled_at": datetime.now(timezone.utc).isoformat(),
                "continuation_method": "external_scheduler"
            })
            
            detailed_logger.log_step_success("WITHDRAWAL_SCHEDULED_FOR_RESUME", {
                "next_action_time": next_withdrawal_time.isoformat(),
                "scheduler_script": "account_closure_scheduler.py",
                "current_phase": "withdrawal_24hr_wait"
            })
            
            # Exit the process - external scheduler will resume when ready
            # The process will be restarted by account_closure_scheduler.py
            return "scheduled_for_resume"
        
        # Clean up withdrawal state
        self.state_manager.update_closure_state(account_id, {
            "phase": "withdrawal_complete",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "final_transfer_id": last_transfer_id
        })
        
        detailed_logger.log_step_success("COMPLETE_WITHDRAWAL_PROCESS_FINISHED", {
            "final_transfer_id": last_transfer_id,
            "total_transfers": len(self.state_manager.get_withdrawal_state(account_id).get("transfers_completed", []))
        })
        
        return last_transfer_id or "completed"
    
    async def _wait_for_transfer_completion(self, account_id: str, transfer_id: str, 
                                          detailed_logger: AccountClosureLogger):
        """Wait for a specific transfer to complete (used within multi-day withdrawal)."""
        detailed_logger.log_step_start("SINGLE_TRANSFER_MONITORING", {"transfer_id": transfer_id})
        
        while True:
            transfer_status = await asyncio.to_thread(
                self.manager.check_withdrawal_status, account_id, transfer_id
            )
            
            if transfer_status.get("status") == "SETTLED":
                detailed_logger.log_step_success("SINGLE_TRANSFER_COMPLETE", transfer_status)
                break
            elif transfer_status.get("status") == "FAILED":
                raise Exception(f"ACH transfer failed: {transfer_status.get('reason', 'Unknown error')}")
            
            # Log current status
            detailed_logger.log_step_start("SINGLE_TRANSFER_STATUS_CHECK", {
                "status": transfer_status.get("status"),
                "next_check_in": "2 hours"
            })
            
            # Wait 2 hours before checking again
            await asyncio.sleep(7200)
    
    async def _handle_transfer_completion_phase(self, account_id: str, transfer_id: str, 
                                              detailed_logger: AccountClosureLogger):
        """Monitor final ACH transfer until completion (legacy - now handled in withdrawal phase)."""
        # This method is now mostly redundant since we handle transfer completion
        # within the withdrawal phase, but keeping for backward compatibility
        if transfer_id and transfer_id != "completed":
            await self._wait_for_transfer_completion(account_id, transfer_id, detailed_logger)
    
    async def _handle_account_closure_phase(self, account_id: str, user_id: str, 
                                          confirmation_number: str, detailed_logger: AccountClosureLogger):
        """Final account closure."""
        detailed_logger.log_step_start("ACCOUNT_CLOSURE_PHASE")
        
        # Final safety verification (run in thread pool to avoid blocking)
        account_status = await asyncio.to_thread(
            self.manager.get_closure_status, account_id
        )
        
        # Verify account is ready for closure
        if account_status.get("open_positions", 0) > 0:
            raise Exception("Cannot close account: positions still exist")
        
        if account_status.get("cash_balance", 0) > 1.0:
            raise Exception(f"Cannot close account: cash balance ${account_status.get('cash_balance'):.2f} > $1.00")
        
        # Close the account (run in thread pool to avoid blocking)
        closure_result = await asyncio.to_thread(
            self.manager.close_account, account_id
        )
        
        if not closure_result.get("success", False):
            raise Exception(f"Account closure failed: {closure_result.get('error', 'Unknown error')}")
        
        detailed_logger.log_step_success("ACCOUNT_CLOSURE_PHASE", closure_result)
    
    async def _send_completion_email(self, account_id: str, user_id: str, confirmation_number: str, 
                                   detailed_logger: AccountClosureLogger):
        """Send completion email notification."""
        detailed_logger.log_step_start("COMPLETION_EMAIL")
        
        try:
            # Import email service
            from ..email.email_service import EmailService
            
            # Get account details for email
            account = await asyncio.to_thread(
                self.manager.broker_client.get_account_by_id, account_id
            )
            
            user_name = "Valued Customer"  # Default fallback
            user_email = None
            
            if hasattr(account, 'contact') and account.contact:
                if hasattr(account.contact, 'email_address'):
                    user_email = account.contact.email_address
                
                # Try to get name from contact info
                if hasattr(account.contact, 'given_name') and hasattr(account.contact, 'family_name'):
                    user_name = f"{account.contact.given_name} {account.contact.family_name}"
            
            if user_email:
                # ARCHITECTURE FIX: Offload EmailService to thread to prevent blocking event loop
                email_service = EmailService()
                email_sent = await asyncio.to_thread(
                    email_service.send_account_closure_complete_notification,
                    user_email=user_email,
                    user_name=user_name,
                    account_id=account_id,
                    confirmation_number=confirmation_number,
                    final_transfer_amount=0.0  # We could track this but it's not critical
                )
                
                detailed_logger.log_step_success("COMPLETION_EMAIL", {
                    "email_sent": email_sent,
                    "user_email": "(redacted)"
                })
                
                if email_sent:
                    logger.info(f"Account closure completion email sent successfully for account {account_id}")
                else:
                    logger.warning(f"Failed to send completion email for account {account_id}")
            else:
                detailed_logger.log_step_warning("COMPLETION_EMAIL", "No email address found")
                logger.warning(f"No email address found for account {account_id} - completion email not sent")
                
        except Exception as e:
            detailed_logger.log_step_failure("COMPLETION_EMAIL", str(e))
            logger.error(f"Error sending completion email for account {account_id}: {e}")
            # Don't fail the entire process if email fails
    
    async def _wait_for_positions_cleared(self, account_id: str, detailed_logger: AccountClosureLogger):
        """Wait for all positions to be cleared after liquidation."""
        max_attempts = 30  # 15 minutes maximum
        attempt = 0
        
        while attempt < max_attempts:
            status = await asyncio.to_thread(
                self.manager.get_closure_status, account_id
            )
            
            if status.get("open_positions", 0) == 0:
                detailed_logger.log_step_success("POSITIONS_CLEARED", status)
                return
            
            detailed_logger.log_step_start("POSITION_CLEARING_CHECK", {
                "attempt": attempt + 1,
                "remaining_positions": status.get("open_positions", 0),
                "next_check_in": "30 seconds"
            })
            
            await asyncio.sleep(30)
            attempt += 1
        
        raise Exception("Positions failed to clear within 15 minutes")
    
    async def _update_supabase_status(self, user_id: str, status: str, additional_data: Dict[str, Any] = None):
        """Update user status in Supabase."""
        if not self.supabase:
            return
        
        try:
            update_data = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
            
            # PRODUCTION FIX: Set completion timestamp when account is closed
            if status == "closed":
                update_data["account_closure_completed_at"] = datetime.now(timezone.utc).isoformat()
            
            if additional_data:
                # Store closure-specific data in onboarding_data jsonb field
                # Use asyncio.to_thread to run blocking I/O in thread pool
                result = await asyncio.to_thread(
                    lambda: self.supabase.table("user_onboarding").select("onboarding_data").eq("user_id", user_id).execute()
                )
                
                if result.data:
                    existing_data = result.data[0].get("onboarding_data", {})
                    existing_data.update({"account_closure": additional_data})
                    update_data["onboarding_data"] = existing_data
                
                # Add confirmation number if provided
                if "confirmation_number" in additional_data:
                    update_data["account_closure_confirmation_number"] = additional_data["confirmation_number"]
            
            # Use asyncio.to_thread to run blocking I/O in thread pool
            await asyncio.to_thread(
                lambda: self.supabase.table("user_onboarding").update(update_data).eq("user_id", user_id).execute()
            )
            
            logger.info(f"Successfully updated user {user_id} status to {status}")
            
        except Exception as e:
            logger.error(f"Failed to update Supabase status for user {user_id}: {e}")

    async def resume_waiting_closure(self, account_id: str) -> Dict[str, Any]:
        """
        Resume a closure process that is waiting for scheduled continuation.
        
        This is called by external scheduler when it's time to continue a waiting process.
        """
        detailed_logger = AccountClosureLogger(account_id)
        
        try:
            # Get current closure state
            closure_state = self.state_manager.get_closure_state(account_id)
            if not closure_state:
                return {"success": False, "error": "No closure state found"}
            
            current_phase = closure_state.get("phase")
            next_action_time_str = closure_state.get("next_action_time")
            
            # Check if it's time to resume
            if next_action_time_str:
                # PRODUCTION FIX: Handle timezone-aware datetime comparison safely
                try:
                    next_action_time = datetime.fromisoformat(next_action_time_str)
                    current_time = datetime.now(timezone.utc)
                    
                    # Ensure consistent timezone for comparison
                    if next_action_time.tzinfo is None:
                        next_action_time = next_action_time.replace(tzinfo=timezone.utc)
                    elif next_action_time.tzinfo != timezone.utc:
                        next_action_time = next_action_time.astimezone(timezone.utc)
                        
                except (ValueError, TypeError) as e:
                    return {"success": False, "error": f"Invalid datetime format: {next_action_time_str} - {e}"}
                
                if current_time < next_action_time:
                    return {
                        "success": False, 
                        "error": f"Not yet time to resume. Next action at: {next_action_time_str}"
                    }
            
            detailed_logger.log_step_start("RESUMING_CLOSURE_PROCESS", {
                "account_id": account_id,
                "current_phase": current_phase,
                "scheduled_time": next_action_time_str
            })
            
            # Resume from the appropriate phase  
            if current_phase == "withdrawal_waiting" or current_phase == "withdrawal_24hr_wait":
                # Continue with withdrawal phase
                user_id = closure_state.get("user_id")
                ach_relationship_id = closure_state.get("ach_relationship_id")
                
                # Mark as resuming withdrawal
                self.state_manager.update_closure_state(account_id, {
                    "phase": "withdrawal_resuming",
                    "resumed_at": datetime.now(timezone.utc).isoformat()
                })
                
                # PRODUCTION FIX: Continue with complete withdrawal process instead of old phase-based method
                # This handles the resumption of multi-day withdrawals properly
                transfer_id = await self._handle_complete_withdrawal_process(account_id, ach_relationship_id, detailed_logger)
                
                # Check if process needs to exit again for another 24-hour wait
                if transfer_id == "scheduled_for_resume":
                    detailed_logger.log_step_success("RESUMED_PROCESS_RESCHEDULED", {
                        "reason": "Additional withdrawals needed, rescheduled for next day",
                        "next_phase": "withdrawal_24hr_wait"
                    })
                    return {"success": True, "status": "rescheduled", "phase": "withdrawal_24hr_wait"}
                
                # If withdrawal phase completed, continue to next phases
                if transfer_id and transfer_id not in ["scheduled", None, "scheduled_for_resume"]:
                    # PHASE 4: TRANSFER COMPLETION MONITORING
                    self.state_manager.update_closure_state(account_id, {"phase": "transfer_completion"})
                    await self._handle_transfer_completion_phase(account_id, transfer_id, detailed_logger)
                    
                    # PHASE 5: ACCOUNT CLOSURE
                    self.state_manager.update_closure_state(account_id, {"phase": "final_closure"})
                    await self._handle_account_closure_phase(account_id, user_id, closure_state.get("confirmation_number"), detailed_logger)
                    
                    # PHASE 6: COMPLETION
                    self.state_manager.update_closure_state(account_id, {"phase": "completed"})
                    
                    return {"success": True, "phase": "completed", "message": "Account closure completed"}
                else:
                    return {"success": True, "phase": "scheduled", "message": "Next withdrawal scheduled"}
            
            else:
                return {"success": False, "error": f"Unknown phase for resumption: {current_phase}"}
                
        except Exception as e:
            logger.error(f"Failed to resume closure for {account_id}: {str(e)}")
            detailed_logger.log_step_failure("RESUME_CLOSURE_PROCESS", {
                "error": str(e)
            })
            return {"success": False, "error": str(e)}


# Convenience function for API endpoints
async def initiate_automated_account_closure(user_id: str, account_id: str, 
                                           ach_relationship_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """
    Main function to initiate automated account closure.
    
    This is called from your API endpoint when user confirms account closure.
    Returns immediately while background process handles everything.
    """
    processor = AutomatedAccountClosureProcessor(sandbox)
    return await processor.initiate_automated_closure(user_id, account_id, ach_relationship_id)


# Convenience function for scheduler
async def resume_scheduled_closure(account_id: str, sandbox: bool = True) -> Dict[str, Any]:
    """
    Resume a scheduled account closure process.
    
    This is called by external scheduler (cron job) to resume waiting processes.
    """
    processor = AutomatedAccountClosureProcessor(sandbox)
    return await processor.resume_waiting_closure(account_id) 