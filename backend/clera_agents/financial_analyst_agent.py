#financial_analyst_agent.py

# This file will be used to build the financial news agent.
# It will be used to search for financial news and summarize it.

# Import necessary libraries
import os
import logging
from dotenv import load_dotenv
from urllib.request import urlopen
import certifi
import json
from typing import Dict
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta
import pandas as pd
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.tools import tool

# CRITICAL ADDITION: Import stream writer for real-time updates
from langgraph.config import get_stream_writer

# Make sure we load environment variables first
load_dotenv(override=True)

# Set OpenAI API key explicitly for Perplexity models
import openai
openai_api_key = os.getenv("OPENAI_API_KEY")
if openai_api_key:
    openai.api_key = openai_api_key
    os.environ["OPENAI_API_KEY"] = openai_api_key

fin_modeling_prep_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

# Import Alpaca historical data client for performance analysis (initialize on demand)
from alpaca.data import StockHistoricalDataClient, TimeFrame
from alpaca.data.requests import StockBarsRequest

def get_data_client():
    """Get Alpaca data client with proper error handling."""
    api_key = os.getenv("APCA_API_KEY_ID")
    secret_key = os.getenv("APCA_API_SECRET_KEY")
    
    if not api_key or not secret_key:
        logger.warning("[Financial Analyst] Alpaca API credentials not found - some features may be limited")
        return None
    
    try:
        return StockHistoricalDataClient(api_key=api_key, secret_key=secret_key)
    except Exception as e:
        logger.error(f"[Financial Analyst] Failed to initialize Alpaca data client: {e}")
        return None

# Configure logging
logger = logging.getLogger(__name__)

# Import shared market data utilities
from utils.market_data import get_stock_quote

###############################################################################
# Import LLM client(s)
###############################################################################
from langchain_perplexity import ChatPerplexity

###############################################################################
# Define Tools for Financial Analyst Agent to Use
###############################################################################

# Perplexity API Key
chat_perplexity = ChatPerplexity(
    model="sonar",
    temperature=0.4
)

deep_research_perplexity = ChatPerplexity(
    model="sonar-deep-research",
    temperature=0.4
)

@tool("web_search")
def web_search(query: str) -> str:
    """Simple one-step search tool for financial information with real-time updates.
    
    Args:
        query (str): The search query
        
    Returns:
        str: Search results
    """
    # Get the stream writer for real-time updates
    writer = get_stream_writer()
    
    # Send custom update to frontend
    writer({
        "type": "tool_update", 
        "tool": "web_search",
        "status": "starting",
        "message": f"🔍 Searching for: {query}"
    })
    
    # Determine if in-depth research is requested
    is_in_depth_query = "in-depth" in query.lower() or "detailed" in query.lower()
    current_date = datetime.now().strftime("%Y-%m-%d")

    if is_in_depth_query:
        writer({
            "type": "tool_update",
            "tool": "web_search", 
            "status": "processing",
            "message": "📊 Conducting detailed research..."
        })
        research_prompt = f"""You are the world's BEST financial news analyst. 
        The user has asked for DETAILED/IN-DEPTH research. 
        Provide a thorough, comprehensive analysis with actionable insights on the query below. 
        Focus on concrete facts, figures, sources, and causal relationships. 
        Avoid generic advice. Use recent AND credible financial news sources. 
        Today's date is {current_date}.

Query: {query}
"""
    else:
        writer({
            "type": "tool_update",
            "tool": "web_search",
            "status": "processing", 
            "message": "🔍 Gathering financial information..."
        })
        research_prompt = f"""You are an efficient financial news assistant. Provide a concise, factual, and up-to-date summary addressing the query below. Focus on the key information and latest developments. Avoid unnecessary jargon or lengthy explanations.

Query: {query}
"""

    messages = [SystemMessage(content=research_prompt), HumanMessage(content=query)]
    try:
        writer({
            "type": "tool_update",
            "tool": "web_search",
            "status": "processing",
            "message": "🤖 Analyzing results with AI..."
        })
        
        response = chat_perplexity.invoke(messages)
        
        writer({
            "type": "tool_update",
            "tool": "web_search", 
            "status": "completed",
            "message": "✅ Research completed"
        })
        
        return response.content
    except Exception as e:
        writer({
            "type": "tool_update",
            "tool": "web_search",
            "status": "error", 
            "message": f"❌ Error: {str(e)}"
        })
        return f"Error searching for information: {e}"


