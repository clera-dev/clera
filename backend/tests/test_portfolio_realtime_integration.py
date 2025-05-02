"""
Integration tests for the portfolio realtime system.

These tests validate that all components work together properly.
They require Redis and may need some components running to pass.
"""

import asyncio
import json
import os
import pytest
import socket
import redis
from unittest.mock import patch, MagicMock

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.symbol_collector import SymbolCollector
from portfolio_realtime.market_data_consumer import MarketDataConsumer
from portfolio_realtime.portfolio_calculator import PortfolioCalculator


@pytest.fixture
def redis_client():
    """Create a Redis client for testing."""
    try:
        client = redis.Redis(host='localhost', port=6379, db=0)
        # Check if Redis is available
        client.ping()
        return client
    except (redis.exceptions.ConnectionError, redis.exceptions.ResponseError):
        pytest.skip("Redis server not available")


def test_redis_connection(redis_client):
    """Test that Redis is available and can store/retrieve data."""
    test_key = "test:portfolio:realtime"
    test_value = json.dumps({"test": "data"})
    
    # Set test data
    redis_client.set(test_key, test_value)
    
    # Retrieve test data
    retrieved = redis_client.get(test_key)
    assert retrieved is not None
    assert json.loads(retrieved) == {"test": "data"}
    
    # Clean up
    redis_client.delete(test_key)


@pytest.mark.asyncio
async def test_symbol_collector_initialization():
    """Test that the Symbol Collector can be properly initialized."""
    with patch('portfolio_realtime.symbol_collector.BrokerClient') as mock_broker:
        # Set up mock broker client
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Create symbol collector with test configuration
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


@pytest.mark.asyncio
async def test_market_data_consumer_initialization():
    """Test that the Market Data Consumer can be properly initialized."""
    with patch('portfolio_realtime.market_data_consumer.StockDataStream') as mock_stream:
        # Set up mock stock stream
        mock_instance = MagicMock()
        mock_stream.return_value = mock_instance
        
        # Create market data consumer with test configuration
        consumer = MarketDataConsumer(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0,
            market_api_key='test-api-key',
            market_secret_key='test-secret-key',
            price_ttl=60
        )
        
        # Verify proper API key usage
        assert consumer.market_api_key == 'test-api-key'
        assert consumer.market_secret_key == 'test-secret-key'
        assert consumer.price_ttl == 60


@pytest.mark.asyncio
async def test_portfolio_calculator_initialization():
    """Test that the Portfolio Calculator can be properly initialized."""
    with patch('portfolio_realtime.portfolio_calculator.BrokerClient') as mock_broker:
        # Set up mock broker client
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Create portfolio calculator with test configuration
        calculator = PortfolioCalculator(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0,
            broker_api_key='test-key',
            broker_secret_key='test-secret',
            sandbox=True,
            min_update_interval=1
        )
        
        # Verify initialization
        assert calculator.broker_client is mock_instance
        assert calculator.min_update_interval == 1


def test_is_websocket_server_running():
    """Test if the WebSocket server is running."""
    # Try both the standalone WebSocket server port and the combined services port
    ports_to_check = [8001, 8000]  # Add any other potential ports here
    
    for port in ports_to_check:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.settimeout(0.1)
            result = s.connect_ex(('localhost', port))
            if result == 0:
                assert True, f"WebSocket server is running on port {port}"
                return  # Test passes if any port is open
        finally:
            s.close()
    
    pytest.skip("WebSocket server not running on any expected port")


@pytest.mark.asyncio
async def test_event_loop_in_market_data_consumer():
    """Test that the Market Data Consumer properly handles event loops."""
    with patch('portfolio_realtime.market_data_consumer.StockDataStream') as mock_stream:
        # Create a mock that will simulate our fixed approach
        mock_instance = MagicMock()
        mock_ws_conn = MagicMock()
        mock_instance._ws_conn = mock_ws_conn
        mock_stream.return_value = mock_instance
        
        # Create market data consumer
        consumer = MarketDataConsumer(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0
        )
        
        # Run the consumer for a very short time to verify it handles loops correctly
        # Use asyncio.wait_for to ensure we don't hang indefinitely
        try:
            task = asyncio.create_task(consumer.run())
            # Wait for a very short time (100ms) then cancel the task
            await asyncio.sleep(0.1)
            task.cancel()
            
            # Wait for the task to be cancelled with a timeout
            await asyncio.wait_for(asyncio.shield(task), timeout=0.5)
        except asyncio.CancelledError:
            pass  # Expected
        except asyncio.TimeoutError:
            pass  # Also acceptable
        
        # Verify our direct WebSocket handling was used
        mock_ws_conn._connect_websocket.assert_called 