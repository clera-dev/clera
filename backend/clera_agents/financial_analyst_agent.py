#financial_analyst_agent.py

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

@tool("research_financial_topic")
def research_financial_topic(query: str) -> str:
    """Research financial topics, news, events, market data, or specific companies. Adapts depth based on the query.
    - Use for general financial questions, news updates, or company research.
    - Provides concise, factual, up-to-date information by default.
    - Performs more in-depth research ONLY if the query explicitly asks for "detailed" or "in-depth" analysis.
    Input should be a specific financial research question.
    """
    # Determine if in-depth research is requested
    is_in_depth_query = "in-depth" in query.lower() or "detailed" in query.lower()

    if is_in_depth_query:
        research_prompt = f"""You are the world's BEST financial news analyst. The user has asked for DETAILED/IN-DEPTH research. Provide a thorough, comprehensive analysis with actionable insights on the query below. Focus on concrete facts, figures, sources, and causal relationships. Avoid generic advice.

Query: {query}
"""
    else:
        research_prompt = f"""You are an efficient financial news assistant. Provide a concise, factual, and up-to-date summary addressing the query below. Focus on the key information and latest developments. Avoid unnecessary jargon or lengthy explanations.

Query: {query}
"""

    messages = [SystemMessage(content=research_prompt), HumanMessage(content=query)]
    try:
        # Use the standard perplexity model for efficiency unless deep research is needed?
        # For now, standard model should handle prompt instructions.
        response = chat_perplexity.invoke(messages)
        return response.content
    except Exception as e:
        return f"Error researching financial topic: {e}"

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
    price = stock_quote[0]['price']

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