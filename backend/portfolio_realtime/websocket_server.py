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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import time
import jwt
from typing import Optional

# Import services for periodic data refresh
from portfolio_realtime.symbol_collector import SymbolCollector
from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from portfolio_realtime.sector_data_collector import SectorDataCollector
from utils.supabase.db_client import get_user_alpaca_account_id
from utils.portfolio.websocket_auth_service import authorize_websocket_connection_safe
from utils.portfolio.realtime_data_service import RealtimeDataService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("websocket_server")

# Load environment variables
load_dotenv()

# PRODUCTION-SAFE periodic data refresh task
async def periodic_data_refresh(redis_client, refresh_interval=300):  # Changed default from 60 to 300 seconds (5 minutes)
    """
    Periodically refresh account data in Redis - PRODUCTION SAFE VERSION
    Handles different portfolio modes without breaking existing functionality.
    """
    logger.info(f"Starting PRODUCTION-SAFE periodic data refresh (every {refresh_interval} seconds)")
    
    # Create the production-safe realtime data service
    realtime_service = RealtimeDataService(redis_client)
    
    # Track refresh intervals
    last_full_refresh = 0
    last_sector_collection = 0
    
    # Configuration
    full_refresh_interval = int(os.getenv("FULL_REFRESH_INTERVAL", "900"))  # 15 minutes default  
    sector_collection_interval = 86400  # 24 hours
    
    # Initial sector data collection check (only if Alpaca components available)
    try:
        existing_sector_data = redis_client.get('sector_data')
        if not existing_sector_data:
            logger.info("No sector data found in Redis. Attempting initial sector collection...")
            sector_success = await realtime_service.refresh_sector_data()
            if sector_success:
                last_sector_collection = time.time()
                logger.info("Initial sector data collection completed")
                await asyncio.sleep(2)  # Small delay after initial collection
            else:
                logger.info("Sector data collection not available - continuing without it")
    except Exception as e:
        logger.error(f"Error during initial sector data collection: {e}", exc_info=True)
    
    while True:
        try:
            current_time = time.time()
            
            # Determine refresh needs
            need_full_refresh = (current_time - last_full_refresh) > full_refresh_interval
            need_sector_collection = (current_time - last_sector_collection) > sector_collection_interval
            
            # Perform the refresh using the production-safe service
            results = await realtime_service.perform_periodic_refresh(
                need_full_refresh=need_full_refresh,
                need_sector_refresh=need_sector_collection
            )
            
            # Update tracking variables based on results
            if need_full_refresh:
                last_full_refresh = current_time
            if need_sector_collection and results.get("sector_success", False):
                last_sector_collection = current_time
            
            # Log results
            total_refreshed = results.get("alpaca_refreshed", 0) + results.get("plaid_refreshed", 0)
            duration = results.get("duration_seconds", 0)
            
            log_message = f"Periodic refresh complete: {total_refreshed} accounts refreshed in {duration:.2f}s"
            if results.get("alpaca_refreshed", 0) > 0:
                log_message += f" (Alpaca: {results['alpaca_refreshed']})"
            if results.get("plaid_refreshed", 0) > 0:
                log_message += f" (Plaid: {results['plaid_refreshed']})"
            if results.get("errors"):
                log_message += f" (Errors: {len(results['errors'])})"
            
            logger.info(log_message)
            
            # Log any errors
            for error in results.get("errors", []):
                logger.warning(f"Refresh error: {error}")
            
        except Exception as e:
            logger.error(f"Critical error in periodic data refresh: {e}", exc_info=True)
        
        # Wait before next refresh cycle
        await asyncio.sleep(refresh_interval)

# Define lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # Startup: Start the Redis subscriber and periodic refresh
    logger.info("Starting WebSocket server...")
    
    # Create a separate task for Redis subscription
    main_loop = asyncio.get_running_loop()
    redis_subscriber_task = asyncio.create_task(start_redis_subscriber(main_loop))
    
    # Start periodic data refresh task with a more conservative default interval
    refresh_interval = int(os.getenv("DATA_REFRESH_INTERVAL", "300"))  # Changed default from 60 to 300 seconds
    refresh_task = asyncio.create_task(periodic_data_refresh(redis_client, refresh_interval))
    logger.info(f"Started periodic data refresh task (interval: {refresh_interval}s)")
    
    yield  # App runs here
    
    # Shutdown: Clean up resources
    logger.info("Shutting down WebSocket server...")
    redis_subscriber_task.cancel()
    refresh_task.cancel()
    try:
        await redis_subscriber_task
        await refresh_task
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
        "https://www.askclera.com",  # Production domain alternate
        "https://askclera.com",      # Production root domain
        # Allow HTTPS WebSocket origins
        "wss://app.askclera.com",
        "wss://api.askclera.com",
        "wss://ws.askclera.com",     # New dedicated WebSocket domain
        # Allow HTTP WebSocket origins for local dev
        "ws://localhost:3000",
        "ws://localhost:8000",
        "ws://localhost:8001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
