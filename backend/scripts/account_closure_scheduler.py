#!/usr/bin/env python3
"""
Account Closure Scheduler

External scheduler for resuming account closure processes that are waiting for timed actions.
This script is designed to be run by cron or another external scheduler.

Usage:
    # Check and resume all ready processes
    python scripts/account_closure_scheduler.py
    
    # Check specific account
    python scripts/account_closure_scheduler.py --account-id <account_id>
    
    # Dry run (check only, don't resume)
    python scripts/account_closure_scheduler.py --dry-run

Recommended cron schedule:
    # Run every hour to check for ready processes
    0 * * * * /path/to/venv/bin/python /path/to/backend/scripts/account_closure_scheduler.py
"""

import os
import sys
import asyncio
import argparse
from datetime import datetime, timezone
from typing import List, Dict, Any

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from utils.alpaca.account_closure import ClosureStateManager
from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor

load_dotenv()

class AccountClosureScheduler:
    """External scheduler for account closure processes."""
    
    def __init__(self, sandbox: bool = True):
        self.sandbox = sandbox
        self.state_manager = ClosureStateManager()
        self.processor = AutomatedAccountClosureProcessor(sandbox)
    
    def find_accounts_ready_for_resumption(self) -> List[Dict[str, Any]]:
        """Find all accounts that are ready to resume their closure process."""
        if not self.state_manager.redis_client:
            print("ERROR: Redis connection not available")
            return []
        
        ready_accounts = []
        current_time = datetime.now(timezone.utc)
        
        try:
            # Find all closure state keys using SCAN (non-blocking)
            closure_keys = []
            for key in self.state_manager.redis_client.scan_iter(match="closure_state:*"):
                closure_keys.append(key)
            
            for key in closure_keys:
                account_id = None
                try:
                    # Handle both string and bytes keys from Redis
                    key_str = key.decode() if isinstance(key, bytes) else key
                    account_id = key_str.split(":")[-1]
                    closure_state = self.state_manager.get_closure_state(account_id)
                    
                    if not closure_state:
                        continue
                    
                    phase = closure_state.get("phase")
                    next_action_time_str = closure_state.get("next_action_time")
                    
                    # Check if this account is waiting and ready to resume
                    if phase in ["withdrawal_waiting", "withdrawal_24hr_wait"] and next_action_time_str:
                        next_action_time = datetime.fromisoformat(next_action_time_str)
                        
                        # Ensure timezone awareness for comparison
                        if next_action_time.tzinfo is None:
                            # If naive, assume UTC (since that's what we store)
                            next_action_time = next_action_time.replace(tzinfo=timezone.utc)
                        
                        if current_time >= next_action_time:
                            ready_accounts.append({
                                "account_id": account_id,
                                "phase": phase,
                                "scheduled_time": next_action_time_str,
                                "user_id": closure_state.get("user_id"),
                                "confirmation_number": closure_state.get("confirmation_number")
                            })
                        else:
                            # Not yet ready, but show when it will be
                            time_until_ready = next_action_time - current_time
                            print(f"Account {account_id}: Ready in {time_until_ready} (at {next_action_time_str})")
                    
                except Exception as e:
                    account_info = f"account {account_id}" if account_id else "unknown account"
                    print(f"Error processing {account_info}: {e}")
                    continue
            
            return ready_accounts
            
        except Exception as e:
            print(f"Error finding ready accounts: {e}")
            return []
    
    async def resume_account_closure(self, account_id: str, dry_run: bool = False) -> Dict[str, Any]:
        """Resume a specific account closure process."""
        print(f"\n--- Processing Account {account_id} ---")
        
        try:
            if dry_run:
                closure_state = self.state_manager.get_closure_state(account_id)
                if not closure_state:
                    return {"success": False, "error": "No closure state found"}
                
                phase = closure_state.get("phase")
                next_action_time_str = closure_state.get("next_action_time")
                
                print(f"[DRY RUN] Would resume closure for account {account_id}")
                print(f"  Current phase: {phase}")
                print(f"  Scheduled time: {next_action_time_str}")
                print(f"  User ID: {closure_state.get('user_id')}")
                
                return {"success": True, "action": "dry_run", "phase": phase}
            
            else:
                print(f"Resuming closure process for account {account_id}...")
                result = await self.processor.resume_waiting_closure(account_id)
                
                if result.get("success"):
                    print(f"✅ Successfully resumed: {result.get('message', 'Process resumed')}")
                    print(f"   Phase: {result.get('phase', 'unknown')}")
                else:
                    print(f"❌ Failed to resume: {result.get('error', 'Unknown error')}")
                
                return result
                
        except Exception as e:
            print(f"❌ Error resuming closure for account {account_id}: {e}")
            return {"success": False, "error": str(e)}
    
    async def run_scheduler(self, specific_account_id: str = None, dry_run: bool = False):
        """Main scheduler logic."""
        print("🕐 Account Closure Scheduler")
        print("=" * 50)
        print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
        print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
        print(f"Sandbox: {self.sandbox}")
        print()
        
        if specific_account_id:
            # Process specific account
            print(f"Processing specific account: {specific_account_id}")
            result = await self.resume_account_closure(specific_account_id, dry_run)
            
            if result.get("success"):
                print(f"\n✅ Account {specific_account_id} processed successfully")
            else:
                print(f"\n❌ Failed to process account {specific_account_id}")
                
        else:
            # Find and process all ready accounts
            print("Searching for accounts ready for resumption...")
            ready_accounts = self.find_accounts_ready_for_resumption()
            
            if not ready_accounts:
                print("No accounts ready for resumption at this time.")
                return
            
            print(f"Found {len(ready_accounts)} accounts ready for processing:")
            for account in ready_accounts:
                print(f"  - Account: {account['account_id']} (User: {account['user_id']}) - Scheduled: {account['scheduled_time']}")
            
            print(f"\nProcessing {len(ready_accounts)} accounts...")
            
            successful = 0
            failed = 0
            
            for account in ready_accounts:
                result = await self.resume_account_closure(account["account_id"], dry_run)
                
                if result.get("success"):
                    successful += 1
                else:
                    failed += 1
            
            print(f"\n" + "=" * 50)
            print(f"Summary: {successful} successful, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description="Account Closure Scheduler")
    parser.add_argument("--account-id", help="Process specific account ID")
    parser.add_argument("--dry-run", action="store_true", help="Dry run - check only, don't resume")
    parser.add_argument("--production", action="store_true", help="Use production mode (default: sandbox)")
    
    args = parser.parse_args()
    
    # Determine sandbox mode
    sandbox = not args.production
    if os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "production":
        sandbox = False
    
    scheduler = AccountClosureScheduler(sandbox=sandbox)
    
    # Run the scheduler
    asyncio.run(scheduler.run_scheduler(
        specific_account_id=args.account_id,
        dry_run=args.dry_run
    ))


if __name__ == "__main__":
    main()