@tool("get_stock_price")
def get_stock_price(ticker: str) -> str:
    """Get the current price of a stock with real-time updates.
    
    Args:
        ticker (str): The stock symbol to get the price for
        
    Returns:
        str: The current stock price information
    """
    writer = get_stream_writer()
    
    writer({
        "type": "tool_update",
        "tool": "get_stock_price",
        "status": "starting", 
        "message": f"📈 Looking up current price for {ticker.upper()}"
    })

    try:
        writer({
            "type": "tool_update",
            "tool": "get_stock_price",
            "status": "processing",
            "message": "🔄 Fetching live market data..."
        })
        
        stock_quote = get_stock_quote(ticker)
        price = stock_quote[0]['price']
        
        writer({
            "type": "tool_update", 
            "tool": "get_stock_price",
            "status": "completed",
            "message": f"✅ Retrieved price: ${price}"
        })

        return f"The current price of {ticker} is {price}."
    
    except Exception as e:
        writer({
            "type": "tool_update",
            "tool": "get_stock_price", 
            "status": "error",
            "message": f"❌ Error fetching price for {ticker}: {str(e)}"
        })
        return f"Error getting stock price: {e}"

###############################################################################
# Performance Analysis Functions (moved from portfolio_management_agent.py)
###############################################################################

def validate_symbol_and_dates(symbol: str, start_date: str, end_date: str) -> Dict:
    """Validate inputs and check data availability.
    
    Args:
        symbol: Stock symbol to validate
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
    
    Returns:
        Dict: Validation result with 'valid' key or 'error' key
    """
    # Validate date format and range
    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        if start_dt >= end_dt:
            return {"error": "Start date must be before end date"}
        
        if (end_dt - start_dt).days > 365 * 5:  # 5 years max
            return {"error": "Date range too large (max 5 years)"}
        
        # Check if dates are too far in the future
        if end_dt > datetime.now() + timedelta(days=1):
            return {"error": "End date cannot be in the future"}
            
    except ValueError:
        return {"error": "Invalid date format. Use YYYY-MM-DD"}
    
    # Basic symbol validation
    if not symbol or not symbol.isalpha():
        return {"error": "Invalid symbol format. Use uppercase letters only (e.g., 'AAPL')"}
    
    # Symbol should be reasonable length
    if len(symbol) > 10:
        return {"error": "Symbol too long. Most stock symbols are 1-5 characters"}
    
    return {"valid": True}


def adjust_for_market_days(date_str: str, direction: str = "backward") -> str:
    """Adjust date to nearest market day if needed.
    
    Args:
        date_str: Date string in YYYY-MM-DD format
        direction: "backward" or "forward" for adjustment direction
    
    Returns:
        str: Adjusted date string
    """
    try:
        from pandas.tseries.holiday import USFederalHolidayCalendar
        from pandas.tseries.offsets import CustomBusinessDay
        
        date_obj = pd.to_datetime(date_str)
        us_bd = CustomBusinessDay(calendar=USFederalHolidayCalendar())
        
        if direction == "backward":
            # Find previous business day if current date is not a business day
            if date_obj.weekday() >= 5:  # Weekend
                adjusted_date = date_obj - pd.DateOffset(days=(date_obj.weekday() - 4))
            else:
                adjusted_date = date_obj
        else:
            # Find next business day if current date is not a business day
            if date_obj.weekday() >= 5:  # Weekend
                adjusted_date = date_obj + pd.DateOffset(days=(7 - date_obj.weekday()))
            else:
                adjusted_date = date_obj
        
        return adjusted_date.strftime('%Y-%m-%d')
    except Exception as e:
        logger.warning(f"Could not adjust date {date_str} for market days: {e}")
        return date_str


