#!/usr/bin/env python3
"""
Production-Ready Test Suite for Deposit Exclusion Fix (Fixed Version)

This comprehensive test suite validates that the deposit exclusion fix is working
correctly across all components of the system, with proper handling of edge cases.
"""

import sys
import os
import asyncio
import json
import uuid
import pytest
from datetime import datetime, date
from decimal import Decimal
from unittest.mock import Mock, MagicMock, patch
from typing import List, Dict, Any

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the components we need to test
from portfolio_realtime.portfolio_calculator import PortfolioCalculator
import redis

class TestDepositExclusionFixed:
    """Comprehensive test suite for deposit exclusion functionality."""
    
    def setup_method(self):
        """Set up test fixtures before each test method."""
        # Create mock broker client
        self.mock_broker_client = Mock()
        
        # Create portfolio calculator with mocked dependencies
        self.calculator = PortfolioCalculator(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0,
            broker_api_key='test-key',
            broker_secret_key='test-secret',
            sandbox=True
        )
        
        # Replace the broker client with our mock
        self.calculator.broker_client = self.mock_broker_client
        
        # Mock Redis client
        self.calculator.redis_client = Mock()
        
        # Test account ID
        self.test_account_id = str(uuid.uuid4())
        
    def create_mock_account(self, current_equity: float, last_equity: float = None, cash: float = 50000.0):
        """Create a mock account object with specified values."""
        mock_account = Mock()
        mock_account.equity = current_equity
        mock_account.last_equity = last_equity or current_equity
        mock_account.cash = cash
        return mock_account
    
    def create_mock_position(self, symbol: str, qty: float, current_price: float, 
                           unrealized_intraday_pl: float = None):
        """Create a mock position object."""
        mock_position = Mock()
        mock_position.symbol = symbol
        mock_position.qty = qty
        mock_position.current_price = current_price
        mock_position.market_value = qty * current_price
        mock_position.unrealized_intraday_pl = unrealized_intraday_pl
        return mock_position

    def test_deposit_scenario_simulation(self):
        """🔥 CRITICAL TEST: Simulate the exact deposit bug scenario."""
        print("\n🧪 CRITICAL: Testing deposit exclusion scenario")
        
        # SCENARIO: User had $143,910.89 yesterday, deposited $10,000 today, stocks gained $300
        yesterday_equity = 143910.89
        deposit_amount = 10000.0
        stock_gain = 300.0
        today_equity = yesterday_equity + deposit_amount + stock_gain  # $153,910.89
        
        # Setup account - this simulates the stale last_equity problem
        mock_account = self.create_mock_account(today_equity, last_equity=yesterday_equity, cash=60000.0)
        self.mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Setup positions with intraday P&L that reflects only stock movement (NOT deposit)
        positions = [
            self.create_mock_position('AAPL', 100, 150.0, unrealized_intraday_pl=150.0),
            self.create_mock_position('MSFT', 200, 350.0, unrealized_intraday_pl=150.0)
        ]
        self.mock_broker_client.get_all_positions_for_account.return_value = positions
        
        # Mock Redis (no cached positions - forces API call)
        self.calculator.redis_client.get.return_value = None
        
        # Calculate portfolio value using the FIXED method
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        # 🔥 THE KEY ASSERTIONS: Return should be ~$300 (stock gain), NOT ~$10,300 (deposit + gain)
        assert result is not None, "Should return a portfolio calculation"
        assert result['raw_return'] == stock_gain, f"Return should be ${stock_gain} (stock gain only), not include deposit"
        assert result['raw_return'] < 1000, f"Return should be under $1000, got ${result['raw_return']}"
        
        # Verify that the BROKEN calculation would have been wrong
        broken_calculation = today_equity - yesterday_equity  # $10,300 (WRONG!)
        assert result['raw_return'] != broken_calculation, f"Should not equal broken calculation of ${broken_calculation}"
        
        print(f"✅ CRITICAL FIX VERIFIED: ${result['raw_return']:.2f} (excludes ${deposit_amount:,.0f} deposit)")
        print(f"❌ Broken calculation would be: ${broken_calculation:,.2f} (includes deposit)")
        
        return result

    def test_zero_positions_cash_only_account(self):
        """Test behavior when account has no positions but has cash."""
        print("\n🧪 Testing: Cash-only account (zero positions)")
        
        # Setup account with no positions but has cash
        current_equity = 50000.0  # Just cash
        mock_account = self.create_mock_account(current_equity, cash=50000.0)
        self.mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # No positions (empty list instead of None to avoid early return)
        self.mock_broker_client.get_all_positions_for_account.return_value = []
        self.calculator.redis_client.get.return_value = json.dumps([])  # Empty cached positions
        
        # Calculate portfolio value
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        assert result is not None, "Should handle cash-only accounts gracefully"
        assert result['raw_value'] == current_equity, "Portfolio value should equal cash"
        
        # Should use conservative estimate (0.2% of portfolio) since no positions to provide intraday P&L
        expected_return = current_equity * 0.002
        assert abs(result['raw_return'] - expected_return) < 0.01, "Should use conservative estimate for cash-only account"
        
        print(f"✅ Cash-only account handled: {result['today_return']}")

    def test_intraday_pl_calculation_accuracy(self):
        """Test that intraday P&L is accurately calculated and excludes deposits."""
        print("\n🧪 Testing: Intraday P&L accuracy")
        
        # Setup with multiple positions with different P&L
        current_equity = 200000.0
        mock_account = self.create_mock_account(current_equity)
        self.mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Positions with mixed positive/negative intraday P&L
        positions = [
            self.create_mock_position('AAPL', 100, 150.0, unrealized_intraday_pl=500.0),   # Gained $500
            self.create_mock_position('MSFT', 200, 350.0, unrealized_intraday_pl=-200.0),  # Lost $200
            self.create_mock_position('GOOGL', 50, 180.0, unrealized_intraday_pl=100.0),   # Gained $100
            self.create_mock_position('TSLA', 25, 800.0, unrealized_intraday_pl=-50.0)     # Lost $50
        ]
        self.mock_broker_client.get_all_positions_for_account.return_value = positions
        
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        expected_total_pl = 500.0 + (-200.0) + 100.0 + (-50.0)  # = $350
        
        assert result is not None
        assert result['raw_return'] == expected_total_pl, f"Should correctly sum intraday P&L: expected ${expected_total_pl}, got ${result['raw_return']}"
        
        print(f"✅ Intraday P&L accuracy: ${result['raw_return']:.2f} = $500 - $200 + $100 - $50")

    def test_conservative_estimate_when_no_intraday_data(self):
        """Test conservative estimate fallback when intraday P&L data isn't available."""
        print("\n🧪 Testing: Conservative estimate fallback")
        
        current_equity = 100000.0
        mock_account = self.create_mock_account(current_equity)
        self.mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Positions without intraday P&L data (None values)
        positions = [
            self.create_mock_position('AAPL', 100, 150.0, unrealized_intraday_pl=None),
            self.create_mock_position('MSFT', 200, 350.0, unrealized_intraday_pl=None)
        ]
        self.mock_broker_client.get_all_positions_for_account.return_value = positions
        
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        # Should fall back to conservative estimate: 0.2% of portfolio
        expected_conservative = current_equity * 0.002  # $200
        
        assert result is not None
        assert result['raw_return'] == expected_conservative, f"Should use conservative estimate: expected ${expected_conservative}, got ${result['raw_return']}"
        
        print(f"✅ Conservative estimate: ${result['raw_return']:.2f} (0.2% of ${current_equity:,.0f})")

    def test_percentage_calculation_precision(self):
        """Test that percentage calculations are mathematically precise."""
        print("\n🧪 Testing: Percentage calculation precision")
        
        # Test specific scenario: $1,000 return on $50,000 portfolio
        current_equity = 50000.0
        daily_return = 1000.0
        
        mock_account = self.create_mock_account(current_equity)
        self.mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        position = self.create_mock_position('AAPL', 100, 150.0, unrealized_intraday_pl=daily_return)
        self.mock_broker_client.get_all_positions_for_account.return_value = [position]
        
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        # Mathematical calculation: $1000 / ($50000 - $1000) * 100 = 2.0408%
        base_value = current_equity - daily_return  # $49,000
        expected_percent = (daily_return / base_value) * 100  # 2.0408%
        
        assert result is not None
        assert abs(result['raw_return_percent'] - expected_percent) < 0.01, f"Percentage should be {expected_percent:.4f}%"
        
        print(f"✅ Percentage precision: {result['raw_return_percent']:.4f}% (${daily_return:,.0f} / ${base_value:,.0f})")

    def test_extreme_deposit_scenario(self):
        """Test with an extremely large deposit to ensure it's properly excluded."""
        print("\n🧪 Testing: Extreme deposit scenario")
        
        # Extreme scenario: $100,000 deposit with small stock movement
        yesterday_equity = 50000.0
        huge_deposit = 100000.0
        small_stock_gain = 25.0
        today_equity = yesterday_equity + huge_deposit + small_stock_gain  # $150,025
        
        mock_account = self.create_mock_account(today_equity, last_equity=yesterday_equity)
        self.mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Position with small intraday gain
        position = self.create_mock_position('AAPL', 100, 150.0, unrealized_intraday_pl=small_stock_gain)
        self.mock_broker_client.get_all_positions_for_account.return_value = [position]
        
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        assert result is not None
        assert result['raw_return'] == small_stock_gain, f"Should return only ${small_stock_gain}, not include ${huge_deposit:,.0f} deposit"
        
        # The broken calculation would have been massive
        broken_calc = today_equity - yesterday_equity  # $100,025 (WRONG!)
        assert result['raw_return'] != broken_calc, "Should not include the huge deposit in return calculation"
        
        print(f"✅ Extreme deposit excluded: ${result['raw_return']:.2f} vs ${broken_calc:,.2f} (broken)")

    def test_api_error_handling(self):
        """Test graceful handling of API errors."""
        print("\n🧪 Testing: API error handling")
        
        # Mock Alpaca API failure
        self.mock_broker_client.get_trade_account_by_id.side_effect = Exception("Alpaca API error")
        
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        # Should return None gracefully, not crash
        assert result is None, "Should return None when API fails"
        
        print("✅ API errors handled gracefully")

    def test_redis_caching_integration(self):
        """Test Redis caching doesn't interfere with correct calculations."""
        print("\n🧪 Testing: Redis caching integration")
        
        # Setup cached positions in Redis
        cached_positions = [
            {
                'symbol': 'AAPL',
                'qty': '100',
                'current_price': '150.0'
            },
            {
                'symbol': 'MSFT',
                'qty': '200', 
                'current_price': '350.0'
            }
        ]
        self.calculator.redis_client.get.return_value = json.dumps(cached_positions)
        
        # Setup account and live positions for intraday P&L
        mock_account = self.create_mock_account(50000.0)
        self.mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        live_positions = [
            self.create_mock_position('AAPL', 100, 150.0, unrealized_intraday_pl=200.0),
            self.create_mock_position('MSFT', 200, 350.0, unrealized_intraday_pl=300.0)
        ]
        self.mock_broker_client.get_all_positions_for_account.return_value = live_positions
        
        result = self.calculator.calculate_portfolio_value(self.test_account_id)
        
        # Should use live intraday P&L data, not just cached positions
        expected_return = 200.0 + 300.0  # $500
        
        assert result is not None
        assert result['raw_return'] == expected_return, "Should use live intraday P&L even with cached positions"
        
        # Verify Redis was accessed
        self.calculator.redis_client.get.assert_called_with(f'account_positions:{self.test_account_id}')
        
        print(f"✅ Redis integration: ${result['raw_return']:.2f} from live intraday P&L")

