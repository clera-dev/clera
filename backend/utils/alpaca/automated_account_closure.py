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
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from enum import Enum

from .account_closure import AccountClosureManager, ClosureStep
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
        self.supabase = get_supabase_client() if get_supabase_client else None
        
    async def initiate_automated_closure(self, user_id: str, account_id: str, 
                                       ach_relationship_id: str) -> Dict[str, Any]:
        """
        Initiate the automated account closure process.
        
        This is called immediately when user clicks "Close Account".
        Returns immediately while background process handles everything.
        """
        detailed_logger = AccountClosureLogger(account_id)
        
        try:
            # STEP 1: Update Supabase to pending_closure immediately
            confirmation_number = f"CLA-{datetime.now().strftime('%Y%m%d%H%M%S')}-{account_id[-6:]}"
            
            if self.supabase:
                self._update_supabase_status(user_id, "pending_closure", {
                    "confirmation_number": confirmation_number,
                    "initiated_at": datetime.now().isoformat()
                })
                detailed_logger.log_step_success("SUPABASE_STATUS_UPDATE", {
                    "status": "pending_closure",
                    "confirmation_number": confirmation_number
                })
            
            # STEP 2: Start background process (non-blocking)
            asyncio.create_task(self._run_automated_closure_process(
                user_id, account_id, ach_relationship_id, confirmation_number, detailed_logger
            ))
            
            # STEP 3: Return immediate response to frontend
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
                ],
                "log_file": detailed_logger.get_log_summary()
            }
            
        except Exception as e:
            detailed_logger.log_step_failure("AUTOMATED_CLOSURE_INITIATION", str(e))
            
            # Update Supabase to failed status
            if self.supabase:
                self._update_supabase_status(user_id, "approved", {
                    "closure_failed": True,
                    "failure_reason": str(e)
                })
            
            return {
                "success": False,
                "error": str(e),
                "log_file": detailed_logger.get_log_summary()
            }
    
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
            await self._handle_liquidation_phase(account_id, detailed_logger)
            
            # PHASE 2: SETTLEMENT MONITORING (T+1 waiting)
            await self._handle_settlement_phase(account_id, detailed_logger)
            
            # PHASE 3: AUTOMATIC FUND WITHDRAWAL  
            transfer_id = await self._handle_withdrawal_phase(account_id, ach_relationship_id, detailed_logger)
            
            # PHASE 4: TRANSFER COMPLETION MONITORING
            await self._handle_transfer_completion_phase(account_id, transfer_id, detailed_logger)
            
            # PHASE 5: ACCOUNT CLOSURE
            await self._handle_account_closure_phase(account_id, user_id, confirmation_number, detailed_logger)
            
            # PHASE 6: FINAL SUPABASE UPDATE
            if self.supabase:
                self._update_supabase_status(user_id, "closed", {
                    "completed_at": datetime.now().isoformat(),
                    "confirmation_number": confirmation_number
                })
            
            detailed_logger.log_step_success("AUTOMATED_BACKGROUND_PROCESS", {
                "final_status": "completed",
                "total_duration": time.time()
            })
            
        except Exception as e:
            detailed_logger.log_step_failure("AUTOMATED_BACKGROUND_PROCESS", str(e))
            
            # Update Supabase to show failure but keep pending_closure for manual review
            if self.supabase:
                self._update_supabase_status(user_id, "pending_closure", {
                    "process_failed": True,
                    "failure_reason": str(e),
                    "requires_manual_review": True
                })
    
    async def _handle_liquidation_phase(self, account_id: str, detailed_logger: AccountClosureLogger):
        """Handle position liquidation and order cancellation."""
        detailed_logger.log_step_start("LIQUIDATION_PHASE")
        
        # Call our existing liquidation system
        liquidation_result = self.manager.liquidate_all_positions(account_id)
        
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
            settlement_status = self.manager.check_settlement_status(account_id)
            
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
    
    async def _handle_withdrawal_phase(self, account_id: str, ach_relationship_id: str, 
                                     detailed_logger: AccountClosureLogger) -> str:
        """Automatically withdraw all funds."""
        detailed_logger.log_step_start("WITHDRAWAL_PHASE")
        
        # Automatically withdraw all available funds
        withdrawal_result = self.manager.withdraw_all_funds(account_id, ach_relationship_id)
        
        if not withdrawal_result.get("success", False):
            raise Exception(f"Withdrawal failed: {withdrawal_result.get('error', 'Unknown error')}")
        
        transfer_id = withdrawal_result.get("transfer_id")
        detailed_logger.log_step_success("WITHDRAWAL_INITIATED", {
            "transfer_id": transfer_id,
            "amount": withdrawal_result.get("amount"),
            "estimated_completion": "2-3 business days"
        })
        
        return transfer_id
    
    async def _handle_transfer_completion_phase(self, account_id: str, transfer_id: str, 
                                              detailed_logger: AccountClosureLogger):
        """Monitor ACH transfer until completion."""
        detailed_logger.log_step_start("TRANSFER_MONITORING_PHASE", {"transfer_id": transfer_id})
        
        while True:
            transfer_status = self.manager.check_withdrawal_status(account_id, transfer_id)
            
            if transfer_status.get("status") == "SETTLED":
                detailed_logger.log_step_success("TRANSFER_COMPLETE", transfer_status)
                break
            elif transfer_status.get("status") == "FAILED":
                raise Exception(f"ACH transfer failed: {transfer_status.get('reason', 'Unknown error')}")
            
            # Log current status
            detailed_logger.log_step_start("TRANSFER_STATUS_CHECK", {
                "status": transfer_status.get("status"),
                "next_check_in": "2 hours"
            })
            
            # Wait 2 hours before checking again (ACH transfers take time)
            await asyncio.sleep(7200)
    
    async def _handle_account_closure_phase(self, account_id: str, user_id: str, 
                                          confirmation_number: str, detailed_logger: AccountClosureLogger):
        """Final account closure."""
        detailed_logger.log_step_start("ACCOUNT_CLOSURE_PHASE")
        
        # Final safety verification
        account_status = self.manager.get_closure_status(account_id)
        
        # Verify account is ready for closure
        if account_status.get("open_positions", 0) > 0:
            raise Exception("Cannot close account: positions still exist")
        
        if account_status.get("cash_balance", 0) > 1.0:
            raise Exception(f"Cannot close account: cash balance ${account_status.get('cash_balance'):.2f} > $1.00")
        
        # Close the account
        closure_result = self.manager.close_account(account_id)
        
        if not closure_result.get("success", False):
            raise Exception(f"Account closure failed: {closure_result.get('error', 'Unknown error')}")
        
        detailed_logger.log_step_success("ACCOUNT_CLOSURE_PHASE", closure_result)
    
    async def _wait_for_positions_cleared(self, account_id: str, detailed_logger: AccountClosureLogger):
        """Wait for all positions to be cleared after liquidation."""
        max_attempts = 30  # 15 minutes maximum
        attempt = 0
        
        while attempt < max_attempts:
            status = self.manager.get_closure_status(account_id)
            
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
    
    def _update_supabase_status(self, user_id: str, status: str, additional_data: Dict[str, Any] = None):
        """Update user status in Supabase."""
        if not self.supabase:
            return
        
        try:
            update_data = {"status": status, "updated_at": datetime.now().isoformat()}
            
            if additional_data:
                # Store closure-specific data in onboarding_data jsonb field
                result = self.supabase.table("user_onboarding").select("onboarding_data").eq("user_id", user_id).execute()
                
                if result.data:
                    existing_data = result.data[0].get("onboarding_data", {})
                    existing_data.update({"account_closure": additional_data})
                    update_data["onboarding_data"] = existing_data
                
                # Add confirmation number if provided
                if "confirmation_number" in additional_data:
                    update_data["account_closure_confirmation_number"] = additional_data["confirmation_number"]
            
            self.supabase.table("user_onboarding").update(update_data).eq("user_id", user_id).execute()
            
        except Exception as e:
            logger.error(f"Failed to update Supabase status for user {user_id}: {e}")

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