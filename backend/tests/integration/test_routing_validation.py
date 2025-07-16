#!/usr/bin/env python3
"""
Test script to validate Clera's routing logic and error handling.
Run this to ensure system prompts are working correctly.
"""

import sys
import os
from datetime import datetime

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)

def test_routing_logic():
    """Test various user queries to validate routing logic."""
    
    print("🧪 CLERA ROUTING & ERROR HANDLING VALIDATION")
    print("=" * 60)
    
    test_cases = [
        # Portfolio Management Agent Tests
        {
            "category": "📊 Portfolio Management (Should Work)",
            "queries": [
                "How has AAPL performed YTD?",
                "What are my best performing positions?", 
                "Show me my portfolio",
                "How did NVIDIA do this year?",
                "Tesla performance since March"
            ],
            "expected_agent": "portfolio_management_agent"
        },
        
        # Direct Financial Analyst Tests  
        {
            "category": "📰 Financial Analyst (Direct Route)",
            "queries": [
                "Search the web for how Apple and Palantir are correlated",
                "What's the latest news on semiconductor stocks?",
                "Why did the market drop today?",
                "What's Apple's current stock price?"
            ],
            "expected_agent": "financial_analyst_agent"
        },
        
        # Fallback Tests
        {
            "category": "🔄 Fallback Scenarios (Portfolio → Financial)",
            "queries": [
                "How are Apple and Palantir correlated?",
                "Analyze the correlation between my portfolio and Bitcoin",
                "What's driving tech stock volatility this week?",
                "How does Apple compare to Microsoft fundamentally?"
            ],
            "expected_flow": "portfolio_management_agent → financial_analyst_agent"
        },
        
        # Error-Prone Cases
        {
            "category": "🚨 Error Handling (Must Not Show Technical Errors)",
            "queries": [
                "How did ZZZZ perform YTD?",  # Invalid symbol
                "Performance of a non-existent stock ABC123",
                "My portfolio performance for symbol INVALID"
            ],
            "expected_behavior": "Graceful fallback, no API errors shown"
        },
        
        # Trade Execution Tests
        {
            "category": "💰 Trade Execution",
            "queries": [
                "Buy $500 of Apple",
                "Sell $1000 of TSLA", 
                "Purchase $250 worth of SPY"
            ],
            "expected_agent": "trade_execution_agent"
        }
    ]
    
    for test_group in test_cases:
        print(f"\n{test_group['category']}")
        print("-" * 50)
        
        for i, query in enumerate(test_group['queries'], 1):
            print(f"{i}. Query: \"{query}\"")
            
            if 'expected_agent' in test_group:
                print(f"   Expected: Route to {test_group['expected_agent']}")
            elif 'expected_flow' in test_group:
                print(f"   Expected: {test_group['expected_flow']}")
            elif 'expected_behavior' in test_group:
                print(f"   Expected: {test_group['expected_behavior']}")
            
            print()
    
    print("\n🔍 MANUAL TESTING INSTRUCTIONS:")
    print("=" * 60)
    print("1. Test each query above in your Clera interface")
    print("2. Verify routing matches expectations")  
    print("3. Ensure NO technical errors (APIError, Failed to call function, etc.) appear")
    print("4. Check that fallbacks happen gracefully")
    print("5. Validate that users get helpful responses even when backend fails")
    
    print("\n⚠️  RED FLAGS TO WATCH FOR:")
    print("- 'APIError' or 'Failed to call function' shown to user")
    print("- Portfolio agent returning tool descriptions instead of calling tools")
    print("- Clera routing performance questions to wrong agent")
    print("- Technical errors not triggering fallback to web search")
    
    print(f"\n✅ Test completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("Run these queries manually to validate the system!")

if __name__ == "__main__":
    test_routing_logic() 