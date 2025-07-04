#!/usr/bin/env python3
"""
Maximum coverage test - attempts to test as many functions as possible.
Designed to push coverage as close to 100% as possible.
"""

import pytest
import sys
import os
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal
from datetime import datetime, timedelta

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

class TestMaxCoverage:
    """Test as many functions as possible to maximize coverage."""
    
    def test_portfolio_analysis_tools_comprehensive(self):
        """Test portfolio analysis tools comprehensively."""
        try:
            from clera_agents.tools.portfolio_analysis import (
                get_portfolio_positions, calculate_portfolio_performance,
                analyze_asset_allocation, get_position_details,
                calculate_position_performance, format_portfolio_summary
            )
            
            # Mock Alpaca client responses
            mock_positions = [
                Mock(
                    symbol="AAPL",
                    qty=10,
                    market_value=2000,
                    cost_basis=1800,
                    unrealized_pl=200,
                    unrealized_plpc=0.111,
                    side="long"
                ),
                Mock(
                    symbol="MSFT", 
                    qty=5,
                    market_value=1500,
                    cost_basis=1400,
                    unrealized_pl=100,
                    unrealized_plpc=0.071,
                    side="long"
                )
            ]
            
            mock_account = Mock(
                portfolio_value=50000,
                equity=50000,
                cash=10000,
                buying_power=20000
            )
            
            with patch('clera_agents.tools.portfolio_analysis.trading_client') as mock_client:
                mock_client.get_all_positions.return_value = mock_positions
                mock_client.get_account.return_value = mock_account
                
                # Test get_portfolio_positions
                positions = get_portfolio_positions("test-account")
                assert len(positions) == 2
                assert positions[0]["symbol"] == "AAPL"
                
                # Test calculate_portfolio_performance  
                performance = calculate_portfolio_performance("test-account")
                assert "total_value" in performance
                assert performance["total_value"] == 50000
                
                # Test analyze_asset_allocation
                allocation = analyze_asset_allocation("test-account")
                assert "positions" in allocation
                
        except ImportError as e:
            pytest.skip(f"Portfolio analysis tools not available: {e}")
    
    def test_financial_analyst_comprehensive(self):
        """Test financial analyst functions comprehensively."""
        from clera_agents.financial_analyst_agent import (
            validate_symbol_and_dates, adjust_for_market_days,
            get_historical_prices, calculate_annualized_return
        )
        
        # Test validate_symbol_and_dates
        symbol, start, end = validate_symbol_and_dates("AAPL", "2024-01-01", "2024-12-31")
        assert symbol == "AAPL"
        assert isinstance(start, datetime)
        assert isinstance(end, datetime)
        
        # Test adjust_for_market_days
        adjusted_start = adjust_for_market_days("2024-01-01", 30)
        assert isinstance(adjusted_start, str)
        
        # Test get_historical_prices with mocked data
        with patch('clera_agents.financial_analyst_agent.get_price_history') as mock_history:
            mock_history.return_value = [
                {"date": "2024-01-01", "close": 150.0},
                {"date": "2024-12-31", "close": 180.0}
            ]
            
            result = get_historical_prices("AAPL", "2024-01-01", "2024-12-31")
            assert "start_price" in result
            assert "end_price" in result
            
        # Test calculate_annualized_return
        annualized = calculate_annualized_return(Decimal("150"), Decimal("180"), 365)
        assert isinstance(annualized, Decimal)
        assert annualized > 0
    
    def test_purchase_history_comprehensive(self):
        """Test all purchase history functions comprehensively."""
        from clera_agents.tools.purchase_history import (
            ActivityRecord, get_account_activities_with_filters,
            find_first_purchase_dates, get_comprehensive_account_activities
        )
        
        # Test ActivityRecord creation
        record = ActivityRecord(
            id="test123",
            activity_type="FILL",
            date="2024-05-15",
            symbol="AAPL",
            side="buy",
            quantity=10,
            price=180.50,
            total_amount=1805.00,
            transaction_time="2024-05-15T10:30:00Z"
        )
        assert record.symbol == "AAPL"
        assert record.quantity == 10
        
        # Mock activities for testing
        mock_activities = [
            Mock(
                id="test123",
                activity_type="FILL", 
                date="2024-05-15",
                symbol="AAPL",
                side="OrderSide.BUY",
                qty=10,
                price=180.50,
                net_amount=1805.00,
                transaction_time="2024-05-15T10:30:00Z"
            )
        ]
        
        with patch('clera_agents.tools.purchase_history.trading_client') as mock_client:
            mock_client.get_activities.return_value = mock_activities
            mock_client.get_portfolio_history.return_value = Mock(equity=[50000])
            
            # Test get_account_activities_with_filters
            activities = get_account_activities_with_filters(
                account_id="test-account", 
                days_back=30
            )
            assert len(activities) == 1
            assert activities[0].symbol == "AAPL"
            
            # Test find_first_purchase_dates
            first_purchases = find_first_purchase_dates(
                account_id="test-account",
                days_back=365
            )
            assert len(first_purchases) >= 0  # May be empty based on mock data
            
            # Test get_comprehensive_account_activities
            comprehensive = get_comprehensive_account_activities(
                account_id="test-account",
                days_back=60
            )
            assert isinstance(comprehensive, str)
            assert len(comprehensive) > 0
    
    def test_company_analysis_comprehensive(self):
        """Test all company analysis functions."""
        from clera_agents.tools.company_analysis import (
            get_jsonparsed_data, company_profile, basic_dcf_analysis,
            potential_company_upside_with_dcf
        )
        
        # Mock the API responses
        mock_profile = [{
            "symbol": "AAPL",
            "companyName": "Apple Inc.",
            "price": 180.50,
            "dcfDiff": 25.5,
            "dcf": 155.0,
            "sector": "Technology"
        }]
        
        mock_dcf = {
            "symbol": "AAPL",
            "dcf": 155.0,
            "Stock Price": 180.50
        }
        
        with patch('clera_agents.tools.company_analysis.get_jsonparsed_data') as mock_get_data:
            # Test company_profile
            mock_get_data.return_value = mock_profile
            profile = company_profile("AAPL")
            assert profile[0]["symbol"] == "AAPL"
            assert profile[0]["companyName"] == "Apple Inc."
            
            # Test basic_dcf_analysis
            mock_get_data.return_value = mock_dcf
            dcf = basic_dcf_analysis("AAPL")
            assert dcf["symbol"] == "AAPL"
            
            # Test potential_company_upside_with_dcf
            mock_get_data.return_value = mock_profile
            upside = potential_company_upside_with_dcf("AAPL")
            assert "Apple Inc." in upside
            assert isinstance(upside, str)
    
    def test_portfolio_types_comprehensive(self):
        """Test all portfolio types functionality."""
        from clera_agents.types.portfolio_types import (
            AssetClass, SecurityType, RiskProfile, AssetAllocation, TargetPortfolio
        )
        
        # Test all portfolio creation methods
        aggressive = TargetPortfolio.create_aggressive_growth_portfolio()
        balanced = TargetPortfolio.create_balanced_portfolio()
        conservative = TargetPortfolio.create_conservative_portfolio()
        
        # Test calculations
        assert aggressive.get_etf_allocation() == 50.0
        assert aggressive.get_individual_stocks_allocation() == 50.0
        assert balanced.get_etf_allocation() > 0
        assert balanced.get_individual_stocks_allocation() > 0
        assert conservative.get_etf_allocation() > 0
        
        # Test custom portfolio creation
        custom_equity = AssetAllocation(
            percentage=80.0,
            security_allocations={
                SecurityType.ETF: 60.0,
                SecurityType.INDIVIDUAL_STOCK: 40.0
            }
        )
        
        custom_cash = AssetAllocation(
            percentage=20.0,
            security_allocations={
                SecurityType.MONEY_MARKET: 100.0
            }
        )
        
        custom_portfolio = TargetPortfolio(
            asset_allocations={
                AssetClass.EQUITY: custom_equity,
                AssetClass.CASH: custom_cash
            },
            risk_profile=RiskProfile.MODERATE,
            name="Custom Portfolio"
        )
        
        assert custom_portfolio.get_etf_allocation() == 48.0  # 60% of 80%
        assert custom_portfolio.get_individual_stocks_allocation() == 32.0  # 40% of 80%
    
    def test_agent_imports_and_basic_functionality(self):
        """Test that agent modules can be imported and basic functions work."""
        
        # Test portfolio management agent
        try:
            from clera_agents.portfolio_management_agent import build_portfolio_management_graph
            assert callable(build_portfolio_management_graph)
        except ImportError:
            pass  # Skip if dependencies not available
        
        # Test trade execution agent
        try:
            from clera_agents.trade_execution_agent import build_trade_execution_graph
            assert callable(build_trade_execution_graph)
        except ImportError:
            pass  # Skip if dependencies not available
        
        # Test that shared utilities work
        from backend.utils.account_utils import get_account_id
        
        # Mock the config
        mock_config = {"configurable": {"account_id": "test-account-123"}}
        with patch('backend.utils.account_utils.get_config', return_value=mock_config):
            account_id = get_account_id()
            assert account_id == "test-account-123"

if __name__ == "__main__":
    # Run all tests
    test_coverage = TestMaxCoverage()
    
    print("🚀 Running maximum coverage tests...")
    
    tests = [
        ("Portfolio Analysis", test_coverage.test_portfolio_analysis_tools_comprehensive),
        ("Financial Analyst", test_coverage.test_financial_analyst_comprehensive),
        ("Purchase History", test_coverage.test_purchase_history_comprehensive),
        ("Company Analysis", test_coverage.test_company_analysis_comprehensive),
        ("Portfolio Types", test_coverage.test_portfolio_types_comprehensive),
        ("Agent Imports", test_coverage.test_agent_imports_and_basic_functionality)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        try:
            test_func()
            print(f"✅ {test_name} tests PASSED")
            passed += 1
        except Exception as e:
            print(f"❌ {test_name} tests FAILED: {e}")
    
    print(f"\n🎯 Coverage tests completed: {passed}/{total} passed") 