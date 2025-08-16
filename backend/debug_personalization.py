#!/usr/bin/env python3
"""
Debug script to check if personalization is working correctly.
Run this to verify if a user has personalization data and if it's being retrieved.
"""

import sys
import os
sys.path.append('.')

from utils.personalization_service import PersonalizationService
from langchain_core.messages import HumanMessage, SystemMessage
import logging

# Enable detailed logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(message)s')

def check_user_personalization(user_id: str):
    """Check if a user has personalization data and if it's being retrieved correctly."""
    
    print(f"\n{'='*60}")
    print(f"PERSONALIZATION DEBUG CHECK")
    print(f"{'='*60}")
    print(f"User ID: {user_id}")
    print(f"{'='*60}\n")
    
    # Step 1: Try to get personalization context directly
    print("1. Fetching personalization context from database...")
    try:
        context = PersonalizationService.get_user_personalization_context(user_id)
        
        if context and context.has_any_context():
            print("   ✅ Found personalization data!")
            print(f"   - Name: {context.user_name or 'Not set'}")
            print(f"   - Goals: {context.investment_goals or 'Not set'}")
            print(f"   - Risk guidance: {context.risk_tolerance_guidance or 'Not set'}")
            print(f"   - Timeline guidance: {context.timeline_guidance or 'Not set'}")
            print(f"   - Experience guidance: {context.experience_guidance or 'Not set'}")
            print(f"   - Monthly budget: {context.monthly_budget_guidance or 'Not set'}")
            print(f"   - Market interests: {context.market_interests or 'Not set'}")
        else:
            print("   ⚠️  No personalization data found for this user")
            print("   This user needs to complete the personalization questionnaire")
            
    except Exception as e:
        print(f"   ❌ Error fetching data: {e}")
        return
    
    # Step 2: Test the full prompt build
    print("\n2. Testing full prompt generation...")
    
    config = {
        'configurable': {
            'user_id': user_id,
            'account_id': 'test-account'
        }
    }
    
    try:
        from clera_agents.graph import supervisor_clera_system_prompt
        result = PersonalizationService.build_personalized_system_prompt(
            supervisor_clera_system_prompt, 
            config
        )
        
        has_personalization = "USER PERSONALIZATION CONTEXT" in result
        
        if has_personalization:
            print("   ✅ Personalization successfully added to prompt!")
            
            # Extract and show the personalization section
            start = result.find("USER PERSONALIZATION CONTEXT")
            end = result.find("ROUTING DECISION", start)
            if end == -1:
                end = result.find("\n\n", start + 500)
            if end == -1:
                end = min(start + 1000, len(result))
                
            personalization_section = result[start:end]
            print("\n   Preview of personalization section:")
            print("   " + "-"*50)
            for line in personalization_section.split('\n')[:15]:  # First 15 lines
                print(f"   {line}")
            print("   " + "-"*50)
        else:
            print("   ⚠️  No personalization in prompt (user may not have data)")
            
    except Exception as e:
        print(f"   ❌ Error building prompt: {e}")
        
    # Step 3: Test the complete message flow
    print("\n3. Testing complete message flow (as LangGraph would call it)...")
    
    from utils.personalization_service import create_personalized_supervisor_prompt
    
    class MockState:
        def __init__(self):
            self.messages = [
                HumanMessage(content="how is my portfolio doing?")
            ]
    
    try:
        mock_state = MockState()
        messages = create_personalized_supervisor_prompt(mock_state, config)
        
        print(f"   ✅ Generated {len(messages)} messages")
        
        for i, msg in enumerate(messages):
            if isinstance(msg, SystemMessage):
                has_context = "USER PERSONALIZATION CONTEXT" in msg.content
                print(f"   - Message {i}: SystemMessage (has personalization: {has_context})")
            elif isinstance(msg, HumanMessage):
                print(f"   - Message {i}: HumanMessage: '{msg.content}'")
                
    except Exception as e:
        print(f"   ❌ Error in message flow: {e}")
    
    print(f"\n{'='*60}")
    print("DIAGNOSIS COMPLETE")
    print(f"{'='*60}\n")
    
    print("Next steps:")
    if context and context.has_any_context():
        print("✅ User has personalization data - system should be working")
        print("   If Clera isn't using it, check:")
        print("   1. Is LangGraph deployment up to date? (run: langgraph up --force)")
        print("   2. Are environment variables set correctly?")
        print("   3. Is the user_id being passed correctly from frontend?")
    else:
        print("⚠️  User needs to complete personalization questionnaire")
        print("   Direct them to the onboarding flow to set up their profile")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_personalization.py <user_id>")
        print("Example: python debug_personalization.py 123e4567-e89b-12d3-a456-426614174000")
        sys.exit(1)
    
    user_id = sys.argv[1]
    check_user_personalization(user_id)
