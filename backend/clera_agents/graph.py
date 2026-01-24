#graph.py
#
# This file will be used to build graph for LangGraph studio
# There are some issues with the clera_main.py file that prevent it from being used in LangGraph studio
# So this file will be used to build the graph

#clera_main.py
# This is the main file for the Clera application.
# It is used to orchestrate the flow of the application.
# It takes in a Clera instance, a FinancialNewsAgent instance, and a PortfolioRebalanceAgent instance.
# It then builds the graph and executes it.

#!/usr/bin/env python3
import os
import sys
import json
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from typing import List, Optional, Any, Dict, Tuple, Union, Annotated
from typing_extensions import TypedDict

# ---------------------------
# Load environment variables FIRST before any agent imports
# ---------------------------
os.environ["TOKENIZERS_PARALLELISM"] = "false"
load_dotenv(override=True)

# ---------------------------
# Import LangChain / LangGraph components
# ---------------------------
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage, FunctionMessage
from langchain_core.prompts import SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate
from langchain_core.tools import Tool, tool
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore
#from langmem import create_manage_memory_tool, create_search_memory_tool # deleted langmem for now
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph_supervisor import create_supervisor
from langgraph.prebuilt import create_react_agent
from langgraph.types import interrupt

# Import embeddings function from openAI
#from ...

# ---------------------------
# Import LLM clients (GroqCloud, Anthropic, OpenAI & Perplexity)
# ---------------------------
from langchain_groq import ChatGroq
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_perplexity import ChatPerplexity
# instead of using langchain_community.chat_models.ChatPerplexity


# ---------------------------
# Import tools for agents to use (AFTER environment variables are loaded)
# ---------------------------
from clera_agents import financial_analyst_agent as fa_module
from clera_agents import portfolio_management_agent as pm_module
from clera_agents import trade_execution_agent as te_module

# Import personalization service and supervisor prompt
from utils.personalization_service import create_personalized_supervisor_prompt
from utils.prompts.supervisor_prompt import get_supervisor_clera_system_prompt


