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

def test_api_return_calculation():
    """Test and debug the API return calculation"""
    try:
        account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
        print(f"🔍 API RETURN CALCULATION DEBUG for account {account_id}")
        print("=" * 80)
        
        # Test the API endpoint
        print(f"\n1️⃣ TESTING API ENDPOINT:")
        print("-" * 50)
        
        response = requests.get(f"http://localhost:8000/api/portfolio/value?accountId={account_id}")
        
        if response.status_code == 200:
            api_data = response.json()
            print(f"   Status: SUCCESS ({response.status_code})")
            print(f"   Response:")
            for key, value in api_data.items():
                print(f"      {key}: {value}")
        else:
            print(f"   Status: ERROR ({response.status_code})")
            print(f"   Response: {response.text}")
            
        # Analyze the problem
        print(f"\n2️⃣ PROBLEM ANALYSIS:")
        print("-" * 50)
        
        if response.status_code == 200:
            raw_value = api_data.get('raw_value', 0)
            raw_return = api_data.get('raw_return', 0)
            
            if raw_value == 0:
                print(f"   🚨 ISSUE: raw_value is 0 - broker connection or account lookup failed")
                print(f"   💡 This means account.equity returned 0 or broker_client failed")
                
            if raw_return == 0:
                print(f"   🚨 ISSUE: raw_return is 0 - calculation returned 0")
                print(f"   💡 This could be:")
                print(f"      - Position-based calc returned 0 (expected in sandbox)")
                print(f"      - Equity difference was rejected as unrealistic")
                print(f"      - API validation failed")
        
        # Check if this is the validation logic kicking in
        print(f"\n3️⃣ VALIDATION LOGIC ANALYSIS:")
        print("-" * 50)
        
        # Test what SHOULD happen based on the values we saw earlier
        print(f"   🧮 Based on previous debug:")
        print(f"      Current Equity: $153,850.05")
        print(f"      Last Equity: $143,910.89")
        print(f"      Raw Difference: $9,939.16")
        print(f"      Raw Percentage: 6.91%")
        
        print(f"\n   📋 API Validation Logic:")
        print(f"      - Is 6.91% > 10%? NO")
        print(f"      - Is 6.91% > 5%? YES")
        print(f"      - Decision: REJECT and return 0 (this is what's happening!)")
        
        # Test if the server is working at all
        print(f"\n4️⃣ SERVER HEALTH CHECK:")
        print("-" * 50)
        
        try:
            health_response = requests.get("http://localhost:8000/")
            print(f"   Root endpoint: {health_response.status_code}")if __name__ == "__main__":
    test_api_return_calculation() 