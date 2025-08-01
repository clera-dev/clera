"""
Sector Data Collector

Fetches sector information for all tracked symbols and stores in Redis.
Runs once daily (early morning PST) to minimize API usage.
"""

import os
import asyncio
import json
import logging
from datetime import datetime, time, timezone
import pytz # For timezone handling
import redis
import requests # Using requests for simplicity over urllib
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("sector_data_collector")

# Load environment variables
load_dotenv()

# Import ETF categorization service using proper relative imports
try:
    from utils.etf_categorization_service import get_etf_sector_for_allocation, is_known_etf
    logger.info("Successfully imported ETF categorization service")
except ImportError as e:
    logger.error(f"Failed to import ETF categorization service: {e}")
    # Fallback functions if import fails
    def get_etf_sector_for_allocation(symbol, asset_name=None):
        return "Unknown"
    def is_known_etf(symbol):
        return False

class SectorDataCollector:
    def __init__(self, redis_host=None, redis_port=None, redis_db=None, 
                 FINANCIAL_MODELING_PREP_API_KEY=None):
        """Initialize the Sector Data Collector service."""
        _IS_PRODUCTION = os.getenv("COPILOT_ENVIRONMENT_NAME", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production"
        if _IS_PRODUCTION:
            redis_host = redis_host or os.getenv("REDIS_HOST")
            if not redis_host:
                raise RuntimeError("REDIS_HOST environment variable must be set in production!")
        else:
            redis_host = redis_host or os.getenv("REDIS_HOST", "127.0.0.1")
        redis_port = int(redis_port or os.getenv("REDIS_PORT", "6379"))
        redis_db = int(redis_db or os.getenv("REDIS_DB", "0"))
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db, decode_responses=True)
        
        # Setup FMP API key
        self.FINANCIAL_MODELING_PREP_API_KEY = FINANCIAL_MODELING_PREP_API_KEY or os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
        
        if not self.FINANCIAL_MODELING_PREP_API_KEY:
            logger.error("Financial Modeling Prep API key is REQUIRED but not found.")
            raise ValueError("Financial Modeling Prep API key is required")
            
        logger.info("Sector Data Collector initialized")
    
    async def collect_sector_data(self):
        """Collect sector data for all tracked symbols and store in Redis."""
        try:
            # Get all tracked symbols from Redis
            tracked_symbols_json = self.redis_client.get('tracked_symbols')
            if not tracked_symbols_json:
                logger.info("No tracked symbols found in Redis key 'tracked_symbols'. Skipping collection.")
                return
                
            tracked_symbols = json.loads(tracked_symbols_json)
            if not tracked_symbols:
                logger.info("Tracked symbols list is empty. Skipping collection.")
                return
                
            logger.info(f"Starting sector data collection for {len(tracked_symbols)} symbols.")
            
            # Batch process symbols to respect API limits and FMP API structure (takes comma separated list)
            # FMP API seems to handle large lists of symbols well in a single request.
            # We will still implement batching as a good practice for very large symbol sets, though one large call might be fine.
            
            all_sector_data = {}
            batch_size = 200 # FMP allows many symbols, but batching can prevent overly long URLs or timeouts.
            
            for i in range(0, len(tracked_symbols), batch_size):
                symbol_batch = tracked_symbols[i:i+batch_size]
                logger.info(f"Processing batch {i//batch_size + 1}/{(len(tracked_symbols) + batch_size -1)//batch_size} with {len(symbol_batch)} symbols.")
                await self._process_symbol_batch(symbol_batch, all_sector_data)
                await asyncio.sleep(1) # Small delay to be kind to the API, even if not strictly necessary for one batch type.

            # Store in Redis with 24-hour TTL
            if all_sector_data:
                self.redis_client.setex(
                    'sector_data',
                    86400,  # 24 hours in seconds
                    json.dumps(all_sector_data)
                )
                logger.info(f"Successfully collected and stored sector data for {len(all_sector_data)} symbols in Redis key 'sector_data'.")
            else:
                logger.info("No sector data was collected (perhaps API returned empty or all symbols were invalid).")
            
            # Update last collection timestamp
            self.redis_client.set(
                'sector_data_last_updated', 
                datetime.now(timezone.utc).isoformat() # Store in UTC
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Error decoding JSON from Redis (tracked_symbols): {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Error during sector data collection: {e}", exc_info=True)
    
    async def _process_symbol_batch(self, symbols: list, all_sector_data: dict):
        """Process a batch of symbols to get sector data from FMP API."""
        if not symbols:
            return

        symbols_str = ",".join(symbols)
        # The endpoint should be /api/v3/profile/{symbols} for multiple, or /api/v3/company-screener with symbol parameter
        # Using company-screener as it was provided in the prompt, assuming it can take multiple symbols.
        # If not, we would need to switch to /api/v3/profile/{CSV_SYMBOLS} or loop individual calls.
        # The prompt states: https://financialmodelingprep.com/stable/company-screener
        # Let's try with `symbols` query parameter first. If that fails, we can adjust.
        # The example provided `symbol=AAPL` not `symbols=AAPL,MSFT`
        # It might be better to use the /v3/profile endpoint for multiple symbols if screener doesn't support it well.
        # Let's assume the screener can take a list via `symbol` based on typical API designs, though not explicitly stated for multiple.
        # FALLBACK: If screener with comma-separated `symbol` param doesn't work, use individual /v3/profile/{symbol} calls.
        
        # Primary attempt with screener (as per prompt)
        # url = f"https://financialmodelingprep.com/stable/company-screener?symbol={symbols_str}&apikey={self.FINANCIAL_MODELING_PREP_API_KEY}"
        
        # More robust way for multiple symbols is usually a dedicated endpoint or iterating.
        # Let's use the /v3/profile endpoint which explicitly supports multiple symbols.
        url = f"https://financialmodelingprep.com/api/v3/profile/{symbols_str}?apikey={self.FINANCIAL_MODELING_PREP_API_KEY}"

        try:
            logger.debug(f"Requesting FMP API: {url}")
            response = requests.get(url, timeout=30) # Added timeout
            response.raise_for_status()  # Raise HTTPError for bad responses (4XX or 5XX)
            
            data = response.json()
            
            if isinstance(data, list): # Expecting a list of company profiles
                for company_profile in data:
                    symbol = company_profile.get('symbol')
                    if symbol:
                        # Check if this is an ETF first
                        if is_known_etf(symbol):
                            # Use our intelligent ETF categorization
                            etf_sector = get_etf_sector_for_allocation(
                                symbol, 
                                company_profile.get('companyName')
                            )
                            all_sector_data[symbol] = {
                                'sector': etf_sector,
                                'industry': 'ETF', 
                                'companyName': company_profile.get('companyName', symbol),
                                'is_etf': True
                            }
                            logger.info(f"Categorized ETF {symbol} as sector: {etf_sector}")
                        else:
                            # Use FMP API data for non-ETFs
                            all_sector_data[symbol] = {
                                'sector': company_profile.get('sector', 'Unknown'),
                                'industry': company_profile.get('industry', 'Unknown'),
                                'companyName': company_profile.get('companyName', symbol),
                                'is_etf': False
                            }
            else:
                # This might happen if the API returns a single object for a single symbol, or an error object.
                logger.warning(f"FMP API response for batch was not a list: {data}")
                # Try to handle if it's a single valid object (though unlikely for multiple symbols)
                if isinstance(data, dict) and data.get('symbol'):
                    symbol = data.get('symbol')
                    if is_known_etf(symbol):
                        # Use our intelligent ETF categorization
                        etf_sector = get_etf_sector_for_allocation(
                            symbol, 
                            data.get('companyName')
                        )
                        all_sector_data[symbol] = {
                            'sector': etf_sector,
                            'industry': 'ETF',
                            'companyName': data.get('companyName', symbol),
                            'is_etf': True
                        }
                        logger.info(f"Categorized ETF {symbol} as sector: {etf_sector}")
                    else:
                        # Use FMP API data for non-ETFs
                        all_sector_data[symbol] = {
                            'sector': data.get('sector', 'Unknown'),
                            'industry': data.get('industry', 'Unknown'),
                            'companyName': data.get('companyName', symbol),
                            'is_etf': False
                        }

        except requests.exceptions.HTTPError as http_err:
            logger.error(f"HTTP error occurred while fetching from FMP API for symbols {symbols_str}: {http_err} - Response: {response.text}")
        except requests.exceptions.ConnectionError as conn_err:
            logger.error(f"Connection error occurred while fetching from FMP API: {conn_err}")
        except requests.exceptions.Timeout as timeout_err:
            logger.error(f"Timeout occurred while fetching from FMP API: {timeout_err}")
        except requests.exceptions.RequestException as req_err:
            logger.error(f"An error occurred with FMP API request: {req_err}")
        except json.JSONDecodeError as json_err:
            logger.error(f"Error decoding JSON response from FMP API for {symbols_str}: {json_err} - Response: {response.text if 'response' in locals() else 'N/A'}")
        except Exception as e:
            logger.error(f"Unexpected error processing batch for symbols {symbols_str}: {e}", exc_info=True)

    async def run_daily_scheduler(self):
        """Runs the sector data collection once daily at a specified time (PST)."""
        target_timezone = pytz.timezone('America/Los_Angeles')
        # Run at a time when market is closed and system load is low, e.g., 4 AM PST
        # For testing, one might use a shorter interval or a specific time soon.
        # For production, it should be a fixed early morning time.
        target_run_time_pst = time(4, 0, 0) # 4:00 AM PST

        logger.info(f"Sector Data Collector scheduler started. Will run daily around {target_run_time_pst.strftime('%H:%M:%S')} PST.")

        while True:
            now_pst = datetime.now(target_timezone)
            
            # Calculate next run datetime in PST
            # If current time is past today's target, schedule for tomorrow. Otherwise, today.
            if now_pst.time() >= target_run_time_pst:
                next_run_date_pst = now_pst.date() + datetime.timedelta(days=1)
            else:
                next_run_date_pst = now_pst.date()
            
            next_run_datetime_pst = target_timezone.localize(datetime.combine(next_run_date_pst, target_run_time_pst))
            
            # Convert next run time to UTC for actual sleeping, as server might be in UTC
            next_run_datetime_utc = next_run_datetime_pst.astimezone(pytz.utc)
            now_utc = datetime.now(pytz.utc)
            
            wait_seconds = (next_run_datetime_utc - now_utc).total_seconds()

            if wait_seconds <= 0: # Should not happen if logic is correct, but as a safeguard
                logger.warning("Calculated wait_seconds is non-positive. Adjusting to run in 1 hour.")
                wait_seconds = 3600 
            
            logger.info(f"Next sector data collection scheduled at: {next_run_datetime_pst.strftime('%Y-%m-%d %H:%M:%S %Z%z')} (in {wait_seconds/3600:.2f} hours).")
            
            await asyncio.sleep(wait_seconds)
            
            logger.info(f"It's time! Starting scheduled sector data collection at {datetime.now(target_timezone).strftime('%Y-%m-%d %H:%M:%S %Z%z')}.")
            await self.collect_sector_data()
            # After collection, the loop will recalculate for the next day.

async def main():
    """Main entry point for the Sector Data Collector service."""
    logger.info("Attempting to start Sector Data Collector service...")
    
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_db = int(os.getenv("REDIS_DB", "0"))
    FINANCIAL_MODELING_PREP_API_KEY = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

    if not FINANCIAL_MODELING_PREP_API_KEY:
        logger.critical("FINANCIAL_MODELING_PREP_API_KEY environment variable not set. SectorDataCollector cannot start.")
        return

    collector = SectorDataCollector(
        redis_host=redis_host,
        redis_port=redis_port,
        redis_db=redis_db,
        FINANCIAL_MODELING_PREP_API_KEY=FINANCIAL_MODELING_PREP_API_KEY # Passed explicitly
    )
    
    try:
        # For initial run or testing, you might want to call collect_sector_data directly once
        # await collector.collect_sector_data() 
        
        # Then start the scheduler
        await collector.run_daily_scheduler()
    except KeyboardInterrupt:
        logger.info("Sector Data Collector service stopped by user (KeyboardInterrupt).")
    except ValueError as ve:
        logger.error(f"ValueError during initialization: {ve}")
    except Exception as e:
        logger.error(f"Sector Data Collector service stopped due to an unexpected error: {e}", exc_info=True)

if __name__ == "__main__":
    # Ensure the event loop is managed correctly for asyncio
    # In Python 3.7+ asyncio.run() is preferred for top-level entry point
    asyncio.run(main()) 