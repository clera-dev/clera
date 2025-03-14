#!/usr/bin/env python3
"""
Unit tests for portfolio_management_agent.py module.
Tests the portfolio management agent tools.
"""

import unittest
import sys
import os
import json
from unittest.mock import patch, MagicMock
from typing import List, Dict, Any
import uuid

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

# Import from our test utils to properly call tool functions
from clera_agents.tests.test_utils import (
    test_retrieve_portfolio_positions, 
    test_create_rebalance_instructions,
    test_get_user_investment_strategy,
    test_get_portfolio_summary
)

# Import the original functions for patching
from clera_agents.portfolio_management_agent import (
    retrieve_portfolio_positions,
    create_rebalance_instructions,
    get_user_investment_strategy,
    get_account_id,
    get_portfolio_summary
)


class MockPosition:
    """Mock Alpaca Position object for testing."""
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

    def __repr__(self):
        return f"Position(symbol={self.symbol}, qty={self.qty}, market_value={self.market_value})"


def create_mock_positions() -> List[MockPosition]:
    """Create mock positions that match the format from Alpaca API."""
    return [
        MockPosition(
            symbol='AAPL',
            qty='8',
            current_price='241.84',
            market_value='1934.72',
            cost_basis='1917.76',
            avg_entry_price='239.72',
            unrealized_pl='16.96',
            unrealized_plpc='0.0088436509260804',
            asset_class='us_equity',
            exchange='NASDAQ',
            side='long',
            asset_id=uuid.UUID('b0b6dd9d-8b9b-48a9-ba46-b9d54906e415'),
            asset_marginable=True,
            qty_available='8',
            avg_entry_swap_rate=None,
            change_today='0',
            lastday_price='241.84',
            swap_rate=None,
            unrealized_intraday_pl='0',
            unrealized_intraday_plpc='0',
            usd=None
        ),
        MockPosition(
            symbol='NVDA',
            qty='1',
            current_price='124.92',
            market_value='124.92',
            cost_basis='122.76',
            avg_entry_price='122.76',
            unrealized_pl='2.16',
            unrealized_plpc='0.0175953079178886',
            asset_class='us_equity',
            exchange='NASDAQ',
            side='long',
            asset_id=uuid.UUID('4ce9353c-66d1-46c2-898f-fce867ab0247'),
            asset_marginable=True,
            qty_available='1',
            avg_entry_swap_rate=None,
            change_today='0',
            lastday_price='124.92',
            swap_rate=None,
            unrealized_intraday_pl='0',
            unrealized_intraday_plpc='0',
            usd=None
        )
    ]


