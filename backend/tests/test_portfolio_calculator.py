"""
Tests for the Portfolio Calculator component.

Tests the calculation of portfolio values from position data and price updates.
"""

import asyncio
import json
import os
import pytest
import redis
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock

# Add parent directory to path for imports
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.portfolio_calculator import PortfolioCalculator

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
        for key in client.keys('price:*'):
            client.delete(key)
        for key in client.keys('last_portfolio:*'):
            client.delete(key)
    except (redis.exceptions.ConnectionError, redis.exceptions.ResponseError):
        pytest.skip("Redis server not available")

@pytest.fixture
def mock_broker_client():
    """Create a mock broker client."""
    with patch('portfolio_realtime.portfolio_calculator.BrokerClient') as mock_broker:
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Mock account
        test_account_id = "test-account-123"
        
        # Mock account details
        mock_account = MagicMock()
        mock_account.cash = "1000.00"
        mock_account.last_equity = "3900.00"
        mock_account.portfolio_value = "4000.00"
        mock_account.equity = "4000.00"
        
        # Configure mock methods
        mock_instance.get_account_by_id.return_value = mock_account
        mock_instance.get_trade_account_by_id.return_value = mock_account
        
        yield mock_instance, test_account_id, mock_account

@pytest.mark.asyncio
async def test_portfolio_calculator_initialization():
    """Test that Portfolio Calculator initializes correctly."""
    with patch('portfolio_realtime.portfolio_calculator.BrokerClient') as mock_broker:
        # Set up mock broker client
        mock_instance = MagicMock()
        mock_broker.return_value = mock_instance
        
        # Create portfolio calculator
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
        assert calculator.account_base_values == {}
        assert calculator.last_update_time == {}

def test_get_account_base_value(mock_broker_client):
    """Test retrieving the base value for an account."""
    mock_instance, test_account_id, mock_account = mock_broker_client
    
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Get base value
    base_value = calculator.get_account_base_value(test_account_id)
    
    # Verify base value was retrieved from broker client
    assert base_value == float(mock_account.last_equity)
    
    # Verify it was cached
    assert test_account_id in calculator.account_base_values
    assert calculator.account_base_values[test_account_id] == float(mock_account.last_equity)
    
    # Verify broker client was called
    mock_instance.get_account_by_id.assert_called_once_with(test_account_id)

def test_get_account_base_value_fallback(mock_broker_client):
    """Test fallback logic when last_equity is invalid."""
    mock_instance, test_account_id, mock_account = mock_broker_client
    
    # Set invalid last_equity
    mock_account.last_equity = "0"
    
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Get base value - should fall back to portfolio_value
    base_value = calculator.get_account_base_value(test_account_id)
    
    # Verify it used portfolio_value
    assert base_value == float(mock_account.portfolio_value)
    
    # Set both invalid
    mock_account.portfolio_value = "0"
    
    # Get base value again - should fall back to equity
    base_value = calculator.get_account_base_value(test_account_id)
    
    # Verify it used equity
    assert base_value == float(mock_account.equity)