def get_historical_prices(symbol: str, start_date: str, end_date: str = None) -> Dict:
    """Get historical prices for performance calculation.
    
    Args:
        symbol: Stock symbol (e.g., 'AAPL', 'SPY')
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format (defaults to today)
    
    Returns:
        Dict: Historical price data with start/end prices and metadata
    
    Raises:
        ValueError: If no data available for the symbol/date range
        Exception: For API errors or other issues
    """
    if end_date is None:
        end_date = datetime.now().strftime('%Y-%m-%d')
    
    logger.info(f"[Performance Analysis] Fetching historical data for {symbol} from {start_date} to {end_date}")
    
    try:
        # Convert dates to timezone-aware datetime objects (market timezone)
        start_time = pd.to_datetime(start_date).tz_localize('America/New_York')
        end_time = pd.to_datetime(end_date).tz_localize('America/New_York')
        
        # Create request for daily bars
        request_params = StockBarsRequest(
            symbol_or_symbols=[symbol],
            timeframe=TimeFrame.Day,
            start=start_time,
            end=end_time
        )
        
        # Get data client and fetch data
        data_client = get_data_client()
        if not data_client:
            raise Exception("Alpaca data client not available - API credentials may be missing")
        
        bars = data_client.get_stock_bars(request_params)
        
        # Convert to DataFrame for easy manipulation
        df = bars.df
        if df.empty:
            raise ValueError(f"No price data available for {symbol} in the specified date range ({start_date} to {end_date})")
        
        # Extract start and end prices
        start_price = df.iloc[0]['close']
        end_price = df.iloc[-1]['close']
        
        # Get actual dates from the data (in case of market holidays/weekends)
        actual_start_date = df.index[0][1].strftime('%Y-%m-%d')  # [1] because of MultiIndex (symbol, timestamp)
        actual_end_date = df.index[-1][1].strftime('%Y-%m-%d')
        
        logger.info(f"[Performance Analysis] Retrieved {len(df)} data points for {symbol}")
        
        return {
            'symbol': symbol,
            'requested_start_date': start_date,
            'requested_end_date': end_date,
            'actual_start_date': actual_start_date,
            'actual_end_date': actual_end_date,
            'start_price': Decimal(str(start_price)),
            'end_price': Decimal(str(end_price)),
            'price_change': Decimal(str(end_price - start_price)),
            'percentage_change': Decimal(str((end_price - start_price) / start_price * 100)),
            'data_points': len(df),
            'has_data': True
        }
        
    except Exception as e:
        logger.error(f"[Performance Analysis] Error fetching data for {symbol}: {e}")
        raise


def calculate_annualized_return(total_return_pct: Decimal, days: int) -> Decimal:
    """Calculate annualized return from total return percentage and time period.
    
    Args:
        total_return_pct: Total return as percentage (e.g., 10.5 for 10.5%)
        days: Number of days in the period
    
    Returns:
        Decimal: Annualized return as percentage
    """
    if days <= 0:
        return Decimal('0')
    
    years = Decimal(str(days)) / Decimal('365.25')
    
    # Handle edge cases
    if total_return_pct <= Decimal('-100'):  # Total loss
        return Decimal('-100')
    
    if years < Decimal('0.1'):  # Less than ~36 days, return simple annualized
        return total_return_pct * (Decimal('365.25') / Decimal(str(days)))
    
    # Convert percentage to decimal (e.g., 10% -> 0.1)
    total_return_decimal = total_return_pct / Decimal('100')
    
    try:
        # Calculate: (1 + return)^(1/years) - 1
        compound_factor = (Decimal('1') + total_return_decimal) ** (Decimal('1') / years)
        annualized_return = (compound_factor - Decimal('1')) * Decimal('100')
        return annualized_return
    except (OverflowError, InvalidOperation):
        # Fallback for extreme values
        return total_return_pct * (Decimal('365.25') / Decimal(str(days)))


