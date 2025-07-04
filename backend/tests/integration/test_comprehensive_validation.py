#!/usr/bin/env python3
"""
Comprehensive validation tests - designed to catch real issues like the $0.00 bug.
These tests validate actual output content, not just return types.
"""

import pytest
import sys
import os
from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

class TestOutputValidation:
    """Tests that validate actual output content to catch real bugs."""
    
    def test_purchase_history_output_validation(self):
        """Test that purchase history output contains expected content and dollar amounts."""
        from clera_agents.tools.purchase_history import get_comprehensive_account_activities
        
        # Mock the Alpaca API response with realistic data
        mock_activities = [
            Mock(
                id="test123",
                activity_type="FILL",
                date="2024-05-15",
                symbol="AAPL",
                side="buy",
                qty=2,
                price=180.50,
                net_amount=None,  # This is what caused the $0.00 bug
                transaction_time="2024-05-15T10:30:00Z"
            ),
            Mock(
                id="test456", 
                activity_type="FILL",
                date="2024-05-16",
                symbol="MSFT",
                side="sell",
                qty=1,
                price=420.75,
                net_amount=420.75,  # This one has net_amount
                transaction_time="2024-05-16T14:20:00Z"
            )
        ]
        
        with patch('clera_agents.tools.purchase_history.trading_client') as mock_client:
            mock_client.get_portfolio_history.return_value = Mock(equity=[100000])
            mock_client.get_activities.return_value = mock_activities
            
            result = get_comprehensive_account_activities(account_id="test-account", days_back=30)
            
            # Validate that the output contains actual dollar amounts, not $0.00
            assert "$361.00" in result or "$361" in result, f"Expected calculated amount for AAPL trade, got: {result}"
            assert "$420.75" in result, f"Expected MSFT amount, got: {result}"
            assert "$0.00" not in result, f"Found $0.00 bug in output: {result}"
            
            # Validate structure
            assert "AAPL" in result
            assert "MSFT" in result  
            assert "buy" in result.lower()
            assert "sell" in result.lower()
    
    def test_portfolio_types_functionality(self):
        """Test that portfolio types work correctly with proper validation."""
        from clera_agents.types.portfolio_types import (TargetPortfolio, AssetClass, 
                                                       SecurityType, RiskProfile, AssetAllocation)
        
        # Test aggressive portfolio creation
        aggressive = TargetPortfolio.create_aggressive_growth_portfolio()
        assert aggressive.risk_profile == RiskProfile.AGGRESSIVE
        assert aggressive.get_etf_allocation() == 50.0
        assert aggressive.get_individual_stocks_allocation() == 50.0
        
        # Test balanced portfolio
        balanced = TargetPortfolio.create_balanced_portfolio()
        assert balanced.risk_profile == RiskProfile.MODERATE
        assert 0 < balanced.get_etf_allocation() < 100
        assert 0 < balanced.get_individual_stocks_allocation() < 100
        
        # Test that invalid allocations raise errors
        with pytest.raises(ValueError):
            invalid_allocation = AssetAllocation(percentage=150)  # > 100%
            
        with pytest.raises(ValueError):
            AssetAllocation(
                percentage=50, 
                security_allocations={SecurityType.ETF: 60, SecurityType.INDIVIDUAL_STOCK: 50}  # Sum > 100%
            )
    
    def test_company_analysis_functions(self):
        """Test that company analysis functions exist and return expected content."""
        from clera_agents.tools.company_analysis import (company_profile, basic_dcf_analysis, 
                                                        potential_company_upside_with_dcf)
        
        # Mock API responses to test functionality without external dependencies
        mock_profile_response = [{
            "symbol": "AAPL",
            "companyName": "Apple Inc.",
            "price": 180.50,
            "dcfDiff": -25.5,  # Overvalued
            "dcf": 155.0
        }]
        
        mock_dcf_response = {
            "symbol": "AAPL",
            "dcf": 155.0,
            "Stock Price": 180.50
        }
        
        with patch('clera_agents.tools.company_analysis.get_jsonparsed_data') as mock_get_data:
            # Test company profile
            mock_get_data.return_value = mock_profile_response
            profile = company_profile("AAPL")
            assert profile[0]["symbol"] == "AAPL"
            assert profile[0]["companyName"] == "Apple Inc."
            
            # Test DCF analysis
            mock_get_data.return_value = mock_dcf_response
            dcf = basic_dcf_analysis("AAPL")
            assert dcf["symbol"] == "AAPL"
            assert dcf["dcf"] == 155.0
            
            # Test upside calculation
            mock_get_data.return_value = mock_profile_response
            upside = potential_company_upside_with_dcf("AAPL")
            assert "Apple Inc." in upside
            assert "overvalued" in upside.lower()
            assert "$25.50" in upside
    
    def test_financial_analyst_tool_output(self):
        """Test financial analyst tools return properly formatted output."""
        from clera_agents.financial_analyst_agent import get_stock_price, web_search
        
        # Test stock price tool with mock
        with patch('clera_agents.financial_analyst_agent.get_current_price') as mock_price:
            mock_price.return_value = 203.92
            result = get_stock_price.invoke({"symbol": "AAPL"})
            
            # Validate proper formatting
            assert "AAPL" in result
            assert "203.92" in result
            assert "current price" in result.lower()
            assert "$" not in result or "203.92" in result  # Either no $ or proper price format
        
        # Test web search tool
        result = web_search.invoke({"query": "AAPL stock news"})
        assert isinstance(result, str)
        assert len(result) > 0
        assert "aapl" in result.lower() or "apple" in result.lower()

    def test_purchase_history_edge_cases(self):
        """Test purchase history handles edge cases properly."""
        from clera_agents.tools.purchase_history import find_first_purchase_dates
        
        # Mock activities with various side formats
        mock_activities = [
            Mock(symbol="AAPL", side="OrderSide.BUY", date="2024-01-15"),
            Mock(symbol="MSFT", side="buy", date="2024-02-01"),
            Mock(symbol="GOOGL", side="BUY", date="2024-03-01"),
            Mock(symbol="AAPL", side="OrderSide.SELL", date="2024-04-01"),  # Should be ignored
        ]
        
        with patch('clera_agents.tools.purchase_history.trading_client') as mock_client:
            mock_client.get_activities.return_value = mock_activities
            
            result = find_first_purchase_dates(account_id="test-account", days_back=365)
            
            # Should find 3 unique symbols with buy activities
            assert len(result) == 3
            symbols = [item['symbol'] for item in result]
            assert "AAPL" in symbols
            assert "MSFT" in symbols  
            assert "GOOGL" in symbols
            
            # Should properly parse different side formats
            for item in result:
                assert 'first_purchase_date' in item
                assert item['first_purchase_date'] is not None

