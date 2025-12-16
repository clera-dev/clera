"""
Debug script to investigate portfolio reconstruction issues.

This script will:
1. Check what tables exist in Supabase
2. Check what data is in each table
3. Identify why portfolio history shows $0 to $23k jump
4. Verify Plaid transaction data is available
"""

import os
import sys
sys.path.insert(0, '/Users/cristian_mendoza/Desktop/clera/backend')

from utils.supabase.db_client import get_supabase_client
from datetime import datetime, timedelta
import json

def debug_portfolio_reconstruction():
    """Main debug function."""
    print("=" * 80)
    print("PORTFOLIO RECONSTRUCTION DEBUG")
    print("=" * 80)
    print()
    
    supabase = get_supabase_client()
    
    # Step 1: Check if reconstruction tables exist and have data
    print("1. Checking reconstruction tables...")
    print("-" * 80)
    
    tables_to_check = [
        'user_portfolio_history',
        'user_portfolio_snapshots',
        'user_portfolio_reconstruction_status',
        'global_security_symbol_mappings',
        'global_historical_prices',
        'plaid_items',
        'plaid_accounts'
    ]
    
    for table in tables_to_check:
        try:
            result = supabase.table(table).select('*', count='exact').limit(1).execute()
            count = result.count if hasattr(result, 'count') else len(result.data)
            print(f"✅ {table}: {count if count else 0} rows")
            
            if result.data:
                print(f"   Sample columns: {list(result.data[0].keys())}")
        except Exception as e:
            print(f"❌ {table}: Error - {e}")
    
    print()
    
    # Step 2: Check for any user with portfolio data
    print("2. Looking for users with portfolio data...")
    print("-" * 80)
    
    try:
        # Check user_portfolio_history
        history_result = supabase.table('user_portfolio_history')\
            .select('user_id, value_date, total_value, snapshot_type')\
            .order('created_at', desc=True)\
            .limit(10)\
            .execute()
        
        if history_result.data:
            print(f"✅ Found {len(history_result.data)} records in user_portfolio_history")
            for record in history_result.data[:3]:
                print(f"   User: {record['user_id'][:8]}... | Date: {record['value_date']} | Value: ${record['total_value']:,.2f} | Type: {record['snapshot_type']}")
        else:
            print("⚠️  No records in user_portfolio_history table")
        
        print()
        
        # Check user_portfolio_snapshots
        snapshot_result = supabase.table('user_portfolio_snapshots')\
            .select('user_id, snapshot_date, total_value')\
            .order('created_at', desc=True)\
            .limit(10)\
            .execute()
        
        if snapshot_result.data:
            print(f"✅ Found {len(snapshot_result.data)} records in user_portfolio_snapshots")
            for record in snapshot_result.data[:3]:
                print(f"   User: {record['user_id'][:8]}... | Date: {record['snapshot_date']} | Value: ${record['total_value']:,.2f}")
        else:
            print("⚠️  No records in user_portfolio_snapshots table")
        
    except Exception as e:
        print(f"❌ Error checking portfolio data: {e}")
    
    print()
    
    # Step 3: Check Plaid data availability
    print("3. Checking Plaid data availability...")
    print("-" * 80)
    
    try:
        # Get a user with Plaid connection
        plaid_items = supabase.table('plaid_items')\
            .select('user_id, item_id, institution_name, created_at')\
            .order('created_at', desc=True)\
            .limit(5)\
            .execute()
        
        if plaid_items.data:
            print(f"✅ Found {len(plaid_items.data)} Plaid connected users")
            for item in plaid_items.data:
                user_id = item['user_id']
                print(f"\n   User: {user_id[:8]}... | Institution: {item['institution_name']}")
                
                # Check if this user has accounts
                accounts = supabase.table('plaid_accounts')\
                    .select('account_id, account_type, current_balance')\
                    .eq('user_id', user_id)\
                    .execute()
                
                if accounts.data:
                    print(f"   └─ {len(accounts.data)} accounts connected")
                    for acc in accounts.data[:3]:
                        print(f"      • {acc['account_type']}: ${acc.get('current_balance', 0):,.2f}")
                
                # Check reconstruction status
                status = supabase.table('user_portfolio_reconstruction_status')\
                    .select('*')\
                    .eq('user_id', user_id)\
                    .execute()
                
                if status.data:
                    s = status.data[0]
                    print(f"   └─ Reconstruction: {s.get('reconstruction_status')} ({s.get('reconstruction_progress', 0):.1f}%)")
                    if s.get('error_message'):
                        print(f"      ⚠️  Error: {s.get('error_message')}")
                else:
                    print(f"   └─ Reconstruction: NOT STARTED")
                
                # Check if portfolio history exists
                history = supabase.table('user_portfolio_history')\
                    .select('value_date, total_value')\
                    .eq('user_id', user_id)\
                    .order('value_date', desc=True)\
                    .limit(5)\
                    .execute()
                
                if history.data:
                    print(f"   └─ Portfolio History: {len(history.data)} days found")
                    print(f"      Latest: {history.data[0]['value_date']} = ${history.data[0]['total_value']:,.2f}")
                    if len(history.data) > 1:
                        print(f"      Oldest: {history.data[-1]['value_date']} = ${history.data[-1]['total_value']:,.2f}")
                else:
                    print(f"   └─ Portfolio History: NO DATA FOUND ❌")
        else:
            print("❌ No Plaid connected users found")
    
    except Exception as e:
        print(f"❌ Error checking Plaid data: {e}")
    
    print()
    print("=" * 80)
    print("DEBUG COMPLETE")
    print("=" * 80)

if __name__ == '__main__':
    debug_portfolio_reconstruction()

