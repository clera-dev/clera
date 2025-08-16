#!/usr/bin/env python3
"""
Quick script to check what personalization data exists in the database.
"""

import sys
sys.path.append('.')

from utils.supabase import get_supabase_client

def check_personalization_data():
    """Check what personalization data exists in the database."""
    
    print("\n" + "="*60)
    print("CHECKING PERSONALIZATION DATA IN DATABASE")
    print("="*60 + "\n")
    
    try:
        supabase = get_supabase_client()
        
        # Get all personalization records (limited to 10 for privacy)
        response = supabase.table('user_personalization').select('*').limit(10).execute()
        
        if response.data:
            print(f"Found {len(response.data)} personalization record(s) (showing max 10)\n")
            
            for i, record in enumerate(response.data, 1):
                print(f"Record {i}:")
                print(f"  User ID: {record.get('user_id', 'N/A')[:8]}...")  # Show only first 8 chars for privacy
                print(f"  Name: {record.get('first_name', 'N/A')}")
                print(f"  Goals: {record.get('investment_goals', [])}")
                print(f"  Risk: {record.get('risk_tolerance', 'N/A')}")
                print(f"  Timeline: {record.get('investment_timeline', 'N/A')}")
                print(f"  Experience: {record.get('experience_level', 'N/A')}")
                print(f"  Monthly Goal: ${record.get('monthly_investment_goal', 'N/A')}")
                print(f"  Interests: {record.get('market_interests', [])}")
                print(f"  Created: {record.get('created_at', 'N/A')}")
                print()
        else:
            print("⚠️  No personalization data found in the database!")
            print("    Users need to complete the onboarding personalization questionnaire.")
            
    except Exception as e:
        print(f"❌ Error querying database: {e}")
        print("\nPossible causes:")
        print("1. Database connection issues")
        print("2. Table 'user_personalization' doesn't exist")
        print("3. Missing environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)")
    
    print("="*60 + "\n")


if __name__ == "__main__":
    check_personalization_data()
