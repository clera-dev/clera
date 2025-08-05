#!/usr/bin/env python3
"""
Simple test script to verify imports work correctly.
"""

# Try importing from the tools directory
print("Testing import from tools directory...")
try:
    from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyzer
    print("✅ Successfully imported PortfolioPosition and PortfolioAnalyzer from tools")
except ImportError as e:
    print(f"❌ Error importing from tools: {e}")

# Try importing from portfolio_management_agent
print("\nTesting import from portfolio_management_agent...")
try:
    from clera_agents.portfolio_management_agent import create_rebalance_instructions
    print("✅ Successfully imported create_rebalance_instructions from portfolio_management_agent")
except ImportError as e:
    print(f"❌ Error importing from portfolio_management_agent: {e}")
except Exception as e:
    print(f"❌ Other error importing from portfolio_management_agent: {type(e).__name__}: {e}")

print("\nImport test complete") 