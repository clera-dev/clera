#!/usr/bin/env python3
"""
Integration tests for the cash/stock/bond allocation API endpoint.
Tests the full API flow from request to response.
"""

import unittest
import json
import sys
import os
from unittest.mock import patch, MagicMock
from decimal import Decimal
from fastapi.testclient import TestClient

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import the FastAPI app
from api_server import app

class TestCashStockBondAllocationEndpoint(unittest.TestCase):
    """Tests for the /api/portfolio/cash-stock-bond-allocation endpoint"""

    def setUp(self):
        """Set up test client"""
        self.client = TestClient(app)
        self.test_account_id = "test-account-123"
        
    def tearDown(self):
        """Clean up after tests"""
        pass

    @patch('api_server.get_sync_redis_client')
    @patch('api_server.get_broker_client')
    def test_mixed_portfolio_allocation(self, mock_broker_client, mock_redis_client):
        """Test allocation calculation with mixed portfolio"""
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis_client.return_value = mock_redis
        
        # Mock positions data in Redis
        mock_positions = [
            {'symbol': 'AAPL', 'market_value': '5000.00', 'asset_class': 'us_equity'},
            {'symbol': 'MSFT', 'market_value': '3000.00', 'asset_class': 'us_equity'},
            {'symbol': 'AGG', 'market_value': '2000.00', 'asset_class': 'us_equity'},  # Bond ETF
            {'symbol': 'BND', 'market_value': '1000.00', 'asset_class': 'us_equity'},  # Bond ETF
        ]
        mock_redis.get.return_value = json.dumps(mock_positions)
        
        # Mock broker client for cash balance
        mock_broker = MagicMock()
        mock_broker_client.return_value = mock_broker
        
        # Mock account with cash balance
        mock_account = MagicMock()
        mock_account.cash = '2000.00'
        mock_broker.get_trade_account_by_id.return_value = mock_account
        
        # Mock asset cache file (empty for this test)
        with patch('os.path.exists', return_value=False):
            response = self.client.get(
                f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
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
        self.assertEqual(data['total_value'], 13000.0)  # 11000 positions + 2000 cash
        self.assertEqual(data['cash']['value'], 2000.0)
        self.assertEqual(data['stock']['value'], 8000.0)  # AAPL + MSFT
        self.assertEqual(data['bond']['value'], 3000.0)  # AGG + BND
        
        # Verify percentages
        self.assertAlmostEqual(data['cash']['percentage'], 15.38, places=2)
        self.assertAlmostEqual(data['stock']['percentage'], 61.54, places=2)
        self.assertAlmostEqual(data['bond']['percentage'], 23.08, places=2)
        
        # Verify pie data
        self.assertEqual(len(data['pie_data']), 3)
        pie_categories = [item['category'] for item in data['pie_data']]
        self.assertIn('cash', pie_categories)
        self.assertIn('stock', pie_categories)
        self.assertIn('bond', pie_categories)

    @patch('api_server.get_sync_redis_client')
    @patch('api_server.get_broker_client')
    def test_cash_only_portfolio(self, mock_broker_client, mock_redis_client):
        """Test allocation with only cash (no positions)"""
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis_client.return_value = mock_redis
        mock_redis.get.return_value = None  # No positions in Redis
        
        # Mock broker client
        mock_broker = MagicMock()
        mock_broker_client.return_value = mock_broker
        
        # Mock no positions from Alpaca
        mock_broker.get_all_positions_for_account.return_value = []
        
        # Mock account with only cash
        mock_account = MagicMock()
        mock_account.cash = '5000.00'
        mock_broker.get_trade_account_by_id.return_value = mock_account
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Should be 100% cash
        self.assertEqual(data['total_value'], 5000.0)
        self.assertEqual(data['cash']['percentage'], 100.0)
        self.assertEqual(data['stock']['percentage'], 0.0)
        self.assertEqual(data['bond']['percentage'], 0.0)
        
        # Pie data should only contain cash
        self.assertEqual(len(data['pie_data']), 1)
        self.assertEqual(data['pie_data'][0]['category'], 'cash')

    @patch('api_server.get_sync_redis_client')
    @patch('api_server.get_broker_client')
    def test_bonds_only_portfolio(self, mock_broker_client, mock_redis_client):
        """Test allocation with only bond ETFs"""
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis_client.return_value = mock_redis
        
        # Mock bond-only positions
        mock_positions = [
            {'symbol': 'AGG', 'market_value': '3000.00', 'asset_class': 'us_equity'},
            {'symbol': 'BND', 'market_value': '2000.00', 'asset_class': 'us_equity'},
            {'symbol': 'TIP', 'market_value': '1000.00', 'asset_class': 'us_equity'},
        ]
        mock_redis.get.return_value = json.dumps(mock_positions)
        
        # Mock broker client
        mock_broker = MagicMock()
        mock_broker_client.return_value = mock_broker
        
        # Mock account with no cash
        mock_account = MagicMock()
        mock_account.cash = '0.00'
        mock_broker.get_trade_account_by_id.return_value = mock_account
        
        with patch('os.path.exists', return_value=False):
            response = self.client.get(
                f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
            )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Should be 100% bonds
        self.assertEqual(data['total_value'], 6000.0)
        self.assertEqual(data['cash']['percentage'], 0.0)
        self.assertEqual(data['stock']['percentage'], 0.0)
        self.assertEqual(data['bond']['percentage'], 100.0)
        
        # Pie data should only contain bonds
        self.assertEqual(len(data['pie_data']), 1)
        self.assertEqual(data['pie_data'][0]['category'], 'bond')

    @patch('api_server.get_sync_redis_client')
    @patch('api_server.get_broker_client')
    def test_crypto_portfolio_classified_as_stocks(self, mock_broker_client, mock_redis_client):
        """Test that crypto assets are classified as stocks"""
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis_client.return_value = mock_redis
        
        # Mock crypto positions
        mock_positions = [
            {'symbol': 'BTC/USD', 'market_value': '5000.00', 'asset_class': 'crypto'},
            {'symbol': 'ETH/USD', 'market_value': '3000.00', 'asset_class': 'crypto'},
            {'symbol': 'AAPL', 'market_value': '2000.00', 'asset_class': 'us_equity'},
        ]
        mock_redis.get.return_value = json.dumps(mock_positions)
        
        # Mock broker client
        mock_broker = MagicMock()
        mock_broker_client.return_value = mock_broker
        
        # Mock account with cash
        mock_account = MagicMock()
        mock_account.cash = '1000.00'
        mock_broker.get_trade_account_by_id.return_value = mock_account
        
        with patch('os.path.exists', return_value=False):
            response = self.client.get(
                f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
            )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # All crypto + AAPL should be classified as stocks
        self.assertEqual(data['total_value'], 11000.0)
        self.assertEqual(data['stock']['value'], 10000.0)  # BTC + ETH + AAPL
        self.assertAlmostEqual(data['stock']['percentage'], 90.91, places=2)

    def test_missing_account_id(self):
        """Test error handling for missing account ID"""
        response = self.client.get("/api/portfolio/cash-stock-bond-allocation")
        
        self.assertEqual(response.status_code, 422)  # FastAPI validation error

    @patch('api_server.get_sync_redis_client')
    def test_redis_connection_error(self, mock_redis_client):
        """Test handling of Redis connection errors"""
        # Mock Redis connection failure
        mock_redis_client.side_effect = Exception("Redis connection failed")
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
        )
        
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn('Error calculating allocation', data['detail'])

    @patch('api_server.get_sync_redis_client')
    @patch('api_server.get_broker_client')
    def test_alpaca_api_error(self, mock_broker_client, mock_redis_client):
        """Test handling of Alpaca API errors"""
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis_client.return_value = mock_redis
        mock_redis.get.return_value = None  # No positions in Redis
        
        # Mock broker client with API error
        mock_broker = MagicMock()
        mock_broker_client.return_value = mock_broker
        mock_broker.get_all_positions_for_account.side_effect = Exception("Alpaca API error")
        mock_broker.get_trade_account_by_id.side_effect = Exception("Account fetch error")
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
        )
        
        # API should handle errors gracefully and return 200 with empty data
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Should return empty allocation (only cash=0, stock=0, bond=0)
        self.assertEqual(data['total_value'], 0.0)
        self.assertEqual(data['cash']['value'], 0.0)
        self.assertEqual(data['stock']['value'], 0.0)
        self.assertEqual(data['bond']['value'], 0.0)

    @patch('api_server.get_sync_redis_client')
    @patch('api_server.get_broker_client')
    def test_invalid_position_data_handling(self, mock_broker_client, mock_redis_client):
        """Test handling of invalid position data"""
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis_client.return_value = mock_redis
        
        # Mock positions with invalid data
        mock_positions = [
            {'symbol': 'AAPL', 'market_value': '1000.00', 'asset_class': 'us_equity'},
            {'symbol': 'MSFT', 'market_value': 'invalid_value', 'asset_class': 'us_equity'},
            {'symbol': '', 'market_value': '500.00'},  # Empty symbol
            {'market_value': '300.00'},  # Missing symbol
        ]
        mock_redis.get.return_value = json.dumps(mock_positions)
        
        # Mock broker client
        mock_broker = MagicMock()
        mock_broker_client.return_value = mock_broker
        
        # Mock account
        mock_account = MagicMock()
        mock_account.cash = '500.00'
        mock_broker.get_trade_account_by_id.return_value = mock_account
        
        with patch('os.path.exists', return_value=False):
            response = self.client.get(
                f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
            )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Should process valid positions and skip invalid ones
        self.assertEqual(data['total_value'], 2300.0)  # 1000 AAPL + 500 empty symbol + 300 missing symbol + 500 cash
        self.assertEqual(data['stock']['value'], 1800.0)  # Valid positions

    @patch('api_server.get_sync_redis_client')
    @patch('api_server.get_broker_client')
    @patch('os.path.exists')
    def test_bond_etf_name_detection(self, mock_path_exists, mock_broker_client, mock_redis_client):
        """Test bond ETF detection via asset name"""
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis_client.return_value = mock_redis
        
        # Mock positions with unknown bond symbol but bond name
        mock_positions = [
            {'symbol': 'UNKNOWN', 'market_value': '1000.00', 'asset_class': 'us_equity', 'name': 'Corporate Bond ETF'},
            {'symbol': 'AAPL', 'market_value': '2000.00', 'asset_class': 'us_equity'},
        ]
        mock_redis.get.return_value = json.dumps(mock_positions)
        
        # Mock broker client
        mock_broker = MagicMock()
        mock_broker_client.return_value = mock_broker
        
        # Mock account
        mock_account = MagicMock()
        mock_account.cash = '0.00'
        mock_broker.get_trade_account_by_id.return_value = mock_account
        
        # Mock asset cache file doesn't exist
        mock_path_exists.return_value = False
        
        # Mock get_asset to return None (no additional asset info)
        mock_broker.get_asset.return_value = None
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}"
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # UNKNOWN should be classified as bond due to name being passed in the position data
        self.assertEqual(data['bond']['value'], 1000.0)
        self.assertEqual(data['stock']['value'], 2000.0)


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2) 