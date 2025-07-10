"""
Pytest configuration for the Clera backend tests

This file provides proper test configuration and fixtures without
modifying sys.path, following architectural best practices.
"""

import pytest
import sys
from pathlib import Path

# Add the backend directory to Python path for imports
# This is done at the pytest level, not in individual test files
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))


@pytest.fixture
def mock_broker_client():
    """Fixture to provide a mocked broker client"""
    from unittest.mock import Mock
    
    mock_client = Mock()
    
    # Mock account data
    mock_account = Mock()
    mock_account.equity = "153850.05"
    mock_account.cash = "5000.00"
    mock_account.status = "ACTIVE"
    mock_account.last_equity = "143910.89"
    mock_client.get_trade_account_by_id.return_value = mock_account
    
    # Mock positions
    mock_positions = []
    mock_client.get_all_positions_for_account.return_value = mock_positions
    
    return mock_client


@pytest.fixture
def mock_redis_client():
    """Fixture to provide a mocked Redis client"""
    from unittest.mock import Mock
    
    mock_redis = Mock()
    
    # Mock price data
    mock_redis.get.side_effect = lambda key: {
        'price:AAPL': '155.00',
        'price:GOOGL': '2850.00',
        'yesterday_close:AAPL': '150.00',
        'yesterday_close:GOOGL': '2800.00',
    }.get(key)
    
    return mock_redis


@pytest.fixture
def sample_account_id():
    """Fixture to provide a sample account ID for testing"""
    return '60205bf6-1d3f-46a5-8a1c-7248ee9210c5'


@pytest.fixture
def sample_portfolio_data():
    """Fixture to provide sample portfolio data for testing"""
    return {
        'total_value': 153850.05,
        'today_return': 9939.16,
        'raw_return': 9939.16,
        'raw_return_percent': 6.91
    } 