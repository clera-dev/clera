"""
WebSocket Server

This module handles WebSocket connections with clients and pushes
real-time portfolio updates from Redis to the connected clients.
"""

import os
import asyncio
import json
import logging
from datetime import datetime
import redis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("websocket_server")

# Load environment variables
load_dotenv()

# Define lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # Startup: Start the Redis subscriber
    logger.info("Starting WebSocket server...")
    
    # Create a separate task for Redis subscription
    main_loop = asyncio.get_running_loop()
    redis_subscriber_task = asyncio.create_task(start_redis_subscriber(main_loop))
    
    yield  # App runs here
    
    # Shutdown: Clean up resources
    logger.info("Shutting down WebSocket server...")
    redis_subscriber_task.cancel()
    try:
        await redis_subscriber_task
    except asyncio.CancelledError:
        pass

# Function to start Redis subscriber in a background thread
async def start_redis_subscriber(main_loop):
    """Start the Redis subscriber in a background thread."""
    # Use asyncio.to_thread to run the blocking Redis pubsub in a background thread
    await asyncio.to_thread(redis_subscriber_thread, main_loop)

# Function that runs in a background thread
def redis_subscriber_thread(main_loop):
    """Listen for portfolio updates from Redis in a background thread."""
    # Create a new Redis connection for this thread
    thread_redis = redis.Redis(host=redis_host, port=redis_port, db=redis_db)
    pubsub = thread_redis.pubsub()
    pubsub.subscribe('portfolio_updates')
    
    logger.info("Started Redis subscriber for portfolio updates (in background thread)")
    
    try:
        # Process messages from Redis
        for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    # Parse the message data
                    data = json.loads(message['data'])
                    account_id = data.get('account_id')
                    
                    if account_id:
                        # Store the latest portfolio data in Redis
                        last_portfolio_key = f"last_portfolio:{account_id}"
                        thread_redis.set(last_portfolio_key, message['data'])
                        
                        # Create a task in the main event loop
                        asyncio.run_coroutine_threadsafe(
                            manager.broadcast_to_account(account_id, data),
                            main_loop
                        )
                except Exception as e:
                    logger.error(f"Error processing portfolio update: {e}")
    except Exception as e:
        logger.error(f"Error in Redis listener thread: {e}")

# Create FastAPI app with lifespan
app = FastAPI(
    title="Portfolio Real-time WebSocket Server",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",     # Frontend development
        "http://127.0.0.1:3000",     # Frontend development alternative
        "http://localhost:8000",     # API server
        "http://127.0.0.1:8000",     # API server alternative
        "https://app.askclera.com",  # Production domain
        "*",                         # Allow all origins during development (remove in production)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
redis_db = int(os.getenv("REDIS_DB", "0"))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db)

# Connection manager to track active WebSocket connections by account_id
class ConnectionManager:
    def __init__(self):
        """Initialize the connection manager."""
        self.active_connections = {}  # account_id -> list of websocket connections
        logger.info("Connection manager initialized")
    
    async def connect(self, websocket: WebSocket, account_id: str):
        """Connect a new client for a specific account."""
        await websocket.accept()
        if account_id not in self.active_connections:
            self.active_connections[account_id] = []
        self.active_connections[account_id].append(websocket)
        logger.info(f"New connection established for account {account_id}, " + 
                  f"now {len(self.active_connections[account_id])} connections for this account")
    
    def disconnect(self, websocket: WebSocket, account_id: str):
        """Disconnect a client from a specific account."""
        if account_id in self.active_connections:
            if websocket in self.active_connections[account_id]:
                self.active_connections[account_id].remove(websocket)
                logger.info(f"Connection removed for account {account_id}, " + 
                          f"remaining: {len(self.active_connections[account_id])}")
            
            # Clean up empty accounts
            if not self.active_connections[account_id]:
                del self.active_connections[account_id]
                logger.info(f"No more connections for account {account_id}, removed from tracking")
    
    async def broadcast_to_account(self, account_id: str, message: dict):
        """Broadcast a message to all connections for a specific account."""
        if account_id in self.active_connections:
            dead_connections = []
            sent_count = 0
            
            for connection in self.active_connections[account_id]:
                try:
                    await connection.send_json(message)
                    sent_count += 1
                except Exception as e:
                    logger.error(f"Error sending to connection for account {account_id}: {e}")
                    dead_connections.append(connection)
            
            # Clean up any dead connections
            for dead in dead_connections:
                self.disconnect(dead, account_id)
            
            if sent_count > 0:
                logger.debug(f"Broadcast portfolio update to {sent_count} connections for account {account_id}")
    
    def get_connection_stats(self):
        """Get statistics about active connections."""
        total_connections = sum(len(connections) for connections in self.active_connections.values())
        account_count = len(self.active_connections)
        return {
            "accounts": account_count,
            "connections": total_connections,
            "timestamp": datetime.now().isoformat()
        }

