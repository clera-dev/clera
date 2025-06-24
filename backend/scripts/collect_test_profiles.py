#!/usr/bin/env python3
"""
Test Company Profiles Collection Script

This script fetches company profile data for a small set of test tickers
to verify the system is working before running the full collection.
"""

import os
import sys
import json
import asyncio
import logging
from typing import List, Dict, Optional

import aiohttp
import asyncpg
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Test tickers from our static data
TEST_TICKERS = ["NVDA", "ISRG", "VEEV", "TDOC", "ILMN", "ENPH", "SEDG", "FSLR", "TSLA", "NEE", "AMD", "AMAT", "LRCX", "MRVL", "MSFT", "AMZN", "GOOGL", "CRM", "CRWD"]

class TestProfileCollector:
    def __init__(self):
        self.fmp_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
        self.supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not self.fmp_api_key:
            raise ValueError("FINANCIAL_MODELING_PREP_API_KEY not found in environment")
        if not self.supabase_url:
            raise ValueError("NEXT_PUBLIC_SUPABASE_URL not found in environment")
        if not self.supabase_service_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY not found in environment")
        
        logger.info(f"Initialized with FMP API key: {self.fmp_api_key[:10]}...")
    
    async def get_db_connection(self):
        """Create a connection to Supabase PostgreSQL database."""
        try:
            # Extract project ref from Supabase URL
            if 'supabase.co' in self.supabase_url:
                project_ref = self.supabase_url.split('//')[1].split('.')[0]
                host = f"db.{project_ref}.supabase.co"
                port = 5432
                database = "postgres"
                user = "postgres"
                password = self.supabase_service_key
                
                logger.info(f"Connecting to Supabase at {host}")
                connection = await asyncpg.connect(
                    host=host,
                    port=port,
                    database=database,
                    user=user,
                    password=password
                )
                return connection
            else:
                raise ValueError("Invalid Supabase URL format")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    async def fetch_company_profile(self, session: aiohttp.ClientSession, symbol: str) -> Optional[Dict]:
        """Fetch company profile data from FMP API."""
        url = f"https://financialmodelingprep.com/api/v3/profile/{symbol}?apikey={self.fmp_api_key}"
        
        try:
            logger.info(f"Fetching profile for {symbol}")
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    if isinstance(data, list) and len(data) > 0:
                        logger.info(f"Successfully fetched profile for {symbol}")
                        return data[0]
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
    
    def transform_profile_data(self, profile: Dict, symbol: str) -> Dict:
        """Transform FMP profile data to match our database schema."""
        return {
            'symbol': symbol.upper(),
            'company_name': profile.get('companyName', ''),
            'price': profile.get('price'),
            'beta': profile.get('beta'),
            'vol_avg': profile.get('volAvg'),
            'market_cap': profile.get('mktCap'),
            'last_div': profile.get('lastDiv'),
            'range': profile.get('range'),
            'changes': profile.get('changes'),
            'currency': profile.get('currency', 'USD'),
            'cik': profile.get('cik'),
            'isin': profile.get('isin'),
            'cusip': profile.get('cusip'),
            'exchange': profile.get('exchange'),
            'exchange_short_name': profile.get('exchangeShortName'),
            'industry': profile.get('industry'),
            'website': profile.get('website'),
            'description': profile.get('description'),
            'ceo': profile.get('ceo'),
            'sector': profile.get('sector'),
            'country': profile.get('country'),
            'full_time_employees': profile.get('fullTimeEmployees'),
            'phone': profile.get('phone'),
            'address': profile.get('address'),
            'city': profile.get('city'),
            'state': profile.get('state'),
            'zip': profile.get('zip'),
            'dcf_diff': profile.get('dcfDiff'),
            'dcf': profile.get('dcf'),
            'image': profile.get('image'),
            'ipo_date': profile.get('ipoDate'),
            'default_image': profile.get('defaultImage', False),
            'is_etf': profile.get('isEtf', False),
            'is_actively_trading': profile.get('isActivelyTrading', True),
            'is_adr': profile.get('isAdr', False),
            'is_fund': profile.get('isFund', False)
        }
    
    async def store_profile_data(self, connection, profile_data: List[Dict]) -> int:
        """Store profile data in the database."""
        if not profile_data:
            return 0
        
        insert_query = """
        INSERT INTO public.company_profiles (
            symbol, company_name, price, beta, vol_avg, market_cap, last_div, range,
            changes, currency, cik, isin, cusip, exchange, exchange_short_name,
            industry, website, description, ceo, sector, country, full_time_employees,
            phone, address, city, state, zip, dcf_diff, dcf, image, ipo_date,
            default_image, is_etf, is_actively_trading, is_adr, is_fund
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
            $30, $31, $32, $33, $34, $35, $36
        )
        ON CONFLICT (symbol) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            price = EXCLUDED.price,
            beta = EXCLUDED.beta,
            vol_avg = EXCLUDED.vol_avg,
            market_cap = EXCLUDED.market_cap,
            last_div = EXCLUDED.last_div,
            range = EXCLUDED.range,
            changes = EXCLUDED.changes,
            currency = EXCLUDED.currency,
            cik = EXCLUDED.cik,
            isin = EXCLUDED.isin,
            cusip = EXCLUDED.cusip,
            exchange = EXCLUDED.exchange,
            exchange_short_name = EXCLUDED.exchange_short_name,
            industry = EXCLUDED.industry,
            website = EXCLUDED.website,
            description = EXCLUDED.description,
            ceo = EXCLUDED.ceo,
            sector = EXCLUDED.sector,
            country = EXCLUDED.country,
            full_time_employees = EXCLUDED.full_time_employees,
            phone = EXCLUDED.phone,
            address = EXCLUDED.address,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            zip = EXCLUDED.zip,
            dcf_diff = EXCLUDED.dcf_diff,
            dcf = EXCLUDED.dcf,
            image = EXCLUDED.image,
            ipo_date = EXCLUDED.ipo_date,
            default_image = EXCLUDED.default_image,
            is_etf = EXCLUDED.is_etf,
            is_actively_trading = EXCLUDED.is_actively_trading,
            is_adr = EXCLUDED.is_adr,
            is_fund = EXCLUDED.is_fund,
            updated_at = now()
        """
        
        successful_inserts = 0
        
        for profile in profile_data:
            try:
                await connection.execute(
                    insert_query,
                    profile['symbol'], profile['company_name'], profile['price'],
                    profile['beta'], profile['vol_avg'], profile['market_cap'],
                    profile['last_div'], profile['range'], profile['changes'],
                    profile['currency'], profile['cik'], profile['isin'],
                    profile['cusip'], profile['exchange'], profile['exchange_short_name'],
                    profile['industry'], profile['website'], profile['description'],
                    profile['ceo'], profile['sector'], profile['country'],
                    profile['full_time_employees'], profile['phone'], profile['address'],
                    profile['city'], profile['state'], profile['zip'],
                    profile['dcf_diff'], profile['dcf'], profile['image'],
                    profile['ipo_date'], profile['default_image'], profile['is_etf'],
                    profile['is_actively_trading'], profile['is_adr'], profile['is_fund']
                )
                successful_inserts += 1
                logger.info(f"Stored profile for {profile['symbol']}")
            except Exception as e:
                logger.error(f"Error storing profile for {profile['symbol']}: {e}")
        
        return successful_inserts
    
    async def collect_test_profiles(self):
        """Main method to collect test company profiles."""
        logger.info(f"Starting test collection for {len(TEST_TICKERS)} symbols")
        
        # Connect to database
        connection = await self.get_db_connection()
        logger.info("Connected to Supabase database")
        
        try:
            async with aiohttp.ClientSession() as session:
                profiles_data = []
                
                for symbol in TEST_TICKERS:
                    profile = await self.fetch_company_profile(session, symbol)
                    
                    if profile:
                        transformed_profile = self.transform_profile_data(profile, symbol)
                        profiles_data.append(transformed_profile)
                    
                    # Small delay to be respectful to API
                    await asyncio.sleep(0.3)
                
                # Store all profiles
                if profiles_data:
                    inserted = await self.store_profile_data(connection, profiles_data)
                    logger.info(f"Successfully stored {inserted}/{len(TEST_TICKERS)} profiles")
                else:
                    logger.warning("No profiles were collected")
        
        finally:
            await connection.close()
            logger.info("Database connection closed")

async def main():
    try:
        collector = TestProfileCollector()
        await collector.collect_test_profiles()
        logger.info("Test collection completed successfully!")
    except Exception as e:
        logger.error(f"Test collection failed: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main()) 