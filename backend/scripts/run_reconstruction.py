#!/usr/bin/env python3
"""
Run portfolio reconstruction for a specific user.

This script triggers reconstruction to fill any gaps in historical data.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from services.portfolio_reconstruction_manager import get_portfolio_reconstruction_manager

async def run_reconstruction(user_id: str):
    print("=" * 80)
    print("RUNNING PORTFOLIO RECONSTRUCTION")
    print("=" * 80)
    print(f"\nUser ID: {user_id}")
    print("This will reconstruct historical portfolio values using actual")
    print("transaction data and historical price data from FMP.\n")
    
    manager = get_portfolio_reconstruction_manager()
    
    try:
        result = await manager.request_reconstruction_for_user(
            user_id,
            priority='high'  # High priority for immediate processing
        )
        
        print("\n✅ RECONSTRUCTION QUEUED:")
        print(f"   Status: {result.get('status')}")
        print(f"   Request ID: {result.get('request_id', 'N/A')}")
        print(f"   Message: {result.get('message')}")
        
        # Wait a bit for processing to start
        await asyncio.sleep(2)
        
        # Check status
        print("\n⏳ Waiting for reconstruction to complete...")
        for i in range(60):  # Wait up to 2 minutes
            await asyncio.sleep(2)
            
            status = await manager.get_reconstruction_status(user_id)
            
            state = status.get('state', 'unknown')
            progress = status.get('progress_percentage', 0)
            
            if state == 'completed':
                print(f"\n🎉 RECONSTRUCTION COMPLETED!")
                print(f"   Progress: {progress}%")
                print(f"   Message: {status.get('message', 'Success')}")
                
                # Show summary
                details = status.get('reconstruction_details', {})
                print(f"\n📊 SUMMARY:")
                print(f"   Data points generated: {details.get('total_data_points', 'N/A')}")
                print(f"   Date range: {details.get('start_date', 'N/A')} to {details.get('end_date', 'N/A')}")
                print(f"   Processing time: {details.get('processing_time_seconds', 'N/A')} seconds")
                break
            elif state == 'failed':
                print(f"\n❌ RECONSTRUCTION FAILED:")
                print(f"   Error: {status.get('error_message', 'Unknown error')}")
                break
            elif state in ['queued', 'processing']:
                if i % 5 == 0:  # Print every 10 seconds
                    print(f"   {state.upper()}: {progress}% complete...")
            else:
                if i == 0:
                    print(f"   Status: {state}")
        
        print("\n" + "=" * 80)
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
    else:
        user_id = "1179bade-50f6-4f4f-ac10-6f6d613b744a"  # Default test user
    
    asyncio.run(run_reconstruction(user_id))