def format_performance_analysis(performance_data: Dict, benchmark_data: Dict = None) -> str:
    """Format performance data into user-friendly output.
    
    Args:
        performance_data: Performance data from get_historical_prices
        benchmark_data: Optional benchmark comparison data
    
    Returns:
        str: Formatted performance analysis
    """
    symbol = performance_data['symbol']
    start_date = performance_data['actual_start_date']
    end_date = performance_data['actual_end_date']
    price_change = performance_data['price_change']
    pct_change = performance_data['percentage_change']
    
    # Get current timestamp for analysis recency
    current_timestamp = datetime.now().strftime('%A, %B %d, %Y at %I:%M %p')
    
    # Calculate time period
    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    days = (end_dt - start_dt).days
    
    # Calculate annualized return
    annualized_return = calculate_annualized_return(pct_change, days)
    
    # Determine performance emoji
    perf_emoji = "📈" if pct_change >= 0 else "📉"
    
    summary = f"""📊 **ANALYSIS GENERATED:** {current_timestamp}

{perf_emoji} **Performance Analysis: {symbol}**

**Period:** {start_date} to {end_date} ({days} days)

**Price Performance:**
• Start Price: ${performance_data['start_price']:,.2f}
• End Price: ${performance_data['end_price']:,.2f}
• Price Change: ${price_change:+,.2f} ({pct_change:+.2f}%)

**Returns Analysis:**
• Total Return: {pct_change:+.2f}%
• Annualized Return: {annualized_return:+.2f}%"""

    # Add time period context
    if days < 30:
        summary += f"\n• Note: Short period analysis (<30 days)"
    elif days < 365:
        summary += f"\n• Note: Less than 1 year of data"

    # Add benchmark comparison if available
    if benchmark_data and benchmark_data.get('has_data'):
        spy_return = benchmark_data['percentage_change']
        outperformance = pct_change - spy_return
        
        outperf_emoji = "🎯" if outperformance >= 0 else "📊"
        
        summary += f"""

{outperf_emoji} **vs S&P 500 (SPY) Benchmark:**
• SPY Return: {spy_return:+.2f}%
• Outperformance: {outperformance:+.2f} percentage points
• Relative Performance: {"Better" if outperformance >= 0 else "Worse"} than market"""

        if abs(outperformance) > 5:
            summary += f"\n• Note: Significant {'outperformance' if outperformance > 0 else 'underperformance'} vs market"

    summary += f"""

**Data Quality:**
• Data Points: {performance_data['data_points']} trading days
• Data Source: Alpaca Markets (daily close prices)"""

    return summary


