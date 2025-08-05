#!/usr/bin/env python3
"""
Comprehensive tests for asset classification system.
Tests cash/stock/bond allocation logic with various edge cases.
"""

import unittest
from decimal import Decimal
import sys
import os

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

from utils.asset_classification import (
    classify_asset, calculate_allocation, get_allocation_pie_data, 
    AssetClassification, BOND_ETFS
)


class TestAssetClassification(unittest.TestCase):
    """Tests for individual asset classification"""

    def test_bond_etf_classification_by_symbol(self):
        """Test that known bond ETFs are classified as bonds"""
        bond_symbols = ['AGG', 'BND', 'TIP', 'MUB', 'LQD', 'HYG']
        for symbol in bond_symbols:
            with self.subTest(symbol=symbol):
                result = classify_asset(symbol, asset_class='us_equity')
                self.assertEqual(result, AssetClassification.BOND)

    def test_stock_classification(self):
        """Test that individual stocks are classified as stocks"""
        stock_symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA']
        for symbol in stock_symbols:
            with self.subTest(symbol=symbol):
                result = classify_asset(symbol, asset_class='us_equity')
                self.assertEqual(result, AssetClassification.STOCK)

    def test_stock_etf_classification(self):
        """Test that stock ETFs are classified as stocks"""
        stock_etf_symbols = ['SPY', 'QQQ', 'VTI', 'IWM', 'EFA']
        for symbol in stock_etf_symbols:
            with self.subTest(symbol=symbol):
                result = classify_asset(symbol, asset_class='us_equity')
                self.assertEqual(result, AssetClassification.STOCK)

    def test_crypto_classification(self):
        """Test that crypto assets are classified as stocks"""
        crypto_symbols = ['BTC/USD', 'ETH/USD', 'BTCUSD', 'ETHUSD']
        for symbol in crypto_symbols:
            with self.subTest(symbol=symbol):
                result = classify_asset(symbol, asset_class='crypto')
                self.assertEqual(result, AssetClassification.STOCK)

    def test_bond_classification_by_name(self):
        """Test bond classification using asset name keywords"""
        test_cases = [
            ('XYZ', 'Corporate Bond ETF', AssetClassification.BOND),
            ('ABC', 'Treasury Bond Fund', AssetClassification.BOND),
            ('DEF', 'Municipal Bond ETF', AssetClassification.BOND),
            ('GHI', 'TIPS Inflation Protected Securities', AssetClassification.BOND),
            ('JKL', 'Fixed Income Fund', AssetClassification.BOND),
            ('MNO', 'Technology Growth ETF', AssetClassification.STOCK),
            ('PQR', 'S&P 500 Index Fund', AssetClassification.STOCK)
        ]
        
        for symbol, name, expected in test_cases:
            with self.subTest(symbol=symbol, name=name):
                result = classify_asset(symbol, asset_name=name, asset_class='us_equity')
                self.assertEqual(result, expected)

    def test_edge_cases(self):
        """Test edge cases in classification"""
        # Empty or None symbol
        self.assertEqual(classify_asset(''), AssetClassification.STOCK)
        self.assertEqual(classify_asset(None), AssetClassification.STOCK)
        
        # Case insensitive
        self.assertEqual(classify_asset('agg'), AssetClassification.BOND)
        self.assertEqual(classify_asset('AgG'), AssetClassification.BOND)
        
        # With whitespace
        self.assertEqual(classify_asset(' AGG '), AssetClassification.BOND)

    def test_options_classification(self):
        """Test that options are classified as stocks"""
        result = classify_asset('AAPL240101C150', asset_class='us_option')
        self.assertEqual(result, AssetClassification.STOCK)


