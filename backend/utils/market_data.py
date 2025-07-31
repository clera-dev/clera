# market_data.py
# Shared utility functions for market data operations

import os
from urllib.request import urlopen
import certifi
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)
fin_modeling_prep_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

def get_jsonparsed_data(url):
    """Get the JSON data from a URL."""
    response = urlopen(url, cafile=certifi.where())
    data = response.read().decode("utf-8")
    return json.loads(data)

def get_stock_quote(symbol: str) -> dict:
    """Get the stock quote for a given symbol using the Financial Modeling Prep API."""
    url = (f"https://financialmodelingprep.com/api/v3/quote-short/{symbol}?apikey={fin_modeling_prep_api_key}")
    return get_jsonparsed_data(url)

def get_stock_quote_full(symbol: str) -> dict:
    """Get the full stock quote with changes and percentages using the Financial Modeling Prep API."""
    url = (f"https://financialmodelingprep.com/api/v3/quote/{symbol}?apikey={fin_modeling_prep_api_key}")
    return get_jsonparsed_data(url)

def get_stock_quotes_batch(symbols: list) -> list:
    """
    Get full stock quotes for multiple symbols in a single API call.
    
    Args:
        symbols: List of stock symbols (e.g., ['AAPL', 'MSFT', 'GOOGL'])
    
    Returns:
        List of quote dictionaries, one per symbol
    """
    if not symbols:
        return []
    
    # FMP API supports comma-separated symbols for batch requests
    symbols_str = ','.join(symbols)
    url = f"https://financialmodelingprep.com/api/v3/quote/{symbols_str}?apikey={fin_modeling_prep_api_key}"
    
    try:
        return get_jsonparsed_data(url)
    except Exception as e:
        # If batch fails, return empty list rather than falling back to individual calls
        # This maintains the batch contract and prevents N+1 fallback anti-pattern
        print(f"Batch quote request failed for symbols {symbols}: {e}")
        return [] 