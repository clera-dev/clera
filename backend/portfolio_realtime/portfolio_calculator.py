"""
Portfolio Calculator Service

This module computes portfolio values for accounts using the latest prices 
from the shared Redis cache and publishes updates to connected clients.
"""

import os
import asyncio
import json
import logging
from datetime import datetime
import redis
from alpaca.broker import BrokerClient
from alpaca.broker.models.accounts import Disclosures
from pydantic import Field
from typing import Optional
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("portfolio_calculator")

# Load environment variables
load_dotenv()

# Fix Alpaca SDK validation error for None values in boolean fields
# Patch the Disclosures model to accept None values for boolean fields
class PatchedDisclosures(Disclosures):
    is_control_person: Optional[bool] = Field(default=False)
    is_affiliated_exchange_or_finra: Optional[bool] = Field(default=False)
    is_politically_exposed: Optional[bool] = Field(default=False)
    immediate_family_exposed: Optional[bool] = Field(default=False)

# Apply the monkey patch
import alpaca.broker.models.accounts
alpaca.broker.models.accounts.Disclosures = PatchedDisclosures

class PortfolioCalculator:
    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=0,
                 broker_api_key=None, broker_secret_key=None, sandbox=False,
                 min_update_interval=2):
        """Initialize the Portfolio Calculator service."""
        # Initialize Redis client
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
        
        # Cache for portfolio base values (previous day's closing value)
        self.account_base_values = {}
        
        # Minimum interval between updates for the same account (in seconds)
        self.min_update_interval = min_update_interval
        
        # Track when we last sent updates for each account
        self.last_update_time = {}
        
        logger.info("Portfolio Calculator initialized")
    
    def get_account_base_value(self, account_id):
        """Get the base value for calculating today's return."""
        if account_id in self.account_base_values:
            return self.account_base_values[account_id]
        
        try:
            # Get the TradeAccount object
            trade_account = self.broker_client.get_trade_account_by_id(account_id)
            
            # Use yesterday's portfolio value if available
            # Following priority: 
            # 1. last_equity (yesterday's closing equity)
            # 2. last_buying_power (as a fallback, if available)
            # 3. equity (current equity)
            # 4. portfolio_value (current portfolio value)
            # 5. cash (available cash)
            
            # Try last_equity first
            if hasattr(trade_account, 'last_equity') and trade_account.last_equity:
                try:
                    base_value = float(trade_account.last_equity)
                    if base_value > 0:
                        self.account_base_values[account_id] = base_value
                        logger.info(f"Base value for account {account_id}: ${base_value:.2f} (from last_equity)")
                        return base_value
                except (ValueError, TypeError):
                    logger.warning(f"Invalid last_equity value: {trade_account.last_equity}")
            
            # Try equity next
            if hasattr(trade_account, 'equity') and trade_account.equity:
                try:
                    base_value = float(trade_account.equity)
                    if base_value > 0:
                        self.account_base_values[account_id] = base_value
                        logger.info(f"Base value for account {account_id}: ${base_value:.2f} (from equity)")
                        return base_value
                except (ValueError, TypeError):
                    logger.warning(f"Invalid equity value: {trade_account.equity}")
            
            # Try portfolio_value next
            if hasattr(trade_account, 'portfolio_value') and trade_account.portfolio_value:
                try:
                    base_value = float(trade_account.portfolio_value)
                    if base_value > 0:
                        self.account_base_values[account_id] = base_value
                        logger.info(f"Base value for account {account_id}: ${base_value:.2f} (from portfolio_value)")
                        return base_value
                except (ValueError, TypeError):
                    logger.warning(f"Invalid portfolio_value: {trade_account.portfolio_value}")
            
            # Try cash last
            if hasattr(trade_account, 'cash') and trade_account.cash:
                try:
                    base_value = float(trade_account.cash)
                    self.account_base_values[account_id] = base_value
                    logger.info(f"Base value for account {account_id}: ${base_value:.2f} (from cash)")
                    return base_value
                except (ValueError, TypeError):
                    logger.warning(f"Invalid cash value: {trade_account.cash}")
            
            # If all else fails, return 0
            logger.warning(f"No valid base value found for account {account_id}, using 0")
            return 0.0
        
        except Exception as e:
            logger.error(f"Error fetching base value for account {account_id}: {e}")
            return 0.0
    
    def calculate_portfolio_value(self, account_id):
        """Calculate portfolio value using positions and cached prices."""
        try:
            # Get positions from Redis (cached by symbol_collector)
            positions_json = self.redis_client.get(f'account_positions:{account_id}')
            if not positions_json:
                # If positions not in Redis, fetch directly from Alpaca
                logger.info(f"Positions for account {account_id} not in Redis, fetching directly")
                positions = self.broker_client.get_all_positions_for_account(account_id)
                if not positions:
                    logger.warning(f"No positions found for account {account_id}")
                    return None
            else:
                positions = json.loads(positions_json)
                logger.debug(f"Loaded {len(positions)} positions from Redis for account {account_id}")
            
            # Get account information for cash balance
            try:
                account = self.broker_client.get_trade_account_by_id(account_id)
                cash_balance = float(account.cash)
                logger.debug(f"Cash balance for account {account_id}: ${cash_balance:.2f}")
            except Exception as e:
                logger.error(f"Error fetching cash balance for account {account_id}: {e}", exc_info=True)
                cash_balance = 0.0
            
            # Calculate total portfolio value
            portfolio_value = cash_balance
            
            # Track which symbols had cached prices vs. which used position's current_price
            cached_prices_count = 0
            position_prices_count = 0
            
            for position in positions:
                # Handle both serialized dicts and Position objects
                if isinstance(position, dict):
                    symbol = position['symbol']
                    quantity = float(position['qty'])
                else:
                    symbol = position.symbol
                    quantity = float(position.qty)
                
                # Get latest price from Redis
                latest_price_str = self.redis_client.get(f"price:{symbol}")
                position_value = 0.0
                
                if latest_price_str:
                    latest_price = float(latest_price_str)
                    position_value = quantity * latest_price
                    cached_prices_count += 1
                    logger.debug(f"Using cached price for {symbol}: ${latest_price:.2f}")
                else:
                    # If price not in cache, use last known price from the position
                    if isinstance(position, dict) and 'current_price' in position:
                        latest_price = float(position['current_price'])
                        position_value = quantity * latest_price
                        position_prices_count += 1
                        logger.debug(f"Using position price for {symbol}: ${latest_price:.2f}")
                    elif hasattr(position, 'current_price'):
                        latest_price = float(position.current_price)
                        position_value = quantity * latest_price
                        position_prices_count += 1
                        logger.debug(f"Using position price for {symbol}: ${latest_price:.2f}")
                    else:
                        logger.warning(f"No price available for {symbol} in account {account_id}")
                
                portfolio_value += position_value
            
            # Get base value for "Today's Return" calculation
            base_value = self.get_account_base_value(account_id)
            today_return = portfolio_value - base_value
            today_return_percent = (today_return / base_value * 100) if base_value > 0 else 0
            
            # Format for display
            today_return_formatted = f"+${today_return:.2f}" if today_return >= 0 else f"-${abs(today_return):.2f}"
            today_return_percent_formatted = f"({today_return_percent:.2f}%)"
            
            logger.info(f"Portfolio value for account {account_id}: ${portfolio_value:.2f}, " +
                      f"Today's return: {today_return_formatted} {today_return_percent_formatted} " +
                      f"[Cached prices: {cached_prices_count}, Position prices: {position_prices_count}]")
            
            # Return the calculated values
            return {
                "account_id": account_id,
                "total_value": f"${portfolio_value:.2f}",
                "today_return": f"{today_return_formatted} {today_return_percent_formatted}",
                "raw_value": portfolio_value,
                "raw_return": today_return,
                "raw_return_percent": today_return_percent,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error calculating portfolio value for account {account_id}: {e}", exc_info=True)
            return None
    
    async def get_accounts_for_symbol(self, symbol):
        """Get list of account IDs that hold a given symbol."""
        accounts = []
        try:
            # Get all tracked account IDs
            account_keys = self.redis_client.keys('account_positions:*')
            for key in account_keys:
                account_id = key.decode('utf-8').split(':')[1]
                positions_json = self.redis_client.get(key)
                if positions_json:
                    positions = json.loads(positions_json)
                    if isinstance(positions, list) and any(
                        (isinstance(pos, dict) and pos.get('symbol') == symbol) for pos in positions
                    ):
                        accounts.append(account_id)
        except Exception as e:
            logger.error(f"Error finding accounts for symbol {symbol}: {e}", exc_info=True)
        
        return accounts
    
    async def listen_for_price_updates(self):
        """Listen for price updates and recalculate portfolio values."""
        self.pubsub.subscribe('price_updates')
        
        logger.info("Started listening for price updates")
        
        for message in self.pubsub.listen():
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data'])
                    symbol = data.get('symbol')
                    
                    if not symbol:
                        continue
                    
                    # Find accounts that hold this symbol
                    accounts = await self.get_accounts_for_symbol(symbol)
                    if not accounts:
                        continue
                        
                    logger.debug(f"Symbol {symbol} is held by {len(accounts)} accounts")
                    
                    # Current time for rate limiting
                    current_time = datetime.now()
                    
                    # Calculate and publish portfolio values for each affected account
                    for account_id in accounts:
                        # Check if we should update this account now
                        if (account_id not in self.last_update_time or 
                            (current_time - self.last_update_time[account_id]).total_seconds() > self.min_update_interval):
                            
                            # Calculate portfolio value
                            portfolio_data = self.calculate_portfolio_value(account_id)
                            
                            if portfolio_data:
                                # Publish to Redis for websocket server to pick up
                                self.redis_client.publish('portfolio_updates', json.dumps(portfolio_data))
                                
                                # IMPORTANT: Also store the latest portfolio data directly in Redis
                                # This ensures the REST API endpoint has access to the same data
                                last_portfolio_key = f"last_portfolio:{account_id}"
                                self.redis_client.set(last_portfolio_key, json.dumps(portfolio_data))
                                
                                # Update last update time
                                self.last_update_time[account_id] = current_time
                    
                except Exception as e:
                    logger.error(f"Error processing price update: {e}", exc_info=True)
    
    async def periodic_recalculation(self, interval_seconds=30):
        """Periodically recalculate all portfolio values."""
        logger.info(f"Starting periodic recalculation every {interval_seconds} seconds")
        
        while True:
            try:
                # Get all accounts that have positions
                account_keys = self.redis_client.keys('account_positions:*')
                account_count = len(account_keys)
                
                if account_count > 0:
                    logger.info(f"Performing periodic recalculation for {account_count} accounts")
                
                recalculated = 0
                for key in account_keys:
                    account_id = key.decode('utf-8').split(':')[1]
                    
                    # Calculate portfolio value
                    portfolio_data = self.calculate_portfolio_value(account_id)
                    
                    if portfolio_data:
                        # Publish to Redis pubsub channel for websocket server
                        self.redis_client.publish('portfolio_updates', json.dumps(portfolio_data))
                        
                        # IMPORTANT: Also store the latest portfolio data directly in Redis 
                        # This ensures the REST API endpoint has access to the same data
                        last_portfolio_key = f"last_portfolio:{account_id}"
                        self.redis_client.set(last_portfolio_key, json.dumps(portfolio_data))
                        
                        recalculated += 1
                
                if account_count > 0:
                    logger.info(f"Periodic recalculation completed for {recalculated}/{account_count} accounts")
            except Exception as e:
                logger.error(f"Error in periodic recalculation: {e}", exc_info=True)
            
            # Wait before next recalculation cycle
            await asyncio.sleep(interval_seconds)
    
    async def run(self, recalculation_interval=30):
        """Run the Portfolio Calculator service."""
        logger.info("Portfolio Calculator service starting")
        
        # Start price update listener and periodic recalculation in parallel
        try:
            await asyncio.gather(
                self.listen_for_price_updates(),
                self.periodic_recalculation(interval_seconds=recalculation_interval)
            )
        except asyncio.CancelledError:
            logger.info("Portfolio Calculator tasks cancelled")
        except Exception as e:
            logger.error(f"Error in Portfolio Calculator: {e}", exc_info=True)

async def main():
    """Main entry point for the Portfolio Calculator service."""
    # Parse command line arguments or use environment variables
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_db = int(os.getenv("REDIS_DB", "0"))
    min_update_interval = int(os.getenv("MIN_UPDATE_INTERVAL", "2"))
    recalculation_interval = int(os.getenv("RECALCULATION_INTERVAL", "30"))
    sandbox_mode = os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
    
    # Create and run the calculator
    calculator = PortfolioCalculator(
        redis_host=redis_host,
        redis_port=redis_port,
        redis_db=redis_db,
        min_update_interval=min_update_interval,
        sandbox=sandbox_mode
    )
    
    try:
        await calculator.run(recalculation_interval=recalculation_interval)
    except KeyboardInterrupt:
        logger.info("Portfolio Calculator service stopped by user")
    except Exception as e:
        logger.error(f"Portfolio Calculator service stopped due to error: {e}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(main()) 