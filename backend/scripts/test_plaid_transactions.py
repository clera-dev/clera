"""
Test script to see actual Plaid transaction data from sandbox.
"""

import os
import sys
# PORTABILITY FIX: Resolve backend path relative to this script's location
# This makes the script portable across different environments
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)  # Go up from scripts/ to backend/
sys.path.insert(0, BACKEND_DIR)

from utils.supabase.db_client import get_supabase_client
from datetime import datetime, timedelta
import plaid
from plaid.api import plaid_api
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest
from plaid.model.investments_transactions_get_request_options import InvestmentsTransactionsGetRequestOptions
import json

def test_plaid_transactions():
    """Test fetching transactions from Plaid sandbox."""
    print("=" * 80)
    print("TESTING PLAID INVESTMENT TRANSACTIONS API")
    print("=" * 80)
    print()
    
    # Get Plaid credentials
    client_id = os.getenv('PLAID_CLIENT_ID')
    secret = os.getenv('PLAID_SECRET')  # Fixed: use PLAID_SECRET not PLAID_SECRET_SANDBOX
    
    if not client_id or not secret:
        print("❌ Missing Plaid credentials in environment")
        return
    
    # SECURITY FIX: Don't log secrets (even partial) to prevent credential leakage
    print(f"✅ Plaid Client ID: {client_id[:10]}...")
    print(f"✅ Plaid Secret: [REDACTED]")
    print()
    
    # Initialize Plaid client
    configuration = plaid.Configuration(
        host=plaid.Environment.Sandbox,
        api_key={
            'clientId': client_id,
            'secret': secret,
        }
    )
    api_client = plaid.ApiClient(configuration)
    client = plaid_api.PlaidApi(api_client)
    
    print("✅ Plaid client initialized")
    print()
    
    # Get access token from database
    supabase = get_supabase_client()
    accounts = supabase.table('user_investment_accounts')\
        .select('access_token_encrypted, institution_name')\
        .eq('provider', 'plaid')\
        .limit(1)\
        .execute()
    
    if not accounts.data:
        print("❌ No Plaid accounts found in database")
        return
    
    access_token = accounts.data[0]['access_token_encrypted']
    institution = accounts.data[0]['institution_name']
    
    print(f"✅ Using access token for: {institution}")
    print()
    
    # Test 1: Fetch transactions WITHOUT options (should work)
    print("TEST 1: Fetching transactions WITHOUT options")
    print("-" * 80)
    
    try:
        start_date = (datetime.now() - timedelta(days=730)).date()
        end_date = datetime.now().date()
        
        request = InvestmentsTransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date
        )
        
        response = client.investments_transactions_get(request)
        response_dict = response.to_dict()
        
        print(f"✅ SUCCESS! Got {len(response_dict.get('investment_transactions', []))} transactions")
        print()
        
        if response_dict.get('investment_transactions'):
            print("Sample transaction structure:")
            print(json.dumps(response_dict['investment_transactions'][0], indent=2))
            print()
            
            print("All transaction types found:")
            types = set()
            subtypes = set()
            for txn in response_dict['investment_transactions']:
                types.add(txn.get('type'))
                subtypes.add(txn.get('subtype'))
            print(f"  Types: {sorted(types)}")
            print(f"  Subtypes: {sorted(subtypes)}")
        else:
            print("⚠️  No transactions found")
        
        print()
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        print()
    
    # Test 2: Fetch transactions WITH options (account_ids=None)
    print("TEST 2: Fetching transactions WITH options (account_ids=None)")
    print("-" * 80)
    
    try:
        options = InvestmentsTransactionsGetRequestOptions(
            account_ids=None,  # This might fail
            count=500
        )
        
        request = InvestmentsTransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date,
            options=options
        )
        
        response = client.investments_transactions_get(request)
        response_dict = response.to_dict()
        
        print(f"✅ SUCCESS! Got {len(response_dict.get('investment_transactions', []))} transactions")
        print()
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        print()
    
    # Test 3: Fetch transactions WITHOUT account_ids in options
    print("TEST 3: Fetching transactions WITHOUT account_ids in options")
    print("-" * 80)
    
    try:
        options = InvestmentsTransactionsGetRequestOptions(
            count=500
        )
        
        request = InvestmentsTransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date,
            options=options
        )
        
        response = client.investments_transactions_get(request)
        response_dict = response.to_dict()
        
        print(f"✅ SUCCESS! Got {len(response_dict.get('investment_transactions', []))} transactions")
        print()
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        print()
    
    print("=" * 80)
    print("PLAID TRANSACTION TESTS COMPLETE")
    print("=" * 80)

if __name__ == '__main__':
    test_plaid_transactions()

