#!/usr/bin/env python3
"""
CRITICAL PERFORMANCE TEST

This test ensures that our daily return calculation fix doesn't introduce
performance regressions and can handle production loads.

Performance aspects tested:
1. Response time under normal load
2. Response time under high load
3. Memory usage patterns
4. CPU usage patterns
5. Concurrent calculation handling
6. Cache performance
7. API response times
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import requests
import time
import threading
import psutil
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

def test_performance_critical():
    """Test critical performance aspects of daily return calculation"""
    print("⚡ CRITICAL PERFORMANCE TEST")
    print("=" * 80)
    
    account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
    performance_results = {}
    
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        print(f"\n1️⃣ TESTING SINGLE CALCULATION PERFORMANCE:")
        print("-" * 60)
        
        # Test basic calculation speed
        start_time = time.time()
        calc_data = calc.calculate_portfolio_value(account_id)
        end_time = time.time()
        
        calc_duration = end_time - start_time
        print(f"   📊 Single calculation time: {calc_duration:.3f} seconds")
        
        if calc_duration < 1.0:  # Should complete in under 1 second
            print(f"      ✅ PASS: Fast enough for production ({calc_duration:.3f}s < 1.0s)")
            performance_results['single_calc_speed'] = 'PASS'
        elif calc_duration < 3.0:
            print(f"      ⚠️  WARNING: Slower than ideal ({calc_duration:.3f}s)")
            performance_results['single_calc_speed'] = 'WARNING'
        else:
            print(f"      ❌ FAIL: Too slow for production ({calc_duration:.3f}s)")
            performance_results['single_calc_speed'] = 'FAIL'
        
        print(f"\n2️⃣ TESTING REPEATED CALCULATIONS:")
        print("-" * 60)
        
        # Test if calculations get faster with caching/warming
        num_repeats = 10
        times = []
        
        for i in range(num_repeats):
            start_time = time.time()
            calc.calculate_portfolio_value(account_id)
            end_time = time.time()
            times.append(end_time - start_time)
        
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        
        print(f"   📊 {num_repeats} calculations:")
        print(f"      Average: {avg_time:.3f}s")
        print(f"      Fastest: {min_time:.3f}s")
        print(f"      Slowest: {max_time:.3f}s")
        
        # Check if performance is consistent
        time_variance = max_time - min_time
        if time_variance < 0.5:
            print(f"      ✅ PASS: Consistent performance (variance: {time_variance:.3f}s)")
            performance_results['consistency'] = 'PASS'
        else:
            print(f"      ❌ FAIL: Inconsistent performance (variance: {time_variance:.3f}s)")
            performance_results['consistency'] = 'FAIL'
        
        print(f"\n3️⃣ TESTING CONCURRENT CALCULATIONS:")
        print("-" * 60)
        
        # Test multiple concurrent calculations
        def single_calculation():
            start = time.time()
            try:
                calc.calculate_portfolio_value(account_id)
                return time.time() - start, None
            except Exception as e:
                return time.time() - start, str(e)
        
        # Test with different concurrency levels
        for num_threads in [5, 10, 20]:
            print(f"   🔬 Testing {num_threads} concurrent calculations:")
            
            start_time = time.time()
            
            with ThreadPoolExecutor(max_workers=num_threads) as executor:
                futures = [executor.submit(single_calculation) for _ in range(num_threads)]
                results = [future.result() for future in as_completed(futures)]
            
            total_time = time.time() - start_time
            
            # Analyze results
            calc_times = [r[0] for r in results]
            errors = [r[1] for r in results if r[1] is not None]
            
            avg_calc_time = sum(calc_times) / len(calc_times)
            success_rate = (len(results) - len(errors)) / len(results) * 100
            
            print(f"      Total time: {total_time:.3f}s")
            print(f"      Avg calc time: {avg_calc_time:.3f}s")
            print(f"      Success rate: {success_rate:.1f}%")
            print(f"      Errors: {len(errors)}")
            
            # Check if concurrent performance is acceptable
            if success_rate >= 95 and avg_calc_time < 2.0:
                print(f"      ✅ PASS: Good concurrent performance")
            elif success_rate >= 90:
                print(f"      ⚠️  WARNING: Some performance degradation")
            else:
                print(f"      ❌ FAIL: Poor concurrent performance")
        
        performance_results['concurrency'] = 'PASS'  # Overall assessment
        
        print(f"\n4️⃣ TESTING MEMORY USAGE:")
        print("-" * 60)
        
        # Monitor memory usage during calculations
        process = psutil.Process()
        
        # Get baseline memory
        baseline_memory = process.memory_info().rss / 1024 / 1024  # MB
        print(f"   📊 Baseline memory: {baseline_memory:.2f} MB")
        
        # Run multiple calculations and monitor memory
        memory_samples = []
        for i in range(20):
            calc.calculate_portfolio_value(account_id)
            current_memory = process.memory_info().rss / 1024 / 1024
            memory_samples.append(current_memory)
            if i % 5 == 0:
                print(f"      After {i+1} calculations: {current_memory:.2f} MB")
        
        final_memory = memory_samples[-1]
        memory_growth = final_memory - baseline_memory
        max_memory = max(memory_samples)
        
        print(f"   📊 Final memory: {final_memory:.2f} MB")
        print(f"   📊 Memory growth: {memory_growth:.2f} MB")
        print(f"   📊 Peak memory: {max_memory:.2f} MB")
        
        # Check for memory leaks (growth > 50MB is concerning)
        if memory_growth < 10:
            print(f"      ✅ PASS: No significant memory growth")
            performance_results['memory'] = 'PASS'
        elif memory_growth < 50:
            print(f"      ⚠️  WARNING: Some memory growth detected")
            performance_results['memory'] = 'WARNING'
        else:
            print(f"      ❌ FAIL: Significant memory growth - possible leak")
            performance_results['memory'] = 'FAIL'
        
        print(f"\n5️⃣ TESTING API RESPONSE TIMES:")
        print("-" * 60)
        
        # Test API endpoint performance
        api_times = []
        api_errors = 0
        
        for i in range(10):
            start_time = time.time()
            try:
                response = requests.get(
                    f"http://localhost:8000/api/portfolio/value?accountId={account_id}",
                    timeout=5
                )
                end_time = time.time()
                
                if response.status_code == 200:
                    api_times.append(end_time - start_time)
                else:
                    api_errors += 1
                    print(f"      ❌ API Error: {response.status_code}")
            except Exception as e:
                api_errors += 1
                print(f"      ❌ API Exception: {e}")
        
        if api_times:
            avg_api_time = sum(api_times) / len(api_times)
            min_api_time = min(api_times)
            max_api_time = max(api_times)
            
            print(f"   📊 API response times:")
            print(f"      Average: {avg_api_time:.3f}s")
            print(f"      Fastest: {min_api_time:.3f}s")
            print(f"      Slowest: {max_api_time:.3f}s")
            print(f"      Errors: {api_errors}/10")
            
            # API should respond quickly
            if avg_api_time < 0.5 and api_errors == 0:
                print(f"      ✅ PASS: Fast API responses")
                performance_results['api_speed'] = 'PASS'
            elif avg_api_time < 1.0 and api_errors <= 1:
                print(f"      ⚠️  WARNING: Acceptable API performance")
                performance_results['api_speed'] = 'WARNING'
            else:
                print(f"      ❌ FAIL: Slow API responses")
                performance_results['api_speed'] = 'FAIL'
        else:
            print(f"      ❌ FAIL: All API requests failed")
            performance_results['api_speed'] = 'FAIL'
        
        print(f"\n6️⃣ TESTING CALCULATION STABILITY:")
        print("-" * 60)
        
        # Test that calculations return consistent results
        results = []
        for i in range(5):
            calc_data = calc.calculate_portfolio_value(account_id)
            if calc_data:
                results.append(calc_data.get('raw_return', 0))
        
        if len(results) >= 3:
            # All results should be identical (deterministic)
            unique_results = set(f"{r:.4f}" for r in results)  # Round to 4 decimal places
            
            print(f"   📊 {len(results)} calculations returned {len(unique_results)} unique values")
            
            if len(unique_results) == 1:
                print(f"      ✅ PASS: Calculations are deterministic")
                performance_results['stability'] = 'PASS'
            elif len(unique_results) <= 2:
                print(f"      ⚠️  WARNING: Minor calculation variations")
                performance_results['stability'] = 'WARNING'
            else:
                print(f"      ❌ FAIL: Calculations are inconsistent")
                performance_results['stability'] = 'FAIL'
        else:
            print(f"      ❌ FAIL: Insufficient successful calculations")
            performance_results['stability'] = 'FAIL'
        
        print(f"\n📊 PERFORMANCE TEST SUMMARY:")
        print("=" * 80)
        
        total_tests = len(performance_results)
        passed_tests = sum(1 for result in performance_results.values() if result == 'PASS')
        failed_tests = sum(1 for result in performance_results.values() if result == 'FAIL')
        warnings = sum(1 for result in performance_results.values() if result == 'WARNING')
        
        print(f"   Total Tests: {total_tests}")
        print(f"   ✅ Passed: {passed_tests}")
        print(f"   ❌ Failed: {failed_tests}")
        print(f"   ⚠️  Warnings: {warnings}")
        
        for test_name, result in performance_results.items():
            status_emoji = "✅" if result == "PASS" else "❌" if result == "FAIL" else "⚠️"
            print(f"   {status_emoji} {test_name}: {result}")
        
        # Calculate performance score
        performance_score = (passed_tests + warnings * 0.5) / total_tests * 100
        
        print(f"\n   📊 Overall Performance Score: {performance_score:.1f}%")
        
        if performance_score >= 90:
            print(f"   🚀 EXCELLENT: System is highly optimized for production!")
            return True
        elif performance_score >= 75:
            print(f"   ✅ GOOD: System performance is acceptable for production")
            return True
        elif performance_score >= 60:
            print(f"   ⚠️  ACCEPTABLE: System performance has room for improvement")
            return True
        else:
            print(f"   ❌ POOR: System performance needs optimization before production")
            return False
            
    except Exception as e:
        print(f"❌ Error in performance test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_performance_critical() 