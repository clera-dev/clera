import unittest
import asyncio
import json
import os
from unittest.mock import patch, MagicMock, AsyncMock

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.symbol_collector import SymbolCollector


class MockRedis:
    """Mock Redis client for testing."""
    def __init__(self):
        self.data = {}
        self.published = {}
    
    def set(self, key, value):
        self.data[key] = value
        return True
    
    def setex(self, key, ttl, value):
        self.data[key] = value
        return True
    
    def get(self, key):
        return self.data.get(key)
    
    def delete(self, key):
        if key in self.data:
            del self.data[key]
            return 1
        return 0
    
    def keys(self, pattern):
        return [k.encode('utf-8') for k in self.data.keys() if k.startswith(pattern.replace('*', ''))]
    
    def publish(self, channel, message):
        if channel not in self.published:
            self.published[channel] = []
        self.published[channel].append(message)
        return len(self.published[channel])


class MockPosition:
    """Mock Position object for testing."""
    def __init__(self, symbol, qty, market_value, current_price):
        self.symbol = symbol
        self.qty = qty
        self.market_value = market_value
        self.current_price = current_price
        self.cost_basis = str(float(current_price) * 0.9)  # Just for testing
        self.unrealized_pl = str(float(market_value) * 0.1)  # Just for testing
        self.unrealized_plpc = "0.1"  # Just for testing
        self.asset_id = f"asset_{symbol}"
        self.asset_class = "us_equity"
        self.asset_marginable = True
        self.avg_entry_price = str(float(current_price) * 0.9)
        self.side = "long"
        self.exchange = "NASDAQ"


class MockBrokerClient:
    """Mock BrokerClient for testing."""
    def __init__(self, positions=None):
        self.positions = positions or {}
    
    def get_all_accounts_positions(self):
        """Mock the get_all_accounts_positions method."""
        return MockAllAccountsPositions(self.positions)


class MockAllAccountsPositions:
    """Mock AllAccountsPositions object for testing."""
    def __init__(self, positions):
        self.positions = positions


class TestSymbolCollector(unittest.TestCase):
    """Test cases for the Symbol Collector component."""

    def setUp(self):
        """Set up test environment."""
        # Create mock Redis client
        self.redis_mock = MockRedis()
        
        # Create test positions data
        self.test_positions = {
            'account1': [
                MockPosition('AAPL', '10', '1500.0', '150.0'),
                MockPosition('MSFT', '5', '1250.0', '250.0')
            ],
            'account2': [
                MockPosition('AAPL', '2', '300.0', '150.0'),
                MockPosition('GOOGL', '1', '2800.0', '2800.0')
            ]
        }
        
        # Create mock broker client
        self.broker_mock = MockBrokerClient(self.test_positions)
        
        # Create Symbol Collector instance with mocks
        self.collector = SymbolCollector()
        self.collector.redis_client = self.redis_mock
        self.collector.broker_client = self.broker_mock
    
    @patch('portfolio_realtime.symbol_collector.redis.Redis')
    @patch('portfolio_realtime.symbol_collector.BrokerClient')
    def test_initialization(self, mock_broker, mock_redis):
        """Test proper initialization of the Symbol Collector."""
        # Arrange
        mock_redis_instance = MagicMock()
        mock_broker_instance = MagicMock()
        mock_redis.return_value = mock_redis_instance
        mock_broker.return_value = mock_broker_instance
        
        # Act
        collector = SymbolCollector(
            redis_host='test-redis',
            redis_port=1234,
            redis_db=2,
            broker_api_key='test-key',
            broker_secret_key='test-secret',
            sandbox=True
        )
        
        # Assert
        mock_redis.assert_called_once_with(host='test-redis', port=1234, db=2)
        mock_broker.assert_called_once_with(
            api_key='test-key',
            secret_key='test-secret',
            sandbox=True
        )
        self.assertEqual(collector.unique_symbols, set())
        self.assertEqual(collector.all_account_positions, {})
    
    def test_collect_symbols(self):
        """Test collecting and processing symbols."""
        # Act
        result = asyncio.run(self.collector.collect_symbols())
        
        # Assert
        # Check that the correct unique symbols were identified
        self.assertEqual(self.collector.unique_symbols, {'AAPL', 'MSFT', 'GOOGL'})
        
        # Check that the symbols were stored in Redis
        symbols_json = self.redis_mock.get('tracked_symbols')
        self.assertIsNotNone(symbols_json)
        
        # Check that symbols_to_add and symbols_to_remove were returned correctly
        symbols_to_add, symbols_to_remove = result
        self.assertEqual(symbols_to_add, {'AAPL', 'MSFT', 'GOOGL'})
        self.assertEqual(symbols_to_remove, set())
        
        # Check that positions were stored in Redis for each account
        for account_id in self.test_positions:
            positions_json = self.redis_mock.get(f'account_positions:{account_id}')
            self.assertIsNotNone(positions_json)
            
            # Deserialize positions and verify content
            positions = json.loads(positions_json)
            self.assertEqual(len(positions), len(self.test_positions[account_id]))
            
            # Check that a symbol update was published to Redis
            self.assertIn('symbol_updates', self.redis_mock.published)
            update_msg = json.loads(self.redis_mock.published['symbol_updates'][0])
            self.assertIn('add', update_msg)
            self.assertIn('remove', update_msg)
            self.assertIn('timestamp', update_msg)
    
    def test_add_remove_symbols(self):
        """Test adding and removing symbols in subsequent collection runs."""
        # First run to establish initial state
        asyncio.run(self.collector.collect_symbols())
        self.redis_mock.published.clear()  # Clear published messages
        
        # Modify positions for the second run
        new_positions = {
            'account1': [
                MockPosition('AAPL', '10', '1500.0', '150.0'),
                # MSFT removed
                MockPosition('NFLX', '3', '1200.0', '400.0')  # New symbol
            ],
            'account2': [
                MockPosition('AAPL', '2', '300.0', '150.0'),
                MockPosition('GOOGL', '1', '2800.0', '2800.0')
            ]
        }
        self.broker_mock.positions = new_positions
        
        # Second run to test add/remove
        symbols_to_add, symbols_to_remove = asyncio.run(self.collector.collect_symbols())
        
        # Assert symbols_to_add and symbols_to_remove were correct
        self.assertEqual(symbols_to_add, {'NFLX'})
        self.assertEqual(symbols_to_remove, {'MSFT'})
        
        # Check that the unique symbols set was updated
        self.assertEqual(self.collector.unique_symbols, {'AAPL', 'GOOGL', 'NFLX'})
        
        # Check the published updates
        update_msg = json.loads(self.redis_mock.published['symbol_updates'][0])
        self.assertEqual(update_msg['add'], ['NFLX'])
        self.assertEqual(update_msg['remove'], ['MSFT'])
    
    def test_error_handling(self):
        """Test error handling in the collect_symbols method."""
        # Mock BrokerClient to raise an exception
        self.broker_mock.get_all_accounts_positions = MagicMock(side_effect=Exception("Test Error"))
        
        # Act - this should not raise an exception
        symbols_to_add, symbols_to_remove = asyncio.run(self.collector.collect_symbols())
        
        # Assert the method handled the error and returned empty sets
        self.assertEqual(symbols_to_add, set())
        self.assertEqual(symbols_to_remove, set())


if __name__ == '__main__':
    unittest.main() 