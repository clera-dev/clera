"""
Symbol Collector Service

This module collects unique symbols across all user accounts and 
stores them in Redis for the market data consumer to subscribe to.
"""

import os
import asyncio
import json
import logging
from datetime import datetime
import redis
from alpaca.broker import BrokerClient
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("symbol_collector")

# Load environment variables
load_dotenv()

class SymbolCollector:
    def __init__(self, redis_host=None, redis_port=None, redis_db=None, broker_api_key=None, broker_secret_key=None, sandbox=False):
        """Initialize the Symbol Collector service."""
        _IS_PRODUCTION = os.getenv("COPILOT_ENVIRONMENT_NAME", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production"
        if _IS_PRODUCTION:
            redis_host = redis_host or os.getenv("REDIS_HOST")
            if not redis_host:
                raise RuntimeError("REDIS_HOST environment variable must be set in production!")
        else:
            redis_host = redis_host or os.getenv("REDIS_HOST", "127.0.0.1")
        redis_port = int(redis_port or os.getenv("REDIS_PORT", "6379"))
        redis_db = int(redis_db or os.getenv("REDIS_DB", "0"))
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db)
        self.pubsub = self.redis_client.pubsub()
        
        # Initialize Broker client with BROKER API credentials
        self.broker_api_key = broker_api_key or os.getenv("BROKER_API_KEY")
        self.broker_secret_key = broker_secret_key or os.getenv("BROKER_SECRET_KEY")
        
        if not self.broker_api_key or not self.broker_secret_key:
            raise ValueError("Broker API credentials are required")
            
        self.broker_client = BrokerClient(
            api_key=self.broker_api_key,
            secret_key=self.broker_secret_key, 
            sandbox=sandbox
        )
        
        # Track account positions and symbols
        self.all_account_positions = {}  # account_id -> list of positions
        self.unique_symbols = set()  # set of all unique symbols across accounts
        
        logger.info("Symbol Collector initialized")
    
    async def collect_symbols(self):
        """Collect all unique symbols across all accounts and store in Redis."""
        try:
            logger.info("Starting symbol collection")
            
            # Use the efficient get_all_accounts_positions method
            all_positions = self.broker_client.get_all_accounts_positions()
            
            # Extract positions dictionary from the AllAccountsPositions object
            positions_dict = all_positions.positions
            
            # Store for future reference
            self.all_account_positions = positions_dict
            
            # Extract unique symbols from all accounts
            new_unique_symbols = set()
            account_count = 0
            position_count = 0
            
            for account_id, positions in positions_dict.items():
                account_count += 1
                for position in positions:
                    position_count += 1
                    new_unique_symbols.add(position.symbol)
            
            # Identify symbols to add and remove from tracking
            symbols_to_add = new_unique_symbols - self.unique_symbols
            symbols_to_remove = self.unique_symbols - new_unique_symbols
            
            # Update our set of unique symbols
            self.unique_symbols = new_unique_symbols
            
            # Store the updated symbol list in Redis for other services to access
            self.redis_client.set('tracked_symbols', json.dumps(list(self.unique_symbols)))
            
            # Store account positions for easy access by the portfolio calculator
            for account_id, positions in positions_dict.items():
                # Serialize each position object for storage
                serialized_positions = []
                for position in positions:
                    # Extract relevant fields from position object
                    pos_dict = {
                        'symbol': position.symbol,
                        'qty': str(position.qty),
                        'market_value': str(position.market_value),
                        'cost_basis': str(position.cost_basis),
                        'unrealized_pl': str(position.unrealized_pl),
                        'unrealized_plpc': str(position.unrealized_plpc),
                        'current_price': str(position.current_price),
                        'asset_id': str(position.asset_id),  # Convert UUID to string
                        'asset_class': position.asset_class,
                        'asset_marginable': position.asset_marginable,
                        'avg_entry_price': str(position.avg_entry_price),
                        'side': position.side,
                        'exchange': position.exchange,
                    }
                    serialized_positions.append(pos_dict)
                
                # Store with TTL of 1 hour (3600 seconds)
                self.redis_client.setex(
                    f'account_positions:{account_id}', 
                    3600, 
                    json.dumps(serialized_positions)
                )
            
            # Store a timestamp of when we last updated
            self.redis_client.set('symbol_collection_last_updated', datetime.now().isoformat())
            
            # Publish symbols_to_add and symbols_to_remove for the market data consumer
            if symbols_to_add or symbols_to_remove:
                self.redis_client.publish('symbol_updates', json.dumps({
                    'add': list(symbols_to_add),
                    'remove': list(symbols_to_remove),
                    'timestamp': datetime.now().isoformat()
                }))
            
            logger.info(f"Symbol collection complete. Found {account_count} accounts with {position_count} positions.")
            logger.info(f"Now tracking {len(self.unique_symbols)} unique symbols.")
            if symbols_to_add:
                logger.info(f"Symbols added: {list(symbols_to_add)}")
            if symbols_to_remove:
                logger.info(f"Symbols removed: {list(symbols_to_remove)}")
                
            return symbols_to_add, symbols_to_remove
            
        except Exception as e:
            logger.error(f"Error collecting symbols: {e}", exc_info=True)
            return set(), set()

    async def run(self, interval_seconds=300):
        """Run the symbol collector periodically."""
        logger.info(f"Symbol Collector service starting with interval of {interval_seconds} seconds")
        while True:
            try:
                await self.collect_symbols()
            except Exception as e:
                logger.error(f"Error in collection cycle: {e}", exc_info=True)
            
            # Wait before checking again
            logger.info(f"Waiting {interval_seconds} seconds until next collection cycle")
            await asyncio.sleep(interval_seconds)

async def main():
    """Main entry point for the Symbol Collector service."""
    # Parse command line arguments or use environment variables
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_db = int(os.getenv("REDIS_DB", "0"))
    collection_interval = int(os.getenv("SYMBOL_COLLECTION_INTERVAL", "300"))
    sandbox_mode = os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
    
    # Create and run the collector
    broker_api_key = os.getenv("BROKER_API_KEY")
    broker_secret_key = os.getenv("BROKER_SECRET_KEY")
    collector = SymbolCollector(
        redis_host=redis_host,
        redis_port=redis_port,
        redis_db=redis_db,
        broker_api_key=broker_api_key,
        broker_secret_key=broker_secret_key,
        sandbox=sandbox_mode
    )
    
    try:
        await collector.run(interval_seconds=collection_interval)
    except KeyboardInterrupt:
        logger.info("Symbol Collector service stopped by user")
    except Exception as e:
        logger.error(f"Symbol Collector service stopped due to error: {e}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(main()) 