_IS_PRODUCTION = os.getenv("COPILOT_ENVIRONMENT_NAME", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production"
if _IS_PRODUCTION:
    redis_host = os.getenv("REDIS_HOST")
    if not redis_host:
        raise RuntimeError("REDIS_HOST environment variable must be set in production!")
else:
    redis_host = os.getenv("REDIS_HOST", "127.0.0.1")
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

# --- JWT Verification Helper ---
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
if not SUPABASE_JWT_SECRET:
    # In a real deployment, you might want to raise an error or exit
    # if the secret is not configured, as auth won't work.
    logger.critical("CRITICAL: SUPABASE_JWT_SECRET environment variable not set. WebSocket authentication will fail.")

def verify_token(token: Optional[str]) -> Optional[str]:
    """Verifies the Supabase JWT token.

    Args:
        token: The JWT token string.

    Returns:
        The user ID (sub) if the token is valid, None otherwise.
    """
    if not token:
        logger.warning("WebSocket Auth: No token provided.")
        return None
    if not SUPABASE_JWT_SECRET:
        logger.error("WebSocket Auth: JWT Secret not configured on server.")
        return None # Cannot verify without secret
        
    try:
        # Verify signature, expiration, and audience ('authenticated')
        payload = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=["HS256"], 
            audience="authenticated" # CRUCIAL: Validate audience
        )
        user_id = payload.get("sub")
        if not user_id:
             logger.warning("WebSocket Auth: Token valid but missing 'sub' (user ID).")
             return None
        logger.info(f"WebSocket Auth: Token successfully verified for user: {user_id}")
        return user_id # Return the user ID (subject)
    except jwt.ExpiredSignatureError:
        logger.warning("WebSocket Auth: Token has expired.")
        return None
    except jwt.InvalidAudienceError:
        logger.warning("WebSocket Auth: Invalid token audience.")
        return None
    except jwt.InvalidTokenError as e:
        # Catches other JWT errors (invalid signature, malformed, etc.)
        logger.warning(f"WebSocket Auth: Invalid token: {e}")
        return None
    except Exception as e:
        # Catch unexpected errors during decoding
        logger.error(f"WebSocket Auth: Unexpected error verifying token: {e}", exc_info=True)
        return None

# WebSocket endpoint
@app.websocket("/ws/portfolio/{account_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    account_id: str = Path(...),
    token: Optional[str] = Query(None) # Extract token from query param
):
    # --- Authentication & Authorization ---
    user_id = verify_token(token)
    if not user_id:
        # Deny connection if token is invalid/missing
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
        return
        
    # PRODUCTION-SAFE Authorization check: Handles all portfolio modes
    try:
        authorized, error_message, auth_metadata = authorize_websocket_connection_safe(user_id, account_id)
        
        if not authorized:
            error_reason = error_message or "Forbidden"
            logger.warning(f"WebSocket AuthZ: User {user_id} denied access to account {account_id}: {error_reason}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=error_reason)
            return
            
        # Log successful authorization with mode information
        portfolio_mode = auth_metadata.get('mode', 'unknown')
        account_type = auth_metadata.get('account_type', 'unknown')
        logger.info(f"WebSocket AuthZ: User {user_id} granted access to account {account_id} (mode: {portfolio_mode}, type: {account_type})")
        
    except Exception as e:
        # Handle unexpected errors in authorization
        logger.error(f"WebSocket AuthZ: Unexpected error during authorization for user {user_id}: {e}", exc_info=True)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Authorization system error")
        return
    
    # --- Connection Handling (Original Logic) ---
    try:
        await manager.connect(websocket, account_id)
        # Calculate the count directly instead of calling a non-existent method
        connection_count = len(manager.active_connections.get(account_id, []))
        logger.info(f"New connection established for account {account_id}, now {connection_count} connections for this account")
        
        # Send initial portfolio data if available
        await send_initial_portfolio_data(websocket, account_id)
        
        # Keep connection open and handle messages/heartbeats
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                if message.get("type") == "heartbeat":
                    # Respond to heartbeat
                    await websocket.send_json({"type": "heartbeat_ack", "timestamp": time.time()})
                else:
                    # Handle other message types if needed in the future
                    logger.info(f"Received unhandled message from {account_id}: {data}")
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for account {account_id} (client initiated)")
                break # Exit loop on disconnect
            except json.JSONDecodeError:
                logger.warning(f"Received invalid JSON from {account_id}")
                # Optionally send an error message back
                # await websocket.send_json({"error": "Invalid JSON format"})
            except Exception as e:
                # Catch other potential errors during receive/process
                logger.error(f"Error during WebSocket communication for {account_id}: {e}", exc_info=True)
                # Consider closing the connection if error is severe
                # await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
                break # Exit loop on other errors
                
    except WebSocketDisconnect as e:
        # This catch block is primarily for disconnects *during* the initial connect phase
        # or if an error occurs before the main loop starts
        logger.info(f"WebSocket disconnected during setup for account {account_id}, reason: {e.reason} (code: {e.code})")
    except Exception as e:
        # Catch unexpected errors during the connection setup phase
        logger.error(f"Unexpected error during WebSocket setup for {account_id}: {e}", exc_info=True)
        # Ensure connection is closed if setup fails
        # Check if websocket is still open before trying to close
        if websocket.client_state == websocket.client_state.CONNECTED:
             await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
    finally:
        # Always ensure cleanup happens
        manager.disconnect(websocket, account_id)
        # Correctly get remaining connection count for the specific account
        remaining_count = len(manager.active_connections.get(account_id, []))
        logger.info(f"Cleaned up connection for account {account_id}, now {remaining_count} connections remaining for this account")

async def send_initial_portfolio_data(websocket: WebSocket, account_id: str):
    """Send the latest known portfolio value for this account upon connection."""
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
        "version": "1.1.1",  # Increment version to track changes
        "service": "websocket-server",
        "data_refresh_interval": os.getenv("DATA_REFRESH_INTERVAL", "300"),
        "full_refresh_interval": os.getenv("FULL_REFRESH_INTERVAL", "900")
    }

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