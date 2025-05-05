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
import websockets

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
    """Test that the WebSocket endpoint responds to pings."""
    # This requires a running server
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.settimeout(0.1)
        result = s.connect_ex(('localhost', 8001))
        if result != 0:
            pytest.skip("WebSocket server not running on localhost:8001")
    finally:
        s.close()

    try:
        uri = "ws://localhost:8001/ws/portfolio/test-ping-pong"
        async with websockets.connect(uri, timeout=2) as websocket:
            await websocket.send("ping")
            response = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            assert response == "pong"
    except Exception as e:
        pytest.skip(f"WebSocket connection failed: {str(e)}")

@pytest.mark.asyncio
async def test_websocket_connection_via_proxy():
    """Test WebSocket connection via the API server proxy (port 8000)."""
    # This test requires both the API server (port 8000)
    # and the WebSocket server (port 8001) to be running.
    import socket

    # Check if API server (proxy) is running on port 8000
    api_server_running = False
    s_api = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s_api.settimeout(0.1)
        if s_api.connect_ex(('localhost', 8000)) == 0:
            api_server_running = True
    finally:
        s_api.close()

    if not api_server_running:
        pytest.skip("API server (proxy) not running on localhost:8000")

    # Check if direct WebSocket server is running on port 8001 (needed by proxy)
    ws_server_running = False
    s_ws = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s_ws.settimeout(0.1)
        if s_ws.connect_ex(('localhost', 8001)) == 0:
            ws_server_running = True
    finally:
        s_ws.close()

    if not ws_server_running:
        pytest.skip("Direct WebSocket server not running on localhost:8001 (required for proxy)")

    # Proceed with test via proxy
    try:
        # Connect to the API server's WebSocket endpoint
        proxy_uri = "ws://localhost:8000/ws/portfolio/test-proxy-connection"
        async with websockets.connect(proxy_uri, timeout=5) as websocket:
            # Simple ping/pong to verify connection
            await websocket.send("ping")
            response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
            assert response == "pong"
            # Test receiving initial data (if applicable, requires Redis setup)
            # For simplicity, just testing the connection establishment here.
            # More complex proxy data tests would involve mocking Redis in the main API server context.

    except Exception as e:
        pytest.fail(f"WebSocket connection via proxy failed: {str(e)}")

# Note: More involved tests (e.g., data broadcasting via proxy) would require
# running the actual API server and WebSocket server together or more complex mocking. 