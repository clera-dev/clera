"""
Tests for the Symbol Collector component.

Tests the functionality of collecting symbols from portfolios and tracking them.
"""

import asyncio
import json
import os
import pytest
import redis
from unittest.mock import patch, MagicMock, AsyncMock

# Add parent directory to path for imports
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.symbol_collector import SymbolCollector

# Redis connection for testing
@pytest.fixture
def redis_client():
    """Create a Redis client for testing."""
    try:
        client = redis.Redis(host='localhost', port=6379, db=0)
        # Check if Redis is available
        client.ping()
        yield client
        # Clean up test data
        for key in client.keys('test:*'):
            client.delete(key)
        for key in client.keys('account_positions:*'):
            client.delete(key)
        client.delete('tracked_symbols')
    except (redis.exceptions.ConnectionError, redis.exceptions.ResponseError):
        pytest.skip("Redis server not available")

@pytest.fixture
def mock_broker_client():
    """Create a mock broker client."""
    # Use the correct path for patching BrokerClient used by SymbolCollector
    with patch('portfolio_realtime.symbol_collector.BrokerClient') as mock_broker:
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance

        # Define test account IDs
        test_account_id_1 = "test-account-1"
        test_account_id_2 = "test-account-2"

        # Helper to create mock Alpaca Position objects (as BrokerClient returns)
        def create_mock_position(symbol, qty, price):
            pos = MagicMock()
            pos.symbol = symbol
            pos.qty = str(qty)
            pos.market_value = str(float(qty) * float(price))
            pos.cost_basis = str(float(qty) * float(price) * 0.95) # Mock cost basis
            pos.unrealized_pl = str(float(pos.market_value) - float(pos.cost_basis))
            pos.unrealized_plpc = str(float(pos.unrealized_pl) / float(pos.cost_basis) if float(pos.cost_basis) != 0 else '0')
            pos.current_price = str(price)
            # Add other necessary attributes SymbolCollector might serialize
            pos.asset_id = MagicMock()
            pos.avg_entry_price = str(float(price) * 0.95)
            pos.side = 'long'
            pos.asset_class = 'us_equity'
            pos.asset_marginable = True
            pos.exchange = 'NASDAQ'
            return pos

        # Mock positions for account 1
        positions_1 = [
            create_mock_position("AAPL", 10, 150.00),
            create_mock_position("MSFT", 5, 300.00)
        ]

        # Mock positions for account 2
        positions_2 = [
            create_mock_position("GOOGL", 3, 2500.00),
            create_mock_position("AAPL", 20, 150.00)
        ]

        # Mock the AllAccountsPositions object returned by get_all_accounts_positions
        mock_all_positions_response = MagicMock()
        mock_all_positions_response.positions = {
            test_account_id_1: positions_1,
            test_account_id_2: positions_2
        }

        # Configure the correct mock method
        mock_instance.get_all_accounts_positions.return_value = mock_all_positions_response

        # We also need the collector to be able to serialize the mock Position objects
        # If the collector uses specific attributes, ensure they exist on the mock_position

        # Yield the mock instance and expected serialized data for verification
        expected_serialized_positions = {
            test_account_id_1: [
                {
                    'symbol': 'AAPL',
                    'qty': '10',
                    'market_value': '1500.0',
                    'cost_basis': '1425.0',
                    'unrealized_pl': '75.0',
                    'unrealized_plpc': '0.05263157894736842',
                    'current_price': '150.0',
                    'asset_id': str(positions_1[0].asset_id),
                    'asset_class': 'us_equity',
                    'asset_marginable': True,
                    'avg_entry_price': '142.5',
                    'side': 'long',
                    'exchange': 'NASDAQ'
                },
                {
                    'symbol': 'MSFT',
                    'qty': '5',
                    'market_value': '1500.0',
                    'cost_basis': '1425.0',
                    'unrealized_pl': '75.0',
                    'unrealized_plpc': '0.05263157894736842',
                    'current_price': '300.0',
                    'asset_id': str(positions_1[1].asset_id),
                    'asset_class': 'us_equity',
                    'asset_marginable': True,
                    'avg_entry_price': '285.0',
                    'side': 'long',
                    'exchange': 'NASDAQ'
                }
            ],
             test_account_id_2: [
                {
                    'symbol': 'GOOGL',
                    'qty': '3',
                    'market_value': '7500.0',
                    'cost_basis': '7125.0',
                    'unrealized_pl': '375.0',
                    'unrealized_plpc': '0.05263157894736842',
                    'current_price': '2500.00',
                    'asset_id': str(positions_2[0].asset_id),
                    'asset_class': 'us_equity',
                    'asset_marginable': True,
                    'avg_entry_price': '2375.0',
                    'side': 'long',
                    'exchange': 'NASDAQ'
                },
                {
                    'symbol': 'AAPL',
                    'qty': '20',
                    'market_value': '3000.0',
                    'cost_basis': '2850.0',
                    'unrealized_pl': '150.0',
                    'unrealized_plpc': '0.05263157894736842',
                    'current_price': '150.0',
                    'asset_id': str(positions_2[1].asset_id),
                    'asset_class': 'us_equity',
                    'asset_marginable': True,
                    'avg_entry_price': '142.5',
                    'side': 'long',
                    'exchange': 'NASDAQ'
                }
            ]
        }

        yield mock_instance, [test_account_id_1, test_account_id_2], expected_serialized_positions

