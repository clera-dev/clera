#!/usr/bin/env python3
"""
Integration tests for the cash/stock/bond allocation API endpoint.
Tests the full API flow from request to response.
"""

import unittest
import json
from unittest.mock import patch, MagicMock
from decimal import Decimal
from fastapi.testclient import TestClient

class TestCashStockBondAllocationEndpoint(unittest.TestCase):
    """Tests for the /api/portfolio/cash-stock-bond-allocation endpoint"""

    @classmethod
    def setUpClass(cls):
        """Set up test class with patched environment before importing app"""
        with patch.dict('os.environ', {'BACKEND_API_KEY': 'test-key'}):
            # Import the FastAPI app after patching environment
            from api_server import app
            cls.app = app

    def setUp(self):
        """Set up test client"""
        self.client = TestClient(self.app)
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
    def test_mixed_portfolio_allocation(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test allocation calculation with mixed portfolio"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock positions data
        mock_positions = [
            {'symbol': 'AAPL', 'market_value': '5000.00', 'asset_class': 'us_equity'},
            {'symbol': 'MSFT', 'market_value': '3000.00', 'asset_class': 'us_equity'},
            {'symbol': 'AGG', 'market_value': '2000.00', 'asset_class': 'us_equity'},  # Bond ETF
            {'symbol': 'BND', 'market_value': '1000.00', 'asset_class': 'us_equity'},  # Bond ETF
        ]
        mock_get_positions.return_value = mock_positions
        
        # Mock cash balance
        mock_get_cash_balance.return_value = Decimal('2000.00')
        
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

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_cash_only_portfolio(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test allocation with only cash (no positions)"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock no positions
        mock_get_positions.return_value = []
        
        # Mock cash balance
        mock_get_cash_balance.return_value = Decimal('5000.00')
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
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

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_bonds_only_portfolio(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test allocation with only bond ETFs"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock bond-only positions
        mock_positions = [
            {'symbol': 'AGG', 'market_value': '3000.00', 'asset_class': 'us_equity'},
            {'symbol': 'BND', 'market_value': '2000.00', 'asset_class': 'us_equity'},
            {'symbol': 'TIP', 'market_value': '1000.00', 'asset_class': 'us_equity'},
        ]
        mock_get_positions.return_value = mock_positions
        
        # Mock no cash balance
        mock_get_cash_balance.return_value = Decimal('0.00')
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
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

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_crypto_portfolio_classified_as_stocks(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test that crypto assets are classified as stocks"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock crypto positions
        mock_positions = [
            {'symbol': 'BTC/USD', 'market_value': '5000.00', 'asset_class': 'crypto'},
            {'symbol': 'ETH/USD', 'market_value': '3000.00', 'asset_class': 'crypto'},
            {'symbol': 'AAPL', 'market_value': '2000.00', 'asset_class': 'us_equity'},
        ]
        mock_get_positions.return_value = mock_positions
        
        # Mock no cash balance
        mock_get_cash_balance.return_value = Decimal('0.00')
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Crypto should be classified as stocks
        self.assertEqual(data['total_value'], 10000.0)
        self.assertEqual(data['stock']['value'], 10000.0)  # All positions classified as stocks
        self.assertEqual(data['stock']['percentage'], 100.0)
        self.assertEqual(data['cash']['percentage'], 0.0)
        self.assertEqual(data['bond']['percentage'], 0.0)
        
        # Pie data should only contain stocks
        self.assertEqual(len(data['pie_data']), 1)
        self.assertEqual(data['pie_data'][0]['category'], 'stock')

    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_missing_account_id(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id):
        """Test handling of missing account ID parameter"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        response = self.client.get("/api/portfolio/cash-stock-bond-allocation", headers=self.test_headers)
        
        # Should return 422 (Unprocessable Entity) for missing required parameter
        self.assertEqual(response.status_code, 422)
        data = response.json()
        self.assertIn('detail', data)

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_redis_connection_error(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_positions):
        """Test handling of Redis connection errors"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock Redis error
        mock_get_positions.side_effect = Exception("Redis connection failed")
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
        )
        
        self.assertEqual(response.status_code, 500)

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_alpaca_api_error(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_cash_balance, mock_get_positions):
        """Test handling of Alpaca API errors"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock Alpaca API error
        mock_get_positions.side_effect = Exception("Alpaca API error")
        mock_get_cash_balance.side_effect = Exception("Alpaca API error")
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
        )
        
        self.assertEqual(response.status_code, 500)

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('utils.portfolio_service.PortfolioService._get_asset_name')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_invalid_position_data_handling(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_asset_name, mock_get_cash_balance, mock_get_positions):
        """Test handling of invalid position data - skips invalid market_value, processes empty/missing symbols as stocks"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock positions with invalid data
        mock_positions = [
            {'symbol': 'AAPL', 'market_value': '1000.00', 'asset_class': 'us_equity'},  # Valid
            {'symbol': '', 'market_value': '500.00', 'asset_class': 'us_equity'},  # Empty symbol
            {'symbol': None, 'market_value': '300.00', 'asset_class': 'us_equity'},  # Missing symbol
            {'symbol': 'INVALID', 'market_value': 'invalid_value', 'asset_class': 'us_equity'},  # Invalid market_value
        ]
        mock_get_positions.return_value = mock_positions
        
        # Mock cash balance
        mock_get_cash_balance.return_value = Decimal('500.00')
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Should handle invalid data gracefully
        self.assertEqual(data['total_value'], 2300.0)  # 1000 AAPL + 500 empty symbol + 300 missing symbol + 500 cash
        self.assertEqual(data['stock']['value'], 1800.0)  # AAPL (1000) + empty symbol (500) + missing symbol (300)

    @patch('utils.portfolio_service.PortfolioService._get_positions')
    @patch('utils.portfolio_service.PortfolioService._get_cash_balance')
    @patch('utils.portfolio_service.PortfolioService._get_asset_name')
    @patch('api_server.get_authenticated_user_id')
    @patch('api_server.verify_account_ownership')
    @patch('utils.authentication.AuthenticationService.get_user_id_from_api_key')
    def test_bond_etf_name_detection(self, mock_get_user_id_from_api_key, mock_verify_account_ownership, mock_get_authenticated_user_id, mock_get_asset_name, mock_get_cash_balance, mock_get_positions):
        """Test bond ETF detection via asset name"""
        # Mock authentication
        mock_get_user_id_from_api_key.return_value = "test-user-id"
        mock_get_authenticated_user_id.return_value = "test-user-id"
        mock_verify_account_ownership.return_value = "test-user-id"
        
        # Mock positions with bond ETF that's not in our symbol list
        mock_positions = [
            {'symbol': 'UNKNOWN_BOND', 'market_value': '1000.00', 'asset_class': 'us_equity', 'name': 'Some Bond ETF'},
        ]
        mock_get_positions.return_value = mock_positions
        
        # Mock asset name for bond detection
        mock_get_asset_name.return_value = "Some Bond ETF"
        
        # Mock cash balance
        mock_get_cash_balance.return_value = Decimal('0.00')
        
        response = self.client.get(
            f"/api/portfolio/cash-stock-bond-allocation?account_id={self.test_account_id}",
            headers=self.test_headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Should detect bond via name
        self.assertEqual(data['total_value'], 1000.0)
        self.assertEqual(data['bond']['value'], 1000.0)
        self.assertEqual(data['bond']['percentage'], 100.0)


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2) 