#financial_news_agent.py

# This file will be used to build the financial news agent.
# It will be used to search for financial news and summarize it.

# Import necessary libraries
import os
from dotenv import load_dotenv
from urllib.request import urlopen
import certifi
import json
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.tools import tool

load_dotenv()
fin_modeling_prep_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

###############################################################################
# Import LLM client(s)
###############################################################################
from langchain_community.chat_models import ChatPerplexity

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

@tool("financial_news_research")
def financial_news_research(query: str) -> str:
    """Perform in-depth research on financial topics, including real-time news, events, and market data. Input should be a specific financial research question."""
    research_prompt = f"""You are the world's BEST financial news analyst. Research and provide a detailed analysis with actionable insights on the user's query.

IMPORTANT INSTRUCTIONS:
1. When analyzing market conditions or stock performance:
   - Focus on SPECIFIC companies and tickers mentioned in the query
   - Provide CONCRETE facts about recent price movements, news events, and analyst opinions
   - Include relevant sector trends, economic indicators, and company-specific developments
   - Cite recent analyst ratings changes, price targets, or earnings expectations when relevant
   - Explain the ACTUAL reasons behind market movements, not general financial advice

2. Avoid generic or vague responses like:
   - "Markets can be volatile"
   - "Many factors affect stock performance"
   - "Consider your investment goals"

3. Your response should include:
   - Specific percentages or figures when discussing price movements
   - Named analysts or institutions making relevant forecasts
   - Concrete market events and their impact on securities
   - Clear explanations of cause-and-effect relationships

The query is: {query}
"""
    messages = [SystemMessage(content=research_prompt), HumanMessage(content=query)]
    try:
        #print("Invoking Perplexity...")
        response = chat_perplexity.invoke(messages)
        #print("Perplexity invoked successfully.")
        return response.content
    except Exception as e:
        return f"Error retrieving financial news: {e}"
    
@tool("summarize_news") # NOTE: I DONT NEED THIS RIGHT NOW SINCE I HAVE THE REACT AGENT ACCESS TO PERPLEXITY
def summarize_news(query: str) -> str:
    """Summarize any news for quick digest. Input should be a specific financial research question."""
    research_prompt = f"You are the world's BEST financial news SUMMARIZER. Without the use of any headers or subheaders, quickly summarize the information you find regarding the human's query."
    messages = [SystemMessage(content=research_prompt), HumanMessage(content=query)]
    try:
        #print("Invoking Perplexity...")
        response = chat_perplexity.invoke(messages)
        #print("Perplexity invoked successfully.")
        return response.content
    except Exception as e:
        return f"Error retrieving financial news: {e}"
    
@tool("build_investment_themes")
def build_investment_themes(query: str) -> str:
    """Build in-depth investment themes based on the user's query."""
    research_prompt = f"You are the world's BEST financial analyst. Build in-depth investment themes based on the user's query that provide actionable insights for the user to make informed investment decisions."
    messages = [SystemMessage(content=research_prompt), HumanMessage(content=query)]
    try:
        response = deep_research_perplexity.invoke(messages)
        return response.content
    except Exception as e:
        return f"Error building investment themes: {e}"


@tool("get_stock_price")
def get_stock_price(ticker: str) -> str:
    """Get the current price of a stock.
    
    Input:
        ticker: str
    """

    stock_quote = get_stock_quote(ticker)
    price = stock_quote['price']

    return f"The current price of {ticker} is {price}."

def get_jsonparsed_data(url):
    """Get the JSON data from a URL."""
    response = urlopen(url, cafile=certifi.where())
    data = response.read().decode("utf-8")
    return json.loads(data)

def get_stock_quote(symbol: str) -> dict:
    """Get the stock quote for a given symbol using the Financial Modeling Prep API."""
    url = (f"https://financialmodelingprep.com/api/v3/quote-short/{symbol}?apikey={fin_modeling_prep_api_key}")
    return get_jsonparsed_data(url)