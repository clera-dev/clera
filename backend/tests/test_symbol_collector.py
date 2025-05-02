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
    with patch('portfolio_realtime.symbol_collector.BrokerClient') as mock_broker:
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Mock accounts
        test_accounts = [
            MagicMock(id="test-account-1"),
            MagicMock(id="test-account-2")
        ]
        
        # Mock positions for account 1
        test_positions_1 = [
            {
                "symbol": "AAPL",
                "qty": "10",
                "current_price": "150.00",
                "market_value": "1500.00"
            },
            {
                "symbol": "MSFT",
                "qty": "5",
                "current_price": "300.00",
                "market_value": "1500.00"
            }
        ]
        
        # Mock positions for account 2
        test_positions_2 = [
            {
                "symbol": "GOOGL",
                "qty": "3",
                "current_price": "2500.00",
                "market_value": "7500.00"
            },
            {
                "symbol": "AAPL",  # Duplicate with account 1
                "qty": "20",
                "current_price": "150.00",
                "market_value": "3000.00"
            }
        ]
        
        # Configure mock methods
        mock_instance.get_all_accounts.return_value = test_accounts
        mock_instance.get_all_positions_for_account.side_effect = lambda account_id: {
            "test-account-1": test_positions_1,
            "test-account-2": test_positions_2
        }.get(account_id, [])
        
        yield mock_instance, test_accounts, {
            "test-account-1": test_positions_1,
            "test-account-2": test_positions_2
        }

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
        positions_key = f'account_positions:{account.id}'
        assert redis_client.exists(positions_key)
        stored_positions = json.loads(redis_client.get(positions_key))
        assert stored_positions == test_positions_map[account.id]
    
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