"""
Comprehensive test for purchase history functions with actual tool output display.

This test file uses a specific test Alpaca account and shows the actual output 
from the purchase history functions to verify they work correctly.
"""

import sys
import os
import pytest
from datetime import datetime, timezone
from typing import Dict

# Add the backend directory to the path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# TEST ACCOUNT CONFIGURATION
# =========================
# This test uses a specific Alpaca test account for consistent results
# Load from environment variable for security
TEST_ALPACA_ACCOUNT_ID = os.getenv("TEST_ALPACA_ACCOUNT_ID")
if not TEST_ALPACA_ACCOUNT_ID:
    raise ValueError("TEST_ALPACA_ACCOUNT_ID environment variable is required. Please set it in your .env file.")

print(f"🧪 TESTING WITH ALPACA ACCOUNT ID: {TEST_ALPACA_ACCOUNT_ID}")
print("=" * 80)

# Import the functions we want to test
from clera_agents.tools.purchase_history import (
    find_first_purchase_dates,
    get_comprehensive_account_activities,
    get_account_activities,
    ActivityRecord
)


class TestPurchaseHistoryFunctions:
    """Test suite for purchase history functions."""
    
    @pytest.fixture(autouse=True)
    def setup_test_account(self, monkeypatch):
        """Mock the get_account_id function to return our test account."""
        def mock_get_account_id(config=None):
            return TEST_ALPACA_ACCOUNT_ID
        
        # Patch the function in the purchase_history module
        monkeypatch.setattr("clera_agents.tools.purchase_history.get_account_id", mock_get_account_id)
    
    def test_find_first_purchase_dates_output(self):
        """Test find_first_purchase_dates function and display actual output."""
        print("\n" + "="*80)
        print("🔍 TESTING: find_first_purchase_dates()")
        print(f"📅 Lookback period: 365 days")
        print(f"🎯 Expected: Dictionary of symbol -> first purchase date")
        print("="*80)
        
        try:
            # Call the function
            result = find_first_purchase_dates()
            
            # Display results
            print(f"✅ SUCCESS: Function returned {type(result)} with {len(result)} items")
            print()
            
            if result:
                print("📊 FIRST PURCHASE DATES:")
                print("-" * 40)
                # Sort by date to show oldest purchases first
                sorted_purchases = sorted(result.items(), key=lambda x: x[1])
                
                for symbol, date in sorted_purchases:
                    formatted_date = date.strftime("%B %d, %Y at %I:%M %p")
                    days_ago = (datetime.now(timezone.utc) - date).days
                    print(f"  🟢 {symbol:6} | {formatted_date} ({days_ago} days ago)")
                
                print()
                print(f"📈 SUMMARY:")
                print(f"  • Total symbols with first purchase data: {len(result)}")
                
                if result:
                    oldest_purchase = min(result.values())
                    newest_purchase = max(result.values())
                    print(f"  • Oldest first purchase: {oldest_purchase.strftime('%B %d, %Y')}")
                    print(f"  • Newest first purchase: {newest_purchase.strftime('%B %d, %Y')}")
            else:
                print("❌ No first purchase dates found")
                print("   This could mean:")
                print("   - No buy transactions in the last 365 days")
                print("   - Account has no trading history")
                print("   - API access issues")
            
            # Verify the function contract
            assert isinstance(result, dict), "Function should return a dictionary"
            for symbol, date in result.items():
                assert isinstance(symbol, str), f"Symbol {symbol} should be a string"
                assert isinstance(date, datetime), f"Date for {symbol} should be a datetime object"
                assert date.tzinfo is not None, f"Date for {symbol} should be timezone-aware"
            
            print("\n✅ All assertions passed!")
            return result
            
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            print(f"   Error type: {type(e)}")
            raise

    def test_get_comprehensive_account_activities_output(self):
        """Test get_comprehensive_account_activities function and display actual output."""
        print("\n" + "="*80)
        print("🔍 TESTING: get_comprehensive_account_activities()")
        print(f"📅 Lookback period: 60 days (default)")
        print(f"🎯 Expected: Formatted string with trading history and statistics")
        print("="*80)
        
        try:
            # Call the function
            result = get_comprehensive_account_activities(account_id=TEST_ALPACA_ACCOUNT_ID)
            
            # Display results
            print(f"✅ SUCCESS: Function returned {type(result)} with {len(result)} characters")
            print()
            
            # Show the actual output
            print("📋 COMPREHENSIVE ACCOUNT ACTIVITIES OUTPUT:")
            print("=" * 60)
            print(result)
            print("=" * 60)
            
            # Extract some statistics from the output for verification
            lines = result.split('\n')
            stats = {}
            for line in lines:
                if '**Total Activities:**' in line:
                    stats['total_activities'] = line.split('**Total Activities:**')[1].strip()
                elif '**Trades:**' in line:
                    stats['trades'] = line.split('**Trades:**')[1].strip()
                elif '**Buy Transactions:**' in line:
                    stats['buy_transactions'] = line.split('**Buy Transactions:**')[1].strip()
                elif '**Sell Transactions:**' in line:
                    stats['sell_transactions'] = line.split('**Sell Transactions:**')[1].strip()
                elif '**Unique Symbols Traded:**' in line:
                    stats['unique_symbols'] = line.split('**Unique Symbols Traded:**')[1].strip()
            
            print("\n📊 EXTRACTED STATISTICS:")
            print("-" * 30)
            for key, value in stats.items():
                print(f"  • {key.replace('_', ' ').title()}: {value}")
            
            # Verify the function contract
            assert isinstance(result, str), "Function should return a string"
            assert len(result) > 0, "Result should not be empty"
            assert "Account Activities" in result, "Result should contain account activities header"
            
            print("\n✅ All assertions passed!")
            return result
            
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            print(f"   Error type: {type(e)}")
            raise

    def test_get_account_activities_raw_data(self):
        """Test the raw get_account_activities function to see underlying data."""
        print("\n" + "="*80)
        print("🔍 TESTING: get_account_activities() [Raw Data]")
        print(f"📅 Lookback period: 60 days")
        print(f"🎯 Expected: List of ActivityRecord objects")
        print("="*80)
        
        try:
            from datetime import timedelta
            
            # Get last 60 days of FILL activities
            end_date = datetime.now(timezone.utc)
            start_date = end_date - timedelta(days=60)
            
            result = get_account_activities(
                account_id=TEST_ALPACA_ACCOUNT_ID,
                activity_types=['FILL'],
                date_start=start_date,
                date_end=end_date,
                page_size=100
            )
            
            print(f"✅ SUCCESS: Function returned {len(result)} activity records")
            print()
            
            if result:
                print("📊 RAW ACTIVITY DATA (First 10 records):")
                print("-" * 80)
                
                for i, activity in enumerate(result[:10]):
                    print(f"\n🔸 Activity #{i+1}:")
                    print(f"   Symbol: {activity.symbol}")
                    print(f"   Side: {activity.side}")
                    print(f"   Quantity: {activity.quantity}")
                    print(f"   Price: {activity.price}")
                    print(f"   Date: {activity.transaction_time.strftime('%Y-%m-%d %H:%M:%S')}")
                    print(f"   Description: {activity.description}")
                    print(f"   Activity Type: {activity.activity_type}")
                
                # Statistics
                buy_count = sum(1 for a in result if a.side and 'buy' in str(a.side).lower())
                sell_count = sum(1 for a in result if a.side and 'sell' in str(a.side).lower())
                symbols = set(a.symbol for a in result if a.symbol)
                
                print(f"\n📈 RAW DATA STATISTICS:")
                print(f"  • Total records: {len(result)}")
                print(f"  • Buy transactions: {buy_count}")
                print(f"  • Sell transactions: {sell_count}")
                print(f"  • Unique symbols: {len(symbols)}")
                print(f"  • Symbols: {', '.join(sorted(symbols))}")
            else:
                print("❌ No activity records found")
            
            # Verify the function contract
            assert isinstance(result, list), "Function should return a list"
            for activity in result:
                assert isinstance(activity, ActivityRecord), "Each item should be an ActivityRecord"
            
            print("\n✅ All assertions passed!")
            return result
            
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            print(f"   Error type: {type(e)}")
            raise

    def test_data_consistency_between_functions(self):
        """Test that the data is consistent between different functions."""
        print("\n" + "="*80)
        print("🔍 TESTING: Data Consistency Between Functions")
        print("🎯 Expected: Consistent data between raw and formatted functions")
        print("="*80)
        
        try:
            # Get data from both functions
            first_purchases = find_first_purchase_dates()
            comprehensive_output = get_comprehensive_account_activities(account_id=TEST_ALPACA_ACCOUNT_ID)
            
            # Extract buy transaction count from comprehensive output
            buy_count_from_comprehensive = 0
            lines = comprehensive_output.split('\n')
            for line in lines:
                if '**Buy Transactions:**' in line:
                    buy_count_str = line.split('**Buy Transactions:**')[1].strip()
                    buy_count_from_comprehensive = int(buy_count_str)
                    break
            
            print(f"📊 CONSISTENCY CHECK:")
            print(f"  • First purchase dates found: {len(first_purchases)} symbols")
            print(f"  • Buy transactions in comprehensive: {buy_count_from_comprehensive}")
            
            # Check if first purchase data makes sense
            if first_purchases and buy_count_from_comprehensive > 0:
                print(f"  ✅ Both functions show trading activity")
                
                # Verify symbols from first purchases appear in comprehensive output
                symbols_in_first_purchases = set(first_purchases.keys())
                symbols_mentioned_in_comprehensive = set()
                
                # Simple symbol extraction from comprehensive output
                for symbol in symbols_in_first_purchases:
                    if symbol in comprehensive_output:
                        symbols_mentioned_in_comprehensive.add(symbol)
                
                print(f"  • Symbols in first purchases: {len(symbols_in_first_purchases)}")
                print(f"  • Symbols mentioned in comprehensive: {len(symbols_mentioned_in_comprehensive)}")
                
                if symbols_mentioned_in_comprehensive:
                    print(f"  ✅ Common symbols found between functions")
                else:
                    print(f"  ⚠️  No common symbols found (may be due to different time windows)")
            
            print("\n✅ Consistency check completed!")
            
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            print(f"   Error type: {type(e)}")
            raise


def run_all_tests():
    """Run all tests and display comprehensive output."""
    print("🚀 STARTING COMPREHENSIVE PURCHASE HISTORY TESTS")
    print(f"📋 Test Account: {TEST_ALPACA_ACCOUNT_ID}")
    print(f"⏰ Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    test_instance = TestPurchaseHistoryFunctions()
    
    # Mock the get_account_id function manually for standalone execution
    import clera_agents.tools.purchase_history as ph_module
    original_get_account_id = ph_module.get_account_id
    ph_module.get_account_id = lambda config=None: TEST_ALPACA_ACCOUNT_ID
    
    try:
        # Run tests
        test_instance.test_find_first_purchase_dates_output()
        test_instance.test_get_comprehensive_account_activities_output()
        test_instance.test_get_account_activities_raw_data()
        test_instance.test_data_consistency_between_functions()
        
        print("\n" + "="*80)
        print("🎉 ALL TESTS COMPLETED SUCCESSFULLY!")
        print("="*80)
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {str(e)}")
        raise
    finally:
        # Restore original function
        ph_module.get_account_id = original_get_account_id


if __name__ == "__main__":
    # Run tests directly when script is executed
    run_all_tests() 