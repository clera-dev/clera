#company_analysis.py
#This file is used to analyze a company's financial statements and other relevant data.
#It is used to help the user make investment decisions.
#
# It will use Financial Modeling Prep API + others to get the data. (Bezinga, ...)

import os
from dotenv import load_dotenv
import certifi
import json
import ssl
from urllib.request import urlopen, Request

load_dotenv()
fin_modeling_prep_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

def get_jsonparsed_data(url):
    """Get the JSON data from a URL."""
    # Create a custom SSL context instead of using cafile parameter
    context = ssl.create_default_context(cafile=certifi.where())
    
    # Create a Request object with headers to avoid 403 errors
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    req = Request(url, headers=headers)
    
    # Use the context parameter instead of cafile
    response = urlopen(req, context=context)
    data = response.read().decode("utf-8")
    return json.loads(data)

def potential_company_upside_with_dcf(company_ticker: str) -> str:
    """
    This function returns the company's upside with a discounted cash flow (DCF) analysis.

    It will do this by comparing the company's current stock price to its estimated intrinsic value.
    """
    company_profile_data = company_profile(company_ticker)
    potential_upside = company_profile_data[0]['dcfDiff'] * -1 # Convert to positive because upside is given as negative from API
    if potential_upside > 0:
        return f"{company_profile_data[0]['companyName']} has a potential upside of ${potential_upside:.2f}."
    else:
        return f"{company_profile_data[0]['companyName']} is overvalued by ${abs(potential_upside):.2f}."

def get_analyst_estimates(company_ticker: str) -> str:
    """
    This function returns the analyst estimates for a company.
    """
    # implement with Bezinga AIPs
    return None


def company_profile(company_ticker: str) -> str:
    """
    This function returns an in-depth company profile for a given stock.

    Sample output with AAPL:
    [
        {
        "symbol": "AAPL",
        "price": 241.84,
        "beta": 1.2,
        "volAvg": 50674048,
        "mktCap": 3632944664000,
        "lastDiv": 1,
        "range": "164.08-260.1",
        "changes": 4.54,
        "companyName": "Apple Inc.",
        "currency": "USD",
        "cik": "0000320193",
        "isin": "US0378331005",
        "cusip": "037833100",
        "exchange": "NASDAQ Global Select",
        "exchangeShortName": "NASDAQ",
        "industry": "Consumer Electronics",
        "website": "https://www.apple.com",
        "description": "Apple Inc. designs, manufactures, and markets smartphones, personal computers,...", # Continues
        "ceo": "Mr. Timothy D. Cook",
        "sector": "Technology",
        "country": "US",
        "fullTimeEmployees": "150000",
        "phone": "(408) 996-1010",
        "address": "One Apple Park Way",
        "city": "Cupertino",
        "state": "CA",
        "zip": "95014",
        "dcfDiff": 80.5923,
        "dcf": 161.247698027427,
        "image": "https://images.financialmodelingprep.com/symbol/AAPL.png",
        "ipoDate": "1980-12-12",
        "defaultImage": false,
        "isEtf": false,
        "isActivelyTrading": true,
        "isAdr": false,
        "isFund": false
        }
    ]
    """
    url = f"https://financialmodelingprep.com/api/v3/profile/{company_ticker}?apikey={fin_modeling_prep_api_key}"
    return get_jsonparsed_data(url)

def basic_dcf_analysis(company_ticker: str) -> str:
    """
    This function performs a basic discounted cash flow (DCF) analysis for a company.
    It uses the company's free cash flow (FCF) to estimate the company's intrinsic value.

    Sample output with AAPL:
    {
        "symbol": "AAPL",
        "date": "2025-03-01",
        "dcf": 161.2476980274271,
        "Stock Price": 241.84
    }    
    """
    url = f"https://financialmodelingprep.com/api/v3/discounted-cash-flow/{company_ticker}?apikey={fin_modeling_prep_api_key}"
    return get_jsonparsed_data(url)


def advanced_dcf_analysis(company_ticker: str) -> str: # Only works with pro tier API key
    """
    This function performs an advanced discounted cash flow (DCF) analysis for a company.
    It uses the company's free cash flow (FCF) to estimate the company's intrinsic value.
    """
    url = f"https://financialmodelingprep.com/api/v4/advanced_discounted_cash_flow?symbol={company_ticker}&apikey={fin_modeling_prep_api_key}"
    return get_jsonparsed_data(url)

def company_news(company_ticker: str, from_date: str, to_date: str) -> str: # Only works with pro tier API key
    """
    This function performs a news sentiment analysis for a company.
    It uses the company's news to estimate the company's sentiment.

    Inputs:
        company_ticker: str
        from_date: str (YYYY-MM-DD)
        to_date: str (YYYY-MM-DD)
    """
    url = f"https://financialmodelingprep.com/api/v3/stock_news?tickers={company_ticker}&page=3&from={from_date}&to={to_date}&apikey={fin_modeling_prep_api_key}"
    return get_jsonparsed_data(url)

if __name__ == "__main__":
    try:
        #print("Basic DCF Analysis:")
        #print(basic_dcf_analysis("NVDA"))
        #print("Company Profile:")
        #print(company_profile("AAPL"))
        print("Potential Upside with DCF:")
        print(potential_company_upside_with_dcf("AAPL"))
        print(potential_company_upside_with_dcf("NVDA"))
    except Exception as e:
        print(e)