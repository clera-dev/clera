"""
Manually trigger portfolio reconstruction with detailed logging.

This will help us see exactly where the reconstruction is failing.
"""

import os
import sys
import asyncio
# PORTABILITY FIX: Resolve backend path relative to this script's location
# This makes the script portable across different environments
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)  # Go up from scripts/ to backend/
sys.path.insert(0, BACKEND_DIR)

import logging

# Set up detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

from services.portfolio_history_reconstructor import get_portfolio_history_reconstructor
from utils.supabase.db_client import get_supabase_client

async def trigger_reconstruction(user_id: str):
    """Trigger reconstruction for a specific user."""
    print("=" * 80)
    print(f"TRIGGERING PORTFOLIO RECONSTRUCTION FOR USER: {user_id}")
    print("=" * 80)
    print()
    
    # First, check what Plaid data this user has
    supabase = get_supabase_client()
    
    print("1. Checking user's Plaid connections...")
    print("-" * 80)
    
    accounts = supabase.table('user_investment_accounts')\
        .select('*')\
        .eq('user_id', user_id)\
        .eq('provider', 'plaid')\
        .execute()
    
    if not accounts.data:
        print(f"❌ ERROR: User {user_id} has no Plaid investment accounts!")
        print("   Cannot reconstruct portfolio history without Plaid connection.")
        return
    
    print(f"✅ Found {len(accounts.data)} Plaid investment accounts")
    for acc in accounts.data:
        print(f"   • {acc.get('institution_name')} - {acc.get('account_name')} ({acc.get('account_type')})")
        print(f"     Balance: ${acc.get('current_balance', 0):,.2f}")
        print(f"     Active: {acc.get('is_active')}")
    
    print()
    
    # Check existing reconstruction status
    print("2. Checking reconstruction status...")
    print("-" * 80)
    
    status = supabase.table('user_portfolio_reconstruction_status')\
        .select('*')\
        .eq('user_id', user_id)\
        .execute()
    
    if status.data:
        s = status.data[0]
        print(f"   Status: {s.get('reconstruction_status')}")
        print(f"   Progress: {s.get('reconstruction_progress', 0):.1f}%")
        if s.get('error_message'):
            print(f"   Last Error: {s.get('error_message')}")
        print(f"   Data Points: {s.get('total_data_points', 0)}")
        print(f"   Securities: {s.get('processed_securities', 0)}/{s.get('total_securities', 0)}")
        print(f"   Transactions: {s.get('processed_transactions', 0)}/{s.get('total_transactions', 0)}")
        
        # Delete existing status to allow fresh reconstruction
        print("\n   Deleting existing status for fresh reconstruction...")
        supabase.table('user_portfolio_reconstruction_status')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
    else:
        print("   No previous reconstruction found")
    
    print()
    
    # Check existing portfolio history
    print("3. Checking existing portfolio history...")
    print("-" * 80)
    
    history = supabase.table('user_portfolio_history')\
        .select('value_date, total_value')\
        .eq('user_id', user_id)\
        .order('value_date', desc=False)\
        .limit(5)\
        .execute()
    
    if history.data:
        print(f"   Found {len(history.data)} existing history records (showing first 5)")
        for h in history.data:
            print(f"   • {h['value_date']}: ${h['total_value']:,.2f}")
        
        # Delete existing history for fresh reconstruction
        print("\n   Deleting existing history for fresh reconstruction...")
        supabase.table('user_portfolio_history')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
    else:
        print("   No existing history found")
    
    print()
    
    # Trigger reconstruction
    print("4. Starting reconstruction...")
    print("-" * 80)
    print()
    
    reconstructor = get_portfolio_history_reconstructor()
    
    try:
        result = await reconstructor.reconstruct_user_portfolio_history(user_id)
        
        print()
        print("=" * 80)
        print("RECONSTRUCTION RESULT")
        print("=" * 80)
        print(f"Success: {result.success}")
        print(f"Timeline: {len(result.timeline)} daily snapshots")
        print(f"Date Range: {result.start_date} to {result.end_date}")
        print(f"Securities: {result.securities_processed}")
        print(f"Transactions: {result.transactions_processed}")
        print(f"API Calls: {result.api_calls_made}")
        print(f"API Cost: ${result.api_cost_estimate:.2f}")
        print(f"Duration: {result.processing_duration_seconds:.1f}s")
        
        if result.error:
            print(f"\n❌ Error: {result.error}")
        
        if result.timeline:
            print("\nSample timeline points:")
            for i, snapshot in enumerate(result.timeline[:3]):
                print(f"  {snapshot.date}: ${snapshot.total_value:,.2f} (quality: {snapshot.data_quality_score:.1f}%)")
            
            if len(result.timeline) > 3:
                print(f"  ... ({len(result.timeline) - 6} more days)")
                for i, snapshot in enumerate(result.timeline[-3:]):
                    print(f"  {snapshot.date}: ${snapshot.total_value:,.2f} (quality: {snapshot.data_quality_score:.1f}%)")
        
        print()
        print("=" * 80)
        
    except Exception as e:
        print()
        print("=" * 80)
        print(f"❌ RECONSTRUCTION FAILED: {e}")
        print("=" * 80)
        import traceback
        traceback.print_exc()

async def main():
    """Main entry point."""
    # Get the user ID from the database (most recent Plaid user)
    supabase = get_supabase_client()
    
    users = supabase.table('user_investment_accounts')\
        .select('user_id')\
        .eq('provider', 'plaid')\
        .order('created_at', desc=True)\
        .limit(1)\
        .execute()
    
    if not users.data:
        print("No Plaid users found!")
        return
    
    user_id = users.data[0]['user_id']
    await trigger_reconstruction(user_id)

if __name__ == '__main__':
    asyncio.run(main())

