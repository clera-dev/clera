"""
Market Data Consumer

This module subscribes to Alpaca's real-time market data for all tracked symbols
and updates a shared Redis cache with the latest prices.
"""

import os
import asyncio
import json
import logging
from datetime import datetime
import redis
from alpaca.data.live import StockDataStream
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("market_data_consumer")

# Load environment variables
load_dotenv()

class MarketDataConsumer:
    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=0,
                 market_api_key=None, market_secret_key=None, price_ttl=3600):
        """Initialize the Market Data Consumer service."""
        # Initialize Redis client
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db)
        self.pubsub = self.redis_client.pubsub()
        
        # Initialize StockDataStream with TRADING/MARKET DATA API credentials
        self.market_api_key = market_api_key or os.getenv("APCA_API_KEY_ID")
        self.market_secret_key = market_secret_key or os.getenv("APCA_API_SECRET_KEY")
        
        if not self.market_api_key or not self.market_secret_key:
            raise ValueError("Market API credentials are required")
            
        self.stock_stream = StockDataStream(
            api_key=self.market_api_key,
            secret_key=self.market_secret_key
        )
        
        # Set the TTL for price data in Redis
        self.price_ttl = price_ttl
        
        # Track which symbols we're monitoring
        self.monitored_symbols = set()
        
        logger.info("Market Data Consumer initialized")
    
    async def handle_quote(self, quote):
        """Handle real-time quote updates and store in Redis."""
        try:
            symbol = quote.symbol
            
            # Use ask_price as current price (could also use bid or last price)
            price = quote.ask_price
            
            # Format timestamp if available
            timestamp = quote.timestamp.isoformat() if hasattr(quote, 'timestamp') and quote.timestamp else datetime.now().isoformat()
            
            # Log for debugging (reduce in production)
            logger.debug(f"Received quote for {symbol}: {price} at {timestamp}")
            
            # Store in Redis with TTL
            self.redis_client.setex(f"price:{symbol}", self.price_ttl, str(price))
            
            # Store additional quote data for more advanced analytics
            quote_data = {
                'symbol': symbol,
                'ask_price': str(price),
                'bid_price': str(quote.bid_price) if hasattr(quote, 'bid_price') else None,
                'ask_size': quote.ask_size if hasattr(quote, 'ask_size') else None,
                'bid_size': quote.bid_size if hasattr(quote, 'bid_size') else None,
                'timestamp': timestamp
            }
            self.redis_client.setex(f"quote:{symbol}", self.price_ttl, json.dumps(quote_data))
            
            # Publish price update notification
            self.redis_client.publish('price_updates', json.dumps({
                'symbol': symbol,
                'price': str(price),
                'timestamp': timestamp
            }))
            
        except Exception as e:
            logger.error(f"Error handling quote for {quote.symbol if hasattr(quote, 'symbol') else 'unknown'}: {e}", exc_info=True)
    
    async def handle_symbol_updates(self):
        """Listen for symbol updates and modify subscriptions."""
        self.pubsub.subscribe('symbol_updates')
        
        logger.info("Starting to listen for symbol updates")
        
        for message in self.pubsub.listen():
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data'])
                    symbols_to_add = data.get('add', [])
                    symbols_to_remove = data.get('remove', [])
                    update_time = data.get('timestamp', datetime.now().isoformat())
                    
                    logger.info(f"Received symbol update at {update_time}")
                    
                    # Subscribe to new symbols
                    if symbols_to_add:
                        logger.info(f"Subscribing to quotes for: {symbols_to_add}")
                        self.stock_stream.subscribe_quotes(self.handle_quote, *symbols_to_add)
                        self.monitored_symbols.update(symbols_to_add)
                    
                    # Unsubscribe from removed symbols
                    if symbols_to_remove:
                        logger.info(f"Unsubscribing from quotes for: {symbols_to_remove}")
                        self.stock_stream.unsubscribe_quotes(*symbols_to_remove)
                        self.monitored_symbols.difference_update(symbols_to_remove)
                        
                        # Clean up Redis cache entries for removed symbols
                        for symbol in symbols_to_remove:
                            self.redis_client.delete(f"price:{symbol}")
                            self.redis_client.delete(f"quote:{symbol}")
                    
                    # Log current status
                    logger.info(f"Now monitoring {len(self.monitored_symbols)} symbols")
                
                except Exception as e:
                    logger.error(f"Error processing symbol updates: {e}", exc_info=True)
    
    async def initialize_symbols(self):
        """Initialize symbols from Redis on startup."""
        try:
            # Get list of symbols from Redis
            symbols_json = self.redis_client.get('tracked_symbols')
            if symbols_json:
                symbols = json.loads(symbols_json)
                if symbols:
                    logger.info(f"Initializing with {len(symbols)} symbols from Redis")
                    self.stock_stream.subscribe_quotes(self.handle_quote, *symbols)
                    self.monitored_symbols.update(symbols)
                    return True
                else:
                    logger.info("No symbols found in Redis")
            else:
                logger.info("No tracked_symbols key found in Redis")
            
            return False
        except Exception as e:
            logger.error(f"Error initializing symbols: {e}", exc_info=True)
            return False
    
    async def report_statistics(self, interval_seconds=60):
        """Periodically report statistics about the monitored symbols."""
        while True:
            try:
                logger.info(f"Currently monitoring {len(self.monitored_symbols)} symbols")
                
                # Report a few random symbols for debugging
                if self.monitored_symbols:
                    sample_symbols = list(self.monitored_symbols)[:5] if len(self.monitored_symbols) > 5 else list(self.monitored_symbols)
                    sample_prices = []
                    
                    for symbol in sample_symbols:
                        price = self.redis_client.get(f"price:{symbol}")
                        price_str = price.decode('utf-8') if price else "None"
                        sample_prices.append(f"{symbol}: {price_str}")
                    
                    logger.info(f"Sample prices: {', '.join(sample_prices)}")
            except Exception as e:
                logger.error(f"Error reporting statistics: {e}")
            
            await asyncio.sleep(interval_seconds)
    
    async def run(self):
        """Run the Market Data Consumer service."""
        logger.info("Market Data Consumer service starting")
        
        # Initialize with existing symbols
        initialized = await self.initialize_symbols()
        if not initialized:
            logger.warning("No initial symbols loaded, waiting for symbol updates")
        
        # Start symbol update listener in a separate task
        symbol_updates_task = asyncio.create_task(self.handle_symbol_updates())
        
        # Start statistics reporter in a separate task
        stats_task = asyncio.create_task(self.report_statistics())
        
        # Use the proper way to run the stock stream with asyncio
        try:
            # Create a separate thread to run the stock_stream.run() method
            # which internally creates its own event loop
            import threading
            
            def run_ws_stream():
                # This runs in a separate thread with its own event loop
                logger.info("Starting market data stream in separate thread")
                try:
                    self.stock_stream.run()
                    logger.info("Market data stream thread ended normally")
                except Exception as ws_err:
                    logger.error(f"Error in market data stream thread: {ws_err}")
                    
            # Start the WebSocket stream in a separate thread
            ws_thread = threading.Thread(target=run_ws_stream, daemon=True)
            ws_thread.start()
            logger.info("Market data stream thread started")
            
            # Monitor the thread and handle potential disconnections
            while True:
                # Check if the thread is still alive
                if not ws_thread.is_alive():
                    logger.warning("Market data stream thread died, restarting...")
                    ws_thread = threading.Thread(target=run_ws_stream, daemon=True)
                    ws_thread.start()
                    logger.info("Market data stream thread restarted")
                
                # Wait before checking again
                await asyncio.sleep(5)
                
        except Exception as e:
            logger.error(f"Market data stream error: {e}", exc_info=True)
        finally:
            # Cancel background tasks
            symbol_updates_task.cancel()
            stats_task.cancel()
            # Stop the WebSocket stream
            try:
                self.stock_stream.stop()
                logger.info("Stopped market data stream")
            except Exception as stop_err:
                logger.error(f"Error stopping market data stream: {stop_err}")
            logger.info("Market data stream stopped")

async def main():
    """Main entry point for the Market Data Consumer service."""
    # Parse command line arguments or use environment variables
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379")) 
    redis_db = int(os.getenv("REDIS_DB", "0"))
    price_ttl = int(os.getenv("PRICE_TTL", "3600"))  # Default 1 hour
    
    # Create and run the consumer
    consumer = MarketDataConsumer(
        redis_host=redis_host,
        redis_port=redis_port,
        redis_db=redis_db,
        price_ttl=price_ttl
    )
    
    try:
        await consumer.run()
    except KeyboardInterrupt:
        logger.info("Market Data Consumer service stopped by user")
    except Exception as e:
        logger.error(f"Market Data Consumer service stopped due to error: {e}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(main()) 