class TestAllocationCalculation(unittest.TestCase):
    """Tests for portfolio allocation calculation"""

    def test_mixed_portfolio(self):
        """Test allocation calculation with mixed portfolio"""
        positions = [
            {'symbol': 'AAPL', 'market_value': '1000.00', 'asset_class': 'us_equity'},
            {'symbol': 'AGG', 'market_value': '500.00', 'asset_class': 'us_equity'},
            {'symbol': 'MSFT', 'market_value': '800.00', 'asset_class': 'us_equity'},
            {'symbol': 'BND', 'market_value': '300.00', 'asset_class': 'us_equity'}
        ]
        cash_balance = Decimal('400.00')
        
        allocation = calculate_allocation(positions, cash_balance)
        
        # Check totals
        self.assertEqual(allocation['total_value'], Decimal('3000.00'))
        self.assertEqual(allocation['cash']['value'], Decimal('400.00'))
        self.assertEqual(allocation['stock']['value'], Decimal('1800.00'))
        self.assertEqual(allocation['bond']['value'], Decimal('800.00'))
        
        # Check percentages (allowing for rounding)
        self.assertAlmostEqual(allocation['cash']['percentage'], 13.33, places=2)
        self.assertAlmostEqual(allocation['stock']['percentage'], 60.0, places=2)
        self.assertAlmostEqual(allocation['bond']['percentage'], 26.67, places=2)

    def test_cash_only_portfolio(self):
        """Test allocation with only cash (no positions)"""
        positions = []
        cash_balance = Decimal('5000.00')
        
        allocation = calculate_allocation(positions, cash_balance)
        
        self.assertEqual(allocation['total_value'], Decimal('5000.00'))
        self.assertEqual(allocation['cash']['percentage'], 100.0)
        self.assertEqual(allocation['stock']['percentage'], 0.0)
        self.assertEqual(allocation['bond']['percentage'], 0.0)

    def test_stocks_only_portfolio(self):
        """Test allocation with only stocks"""
        positions = [
            {'symbol': 'AAPL', 'market_value': '2000.00', 'asset_class': 'us_equity'},
            {'symbol': 'MSFT', 'market_value': '1500.00', 'asset_class': 'us_equity'},
            {'symbol': 'GOOGL', 'market_value': '1000.00', 'asset_class': 'us_equity'}
        ]
        cash_balance = Decimal('0.00')
        
        allocation = calculate_allocation(positions, cash_balance)
        
        self.assertEqual(allocation['total_value'], Decimal('4500.00'))
        self.assertEqual(allocation['cash']['percentage'], 0.0)
        self.assertEqual(allocation['stock']['percentage'], 100.0)
        self.assertEqual(allocation['bond']['percentage'], 0.0)

    def test_bonds_only_portfolio(self):
        """Test allocation with only bonds"""
        positions = [
            {'symbol': 'AGG', 'market_value': '3000.00', 'asset_class': 'us_equity'},
            {'symbol': 'BND', 'market_value': '2000.00', 'asset_class': 'us_equity'},
            {'symbol': 'TIP', 'market_value': '1000.00', 'asset_class': 'us_equity'}
        ]
        cash_balance = Decimal('0.00')
        
        allocation = calculate_allocation(positions, cash_balance)
        
        self.assertEqual(allocation['total_value'], Decimal('6000.00'))
        self.assertEqual(allocation['cash']['percentage'], 0.0)
        self.assertEqual(allocation['stock']['percentage'], 0.0)
        self.assertEqual(allocation['bond']['percentage'], 100.0)

    def test_crypto_portfolio(self):
        """Test allocation with crypto assets (should be classified as stocks)"""
        positions = [
            {'symbol': 'BTC/USD', 'market_value': '5000.00', 'asset_class': 'crypto'},
            {'symbol': 'ETH/USD', 'market_value': '3000.00', 'asset_class': 'crypto'},
            {'symbol': 'AAPL', 'market_value': '2000.00', 'asset_class': 'us_equity'}
        ]
        cash_balance = Decimal('1000.00')
        
        allocation = calculate_allocation(positions, cash_balance)
        
        self.assertEqual(allocation['total_value'], Decimal('11000.00'))
        self.assertEqual(allocation['stock']['value'], Decimal('10000.00'))  # All crypto + AAPL
        self.assertAlmostEqual(allocation['stock']['percentage'], 90.91, places=2)

    def test_zero_value_positions(self):
        """Test handling of zero or negative value positions"""
        positions = [
            {'symbol': 'AAPL', 'market_value': '1000.00', 'asset_class': 'us_equity'},
            {'symbol': 'MSFT', 'market_value': '0.00', 'asset_class': 'us_equity'},
            {'symbol': 'GOOGL', 'market_value': '-50.00', 'asset_class': 'us_equity'},
            {'symbol': 'AGG', 'market_value': '500.00', 'asset_class': 'us_equity'}
        ]
        cash_balance = Decimal('500.00')
        
        allocation = calculate_allocation(positions, cash_balance)
        
        # Should only count positive value positions
        self.assertEqual(allocation['total_value'], Decimal('2000.00'))
        self.assertEqual(allocation['stock']['value'], Decimal('1000.00'))
        self.assertEqual(allocation['bond']['value'], Decimal('500.00'))

    def test_negative_cash_balance(self):
        """Test handling of negative cash balance"""
        positions = [
            {'symbol': 'AAPL', 'market_value': '1000.00', 'asset_class': 'us_equity'}
        ]
        cash_balance = Decimal('-200.00')  # Margin account
        
        allocation = calculate_allocation(positions, cash_balance)
        
        # Negative cash should be treated as 0 for allocation purposes
        self.assertEqual(allocation['cash']['value'], Decimal('0.00'))
        self.assertEqual(allocation['total_value'], Decimal('1000.00'))
        self.assertEqual(allocation['stock']['percentage'], 100.0)

    def test_invalid_position_data(self):
        """Test handling of invalid position data"""
        positions = [
            {'symbol': 'AAPL', 'market_value': '1000.00', 'asset_class': 'us_equity'},
            {'symbol': 'MSFT'},  # Missing market_value
            {'symbol': '', 'market_value': '500.00'},  # Empty symbol, but still has value
            {'market_value': '300.00'},  # Missing symbol but has value
            {'symbol': 'GOOGL', 'market_value': 'invalid', 'asset_class': 'us_equity'}  # Invalid value
        ]
        cash_balance = Decimal('500.00')
        
        allocation = calculate_allocation(positions, cash_balance)
        
        # Should process: AAPL (1000), empty symbol (500), missing symbol (300) = 1800 total stocks
        # Invalid GOOGL and missing market_value MSFT should be skipped
        self.assertEqual(allocation['stock']['value'], Decimal('1800.00'))
        self.assertEqual(allocation['total_value'], Decimal('2300.00'))  # 1800 + 500 cash


