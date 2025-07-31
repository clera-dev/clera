#!/usr/bin/env python3

import unittest
from unittest.mock import Mock, patch, MagicMock
from typing import List, Optional

from alpaca.trading.models import Watchlist, Asset
from alpaca.broker.client import BrokerClient

from utils.alpaca.watchlist import (
    get_or_create_default_watchlist,
    get_watchlist_symbols,
    DEFAULT_WATCHLIST_SYMBOLS
)


class TestWatchlistFix(unittest.TestCase):
    """Test suite for the watchlist stale data fix."""

    def setUp(self):
        """Set up test fixtures."""
        self.account_id = "test-account-123"
        self.watchlist_id = "test-watchlist-456"
        self.mock_broker_client = Mock(spec=BrokerClient)
        
        # Create a mock watchlist with empty assets
        self.empty_watchlist = Mock(spec=Watchlist)
        self.empty_watchlist.id = self.watchlist_id
        self.empty_watchlist.name = "My Watchlist"
        self.empty_watchlist.assets = []
        
        # Create a mock watchlist with populated assets
        self.populated_watchlist = Mock(spec=Watchlist)
        self.populated_watchlist.id = self.watchlist_id
        self.populated_watchlist.name = "My Watchlist"
        self.populated_watchlist.assets = [
            Mock(spec=Asset, symbol="SPY"),
            Mock(spec=Asset, symbol="AGG"),
            Mock(spec=Asset, symbol="DIA"),
            Mock(spec=Asset, symbol="QQQ")
        ]

    def test_get_or_create_default_watchlist_returns_fresh_instance_after_adding_symbols(self):
        """Test that the function returns a fresh watchlist instance after adding default symbols."""
        # Mock the initial watchlist fetch (returns empty watchlist)
        self.mock_broker_client.get_watchlists_for_account.return_value = [self.empty_watchlist]
        
        # Mock get_watchlist_symbols to return empty list (indicating empty watchlist)
        with patch('utils.alpaca.watchlist.get_watchlist_symbols', return_value=[]):
            # Mock add_symbol_to_watchlist to succeed
            with patch('utils.alpaca.watchlist.add_symbol_to_watchlist', return_value=True):
                # Mock the final fetch to return populated watchlist
                self.mock_broker_client.get_watchlist_for_account_by_id.return_value = self.populated_watchlist
                
                # Call the function
                result = get_or_create_default_watchlist(self.account_id, self.mock_broker_client)
                
                # Verify the result is the populated watchlist, not the empty one
                self.assertIsNotNone(result)
                self.assertEqual(result.id, self.watchlist_id)
                self.assertEqual(len(result.assets), 4)
                self.assertEqual([asset.symbol for asset in result.assets], DEFAULT_WATCHLIST_SYMBOLS)
                
                # Verify that get_watchlist_for_account_by_id was called to fetch fresh data
                self.mock_broker_client.get_watchlist_for_account_by_id.assert_called_once_with(
                    account_id=self.account_id,
                    watchlist_id=self.watchlist_id
                )

    def test_get_or_create_default_watchlist_returns_original_if_fetch_fails(self):
        """Test that the function returns the original watchlist if fetching updated data fails."""
        # Mock the initial watchlist fetch (returns empty watchlist)
        self.mock_broker_client.get_watchlists_for_account.return_value = [self.empty_watchlist]
        
        # Mock get_watchlist_symbols to return empty list
        with patch('utils.alpaca.watchlist.get_watchlist_symbols', return_value=[]):
            # Mock add_symbol_to_watchlist to succeed
            with patch('utils.alpaca.watchlist.add_symbol_to_watchlist', return_value=True):
                # Mock the final fetch to fail (return None)
                self.mock_broker_client.get_watchlist_for_account_by_id.return_value = None
                
                # Call the function
                result = get_or_create_default_watchlist(self.account_id, self.mock_broker_client)
                
                # Verify the result is the original empty watchlist
                self.assertIsNotNone(result)
                self.assertEqual(result.id, self.watchlist_id)
                self.assertEqual(len(result.assets), 0)  # Still empty
                
                # Verify that get_watchlist_for_account_by_id was called
                self.mock_broker_client.get_watchlist_for_account_by_id.assert_called_once_with(
                    account_id=self.account_id,
                    watchlist_id=self.watchlist_id
                )

    def test_get_or_create_default_watchlist_returns_original_if_not_empty(self):
        """Test that the function returns the original watchlist if it's not empty."""
        # Mock the initial watchlist fetch (returns populated watchlist)
        self.mock_broker_client.get_watchlists_for_account.return_value = [self.populated_watchlist]
        
        # Mock get_watchlist_symbols to return populated list
        with patch('utils.alpaca.watchlist.get_watchlist_symbols', return_value=DEFAULT_WATCHLIST_SYMBOLS):
            # Call the function
            result = get_or_create_default_watchlist(self.account_id, self.mock_broker_client)
            
            # Verify the result is the original populated watchlist
            self.assertIsNotNone(result)
            self.assertEqual(result.id, self.watchlist_id)
            self.assertEqual(len(result.assets), 4)
            
            # Verify that get_watchlist_for_account_by_id was NOT called (no need to fetch fresh data)
            self.mock_broker_client.get_watchlist_for_account_by_id.assert_not_called()

    def test_get_or_create_default_watchlist_handles_add_symbol_failures(self):
        """Test that the function handles failures when adding individual symbols."""
        # Mock the initial watchlist fetch (returns empty watchlist)
        self.mock_broker_client.get_watchlists_for_account.return_value = [self.empty_watchlist]
        
        # Mock get_watchlist_symbols to return empty list
        with patch('utils.alpaca.watchlist.get_watchlist_symbols', return_value=[]):
            # Mock add_symbol_to_watchlist to fail for some symbols
            def mock_add_symbol(account_id, symbol, watchlist_id, broker_client):
                if symbol in ["SPY", "AGG"]:
                    return True
                else:
                    return False
            
            with patch('utils.alpaca.watchlist.add_symbol_to_watchlist', side_effect=mock_add_symbol):
                # Mock the final fetch to return partially populated watchlist
                partial_watchlist = Mock(spec=Watchlist)
                partial_watchlist.id = self.watchlist_id
                partial_watchlist.name = "My Watchlist"
                partial_watchlist.assets = [
                    Mock(spec=Asset, symbol="SPY"),
                    Mock(spec=Asset, symbol="AGG")
                ]
                self.mock_broker_client.get_watchlist_for_account_by_id.return_value = partial_watchlist
                
                # Call the function
                result = get_or_create_default_watchlist(self.account_id, self.mock_broker_client)
                
                # Verify the result is the updated watchlist with partial symbols
                self.assertIsNotNone(result)
                self.assertEqual(result.id, self.watchlist_id)
                self.assertEqual(len(result.assets), 2)
                self.assertEqual([asset.symbol for asset in result.assets], ["SPY", "AGG"])

    def test_get_or_create_default_watchlist_creates_new_watchlist_if_none_exists(self):
        """Test that the function creates a new watchlist if none exists."""
        # Mock the initial watchlist fetch to return None (no watchlist exists)
        self.mock_broker_client.get_watchlists_for_account.return_value = []
        
        # Mock create_default_watchlist_for_account to return a new watchlist
        new_watchlist = Mock(spec=Watchlist)
        new_watchlist.id = "new-watchlist-789"
        new_watchlist.name = "My Watchlist"
        new_watchlist.assets = [
            Mock(spec=Asset, symbol=symbol) for symbol in DEFAULT_WATCHLIST_SYMBOLS
        ]
        
        with patch('utils.alpaca.watchlist.create_default_watchlist_for_account', return_value=new_watchlist):
            # Call the function
            result = get_or_create_default_watchlist(self.account_id, self.mock_broker_client)
            
            # Verify the result is the newly created watchlist
            self.assertIsNotNone(result)
            self.assertEqual(result.id, "new-watchlist-789")
            self.assertEqual(len(result.assets), 4)
            self.assertEqual([asset.symbol for asset in result.assets], DEFAULT_WATCHLIST_SYMBOLS)
            
            # Verify that get_watchlist_for_account_by_id was NOT called (no need to fetch fresh data)
            self.mock_broker_client.get_watchlist_for_account_by_id.assert_not_called()

    def test_get_or_create_default_watchlist_handles_exceptions_gracefully(self):
        """Test that the function handles exceptions gracefully."""
        # Mock the initial watchlist fetch to raise an exception
        self.mock_broker_client.get_watchlists_for_account.side_effect = Exception("API Error")
        
        # Mock create_default_watchlist_for_account to also fail
        with patch('utils.alpaca.watchlist.create_default_watchlist_for_account', return_value=None):
            # Call the function
            result = get_or_create_default_watchlist(self.account_id, self.mock_broker_client)
            
            # Verify the result is None due to exception
            self.assertIsNone(result)

    def test_integration_with_get_watchlist_symbols(self):
        """Test integration with get_watchlist_symbols to ensure data consistency."""
        # Mock the initial watchlist fetch (returns empty watchlist)
        self.mock_broker_client.get_watchlists_for_account.return_value = [self.empty_watchlist]
        
        # Mock get_watchlist_symbols to return empty list initially, then populated list
        symbols_call_count = 0
        def mock_get_symbols(account_id, watchlist_id, broker_client):
            nonlocal symbols_call_count
            symbols_call_count += 1
            if symbols_call_count == 1:
                return []  # First call: empty
            else:
                return DEFAULT_WATCHLIST_SYMBOLS  # Subsequent calls: populated
        
        with patch('utils.alpaca.watchlist.get_watchlist_symbols', side_effect=mock_get_symbols):
            # Mock add_symbol_to_watchlist to succeed
            with patch('utils.alpaca.watchlist.add_symbol_to_watchlist', return_value=True):
                # Mock the final fetch to return populated watchlist
                self.mock_broker_client.get_watchlist_for_account_by_id.return_value = self.populated_watchlist
                
                # Call the function
                result = get_or_create_default_watchlist(self.account_id, self.mock_broker_client)
                
                # Verify the result has the expected symbols
                self.assertIsNotNone(result)
                result_symbols = [asset.symbol for asset in result.assets]
                self.assertEqual(result_symbols, DEFAULT_WATCHLIST_SYMBOLS)
                
                # Verify that get_watchlist_symbols was called at least once
                # (to check if the watchlist is empty)
                self.assertGreaterEqual(symbols_call_count, 1)


if __name__ == '__main__':
    unittest.main() 