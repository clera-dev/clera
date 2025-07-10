#!/usr/bin/env python3
"""
COMPREHENSIVE EDGE CASES TEST

This test covers ALL edge cases, boundary conditions, and potential failure modes
that could break our daily return calculation fix. This is critical for production readiness.

Edge cases covered:
1. Zero/negative portfolio values
2. Missing/invalid account data
3. API failures and timeouts
4. Calculation precision issues
5. Redis cache failures
6. Network interruptions
7. Invalid input data
8. Extreme portfolio values
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import requests
import json
from unittest.mock import Mock, patch
import redis

def test_edge_cases_comprehensive():
    """Test all edge cases that could break daily return calculation"""
    print("🧪 COMPREHENSIVE EDGE CASES TEST")
    print("=" * 80)
    
    account_id = '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'
    test_results = {}
    
    try:
        calc = PortfolioCalculator(
            broker_api_key=os.getenv('BROKER_API_KEY'),
            broker_secret_key=os.getenv('BROKER_SECRET_KEY'),
            sandbox=True
        )
        
        print(f"\n1️⃣ TESTING ZERO/NEGATIVE PORTFOLIO VALUES:")
        print("-" * 60)
        
        # Test with mocked zero equity
        print(f"   🔬 Test: Portfolio with $0 equity")
        with patch.object(calc.broker_client, 'get_trade_account_by_id') as mock_account:
            mock_account.return_value = Mock(equity=0.0, cash=0.0)
            try:
                todays_return, portfolio_value = calc.calculate_todays_return_robust(account_id)
                if portfolio_value == 0.0 and todays_return == 0.0:
                    print(f"      ✅ PASS: Zero portfolio handled correctly")
                    test_results['zero_portfolio'] = 'PASS'
                else:
                    print(f"      ❌ FAIL: Zero portfolio returned ${todays_return:.2f} on ${portfolio_value:.2f}")
                    test_results['zero_portfolio'] = 'FAIL'if __name__ == "__main__":
    test_edge_cases_comprehensive() 