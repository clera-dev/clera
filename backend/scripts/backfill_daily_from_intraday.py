"""
One-time Backfill Script: Convert Intraday Snapshots to Daily EOD Snapshots

This script addresses the gap in daily_eod snapshots by creating them from
existing intraday snapshots. For each date that has intraday data but no
daily_eod snapshot, we take the last intraday snapshot and convert it.

Run this script when:
- The daily snapshot job hasn't been running
- There's a gap in daily_eod snapshots
- After restoring from a backup

Usage:
    cd /Users/cristian_mendoza/Desktop/clera/backend
    source venv/bin/activate
    python scripts/backfill_daily_from_intraday.py
"""

import os
import sys
import logging
from datetime import datetime, timedelta, date
from collections import defaultdict
from typing import List, Dict, Any

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_supabase_client():
    """Get Supabase client."""
    from supabase import create_client
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    
    return create_client(url, key)


def find_missing_daily_dates(supabase, user_id: str, start_date: date, end_date: date) -> List[date]:
    """
    Find dates that have intraday snapshots but no daily_eod snapshots.
    
    Returns:
        List of dates missing daily_eod snapshots
    """
    # Get all dates with daily_eod snapshots
    daily_result = supabase.table('user_portfolio_history')\
        .select('value_date')\
        .eq('user_id', user_id)\
        .in_('snapshot_type', ['daily_eod', 'reconstructed'])\
        .gte('value_date', start_date.isoformat())\
        .lte('value_date', end_date.isoformat())\
        .execute()
    
    existing_daily_dates = {row['value_date'] for row in daily_result.data}
    
    # Get all dates with intraday snapshots
    intraday_result = supabase.table('user_portfolio_history')\
        .select('value_date')\
        .eq('user_id', user_id)\
        .eq('snapshot_type', 'intraday')\
        .gte('value_date', start_date.isoformat())\
        .lte('value_date', end_date.isoformat())\
        .execute()
    
    intraday_dates = {row['value_date'] for row in intraday_result.data}
    
    # Find dates with intraday but no daily
    missing_dates = intraday_dates - existing_daily_dates
    
    return sorted([datetime.fromisoformat(d).date() for d in missing_dates])


def get_last_intraday_for_date(supabase, user_id: str, target_date: date) -> Dict[str, Any]:
    """
    Get the last intraday snapshot for a specific date.
    
    Returns:
        Last intraday snapshot for the date, or None
    """
    result = supabase.table('user_portfolio_history')\
        .select('*')\
        .eq('user_id', user_id)\
        .eq('value_date', target_date.isoformat())\
        .eq('snapshot_type', 'intraday')\
        .order('created_at', desc=True)\
        .limit(1)\
        .execute()
    
    return result.data[0] if result.data else None


def create_daily_eod_from_intraday(supabase, user_id: str, intraday_snapshot: Dict[str, Any]) -> bool:
    """
    Create a daily_eod snapshot from an intraday snapshot.
    
    Returns:
        True if successful, False otherwise
    """
    try:
        value_date = intraday_snapshot['value_date']
        
        # Check if daily_eod already exists for this date
        existing = supabase.table('user_portfolio_history')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('value_date', value_date)\
            .eq('snapshot_type', 'daily_eod')\
            .limit(1)\
            .execute()
        
        if existing.data:
            logger.debug(f"  Skipping {value_date}: daily_eod already exists")
            return False
        
        # Create daily_eod snapshot
        daily_snapshot = {
            'user_id': user_id,
            'value_date': value_date,
            'snapshot_type': 'daily_eod',
            'total_value': intraday_snapshot['total_value'],
            'total_cost_basis': intraday_snapshot.get('total_cost_basis', intraday_snapshot['total_value']),
            'total_gain_loss': intraday_snapshot.get('total_gain_loss', 0),
            'total_gain_loss_percent': intraday_snapshot.get('total_gain_loss_percent', 0),
            'closing_value': intraday_snapshot['total_value'],  # EOD close = last intraday value
            'opening_value': intraday_snapshot.get('opening_value'),
            'data_source': 'backfill_from_intraday',
            'price_source': intraday_snapshot.get('price_source', 'fmp'),
            'data_quality_score': 95.0,  # Slightly lower quality (derived, not captured at close)
            'securities_count': intraday_snapshot.get('securities_count', 0)
        }
        
        supabase.table('user_portfolio_history')\
            .insert(daily_snapshot)\
            .execute()
        
        return True
        
    except Exception as e:
        logger.error(f"Error creating daily_eod for {value_date}: {e}")
        return False


