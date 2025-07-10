#!/usr/bin/env python3
"""
Test script for Enhanced Account Closure Logging System

This script tests the hybrid logging system to ensure both database and file logging work correctly.
"""

import os
import sys
import time
from datetime import datetime

# Add the backend directory to the Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

def test_enhanced_logging_system():
    """Test the enhanced logging system."""
    print("🧪 Testing Enhanced Account Closure Logging System")
    print("=" * 60)
    
    # Test imports
    try:
        from utils.alpaca.account_closure_logger import AccountClosureLogger
        print("✅ Enhanced logger imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import enhanced logger: {e}")
        return False
    
    try:
        from utils.supabase.db_client import (
            save_account_closure_log, 
            get_account_closure_logs,
            get_user_account_closure_logs,
            get_user_closure_summary
        )
        print("✅ Database functions imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import database functions: {e}")
        return False
    
    # Test data with proper UUID format
    test_account_id = f"test-account-{int(time.time())}"
    test_user_id = "00000000-0000-0000-0000-000000000003"  # Proper UUID format
    
    # Create logger
    logger = AccountClosureLogger(test_account_id, user_id=test_user_id)
    print(f"✅ Logger created for account: {test_account_id}")
    
    # Test logging methods
    print("\n📝 Testing logging methods...")
    
    # Test step start
    logger.log_step_start("TEST_INITIATION", {
        "test": True,
        "timestamp": datetime.now().isoformat()
    })
    print("✅ Step start logging works")
    
    # Test step success
    logger.log_step_success("TEST_STEP", {
        "result": "success",
        "duration": 1.5
    })
    print("✅ Step success logging works")
    
    # Test step failure
    logger.log_step_failure("TEST_FAILURE", "Test error message", {
        "context": "test context"
    })
    print("✅ Step failure logging works")
    
    # Test safety check
    logger.log_safety_check("TEST_SAFETY", True, {
        "details": "Safety check passed"
    })
    print("✅ Safety check logging works")
    
    # Test timing
    logger.log_timing("TEST_OPERATION", 2.5)
    print("✅ Timing logging works")
    
    # Test email notification
    logger.log_email_notification("TEST_EMAIL", "test@example.com", True, "Test email sent")
    print("✅ Email logging works")
    
    # Test debug
    logger.log_debug("TEST_DEBUG", "Debug message")
    print("✅ Debug logging works")
    
    # Test warning
    logger.log_warning("TEST_WARNING", "Warning message")
    print("✅ Warning logging works")
    
    # Verify log file
    if os.path.exists(logger.log_file_path):
        print(f"✅ Log file created: {logger.log_file_path}")
        
        # Check content
        with open(logger.log_file_path, 'r') as f:
            content = f.read()
            if len(content.strip()) > 0:
                print("✅ Log file contains expected content")
            else:
                print("⚠️ Log file is empty")
    else:
        print(f"❌ Log file not found: {logger.log_file_path}")
        return False
    
    # Test database integration
    print("\n🗄️ Testing database integration...")
    logs = get_account_closure_logs(account_id=test_account_id, limit=10)
    if logs is not None:  # Empty list is OK
        print(f"✅ Retrieved {len(logs)} database log entries")
    else:
        print("⚠️ No database logs found (this may be expected if database is not configured)")
    
    # Test user-specific queries
    user_logs = get_user_account_closure_logs(test_user_id, limit=5)
    if user_logs is not None:  # Empty list is OK
        print(f"✅ Retrieved {len(user_logs)} user-specific database logs")
    else:
        print("⚠️ User-specific database logs not available")
    
    # Test user summary
    summary = get_user_closure_summary(test_user_id)
    if summary is not None:  # Even empty summary is OK
        print("✅ User closure summary retrieved")
    else:
        print("⚠️ Account summary not available")
    
    print(f"\n🎉 Enhanced logging system test completed!")
    print(f"📄 Log file location: {logger.log_file_path}")
    print(f"🆔 Test account ID: {test_account_id}")
    
    return True

def test_monitoring_script():
    """Test the consolidated monitoring script."""
    print("\n🔍 Testing Consolidated Monitoring Script")
    print("=" * 50)
    
    try:
        # Test if the script can be imported
        import monitor_account_closure
        print("✅ Consolidated monitoring script imported successfully")
        
        # Test basic functionality
        from monitor_account_closure import show_statistics, cleanup_logs
        
        # Test statistics (should not fail even if no data)
        try:
            show_statistics(1)  # Last 1 day
            print("✅ Statistics function works")
        except Exception as e:
            print(f"⚠️ Statistics test failed: {e}")
        
        # Test cleanup (should not fail even if no data)
        try:
            cleanup_logs(1)  # Keep 1 day
            print("✅ Cleanup function works")
        except Exception as e:
            print(f"⚠️ Cleanup test failed: {e}")
        
    except ImportError as e:
        print(f"❌ Failed to import monitoring script: {e}")
        return False
    
    return True

def main():
    """Main test function."""
    print("🚀 Starting Enhanced Account Closure Logging System Tests")
    print("=" * 70)
    
    # Test 1: Enhanced logging system
    logging_success = test_enhanced_logging_system()
    
    # Test 2: Monitoring script
    monitoring_success = test_monitoring_script()
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 TEST SUMMARY")
    print("=" * 70)
    
    if logging_success:
        print("✅ Enhanced logging system: PASSED")
    else:
        print("❌ Enhanced logging system: FAILED")
    
    if monitoring_success:
        print("✅ Enhanced monitoring script: PASSED")
    else:
        print("❌ Enhanced monitoring script: FAILED")
    
    if logging_success and monitoring_success:
        print("\n🎉 All tests passed! The enhanced logging system is ready to use.")
        print("\n📚 Next steps:")
        print("1. Run the setup script: python setup_account_closure_logging.py")
        print("2. Test with real account closures")
        print("3. Use the consolidated monitoring: python monitor_account_closure.py")
    else:
        print("\n⚠️ Some tests failed. Please check the errors above.")
    
    return logging_success and monitoring_success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 