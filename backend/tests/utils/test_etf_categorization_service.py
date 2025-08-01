#!/usr/bin/env python3
"""
Comprehensive tests for the ETF Categorization Service.

This test suite validates the intelligent ETF categorization functionality that
distinguishes between broad market ETFs, sector ETFs, asset class ETFs, and
international ETFs for accurate portfolio sector allocation.

Tests cover:
1. Broad market ETF classification (SPY, VTI, QQQ -> "Broad ETFs")
2. Sector ETF classification (XLK -> "Technology", XLF -> "Financial Services")
3. Asset class ETF classification (AGG -> "Fixed Income", VNQ -> "Real Estate")
4. International ETF classification (VEA, EEM -> "International ETFs")
5. Name-based inference for unknown ETFs
6. Confidence scoring
7. Edge cases and error handling
"""

import unittest
import sys
import os
from decimal import Decimal

# Add project root to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
sys.path.insert(0, project_root)

from utils.etf_categorization_service import (
    ETFCategorizationService, 
    ETFCategory, 
    ETFClassification,
    get_etf_sector_for_allocation,
    is_known_etf
)


class TestETFCategorizationService(unittest.TestCase):
    """Test the ETF categorization service functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.service = ETFCategorizationService()
    
    def test_broad_market_etf_classification(self):
        """Test that broad market ETFs are correctly classified as 'Broad ETFs'."""
        broad_market_symbols = ['SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'DIA']
        
        for symbol in broad_market_symbols:
            with self.subTest(symbol=symbol):
                classification = self.service.classify_etf(symbol)
                self.assertEqual(
                    classification.category, 
                    ETFCategory.BROAD_MARKET,
                    f"{symbol} should be classified as Broad ETFs"
                )
                self.assertEqual(
                    classification.category.value,
                    "Broad ETFs",
                    f"{symbol} category value should be 'Broad ETFs'"
                )
                self.assertEqual(classification.confidence, 1.0)
                
                # Test the convenience function
                sector = get_etf_sector_for_allocation(symbol)
                self.assertEqual(sector, "Broad ETFs")
    
    def test_sector_etf_classification(self):
        """Test that sector ETFs are correctly classified by their actual sector."""
        sector_tests = [
            ('XLK', ETFCategory.TECHNOLOGY),
            ('VGT', ETFCategory.TECHNOLOGY),
            ('XLV', ETFCategory.HEALTHCARE),
            ('VHT', ETFCategory.HEALTHCARE),
            ('XLF', ETFCategory.FINANCIAL_SERVICES),
            ('VFH', ETFCategory.FINANCIAL_SERVICES),
            ('XLE', ETFCategory.ENERGY),
            ('VDE', ETFCategory.ENERGY),
            ('XLI', ETFCategory.INDUSTRIALS),
            ('VIS', ETFCategory.INDUSTRIALS),
            ('XLY', ETFCategory.CONSUMER_DISCRETIONARY),
            ('VCR', ETFCategory.CONSUMER_DISCRETIONARY),
            ('XLP', ETFCategory.CONSUMER_STAPLES),
            ('VDC', ETFCategory.CONSUMER_STAPLES),
            ('XLU', ETFCategory.UTILITIES),
            ('VPU', ETFCategory.UTILITIES),
            ('XLRE', ETFCategory.REAL_ESTATE),
            ('VNQ', ETFCategory.REAL_ESTATE),
            ('XLC', ETFCategory.COMMUNICATION_SERVICES),
            ('VOX', ETFCategory.COMMUNICATION_SERVICES),
            ('XLB', ETFCategory.BASIC_MATERIALS),
            ('VAW', ETFCategory.BASIC_MATERIALS),
        ]
        
        for symbol, expected_category in sector_tests:
            with self.subTest(symbol=symbol, expected=expected_category):
                classification = self.service.classify_etf(symbol)
                self.assertEqual(
                    classification.category, 
                    expected_category,
                    f"{symbol} should be classified as {expected_category.value}"
                )
                self.assertEqual(classification.confidence, 1.0)
                
                # Test the convenience function
                sector = get_etf_sector_for_allocation(symbol)
                self.assertEqual(sector, expected_category.value)
    
    def test_asset_class_etf_classification(self):
        """Test that asset class ETFs are correctly classified."""
        asset_class_tests = [
            # Fixed Income
            ('AGG', ETFCategory.FIXED_INCOME),
            ('BND', ETFCategory.FIXED_INCOME),
            ('TIP', ETFCategory.FIXED_INCOME),
            ('TLT', ETFCategory.FIXED_INCOME),
            ('MUB', ETFCategory.FIXED_INCOME),
            ('VCIT', ETFCategory.FIXED_INCOME),
            
            # Real Estate (different from sector real estate - these are pure REIT ETFs)
            ('IYR', ETFCategory.REAL_ESTATE),
            ('SCHH', ETFCategory.REAL_ESTATE),
            ('USRT', ETFCategory.REAL_ESTATE),
            
            # Commodities
            ('GLD', ETFCategory.COMMODITIES),
            ('IAU', ETFCategory.COMMODITIES),
            ('SLV', ETFCategory.COMMODITIES),
            ('USO', ETFCategory.COMMODITIES),
            ('DBA', ETFCategory.COMMODITIES),
            ('DBC', ETFCategory.COMMODITIES),
        ]
        
        for symbol, expected_category in asset_class_tests:
            with self.subTest(symbol=symbol, expected=expected_category):
                classification = self.service.classify_etf(symbol)
                self.assertEqual(
                    classification.category, 
                    expected_category,
                    f"{symbol} should be classified as {expected_category.value}"
                )
                self.assertEqual(classification.confidence, 1.0)
    
    def test_international_etf_classification(self):
        """Test that international ETFs are correctly classified."""
        international_symbols = [
            'VXUS', 'EFA', 'VEA', 'IEFA', 'SCHF',  # Developed markets
            'EEM', 'VWO', 'IEMG', 'SCHE',          # Emerging markets
            'EWJ', 'EWZ', 'FXI', 'EWG', 'EWU'      # Regional
        ]
        
        for symbol in international_symbols:
            with self.subTest(symbol=symbol):
                classification = self.service.classify_etf(symbol)
                self.assertEqual(
                    classification.category, 
                    ETFCategory.INTERNATIONAL,
                    f"{symbol} should be classified as International ETFs"
                )
                self.assertEqual(
                    classification.category.value,
                    "International ETFs"
                )
                self.assertEqual(classification.confidence, 1.0)
    
    def test_unknown_etf_classification(self):
        """Test that unknown ETFs are classified as Unknown."""
        unknown_symbols = ['UNKNOWN', 'FAKE123', 'NOTREAL']
        
        for symbol in unknown_symbols:
            with self.subTest(symbol=symbol):
                classification = self.service.classify_etf(symbol)
                self.assertEqual(
                    classification.category, 
                    ETFCategory.UNKNOWN,
                    f"{symbol} should be classified as Unknown"
                )
                self.assertEqual(classification.confidence, 0.0)
    
    def test_name_based_inference(self):
        """Test ETF classification based on asset name inference."""
        name_tests = [
            ('CUSTOM1', 'Technology Select ETF', ETFCategory.TECHNOLOGY),
            ('CUSTOM2', 'Healthcare Innovation Fund', ETFCategory.HEALTHCARE),
            ('CUSTOM3', 'Financial Services Trust', ETFCategory.FINANCIAL_SERVICES),
            ('CUSTOM4', 'S&P 500 Index Fund', ETFCategory.BROAD_MARKET),
            ('CUSTOM5', 'Total Market ETF', ETFCategory.BROAD_MARKET),
            ('CUSTOM6', 'Treasury Bond Fund', ETFCategory.FIXED_INCOME),
            ('CUSTOM7', 'Gold Commodity ETF', ETFCategory.COMMODITIES),
            ('CUSTOM8', 'International Developed Markets', ETFCategory.INTERNATIONAL),
            ('CUSTOM9', 'Real Estate Investment Trust', ETFCategory.REAL_ESTATE),
        ]
        
        for symbol, asset_name, expected_category in name_tests:
            with self.subTest(symbol=symbol, name=asset_name):
                classification = self.service.classify_etf(symbol, asset_name)
                self.assertEqual(
                    classification.category, 
                    expected_category,
                    f"{symbol} with name '{asset_name}' should be classified as {expected_category.value}"
                )
                self.assertEqual(classification.confidence, 0.7)  # Lower confidence for inference
    
    def test_is_known_etf_function(self):
        """Test the is_known_etf utility function."""
        known_etfs = ['SPY', 'XLK', 'AGG', 'VEA', 'GLD']
        unknown_symbols = ['AAPL', 'MSFT', 'UNKNOWN123']
        
        for symbol in known_etfs:
            with self.subTest(symbol=symbol):
                self.assertTrue(
                    is_known_etf(symbol),
                    f"{symbol} should be recognized as a known ETF"
                )
                
        for symbol in unknown_symbols:
            with self.subTest(symbol=symbol):
                self.assertFalse(
                    is_known_etf(symbol),
                    f"{symbol} should not be recognized as a known ETF"
                )
    
    def test_case_insensitive_handling(self):
        """Test that ETF classification is case insensitive."""
        test_cases = [
            ('spy', 'SPY'),
            ('xlk', 'XLK'),
            ('agg', 'AGG'),
            ('vea', 'VEA'),
        ]
        
        for lower_symbol, upper_symbol in test_cases:
            with self.subTest(lower=lower_symbol, upper=upper_symbol):
                lower_classification = self.service.classify_etf(lower_symbol)
                upper_classification = self.service.classify_etf(upper_symbol)
                
                self.assertEqual(
                    lower_classification.category,
                    upper_classification.category,
                    f"Classification should be case insensitive for {lower_symbol}/{upper_symbol}"
                )
    
    def test_whitespace_handling(self):
        """Test that ETF classification handles whitespace correctly."""
        test_symbol = '  SPY  '
        classification = self.service.classify_etf(test_symbol)
        
        self.assertEqual(classification.symbol, 'SPY')
        self.assertEqual(classification.category, ETFCategory.BROAD_MARKET)
    
    def test_get_all_known_etfs(self):
        """Test that get_all_known_etfs returns a comprehensive set."""
        all_etfs = self.service.get_all_known_etfs()
        
        # Should include representatives from each category
        expected_etfs = {'SPY', 'XLK', 'AGG', 'VEA', 'GLD', 'VNQ'}
        
        for etf in expected_etfs:
            with self.subTest(etf=etf):
                self.assertIn(
                    etf, 
                    all_etfs,
                    f"{etf} should be in the set of all known ETFs"
                )
        
        # Should be a reasonable number of ETFs (more than 50, less than 200)
        self.assertGreater(len(all_etfs), 50, "Should have a good number of known ETFs")
        self.assertLess(len(all_etfs), 200, "Shouldn't have too many ETFs to be manageable")
    
    def test_etf_classification_data_structure(self):
        """Test that ETFClassification objects have the correct structure."""
        classification = self.service.classify_etf('SPY')
        
        # Check all required fields are present
        self.assertIsInstance(classification.symbol, str)
        self.assertIsInstance(classification.category, ETFCategory)
        self.assertIsInstance(classification.description, str)
        self.assertIsInstance(classification.confidence, float)
        
        # Check value ranges
        self.assertGreaterEqual(classification.confidence, 0.0)
        self.assertLessEqual(classification.confidence, 1.0)
        
        # Check non-empty strings
        self.assertTrue(classification.symbol)
        self.assertTrue(classification.description)
    
    def test_sector_allocation_integration(self):
        """Test the main function used for sector allocation charts."""
        test_cases = [
            ('SPY', 'Broad ETFs'),
            ('XLK', 'Technology'),
            ('XLF', 'Financial Services'),
            ('AGG', 'Fixed Income'),
            ('VNQ', 'Real Estate'),
            ('GLD', 'Commodities'),
            ('VEA', 'International ETFs'),
            ('UNKNOWN', 'Unknown'),
        ]
        
        for symbol, expected_sector in test_cases:
            with self.subTest(symbol=symbol):
                sector = get_etf_sector_for_allocation(symbol)
                self.assertEqual(
                    sector,
                    expected_sector,
                    f"get_etf_sector_for_allocation({symbol}) should return '{expected_sector}'"
                )
    
    def test_service_singleton(self):
        """Test that multiple service instances work consistently."""
        service1 = ETFCategorizationService()
        service2 = ETFCategorizationService()
        
        test_symbols = ['SPY', 'XLK', 'AGG']
        
        for symbol in test_symbols:
            with self.subTest(symbol=symbol):
                classification1 = service1.classify_etf(symbol)
                classification2 = service2.classify_etf(symbol)
                
                self.assertEqual(
                    classification1.category,
                    classification2.category,
                    f"Multiple service instances should give consistent results for {symbol}"
                )


class TestETFCategorizationEdgeCases(unittest.TestCase):
    """Test edge cases and error handling for ETF categorization."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.service = ETFCategorizationService()
    
    def test_empty_symbol(self):
        """Test handling of empty symbol."""
        classification = self.service.classify_etf('')
        self.assertEqual(classification.category, ETFCategory.UNKNOWN)
        self.assertEqual(classification.confidence, 0.0)
    
    def test_none_symbol(self):
        """Test handling of None symbol."""
        # This should handle gracefully without throwing
        try:
            classification = self.service.classify_etf(None)
            # If it doesn't throw, it should return Unknown
            self.assertEqual(classification.category, ETFCategory.UNKNOWN)
        except (TypeError, AttributeError):
            # This is also acceptable behavior
            pass
    
    def test_numeric_symbol(self):
        """Test handling of numeric symbols."""
        classification = self.service.classify_etf('123')
        self.assertEqual(classification.category, ETFCategory.UNKNOWN)
    
    def test_special_characters(self):
        """Test handling of symbols with special characters."""
        special_symbols = ['SPY.', 'XLK-', 'AGG@', 'VEA#']
        
        for symbol in special_symbols:
            with self.subTest(symbol=symbol):
                classification = self.service.classify_etf(symbol)
                # Should handle gracefully, likely returning Unknown
                self.assertIsInstance(classification, ETFClassification)
    
    def test_very_long_symbol(self):
        """Test handling of unusually long symbols."""
        long_symbol = 'A' * 50
        classification = self.service.classify_etf(long_symbol)
        self.assertEqual(classification.category, ETFCategory.UNKNOWN)
    
    def test_partial_name_matching(self):
        """Test that partial keyword matching works correctly."""
        # Should match "tech" in "FinTech Innovation Fund"
        classification = self.service.classify_etf('TEST', 'FinTech Innovation Fund')
        self.assertEqual(classification.category, ETFCategory.TECHNOLOGY)
        
        # Should not match partial words incorrectly
        classification = self.service.classify_etf('TEST', 'Authentic Food Solutions')
        # "tech" in "Authentic" shouldn't trigger technology classification
        self.assertNotEqual(classification.category, ETFCategory.TECHNOLOGY)


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)