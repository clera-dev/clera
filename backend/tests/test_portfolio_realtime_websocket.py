"""
Tests for the Portfolio Realtime WebSocket Server.

Tests the WebSocket server's ability to manage connections and broadcast updates.
"""

import asyncio
import json
import os
import pytest
import redis
from fastapi.testclient import TestClient
from fastapi import WebSocket, WebSocketDisconnect
from unittest.mock import patch, MagicMock, AsyncMock

# Add parent directory to path for imports
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.websocket_server import app, ConnectionManager

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
        for key in client.keys('last_portfolio:test-*'):
            client.delete(key)
    except (redis.exceptions.ConnectionError, redis.exceptions.ResponseError):
        pytest.skip("Redis server not available")

@pytest.fixture
def test_client():
    """Create a test client for FastAPI endpoints."""
    return TestClient(app)

def test_health_endpoint(test_client):
    """Test the health endpoint of the WebSocket server."""
    response = test_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert "redis" in response.json()
    assert "connections" in response.json()
    assert "accounts" in response.json()
    assert "timestamp" in response.json()

@pytest.mark.asyncio
async def test_connection_manager_connect():
    """Test that connection manager properly tracks connections."""
    # Create a mock WebSocket
    mock_ws = AsyncMock()
    
    # Create an instance of the ConnectionManager
    manager = ConnectionManager()
    
    # Connect the WebSocket
    await manager.connect(mock_ws, "test-account-123")
    
    # Verify the connection was accepted
    mock_ws.accept.assert_called_once()
    
    # Verify the connection was added to active_connections
    assert "test-account-123" in manager.active_connections
    assert mock_ws in manager.active_connections["test-account-123"]

@pytest.mark.asyncio
async def test_connection_manager_disconnect():
    """Test that connection manager properly disconnects and cleans up."""
    # Create a mock WebSocket
    mock_ws = AsyncMock()
    
    # Create an instance of the ConnectionManager
    manager = ConnectionManager()
    
    # Add a connection
    await manager.connect(mock_ws, "test-account-123")
    
    # Verify the connection was added
    assert "test-account-123" in manager.active_connections
    
    # Now disconnect
    manager.disconnect(mock_ws, "test-account-123")
    
    # Verify the connection was removed
    assert "test-account-123" not in manager.active_connections

@pytest.mark.asyncio
async def test_connection_manager_broadcast():
    """Test that broadcast sends data to all connections for an account."""
    # Create several mock WebSockets
    mock_ws1 = AsyncMock()
    mock_ws2 = AsyncMock()
    mock_ws3 = AsyncMock()
    
    # Create an instance of the ConnectionManager
    manager = ConnectionManager()
    
    # Add connections for two different accounts
    await manager.connect(mock_ws1, "test-account-1")
    await manager.connect(mock_ws2, "test-account-1")
    await manager.connect(mock_ws3, "test-account-2")
    
    # Define test message
    test_message = {"account_id": "test-account-1", "value": 123.45}
    
    # Broadcast to the first account
    await manager.broadcast_to_account("test-account-1", test_message)
    
    # Verify both connections for account 1 received the message
    mock_ws1.send_json.assert_called_once_with(test_message)
    mock_ws2.send_json.assert_called_once_with(test_message)
    
    # Verify connection for account 2 did not receive the message
    mock_ws3.send_json.assert_not_called()

@pytest.mark.asyncio
async def test_connection_manager_broadcast_handles_exceptions():
    """Test that broadcast handles exceptions when sending fails."""
    # Create a mock WebSocket that raises an exception on send_json
    mock_ws_good = AsyncMock()
    mock_ws_bad = AsyncMock()
    mock_ws_bad.send_json.side_effect = Exception("Connection error")
    
    # Create an instance of the ConnectionManager
    manager = ConnectionManager()
    
    # Add connections
    await manager.connect(mock_ws_good, "test-account-1")
    await manager.connect(mock_ws_bad, "test-account-1")
    
    # Define test message
    test_message = {"account_id": "test-account-1", "value": 123.45}
    
    # Broadcast to the account
    await manager.broadcast_to_account("test-account-1", test_message)
    
    # Verify the good connection received the message
    mock_ws_good.send_json.assert_called_once_with(test_message)
    
    # Verify the bad connection is removed from the active connections
    await asyncio.sleep(0.1)  # Give time for cleanup
    assert len(manager.active_connections["test-account-1"]) == 1
    assert mock_ws_good in manager.active_connections["test-account-1"]
    assert mock_ws_bad not in manager.active_connections["test-account-1"]

