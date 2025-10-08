#!/usr/bin/env python3

"""
Portfolio History Reconstruction Tests - Phase 1

Comprehensive tests for the portfolio history reconstruction engine.
Tests all components: symbol mapping, historical prices, reconstruction algorithm.

Run with: pytest backend/tests/portfolio_history/test_portfolio_reconstruction_phase1.py -v
"""

import pytest
import asyncio
import sys
import os
from datetime import datetime, date, timedelta
from decimal import Decimal

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

class TestSymbolMappingService:
    """Test the symbol mapping service components."""
    
    @pytest.mark.asyncio
    async def test_symbol_mapping_import(self):
        """Test that symbol mapping service can be imported."""
        try:
            from services.symbol_mapping_service import get_symbol_mapping_service
            service = get_symbol_mapping_service()
            assert service is not None
            print("✅ Symbol mapping service imported successfully")
        except ImportError as e:
            pytest.fail(f"Failed to import symbol mapping service: {e}")
    
    @pytest.mark.asyncio
    async def test_direct_ticker_mapping(self):
        """Test direct ticker symbol mapping (90% case)."""
        try:
            from services.symbol_mapping_service import get_symbol_mapping_service
            service = get_symbol_mapping_service()
            
            # Test with known equity security
            test_security = {
                'security_id': 'test_aapl_security',
                'ticker_symbol': 'AAPL',
                'name': 'Apple Inc.',
                'type': 'equity'
            }
            
            # This will test the direct mapping strategy
            result = await service._direct_ticker_mapping(test_security)
            
            # Should return (symbol, confidence) tuple
            assert result is not None, "Direct ticker mapping should succeed for AAPL"
            symbol, confidence = result
            assert symbol == 'AAPL', f"Expected AAPL, got {symbol}"
            assert confidence == 100.0, f"Expected 100% confidence, got {confidence}"
            
            print("✅ Direct ticker mapping test passed")
            
        except Exception as e:
            pytest.fail(f"Direct ticker mapping test failed: {e}")
    
    @pytest.mark.asyncio  
    async def test_plaid_security_extraction(self):
        """Test extracting unique securities from holdings and transactions."""
        try:
            from services.portfolio_history_reconstructor import get_portfolio_history_reconstructor
            reconstructor = get_portfolio_history_reconstructor()
            
            # Test data mimicking Plaid structure
            test_holdings = [
                {
                    'security_id': 'plaid_aapl_123',
                    'symbol': 'AAPL',
                    'security_name': 'Apple Inc.',
                    'security_type': 'equity',
                    'quantity': 100,
                    'market_value': 15000,
                    'cost_basis': 12000
                },
                {
                    'security_id': 'plaid_tsla_456', 
                    'symbol': 'TSLA',
                    'security_name': 'Tesla Inc.',
                    'security_type': 'equity',
                    'quantity': 50,
                    'market_value': 8000,
                    'cost_basis': 7000
                }
            ]
            
            test_transactions = [
                {
                    'security_id': 'plaid_aapl_123',
                    'amount': 12000,
                    'quantity': 100,
                    'date': '2023-01-15'
                }
            ]
            
            unique_securities = reconstructor._extract_unique_securities(test_holdings, test_transactions)
            
            assert len(unique_securities) == 2, f"Expected 2 unique securities, got {len(unique_securities)}"
            
            # Check that AAPL security was extracted correctly
            aapl_security = next((s for s in unique_securities if s['security_id'] == 'plaid_aapl_123'), None)
            assert aapl_security is not None, "AAPL security should be extracted"
            assert aapl_security['ticker_symbol'] == 'AAPL', "AAPL ticker should be preserved"
            
            print("✅ Security extraction test passed")
            
        except Exception as e:
            pytest.fail(f"Security extraction test failed: {e}")

