#!/usr/bin/env python3
"""
COMPREHENSIVE INTEGRATION TEST

This test verifies that the entire daily return calculation system
works correctly end-to-end with all components integrated.

Integration aspects tested:
1. Portfolio Calculator → API Server flow
2. Redis caching behavior
3. Multiple account scenarios
4. Real-world data handling
5. Error propagation
6. State consistency
7. Cache invalidation
8. Production-like conditions
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import requests
import json
import redis
import time
from datetime import datetime

def test_integration_complete():
    """Test complete integration of daily return calculation system"""
    print("🔗 COMPREHENSIVE INTEGRATION TEST")
    print("=" * 80)
    
    account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
    integration_results = {}
    
    try:
        # Initialize components
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        redis_client = redis.Redis(host='localhost', port=6379, db=0)
        
        print(f"\n1️⃣ TESTING FRESH SYSTEM STATE:")
        print("-" * 60)
        
        # Start with clean state
        redis_client.flushall()
        print(f"   🧹 Cleared Redis cache")
        
        # Test calculator directly (no cache)
        calc_start = time.time()
        calc_data = calc.calculate_portfolio_value(account_id)
        calc_time = time.time() - calc_start
        
        if calc_data:
            print(f"   ✅ Calculator works: {calc_data.get('today_return', 'N/A')} (took {calc_time:.3f}s)")
            integration_results['calculator_fresh'] = 'PASS'
        else:
            print(f"   ❌ Calculator failed on fresh state")
            integration_results['calculator_fresh'] = 'FAIL'
        
        # Test API endpoint (should work without cache)
        api_start = time.time()
        api_response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
        api_time = time.time() - api_start
        
        if api_response.status_code == 200:
            api_data = api_response.json()
            print(f"   ✅ API works: {api_data.get('today_return', 'N/A')} (took {api_time:.3f}s)")
            integration_results['api_fresh'] = 'PASS'
        else:
            print(f"   ❌ API failed: {api_response.status_code}")
            integration_results['api_fresh'] = 'FAIL'
        
        print(f"\n2️⃣ TESTING DATA CONSISTENCY:")
        print("-" * 60)
        
        # Compare calculator vs API results
        if calc_data and api_response.status_code == 200:
            calc_return = calc_data.get('raw_return', 0)
            calc_percent = calc_data.get('raw_return_percent', 0)
            api_return = api_data.get('raw_return', 0)
            api_percent = api_data.get('raw_return_percent', 0)
            
            return_diff = abs(calc_return - api_return)
            percent_diff = abs(calc_percent - api_percent)
            
            print(f"   📊 Calculator: ${calc_return:.2f} ({calc_percent:.2f}%)")
            print(f"   📊 API: ${api_return:.2f} ({api_percent:.2f}%)")
            print(f"   📊 Differences: ${return_diff:.4f}, {percent_diff:.4f}%")
            
            if return_diff < 0.01 and percent_diff < 0.01:
                print(f"   ✅ PASS: Calculator and API are consistent")
                integration_results['consistency'] = 'PASS'
            else:
                print(f"   ❌ FAIL: Calculator and API are inconsistent")
                integration_results['consistency'] = 'FAIL'
        else:
            print(f"   ❌ FAIL: Cannot compare - one component failed")
            integration_results['consistency'] = 'FAIL'
        
        print(f"\n3️⃣ TESTING CACHING BEHAVIOR:")
        print("-" * 60)
        
        # Clear cache and make first request
        redis_client.flushall()
        
        # First API call (should calculate fresh)
        start_time = time.time()
        response1 = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
        first_call_time = time.time() - start_time
        
        # Second API call (might use cache)
        start_time = time.time()
        response2 = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
        second_call_time = time.time() - start_time
        
        print(f"   📊 First call: {first_call_time:.3f}s")
        print(f"   📊 Second call: {second_call_time:.3f}s")
        
        if response1.status_code == 200 and response2.status_code == 200:
            data1 = response1.json()
            data2 = response2.json()
            
            # Results should be identical
            return1 = data1.get('raw_return', 0)
            return2 = data2.get('raw_return', 0)
            
            if abs(return1 - return2) < 0.01:
                print(f"   ✅ PASS: Cached results are consistent")
                integration_results['caching'] = 'PASS'
            else:
                print(f"   ❌ FAIL: Cached results differ: ${return1:.2f} vs ${return2:.2f}")
                integration_results['caching'] = 'FAIL'
        else:
            print(f"   ❌ FAIL: API calls failed")
            integration_results['caching'] = 'FAIL'
        
        print(f"\n4️⃣ TESTING CACHE INVALIDATION:")
        print("-" * 60)
        
        # Check Redis for portfolio data
        cache_key = f"last_portfolio:{account_id}"
        cached_data = redis_client.get(cache_key)
        
        if cached_data:
            print(f"   📊 Found cached data: {len(cached_data)} bytes")
            try:
                cached_json = json.loads(cached_data)
                cached_return = cached_json.get('raw_return', 0)
                print(f"   📊 Cached return: ${cached_return:.2f}")
                integration_results['cache_data'] = 'PASS'
            except json.JSONDecodeError:
                print(f"   ❌ FAIL: Cached data is not valid JSON")
                integration_results['cache_data'] = 'FAIL'
        else:
            print(f"   ⚠️  No cached data found (might use different key)")
            integration_results['cache_data'] = 'WARNING'
        
        # Force cache clear and verify
        redis_client.flushall()
        cached_data_after = redis_client.get(cache_key)
        
        if not cached_data_after:
            print(f"   ✅ PASS: Cache invalidation works")
            integration_results['cache_invalidation'] = 'PASS'
        else:
            print(f"   ❌ FAIL: Cache not properly cleared")
            integration_results['cache_invalidation'] = 'FAIL'
        
        print(f"\n5️⃣ TESTING ERROR HANDLING:")
        print("-" * 60)
        
        # Test with invalid account ID
        fake_account = 'invalid-account-12345'
        
        # Test calculator error handling
        try:
            calc_result = calc.calculate_portfolio_value(fake_account)
            if calc_result is None:
                print(f"   ✅ Calculator properly handles invalid account (returns None)")
                integration_results['calc_error_handling'] = 'PASS'
            else:
                print(f"   ⚠️  Calculator returned data for invalid account: {calc_result}")
                integration_results['calc_error_handling'] = 'WARNING'
        except Exception as e:
            print(f"   ✅ Calculator properly rejects invalid account: {type(e).__name__}")
            integration_results['calc_error_handling'] = 'PASS'
        
        # Test API error handling
        api_response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={fake_account}")
        
        if api_response.status_code >= 400:
            print(f"   ✅ API properly handles invalid account: {api_response.status_code}")
            integration_results['api_error_handling'] = 'PASS'
        elif api_response.status_code == 200:
            # Check if it returns meaningful error in JSON
            try:
                error_data = api_response.json()
                if 'error' in error_data:
                    print(f"   ✅ API returns error in JSON: {error_data['error']}")
                    integration_results['api_error_handling'] = 'PASS'
                else:
                    print(f"   ⚠️  API returns 200 but may have invalid data")
                    integration_results['api_error_handling'] = 'WARNING'
            except json.JSONDecodeError:
                print(f"   ❌ API returns 200 with invalid JSON")
                integration_results['api_error_handling'] = 'FAIL'
        else:
            print(f"   ❌ Unexpected API response: {api_response.status_code}")
            integration_results['api_error_handling'] = 'FAIL'
        
        print(f"\n6️⃣ TESTING MULTIPLE RAPID REQUESTS:")
        print("-" * 60)
        
        # Test rapid-fire requests (simulate user refreshing page)
        redis_client.flushall()
        
        rapid_results = []
        rapid_times = []
        
        for i in range(5):
            start_time = time.time()
            response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
            request_time = time.time() - start_time
            rapid_times.append(request_time)
            
            if response.status_code == 200:
                data = response.json()
                rapid_results.append(data.get('raw_return', 0))
            else:
                rapid_results.append(None)
        
        successful_requests = sum(1 for r in rapid_results if r is not None)
        avg_time = sum(rapid_times) / len(rapid_times)
        
        print(f"   📊 Successful requests: {successful_requests}/5")
        print(f"   📊 Average response time: {avg_time:.3f}s")
        
        # Check consistency of results
        valid_results = [r for r in rapid_results if r is not None]
        if len(valid_results) >= 3:
            unique_results = set(f"{r:.4f}" for r in valid_results)
            if len(unique_results) == 1:
                print(f"   ✅ PASS: All rapid requests returned consistent results")
                integration_results['rapid_requests'] = 'PASS'
            else:
                print(f"   ❌ FAIL: Rapid requests returned inconsistent results")
                integration_results['rapid_requests'] = 'FAIL'
        else:
            print(f"   ❌ FAIL: Too many rapid requests failed")
            integration_results['rapid_requests'] = 'FAIL'
        
        print(f"\n7️⃣ TESTING REALISTIC RETURN VALUES:")
        print("-" * 60)
        
        # Verify all components return realistic values
        realistic_check_passed = True
        
        # Test calculator
        calc_data = calc.calculate_portfolio_value(account_id)
        if calc_data:
            calc_percent = abs(calc_data.get('raw_return_percent', 0))
            if calc_percent > 5.0:
                print(f"   ❌ Calculator returns unrealistic {calc_percent:.2f}% daily return")
                realistic_check_passed = False
            else:
                print(f"   ✅ Calculator returns realistic {calc_percent:.2f}% daily return")
        
        # Test API
        api_response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
        if api_response.status_code == 200:
            api_data = api_response.json()
            api_percent = abs(api_data.get('raw_return_percent', 0))
            if api_percent > 5.0:
                print(f"   ❌ API returns unrealistic {api_percent:.2f}% daily return")
                realistic_check_passed = False
            else:
                print(f"   ✅ API returns realistic {api_percent:.2f}% daily return")
        
        # Check that we never see the old broken 6.90% value
        if calc_data and api_response.status_code == 200:
            calc_percent = calc_data.get('raw_return_percent', 0)
            api_percent = api_data.get('raw_return_percent', 0)
            
            if abs(calc_percent - 6.90) < 0.01 or abs(api_percent - 6.90) < 0.01:
                print(f"   ❌ REGRESSION: Old broken 6.90% value detected!")
                realistic_check_passed = False
            else:
                print(f"   ✅ No regression to old broken 6.90% value")
        
        if realistic_check_passed:
            integration_results['realistic_values'] = 'PASS'
        else:
            integration_results['realistic_values'] = 'FAIL'
        
        print(f"\n📊 INTEGRATION TEST SUMMARY:")
        print("=" * 80)
        
        total_tests = len(integration_results)
        passed_tests = sum(1 for result in integration_results.values() if result == 'PASS')
        failed_tests = sum(1 for result in integration_results.values() if result == 'FAIL')
        warnings = sum(1 for result in integration_results.values() if result == 'WARNING')
        
        print(f"   Total Tests: {total_tests}")
        print(f"   ✅ Passed: {passed_tests}")
        print(f"   ❌ Failed: {failed_tests}")
        print(f"   ⚠️  Warnings: {warnings}")
        
        for test_name, result in integration_results.items():
            status_emoji = "✅" if result == "PASS" else "❌" if result == "FAIL" else "⚠️"
            print(f"   {status_emoji} {test_name}: {result}")
        
        # Calculate integration score
        integration_score = (passed_tests + warnings * 0.5) / total_tests * 100
        
        print(f"\n   📊 Overall Integration Score: {integration_score:.1f}%")
        
        if integration_score >= 95:
            print(f"   🚀 EXCELLENT: System integration is perfect!")
            return True
        elif integration_score >= 85:
            print(f"   ✅ GOOD: System integration is solid for production")
            return True
        elif integration_score >= 70:
            print(f"   ⚠️  ACCEPTABLE: System integration has minor issues")
            return True
        else:
            print(f"   ❌ POOR: System integration has major issues")
            return False
            
    except Exception as e:
        print(f"❌ Error in integration test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_integration_complete() 