def backfill_user(supabase, user_id: str, days_back: int = 30) -> Dict[str, int]:
    """
    Backfill missing daily_eod snapshots for a user.
    
    Returns:
        Stats dictionary with counts
    """
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days_back)
    
    logger.info(f"🔍 Finding missing daily snapshots for user {user_id[:8]}... ({start_date} to {end_date})")
    
    missing_dates = find_missing_daily_dates(supabase, user_id, start_date, end_date)
    
    if not missing_dates:
        logger.info(f"  ✅ No missing dates found!")
        return {'missing': 0, 'created': 0, 'failed': 0}
    
    logger.info(f"  📅 Found {len(missing_dates)} dates missing daily_eod snapshots")
    
    created = 0
    failed = 0
    
    for target_date in missing_dates:
        intraday = get_last_intraday_for_date(supabase, user_id, target_date)
        
        if intraday:
            if create_daily_eod_from_intraday(supabase, user_id, intraday):
                logger.info(f"  ✅ Created daily_eod for {target_date}: ${float(intraday['total_value']):,.2f}")
                created += 1
            else:
                failed += 1
        else:
            logger.warning(f"  ⚠️  No intraday data found for {target_date}")
            failed += 1
    
    return {'missing': len(missing_dates), 'created': created, 'failed': failed}


def main():
    """Main entry point for backfill script."""
    logger.info("=" * 60)
    logger.info("📊 Daily EOD Backfill Script")
    logger.info("  Converting intraday snapshots to daily_eod snapshots")
    logger.info("=" * 60)
    
    supabase = get_supabase_client()
    
    # Get all users with aggregation mode (Plaid + SnapTrade)
    users_result = supabase.table('user_investment_accounts')\
        .select('user_id')\
        .in_('provider', ['plaid', 'snaptrade'])\
        .eq('is_active', True)\
        .execute()
    
    user_ids = list(set(row['user_id'] for row in users_result.data))
    logger.info(f"\n📋 Found {len(user_ids)} aggregation users to process\n")
    
    total_stats = {'users': 0, 'missing': 0, 'created': 0, 'failed': 0}
    
    for user_id in user_ids:
        stats = backfill_user(supabase, user_id, days_back=30)
        
        if stats['missing'] > 0:
            total_stats['users'] += 1
            total_stats['missing'] += stats['missing']
            total_stats['created'] += stats['created']
            total_stats['failed'] += stats['failed']
    
    logger.info("\n" + "=" * 60)
    logger.info("📈 BACKFILL SUMMARY")
    logger.info("=" * 60)
    logger.info(f"  Users with gaps:       {total_stats['users']}")
    logger.info(f"  Total missing dates:   {total_stats['missing']}")
    logger.info(f"  Successfully created:  {total_stats['created']}")
    logger.info(f"  Failed:                {total_stats['failed']}")
    logger.info("=" * 60)
    
    if total_stats['created'] > 0:
        logger.info("\n✅ Backfill complete! Portfolio charts should now show accurate data.")
    elif total_stats['missing'] == 0:
        logger.info("\n✅ No gaps found - all daily snapshots are up to date!")
    else:
        logger.warning("\n⚠️  Some dates could not be backfilled. Check logs for details.")


if __name__ == '__main__':
    main()