class TestPieDataGeneration(unittest.TestCase):
    """Tests for pie chart data generation"""

    def test_pie_data_format(self):
        """Test that pie data is formatted correctly"""
        allocation = {
            'cash': {'value': Decimal('1000.00'), 'percentage': 25.0},
            'stock': {'value': Decimal('2000.00'), 'percentage': 50.0},
            'bond': {'value': Decimal('1000.00'), 'percentage': 25.0},
            'total_value': Decimal('4000.00')
        }
        
        pie_data = get_allocation_pie_data(allocation)
        
        self.assertEqual(len(pie_data), 3)
        
        # Check data structure
        for item in pie_data:
            self.assertIn('name', item)
            self.assertIn('value', item)
            self.assertIn('rawValue', item)
            self.assertIn('color', item)
            self.assertIn('category', item)
            
        # Check sorting (should be by value descending)
        self.assertEqual(pie_data[0]['category'], 'stock')  # Highest value
        
        # Check color assignments
        colors = {item['category']: item['color'] for item in pie_data}
        self.assertEqual(colors['cash'], '#87CEEB')
        self.assertEqual(colors['stock'], '#4A90E2')
        self.assertEqual(colors['bond'], '#2E5BBA')

    def test_pie_data_zero_categories(self):
        """Test pie data generation when some categories are zero"""
        allocation = {
            'cash': {'value': Decimal('0.00'), 'percentage': 0.0},
            'stock': {'value': Decimal('3000.00'), 'percentage': 100.0},
            'bond': {'value': Decimal('0.00'), 'percentage': 0.0},
            'total_value': Decimal('3000.00')
        }
        
        pie_data = get_allocation_pie_data(allocation)
        
        # Should only include non-zero categories
        self.assertEqual(len(pie_data), 1)
        self.assertEqual(pie_data[0]['category'], 'stock')

    def test_pie_data_percentage_formatting(self):
        """Test that percentages are formatted correctly in names"""
        allocation = {
            'cash': {'value': Decimal('333.33'), 'percentage': 33.33},
            'stock': {'value': Decimal('333.33'), 'percentage': 33.33},
            'bond': {'value': Decimal('333.34'), 'percentage': 33.34},
            'total_value': Decimal('1000.00')
        }
        
        pie_data = get_allocation_pie_data(allocation)
        
        # Check name formatting
        names = [item['name'] for item in pie_data]
        self.assertIn('Cash (33.33%)', names)
        self.assertIn('Stock (33.33%)', names)
        self.assertIn('Bond (33.34%)', names)


class TestBondDetection(unittest.TestCase):
    """Tests for comprehensive bond ETF detection"""

    def test_all_bond_etfs_classified(self):
        """Test that all bond ETFs in our list are classified correctly"""
        for symbol in BOND_ETFS.keys():
            with self.subTest(symbol=symbol):
                result = classify_asset(symbol, asset_class='us_equity')
                self.assertEqual(result, AssetClassification.BOND,
                               f"{symbol} should be classified as bond but got {result}")

    def test_bond_name_detection(self):
        """Test bond detection via asset name analysis"""
        bond_names = [
            'iShares Core U.S. Aggregate Bond ETF',
            'Vanguard Total Bond Market ETF',
            'Corporate Bond Fund',
            'Treasury Securities ETF',
            'Municipal Bond Investment',
            'Inflation Protected Securities'
        ]
        
        for name in bond_names:
            with self.subTest(name=name):
                result = classify_asset('TEST', asset_name=name, asset_class='us_equity')
                self.assertEqual(result, AssetClassification.BOND)

    def test_non_bond_etf_names(self):
        """Test that non-bond ETFs are not misclassified"""
        stock_names = [
            'S&P 500 ETF',
            'Technology Select Sector SPDR Fund',
            'Vanguard Total Stock Market ETF',
            'NASDAQ-100 Index Fund',
            'Real Estate Investment Trust ETF'
        ]
        
        for name in stock_names:
            with self.subTest(name=name):
                result = classify_asset('TEST', asset_name=name, asset_class='us_equity')
                self.assertEqual(result, AssetClassification.STOCK)


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2) 