@pytest.mark.asyncio
async def test_connection_manager_stats():
    """Test that get_connection_stats returns correct statistics."""
    # Create some mock WebSockets
    mock_ws1 = AsyncMock()
    mock_ws2 = AsyncMock()
    mock_ws3 = AsyncMock()
    
    # Create an instance of the ConnectionManager
    manager = ConnectionManager()
    
    # Add connections for different accounts
    await manager.connect(mock_ws1, "test-account-1")
    await manager.connect(mock_ws2, "test-account-1")
    await manager.connect(mock_ws3, "test-account-2")
    
    # Get the stats
    stats = manager.get_connection_stats()
    
    # Verify the stats
    assert stats["accounts"] == 2
    assert stats["connections"] == 3
    assert "timestamp" in stats

@pytest.mark.asyncio
async def test_websocket_endpoint_initial_data(redis_client):
    """Test that the WebSocket endpoint sends initial data when connecting."""
    # Store test portfolio data in Redis
    test_account_id = "test-account-123"
    test_portfolio = {
        "account_id": test_account_id,
        "total_value": "$4000.00",
        "today_return": "+$100.00 (2.50%)"
    }
    redis_client.set(f"last_portfolio:{test_account_id}", json.dumps(test_portfolio))
    
    # Create mock WebSocket and patch the WebSocket endpoint
    mock_ws = AsyncMock()
    
    # Mock behavior for websocket_endpoint
    with patch('portfolio_realtime.websocket_server.redis_client', redis_client), \
         patch('portfolio_realtime.websocket_server.manager.connect', AsyncMock()) as mock_connect, \
         patch('portfolio_realtime.websocket_server.WebSocket', return_value=mock_ws):
        
        # Simulate WebSocket connect
        # We have to call the endpoint function directly since we can't create a real WebSocket
        # connection in a unit test
        from portfolio_realtime.websocket_server import websocket_endpoint
        
        # Mock receive_text to return "ping" and raise WebSocketDisconnect on second call
        mock_ws.receive_text = AsyncMock()
        mock_ws.receive_text.side_effect = ["ping", WebSocketDisconnect()]
        
        # Call websocket_endpoint directly
        try:
            await websocket_endpoint(mock_ws, test_account_id)
        except WebSocketDisconnect:
            pass  # Expected
        
        # Verify the connection was established
        mock_connect.assert_called_once_with(mock_ws, test_account_id)
        
        # Verify initial data was sent
        mock_ws.send_json.assert_called_with(test_portfolio)
        
        # Verify ping-pong worked
        mock_ws.send_text.assert_called_with("pong")

@pytest.mark.asyncio
async def test_websocket_endpoint_ping_pong():
    """Test that the WebSocket endpoint properly responds to ping messages."""
    # Create mock WebSocket
    mock_ws = AsyncMock()
    
    # Mock behavior for websocket_endpoint
    with patch('portfolio_realtime.websocket_server.manager.connect', AsyncMock()) as mock_connect, \
         patch('portfolio_realtime.websocket_server.manager.disconnect', MagicMock()) as mock_disconnect, \
         patch('portfolio_realtime.websocket_server.redis_client.get', return_value=None):
        
        # Simulate WebSocket connect
        from portfolio_realtime.websocket_server import websocket_endpoint
        
        # Set up mock to return multiple pings then disconnect
        mock_ws.receive_text = AsyncMock()
        mock_ws.receive_text.side_effect = ["ping", "ping", WebSocketDisconnect()]
        
        # Call websocket_endpoint directly
        try:
            await websocket_endpoint(mock_ws, "test-account-123")
        except WebSocketDisconnect:
            pass  # Expected
        
        # Verify pong was sent for each ping
        assert mock_ws.send_text.call_count == 2
        mock_ws.send_text.assert_called_with("pong")
        
        # Verify disconnect was called on WebSocketDisconnect
        mock_disconnect.assert_called_once_with(mock_ws, "test-account-123") 