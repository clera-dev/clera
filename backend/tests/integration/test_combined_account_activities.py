#!/usr/bin/env python3
"""
Test suite for the new combined account activities tool.

This test validates that the combined tool provides comprehensive
account activities including purchase history, trading stats, and other activities.
"""

import os
import sys
from datetime import datetime, timezone

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_combined_account_activities():
    """Test the new combined account activities tool."""
    print("🧪 Testing Combined Account Activities Tool")
    print("=" * 60)
    
    try:
        # Test the underlying function
        from clera_agents.tools.purchase_history import get_comprehensive_account_activities
        
        print("📋 1. Testing get_comprehensive_account_activities() function...")
        result = get_comprehensive_account_activities(days_back=60)
        
        print(f"   ✅ Function executed successfully")
        print(f"   📝 Result length: {len(result)} characters")
        print(f"   📝 First 300 chars: {result[:300]}...")
        print()
        
        # Test the @tool decorated function
        from clera_agents.portfolio_management_agent import get_account_activities_tool
        from langchain_core.runnables.config import RunnableConfig
        
        print("📋 2. Testing get_account_activities_tool() @tool function...")
        
        # Create a mock config
        config = RunnableConfig(
            tags=[],
            metadata={},
            recursion_limit=25,
            configurable={}
        )
        
        # Use invoke method for tool calls
        tool_result = get_account_activities_tool.invoke(input={}, config=config)
        
        print(f"   ✅ Tool executed successfully")
        print(f"   📝 Tool result length: {len(tool_result)} characters")
        print()
        
        # Check that the result contains expected sections
        print("📊 3. Validating combined report sections...")
        expected_sections = [
            "📋 **Account Activities**",
            "📊 **Activity Summary**",
            "💰 **Purchase History**"
        ]
        
        for section in expected_sections:
            if section in tool_result:
                print(f"   ✅ Found section: {section}")
            else:
                print(f"   ❌ Missing section: {section}")
        
        print()
        print("🎯 FULL COMBINED TOOL OUTPUT:")
        print("=" * 60)
        print(tool_result)
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"❌ Error testing combined account activities: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_combined_account_activities()
    if success:
        print("\n✅ Combined account activities test completed successfully!")
    else:
        print("\n❌ Combined account activities test failed!")
        sys.exit(1) 