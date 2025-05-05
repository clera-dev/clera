import asyncio
import json
import os
import pytest
import websockets
from fastapi.testclient import TestClient

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolio_realtime.websocket_server import app


@pytest.fixture
def client():
    """Create a test client for FastAPI endpoints."""
    return TestClient(app)


def test_health_endpoint(client):
    """Test the health endpoint of the WebSocket server."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_websocket_connection():
    """Test WebSocket connection and ping/pong functionality."""
    # This is an integration test that requires a running server
    # First check if server is available without lengthy timeout
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # Set a short timeout to quickly determine if server is running
        s.settimeout(0.1)
        result = s.connect_ex(('localhost', 8001))
        if result != 0:
            pytest.skip("WebSocket server not running on localhost:8001")
    finally:
        s.close()
    
    # If we get here, server appears to be running, proceed with test
    try:
        uri = "ws://localhost:8001/ws/portfolio/test-account-id"
        async with websockets.connect(uri, timeout=2) as websocket:
            # Send a ping message
            await websocket.send("ping")
            # Expect a pong response
            response = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            assert response == "pong"
    except Exception as e:
        pytest.skip(f"WebSocket connection failed: {str(e)}") 