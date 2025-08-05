#!/usr/bin/env python3
"""
Comprehensive tests for the enhanced get_portfolio_summary tool with live account equity.

This test suite specifically validates:
1. Live account equity retrieval from Alpaca
2. Proper integration of cash balance and total account value
3. Error handling and fallback scenarios
4. Output format verification
5. Edge cases (no positions, no cash, API failures, etc.)
"""

import unittest
import sys
import os
import json
from unittest.mock import patch, MagicMock, Mock
from decimal import Decimal
from typing import List, Dict, Any
import uuid

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

from clera_agents.portfolio_management_agent import get_portfolio_summary


class MockAlpacaAccount:
    """Mock Alpaca Account object for testing."""
    def __init__(self, cash="1000.00", equity="5000.00", **kwargs):
        self.cash = cash
        self.equity = equity
        for key, value in kwargs.items():
            setattr(self, key, value)


class MockPosition:
    """Mock Alpaca Position object for testing."""
    def __init__(self, **kwargs):
        # Set defaults
        self.symbol = kwargs.get('symbol', 'AAPL')
        self.qty = kwargs.get('qty', '10')
        self.current_price = kwargs.get('current_price', '150.00')
        self.market_value = kwargs.get('market_value', '1500.00')
        self.cost_basis = kwargs.get('cost_basis', '1400.00')
        self.avg_entry_price = kwargs.get('avg_entry_price', '140.00')
        self.unrealized_pl = kwargs.get('unrealized_pl', '100.00')
        self.unrealized_plpc = kwargs.get('unrealized_plpc', '0.0714')
        self.asset_class = kwargs.get('asset_class', 'us_equity')
        self.exchange = kwargs.get('exchange', 'NASDAQ')
        self.side = kwargs.get('side', 'long')
        self.asset_id = kwargs.get('asset_id', uuid.UUID('b0b6dd9d-8b9b-48a9-ba46-b9d54906e415'))
        
        # Set any additional attributes
        for key, value in kwargs.items():
            if not hasattr(self, key):
                setattr(self, key, value)


