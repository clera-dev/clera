#!/usr/bin/env python3
"""
WebSocket Connection Diagnostic Script

This script checks if the WebSocket server is running and accessible,
and verifies Redis connectivity. It's useful for diagnosing issues
with the real-time portfolio system.

Usage:
    python check_websocket.py

Dependencies:
    - requests
    - redis
    - websockets
"""

import os
import sys
import asyncio
import json
import logging
import redis
from dotenv import load_dotenv
import requests
import websockets
import time
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("websocket_checker")

# Load environment variables
load_dotenv()

# Diagnostic functions
def check_redis_connection():
    """Check if Redis is running and accessible."""
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_db = int(os.getenv("REDIS_DB", "0"))
    
    logger.info(f"Checking Redis connection at {redis_host}:{redis_port}...")
    try:
        client = redis.Redis(host=redis_host, port=redis_port, db=redis_db)
        client.ping()
        logger.info(f"✅ Redis connection successful at {redis_host}:{redis_port}")
        return True
    except redis.exceptions.ConnectionError as e:
        logger.error(f"❌ Redis connection error: {e}")
        logger.error(f"Make sure Redis is running at {redis_host}:{redis_port}")
        return False
    except Exception as e:
        logger.error(f"❌ Redis error: {e}")
        return False

def check_websocket_server_health(port):
    """Check if the WebSocket server's health endpoint is accessible."""
    host = os.getenv("WEBSOCKET_HOST", "localhost")
    url = f"http://{host}:{port}/health"
    
    logger.info(f"Checking WebSocket server health at {url}...")
    try:
        response = requests.get(url, timeout=3)
        if response.status_code == 200:
            health_data = response.json()
            logger.info(f"✅ WebSocket server is healthy on port {port}")
            logger.info(f"   Redis status: {health_data.get('redis', 'unknown')}")
            logger.info(f"   Active connections: {health_data.get('connections', 0)}")
            logger.info(f"   Connected accounts: {health_data.get('accounts', 0)}")
            logger.info(f"   Server version: {health_data.get('version', 'unknown')}")
            return True
        else:
            logger.error(f"❌ WebSocket server health check failed: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to connect to WebSocket server on port {port}: {e}")
        return False

async def check_websocket_connection(port, account_id="test-account-id"):
    """Check if WebSocket connection can be established."""
    host = os.getenv("WEBSOCKET_HOST", "localhost")
    ws_uri = f"ws://{host}:{port}/ws/portfolio/{account_id}"
    
    logger.info(f"Trying WebSocket connection at {ws_uri}...")
    try:
        async with websockets.connect(ws_uri, ping_interval=None, close_timeout=5) as websocket:
            logger.info(f"✅ WebSocket connection established successfully on port {port}")
            
            # Try sending a heartbeat
            logger.info("Sending heartbeat message...")
            await websocket.send(json.dumps({
                "type": "heartbeat",
                "timestamp": int(time.time() * 1000)
            }))
            
            # Wait for response with timeout
            logger.info("Waiting for response...")
            try:
                response_task = asyncio.create_task(websocket.recv())
                done, pending = await asyncio.wait([response_task], timeout=5)
                
                if response_task in done:
                    response = await response_task
                    logger.info(f"✅ Received response from server: {response[:100]}")
                    return True
                else:
                    logger.warning("⚠️ No response received from server within timeout")
                    for task in pending:
                        task.cancel()
                    return True  # Connection worked even if no response
            except asyncio.CancelledError:
                logger.warning("⚠️ WebSocket receive operation was cancelled")
                return True  # Connection worked even if receive was cancelled
            
    except (websockets.exceptions.WebSocketException, ConnectionRefusedError) as e:
        logger.error(f"❌ WebSocket connection error on port {port}: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error during WebSocket connection on port {port}: {e}")
        return False

async def check_api_server_proxy(port=8000, account_id="test-account-id"):
    """Check if the API server's WebSocket proxy is working."""
    host = os.getenv("API_SERVER_HOST", "localhost")
    ws_uri = f"ws://{host}:{port}/ws/portfolio/{account_id}"
    
    logger.info(f"Checking API server WebSocket proxy at {ws_uri}...")
    try:
        async with websockets.connect(ws_uri, ping_interval=None, close_timeout=5) as websocket:
            logger.info(f"✅ Connection to API server WebSocket proxy successful")
            return True
    except (websockets.exceptions.WebSocketException, ConnectionRefusedError) as e:
        logger.error(f"❌ API server WebSocket proxy error: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error with API server proxy: {e}")
        return False

