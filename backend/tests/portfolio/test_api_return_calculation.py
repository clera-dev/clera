#!/usr/bin/env python3
"""
Test API Return Calculation Logic

This test analyzes why the API is returning all zeros and debugs the calculation logic.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
import json

def fetch_api_return_data(api_url, account_id, api_key=None):
    """Helper to fetch return data from the API."""
    try:
        headers = {"x-api-key": api_key} if api_key else {}
        response = requests.get(
            f"{api_url}/api/portfolio/value?accountId={account_id}",
            headers=headers
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def validate_return_data(data):
    """Helper to validate and print return data."""
    if "error" in data:
        print(f"API error: {data['error']}")
        return False
    print(json.dumps(data, indent=2))
    raw_value = data.get('raw_value', 0)
    raw_return = data.get('raw_return', 0)
    if raw_value == 0:
        print(f"   🚨 ISSUE: raw_value is 0 - broker connection or account lookup failed")
    if raw_return == 0:
        print(f"   🚨 ISSUE: raw_return is 0 - calculation returned 0")
    return True

def test_api_return_calculation():
    """Test and debug the API return calculation"""
    api_url = os.getenv("BACKEND_API_URL", "http://localhost:8000")
    account_id = os.getenv("TEST_ALPACA_ACCOUNT_ID")
    api_key = os.getenv("BACKEND_API_KEY")
    if not account_id or not api_key:
        raise RuntimeError("Required environment variables not set.")
    print(f"🔍 API RETURN CALCULATION DEBUG for account {account_id}")
    print("=" * 80)
    print(f"\n1️⃣ TESTING API ENDPOINT:")
    print("-" * 50)
    data = fetch_api_return_data(api_url, account_id, api_key)
    assert validate_return_data(data)
    print(f"\n4️⃣ SERVER HEALTH CHECK:")
    print("-" * 50)
    try:
        health_response = requests.get(f"{api_url}/")
        print(f"   Root endpoint: {health_response.status_code}")
    except Exception as e:
        print(f"   Health check failed: {e}")

if __name__ == "__main__":
    test_api_return_calculation() 