# Create connection manager instance
manager = ConnectionManager()

# WebSocket endpoint
@app.websocket("/ws/portfolio/{account_id}")
async def websocket_endpoint(websocket: WebSocket, account_id: str):
    """Handle WebSocket connections for a specific account."""
    logger.info(f"Incoming WebSocket connection for account {account_id}")
    
    try:
        await manager.connect(websocket, account_id)
        logger.info(f"WebSocket connection accepted for {account_id}")
        
        # After connection is established, send initial portfolio data
        await send_initial_portfolio_data(websocket, account_id)
        
        # Listen for messages from the client
        while True:
            # Wait for a message from the client
            data = await websocket.receive_text()
            
            # Handle heartbeat messages from the client
            try:
                message = json.loads(data)
                if isinstance(message, dict) and message.get('type') == 'heartbeat':
                    # Send heartbeat acknowledgment
                    await websocket.send_json({
                        'type': 'heartbeat_ack',
                        'timestamp': int(time.time() * 1000)  # Current time in milliseconds
                    })
                    logger.debug(f"Received heartbeat from client for account {account_id}, sent acknowledgment")
                    continue
            except (json.JSONDecodeError, TypeError, ValueError):
                # If not a JSON message or not a heartbeat, ignore it
                logger.debug(f"Received message from client that is not a heartbeat: {data[:100]}")
                pass
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for account {account_id}")
        manager.disconnect(websocket, account_id)
    except Exception as e:
        logger.error(f"Error in WebSocket connection for account {account_id}: {str(e)}")
        manager.disconnect(websocket, account_id)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for the WebSocket server."""
    # Check Redis connection
    try:
        redis_client.ping()
        redis_status = "connected"
    except Exception as e:
        redis_status = f"error: {str(e)}"
    
    # Get connection stats
    stats = manager.get_connection_stats()
    
    # Include server port
    server_port = os.getenv("WEBSOCKET_PORT", "8001")
    
    # Include more detailed information
    return {
        "status": "healthy",
        "redis": redis_status,
        "connections": stats["connections"],
        "accounts": stats["accounts"],
        "timestamp": datetime.now().isoformat(),
        "port": server_port,
        "host": os.getenv("WEBSOCKET_HOST", "0.0.0.0"),
        "version": "1.0.2",  # Increment version to track changes
        "service": "websocket-server"
    }

async def send_initial_portfolio_data(websocket: WebSocket, account_id: str):
    """Send initial portfolio data to a new WebSocket connection."""
    try:
        # Get the most recent portfolio data from Redis (if available)
        last_portfolio_key = f"last_portfolio:{account_id}"
        last_portfolio_data = redis_client.get(last_portfolio_key)
        
        if last_portfolio_data:
            portfolio_data = json.loads(last_portfolio_data)
            await websocket.send_json(portfolio_data)
            logger.info(f"Sent initial portfolio data to new connection for account {account_id}")
        else:
            logger.warning(f"No initial portfolio data available for account {account_id}")
    except Exception as e:
        logger.error(f"Error sending initial data to {account_id}: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("WEBSOCKET_PORT", "8001"))
    host = os.getenv("WEBSOCKET_HOST", "0.0.0.0")
    
    logger.info(f"Starting WebSocket server on {host}:{port}")
    try:
        uvicorn.run(app, host=host, port=port, log_level="debug")
    except Exception as e:
        logger.error(f"Failed to start WebSocket server: {e}", exc_info=True)
        # Try an alternative port if the specified one fails
        alternative_port = port + 1
        logger.info(f"Attempting to start on alternative port {alternative_port}")
        try:
            uvicorn.run(app, host=host, port=alternative_port, log_level="debug")
        except Exception as e2:
            logger.error(f"Failed to start on alternative port: {e2}", exc_info=True) 