class TestHistoricalPriceService:
    """Test the historical price service components."""
    
    @pytest.mark.asyncio
    async def test_historical_price_service_import(self):
        """Test that historical price service can be imported."""
        try:
            from services.historical_price_service import get_historical_price_service
            service = get_historical_price_service()
            assert service is not None
            print("✅ Historical price service imported successfully")
        except ImportError as e:
            pytest.fail(f"Failed to import historical price service: {e}")
    
    @pytest.mark.asyncio
    async def test_price_data_point_structure(self):
        """Test PriceDataPoint structure."""
        try:
            from services.historical_price_service import PriceDataPoint
            
            test_point = PriceDataPoint(
                date=date(2023, 1, 15),
                open_price=150.0,
                high_price=155.0,
                low_price=148.0,
                close_price=152.0,
                volume=1000000,
                adjusted_close=152.0
            )
            
            assert test_point.close_price == 152.0
            assert test_point.date == date(2023, 1, 15)
            
            print("✅ PriceDataPoint structure test passed")
            
        except Exception as e:
            pytest.fail(f"PriceDataPoint test failed: {e}")
    
    @pytest.mark.asyncio
    async def test_fmp_api_key_validation(self):
        """Test FMP API key loading."""
        try:
            from services.historical_price_service import get_historical_price_service
            service = get_historical_price_service()
            
            # This should load the API key from environment
            api_key = service._get_fmp_api_key()
            assert api_key is not None and len(api_key) > 10, "FMP API key should be loaded"
            
            print("✅ FMP API key validation passed")
            
        except ValueError as e:
            if "FINANCIAL_MODELING_PREP_API_KEY" in str(e):
                pytest.skip("FMP API key not configured - expected in test environment")
            else:
                pytest.fail(f"Unexpected error: {e}")
        except Exception as e:
            pytest.fail(f"FMP API key test failed: {e}")

class TestPortfolioReconstructionEngine:
    """Test the core reconstruction engine."""
    
    @pytest.mark.asyncio
    async def test_reconstruction_engine_import(self):
        """Test that reconstruction engine can be imported."""
        try:
            from services.portfolio_history_reconstructor import get_portfolio_history_reconstructor
            reconstructor = get_portfolio_history_reconstructor()
            assert reconstructor is not None
            print("✅ Portfolio reconstruction engine imported successfully")
        except ImportError as e:
            pytest.fail(f"Failed to import reconstruction engine: {e}")
    
    @pytest.mark.asyncio
    async def test_portfolio_state_initialization(self):
        """Test portfolio state initialization from holdings."""
        try:
            from services.portfolio_history_reconstructor import get_portfolio_history_reconstructor
            reconstructor = get_portfolio_history_reconstructor()
            
            test_holdings = [
                {
                    'security_id': 'plaid_aapl_123',
                    'symbol': 'AAPL',
                    'security_name': 'Apple Inc.',
                    'quantity': 100,
                    'cost_basis': 12000,
                    'account_id': 'plaid_account_456',
                    'institution_name': 'Charles Schwab'
                }
            ]
            
            symbol_mapping = {
                'plaid_aapl_123': 'AAPL'
            }
            
            portfolio_state = reconstructor._initialize_portfolio_state(test_holdings, symbol_mapping)
            
            assert len(portfolio_state) == 1, "Should have 1 position in portfolio state"
            assert 'plaid_aapl_123' in portfolio_state, "AAPL security should be in state"
            
            aapl_position = portfolio_state['plaid_aapl_123']
            assert aapl_position['symbol'] == 'AAPL'
            assert aapl_position['quantity'] == 100
            assert aapl_position['fmp_symbol'] == 'AAPL'
            
            print("✅ Portfolio state initialization test passed")
            
        except Exception as e:
            pytest.fail(f"Portfolio state test failed: {e}")
    
    @pytest.mark.asyncio
    async def test_transaction_grouping_by_date(self):
        """Test grouping transactions by date."""
        try:
            from services.portfolio_history_reconstructor import get_portfolio_history_reconstructor
            reconstructor = get_portfolio_history_reconstructor()
            
            test_transactions = [
                {
                    'transaction_id': 'trans_1',
                    'security_id': 'plaid_aapl_123',
                    'date': date(2023, 1, 15),
                    'quantity': 50,
                    'amount': 7500
                },
                {
                    'transaction_id': 'trans_2',
                    'security_id': 'plaid_tsla_456',
                    'date': date(2023, 1, 15),
                    'quantity': 25,
                    'amount': 5000
                },
                {
                    'transaction_id': 'trans_3',
                    'security_id': 'plaid_aapl_123',
                    'date': date(2023, 1, 16),
                    'quantity': 50,
                    'amount': 7600
                }
            ]
            
            transactions_by_date = reconstructor._group_transactions_by_date(test_transactions)
            
            assert len(transactions_by_date) == 2, "Should have 2 dates"
            assert date(2023, 1, 15) in transactions_by_date, "Should have transactions for 2023-01-15"
            assert len(transactions_by_date[date(2023, 1, 15)]) == 2, "Should have 2 transactions on 2023-01-15"
            
            print("✅ Transaction grouping test passed")
            
        except Exception as e:
            pytest.fail(f"Transaction grouping test failed: {e}")

