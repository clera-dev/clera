"""
Debug test to investigate why the "Total" is showing $0.00 in comprehensive activities.
"""

import sys
import os
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the backend directory to the path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# TEST ACCOUNT CONFIGURATION - Load from environment variable
TEST_ALPACA_ACCOUNT_ID = os.getenv("TEST_ALPACA_ACCOUNT_ID")
if not TEST_ALPACA_ACCOUNT_ID:
    raise ValueError("TEST_ALPACA_ACCOUNT_ID environment variable is required. Please set it in your .env file.")

from clera_agents.tools.purchase_history import get_account_activities

def debug_total_calculation():
    """Debug why the total calculation shows $0.00."""
    print("🔍 DEBUGGING: Why Total shows $0.00")
    print("="*60)
    
    # Get raw activities
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=60)
    
    activities = get_account_activities(
        account_id=TEST_ALPACA_ACCOUNT_ID,
        activity_types=['FILL'],
        date_start=start_date,
        date_end=end_date,
        page_size=10  # Just get a few to debug
    )
    
    print(f"📊 DEBUGGING FIRST 5 ACTIVITIES:")
    print("-" * 60)
    
    for i, activity in enumerate(activities[:5]):
        print(f"\n🔸 Activity #{i+1}:")
        print(f"   Symbol: {activity.symbol}")
        print(f"   Side: {activity.side}")
        print(f"   Quantity: {activity.quantity}")
        print(f"   Price: {activity.price}")
        print(f"   Net Amount: {activity.net_amount}")
        print(f"   Activity Type: {activity.activity_type}")
        print(f"   Description: {activity.description}")
        
        # Calculate what the total SHOULD be
        if activity.quantity and activity.price:
            calculated_total = float(activity.quantity) * float(activity.price)
            print(f"   🧮 Calculated Total (qty * price): ${calculated_total:.2f}")
        else:
            print(f"   🧮 Cannot calculate total (missing qty or price)")
        
        # Show what the current logic produces
        if activity.net_amount:
            current_total = f"${abs(float(activity.net_amount)):.2f}"
            print(f"   💰 Current Total Logic: {current_total}")
        else:
            print(f"   💰 Current Total Logic: $0.00 (net_amount is None)")
        
        print(f"   🆔 Activity ID: {activity.id}")

if __name__ == "__main__":
    debug_total_calculation() 