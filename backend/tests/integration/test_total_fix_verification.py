"""
Test to verify the total calculation fix works in comprehensive activities.
"""

import sys
import os

# Add the backend directory to the path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# TEST ACCOUNT CONFIGURATION
TEST_ALPACA_ACCOUNT_ID = "60205bf6-1d3f-46a5-8a1c-7248ee9210c5"

from clera_agents.tools.purchase_history import get_comprehensive_account_activities

def test_total_fix():
    """Test that the total calculation fix shows real dollar amounts."""
    print("🧪 TESTING: Total calculation fix")
    print("="*60)
    
    result = get_comprehensive_account_activities(account_id=TEST_ALPACA_ACCOUNT_ID, days_back=30)
    
    # Look for the "Total:" lines in the output
    lines = result.split('\n')
    total_lines = [line for line in lines if '💰 Total:' in line]
    
    print(f"📊 FOUND {len(total_lines)} TOTAL LINES:")
    print("-" * 40)
    
    non_zero_totals = 0
    zero_totals = 0
    
    for line in total_lines[:10]:  # Show first 10
        print(f"  {line.strip()}")
        if '$0.00' in line:
            zero_totals += 1
        else:
            non_zero_totals += 1
    
    if len(total_lines) > 10:
        print(f"  ... and {len(total_lines) - 10} more")
    
    print(f"\n📈 SUMMARY:")
    print(f"  • Non-zero totals: {non_zero_totals}")
    print(f"  • Zero totals: {zero_totals}")
    
    if non_zero_totals > 0:
        print(f"  ✅ FIX SUCCESSFUL! Showing real dollar amounts")
    else:
        print(f"  ❌ FIX NOT WORKING: Still showing $0.00")
    
    return result

if __name__ == "__main__":
    test_total_fix() 