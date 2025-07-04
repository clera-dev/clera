"""
Script to inspect Redis data and check if sector data is properly stored
"""

import redis
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Redis client
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
redis_db = int(os.getenv("REDIS_DB", "0"))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db)

# Check if sector data exists
sector_data_exists = redis_client.exists('sector_data')
print(f"Sector data exists in Redis: {sector_data_exists}")

# Get sector data count
if sector_data_exists:
    sector_data = json.loads(redis_client.get('sector_data'))
    print(f"Number of symbols with sector data: {len(sector_data)}")
    
    # Show sample sector data for a few symbols
    sample_symbols = list(sector_data.keys())[:5]
    print("\nSample sector data:")
    for symbol in sample_symbols:
        print(f"{symbol}: {sector_data[symbol]}")

# Get all account position keys
account_keys = redis_client.keys('account_positions:*')
print(f"\nNumber of accounts with positions: {len(account_keys)}")

# Check positions for sector data
print("\nChecking positions for sector data:")
for key in account_keys:
    account_id = key.decode('utf-8').split(':')[1]
    positions_json = redis_client.get(key)
    if positions_json:
        positions = json.loads(positions_json)
        positions_with_sector = [p for p in positions if 'sector' in p and p['sector']]
        print(f"Account {account_id}: {len(positions_with_sector)}/{len(positions)} positions have sector data")
        
        # Show sample positions with their sector data
        if positions:
            sample_pos = positions[0]
            print(f"  Sample position: {sample_pos['symbol']}")
            print(f"  Has sector: {'sector' in sample_pos}")
            if 'sector' in sample_pos:
                print(f"  Sector value: {sample_pos['sector']}")
                print(f"  Sector type: {type(sample_pos['sector'])}")
            print(f"  Full position data: {sample_pos}") 