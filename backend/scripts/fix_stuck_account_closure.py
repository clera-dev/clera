#!/usr/bin/env python3
"""
Fix Stuck Account Closure Script

This script identifies and fixes accounts that are stuck in 'pending_closure'
status and resumes the automated closure process for them.

Usage:
    python scripts/fix_stuck_account_closure.py [--account-id ACCOUNT_ID] [--dry-run]
"""

import os
import sys
import argparse
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def setup_environment():
    """Setup environment variables for the script."""
    # Load environment variables from .env file if it exists
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

def find_stuck_accounts() -> List[Dict[str, Any]]:
    """Find accounts that are stuck in pending_closure status."""
    try:
        from utils.supabase.db_client import get_supabase_client
        
        supabase = get_supabase_client()
        
        # Find accounts in pending_closure for more than 24 hours
        cutoff_time = (datetime.now() - timedelta(hours=24)).isoformat()
        
        result = supabase.table("user_onboarding").select(
            "user_id, alpaca_account_id, status, account_closure_initiated_at, account_closure_confirmation_number"
        ).eq("status", "pending_closure").lt("account_closure_initiated_at", cutoff_time).execute()
        
        stuck_accounts = result.data or []
        
        print(f"Found {len(stuck_accounts)} potentially stuck accounts:")
        for account in stuck_accounts:
            initiated_at = account.get('account_closure_initiated_at', 'Unknown')
            print(f"  - Account: {account['alpaca_account_id']} (User: {account['user_id']}) - Initiated: {initiated_at}")
        
        return stuck_accounts
        
    except Exception as e:
        print(f"Error finding stuck accounts: {e}")
        return []

async def resume_account_closure(user_id: str, account_id: str, dry_run: bool = False) -> bool:
    """Resume the automated closure process for a stuck account."""
    try:
        from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
        from utils.supabase.db_client import get_supabase_client
        
        print(f"\n{'[DRY RUN] ' if dry_run else ''}Resuming closure for account {account_id}...")
        
        if dry_run:
            print(f"[DRY RUN] Would resume automated closure process")
            return True
        
        # Get ACH relationship ID
        supabase = get_supabase_client()
        
        # Find ACH relationship for this user
        result = supabase.table("user_bank_connections").select(
            "ach_relationship_id"
        ).eq("user_id", user_id).eq("status", "active").execute()
        
        if not result.data or len(result.data) == 0:
            print(f"ERROR: No active ACH relationship found for user {user_id}")
            return False
        
        ach_relationship_id = result.data[0]["ach_relationship_id"]
        print(f"Found ACH relationship: {ach_relationship_id}")
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        print(f"Using {'sandbox' if sandbox else 'production'} mode")
        
        # Resume the automated process
        processor = AutomatedAccountClosureProcessor(sandbox=sandbox)
        result = await processor.initiate_automated_closure(
            user_id=user_id,
            account_id=account_id,
            ach_relationship_id=ach_relationship_id
        )
        
        if result.get("success"):
            print(f"✅ Successfully resumed automated closure for account {account_id}")
            print(f"   Background process is now running...")
            return True
        else:
            print(f"❌ Failed to resume closure: {result.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"❌ Error resuming closure for account {account_id}: {e}")
        return False

def get_account_status(account_id: str) -> Dict[str, Any]:
    """Get current status of an account from Alpaca."""
    try:
        from utils.alpaca.account_closure import AccountClosureManager
        
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        manager = AccountClosureManager(sandbox=sandbox)
        
        status = manager.get_closure_status(account_id)
        return status
        
    except Exception as e:
        print(f"Error getting account status for {account_id}: {e}")
        return {}

async def main():
    """Main script function."""
    parser = argparse.ArgumentParser(description="Fix stuck account closure processes")
    parser.add_argument("--account-id", help="Specific account ID to fix (optional)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without actually doing it")
    
    args = parser.parse_args()
    
    print("🔧 Account Closure Fix Script")
    print("=" * 50)
    
    # Setup environment
    setup_environment()
    
    if args.account_id:
        # Fix specific account
        print(f"Fixing specific account: {args.account_id}")
        
        # Find user_id for this account
        try:
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            result = supabase.table("user_onboarding").select(
                "user_id, status, account_closure_initiated_at"
            ).eq("alpaca_account_id", args.account_id).single().execute()
            
            if not result.data:
                print(f"❌ Account {args.account_id} not found in database")
                return
            
            user_data = result.data
            user_id = user_data["user_id"]
            status = user_data["status"]
            
            if status != "pending_closure":
                print(f"❌ Account {args.account_id} is not in pending_closure status (current: {status})")
                return
            
            # Get current account status from Alpaca
            print(f"\nChecking current Alpaca status for account {args.account_id}...")
            account_status = get_account_status(args.account_id)
            if account_status:
                print(f"  Account Status: {account_status.get('account_status', 'Unknown')}")
                print(f"  Cash Balance: ${account_status.get('cash_balance', 0):,.2f}")
                print(f"  Withdrawable: ${account_status.get('cash_withdrawable', 0):,.2f}")
                print(f"  Open Positions: {account_status.get('open_positions', 0)}")
                print(f"  Open Orders: {account_status.get('open_orders', 0)}")
            
            # Resume closure
            success = await resume_account_closure(user_id, args.account_id, args.dry_run)
            
            if success:
                print(f"\n✅ {'[DRY RUN] ' if args.dry_run else ''}Account {args.account_id} closure process resumed")
            else:
                print(f"\n❌ Failed to resume closure for account {args.account_id}")
            
        except Exception as e:
            print(f"❌ Error processing account {args.account_id}: {e}")
    
    else:
        # Find and fix all stuck accounts
        print("Searching for stuck accounts...")
        
        stuck_accounts = find_stuck_accounts()
        
        if not stuck_accounts:
            print("✅ No stuck accounts found!")
            return
        
        print(f"\nFound {len(stuck_accounts)} stuck accounts. Processing...")
        
        success_count = 0
        for account_data in stuck_accounts:
            account_id = account_data["alpaca_account_id"]
            user_id = account_data["user_id"]
            
            print(f"\n--- Processing Account {account_id} ---")
            
            # Get current account status
            account_status = get_account_status(account_id)
            if account_status:
                print(f"  Cash Balance: ${account_status.get('cash_balance', 0):,.2f}")
                print(f"  Withdrawable: ${account_status.get('cash_withdrawable', 0):,.2f}")
            
            success = await resume_account_closure(user_id, account_id, args.dry_run)
            if success:
                success_count += 1
        
        print(f"\n" + "=" * 50)
        print(f"{'[DRY RUN] ' if args.dry_run else ''}Summary: {success_count}/{len(stuck_accounts)} accounts processed successfully")

if __name__ == "__main__":
    asyncio.run(main())