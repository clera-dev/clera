#!/usr/bin/env python3
"""
Standalone runner for portfolio tests.
This script directly imports the test_portfolio module and runs its tests
without importing from the main application.
"""

import os
import sys

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

# Now import the test_portfolio module
from clera_agents.tests.test_portfolio import test_portfolio_analyzer, test_rebalance_instructions

# Run the test functions
if __name__ == '__main__':
    print("\n" + "="*80)
    print("PORTFOLIO ANALYZER TEST")
    print("="*80)
    test_portfolio_analyzer()
    
    print("\n" + "="*80)
    print("REBALANCE INSTRUCTIONS TEST")
    print("="*80)
    test_rebalance_instructions() 