@tool("calculate_investment_performance")
def calculate_investment_performance(
    symbol: str,
    start_date: str,
    end_date: str = "",
    compare_to_sp500: bool = True
) -> str:
    """Calculate investment performance with detailed progress updates."""
    writer = get_stream_writer()
    
    writer({
        "type": "tool_update",
        "tool": "calculate_investment_performance", 
        "status": "starting",
        "message": f"📊 Analyzing performance for {symbol.upper()}"
    })
    
    try:
        # Set default end date to today if not provided
        if not end_date or end_date == "":
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        writer({
            "type": "tool_update",
            "tool": "calculate_investment_performance",
            "status": "processing", 
            "message": "🔍 Validating dates and symbol..."
        })
        
        # Validate inputs
        validation = validate_symbol_and_dates(symbol.upper(), start_date, end_date)
        if 'error' in validation:
            writer({
                "type": "tool_update",
                "tool": "calculate_investment_performance",
                "status": "error",
                "message": f"❌ Validation error: {validation['error']}"
            })
            return f"❌ **Error:** {validation['error']}"
        
        # Adjust dates for market days if needed
        adjusted_start = adjust_for_market_days(start_date, "forward")
        adjusted_end = adjust_for_market_days(end_date, "backward")
        
        writer({
            "type": "tool_update",
            "tool": "calculate_investment_performance",
            "status": "processing",
            "message": f"📈 Fetching historical data for {symbol.upper()}..."
        })
        
        logger.info(f"[Performance Analysis] Analyzing {symbol.upper()} from {start_date} to {end_date}")
        
        # Get performance data for the target symbol
        try:
            performance_data = get_historical_prices(symbol.upper(), adjusted_start, adjusted_end)
            
            writer({
                "type": "tool_update", 
                "tool": "calculate_investment_performance",
                "status": "processing",
                "message": f"✅ Retrieved {performance_data['data_points']} data points"
            })
            
        except ValueError as ve:
            writer({
                "type": "tool_update",
                "tool": "calculate_investment_performance", 
                "status": "error",
                "message": f"❌ Data error: {str(ve)}"
            })
            return f"❌ **Data Error:** {str(ve)}\n\nPlease verify the symbol exists and has trading data for the specified period."
        except Exception as e:
            logger.error(f"[Performance Analysis] API error for {symbol}: {e}")
            writer({
                "type": "tool_update",
                "tool": "calculate_investment_performance",
                "status": "error", 
                "message": f"❌ API error: {str(e)}"
            })
            return f"❌ **API Error:** Could not retrieve data for {symbol.upper()}. This might be due to:\n• Invalid symbol\n• Market data service unavailable\n• Network connectivity issues\n\nPlease try again later or verify the symbol."
        
        # Get benchmark data if requested
        benchmark_data = None
        if compare_to_sp500:
            try:
                writer({
                    "type": "tool_update",
                    "tool": "calculate_investment_performance", 
                    "status": "processing",
                    "message": "📊 Fetching S&P 500 benchmark data..."
                })
                
                logger.info(f"[Performance Analysis] Fetching S&P 500 benchmark data")
                benchmark_data = get_historical_prices('SPY', adjusted_start, adjusted_end)
                
                writer({
                    "type": "tool_update",
                    "tool": "calculate_investment_performance",
                    "status": "processing", 
                    "message": "✅ Benchmark data retrieved"
                })
                
            except Exception as e:
                writer({
                    "type": "tool_update", 
                    "tool": "calculate_investment_performance",
                    "status": "warning",
                    "message": f"⚠️ Could not fetch benchmark data: {str(e)}"
                })
                logger.warning(f"[Performance Analysis] Could not fetch SPY benchmark data: {e}")
                # Continue without benchmark rather than failing
        
        writer({
            "type": "tool_update",
            "tool": "calculate_investment_performance",
            "status": "processing",
            "message": "📋 Generating performance report..."
        })
        
        # Format and return the analysis
        analysis = format_performance_analysis(performance_data, benchmark_data)
        
        writer({
            "type": "tool_update",
            "tool": "calculate_investment_performance", 
            "status": "completed",
            "message": "✅ Performance analysis completed"
        })
        
        logger.info(f"[Performance Analysis] Successfully completed analysis for {symbol.upper()}")
        return analysis
        
    except Exception as e:
        logger.error(f"[Performance Analysis] Unexpected error in calculate_investment_performance: {e}", exc_info=True)
        writer({
            "type": "tool_update",
            "tool": "calculate_investment_performance",
            "status": "error", 
            "message": f"❌ Unexpected error: {str(e)}"
        })
        return f"❌ **Unexpected Error:** An error occurred while analyzing {symbol}. Please try again later.\n\nError details: {str(e)}"