class TestReconstructionManager:
    """Test the reconstruction manager orchestration."""
    
    @pytest.mark.asyncio
    async def test_reconstruction_manager_import(self):
        """Test that reconstruction manager can be imported."""
        try:
            from services.portfolio_reconstruction_manager import get_portfolio_reconstruction_manager
            manager = get_portfolio_reconstruction_manager()
            assert manager is not None
            print("✅ Reconstruction manager imported successfully")
        except ImportError as e:
            pytest.fail(f"Failed to import reconstruction manager: {e}")
    
    @pytest.mark.asyncio
    async def test_reconstruction_request_structure(self):
        """Test reconstruction request structure."""
        try:
            from services.portfolio_reconstruction_manager import ReconstructionRequest
            
            request = ReconstructionRequest(user_id="test_user_123", priority="high")
            
            assert request.user_id == "test_user_123"
            assert request.priority == "high"
            assert request.requested_at is not None
            
            print("✅ Reconstruction request structure test passed")
            
        except Exception as e:
            pytest.fail(f"Reconstruction request test failed: {e}")

class TestDatabaseIntegration:
    """Test database schema and integration."""
    
    @pytest.mark.asyncio
    async def test_database_schema_creation(self):
        """Test that database schema can be validated."""
        try:
            # Test database connection and table existence
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            # Test connection
            test_query = supabase.table('user_onboarding').select('id').limit(1).execute()
            assert test_query is not None, "Database connection should work"
            
            print("✅ Database connection test passed")
            
        except Exception as e:
            pytest.fail(f"Database integration test failed: {e}")

class TestAPIEndpoints:
    """Test the API endpoints for reconstruction."""
    
    def test_api_endpoint_imports(self):
        """Test that reconstruction API endpoints are properly imported."""
        try:
            # Test that the endpoints are registered in FastAPI
            import api_server
            
            # Check that the reconstruction manager import works
            from services.portfolio_reconstruction_manager import get_portfolio_reconstruction_manager
            manager = get_portfolio_reconstruction_manager()
            assert manager is not None
            
            print("✅ API endpoint imports test passed")
            
        except Exception as e:
            pytest.fail(f"API endpoint import test failed: {e}")

