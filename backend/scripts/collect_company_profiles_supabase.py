#!/usr/bin/env python3
"""
Company Profiles Data Collection Script (Using Supabase Client)

This script fetches company profile data from Financial Modeling Prep API
for all symbols in the tradable_assets.json file and stores them in Supabase.

Features:
- Uses Supabase Python client for reliable database connectivity
- Respects FMP rate limit (270 requests per minute = 4.5 per second)
- Batches API calls for efficiency
- Progress tracking and error handling
- Resume capability for interrupted runs
- Proper date field validation to prevent database errors

Usage:
    python collect_company_profiles_supabase.py [--batch-size 50] [--start-from-symbol AAPL]
"""

import os
import sys
import json
import asyncio
import argparse
import logging
from datetime import datetime
from typing import List, Dict, Optional
import aiohttp

# Add the backend directory to the Python path so we can import utils
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

from utils.supabase.db_client import get_supabase_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CompanyProfileCollector:
    def __init__(self):
        self.fmp_api_key = os.getenv('FINANCIAL_MODELING_PREP_API_KEY')
        
        if not self.fmp_api_key:
            raise ValueError("FINANCIAL_MODELING_PREP_API_KEY environment variable is required")
        
        # Rate limiting: 270 requests per minute = 4.5 per second
        # We'll use 4.0 per second to be safe: 0.25 seconds between requests
        self.rate_limit_delay = 0.25  # 250ms between requests = 240 per minute (safe buffer)
        
        # Tracking variables
        self.processed_symbols = 0
        self.successful_inserts = 0
        self.errors = 0
        self.total_symbols = 0

    async def load_tradable_assets(self) -> List[Dict[str, str]]:
        """Load tradable assets from JSON file."""
        assets_file = os.path.join(backend_dir, 'data', 'tradable_assets.json')
        
        try:
            with open(assets_file, 'r') as f:
                assets = json.load(f)
            
            logger.info(f"Loaded {len(assets)} tradable assets")
            return assets
            
        except FileNotFoundError:
            logger.error(f"Tradable assets file not found: {assets_file}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in tradable assets file: {e}")
            raise
    
    async def fetch_company_profile(self, session: aiohttp.ClientSession, symbol: str) -> Optional[Dict]:
        """Fetch company profile data from FMP API."""
        url = f"https://financialmodelingprep.com/api/v3/profile/{symbol}?apikey={self.fmp_api_key}"
        
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    if isinstance(data, list) and len(data) > 0:
                        return data[0]  # FMP returns array, we want first item
                    elif isinstance(data, dict):
                        return data
                    else:
                        logger.warning(f"No profile data found for {symbol}")
                        return None
                else:
                    logger.error(f"API error for {symbol}: {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching profile for {symbol}: {e}")
            return None

    def validate_date_field(self, date_value) -> Optional[str]:
        """Validate and clean date fields to prevent database errors."""
        if not date_value or date_value == "" or date_value is None:
            return None
        
        # If it's already a valid date string, return it
        if isinstance(date_value, str) and len(date_value) >= 10:
            try:
                # Try to parse the date to validate format
                datetime.strptime(date_value[:10], '%Y-%m-%d')
                return date_value[:10]  # Return just the date part (YYYY-MM-DD)
            except ValueError:
                logger.debug(f"Invalid date format: {date_value}")
                return None
        
        return None

    def clean_numeric_field(self, value) -> Optional[float]:
        """Clean numeric fields, converting empty strings to None."""
        if value is None or value == "" or value == "":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def clean_text_field(self, value) -> Optional[str]:
        """Clean text fields, converting empty strings to None for optional fields."""
        if value is None or value == "":
            return None
        return str(value).strip()

    def transform_profile_data(self, profile: Dict, symbol: str) -> Dict:
        """Transform FMP profile data to match our database schema with proper validation."""
        return {
            'symbol': symbol.upper(),
            'company_name': profile.get('companyName', ''),  # Required field, keep empty string
            'price': self.clean_numeric_field(profile.get('price')),
            'beta': self.clean_numeric_field(profile.get('beta')),
            'vol_avg': self.clean_numeric_field(profile.get('volAvg')),
            'market_cap': self.clean_numeric_field(profile.get('mktCap')),
            'last_div': self.clean_numeric_field(profile.get('lastDiv')),
            'range': self.clean_text_field(profile.get('range')),
            'changes': self.clean_numeric_field(profile.get('changes')),
            'currency': profile.get('currency') or 'USD',  # Default to USD
            'cik': self.clean_text_field(profile.get('cik')),
            'isin': self.clean_text_field(profile.get('isin')),
            'cusip': self.clean_text_field(profile.get('cusip')),
            'exchange': self.clean_text_field(profile.get('exchange')),
            'exchange_short_name': self.clean_text_field(profile.get('exchangeShortName')),
            'industry': self.clean_text_field(profile.get('industry')),
            'website': self.clean_text_field(profile.get('website')),
            'description': self.clean_text_field(profile.get('description')),
            'ceo': self.clean_text_field(profile.get('ceo')),
            'sector': self.clean_text_field(profile.get('sector')),
            'country': self.clean_text_field(profile.get('country')),
            'full_time_employees': self.clean_text_field(profile.get('fullTimeEmployees')),
            'phone': self.clean_text_field(profile.get('phone')),
            'address': self.clean_text_field(profile.get('address')),
            'city': self.clean_text_field(profile.get('city')),
            'state': self.clean_text_field(profile.get('state')),
            'zip': self.clean_text_field(profile.get('zip')),
            'dcf_diff': self.clean_numeric_field(profile.get('dcfDiff')),
            'dcf': self.clean_numeric_field(profile.get('dcf')),
            'image': self.clean_text_field(profile.get('image')),
            'ipo_date': self.validate_date_field(profile.get('ipoDate')),  # Properly validate dates
            'default_image': bool(profile.get('defaultImage', False)),
            'is_etf': bool(profile.get('isEtf', False)),
            'is_actively_trading': bool(profile.get('isActivelyTrading', True)),
            'is_adr': bool(profile.get('isAdr', False)),
            'is_fund': bool(profile.get('isFund', False))
        }
    
    def store_profile_data(self, profile_data: List[Dict]) -> int:
        """Store profile data in the database using Supabase client."""
        if not profile_data:
            return 0
        
        successful_inserts = 0
        supabase = get_supabase_client()
        
        for profile in profile_data:
            try:
                # Use upsert for INSERT ... ON CONFLICT functionality
                response = supabase.table('company_profiles').upsert(
                    profile,
                    on_conflict='symbol'
                ).execute()
                
                if response.data:
                    successful_inserts += 1
                    logger.debug(f"Stored profile for {profile['symbol']}")
                else:
                    logger.warning(f"No data returned for {profile['symbol']}")
                    
            except Exception as e:
                logger.error(f"Error storing profile for {profile['symbol']}: {e}")
                self.errors += 1
        
        return successful_inserts
    
    async def process_batch(self, session: aiohttp.ClientSession, symbols: List[str]):
        """Process a batch of symbols."""
        logger.info(f"Processing batch of {len(symbols)} symbols")
        
        # Fetch profiles for all symbols in the batch
        profiles_data = []
        
        for symbol in symbols:
            profile = await self.fetch_company_profile(session, symbol)
            
            if profile:
                transformed_profile = self.transform_profile_data(profile, symbol)
                profiles_data.append(transformed_profile)
            
            # Rate limiting delay - 250ms between requests = 240 per minute
            await asyncio.sleep(self.rate_limit_delay)
            
            self.processed_symbols += 1
            
            # Progress update every 100 symbols
            if self.processed_symbols % 100 == 0:
                progress = (self.processed_symbols / self.total_symbols) * 100
                elapsed_time = self.processed_symbols * self.rate_limit_delay / 60  # minutes
                estimated_total_time = (self.total_symbols * self.rate_limit_delay) / 60  # minutes
                remaining_time = estimated_total_time - elapsed_time
                
                logger.info(f"Progress: {self.processed_symbols}/{self.total_symbols} ({progress:.1f}%) | "
                           f"Elapsed: {elapsed_time:.1f}m | Remaining: {remaining_time:.1f}m")
        
        # Store the batch in database
        if profiles_data:
            inserted = self.store_profile_data(profiles_data)
            self.successful_inserts += inserted
            logger.info(f"Batch complete: {inserted}/{len(symbols)} profiles stored successfully")
    
    async def collect_all_profiles(self, batch_size: int = 50, start_from_symbol: Optional[str] = None):
        """Main method to collect all company profiles."""
        logger.info("Starting company profiles collection")
        logger.info(f"Rate limit: {1/self.rate_limit_delay:.1f} requests per second ({60/self.rate_limit_delay:.0f} per minute)")
        
        # Load tradable assets
        assets = await self.load_tradable_assets()
        symbols = [asset['symbol'] for asset in assets]
        
        # Find starting point if specified
        start_index = 0
        if start_from_symbol:
            try:
                start_index = symbols.index(start_from_symbol.upper())
                logger.info(f"Starting from symbol {start_from_symbol} (index {start_index})")
            except ValueError:
                logger.warning(f"Symbol {start_from_symbol} not found, starting from beginning")
        
        symbols = symbols[start_index:]
        self.total_symbols = len(symbols)
        estimated_time = (self.total_symbols * self.rate_limit_delay) / 60  # minutes
        logger.info(f"Will process {self.total_symbols} symbols (estimated time: {estimated_time:.1f} minutes)")
        
        try:
            # Test Supabase connection
            supabase = get_supabase_client()
            test_response = supabase.table('company_profiles').select('count').limit(1).execute()
            logger.info("Successfully connected to Supabase")
            
            # Create HTTP session with reasonable timeout
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                # Process symbols in batches
                for i in range(0, len(symbols), batch_size):
                    batch = symbols[i:i + batch_size]
                    await self.process_batch(session, batch)
                    
                    # Brief pause between batches (rate limiting is handled per request)
                    if i + batch_size < len(symbols):
                        await asyncio.sleep(0.5)
        
        except Exception as e:
            logger.error(f"Error during collection: {e}")
            raise
            
        # Final summary
        logger.info("=" * 60)
        logger.info("COLLECTION COMPLETE!")
        logger.info(f"Total processed: {self.processed_symbols}")
        logger.info(f"Successful inserts: {self.successful_inserts}")
        logger.info(f"Errors: {self.errors}")
        
        if self.processed_symbols > 0:
            success_rate = (self.successful_inserts / self.processed_symbols) * 100
            logger.info(f"Success rate: {success_rate:.1f}%")
        
        if self.errors > 0:
            error_rate = (self.errors / self.processed_symbols) * 100
            logger.warning(f"Error rate: {error_rate:.1f}%")

async def main():
    parser = argparse.ArgumentParser(description='Collect company profiles from FMP API using Supabase client')
    parser.add_argument('--batch-size', type=int, default=50, 
                       help='Number of symbols to process in each batch (default: 50)')
    parser.add_argument('--start-from-symbol', type=str, 
                       help='Symbol to start from (useful for resuming interrupted runs)')
    
    args = parser.parse_args()
    
    collector = CompanyProfileCollector()
    
    try:
        await collector.collect_all_profiles(
            batch_size=args.batch_size,
            start_from_symbol=args.start_from_symbol
        )
    except KeyboardInterrupt:
        logger.info("Collection interrupted by user")
    except Exception as e:
        logger.error(f"Collection failed: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main()) 