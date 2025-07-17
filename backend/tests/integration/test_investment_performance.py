#!/usr/bin/env python3
"""
Test script to verify investment performance outputs
"""

import sys
import os
from datetime import datetime, timezone, timedelta

# Add the backend directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from clera_agents.financial_analyst_agent import calculate_investment_performance

def test_investment_performance():
    """
    Test investment performance for TSLA vs SPY
    """
    print("=== TESTING INVESTMENT PERFORMANCE ===")
    print(f"Test Time: {datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')}")
    print()
    
    # Calculate date range (2hs back from today)
    end_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    start_date = (datetime.now(timezone.utc) - timedelta(days=60)).strftime('%Y-%m-%d')
    
    print(f"Date Range: {start_date} to {end_date}")
    print()
    
    # Test symbols
    test_symbols = ['TSLA', 'SPY']
    
    for symbol in test_symbols:
        print(f"Testing {symbol} Performance Analysis...")
        print("-" * 60)
        
        try:
            # Test the investment performance tool
            performance_result = calculate_investment_performance(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date
            )
            
            print("Performance Analysis Generated Successfully!")
            print()
            print("EXACT OUTPUT:")
            print("=" * 80)
            print(performance_result)
            print("=" *80)          
        except Exception as e:
            print(f"Error testing {symbol}: {e}")
            import traceback
            traceback.print_exc()
        
        print()
        print("=" *80)
        print()
    
    return True

if __name__ == "__main__":
    success = test_investment_performance()
    if success:
        print("\nInvestment Performance Test completed successfully!")
    else:
        print("\nInvestment Performance Test failed!")
        sys.exit(1) 