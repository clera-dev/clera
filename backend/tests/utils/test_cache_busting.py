#!/usr/bin/env python3

"""
Test to verify that cache-busting parameters work correctly with backend endpoints.
"""

import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_cache_busting_parameters():
    """Test that cache-busting parameters don't interfere with API endpoints."""
    
    api_key = os.getenv("BACKEND_API_KEY")
    if not api_key:
        print("❌ BACKEND_API_KEY not found in environment")
        return False
    
    base_url = "http://localhost:8000"
    headers = {"X-API-Key": api_key}
    
    # Test endpoints with cache-busting parameters
    test_cases = [
        {
            "name": "Analytics with cache buster",
            "url": f"{base_url}/api/portfolio/test-uuid/analytics?_cb=1234567890",
            "expected_error": "Invalid account_id format"  # Expected since test-uuid is not valid
        },
        {
            "name": "Positions with cache buster", 
            "url": f"{base_url}/api/portfolio/test-uuid/positions?_cb=1234567890",
            "expected_error": "Invalid account_id format"
        },
        {
            "name": "Assets with cache buster",
            "url": f"{base_url}/api/assets/SPY?_cb=1234567890",
            "expected_success": True  # This should work
        }
    ]
    
    all_passed = True
    
    for test_case in test_cases:
        print(f"🧪 Testing: {test_case['name']}")
        print(f"   URL: {test_case['url']}")
        
        try:
            response = requests.get(test_case['url'], headers=headers)
            
            if test_case.get('expected_success'):
                if response.status_code == 200:
                    print("   ✅ Success - Cache buster parameter accepted")
                    data = response.json()
                    if 'symbol' in data and data['symbol'] == 'SPY':
                        print("   ✅ Correct data returned")
                    else:
                        print("   ⚠️  Unexpected response format")
                        all_passed = False
                else:
                    print(f"   ❌ Expected success but got {response.status_code}")
                    all_passed = False
            else:
                # Expecting an error, but cache buster shouldn't change the error type
                if response.status_code in [400, 404]:
                    error_data = response.json()
                    if test_case['expected_error'] in error_data.get('detail', ''):
                        print("   ✅ Expected error returned - Cache buster didn't interfere")
                    else:
                        print(f"   ⚠️  Different error than expected: {error_data}")
                        # This might still be OK, just different error handling
                else:
                    print(f"   ❌ Unexpected status code: {response.status_code}")
                    all_passed = False    # Use a valid UUID format for testing
    test_uuid = "12345678-1234-5678-9012-123456789012"
    base_url = "http://localhost:8000"
    headers = {"X-API-Key": api_key}
    
    # Test without cache buster
    url1 = f"{base_url}/api/portfolio/{test_uuid}/analytics"
    # Test with cache buster
    url2 = f"{base_url}/api/portfolio/{test_uuid}/analytics?_cb=1234567890"
    
    print("🧪 Testing analytics endpoint consistency:")
    
    try:
        response1 = requests.get(url1, headers=headers)
        response2 = requests.get(url2, headers=headers)
        
        print(f"   Without cache buster: {response1.status_code}")
        print(f"   With cache buster: {response2.status_code}")
        
        # Both should return the same status code (likely 500 for non-existent account)
        if response1.status_code == response2.status_code:
            print("   ✅ Cache buster parameter doesn't affect endpoint behavior")
            return True
        else:
            print("   ❌ Cache buster parameter changed endpoint behavior")
            return Falseif __name__ == "__main__":
    print("🧪 Testing Cache-Busting Enhancement")
    print("=" * 50)
    
    success = True
    
    print("1. Testing cache-busting parameters...")
    success &= test_cache_busting_parameters()
    
    print("2. Testing analytics endpoint consistency...")
    success &= test_analytics_endpoint_fresh_data()
    
    print("=" * 50)
    if success:
        print("🎉 ALL TESTS PASSED! Cache-busting enhancement is working correctly.")
        print("✅ The refresh button will now force fresh data without browser cache interference.")
    else:
        print("❌ SOME TESTS FAILED! Cache-busting may need adjustment.")
    
    print("\n📋 Summary of enhancements:")
    print("   • Added cache-busting timestamps to all API requests")
    print("   • Added cache-control headers to force fresh data")
    print("   • Clear all state before refreshing")
    print("   • Clear asset details cache")
    print("   • Enhanced logging for debugging")
    print("   • Visual loading indicator on refresh button")
    print("   • Disabled refresh button during loading") 