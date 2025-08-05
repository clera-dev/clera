#!/usr/bin/env python3
"""
Simple test suite for purchase history functionality that focuses on testing
the underlying functions and includes live API testing.
"""

import os
import sys
from datetime import datetime, timezone
from unittest.mock import Mock, patch
from decimal import Decimal

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_basic_functionality():
    """Test basic functionality with mocks."""
    print("🧪 Testing Basic Functionality...")
    
    from clera_agents.tools.purchase_history import ActivityRecord
    
    # Test ActivityRecord creation
    activity = ActivityRecord(
        activity_type='FILL',
        symbol='AAPL',
        transaction_time=datetime.now(timezone.utc),
        quantity=Decimal('10'),
        price=Decimal('150.00'),
        side='buy',
        net_amount=Decimal('-1500.00'),
        description='Bought 10 shares of AAPL at $150.00',
        id='test-123'
    )
    
    assert activity.symbol == 'AAPL'
    print("✅ ActivityRecord creation works")
    
    # Test formatting
    from clera_agents.tools.purchase_history import format_purchase_history
    formatted = format_purchase_history([activity])
    print(f"📝 Formatted output:\n{formatted}")
    print(f"📝 Looking for 'AAPL' in: '{formatted}'")
    assert "AAPL" in formatted, f"AAPL not found in formatted output: {formatted}"
    print("✅ Formatting works")
    
    print("✅ Basic functionality tests passed!\n")


def test_live_api():
    """Test the actual API calls to see what data we get."""
    print("🔴 Testing LIVE API Calls...")
    print("=" * 50)
    
    try:
        # Import the helper functions
        from clera_agents.tools.purchase_history import (
            get_purchase_history, get_all_activities, find_first_purchase_dates,
            format_purchase_history
        )
        
        print("📋 1. Testing get_purchase_history() (30 days)...")
        purchase_history = get_purchase_history(days_back=30)
        print(f"   Found {len(purchase_history)} purchase activities")
        
        if purchase_history:
            print("   Sample activity:")
            activity = purchase_history[0]
            print(f"   - Type: {activity.activity_type}")
            print(f"   - Symbol: {activity.symbol}")
            print(f"   - Side: {activity.side}")
            print(f"   - Quantity: {activity.quantity}")
            print(f"   - Price: {activity.price}")
            print(f"   - Time: {activity.transaction_time}")
            print(f"   - Description: {activity.description}")
        
        print("\n📅 2. Testing get_all_activities() (30 days)...")
        all_activities = get_all_activities(days_back=30)
        print(f"   Found {len(all_activities)} total activities")
        
        if all_activities:
            activity_types = {}
            for activity in all_activities:
                activity_types[activity.activity_type] = activity_types.get(activity.activity_type, 0) + 1
            
            print("   Activity types found:")
            for activity_type, count in activity_types.items():
                print(f"   - {activity_type}: {count}")
        
        print("\n🏠 3. Testing find_first_purchase_dates()...")
        first_purchases = find_first_purchase_dates()
        print(f"   Found first purchase dates for {len(first_purchases)} symbols")
        
        if first_purchases:
            print("   First purchase dates:")
            for symbol, date in first_purchases.items():
                print(f"   - {symbol}: {date.strftime('%Y-%m-%d %H:%M:%S')}")
        
        print("\n📝 4. Testing formatted output...")
        if purchase_history:
            formatted = format_purchase_history(purchase_history[:3])  # Just show first 3
            print("   Formatted purchase history (first 3):")
            print(formatted)
        
        print("\n✅ LIVE API TESTS COMPLETED SUCCESSFULLY!")
        
    except Exception as e:
        print(f"❌ LIVE API TEST FAILED: {e}")
        import traceback
        traceback.print_exc()


def test_tool_functions():
    """Test the @tool decorated functions properly."""
    print("🔧 Testing @tool Functions...")
    
    try:
        from clera_agents.portfolio_management_agent import (
            get_purchase_history_tool, get_account_activities_tool, get_first_purchase_dates_tool
        )
        
        print("📅 1. Testing get_purchase_history_tool...")
        # Tools need to be invoked with proper input
        history_result = get_purchase_history_tool.invoke({})
        print(f"   Result length: {len(history_result)}")
        print(f"   First 200 chars: {history_result[:200]}...")
        
        print("\n📋 2. Testing get_account_activities_tool...")
        activities_result = get_account_activities_tool.invoke({})
        print(f"   Result length: {len(activities_result)}")
        print(f"   First 200 chars: {activities_result[:200]}...")
        
        print("\n📊 3. Testing get_first_purchase_dates_tool...")
        dates_result = get_first_purchase_dates_tool.invoke({})
        print(f"   Result length: {len(dates_result)}")
        print(f"   First 200 chars: {dates_result[:200]}...")
        
        print("\n✅ TOOL FUNCTION TESTS COMPLETED!")
        
        # Print full results for user to see
        print("\n" + "="*60)
        print("📅 FULL PURCHASE HISTORY TOOL OUTPUT:")
        print("="*60)
        print(history_result)
        
        print("\n" + "="*60)
        print("📋 FULL ACCOUNT ACTIVITIES TOOL OUTPUT:")
        print("="*60)
        print(activities_result)
        
        print("\n" + "="*60)
        print("📊 FULL FIRST PURCHASE DATES TOOL OUTPUT:")
        print("="*60)
        print(dates_result)
        
    except Exception as e:
        print(f"❌ TOOL FUNCTION TEST FAILED: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print("🧪 Running Simple Purchase History Tests")
    print("=" * 50)
    
    # Test basic functionality first
    test_basic_functionality()
    
    # Ask user if they want to run live tests
    response = input("🔴 Run LIVE tests against Alpaca API? (y/N): ").strip().lower()
    if response == 'y':
        test_live_api()
        print("\n" + "="*50)
        test_tool_functions()
    else:
        print("✅ Skipping live tests. Basic tests completed!") 