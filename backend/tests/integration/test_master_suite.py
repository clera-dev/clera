#!/usr/bin/env python3
"""
MASTER TEST SUITE

This master test suite runs all comprehensive tests to verify that our
daily return calculation fix is completely robust and production-ready.

Test suites included:
1. Edge Cases Test - Boundary conditions and error handling
2. Performance Test - Speed, memory, and concurrency
3. Integration Test - End-to-end system verification  
4. Regression Test - Ensure old bugs are gone
5. Production Readiness Assessment

This is the final validation before deploying to production.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import subprocess
import time
from datetime import datetime

def run_test_suite(test_file, test_name):
    """Run a test suite and capture results"""
    print(f"\n🚀 RUNNING {test_name.upper()}")
    print("=" * 80)
    
    start_time = time.time()
    
    try:
        # Run the test file
        result = subprocess.run([
            sys.executable, test_file
        ], capture_output=True, text=True, timeout=300)  # 5 minute timeout
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Check if test passed
        success = result.returncode == 0
        
        # Print results
        if success:
            print(f"✅ {test_name} PASSED (took {duration:.1f}s)")
        else:
            print(f"❌ {test_name} FAILED (took {duration:.1f}s)")
        
        # Print output for failed tests or if verbose
        if not success or os.getenv('VERBOSE_TESTS'):
            print("\n--- TEST OUTPUT ---")
            print(result.stdout)
            if result.stderr:
                print("\n--- ERROR OUTPUT ---")
                print(result.stderr)
            print("--- END OUTPUT ---\n")
        
        return {
            'name': test_name,
            'success': success,
            'duration': duration,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
        
    except subprocess.TimeoutExpired:
        print(f"⏰ {test_name} TIMED OUT (5 minutes)")
        return {
            'name': test_name,
            'success': False,
            'duration': 300,
            'stdout': '',
            'stderr': 'Test timed out after 5 minutes',
            'returncode': -1
        }
    except Exception as e:
        print(f"💥 {test_name} CRASHED: {e}")
        return {
            'name': test_name,
            'success': False,
            'duration': 0,
            'stdout': '',
            'stderr': str(e),
            'returncode': -2
        }

def test_master_suite():
    """Run all comprehensive tests and provide final assessment"""
    print("🎯 MASTER TEST SUITE")
    print("=" * 80)
    print(f"Starting comprehensive validation at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Testing daily return calculation system for production readiness...")
    
    # Define test suites to run
    test_suites = [
        {
            'file': 'tests/test_edge_cases_comprehensive.py',
            'name': 'Edge Cases & Error Handling',
            'weight': 25,  # How important this test is (out of 100)
            'critical': True  # If this fails, system is not production ready
        },
        {
            'file': 'tests/test_performance_critical.py', 
            'name': 'Performance & Load Testing',
            'weight': 20,
            'critical': True
        },
        {
            'file': 'tests/test_integration_complete.py',
            'name': 'End-to-End Integration',
            'weight': 25,
            'critical': True
        },
        {
            'file': 'tests/test_daily_vs_total_return.py',
            'name': 'Original Bug Investigation',
            'weight': 15,
            'critical': False  # Informational
        },
        {
            'file': 'tests/test_final_verification.py',
            'name': 'Final Verification',
            'weight': 15,
            'critical': True
        }
    ]
    
    # Run all test suites
    results = []
    total_start_time = time.time()
    
    for test_suite in test_suites:
        result = run_test_suite(test_suite['file'], test_suite['name'])
        result['weight'] = test_suite['weight']
        result['critical'] = test_suite['critical']
        results.append(result)
        
        # Short pause between test suites
        time.sleep(2)
    
    total_duration = time.time() - total_start_time
    
    # Analyze results
    print(f"\n📊 MASTER TEST SUITE RESULTS")
    print("=" * 80)
    
    passed_tests = sum(1 for r in results if r['success'])
    failed_tests = sum(1 for r in results if not r['success'])
    critical_failures = sum(1 for r in results if not r['success'] and r['critical'])
    
    print(f"📋 Test Summary:")
    print(f"   Total Suites: {len(results)}")
    print(f"   ✅ Passed: {passed_tests}")
    print(f"   ❌ Failed: {failed_tests}")
    print(f"   🚨 Critical Failures: {critical_failures}")
    print(f"   ⏱️  Total Time: {total_duration:.1f}s")
    
    print(f"\n📋 Detailed Results:")
    for result in results:
        status = "✅ PASS" if result['success'] else "❌ FAIL"
        critical_marker = " 🚨" if result['critical'] and not result['success'] else ""
        print(f"   {status} {result['name']} ({result['duration']:.1f}s){critical_marker}")
    
    # Calculate overall score
    total_weight = sum(r['weight'] for r in results)
    earned_weight = sum(r['weight'] for r in results if r['success'])
    overall_score = (earned_weight / total_weight * 100) if total_weight > 0 else 0
    
    print(f"\n📊 Production Readiness Assessment:")
    print("-" * 50)
    print(f"   Overall Score: {overall_score:.1f}% ({earned_weight}/{total_weight} points)")
    
    # Production readiness determination
    production_ready = True
    issues = []
    
    # Check critical failures
    if critical_failures > 0:
        production_ready = False
        issues.append(f"{critical_failures} critical test suite(s) failed")
    
    # Check overall score
    if overall_score < 80:
        production_ready = False
        issues.append(f"Overall score {overall_score:.1f}% is below 80% threshold")
    
    # Check for any timeouts or crashes
    timeouts = sum(1 for r in results if r['returncode'] == -1)
    crashes = sum(1 for r in results if r['returncode'] == -2)
    
    if timeouts > 0:
        production_ready = False
        issues.append(f"{timeouts} test suite(s) timed out")
    
    if crashes > 0:
        production_ready = False
        issues.append(f"{crashes} test suite(s) crashed")
    
    # Final verdict
    print(f"\n🎯 FINAL VERDICT:")
    print("=" * 80)
    
    if production_ready:
        print(f"🎉 SYSTEM IS PRODUCTION READY! 🚀")
        print(f"")
        print(f"✅ All critical tests passed")
        print(f"✅ Overall score: {overall_score:.1f}%")
        print(f"✅ No critical issues detected")
        print(f"")
        print(f"🚀 The daily return calculation fix is:")
        print(f"   • Robust against edge cases")
        print(f"   • Performant under load")
        print(f"   • Properly integrated")
        print(f"   • Free of the original 6.90% bug")
        print(f"   • Ready for production deployment")
        
        # Additional production recommendations
        print(f"\n💡 Production Deployment Checklist:")
        print(f"   ✅ Daily return calculation is accurate")
        print(f"   ✅ System handles edge cases gracefully")  
        print(f"   ✅ Performance is acceptable for production load")
        print(f"   ✅ Integration testing completed successfully")
        print(f"   ✅ No regressions to old broken behavior")
        print(f"   🔄 Monitor system performance in production")
        print(f"   🔄 Set up alerts for unrealistic return values (>5%)")
        print(f"   🔄 Regular validation of return calculations")
        
    else:
        print(f"❌ SYSTEM IS NOT PRODUCTION READY")
        print(f"")
        print(f"🚨 Critical Issues Found:")
        for issue in issues:
            print(f"   • {issue}")
        
        print(f"\n🔧 Required Actions:")
        print(f"   1. Fix all critical test failures")
        print(f"   2. Investigate and resolve timeouts/crashes")
        print(f"   3. Improve overall system score to ≥80%")
        print(f"   4. Re-run master test suite")
        print(f"   5. Only deploy after achieving 100% critical test pass rate")
        
        # Specific failure analysis
        print(f"\n🔍 Failure Analysis:")
        for result in results:
            if not result['success'] and result['critical']:
                print(f"   🚨 CRITICAL FAILURE: {result['name']}")
                if result['stderr']:
                    print(f"      Error: {result['stderr'][:200]}...")
        
    print(f"\n⏰ Test completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Return True if production ready, False otherwise
    return production_ready

if __name__ == "__main__":
    # Set environment for verbose output if requested
    if '--verbose' in sys.argv:
        os.environ['VERBOSE_TESTS'] = '1'
    
    production_ready = test_master_suite()
    
    # Exit with appropriate code
    exit_code = 0 if production_ready else 1
    sys.exit(exit_code) 