def check_processes():
    """Check if the required processes are running (platform specific)."""
    import platform
    import subprocess
    
    system = platform.system()
    logger.info(f"Checking for running processes on {system}...")
    
    try:
        if system == "Linux" or system == "Darwin":  # macOS or Linux
            # Check for Python processes running portfolio_realtime
            try:
                cmd = "ps aux | grep -E 'python.*portfolio_realtime' | grep -v grep"
                output = subprocess.check_output(cmd, shell=True, universal_newlines=True)
                if output.strip():
                    logger.info("✅ Found running portfolio_realtime processes:")
                    for line in output.strip().split('\n'):
                        logger.info(f"   {line.strip()}")
                else:
                    logger.warning("⚠️ No portfolio_realtime processes found running")
            except subprocess.CalledProcessError:
                logger.warning("⚠️ No portfolio_realtime processes found running")
            
            # Check for Redis process
            try:
                cmd = "ps aux | grep redis-server | grep -v grep"
                output = subprocess.check_output(cmd, shell=True, universal_newlines=True)
                if output.strip():
                    logger.info("✅ Found running Redis server:")
                    for line in output.strip().split('\n'):
                        logger.info(f"   {line.strip()}")
                else:
                    logger.warning("⚠️ No Redis server process found running")
            except subprocess.CalledProcessError:
                logger.warning("⚠️ No Redis server process found running")
                
        elif system == "Windows":
            # Windows specific process checking
            try:
                cmd = 'wmic process where "commandline like \'%portfolio_realtime%\'" get commandline'
                output = subprocess.check_output(cmd, shell=True, universal_newlines=True)
                if len(output.strip().split('\n')) > 1:  # More than just the header
                    logger.info("✅ Found running portfolio_realtime processes")
                else:
                    logger.warning("⚠️ No portfolio_realtime processes found running")
            except subprocess.CalledProcessError:
                logger.warning("⚠️ No portfolio_realtime processes found running")
                
            # Check for Redis process on Windows
            try:
                cmd = 'wmic process where "name like \'%redis%\'" get name'
                output = subprocess.check_output(cmd, shell=True, universal_newlines=True)
                if len(output.strip().split('\n')) > 1:  # More than just the header
                    logger.info("✅ Found running Redis server")
                else:
                    logger.warning("⚠️ No Redis server process found running")
            except subprocess.CalledProcessError:
                logger.warning("⚠️ No Redis server process found running")
        else:
            logger.warning(f"⚠️ Process checking not supported on {system}")
    except Exception as e:
        logger.error(f"❌ Error checking processes: {e}")

async def run_diagnostics():
    """Run all diagnostic checks."""
    logger.info("=== WebSocket Connection Diagnostic Tool ===")
    logger.info(f"Started at: {datetime.now().isoformat()}")
    
    # Check processes first
    check_processes()
    
    # Check Redis connection
    redis_ok = check_redis_connection()
    
    # Check WebSocket server health on common ports
    ws_port_primary = os.getenv("WEBSOCKET_PORT", "8001")
    ws_ports_to_check = [ws_port_primary, "8001", "8000"]
    
    ws_health_ok = False
    working_port = None
    
    for port in ws_ports_to_check:
        if check_websocket_server_health(port):
            ws_health_ok = True
            working_port = port
            break
    
    # Check direct WebSocket connection if health check passed
    ws_connection_ok = False
    if ws_health_ok and working_port:
        ws_connection_ok = await check_websocket_connection(working_port)
    
    # Check API server proxy
    api_proxy_ok = await check_api_server_proxy()
    
    # Print summary
    logger.info("\n=== Diagnostic Summary ===")
    logger.info(f"Redis Connection: {'✅ OK' if redis_ok else '❌ FAILED'}")
    logger.info(f"WebSocket Server Health: {'✅ OK' if ws_health_ok else '❌ FAILED'}")
    logger.info(f"WebSocket Direct Connection: {'✅ OK' if ws_connection_ok else '❌ FAILED'}")
    logger.info(f"API Server WebSocket Proxy: {'✅ OK' if api_proxy_ok else '❌ FAILED'}")
    
    # Provide recommendations based on results
    logger.info("\n=== Recommendations ===")
    if not redis_ok:
        logger.info("1. Start Redis server using:")
        logger.info("   - macOS: brew services start redis")
        logger.info("   - Linux: sudo systemctl start redis-server")
        logger.info("   - Windows: Start Redis server from the installation directory")
    
    if not ws_health_ok:
        logger.info("2. Start the WebSocket server and other services:")
        logger.info("   cd backend")
        logger.info("   source venv/bin/activate  # Or your virtual environment activation")
        logger.info("   python -m portfolio_realtime.run_services")
    
    if not api_proxy_ok:
        logger.info("3. Make sure the API server is running:")
        logger.info("   cd backend")
        logger.info("   source venv/bin/activate")
        logger.info("   python api_server.py")
    
    if redis_ok and ws_health_ok and ws_connection_ok and not api_proxy_ok:
        logger.info("4. WebSocket server is working but API proxy isn't:")
        logger.info("   - Check if the API server is configured to proxy WebSocket connections")
        logger.info("   - Try connecting to the WebSocket server directly in the frontend code")

    if all([redis_ok, ws_health_ok, ws_connection_ok, api_proxy_ok]):
        logger.info("✅ All services appear to be working correctly!")

if __name__ == "__main__":
    asyncio.run(run_diagnostics()) 