class TestCoverageImprovement:
    """Tests designed to improve code coverage by testing uncovered functions."""
    
    def test_portfolio_management_agent_functions(self):
        """Test portfolio management agent functions to improve coverage."""
        # This would require mocking the langchain/langgraph dependencies
        # For now, let's test what we can import
        try:
            from clera_agents.portfolio_management_agent import build_portfolio_management_graph
            # Just test that it can be imported - running it requires complex setup
            assert callable(build_portfolio_management_graph)
        except ImportError as e:
            pytest.skip(f"Portfolio management agent requires additional setup: {e}")
    
    def test_trade_execution_agent_functions(self):  # Fixed indentation
        """Test trade execution agent functions to improve coverage."""
        try:
            from clera_agents.trade_execution_agent import build_trade_execution_graph
            # Just test that it can be imported
            assert callable(build_trade_execution_graph)
        except ImportError as e:
            pytest.skip(f"Trade execution agent requires additional setup: {e}")

if __name__ == "__main__":
    # Run specific validation tests
    test_validator = TestOutputValidation()
    
    print("🔍 Running comprehensive validation tests...")
    
    try:
        test_validator.test_purchase_history_output_validation()
        print("✅ Purchase history output validation PASSED")
    except Exception as e:
        print(f"❌ Purchase history output validation FAILED: {e}")
    
    try:
        test_validator.test_portfolio_types_functionality()
        print("✅ Portfolio types functionality PASSED")
    except Exception as e:
        print(f"❌ Portfolio types functionality FAILED: {e}")
    
    try:
        test_validator.test_company_analysis_functions()
        print("✅ Company analysis functions PASSED")
    except Exception as e:
        print(f"❌ Company analysis functions FAILED: {e}")
    
    try:
        test_validator.test_financial_analyst_tool_output()
        print("✅ Financial analyst tool output PASSED")
    except Exception as e:
        print(f"❌ Financial analyst tool output FAILED: {e}")
        
    print("\n🎯 Validation tests completed!") 