class TestPortfolioManagementAgent(unittest.TestCase):
    """Tests for portfolio management agent tools."""
    
    @patch('clera_agents.portfolio_management_agent.broker_client')
    def test_retrieve_portfolio_positions(self, mock_broker_client):
        """Test retrieving portfolio positions."""
        # Setup mock return value
        mock_positions = create_mock_positions()
        mock_broker_client.get_all_positions_for_account.return_value = mock_positions
        
        # Call the function using the test wrapper
        positions = test_retrieve_portfolio_positions()
        
        # Verify correct broker client call
        mock_broker_client.get_all_positions_for_account.assert_called_once()
        
        # Verify return value
        self.assertEqual(positions, mock_positions)
        self.assertEqual(len(positions), 2)
        self.assertEqual(positions[0].symbol, 'AAPL')
        self.assertEqual(positions[1].symbol, 'NVDA')
    
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.TargetPortfolio')
    def test_create_rebalance_instructions_aggressive(self, 
                                                      mock_target_portfolio_class,
                                                      mock_analyzer_class, 
                                                      mock_position_class, 
                                                      mock_broker_client):
        """Test creating rebalance instructions for aggressive portfolio."""
        # Setup mocks
        mock_positions = create_mock_positions()
        mock_portfolio_positions = [MagicMock() for _ in mock_positions]
        mock_position_class.from_alpaca_position.side_effect = mock_portfolio_positions
        
        mock_target_portfolio = MagicMock()
        mock_target_portfolio_class.create_aggressive_growth_portfolio.return_value = mock_target_portfolio
        
        expected_instructions = "Sample rebalance instructions"
        mock_analyzer_class.generate_rebalance_instructions.return_value = expected_instructions
        
        # Call the function using the test wrapper
        result = test_create_rebalance_instructions(mock_positions, "aggressive")
        
        # Verify mocks were called correctly
        self.assertEqual(
            mock_position_class.from_alpaca_position.call_count, 
            len(mock_positions)
        )
        mock_target_portfolio_class.create_aggressive_growth_portfolio.assert_called_once()
        mock_analyzer_class.generate_rebalance_instructions.assert_called_once_with(
            positions=mock_portfolio_positions,
            target_portfolio=mock_target_portfolio
        )
        
        # Verify result
        self.assertEqual(result, expected_instructions)
    
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.TargetPortfolio')
    def test_create_rebalance_instructions_balanced(self, 
                                                   mock_target_portfolio_class,
                                                   mock_analyzer_class, 
                                                   mock_position_class, 
                                                   mock_broker_client):
        """Test creating rebalance instructions for balanced portfolio."""
        # Setup mocks
        mock_positions = create_mock_positions()
        mock_portfolio_positions = [MagicMock() for _ in mock_positions]
        mock_position_class.from_alpaca_position.side_effect = mock_portfolio_positions
        
        mock_target_portfolio = MagicMock()
        mock_target_portfolio_class.create_balanced_portfolio.return_value = mock_target_portfolio
        
        expected_instructions = "Sample balanced rebalance instructions"
        mock_analyzer_class.generate_rebalance_instructions.return_value = expected_instructions
        
        # Call the function using the test wrapper
        result = test_create_rebalance_instructions(mock_positions, "balanced")
        
        # Verify mocks were called correctly
        mock_target_portfolio_class.create_balanced_portfolio.assert_called_once()
        mock_analyzer_class.generate_rebalance_instructions.assert_called_once_with(
            positions=mock_portfolio_positions,
            target_portfolio=mock_target_portfolio
        )
        
        # Verify result
        self.assertEqual(result, expected_instructions)
    
    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.TargetPortfolio')
    def test_create_rebalance_instructions_conservative(self, 
                                                      mock_target_portfolio_class,
                                                      mock_analyzer_class, 
                                                      mock_position_class, 
                                                      mock_broker_client):
        """Test creating rebalance instructions for conservative portfolio."""
        # Setup mocks
        mock_positions = create_mock_positions()
        mock_portfolio_positions = [MagicMock() for _ in mock_positions]
        mock_position_class.from_alpaca_position.side_effect = mock_portfolio_positions
        
        mock_target_portfolio = MagicMock()
        mock_target_portfolio_class.create_conservative_portfolio.return_value = mock_target_portfolio
        
        expected_instructions = "Sample conservative rebalance instructions"
        mock_analyzer_class.generate_rebalance_instructions.return_value = expected_instructions
        
        # Call the function using the test wrapper
        result = test_create_rebalance_instructions(mock_positions, "conservative")
        
        # Verify mocks were called correctly
        mock_target_portfolio_class.create_conservative_portfolio.assert_called_once()
        mock_analyzer_class.generate_rebalance_instructions.assert_called_once_with(
            positions=mock_portfolio_positions,
            target_portfolio=mock_target_portfolio
        )
        
        # Verify result
        self.assertEqual(result, expected_instructions)

    
    def test_get_user_investment_strategy(self):
        """Test getting user investment strategy."""
        # Call function using the test wrapper
        account_id = "4a045111-ef77-46aa-9f33-6002703376f6"
        result = test_get_user_investment_strategy(account_id)
        
        # Verify result structure
        self.assertIsInstance(result, dict)
        self.assertIn('risk_profile', result)
        self.assertIn('target_portfolio', result)
        self.assertIn('notes', result)
        
        # Verify target portfolio details
        target_portfolio = result['target_portfolio']
        self.assertEqual(target_portfolio['equity_percentage'], 100.0)
        self.assertEqual(target_portfolio['fixed_income_percentage'], 0.0)
    
    def test_get_account_id(self):
        """Test getting account ID."""
        # Call function
        account_id = get_account_id()
        
        # Verify the expected return value
        self.assertEqual(account_id, "4a045111-ef77-46aa-9f33-6002703376f6")

    @patch('clera_agents.portfolio_management_agent.broker_client')
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyzer')
    @patch('clera_agents.portfolio_management_agent.PortfolioAnalyticsEngine')
    def test_get_portfolio_summary(self, 
                                mock_analytics_engine,
                                mock_analyzer_class, 
                                mock_position_class, 
                                mock_broker_client):
        """Test the portfolio_summary tool function that provides comprehensive portfolio analytics."""
        # Setup mock returns
        mock_positions = create_mock_positions()
        mock_broker_client.get_all_positions_for_account.return_value = mock_positions
        
        # Mock the PortfolioPosition.from_alpaca_position function
        mock_portfolio_positions = []
        for mock_pos in mock_positions:
            mock_portfolio_pos = MagicMock()
            mock_portfolio_pos.symbol = mock_pos.symbol
            mock_portfolio_pos.market_value = mock_pos.market_value
            mock_portfolio_pos.asset_class = None
            mock_portfolio_pos.security_type = None
            mock_portfolio_positions.append(mock_portfolio_pos)
        
        mock_position_class.from_alpaca_position.side_effect = mock_portfolio_positions
        
        # Mock the classified positions returned from classifier
        for pos in mock_portfolio_positions:
            pos.asset_class = MagicMock()
            pos.security_type = MagicMock()
        
        mock_analyzer_class.classify_position.side_effect = lambda p: p
        
        # Set up mock metrics
        mock_metrics = MagicMock()
        mock_analytics_engine.generate_complete_portfolio_metrics.return_value = mock_metrics
        
        # Mock the summary output
        expected_summary = "# Portfolio Summary\nTotal Portfolio Value: $2,059.64\n\n## Asset Allocation\nEquity: $2,059.64 (100.0%)\n\n## Performance\nTotal Gain: $19.12 (0.93%)\n\n## Risk Assessment\nRisk Score: 8.5/10 (High)\nDiversification Score: 2.8/10 (Poor)"
        mock_analytics_engine.format_portfolio_summary.return_value = expected_summary
        
        # Call the function
        summary = test_get_portfolio_summary()
        
        # Verify interactions
        mock_broker_client.get_all_positions_for_account.assert_called_once()
        mock_analytics_engine.generate_complete_portfolio_metrics.assert_called_once()
        mock_analytics_engine.format_portfolio_summary.assert_called_once()
        
        # Verify output matches expected format
        self.assertEqual(summary, expected_summary)
        self.assertIn("Portfolio Summary", summary)
        self.assertIn("Asset Allocation", summary)
        self.assertIn("Risk Assessment", summary)