def test_calculate_portfolio_value_from_positions(redis_client, mock_broker_client):
    """Test calculating portfolio value from positions in Redis."""
    mock_instance, test_account_id, mock_account = mock_broker_client
    
    # Create test positions
    test_positions = [
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
    
    # Store test positions in Redis
    redis_client.set(f'account_positions:{test_account_id}', json.dumps(test_positions))
    
    # Store test prices in Redis
    redis_client.set('price:AAPL', "160.00")  # Higher than position's current_price
    
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Calculate portfolio value
    portfolio_data = calculator.calculate_portfolio_value(test_account_id)
    
    # Expected values
    expected_cash = float(mock_account.cash)  # 1000.00
    expected_aapl_value = 10 * 160.00  # Using Redis price
    expected_msft_value = 5 * 300.00   # Using position price (no Redis price)
    expected_total = expected_cash + expected_aapl_value + expected_msft_value
    
    # Verify calculation
    assert portfolio_data is not None
    assert portfolio_data["account_id"] == test_account_id
    assert portfolio_data["raw_value"] == expected_total
    assert f"${expected_total:.2f}" == portfolio_data["total_value"]
    
    # Verify it used the cached price for AAPL
    # Total should be higher than if it used position's current_price
    assert expected_total > (float(mock_account.cash) + 1500.00 + 1500.00)

def test_calculate_portfolio_value_direct_fetch(redis_client, mock_broker_client):
    """Test calculating portfolio value by directly fetching positions."""
    mock_instance, test_account_id, mock_account = mock_broker_client
    
    # Create test positions
    test_positions = [
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
    
    # Configure mock to return test positions
    mock_instance.get_all_positions_for_account.return_value = test_positions
    
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Calculate portfolio value
    portfolio_data = calculator.calculate_portfolio_value(test_account_id)
    
    # Verify direct fetch was used
    mock_instance.get_all_positions_for_account.assert_called_once_with(test_account_id)
    
    # Verify calculation
    assert portfolio_data is not None
    assert portfolio_data["account_id"] == test_account_id
    
    # Expected total (using position prices)
    expected_total = float(mock_account.cash) + 1500.00 + 1500.00
    assert portfolio_data["raw_value"] == expected_total

def test_error_handling_in_calculate_portfolio_value(mock_broker_client):
    """Test error handling in calculate_portfolio_value."""
    mock_instance, test_account_id, mock_account = mock_broker_client
    
    # Make get_all_positions_for_account raise an exception
    mock_instance.get_all_positions_for_account.side_effect = Exception("API Error")
    
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Calculate portfolio value - should handle the exception and return None
    portfolio_data = calculator.calculate_portfolio_value(test_account_id)
    
    # Verify None was returned
    assert portfolio_data is None

@pytest.mark.asyncio
async def test_get_accounts_for_symbol(redis_client):
    """Test finding accounts that hold a given symbol."""
    # Create test data
    account1_positions = [
        {"symbol": "AAPL", "qty": "10", "current_price": "150.00"}
    ]
    account2_positions = [
        {"symbol": "MSFT", "qty": "5", "current_price": "300.00"}
    ]
    account3_positions = [
        {"symbol": "AAPL", "qty": "20", "current_price": "150.00"}
    ]
    
    # Store test data in Redis
    redis_client.set('account_positions:account1', json.dumps(account1_positions))
    redis_client.set('account_positions:account2', json.dumps(account2_positions))
    redis_client.set('account_positions:account3', json.dumps(account3_positions))
    
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Get accounts for AAPL
    accounts = await calculator.get_accounts_for_symbol("AAPL")
    
    # Verify accounts were found
    assert len(accounts) == 2
    assert "account1" in accounts
    assert "account3" in accounts
    assert "account2" not in accounts
    
    # Get accounts for MSFT
    accounts = await calculator.get_accounts_for_symbol("MSFT")
    
    # Verify account was found
    assert len(accounts) == 1
    assert "account2" in accounts
    
    # Get accounts for non-existent symbol
    accounts = await calculator.get_accounts_for_symbol("TSLA")
    
    # Verify no accounts were found
    assert len(accounts) == 0

@pytest.mark.asyncio
@pytest.mark.timeout(5)  # Prevent hanging
async def test_listen_for_price_updates(redis_client, mock_broker_client):
    """Test listening for price updates and recalculating portfolios."""
    mock_instance, test_account_id, mock_account = mock_broker_client
    
    # Create test positions
    test_positions = [
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
    
    # Store test positions in Redis
    redis_client.set(f'account_positions:{test_account_id}', json.dumps(test_positions))
    
    # Create calculator with mock pubsub
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True,
        min_update_interval=0  # No rate limiting for test
    )
    
    # Use a mock pubsub
    mock_pubsub = MagicMock()
    calculator.pubsub = mock_pubsub
    
    # Create price update message
    price_update = {
        'symbol': 'AAPL',
        'price': '160.00',
        'timestamp': datetime.now().isoformat()
    }
    
    # Set mock to return price update message
    mock_pubsub.listen.return_value = [
        {'type': 'subscribe', 'channel': b'price_updates', 'data': 1},
        {'type': 'message', 'channel': b'price_updates', 'data': json.dumps(price_update).encode()},
    ]
    
    # Patch get_accounts_for_symbol to return test_account_id
    async def mock_get_accounts(symbol):
        if symbol == "AAPL":
            return [test_account_id]
        return []
    
    with patch.object(calculator, 'get_accounts_for_symbol', side_effect=mock_get_accounts), \
         patch.object(calculator, 'calculate_portfolio_value') as mock_calculate, \
         patch.object(calculator.redis_client, 'publish') as mock_publish:
        
        # Configure mock_calculate to return test data
        test_portfolio_data = {
            "account_id": test_account_id,
            "total_value": "$4100.00",
            "today_return": "+$200.00 (5.00%)",
            "raw_value": 4100.00,
            "raw_return": 200.00,
            "raw_return_percent": 5.00,
            "timestamp": datetime.now().isoformat()
        }
        mock_calculate.return_value = test_portfolio_data
        
        # Run listen_for_price_updates in the background
        task = asyncio.create_task(calculator.listen_for_price_updates())
        
        # Wait a bit for processing
        await asyncio.sleep(0.1)
        
        # Cancel the task
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        
        # Verify calculate_portfolio_value was called
        mock_calculate.assert_called_once_with(test_account_id)
        
        # Verify result was published
        mock_publish.assert_called_once_with('portfolio_updates', json.dumps(test_portfolio_data))
        
        # Verify last_update_time was updated
        assert test_account_id in calculator.last_update_time

@pytest.mark.asyncio
@pytest.mark.timeout(5)  # Prevent hanging
async def test_periodic_recalculation(redis_client, mock_broker_client):
    """Test periodic recalculation of all portfolio values."""
    mock_instance, test_account_id, mock_account = mock_broker_client
    
    # Create test positions
    test_positions = [
        {
            "symbol": "AAPL",
            "qty": "10",
            "current_price": "150.00",
            "market_value": "1500.00"
        }
    ]
    
    # Store test positions in Redis
    redis_client.set(f'account_positions:{test_account_id}', json.dumps(test_positions))
    
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Patch calculate_portfolio_value
    with patch.object(calculator, 'calculate_portfolio_value') as mock_calculate:
        # Configure mock to return test data
        test_portfolio_data = {
            "account_id": test_account_id,
            "total_value": "$4000.00",
            "today_return": "+$100.00 (2.50%)",
            "raw_value": 4000.00,
            "raw_return": 100.00,
            "raw_return_percent": 2.50,
            "timestamp": datetime.now().isoformat()
        }
        mock_calculate.return_value = test_portfolio_data
        
        # Run periodic_recalculation with short interval
        task = asyncio.create_task(calculator.periodic_recalculation(interval_seconds=0.1))
        
        # Wait for a recalculation cycle
        await asyncio.sleep(0.15)
        
        # Cancel the task
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        
        # Verify calculate_portfolio_value was called
        mock_calculate.assert_called_with(test_account_id)
        
        # Verify the direct Redis update was also done (for API endpoint)
        assert redis_client.exists(f"last_portfolio:{test_account_id}")

@pytest.mark.asyncio
@pytest.mark.timeout(5)  # Prevent hanging
async def test_run_method_starts_both_tasks(redis_client):
    """Test that run starts both listener and periodic recalculation."""
    # Create calculator
    calculator = PortfolioCalculator(
        redis_host='localhost',
        redis_port=6379,
        redis_db=0,
        broker_api_key='test-key',
        broker_secret_key='test-secret',
        sandbox=True
    )
    
    # Mock the gather method to return immediately
    async def mock_gather(*args, **kwargs):
        return None
    
    # Patch the calculator methods
    with patch('asyncio.gather', side_effect=mock_gather), \
         patch.object(calculator, 'listen_for_price_updates') as mock_listen, \
         patch.object(calculator, 'periodic_recalculation') as mock_periodic:
        
        # Configure methods to return awaitable objects
        mock_listen.return_value = asyncio.sleep(0)
        mock_periodic.return_value = asyncio.sleep(0)
        
        # Run the calculator - this should now complete without errors
        await calculator.run(recalculation_interval=30)
        
        # Verify that both methods were called with correct arguments
        mock_listen.assert_called_once()
        mock_periodic.assert_called_once_with(interval_seconds=30) 