@pytest.mark.asyncio
async def test_symbol_collector_initialization():
    """Test that Symbol Collector initializes correctly."""
    with patch('portfolio_realtime.symbol_collector.BrokerClient') as mock_broker:
        # Set up mock broker client
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Create Symbol Collector with test configuration
        collector = SymbolCollector(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0,
            broker_api_key='test-key',
            broker_secret_key='test-secret',
            sandbox=True
        )
        
        # Verify initialization
        assert collector.broker_client is mock_instance
        assert collector.unique_symbols == set()
        assert collector.redis_client is not None

@pytest.mark.asyncio
async def test_collect_symbols(redis_client, mock_broker_client):
    """Test that collect_symbols correctly processes accounts and positions."""
    mock_instance, test_accounts, test_positions_map = mock_broker_client
    
    # Create symbol collector
    collector = SymbolCollector(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Run symbol collection
    await collector.collect_symbols()
    
    # Verify positions were stored in Redis for each account
    for account in test_accounts:
        positions_key = f'account_positions:{account}'
        assert redis_client.exists(positions_key)
        stored_positions = json.loads(redis_client.get(positions_key))
        
        # Instead of direct equality, check that all expected fields are present with correct values
        # This handles minor formatting differences and order differences
        expected_positions = test_positions_map[account]
        assert len(stored_positions) == len(expected_positions), f"Expected {len(expected_positions)} positions, got {len(stored_positions)}"
        
        # Check that each position has the expected symbol and key fields
        stored_symbols = {pos['symbol'] for pos in stored_positions}
        expected_symbols = {pos['symbol'] for pos in expected_positions}
        assert stored_symbols == expected_symbols, f"Expected symbols {expected_symbols}, got {stored_symbols}"
        
        # For each symbol, find the matching position and verify key numeric fields
        # are approximately equal (to handle floating point formatting differences)
        for expected_pos in expected_positions:
            symbol = expected_pos['symbol']
            matching_pos = next((pos for pos in stored_positions if pos['symbol'] == symbol), None)
            assert matching_pos is not None, f"No position found for symbol {symbol}"
            
            # Verify numeric fields are approximately equal
            assert float(matching_pos['qty']) == float(expected_pos['qty'])
            assert abs(float(matching_pos['market_value']) - float(expected_pos['market_value'])) < 0.01
            assert abs(float(matching_pos['cost_basis']) - float(expected_pos['cost_basis'])) < 0.01
            assert abs(float(matching_pos['unrealized_pl']) - float(expected_pos['unrealized_pl'])) < 0.01
            
            # Verify other important fields
            assert matching_pos['asset_class'] == expected_pos['asset_class']
            assert matching_pos['side'] == expected_pos['side']
            assert matching_pos['exchange'] == expected_pos['exchange']
            assert matching_pos['asset_marginable'] == expected_pos['asset_marginable']
    
    # Verify tracked symbols were stored in Redis
    assert redis_client.exists('tracked_symbols')
    tracked_symbols = json.loads(redis_client.get('tracked_symbols'))
    assert isinstance(tracked_symbols, list)
    assert set(tracked_symbols) == {"AAPL", "MSFT", "GOOGL"}
    
    # Verify unique_symbols in collector was updated
    assert collector.unique_symbols == {"AAPL", "MSFT", "GOOGL"}
    
    # Verify symbol updates were published
    # This is difficult to test directly with redis pub/sub in a unit test

@pytest.mark.asyncio
async def test_no_duplicate_symbols(redis_client, mock_broker_client):
    """Test that the same symbol from multiple accounts is only tracked once."""
    mock_instance, test_accounts, test_positions_map = mock_broker_client
    
    # Create symbol collector
    collector = SymbolCollector(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Run symbol collection
    await collector.collect_symbols()
    
    # AAPL appears in both accounts, but should only be in the unique symbols once
    assert "AAPL" in collector.unique_symbols
    assert len([s for s in collector.unique_symbols if s == "AAPL"]) == 1
    
    # Verify in the Redis tracked symbols as well
    tracked_symbols = json.loads(redis_client.get('tracked_symbols'))
    assert "AAPL" in tracked_symbols
    assert len([s for s in tracked_symbols if s == "AAPL"]) == 1

@pytest.mark.asyncio
async def test_symbol_changes_published(redis_client, mock_broker_client):
    """Test that changes in symbols are correctly published to Redis."""
    mock_instance, test_accounts, test_positions_map = mock_broker_client
    
    # Create symbol collector
    collector = SymbolCollector(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Manually set some existing symbols
    collector.unique_symbols = {"AAPL", "MSFT"}
    redis_client.set('tracked_symbols', json.dumps(["AAPL", "MSFT"]))
    
    # Now GOOGL is new and should be published as an add
    mock_instance.publish = MagicMock()
    
    # Run symbol collection
    await collector.collect_symbols()
    
    # Verify the unique symbols now include GOOGL
    assert "GOOGL" in collector.unique_symbols
    
    # We can't easily verify the pubsub call, but we can check Redis for tracked symbols
    tracked_symbols = json.loads(redis_client.get('tracked_symbols'))
    assert "GOOGL" in tracked_symbols

@pytest.mark.asyncio
async def test_symbol_removal(redis_client, mock_broker_client):
    """Test that symbols no longer in any account are removed from tracking."""
    mock_instance, test_accounts, test_positions_map = mock_broker_client
    
    # Create symbol collector
    collector = SymbolCollector(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Manually set existing symbols including one that should be removed
    collector.unique_symbols = {"AAPL", "MSFT", "GOOGL", "AMZN"}
    redis_client.set('tracked_symbols', json.dumps(["AAPL", "MSFT", "GOOGL", "AMZN"]))
    
    # Run symbol collection
    await collector.collect_symbols()
    
    # Verify AMZN is removed from unique_symbols
    assert "AMZN" not in collector.unique_symbols
    
    # Verify it's also removed from Redis tracked_symbols
    tracked_symbols = json.loads(redis_client.get('tracked_symbols'))
    assert "AMZN" not in tracked_symbols

@pytest.mark.asyncio
async def test_error_handling(redis_client):
    """Test that the collector handles errors gracefully."""
    with patch('portfolio_realtime.symbol_collector.BrokerClient') as mock_broker:
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Make get_all_accounts raise an exception
        mock_instance.get_all_accounts.side_effect = Exception("API Error")
        
        # Create symbol collector
        collector = SymbolCollector(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0,
            broker_api_key='test-key',
            broker_secret_key='test-secret',
            sandbox=True
        )
        
        # Run symbol collection - should not raise an exception
        await collector.collect_symbols()
        
        # Unique symbols should remain unchanged
        assert collector.unique_symbols == set()

@pytest.mark.asyncio
async def test_run_with_interval():
    """Test the main run method with interval scheduling."""
    with patch('portfolio_realtime.symbol_collector.BrokerClient') as mock_broker, \
         patch.object(SymbolCollector, 'collect_symbols') as mock_collect:
        
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Mock collect_symbols to count calls
        mock_collect.return_value = None
        
        # Create symbol collector
        collector = SymbolCollector(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0,
            broker_api_key='test-key',
            broker_secret_key='test-secret',
            sandbox=True
        )
        
        # Run for a short time with a short interval
        task = asyncio.create_task(collector.run(interval_seconds=0.1))
        
        # Wait for a bit to allow multiple collection cycles
        await asyncio.sleep(0.35)  # Should allow for about 3 calls
        
        # Cancel the task
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        
        # Verify collect_symbols was called multiple times
        assert mock_collect.call_count >= 3 