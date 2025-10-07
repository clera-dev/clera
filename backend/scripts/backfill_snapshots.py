#!/usr/bin/env python3
"""
Backfill EOD snapshots for missing days.

This script manually creates daily snapshots for days that were missed.
"""

import asyncio
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
import pytz

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from utils.supabase.db_client import get_supabase_client
from utils.portfolio.aggregated_portfolio_service import get_aggregated_portfolio_service

async def backfill_snapshots(user_id: str, start_date: str, end_date: str):
    """
    Backfill daily snapshots using current holdings as proxy.
    
    Note: This uses current holdings, so values won't be 100% accurate
    to historical values, but it's better than having a gap.
    """
    print("=" * 80)
    print("BACKFILLING EOD SNAPSHOTS")
    print("=" * 80)
    print(f"\nUser ID: {user_id}")
    print(f"Date Range: {start_date} to {end_date}")
    print("\n⚠️  NOTE: Using current holdings as proxy for historical values.")
    print("For 100% accuracy, Plaid sync + reconstruction would be needed.\n")
    
    supabase = get_supabase_client()
    portfolio_service = get_aggregated_portfolio_service()
    
    # Get current portfolio value (best proxy we have)
    current_value = await portfolio_service.get_portfolio_value(user_id, include_cash=True)
    
    if not current_value or current_value.get('raw_value', 0) == 0:
        print("❌ No current portfolio value found")
        return
    
    total_value = current_value['raw_value']
    
    # Parse dates
    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    # Create snapshots for each day
    current_date = start
    snapshots_created = 0
    
    while current_date <= end:
        # Skip weekends
        if current_date.weekday() < 5:  # Monday=0, Friday=4
            snapshot = {
                'user_id': user_id,
                'value_date': current_date.isoformat(),
                'snapshot_type': 'daily_eod',
                'total_value': total_value,
                'total_gain_loss': current_value.get('return_value', 0),
                'total_gain_loss_percent': current_value.get('return_percent', 0),
                'data_source': 'manual_backfill',
                'data_quality_score': 70.0,  # Lower score since it's proxy data
                'created_at': datetime.now().isoformat()
            }
            
            try:
                supabase.table('user_portfolio_history')\
                    .upsert(snapshot, on_conflict='user_id,value_date,snapshot_type')\
                    .execute()
                
                print(f"✅ Created snapshot for {current_date}: ${total_value:,.2f}")
                snapshots_created += 1
            except Exception as e:
                print(f"❌ Failed to create snapshot for {current_date}: {e}")
        
        current_date += timedelta(days=1)
    
    print(f"\n{'='*80}")
    print(f"BACKFILL COMPLETE: {snapshots_created} snapshots created")
    print(f"{'='*80}\n")

if __name__ == "__main__":
    user_id = "1179bade-50f6-4f4f-ac10-6f6d613b744a"
    start_date = "2025-10-03"  # Day after last snapshot
    end_date = "2025-10-07"    # Today
    
    asyncio.run(backfill_snapshots(user_id, start_date, end_date))