###############################################################################
# Define the conversation state type
###############################################################################
class State(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    account_id: Optional[str]
    user_id: Optional[str]
    is_last_step: bool
    remaining_steps: int


###############################################################################
# Set up storage and checkpointer
###############################################################################
checkpointer = MemorySaver()


###############################################################################
# Define Tools for Specialized Agents to Use
###############################################################################

chat_perplexity = ChatPerplexity(
    temperature=0.4,
    model="sonar"
) 

# Define tools for each agent upfront
financial_analyst_tools = [
    fa_module.web_search,
    fa_module.web_search_streaming,
    fa_module.get_stock_price,
    fa_module.calculate_investment_performance
]

portfolio_management_tools = [
    pm_module.get_portfolio_summary,
    pm_module.rebalance_instructions,
    pm_module.get_account_activities_tool
]

trade_execution_tools = [
    te_module.execute_buy_market_order,
    te_module.execute_sell_market_order
]


###############################################################################
# Agent Prompt Templates - Static (Cacheable) + Dynamic Sections
###############################################################################

# =============================================================================
# FINANCIAL ANALYST AGENT PROMPTS
# =============================================================================

FINANCIAL_ANALYST_STATIC_PROMPT = """You are an expert financial analyst providing institutional-quality equity research and market analysis.

## TOOLS
- **web_search**: Market research, analyst ratings, company news, fundamentals
- **get_stock_price**: Current price, daily change, volume
- **calculate_investment_performance**: Historical returns, benchmark comparison

## SEARCH PATTERNS
- Analyst views: "[TICKER] analyst price target rating 2025"
- Fundamentals: "[TICKER] earnings revenue guidance"
- News: "[TICKER] recent news catalysts"

## ANALYSIS FRAMEWORK
For investment questions, gather:
1. Current price + analyst consensus (web_search + get_stock_price)
2. Recent performance vs S&P 500 (calculate_investment_performance)
3. Key risks and catalysts

## OUTPUT FORMAT
- Lead with specific data (prices, percentages, ratings)
- Include bull AND bear case
- Provide clear investment thesis
- Note key risks

## SELF-SYNTHESIS RULE (CRITICAL)
Your response must be COMPLETE and SELF-CONTAINED.
If you call multiple tools, YOU must combine all results into ONE coherent response.
The supervisor only sees your final message - never expect synthesis upstream.
Structure: Data → Analysis → Recommendation → Risks"""


def get_financial_analyst_dynamic_prompt() -> str:
    """Generate dynamic context for financial analyst agent."""
    current_datetime = datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')
    return f"""
## CURRENT CONTEXT
Today: {current_datetime}
Always use current date in searches. Prioritize data from last 30 days."""


def get_financial_analyst_full_prompt() -> str:
    """Combine static and dynamic prompts."""
    return FINANCIAL_ANALYST_STATIC_PROMPT + get_financial_analyst_dynamic_prompt()


# =============================================================================
# PORTFOLIO MANAGEMENT AGENT PROMPTS
# =============================================================================

PORTFOLIO_MANAGEMENT_STATIC_PROMPT = """You are a portfolio management specialist analyzing user investment accounts.

## TOOLS
- **get_portfolio_summary()**: Holdings, positions, values, allocation, cash balance
  → Use for: "my portfolio", "what do I own", "my holdings", "account value", "allocation"
- **rebalance_instructions()**: Rebalancing recommendations for current holdings
  → Use for: "should I rebalance", "optimize allocation", "improve diversification"
- **get_account_activities()**: Trading history, transactions (LAST 60 DAYS ONLY)
  → Use for: "what have I bought", "trading history", "when did I buy X"

## TOOL SELECTION
- Current state questions → get_portfolio_summary()
- Optimization questions → rebalance_instructions()
- History questions → get_account_activities() (note 60-day limit if older data requested)

## FOR INVESTMENT CONTEXT QUESTIONS
When asked "Is [STOCK] a good buy?" or similar:
1. ALWAYS call get_portfolio_summary() first
2. Check if user already owns it
3. Assess portfolio fit, concentration risk, diversification impact

## CONSTRAINTS
- NEVER say you cannot execute trades (different agent handles that)
- NEVER recommend seeing another advisor
- Provide analysis, then transfer back - don't discuss execution capabilities

## SELF-SYNTHESIS RULE (CRITICAL)
Your response must be COMPLETE and SELF-CONTAINED.
If you call multiple tools, YOU must combine all results into ONE coherent response.
The supervisor only sees your final message - never expect synthesis upstream.
Structure: Holdings Summary → Analysis → Personalized Recommendation"""


def get_portfolio_management_dynamic_prompt() -> str:
    """Generate dynamic context for portfolio management agent."""
    current_datetime = datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')
    return f"""
## CURRENT CONTEXT
Today: {current_datetime}
All timestamps in tool outputs are UTC."""


def get_portfolio_management_full_prompt() -> str:
    """Combine static and dynamic prompts."""
    return PORTFOLIO_MANAGEMENT_STATIC_PROMPT + get_portfolio_management_dynamic_prompt()


# =============================================================================
# TRADE EXECUTION AGENT PROMPTS
# =============================================================================

TRADE_EXECUTION_STATIC_PROMPT = """You are a trade execution assistant processing buy/sell orders.

## TOOLS
- **execute_buy_market_order(ticker: str, notional_amount: float)**: Buy using dollar amount
- **execute_sell_market_order(ticker: str, notional_amount: float)**: Sell using dollar amount

## VALID REQUESTS
- "Buy $500 of AAPL" → execute_buy_market_order(ticker="AAPL", notional_amount=500.0)
- "Sell $1000 of TSLA" → execute_sell_market_order(ticker="TSLA", notional_amount=1000.0)
- Minimum: $1.00

## INVALID REQUESTS (respond without tool call)
- Missing amount: "Buy AAPL" → Ask for dollar amount
- Share-based: "Buy 10 shares" → Explain we use dollar amounts
- Below minimum: "$0.50" → Explain $1 minimum

## EXECUTION RULES
- Process ONE trade per invocation
- Extract ticker (uppercase) and amount (float)
- NEVER fabricate success - must call tool first
- Return exact tool output

## USER MODIFICATIONS
Users can modify trades in confirmation popup. Tool output shows ACTUAL trade executed.
Always report what was ACTUALLY traded, not your original call.

## ERROR HANDLING
Read error messages carefully. Report EXACT reason from tool output:
- "Symbol not available" → Invalid ticker
- "Insufficient buying power" → Not enough funds
- "Market closed" → Order queued for next open

## SELF-SYNTHESIS RULE (CRITICAL)
Your response must be COMPLETE and SELF-CONTAINED.
Report the final trade result clearly. The supervisor only sees your final message."""


def get_trade_execution_dynamic_prompt() -> str:
    """Generate dynamic context for trade execution agent."""
    current_datetime = datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')
    return f"""
## CURRENT CONTEXT
Today: {current_datetime}
Orders outside market hours queue for next open."""


def get_trade_execution_full_prompt() -> str:
    """Combine static and dynamic prompts."""
    return TRADE_EXECUTION_STATIC_PROMPT + get_trade_execution_dynamic_prompt()


###############################################################################
# Build the Graph
###############################################################################

# LLM Configuration
main_llm = ChatAnthropic(
    anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
    model="claude-sonnet-4-5-20250929",
    temperature=0.1,
    max_retries=3,
    timeout=120,
    streaming=True,
    stream_usage=True
)
    
financial_analyst_llm = ChatAnthropic(
    anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
    model="claude-haiku-4-5-20251001",  
    temperature=0.1,
    max_retries=3,
    timeout=120,
    streaming=True,
    stream_usage=True
)

rebalance_llm = ChatAnthropic(
    anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
    model="claude-haiku-4-5-20251001",
    temperature=0.2,
    max_retries=3,
    timeout=120,
    streaming=True,
    stream_usage=True
)

trade_llm = ChatAnthropic(
    anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
    model="claude-haiku-4-5-20251001",
    temperature=0.2,
    max_retries=3,
    timeout=60,
    streaming=True,
    stream_usage=True
)


# Create Agents with Restructured Prompts
financial_analyst_agent = create_react_agent(
    model=financial_analyst_llm,
    tools=financial_analyst_tools,
    prompt=get_financial_analyst_full_prompt(),
    name="financial_analyst_agent",
    state_schema=State
)

portfolio_management_agent = create_react_agent(
    model=rebalance_llm,
    tools=portfolio_management_tools,
    prompt=get_portfolio_management_full_prompt(),
    name="portfolio_management_agent",
    state_schema=State
)

trade_execution_agent = create_react_agent(
    model=trade_llm,
    tools=trade_execution_tools,
    prompt=get_trade_execution_full_prompt(),
    name="trade_execution_agent",
    state_schema=State
)


# Create supervisor workflow
workflow = create_supervisor(
    [financial_analyst_agent, portfolio_management_agent, trade_execution_agent],
    model=main_llm,
    prompt=create_personalized_supervisor_prompt,
    output_mode="full_history",
    supervisor_name="Clera", 
    state_schema=State,
    add_handoff_back_messages=True,
    include_agent_name="inline",
)

# Compile with memory components
graph = workflow.compile()
graph.name = "CleraAgents"

__all__ = ["graph"]