"""
Backfill missing daily snapshots for Oct 29 - Nov 3, 2025.

This script fills in the gap where the daily scheduler wasn't running.
"""
import asyncio
import os
import sys
from datetime import datetime, date, timedelta

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.daily_portfolio_snapshot_service import DailyPortfolioSnapshotService
from supabase import create_client

async def backfill_snapshots():
    """Backfill snapshots for missing dates."""
    print("=" * 80)
    print("🔄 BACKFILLING MISSING DAILY SNAPSHOTS (Oct 29 - Nov 3, 2025)")
    print("=" * 80)
    
    # Initialize service
    service = DailyPortfolioSnapshotService()
    
    # Define missing dates
    missing_dates = [
        date(2025, 10, 29),
        date(2025, 10, 30),
        date(2025, 10, 31),
        date(2025, 11, 1),
        date(2025, 11, 2),
    ]
    
    print(f"\n📅 Will backfill {len(missing_dates)} missing days:\n")
    for d in missing_dates:
        print(f"  - {d}")
    
    print("\n" + "=" * 80)
    
    # IMPORTANT: For backfilling, we use CURRENT holdings with HISTORICAL prices
    # This is an approximation but better than nothing
    # The daily snapshot service will fetch live prices, which is the best we can do
    
    print("\n⚠️  NOTE: Backfilling uses current holdings with today's prices.")
    print("   This is an approximation since we don't have historical holdings quantities.")
    print("   For accurate historical data, use the portfolio reconstruction service.\n")
    
    total_backfilled = 0
    total_failed = 0
    
    for snapshot_date in missing_dates:
        print(f"\n📸 Backfilling {snapshot_date}...")
        print("-" * 80)
        
        try:
            # Capture snapshot for this date
            # Note: This will use today's holdings and today's prices
            # In production, you'd want to fetch historical prices for the specific date
            result = await service.capture_all_users_eod_snapshots(sync_stale_holdings=False)
            
            print(f"✅ Success: {result.successful_snapshots} snapshots")
            print(f"   Total portfolio value: ${result.total_portfolio_value:,.2f}")
            
            # Update the value_date in the database to the correct historical date
            supabase = create_client(
                os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
                os.getenv('SUPABASE_SERVICE_ROLE_KEY')
            )
            
            # Update today's snapshots to the historical date
            update_result = supabase.table('user_portfolio_history')\
                .update({'value_date': snapshot_date.isoformat()})\
                .eq('value_date', date.today().isoformat())\
                .eq('snapshot_type', 'daily_eod')\
                .execute()
            
            print(f"✅ Updated {len(update_result.data)} snapshots to date {snapshot_date}")
            
            total_backfilled += result.successful_snapshots
            total_failed += result.failed_snapshots
            
        except Exception as e:
            print(f"❌ Error backfilling {snapshot_date}: {e}")
            total_failed += 1
    
    print("\n" + "=" * 80)
    print("🎯 BACKFILL COMPLETE")
    print("=" * 80)
    print(f"  Total backfilled: {total_backfilled}")
    print(f"  Total failed: {total_failed}")
    print("\n✅ Done! Check your portfolio chart - the flat line should be fixed.\n")

if __name__ == "__main__":
    asyncio.run(backfill_snapshots())

