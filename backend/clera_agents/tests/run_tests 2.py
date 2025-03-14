#!/usr/bin/env python3
"""
Test runner for all portfolio management tests.

This script will discover and run all test cases in the test directory.
"""

import unittest
import sys
import os

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

# Import your test modules
import clera_agents.tests.test_portfolio_types
import clera_agents.tests.test_portfolio_analysis
import clera_agents.tests.test_portfolio_management_agent


def run_tests():
    """Discover and run all tests in the portfolio management system."""
    # Create a test suite containing all of tests
    test_suite = unittest.TestSuite()
    
    # Add tests from each test module
    test_suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(clera_agents.tests.test_portfolio_types.TestAssetAllocation))
    test_suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(clera_agents.tests.test_portfolio_types.TestTargetPortfolio))
    test_suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(clera_agents.tests.test_portfolio_analysis.TestPortfolioPosition))
    test_suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(clera_agents.tests.test_portfolio_analysis.TestPortfolioAnalyzer))
    test_suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(clera_agents.tests.test_portfolio_management_agent.TestPortfolioManagementAgent))
    test_suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(clera_agents.tests.test_portfolio_management_agent.TestPortfolioManagementAgentErrors))
    
    # Run the tests
    result = unittest.TextTestRunner(verbosity=2).run(test_suite)
    return result


if __name__ == "__main__":
    print("\n" + "="*80)
    print("PORTFOLIO MANAGEMENT SYSTEM TESTS")
    print("="*80)
    
    result = run_tests()
    
    # Exit with appropriate code
    sys.exit(not result.wasSuccessful()) 