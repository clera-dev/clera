#!/usr/bin/env python3
"""
Integration tests for the cash/stock/bond allocation endpoint.
Tests the current synchronous implementation with asyncio.to_thread().
"""

import unittest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from decimal import Decimal
from fastapi.testclient import TestClient

# Import the FastAPI app
from api_server import app

class TestCashStockBondAllocationIntegration(unittest.TestCase):
    """Tests for the cash/stock/bond allocation endpoint integration"""

    def setUp(self):
        """Set up test client"""
        self.client = TestClient(app)
        self.test_account_id = "test-account-123"
        self.test_headers = {"x-api-key": "test-key"}
        
    def tearDown(self):
        """Clean up after tests"""
        pass

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    @patch.dict('os.environ', {'BACKEND_API_KEY': 'test-key'})
    def test_cash_stock_bond_allocation_endpoint(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test the cash/stock/bond allocation endpoint with synchronous implementation"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock positions data
        mock_positions = [
            {'symbol': 'AAPL', 'market_value': '5000.00', 'asset_class': 'us_equity'},
            {'symbol': 'AGG', 'market_value': '2000.00', 'asset_class': 'us_equity'},  # Bond ETF
        ]
        mock_get_positions.return_value = mock_positions
        
        # Mock cash balance
        mock_get_cash_balance.return_value = Decimal('1000.00')
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Verify response structure
        self.assertIn('cash', data)
        self.assertIn('stock', data)
        self.assertIn('bond', data)
        self.assertIn('total_value', data)
        self.assertIn('pie_data', data)
        
        # Verify allocation values
        self.assertEqual(data['total_value'], 8000.0)  # 7000 positions + 1000 cash
        self.assertEqual(data['cash']['value'], 1000.0)
        self.assertEqual(data['stock']['value'], 5000.0)  # AAPL
        self.assertEqual(data['bond']['value'], 2000.0)  # AGG

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    @patch.dict('os.environ', {'BACKEND_API_KEY': 'test-key'})
    def test_cash_stock_bond_allocation_fallback(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test the cash/stock/bond allocation endpoint with fallback scenarios"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock cash balance
        mock_get_cash_balance.return_value = Decimal('1000.00')
        
        # Test with empty positions to verify fallback behavior
        mock_get_positions.return_value = []
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Verify response structure
        self.assertIn('cash', data)
        self.assertIn('stock', data)
        self.assertIn('bond', data)
        self.assertIn('total_value', data)
        self.assertIn('pie_data', data)
        
        # Verify allocation values (with empty positions, only cash should be present)
        self.assertEqual(data['total_value'], 1000.0)  # Only cash
        self.assertEqual(data['cash']['value'], 1000.0)
        self.assertEqual(data['stock']['value'], 0.0)  # No positions
        self.assertEqual(data['bond']['value'], 0.0)  # No positions

    def test_portfolio_service_dependency_injection(self):
        """Test that the PortfolioService dependency injection is properly implemented"""
        from utils.portfolio_service import PortfolioService
        
        # Test that PortfolioService can be instantiated with proper parameters
        service = PortfolioService()
        self.assertIsNotNone(service.redis_client)
        self.assertIsNone(service.broker_client)  # Default is None
        
        # Test with explicit parameters
        mock_redis = MagicMock()
        mock_broker = MagicMock()
        service_with_clients = PortfolioService(redis_client=mock_redis, broker_client=mock_broker)
        self.assertEqual(service_with_clients.redis_client, mock_redis)
        self.assertEqual(service_with_clients.broker_client, mock_broker)
        
        # Test that the service has the expected methods
        self.assertTrue(hasattr(service, 'get_cash_stock_bond_allocation'))
        self.assertTrue(hasattr(service, '_get_positions'))
        self.assertTrue(hasattr(service, '_get_cash_balance'))
        self.assertTrue(hasattr(service, '_enrich_positions'))
        self.assertTrue(hasattr(service, '_format_allocation_response'))


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2) 