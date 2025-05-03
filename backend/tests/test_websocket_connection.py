#!/usr/bin/env python3
"""
WebSocket Connection Test Script

This script tests the WebSocket connection to ensure it's working properly
by connecting directly to both the API server and WebSocket server.

Usage:
    python test_websocket_connection.py

Requirements:
    - websockets
    - asyncio
    - json
"""

import os
import asyncio
import json
import logging
import sys
import websockets
from datetime import datetime
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("websocket_test")

# Load environment variables
load_dotenv()

# Default account ID for testing
DEFAULT_ACCOUNT_ID = "60205bf6-1d3f-46a5-8a1c-7248ee9210c5"  # Replace with your test account ID

async def test_api_server_websocket(account_id):
    """Test WebSocket connection through API server proxy."""
    api_server_host = os.getenv("API_SERVER_HOST", "localhost")
    api_server_port = os.getenv("API_SERVER_PORT", "8000")
    
    ws_uri = f"ws://{api_server_host}:{api_server_port}/ws/portfolio/{account_id}"
    logger.info(f"Testing WebSocket connection through API server: {ws_uri}")
    
    try:
        # First check if the health endpoint is available
        import aiohttp
        async with aiohttp.ClientSession() as session:
            health_url = f"http://{api_server_host}:{api_server_port}/ws/health"
            async with session.get(health_url) as response:
                if response.status == 200:
                    health_data = await response.json()
                    logger.info(f"API server WebSocket health check: {health_data}")
                else:
                    logger.warning(f"API server WebSocket health check failed: {response.status}")
    except Exception as e:
        logger.error(f"Error checking API server health: {e}")
    
    try:
        async with websockets.connect(ws_uri, ping_interval=30) as websocket:
            logger.info("Successfully connected to WebSocket through API server proxy")
            
            # Send a heartbeat message
            await websocket.send(json.dumps({
                "type": "heartbeat",
                "timestamp": int(datetime.now().timestamp() * 1000)
            }))
            logger.info("Sent heartbeat message")
            
            # Wait for a message, timeout after 10 seconds
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                data = json.loads(message)
                logger.info(f"Received message: {data}")
                
                # Check if it's a heartbeat acknowledgment or portfolio data
                if data.get("type") == "heartbeat_ack":
                    logger.info("✅ Received heartbeat acknowledgment")
                elif data.get("account_id") == account_id:
                    logger.info(f"✅ Received portfolio data: {data['total_value']}")
                else:
                    logger.warning(f"Received unexpected message type")
                
                return True
            except asyncio.TimeoutError:
                logger.error("Timed out waiting for WebSocket message")
                return False
    except Exception as e:
        logger.error(f"Error connecting to WebSocket through API server: {e}")
        return False

async def test_direct_websocket_connection(account_id):
    """Test direct WebSocket connection to WebSocket server."""
    ws_host = os.getenv("WEBSOCKET_HOST", "localhost")
    ws_port = os.getenv("WEBSOCKET_PORT", "8001")
    
    ws_uri = f"ws://{ws_host}:{ws_port}/ws/portfolio/{account_id}"
    logger.info(f"Testing direct WebSocket connection: {ws_uri}")
    
    try:
        # First check if the health endpoint is available
        import aiohttp
        async with aiohttp.ClientSession() as session:
            health_url = f"http://{ws_host}:{ws_port}/health"
            async with session.get(health_url) as response:
                if response.status == 200:
                    health_data = await response.json()
                    logger.info(f"WebSocket server health check: {health_data}")
                else:
                    logger.warning(f"WebSocket server health check failed: {response.status}")
    except Exception as e:
        logger.error(f"Error checking WebSocket server health: {e}")
    
    try:
        async with websockets.connect(ws_uri, ping_interval=30) as websocket:
            logger.info("Successfully connected directly to WebSocket server")
            
            # Send a heartbeat message
            await websocket.send(json.dumps({
                "type": "heartbeat",
                "timestamp": int(datetime.now().timestamp() * 1000)
            }))
            logger.info("Sent heartbeat message")
            
            # Wait for a message, timeout after 10 seconds
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                data = json.loads(message)
                logger.info(f"Received message: {data}")
                
                # Check if it's a heartbeat acknowledgment or portfolio data
                if data.get("type") == "heartbeat_ack":
                    logger.info("✅ Received heartbeat acknowledgment")
                elif data.get("account_id") == account_id:
                    logger.info(f"✅ Received portfolio data: {data['total_value']}")
                else:
                    logger.warning(f"Received unexpected message type")
                
                return True
            except asyncio.TimeoutError:
                logger.error("Timed out waiting for WebSocket message")
                return False
    except Exception as e:
        logger.error(f"Error connecting directly to WebSocket server: {e}")
        return False

async def check_services_running():
    """Check if required services are running."""
    api_server_host = os.getenv("API_SERVER_HOST", "localhost")
    api_server_port = os.getenv("API_SERVER_PORT", "8000")
    ws_host = os.getenv("WEBSOCKET_HOST", "localhost")
    ws_port = os.getenv("WEBSOCKET_PORT", "8001")
    
    services_running = True
    
    # Check API server
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            api_url = f"http://{api_server_host}:{api_server_port}/api/health"
            async with session.get(api_url, timeout=2.0) as response:
                if response.status == 200:
                    logger.info("✅ API server is running")
                else:
                    logger.warning(f"❌ API server check failed: {response.status}")
                    services_running = False
    except Exception as e:
        logger.error(f"❌ Error checking API server: {e}")
        services_running = False
    
    # Check WebSocket server
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            ws_url = f"http://{ws_host}:{ws_port}/health"
            async with session.get(ws_url, timeout=2.0) as response:
                if response.status == 200:
                    logger.info("✅ WebSocket server is running")
                else:
                    logger.warning(f"❌ WebSocket server check failed: {response.status}")
                    services_running = False
    except Exception as e:
        logger.error(f"❌ Error checking WebSocket server: {e}")
        services_running = False
    
    # Check Redis
    try:
        import redis
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        r = redis.Redis(host=redis_host, port=redis_port)
        if r.ping():
            logger.info("✅ Redis is running")
        else:
            logger.warning("❌ Redis check failed")
            services_running = False
    except Exception as e:
        logger.error(f"❌ Error checking Redis: {e}")
        services_running = False
    
    return services_running

async def main():
    """Main entry point."""
    logger.info("=== WebSocket Connection Test ===")
    
    # Get account ID from command line or use default
    account_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ACCOUNT_ID
    logger.info(f"Using account ID: {account_id}")
    
    # Check services
    services_ok = await check_services_running()
    if not services_ok:
        logger.warning("Some required services are not running. Test results may be unreliable.")
    
    # Test WebSocket connection through API server
    api_success = await test_api_server_websocket(account_id)
    
    # Test direct WebSocket connection
    direct_success = await test_direct_websocket_connection(account_id)
    
    # Report results
    logger.info("\n=== Test Results ===")
    logger.info(f"API Server WebSocket Proxy: {'✅ PASSED' if api_success else '❌ FAILED'}")
    logger.info(f"Direct WebSocket Connection: {'✅ PASSED' if direct_success else '❌ FAILED'}")
    
    if api_success and direct_success:
        logger.info("\n✅✅✅ ALL TESTS PASSED - WebSocket system is working correctly!")
        return 0
    elif api_success or direct_success:
        logger.info("\n⚠️ PARTIAL SUCCESS - At least one connection method is working.")
        return 1
    else:
        logger.error("\n❌❌❌ ALL TESTS FAILED - WebSocket system is not functioning correctly.")
        return 2

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code) 