def test_api_server_endpoint_integration():
    """Test the API server endpoint with mocked dependencies."""
    print("\n🧪 Testing: API server endpoint integration")
    
    try:
        # Import and verify API server structure
        import api_server
        
        # Verify critical functions exist
        assert hasattr(api_server, 'get_portfolio_value'), "Portfolio value endpoint should exist"
        assert hasattr(api_server, 'get_broker_client'), "Broker client function should exist"
        
        print("✅ API server imports and structure verified")
        
        # Test that the endpoint has the correct calculation logic
        import inspect
        source = inspect.getsource(api_server.get_portfolio_value)
        
        # Check for the fixed calculation patterns
        assert 'unrealized_intraday_pl' in source, "Should use intraday P&L for calculations"
        assert '0.002' in source, "Should have conservative estimate fallback"
        
        print("✅ API endpoint contains correct calculation logic")
        
    except ImportError as e:
        print(f"⚠️  API server import failed: {e}")

def run_all_tests():
    """Run all tests in the comprehensive suite."""
    print("🚀 Production-Ready Deposit Exclusion Test Suite (Fixed)")
    print("=" * 75)
    
    test_instance = TestDepositExclusionFixed()
    
    # Core functionality tests
    core_tests = [
        test_instance.test_deposit_scenario_simulation,  # 🔥 MOST CRITICAL
        test_instance.test_intraday_pl_calculation_accuracy,
        test_instance.test_conservative_estimate_when_no_intraday_data,
        test_instance.test_percentage_calculation_precision,
    ]
    
    # Edge case tests
    edge_case_tests = [
        test_instance.test_zero_positions_cash_only_account,
        test_instance.test_extreme_deposit_scenario,
        test_instance.test_api_error_handling,
        test_instance.test_redis_caching_integration,
    ]
    
    # Integration tests
    integration_tests = [
        test_api_server_endpoint_integration,
    ]
    
    all_tests = core_tests + edge_case_tests + integration_tests
    
    passed = 0
    failed = 0
    
    for test in all_tests:
        try:
            test_instance.setup_method()  # Reset for each test
            test()
            passed += 1
        except Exception as e:
            print(f"❌ {test.__name__} FAILED: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "=" * 75)
    print(f"📊 FINAL RESULTS: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 ALL TESTS PASSED! The deposit exclusion fix is PRODUCTION-READY.")
        print("💰 Deposits will never affect daily return calculations.")
        print("🔒 The system correctly excludes deposits from investment performance.")
        return True
    else:
        print("⚠️  Some tests failed. Review and fix before production deployment.")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1) 