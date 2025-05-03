"""
Portfolio Realtime Services Runner

This script runs all required services for real-time portfolio tracking:
1. Symbol Collector
2. Market Data Consumer
3. Portfolio Calculator
4. WebSocket Server
"""

import os
import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager
import uvicorn
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("portfolio_realtime")

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import services
from portfolio_realtime.symbol_collector import SymbolCollector
from portfolio_realtime.market_data_consumer import MarketDataConsumer
from portfolio_realtime.portfolio_calculator import PortfolioCalculator
from portfolio_realtime.websocket_server import app as websocket_app

# Load environment variables
load_dotenv()

# Flag to signal all services to shut down
shutdown_flag = False

# Check Redis connection before starting
def check_redis_connection():
    """Check if Redis is running and accessible."""
    try:
        import redis
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_DB", "0"))
        
        client = redis.Redis(host=redis_host, port=redis_port, db=redis_db)
        client.ping()
        logger.info(f"Redis connection confirmed at {redis_host}:{redis_port}")
        return True
    except Exception as e:
        logger.error(f"Cannot connect to Redis: {e}")
        logger.error(f"Make sure Redis is running at {redis_host}:{redis_port}")
        return False

async def run_symbol_collector():
    """Run the Symbol Collector service."""
    try:
        logger.info("Starting Symbol Collector service...")
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_DB", "0"))
        collection_interval = int(os.getenv("SYMBOL_COLLECTION_INTERVAL", "300"))
        sandbox_mode = os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
        
        collector = SymbolCollector(
            redis_host=redis_host,
            redis_port=redis_port,
            redis_db=redis_db,
            sandbox=sandbox_mode
        )
        
        # Initial collection
        await collector.collect_symbols()
        
        # Run until shutdown signal
        while not shutdown_flag:
            await asyncio.sleep(collection_interval)
            if not shutdown_flag:
                await collector.collect_symbols()
    except asyncio.CancelledError:
        logger.info("Symbol Collector service cancelled")
    except Exception as e:
        logger.error(f"Symbol Collector service error: {e}", exc_info=True)

async def run_market_data_consumer():
    """Run the Market Data Consumer service."""
    try:
        logger.info("Starting Market Data Consumer service...")
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_DB", "0"))
        price_ttl = int(os.getenv("PRICE_TTL", "3600"))
        
        consumer = MarketDataConsumer(
            redis_host=redis_host,
            redis_port=redis_port,
            redis_db=redis_db,
            price_ttl=price_ttl
        )
        
        await consumer.run()
    except asyncio.CancelledError:
        logger.info("Market Data Consumer service cancelled")
    except Exception as e:
        logger.error(f"Market Data Consumer service error: {e}", exc_info=True)

async def run_portfolio_calculator():
    """Run the Portfolio Calculator service."""
    try:
        logger.info("Starting Portfolio Calculator service...")
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_DB", "0"))
        min_update_interval = int(os.getenv("MIN_UPDATE_INTERVAL", "2"))
        recalculation_interval = int(os.getenv("RECALCULATION_INTERVAL", "30"))
        sandbox_mode = os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
        
        calculator = PortfolioCalculator(
            redis_host=redis_host,
            redis_port=redis_port,
            redis_db=redis_db,
            min_update_interval=min_update_interval,
            sandbox=sandbox_mode
        )
        
        await calculator.run(recalculation_interval=recalculation_interval)
    except asyncio.CancelledError:
        logger.info("Portfolio Calculator service cancelled")
    except Exception as e:
        logger.error(f"Portfolio Calculator service error: {e}", exc_info=True)

async def run_websocket_server():
    """Run the WebSocket Server."""
    try:
        logger.info("Starting WebSocket Server...")
        
        # Always use port 8001 for the WebSocket server to ensure consistency
        # Port 8000 is reserved for the API server
        port = int(os.getenv("WEBSOCKET_PORT", "8001"))
        host = os.getenv("WEBSOCKET_HOST", "localhost")  # Use localhost instead of 0.0.0.0 for better compatibility
        
        logger.info(f"WebSocket server configured to run on {host}:{port}")
        
        config = uvicorn.Config(
            websocket_app,
            host=host,
            port=port,
            log_level="info"
        )
        server = uvicorn.Server(config)
        await server.serve()
    except asyncio.CancelledError:
        logger.info("WebSocket Server cancelled")
    except Exception as e:
        logger.error(f"WebSocket Server error: {e}", exc_info=True)

async def shutdown(signal_type):
    """Gracefully shutdown all services."""
    global shutdown_flag
    logger.info(f"Received {signal_type} signal, shutting down...")
    shutdown_flag = True

def handle_signal(sig_num, frame):
    """Handle OS signals."""
    if sig_num == signal.SIGINT:
        # Set the shutdown flag
        global shutdown_flag
        shutdown_flag = True
        logger.info("Shutdown signal received. Stopping services...")

async def main():
    """Main entry point to run all services."""
    # Check Redis connection first
    if not check_redis_connection():
        logger.error("Cannot proceed without Redis connection. Exiting.")
        return
        
    # Register signal handlers
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    
    # Start all services
    tasks = [
        asyncio.create_task(run_symbol_collector()),
        asyncio.create_task(run_market_data_consumer()),
        asyncio.create_task(run_portfolio_calculator()),
        asyncio.create_task(run_websocket_server())
    ]
    
    logger.info("All services started")
    
    # Wait for all tasks to complete or for shutdown signal
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        logger.info("Cancelling all services...")
        for task in tasks:
            task.cancel()
        
        # Wait for all tasks to be cancelled
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        logger.info("All services have stopped")

if __name__ == "__main__":
    try:
        # Check that environment variables are set
        required_vars = ["BROKER_API_KEY", "BROKER_SECRET_KEY", "APCA_API_KEY_ID", "APCA_API_SECRET_KEY"]
        missing_vars = [var for var in required_vars if not os.getenv(var)]
        
        if missing_vars:
            logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
            logger.error("Please set these variables in your .env file or environment")
            sys.exit(1)
        
        # Run the main event loop
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Services stopped by user")
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True) 