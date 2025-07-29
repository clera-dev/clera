#!/usr/bin/env python3
"""
Integration tests for the async Redis functionality in the cash/stock/bond allocation endpoint.
Tests the hybrid async-first approach with fallback to sync.
"""

import unittest
import json
import sys
import os
from unittest.mock import patch, MagicMock, AsyncMock
from decimal import Decimal
from fastapi.testclient import TestClient

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import the FastAPI app
from api_server import app

class TestAsyncRedisIntegration(unittest.TestCase):
    """Tests for the async Redis integration in the cash/stock/bond allocation endpoint"""

    def setUp(self):
        """Set up test client"""
        self.client = TestClient(app)
        self.test_account_id = "test-account-123"
        self.test_headers = {"x-api-key": "test-key"}
        
    def tearDown(self):
        """Clean up after tests"""
        pass

    @patch('utils.portfolio_service.PortfolioService._get_positions_async')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance_async')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    @patch.dict('os.environ', {'BACKEND_API_KEY': 'test-key'})
    def test_async_redis_production_flow(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test the production flow with async Redis client"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock async Redis client in app state
        mock_async_redis = AsyncMock()
        mock_async_redis.get = AsyncMock(return_value=json.dumps([
            {'symbol': 'AAPL', 'market_value': '5000.00', 'asset_class': 'us_equity'},
            {'symbol': 'AGG', 'market_value': '2000.00', 'asset_class': 'us_equity'},  # Bond ETF
        ]))
        
        # Mock positions data
        mock_positions = [
            {'symbol': 'AAPL', 'market_value': '5000.00', 'asset_class': 'us_equity'},
            {'symbol': 'AGG', 'market_value': '2000.00', 'asset_class': 'us_equity'},  # Bond ETF
        ]
        mock_get_positions.return_value = mock_positions
        
        # Mock cash balance
        mock_get_cash_balance.return_value = Decimal('1000.00')
        
        # Set the async Redis client in app state
        app.state.redis = mock_async_redis
        
        try:
            response = self.client.get(
                f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
                headers=self.test_headers
            )
        finally:
            # Clean up
            if hasattr(app.state, 'redis'):
                delattr(app.state, 'redis')
        
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

    @patch('utils.portfolio_service.PortfolioService._get_positions_sync')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance_sync')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    @patch.dict('os.environ', {'BACKEND_API_KEY': 'test-key'})
    def test_sync_redis_fallback_flow(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test the fallback flow with sync Redis client when async is not available"""
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
        
        # Ensure no async Redis client in app state (simulating fallback scenario)
        if hasattr(app.state, 'redis'):
            delattr(app.state, 'redis')
        
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

    def test_hybrid_approach_architecture(self):
        """Test that the hybrid approach architecture is properly implemented"""
        from utils.portfolio_service import PortfolioService
        
        # Test that PortfolioService can handle both sync and async clients
        service_sync = PortfolioService(is_async=False)
        self.assertFalse(service_sync.is_async)
        
        # Test that the service has both sync and async methods
        self.assertTrue(hasattr(service_sync, 'get_cash_stock_bond_allocation'))
        self.assertTrue(hasattr(service_sync, 'get_cash_stock_bond_allocation_async'))
        self.assertTrue(hasattr(service_sync, '_get_allocation_sync'))
        self.assertTrue(hasattr(service_sync, '_get_allocation_async'))


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2) 