class TestLivePortfolioSummary(unittest.TestCase):
    """Test cases for the enhanced get_portfolio_summary with live account data."""

    def setUp(self):
        """Set up test fixtures."""
        self.test_account_id = "test-account-123"
        self.output_dir = os.path.join(current_dir, "portfolio_summary_outputs")
        os.makedirs(self.output_dir, exist_ok=True)
        
    def save_test_output(self, test_name: str, output: str):
        """Save test output to a file for inspection."""
        output_file = os.path.join(self.output_dir, f"{test_name}_output.txt")
        with open(output_file, 'w') as f:
            f.write(f"=== Test: {test_name} ===\n")
            f.write(f"Output Length: {len(output)} characters\n")
            f.write("="*50 + "\n")
            f.write(output)
            f.write("\n\n")
        print(f"Test output saved to: {output_file}")

    @patch('clera_agents.portfolio_management_agent.get_account_id')
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.retrieve_portfolio_positions')
    @patch('clera_agents.portfolio_management_agent.get_user_investment_strategy')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyticsEngine')
    def test_successful_live_portfolio_summary_with_cash_and_positions(
        self, mock_analytics_engine, mock_analyzer, mock_position_class,
        mock_get_strategy, mock_retrieve_positions, mock_broker_client, mock_get_account_id
    ):
        """Test successful portfolio summary with both cash and positions."""
        
        # Setup test data
        mock_get_account_id.return_value = self.test_account_id
        
        # Mock account with cash and total equity
        mock_account = MockAlpacaAccount(cash="2500.50", equity="7825.75")
        mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Mock positions
        mock_positions = [
            MockPosition(symbol='AAPL', market_value='3000.00'),
            MockPosition(symbol='MSFT', market_value='2325.25')  # Total positions: $5325.25
        ]
        mock_retrieve_positions.return_value = mock_positions
        
        # Mock portfolio positions conversion
        mock_portfolio_positions = []
        for pos in mock_positions:
            mock_portfolio_pos = Mock()
            mock_portfolio_pos.market_value = Decimal(pos.market_value)
            mock_portfolio_pos.asset_class = Mock()
            mock_portfolio_pos.security_type = Mock()
            mock_portfolio_positions.append(mock_portfolio_pos)
        
        mock_position_class.from_alpaca_position.side_effect = mock_portfolio_positions
        mock_analyzer.classify_position.side_effect = lambda p: p
        
        # Mock analytics
        mock_metrics = Mock()
        mock_analytics_engine.generate_complete_portfolio_metrics.return_value = mock_metrics
        mock_analytics_engine.format_portfolio_summary.return_value = (
            "# Portfolio Summary\n"
            "Total Portfolio Value: $5,325.25\n"
            "## Asset Allocation\n"
            "Equity: $5,325.25 (100.0%)\n"
            "## Risk Assessment\n"
            "Risk Score: 6.5/10 (Medium)"
        )
        
        # Mock strategy
        mock_get_strategy.return_value = {"risk_profile": "aggressive"}
        
        # Execute test
        result = get_portfolio_summary.invoke({})
        
        # Save output for inspection
        self.save_test_output("successful_with_cash_and_positions", result)
        
        # Verify live account data was retrieved
        mock_broker_client.get_trade_account_by_id.assert_called_once_with(self.test_account_id)
        
        # Verify the result contains live portfolio information
        self.assertIn("LIVE PORTFOLIO VALUE:", result)
        self.assertIn("Total Account Value: $7,825.75", result)  # From account.equity
        self.assertIn("Investment Positions: $5,325.25", result)  # Sum of positions
        self.assertIn("Cash Balance: $2,500.50", result)  # From account.cash
        
        # Verify it also contains the standard portfolio summary
        self.assertIn("# Portfolio Summary", result)
        self.assertIn("Asset Allocation", result)
        self.assertIn("Risk Assessment", result)
        
        # Verify the live section comes first
        live_section_index = result.find("LIVE PORTFOLIO VALUE:")
        standard_section_index = result.find("# Portfolio Summary")
        self.assertLess(live_section_index, standard_section_index)

    @patch('clera_agents.portfolio_management_agent.get_account_id')
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.retrieve_portfolio_positions')
    @patch('clera_agents.portfolio_management_agent.get_user_investment_strategy')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyticsEngine')
    def test_portfolio_summary_with_only_cash_no_positions(
        self, mock_analytics_engine, mock_analyzer, mock_position_class,
        mock_get_strategy, mock_retrieve_positions, mock_broker_client, mock_get_account_id
    ):
        """Test portfolio summary when account has only cash and no positions."""
        
        mock_get_account_id.return_value = self.test_account_id
        
        # Mock account with only cash
        mock_account = MockAlpacaAccount(cash="5000.00", equity="5000.00")
        mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # No positions
        mock_retrieve_positions.return_value = []
        
        # Mock analytics for empty portfolio
        mock_metrics = Mock()
        mock_analytics_engine.generate_complete_portfolio_metrics.return_value = mock_metrics
        mock_analytics_engine.format_portfolio_summary.return_value = (
            "# Portfolio Summary\n"
            "Total Portfolio Value: $5,000.00\n"
            "Cash: $5,000.00 (100.0%)\n"
            "## Asset Allocation\n"
            "No investments currently.\n"
        )
        
        mock_get_strategy.return_value = {"risk_profile": "conservative"}
        
        # Execute test
        result = get_portfolio_summary.invoke({})
        
        # Save output for inspection
        self.save_test_output("only_cash_no_positions", result)
        
        # Verify live portfolio information shows only cash
        self.assertIn("LIVE PORTFOLIO VALUE:", result)
        self.assertIn("Total Account Value: $5,000.00", result)
        self.assertIn("Investment Positions: $0.00", result)  # No positions
        self.assertIn("Cash Balance: $5,000.00", result)

    @patch('clera_agents.portfolio_management_agent.get_account_id')
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.retrieve_portfolio_positions')
    @patch('clera_agents.portfolio_management_agent.get_user_investment_strategy')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyticsEngine')
    def test_portfolio_summary_with_positions_no_cash(
        self, mock_analytics_engine, mock_analyzer, mock_position_class,
        mock_get_strategy, mock_retrieve_positions, mock_broker_client, mock_get_account_id
    ):
        """Test portfolio summary when account has positions but no cash."""
        
        mock_get_account_id.return_value = self.test_account_id
        
        # Mock account with no cash but positions
        mock_account = MockAlpacaAccount(cash="0.00", equity="3000.00")
        mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Mock positions
        mock_positions = [MockPosition(symbol='SPY', market_value='3000.00')]
        mock_retrieve_positions.return_value = mock_positions
        
        # Mock portfolio position
        mock_portfolio_pos = Mock()
        mock_portfolio_pos.market_value = Decimal('3000.00')
        mock_portfolio_pos.asset_class = Mock()
        mock_portfolio_pos.security_type = Mock()
        
        mock_position_class.from_alpaca_position.return_value = mock_portfolio_pos
        mock_analyzer.classify_position.side_effect = lambda p: p
        
        # Mock analytics
        mock_metrics = Mock()
        mock_analytics_engine.generate_complete_portfolio_metrics.return_value = mock_metrics
        mock_analytics_engine.format_portfolio_summary.return_value = (
            "# Portfolio Summary\n"
            "Total Portfolio Value: $3,000.00\n"
            "Invested: $3,000.00 (100.0%)\n"
        )
        
        mock_get_strategy.return_value = {"risk_profile": "aggressive"}
        
        # Execute test
        result = get_portfolio_summary.invoke({})
        
        # Save output for inspection
        self.save_test_output("positions_no_cash", result)
        
        # Verify live portfolio information
        self.assertIn("LIVE PORTFOLIO VALUE:", result)
        self.assertIn("Total Account Value: $3,000.00", result)
        self.assertIn("Investment Positions: $3,000.00", result)
        self.assertIn("Cash Balance: $0.00", result)

    @patch('clera_agents.portfolio_management_agent.get_account_id')
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.retrieve_portfolio_positions')
    @patch('clera_agents.portfolio_management_agent.get_user_investment_strategy')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyticsEngine')
    def test_portfolio_summary_account_api_failure_fallback(
        self, mock_analytics_engine, mock_analyzer, mock_position_class,
        mock_get_strategy, mock_retrieve_positions, mock_broker_client, mock_get_account_id
    ):
        """Test fallback behavior when Alpaca account API fails."""
        
        mock_get_account_id.return_value = self.test_account_id
        
        # Mock broker client to raise exception when getting account data
        mock_broker_client.get_trade_account_by_id.side_effect = Exception("Alpaca API error")
        
        # Mock positions still work
        mock_positions = [MockPosition(symbol='NVDA', market_value='2000.00')]
        mock_retrieve_positions.return_value = mock_positions
        
        # Mock portfolio position
        mock_portfolio_pos = Mock()
        mock_portfolio_pos.market_value = Decimal('2000.00')
        mock_portfolio_pos.asset_class = Mock()
        mock_portfolio_pos.security_type = Mock()
        
        mock_position_class.from_alpaca_position.return_value = mock_portfolio_pos
        mock_analyzer.classify_position.side_effect = lambda p: p
        
        # Mock analytics
        mock_metrics = Mock()
        mock_analytics_engine.generate_complete_portfolio_metrics.return_value = mock_metrics
        mock_analytics_engine.format_portfolio_summary.return_value = (
            "# Portfolio Summary\n"
            "Total Portfolio Value: $2,000.00\n"
            "## Asset Allocation\n"
            "Equity: $2,000.00 (100.0%)\n"
        )
        
        mock_get_strategy.return_value = {"risk_profile": "moderate"}
        
        # Execute test
        result = get_portfolio_summary.invoke({})
        
        # Save output for inspection
        self.save_test_output("account_api_failure_fallback", result)
        
        # Verify that it falls back gracefully - no live section, just standard summary
        self.assertNotIn("LIVE PORTFOLIO VALUE:", result)
        self.assertIn("# Portfolio Summary", result)
        self.assertIn("Asset Allocation", result)
        
        # Verify the account API was attempted
        mock_broker_client.get_trade_account_by_id.assert_called_once_with(self.test_account_id)

    @patch('clera_agents.portfolio_management_agent.get_account_id')
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.retrieve_portfolio_positions')
    def test_complete_failure_no_positions_no_account_data(
        self, mock_retrieve_positions, mock_broker_client, mock_get_account_id
    ):
        """Test complete failure scenario when both positions and account data fail."""
        
        mock_get_account_id.return_value = self.test_account_id
        
        # Both position retrieval and account data fail
        mock_retrieve_positions.return_value = []  # No positions
        mock_broker_client.get_trade_account_by_id.side_effect = Exception("Complete API failure")
        
        # Execute test
        result = get_portfolio_summary.invoke({})
        
        # Save output for inspection
        self.save_test_output("complete_failure", result)
        
        # Should return error message about no positions
        self.assertIn("Could not retrieve portfolio positions", result)
        self.assertIn(self.test_account_id, result)

    @patch('clera_agents.portfolio_management_agent.get_account_id')
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.retrieve_portfolio_positions')
    @patch('clera_agents.portfolio_management_agent.get_user_investment_strategy')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyticsEngine')
    def test_edge_case_zero_equity_with_positions(
        self, mock_analytics_engine, mock_analyzer, mock_position_class,
        mock_get_strategy, mock_retrieve_positions, mock_broker_client, mock_get_account_id
    ):
        """Test edge case where account equity is zero but positions exist (unusual but possible)."""
        
        mock_get_account_id.return_value = self.test_account_id
        
        # Unusual case: equity is 0 but positions exist (maybe account is restricted)
        mock_account = MockAlpacaAccount(cash="0.00", equity="0.00")
        mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Mock positions that might be suspended/restricted
        mock_positions = [MockPosition(symbol='SUSPENDED', market_value='0.00')]
        mock_retrieve_positions.return_value = mock_positions
        
        # Mock portfolio position
        mock_portfolio_pos = Mock()
        mock_portfolio_pos.market_value = Decimal('0.00')
        mock_portfolio_pos.asset_class = Mock()
        mock_portfolio_pos.security_type = Mock()
        
        mock_position_class.from_alpaca_position.return_value = mock_portfolio_pos
        mock_analyzer.classify_position.side_effect = lambda p: p
        
        # Mock analytics
        mock_metrics = Mock()
        mock_analytics_engine.generate_complete_portfolio_metrics.return_value = mock_metrics
        mock_analytics_engine.format_portfolio_summary.return_value = (
            "# Portfolio Summary\n"
            "Total Portfolio Value: $0.00\n"
            "No investments currently.\n"
        )
        
        mock_get_strategy.return_value = {"risk_profile": "conservative"}
        
        # Execute test
        result = get_portfolio_summary.invoke({})
        
        # Save output for inspection
        self.save_test_output("zero_equity_with_positions", result)
        
        # Verify live portfolio shows zero values
        self.assertIn("LIVE PORTFOLIO VALUE:", result)
        self.assertIn("Total Account Value: $0.00", result)
        self.assertIn("Investment Positions: $0.00", result)
        self.assertIn("Cash Balance: $0.00", result)

    @patch('clera_agents.portfolio_management_agent.get_account_id')
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.retrieve_portfolio_positions')
    @patch('clera_agents.portfolio_management_agent.get_user_investment_strategy')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyticsEngine')
    def test_large_portfolio_with_many_positions(
        self, mock_analytics_engine, mock_analyzer, mock_position_class,
        mock_get_strategy, mock_retrieve_positions, mock_broker_client, mock_get_account_id
    ):
        """Test portfolio summary with large values and many positions."""
        
        mock_get_account_id.return_value = self.test_account_id
        
        # Large account
        mock_account = MockAlpacaAccount(cash="50000.00", equity="1250000.00")
        mock_broker_client.get_trade_account_by_id.return_value = mock_account
        
        # Many positions totaling $1,200,000
        position_symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'SPY', 'QQQ', 'VTI']
        mock_positions = [
            MockPosition(symbol=symbol, market_value='120000.00') 
            for symbol in position_symbols
        ]
        mock_retrieve_positions.return_value = mock_positions
        
        # Mock portfolio positions
        mock_portfolio_positions = []
        for _ in mock_positions:
            mock_portfolio_pos = Mock()
            mock_portfolio_pos.market_value = Decimal('120000.00')
            mock_portfolio_pos.asset_class = Mock()
            mock_portfolio_pos.security_type = Mock()
            mock_portfolio_positions.append(mock_portfolio_pos)
        
        mock_position_class.from_alpaca_position.side_effect = mock_portfolio_positions
        mock_analyzer.classify_position.side_effect = lambda p: p
        
        # Mock analytics
        mock_metrics = Mock()
        mock_analytics_engine.generate_complete_portfolio_metrics.return_value = mock_metrics
        mock_analytics_engine.format_portfolio_summary.return_value = (
            "# Portfolio Summary\n"
            "Total Portfolio Value: $1,200,000.00\n"
            "## Asset Allocation\n"
            "Equity: $1,200,000.00 (100.0%)\n"
        )
        
        mock_get_strategy.return_value = {"risk_profile": "aggressive"}
        
        # Execute test
        result = get_portfolio_summary.invoke({})
        
        # Save output for inspection
        self.save_test_output("large_portfolio_many_positions", result)
        
        # Verify large numbers are formatted correctly
        self.assertIn("LIVE PORTFOLIO VALUE:", result)
        self.assertIn("Total Account Value: $1,250,000.00", result)
        self.assertIn("Investment Positions: $1,200,000.00", result)
        self.assertIn("Cash Balance: $50,000.00", result)

    def test_output_summary(self):
        """Generate a summary of all test outputs."""
        summary_file = os.path.join(self.output_dir, "TEST_SUMMARY.md")
        
        with open(summary_file, 'w') as f:
            f.write("# Live Portfolio Summary Test Results\n\n")
            f.write("This file contains a summary of all test scenarios for the enhanced ")
            f.write("get_portfolio_summary function with live account equity.\n\n")
            
            f.write("## Test Scenarios Covered:\n\n")
            f.write("1. **Successful with Cash and Positions** - Normal operation with both cash and investments\n")
            f.write("2. **Only Cash, No Positions** - Account with only cash balance\n")
            f.write("3. **Positions, No Cash** - Account fully invested with no cash\n")
            f.write("4. **Account API Failure Fallback** - Graceful degradation when live data fails\n")
            f.write("5. **Complete Failure** - Error handling when everything fails\n")
            f.write("6. **Zero Equity Edge Case** - Unusual scenario with zero account value\n")
            f.write("7. **Large Portfolio** - High-value account with many positions\n\n")
            
            f.write("## Key Features Tested:\n\n")
            f.write("- ✅ Live account equity retrieval from Alpaca\n")
            f.write("- ✅ Proper cash balance integration\n")
            f.write("- ✅ Investment positions calculation\n")
            f.write("- ✅ Error handling and fallback behavior\n")
            f.write("- ✅ Output format verification\n")
            f.write("- ✅ Edge case scenarios\n")
            f.write("- ✅ Large value formatting\n\n")
            
            f.write("## Output Files:\n\n")
            output_files = [f for f in os.listdir(self.output_dir) if f.endswith('_output.txt')]
            for output_file in sorted(output_files):
                f.write(f"- `{output_file}`\n")
            
            f.write(f"\n## Test Results Directory:\n")
            f.write(f"`{self.output_dir}`\n")
        
        print(f"Test summary saved to: {summary_file}")


if __name__ == "__main__":
    # Create test instance to generate outputs
    test_instance = TestLivePortfolioSummary()
    test_instance.setUp()
    
    print("="*60)
    print("COMPREHENSIVE LIVE PORTFOLIO SUMMARY TESTS")
    print("="*60)
    
    # Run the test suite
    unittest.main(verbosity=2) 