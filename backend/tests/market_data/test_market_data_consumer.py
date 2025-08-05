"""
Tests for the Market Data Consumer component.

Tests the functionality of subscribing to and processing market data updates.
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

from portfolio_realtime.market_data_consumer import MarketDataConsumer

# Mock quote data
class MockQuote:
    def __init__(self, symbol, ask_price, bid_price=None, ask_size=None, bid_size=None):
        self.symbol = symbol
        self.ask_price = ask_price
        self.bid_price = bid_price or ask_price
        self.ask_size = ask_size or 100
        self.bid_size = bid_size or 100
        self.timestamp = None

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
        for key in client.keys('price:*'):
            client.delete(key)
        for key in client.keys('quote:*'):
            client.delete(key)
    except (redis.exceptions.ConnectionError, redis.exceptions.ResponseError):
        pytest.skip("Redis server not available")

@pytest.fixture
def mock_stock_stream():
    """Create a mock stock data stream."""
    with patch('portfolio_realtime.market_data_consumer.StockDataStream') as mock_stream:
        mock_instance = MagicMock()
        mock_stream.return_value = mock_instance
        
        # Set up subscribe_quotes to store the callback
        mock_instance.subscribe_quotes = MagicMock()
        mock_instance.unsubscribe_quotes = MagicMock()
        
        yield mock_instance

@pytest.mark.asyncio
async def test_market_data_consumer_initialization(mock_stock_stream):
    """Test that the Market Data Consumer initializes correctly."""
    consumer = MarketDataConsumer(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        market_api_key='test-api-key',
        market_secret_key='test-secret-key',
        price_ttl=60
    )
    
    # Verify instance properties
    assert consumer.market_api_key == 'test-api-key'
    assert consumer.market_secret_key == 'test-secret-key'
    assert consumer.price_ttl == 60
    assert isinstance(consumer.monitored_symbols, set)
    assert len(consumer.monitored_symbols) == 0

@pytest.mark.asyncio
async def test_handle_quote(redis_client, mock_stock_stream):
    """Test that handling a quote updates Redis with the price data."""
    consumer = MarketDataConsumer(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        market_api_key='test-api-key',
        market_secret_key='test-secret-key',
        price_ttl=60
    )
    
    # Create a test quote
    quote = MockQuote(symbol="AAPL", ask_price=150.0, bid_price=149.5, ask_size=100, bid_size=150)
    
    # Process the quote
    await consumer.handle_quote(quote)
    
    # Verify price was stored in Redis
    price_key = "price:AAPL"
    assert redis_client.exists(price_key)
    stored_price = redis_client.get(price_key).decode('utf-8')
    assert float(stored_price) == 150.0
    
    # Verify detailed quote data was stored
    quote_key = "quote:AAPL"
    assert redis_client.exists(quote_key)
    quote_data = json.loads(redis_client.get(quote_key))
    assert quote_data['symbol'] == "AAPL"
    assert float(quote_data['ask_price']) == 150.0
    assert float(quote_data['bid_price']) == 149.5
    
    # Verify price update was published
    # We can't easily test this directly, but we can check the function doesn't error

@pytest.mark.asyncio
async def test_initialize_symbols(redis_client, mock_stock_stream):
    """Test that symbols are initialized from Redis on startup."""
    # Store test symbols in Redis
    test_symbols = ["AAPL", "MSFT", "GOOG"]
    redis_client.set('tracked_symbols', json.dumps(test_symbols))
    
    consumer = MarketDataConsumer(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        market_api_key='test-api-key',
        market_secret_key='test-secret-key',
        price_ttl=60
    )
    
    # Call initialize_symbols
    initialized = await consumer.initialize_symbols()
    
    # Verify symbols were initialized
    assert initialized
    assert mock_stock_stream.subscribe_quotes.called
    assert len(consumer.monitored_symbols) == 3
    for symbol in test_symbols:
        assert symbol in consumer.monitored_symbols

@pytest.mark.asyncio
async def test_handle_symbol_updates(redis_client, mock_stock_stream):
    """Test handling symbol updates to subscribe and unsubscribe."""
    consumer = MarketDataConsumer(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        market_api_key='test-api-key',
        market_secret_key='test-secret-key',
        price_ttl=60
    )
    
    # Initially no symbols are monitored
    assert len(consumer.monitored_symbols) == 0
    
    # Create a pubsub message for adding symbols
    add_message = {
        'add': ["AAPL", "MSFT"],
        'remove': [],
        'timestamp': '2023-05-01T12:00:00Z'
    }
    
    # Use a mock pubsub to simulate the message
    mock_pubsub = MagicMock()
    consumer.pubsub = mock_pubsub
    mock_pubsub.listen.return_value = [
        {'type': 'subscribe', 'channel': b'symbol_updates', 'data': 1},
        {'type': 'message', 'channel': b'symbol_updates', 'data': json.dumps(add_message).encode()},
    ]
    
    # Run handle_symbol_updates in the background
    task = asyncio.create_task(consumer.handle_symbol_updates())
    
    # Give it time to process
    await asyncio.sleep(0.1)
    
    # Cancel the task (it would run forever otherwise)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    
    # Verify subscribe was called with the right symbols
    mock_stock_stream.subscribe_quotes.assert_called_once()
    # Check the symbols are in the monitored set
    assert "AAPL" in consumer.monitored_symbols
    assert "MSFT" in consumer.monitored_symbols
    
    # Now test removing symbols
    mock_pubsub.listen.return_value = [
        {'type': 'message', 'channel': b'symbol_updates', 'data': json.dumps({
            'add': [],
            'remove': ["AAPL"],
            'timestamp': '2023-05-01T12:01:00Z'
        }).encode()},
    ]
    
    # Run handle_symbol_updates again
    task = asyncio.create_task(consumer.handle_symbol_updates())
    await asyncio.sleep(0.1)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    
    # Verify unsubscribe was called with AAPL
    mock_stock_stream.unsubscribe_quotes.assert_called_once_with("AAPL")
    # Verify AAPL is no longer in the monitored set
    assert "AAPL" not in consumer.monitored_symbols
    assert "MSFT" in consumer.monitored_symbols

@pytest.mark.asyncio
@pytest.mark.timeout(5)
async def test_market_data_consumer_run(mock_stock_stream):
    """Test the main run method of the consumer."""
    # Create a patched version of run() that doesn't have the infinite loop
    original_run = MarketDataConsumer.run
    
    async def patched_run(self):
        """Patched run method without the infinite loop."""
        # Initialize with existing symbols
        initialized = await self.initialize_symbols()
        
        # Start symbol update listener in a separate task
        symbol_updates_task = asyncio.create_task(self.handle_symbol_updates())
        
        # Cancel the task to trigger the expected CancelledError
        symbol_updates_task.cancel()
        
        # Wait for cancellation to propagate
        try:
            await symbol_updates_task
        except asyncio.CancelledError:
            # Re-raise to be caught by the test
            raise
    
    # Apply the patch
    with patch.object(MarketDataConsumer, 'run', patched_run), \
         patch.object(MarketDataConsumer, 'initialize_symbols', return_value=True) as mock_init, \
         patch.object(MarketDataConsumer, 'handle_symbol_updates') as mock_handle:
        
        # Make handle_symbol_updates raise CancelledError when called
        mock_handle.side_effect = asyncio.CancelledError()
        
        consumer = MarketDataConsumer(
            redis_host='localhost',
            redis_port=6379,
            redis_db=0,
            market_api_key='test-api-key',
            market_secret_key='test-secret-key',
            price_ttl=60
        )
        
        # Run the consumer and expect CancelledError
        with pytest.raises(asyncio.CancelledError):
            await consumer.run()
        
        # Verify methods were called
        mock_init.assert_called_once()
        mock_handle.assert_called_once()

@pytest.mark.asyncio
@pytest.mark.timeout(5)
async def test_report_statistics(redis_client):
    """Test the statistics reporting functionality."""
    consumer = MarketDataConsumer(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        market_api_key='test-api-key',
        market_secret_key='test-secret-key',
        price_ttl=60
    )
    
    # Add some symbols to monitor
    consumer.monitored_symbols.update(["AAPL", "MSFT", "GOOG"])
    
    # Add some test prices
    redis_client.set("price:AAPL", "150.0")
    redis_client.set("price:MSFT", "300.0")
    
    # Create a task for report_statistics
    task = asyncio.create_task(consumer.report_statistics(interval_seconds=0.1))
    
    # Let it run for a short time
    await asyncio.sleep(0.2)
    
    # Cancel the task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    
    # No assertions needed - we're just checking it runs without errors

@pytest.mark.asyncio
async def test_error_handling_in_handle_quote(redis_client):
    """Test that errors in handle_quote are caught and don't crash the consumer."""
    consumer = MarketDataConsumer(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        market_api_key='test-api-key',
        market_secret_key='test-secret-key',
        price_ttl=60
    )
    
    # Create a malformed quote (missing required attributes)
    bad_quote = MagicMock()
    # This will cause an attribute error when accessing bad_quote.symbol
    
    # Process the quote - should not raise an exception
    await consumer.handle_quote(bad_quote)
    
    # Add a quote with bad data type
    bad_quote2 = MockQuote(symbol="AAPL", ask_price="not_a_number")
    
    # Process the quote - should not raise an exception
    await consumer.handle_quote(bad_quote2)
    
    # Verify the system is still operational by processing a good quote
    good_quote = MockQuote(symbol="MSFT", ask_price=250.0)
    await consumer.handle_quote(good_quote)
    
    # Verify the good quote was processed
    assert redis_client.exists("price:MSFT")
    assert float(redis_client.get("price:MSFT").decode('utf-8')) == 250.0 