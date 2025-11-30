"""
PRODUCTION-GRADE: Request portfolio reconstruction to fill Oct 29 - Nov 2, 2025 gap

This uses the proper reconstruction system which:
1. Looks at transaction history from SnapTrade
2. Knows what holdings existed on each historical date
3. Fetches accurate historical prices for those dates
4. Creates proper reconstructed snapshots

This is the CORRECT way to backfill historical data.
"""

import asyncio
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.portfolio_reconstruction_manager import get_portfolio_reconstruction_manager


async def main():
    """Trigger portfolio reconstruction for a specific user."""
    print("=" * 80)
    print("🔄 PORTFOLIO RECONSTRUCTION REQUEST")
    print("   Purpose: Fill Oct 29 - Nov 2, 2025 gap")
    print("=" * 80)
    print()
    
    user_id = 'b53f0266-b162-48dd-b6b7-20373c8d9990'
    
    print(f"👤 User ID: {user_id}")
    print(f"⚡ Priority: high (immediate processing)")
    print()
    
    # Get reconstruction manager
    manager = get_portfolio_reconstruction_manager()
    
    # Request reconstruction
    print("📥 Requesting reconstruction...")
    result = await manager.request_reconstruction_for_user(
        user_id,
        priority='high'  # High priority for immediate processing
    )
    
    print()
    print("✅ RECONSTRUCTION QUEUED:")
    print(f"   Status: {result.get('status')}")
    print(f"   Request ID: {result.get('request_id', 'N/A')}")
    print(f"   Message: {result.get('message')}")
    print()
    
    # Monitor progress
    print("⏳ Monitoring reconstruction progress...")
    print("   (This typically takes 2-3 minutes)")
    print()
    
    max_wait_seconds = 300  # 5 minutes max
    check_interval = 5  # Check every 5 seconds
    elapsed = 0
    
    while elapsed < max_wait_seconds:
        await asyncio.sleep(check_interval)
        elapsed += check_interval
        
        # Check status
        status = await manager.get_reconstruction_status_for_user(user_id)
        
        current_status = status.get('status', 'unknown')
        progress = status.get('progress_percent', 0)
        
        print(f"   [{elapsed}s] Status: {current_status} | Progress: {progress}%")
        
        if current_status == 'completed':
            print()
            print("=" * 80)
            print("✅ RECONSTRUCTION COMPLETE!")
            print("=" * 80)
            print(f"   Snapshots created: {status.get('snapshots_created', 'N/A')}")
            print(f"   Date range: {status.get('start_date', 'N/A')} to {status.get('end_date', 'N/A')}")
            print()
            print("✅ Gap should now be filled! Check your portfolio chart.")
            return
        
        elif current_status == 'failed':
            print()
            print("=" * 80)
            print("❌ RECONSTRUCTION FAILED")
            print("=" * 80)
            print(f"   Error: {status.get('error_message', 'Unknown error')}")
            return
    
    print()
    print("⚠️  Reconstruction still in progress after 5 minutes.")
    print("   Check status via: GET /api/portfolio/reconstruction/status")
    print()


if __name__ == "__main__":
    asyncio.run(main())

