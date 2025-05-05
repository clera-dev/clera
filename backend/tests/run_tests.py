#!/usr/bin/env python
"""
Test runner script that sets up the environment for complete testing
and generates coverage reports.
"""

import os
import sys
import subprocess
import time
import redis

def ensure_redis_running():
    """Check if Redis is running, and if not, try to start it."""
    try:
        r = redis.Redis(host='localhost', port=6379, db=0)
        r.ping()
        print("✅ Redis is running")
        return True
    except (redis.exceptions.ConnectionError, redis.exceptions.ResponseError):
        print("⚠️ Redis is not running. Attempting to start...")
        try:
            # Try to start Redis using docker
            subprocess.run(
                ["docker", "run", "--name", "clera-test-redis", "-p", "6379:6379", "-d", "redis:alpine"],
                check=True
            )
            time.sleep(2)  # Give Redis a moment to start
            
            # Check if Redis is now running
            r = redis.Redis(host='localhost', port=6379, db=0)
            r.ping()
            print("✅ Redis started successfully")
            return True
        except Exception as e:
            print(f"❌ Failed to start Redis: {e}")
            print("Please start Redis manually before running tests")
            return False

def ensure_websocket_server_running():
    """Check if WebSocket server is running, and if not, start it."""
    import socket
    
    # Try both the standalone WebSocket server port and the combined services port
    ports_to_check = [8001, 8000]  # Add any other potential ports here
    
    for port in ports_to_check:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.settimeout(0.1)
            result = s.connect_ex(('localhost', port))
            if result == 0:
                print(f"✅ WebSocket server is running on port {port}")
                return True
        finally:
            s.close()
    
    print("⚠️ WebSocket server is not running. Please start it in another terminal.")
    print("Command: python -m portfolio_realtime.websocket_server")
    print("Or: python -m portfolio_realtime.run_services")
    return False

def run_tests_with_coverage():
    """Run the tests with coverage reporting."""
    if not ensure_redis_running():
        print("Skipping tests that require Redis")
    
    if not ensure_websocket_server_running():
        print("Skipping tests that require WebSocket server")
    
    # Run tests with coverage
    cmd = [
        "python", "-m", "pytest", 
        "tests/", 
        "-v",
        "--cov=portfolio_realtime",
        "--cov-report=term",
        "--cov-report=html:coverage_report"
    ]
    
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("\n✅ All tests passed!")
    else:
        print("\n❌ Some tests failed")
    
    print("\nCoverage report generated in 'coverage_report' directory")
    print("Open coverage_report/index.html in your browser to view details")

if __name__ == "__main__":
    run_tests_with_coverage() 