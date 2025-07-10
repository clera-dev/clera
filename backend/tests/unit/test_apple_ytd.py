#!/usr/bin/env python3

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

def test_apple_ytd():
    """Test the Apple YTD query that was failing"""
    try:
        print("Testing Apple YTD query...")
        
        # Import the graph
        from clera_agents.graph import graph
        print("✓ Graph imported successfully")
        
        # Test configuration
        config = {"configurable": {"thread_id": "test_apple"}}
        
        # Test the problematic query
        print("\n🍎 Testing: 'How has apple done YTD'")
        result = graph.invoke(
            {"messages": [("user", "How has apple done YTD")]}, 
            config=config
        )
        
        # Check result
        if result and "messages" in result:
            last_message = result["messages"][-1]
            print(f"✓ Response received: {last_message.content[:200]}...")
            
            # Check for API errors
            if "API Error" in last_message.content or "Failed to call" in last_message.content:
                print("❌ Still getting API errors!")
                return False
            else:
                print("✓ No API errors detected!")
                return True
        else:
            print("❌ No valid response received")
            return Falseif __name__ == "__main__":
    success = test_apple_ytd()
    print(f"\n{'✅ SUCCESS' if success else '❌ FAILED'}") 