class TestPortfolioManagementAgentErrors(unittest.TestCase):
    """Tests for error handling in portfolio management agent tools."""
    
    @patch('clera_agents.portfolio_management_agent.broker_client')
    def test_retrieve_portfolio_positions_error(self, mock_broker_client):
        """Test error handling when retrieving portfolio positions fails."""
        # Setup mock to raise an exception
        mock_broker_client.get_all_positions_for_account.side_effect = Exception("API error")
        
        # Call function and expect exception to be propagated
        with self.assertRaises(Exception):
            test_retrieve_portfolio_positions()
    
    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    def test_create_rebalance_instructions_invalid_portfolio_type(self, mock_position_class):
        """Test error handling for invalid portfolio type."""
        # Setup mock positions
        mock_positions = create_mock_positions()
        
        # Use an invalid portfolio type that should result in defaulting to aggressive
        result = test_create_rebalance_instructions(mock_positions, "unknown_type")
        
        # Call function and expect exception to be propagated
        self.assertIsNotNone(result)

    @patch('clera_agents.portfolio_management_agent.PortfolioPosition')
    def test_create_rebalance_instructions_invalid_portfolio_type(self, mock_position_class):
        """Test error handling for invalid portfolio type."""
        # Setup mock positions
        mock_positions = create_mock_positions()
        
        # Use an invalid portfolio type that should result in defaulting to aggressive
        result = test_create_rebalance_instructions(mock_positions, "unknown_type")

    @patch('clera_agents.portfolio_management_agent.broker_client')
    def test_get_portfolio_summary_error(self, mock_broker_client):
        """Test error handling in the portfolio_summary tool."""
        # Setup the broker client to raise an exception
        mock_broker_client.get_all_positions_for_account.side_effect = Exception("API error")
        
        # Call the function
        result = test_get_portfolio_summary()
        
        # Verify error message is returned
        self.assertIn("Error generating portfolio summary", result)
        self.assertIn("API error", result)


if __name__ == "__main__":
    unittest.main() 