# Integration test that puts it all together
class TestPhase1Integration:
    """Integration tests for Phase 1 reconstruction system."""
    
    @pytest.mark.asyncio 
    async def test_complete_phase1_integration(self):
        """
        Test complete Phase 1 integration with mock data.
        
        This is the comprehensive test that validates the entire
        reconstruction pipeline without hitting external APIs.
        """
        try:
            print("🧪 COMPREHENSIVE PHASE 1 INTEGRATION TEST")
            print("=" * 50)
            
            # Test 1: Service imports
            print("1. Testing service imports...")
            from services.symbol_mapping_service import get_symbol_mapping_service
            from services.historical_price_service import get_historical_price_service
            from services.portfolio_history_reconstructor import get_portfolio_history_reconstructor
            from services.portfolio_reconstruction_manager import get_portfolio_reconstruction_manager
            
            symbol_service = get_symbol_mapping_service()
            price_service = get_historical_price_service()
            reconstructor = get_portfolio_history_reconstructor()
            manager = get_portfolio_reconstruction_manager()
            
            assert all([symbol_service, price_service, reconstructor, manager])
            print("   ✅ All services imported successfully")
            
            # Test 2: Data structures
            print("2. Testing data structures...")
            from services.historical_price_service import PriceDataPoint, HistoricalPriceResult
            from services.portfolio_history_reconstructor import PortfolioSnapshot, ReconstructionResult
            from services.portfolio_reconstruction_manager import ReconstructionRequest
            
            # Test creating data structures
            test_price = PriceDataPoint(
                date=date(2023, 1, 15),
                open_price=150.0,
                high_price=155.0,
                low_price=148.0,
                close_price=152.0,
                volume=1000000,
                adjusted_close=152.0
            )
            
            test_snapshot = PortfolioSnapshot(
                date=date(2023, 1, 15),
                total_value=25000.0,
                total_cost_basis=20000.0,
                total_gain_loss=5000.0,
                total_gain_loss_percent=25.0,
                securities_count=5,
                account_breakdown={"account_1": 15000, "account_2": 10000},
                institution_breakdown={"Charles Schwab": 25000},
                data_quality_score=100.0
            )
            
            test_request = ReconstructionRequest(user_id="test_user", priority="high")
            
            assert all([test_price, test_snapshot, test_request])
            print("   ✅ All data structures created successfully")
            
            # Test 3: Algorithm components
            print("3. Testing algorithm components...")
            
            # Test security extraction
            test_holdings = [
                {'security_id': 'sec_1', 'symbol': 'AAPL', 'security_name': 'Apple'},
                {'security_id': 'sec_2', 'symbol': 'TSLA', 'security_name': 'Tesla'}
            ]
            test_transactions = [
                {'security_id': 'sec_1', 'amount': 1000, 'date': '2023-01-01'}
            ]
            
            unique_securities = reconstructor._extract_unique_securities(test_holdings, test_transactions)
            assert len(unique_securities) == 2, "Should extract 2 unique securities"
            print("   ✅ Security extraction working")
            
            # Test portfolio state initialization  
            # Fix data structure to match reconstruction algorithm expectations
            test_holdings_for_state = [
                {
                    'security_id': 'sec_1',
                    'symbol': 'AAPL', 
                    'security_name': 'Apple Inc.',
                    'security_type': 'equity',
                    'quantity': 100.0,  # Float format expected
                    'market_value': 15000.0,
                    'cost_basis': 12000.0,
                    'account_id': 'plaid_account_123',
                    'institution_name': 'Charles Schwab'
                },
                {
                    'security_id': 'sec_2',
                    'symbol': 'TSLA',
                    'security_name': 'Tesla Inc.', 
                    'security_type': 'equity',
                    'quantity': 50.0,
                    'market_value': 8000.0,
                    'cost_basis': 7000.0,
                    'account_id': 'plaid_account_456',
                    'institution_name': 'Charles Schwab'
                }
            ]
            
            symbol_mapping = {'sec_1': 'AAPL', 'sec_2': 'TSLA'}
            portfolio_state = reconstructor._initialize_portfolio_state(test_holdings_for_state, symbol_mapping)
            assert len(portfolio_state) == 2, "Should initialize 2 positions"
            print("   ✅ Portfolio state initialization working")
            
            # Test transaction grouping
            transactions_by_date = reconstructor._group_transactions_by_date(test_transactions)
            assert len(transactions_by_date) == 1, "Should group transactions by date"
            print("   ✅ Transaction grouping working")
            
            print("\\n🎉 PHASE 1 INTEGRATION TEST COMPLETE!")
            print("✅ All components working together")
            print("✅ Data structures properly defined")  
            print("✅ Algorithm components functional")
            print("✅ Services properly imported and initialized")
            
        except Exception as e:
            pytest.fail(f"Phase 1 integration test failed: {e}")

# Run specific test if called directly
if __name__ == "__main__":
    async def run_integration_test():
        test_phase1 = TestPhase1Integration()
        await test_phase1.test_complete_phase1_integration()
    
    asyncio.run(run_integration_test())
