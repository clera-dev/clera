#!/usr/bin/env python3

"""
Test script to check analytics for a real account and verify the fix is working.
"""

import requests
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_real_account_analytics():
    """Test analytics endpoint with a real account ID."""
    
    # Get API key
    api_key = os.getenv("BACKEND_API_KEY")
    if not api_key:
        print("❌ BACKEND_API_KEY not found in environment")
        return
    
    # You'll need to replace this with your actual account ID
    # You can find this in your frontend network requests
    account_id = input("Enter your Alpaca account ID (UUID format): ").strip()
    
    if not account_id:
        print("❌ No account ID provided")
        return
    
    # Test the analytics endpoint
    url = f"http://localhost:8000/api/portfolio/{account_id}/analytics"
    headers = {"X-API-Key": api_key}
    
    print(f"🔍 Testing analytics endpoint for account: {account_id}")
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Analytics Response:")
            print(json.dumps(data, indent=2))
            
            risk_score = data.get("risk_score")
            diversification_score = data.get("diversification_score")
            
            print(f"\n📊 Risk Score: {risk_score}")
            print(f"📊 Diversification Score: {diversification_score}")
            
            if risk_score:
                risk_float = float(risk_score)
                if risk_float < 9.0:
                    print("✅ Risk score looks correct (< 9.0) - ETF classification is working!")
                else:
                    print("⚠️  Risk score is still high (>= 9.0) - may need investigation")
            
        else:
            print(f"❌ Error Response:")
            try:
                error_data = response.json()
                print(json.dumps(error_data, indent=2))
            except:
                print(response.text)
                
    except Exception as e:
        print(f"❌ Request failed: {e}")

def test_positions_endpoint():
    """Test positions endpoint to see what positions are being analyzed."""
    
    api_key = os.getenv("BACKEND_API_KEY")
    account_id = input("Enter your Alpaca account ID for positions check: ").strip()
    
    if not account_id or not api_key:
        print("❌ Missing account ID or API key")
        return
    
    url = f"http://localhost:8000/api/portfolio/{account_id}/positions"
    headers = {"X-API-Key": api_key}
    
    print(f"🔍 Testing positions endpoint for account: {account_id}")
    
    try:
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            positions = response.json()
            print(f"✅ Found {len(positions)} positions:")
            
            for pos in positions:
                symbol = pos.get("symbol")
                market_value = pos.get("market_value")
                print(f"  - {symbol}: ${market_value}")
                
                # Check if SPY is in the positions
                if symbol == "SPY":
                    print(f"    📍 SPY found! Market value: ${market_value}")
                    
        else:
            print(f"❌ Error: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ Request failed: {e}")

if __name__ == "__main__":
    print("🧪 Real Account Analytics Test")
    print("=" * 40)
    
    choice = input("Test (1) Analytics or (2) Positions? Enter 1 or 2: ").strip()
    
    if choice == "1":
        test_real_account_analytics()
    elif choice == "2":
        test_positions_endpoint()
    else:
        print("Invalid choice. Run again and enter 1 or 2.") 