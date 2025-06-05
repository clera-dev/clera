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