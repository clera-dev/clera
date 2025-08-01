# market_data.py
# Shared utility functions for market data operations

import os
from urllib.request import urlopen
import certifi
import json
from typing import Union, Any
from dotenv import load_dotenv
import httpx

# Load environment variables
load_dotenv(override=True)
fin_modeling_prep_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

def get_jsonparsed_data(url):
    """Get the JSON data from a URL."""
    response = urlopen(url, cafile=certifi.where())
    data = response.read().decode("utf-8")
    return json.loads(data)

async def get_jsonparsed_data_async(url: str) -> Union[dict, list]:
    """
    Asynchronously get the JSON data from a URL.
    
    Note: Financial Modeling Prep API endpoints can return either dict or list
    depending on the endpoint. This function preserves the actual return type
    to prevent type checking errors and downstream bugs.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()  # Raise an exception for bad status codes
        return response.json()

def get_stock_quote(symbol: str) -> Union[dict, list]:
    """
    Get the stock quote for a given symbol using the Financial Modeling Prep API.
    
    Note: FMP API returns a list containing quote data, not a dict.
    """
    url = (f"https://financialmodelingprep.com/api/v3/quote-short/{symbol}?apikey={fin_modeling_prep_api_key}")
    return get_jsonparsed_data(url)

async def get_stock_quote_async(symbol: str) -> Union[dict, list]:
    """
    Asynchronously get the stock quote for a given symbol.
    
    Note: FMP API returns a list containing quote data, not a dict.
    """
    url = (f"https://financialmodelingprep.com/api/v3/quote-short/{symbol}?apikey={fin_modeling_prep_api_key}")
    return await get_jsonparsed_data_async(url)

def get_stock_quote_full(symbol: str) -> Union[dict, list]:
    """
    Get the full stock quote with changes and percentages using the Financial Modeling Prep API.
    
    Note: FMP API returns a list containing quote data, not a dict.
    """
    url = (f"https://financialmodelingprep.com/api/v3/quote/{symbol}?apikey={fin_modeling_prep_api_key}")
    return get_jsonparsed_data(url)

async def get_stock_quote_full_async(symbol: str) -> Union[dict, list]:
    """
    Asynchronously get the full stock quote with changes and percentages.
    
    Note: FMP API returns a list containing quote data, not a dict.
    """
    url = (f"https://financialmodelingprep.com/api/v3/quote/{symbol}?apikey={fin_modeling_prep_api_key}")
    return await get_jsonparsed_data_async(url)

def get_stock_quotes_batch(symbols: list) -> list:
    """
    Get full stock quotes for multiple symbols in a single API call.
    
    Args:
        symbols: List of stock symbols (e.g., ['AAPL', 'MSFT', 'GOOGL'])
    
    Returns:
        List of quote dictionaries, one per symbol
        
    Raises:
        Exception: If the API request fails, allowing callers to handle errors appropriately
    """
    if not symbols:
        return []
    
    # FMP API supports comma-separated symbols for batch requests
    symbols_str = ','.join(symbols)
    url = f"https://financialmodelingprep.com/api/v3/quote/{symbols_str}?apikey={fin_modeling_prep_api_key}"
    
    # Let exceptions bubble up to callers for proper error handling
    # This maintains separation of concerns and allows callers to decide how to handle failures
    return get_jsonparsed_data(url)

async def get_stock_quotes_batch_async(symbols: list) -> list:
    """
    Asynchronously get full stock quotes for multiple symbols in a single API call.
    """
    if not symbols:
        return []
    
    symbols_str = ','.join(symbols)
    url = f"https://financialmodelingprep.com/api/v3/quote/{symbols_str}?apikey={fin_modeling_prep_api_key}"
    return await get_jsonparsed_data_async(url)
