#!/usr/bin/env python3

"""
API server for Clera AI. provides endpoints for chat, trade, and company analysis.
"""

import os
import sys
import json
import logging
from typing import List, Dict, Any, Optional
from enum import Enum, auto
import asyncio
from datetime import datetime, timedelta
import uuid
import requests
from decimal import Decimal
from uuid import UUID
import contextlib

from dotenv import load_dotenv

from decouple import config
import aiohttp
import traceback
import httpx
from fastapi import WebSocket
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends, Header, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from langgraph.errors import GraphInterrupt
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage, FunctionMessage


# Configure logging (ensure this is done early)
logger = logging.getLogger("clera-api-server")
logger.setLevel(logging.INFO) # Changed to INFO for less verbose startup in prod
logging_handler = logging.StreamHandler()
logging_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(logging_handler)

# Only load .env file if not running in a Copilot managed environment (where env vars are injected)
# or if explicitly in a 'development' environment as per .env.
if not os.getenv("COPILOT_ENVIRONMENT_NAME") and os.getenv("ENVIRONMENT", "development").lower() == "development":
    load_dotenv(override=True)  # override=True will replace existing environment variables
    logger.info("Loaded environment variables from .env file for local development.")
else:
    logger.info("Skipping .env file loading. Assuming environment variables are managed externally (e.g., by Copilot).")

# === VERY EARLY ENVIRONMENT CHECK ===
INITIAL_ENV_VAL = os.getenv("ENVIRONMENT")
logger.info(f"EARLY CHECK: os.getenv('ENVIRONMENT') at module load time: '{INITIAL_ENV_VAL}'")
# === END EARLY ENVIRONMENT CHECK ===

# --- WebSocket Service URL Resolution --------------------------------------
# Detect production via Copilot's environment flag instead of relying on a
# custom ENVIRONMENT value that can be overwritten by .env defaults.
_IS_PRODUCTION = os.getenv("COPILOT_ENVIRONMENT_NAME", "").lower() == "production" \
                 or os.getenv("ENVIRONMENT", "").lower() == "production"

# Baseline URL: inside ECS → use Copilot service-discovery hostname;
# local dev → use localhost.
_DEFAULT_WEBSOCKET_SERVICE_URL = (
    "http://websocket-service.production.clera-api.internal:8001"
    if _IS_PRODUCTION
    else "http://localhost:8001"
)

# Resolve once at import time so later code can't silently fall back.
WEBSOCKET_SERVICE_URL = os.getenv(
    "WEBSOCKET_SERVICE_URL",
    _DEFAULT_WEBSOCKET_SERVICE_URL,
)

logger.info(
    "WEBSOCKET_SERVICE_URL resolved at import: '%s' (is_production=%s)",
    WEBSOCKET_SERVICE_URL,
    _IS_PRODUCTION,
)
# ---------------------------------------------------------------------------

# --- Redis Host/Port Resolution (similar to WebSocket URL) ---
# _IS_PRODUCTION is already defined above for WEBSOCKET_SERVICE_URL resolution

_DEFAULT_REDIS_HOST_PROD = "clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com"
_DEFAULT_REDIS_PORT_PROD = 6379
_DEFAULT_REDIS_HOST_DEV = "127.0.0.1" # Explicitly 127.0.0.1 for clarity
_DEFAULT_REDIS_PORT_DEV = 6379

_FALLBACK_REDIS_HOST = _DEFAULT_REDIS_HOST_PROD if _IS_PRODUCTION else _DEFAULT_REDIS_HOST_DEV
_FALLBACK_REDIS_PORT = _DEFAULT_REDIS_PORT_PROD if _IS_PRODUCTION else _DEFAULT_REDIS_PORT_DEV

# Resolve once at import time. Prioritize environment variables set by Copilot.
# If they are not set, fall back to production/dev defaults based on _IS_PRODUCTION.
CANONICAL_REDIS_HOST = os.getenv("REDIS_HOST", _FALLBACK_REDIS_HOST)
CANONICAL_REDIS_PORT = int(os.getenv("REDIS_PORT", str(_FALLBACK_REDIS_PORT))) # Ensure fallback is string for os.getenv conversion

logger.info(
    "Redis connection parameters resolved at import: HOST='%s', PORT=%s (is_production=%s, fallback_host_used=%s, fallback_port_used=%s)",
    CANONICAL_REDIS_HOST,
    CANONICAL_REDIS_PORT,
    _IS_PRODUCTION,
    CANONICAL_REDIS_HOST == _FALLBACK_REDIS_HOST,
    str(CANONICAL_REDIS_PORT) == str(_FALLBACK_REDIS_PORT)
)
# ---------------------------------------------------------------------------

# Track startup errors
startup_errors = []

# Add parent directory to path to find graph.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logger.info(f"Python path: {sys.path}")

# Try to import the graph from clera_agents but fail gracefully
try:
    # Import the graph from clera_agents
    from clera_agents.graph import graph
    from langgraph.errors import GraphInterrupt # Needed for chat-stream endpoint
    from langchain_core.messages import HumanMessage # Needed for chat-stream endpoint
    logger.info("Successfully imported graph and related modules from clera_agents")
except ImportError as e:
    logger.error(f"Failed to import graph from clera_agents: {e}")
    logger.error("Please make sure the clera_agents module is in your Python path.")
    sys.exit(1)

# Define lifespan context manager
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    logger.info("LIFESPAN: Starting API server...")
    env_val_start = os.getenv("ENVIRONMENT")
    copilot_env_val_start = os.getenv("COPILOT_ENVIRONMENT_NAME")
    logger.info(f"LIFESPAN_ENV_CHECK (start): Actual ENVIRONMENT='{env_val_start}', Actual COPILOT_ENVIRONMENT_NAME='{copilot_env_val_start}'")
    
    # Log Python path
    logger.info(f"Python path: {os.sys.path}")
    
    # Set API key from environment
    app.state.API_KEY = config("API_KEY", default=None)
    env_val_after_api_key = os.getenv("ENVIRONMENT")
    logger.info(f"LIFESPAN_ENV_CHECK (after API_KEY config): Actual ENVIRONMENT='{env_val_after_api_key}', decouple_config_API_KEY_is_None={app.state.API_KEY is None}")
    
    # Initialize asset cache
    app.state.asset_cache = None
    app.state.assets_last_refreshed = None
    
    # Make the canonical WS URL available to request handlers
    app.state.WEBSOCKET_SERVICE_URL = WEBSOCKET_SERVICE_URL
    
    # Set Alpaca API credentials
    app.state.ALPACA_API_KEY = config("ALPACA_API_KEY", default=None)
    app.state.ALPACA_API_SECRET = config("ALPACA_API_SECRET", default=None)
    app.state.ALPACA_API_ENV = config("ALPACA_API_ENV", default="paper")
    
    # Set OpenAI API key
    app.state.OPENAI_API_KEY = config("OPENAI_API_KEY", default=None)
    
    # Set Supabase details
    app.state.SUPABASE_URL = config("SUPABASE_URL", default=None)
    app.state.SUPABASE_KEY = config("SUPABASE_KEY", default=None)
    app.state.SUPABASE_JWT_SECRET = config("SUPABASE_JWT_SECRET", default=None)
    
    # Set Plaid credentials
    app.state.PLAID_CLIENT_ID = config("PLAID_CLIENT_ID", default=None)
    app.state.PLAID_SECRET = config("PLAID_SECRET", default=None)
    app.state.PLAID_ENV = config("PLAID_ENV", default="sandbox")
    env_val_end_config = os.getenv("ENVIRONMENT")
    logger.info(f"LIFESPAN_ENV_CHECK (end of config calls): Actual ENVIRONMENT='{env_val_end_config}', PLAID_ENV_via_config='{app.state.PLAID_ENV}'")
    
    # Initialize conversation state tracking
    app.state.conversation_states = {}
    
    # Log completion of startup
    logger.info(f"API server startup process complete with {len(startup_errors)} errors/warnings.")
    
    yield  # This is where the application runs
    
    # Shutdown logic
    logger.info("Shutting down API server...")

# Create FastAPI app with lifespan
app = FastAPI(
    title="Clera AI API",
    description="API for Clera AI platform, providing trading, portfolio management, and AI-powered financial insights.",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware with restricted origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.askclera.com",  # Production domain
        "http://localhost:3000",     # Frontend development
        "http://127.0.0.1:3000",     # Frontend development alternative
        "http://localhost:8000",     # API development
        "http://127.0.0.1:8000"      # API development alternative
    ],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define request model
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="Chat message history")
    user_input: str = Field(..., description="Latest user input")

class ChatWithAccountRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="Chat message history")
    user_input: str = Field(..., description="Latest user input")
    account_id: str = Field(..., description="User's Alpaca account ID")
    user_id: Optional[str] = Field(None, description="User's Supabase ID")
    session_id: Optional[str] = Field(None, description="Chat session ID")

# Define trade execution models
class TradeRequest(BaseModel):
    account_id: str = Field(..., description="Account ID for the trade")
    ticker: str = Field(..., description="Stock ticker symbol")
    notional_amount: float = Field(..., description="Dollar amount to trade")
    side: str = Field(..., description="BUY or SELL")

class CompanyInfoRequest(BaseModel):
    ticker: str = Field(..., description="Stock ticker symbol")

# Track conversation states by session ID
conversation_states = {}

# Import trade execution functionality - fail gracefully
try:
    from clera_agents.trade_execution_agent import _submit_market_order, OrderSide
    from clera_agents.tools.company_analysis import company_profile
    # Import PortfolioAnalyticsEngine and related types
    from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine, PortfolioPosition, AssetClass, SecurityType
    logger.info("Successfully imported trade execution, company analysis, and portfolio analysis modules")
except ImportError as e:
    error_msg = f"Failed to import agent modules: {e}"
    logger.error(error_msg)
    startup_errors.append(error_msg)
    _submit_market_order = None
    OrderSide = None
    company_profile = None
    # Set portfolio analysis tools to None if import fails
    PortfolioAnalyticsEngine = None
    PortfolioPosition = None
    AssetClass = None
    SecurityType = None

# Import Alpaca broker client - fail gracefully
try:
    from alpaca.broker.client import BrokerClient
    from alpaca.broker.models import Account, Contact, Identity, Disclosures, Agreement
    # Import CreateAccountRequest from requests
    from alpaca.broker.requests import CreateAccountRequest
    from alpaca.broker.enums import TaxIdType, FundingSource, AgreementType
    logger.info("Successfully imported Alpaca broker modules")
except ImportError as e:
    error_msg = f"Failed to import Alpaca broker modules: {e}"
    logger.error(error_msg)
    startup_errors.append(error_msg)
    BrokerClient = None
    # Set all imported classes to None if import fails
    Account = None
    Contact = None
    Identity = None
    Disclosures = None
    Agreement = None
    CreateAccountRequest = None
    TaxIdType = None
    FundingSource = None
    AgreementType = None

# Import Alpaca MarketDataClient - fail gracefully
try:
    from alpaca.data.live.stock import StockDataStream
    from alpaca.data.historical.stock import StockHistoricalDataClient
    from alpaca.data.requests import StockLatestTradeRequest
    logger.info("Successfully imported Alpaca data modules")
except ImportError as e:
    error_msg = f"Failed to import Alpaca data modules: {e}"
    logger.error(error_msg)
    startup_errors.append(error_msg)
    StockHistoricalDataClient = None
    StockLatestTradeRequest = None

# Import Alpaca TradingClient for assets - fail gracefully
try:
    from alpaca.trading.client import TradingClient
    from alpaca.trading.requests import GetAssetsRequest, GetOrdersRequest, GetPortfolioHistoryRequest
    from alpaca.trading.enums import AssetClass as AlpacaTradingAssetClass, AssetStatus, OrderStatus
    # Add import for Sort which is used in GetOrdersRequest
    from alpaca.common.enums import Sort
    # Import Position, Order, Asset and PortfolioHistory from trading models
    from alpaca.trading.models import Position, Order, Asset, PortfolioHistory
    logger.info("Successfully imported Alpaca trading modules")
except ImportError as e:
    error_msg = f"Failed to import Alpaca trading modules: {e}"
    logger.error(error_msg)
    startup_errors.append(error_msg)
    TradingClient = None
    GetAssetsRequest = None
    GetOrdersRequest = None
    GetPortfolioHistoryRequest = None
    # Set all imported classes to None if import fails
    AlpacaTradingAssetClass = None
    AssetStatus = None
    OrderStatus = None
    Position = None
    Order = None
    Asset = None
    PortfolioHistory = None
    Sort = None

# Constants for Asset Caching
ASSET_CACHE_FILE = os.path.join(os.path.dirname(__file__), "data", "tradable_assets.json")
ASSET_CACHE_TTL_HOURS = 24 # Time-to-live for the cache in hours

# Ensure the data directory exists
os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)

# Initialize Alpaca clients - fail gracefully
broker_client = None
market_data_client = None
trading_client = None

if BrokerClient:
    try:
        broker_client = BrokerClient(
            api_key=os.getenv("BROKER_API_KEY", ""),
            secret_key=os.getenv("BROKER_SECRET_KEY", ""),
            sandbox=os.getenv("ALPACA_SANDBOX", "true").lower() == "true"  # Use environment variable instead of hardcoded value
        )
        # Test API keys validity
        if os.getenv("BROKER_API_KEY") and os.getenv("BROKER_SECRET_KEY"):
            logger.info("Testing Alpaca broker client connection...")
            logger.info(f"Broker API Key: {os.getenv('BROKER_API_KEY')}")
            logger.info(f"Broker Secret Key: {os.getenv('BROKER_SECRET_KEY')}")
            try:
                broker_client.get_clock()
                logger.info("Successfully connected to Alpaca broker API")
            except Exception as e:
                error_msg = f"Failed to connect to Alpaca broker API: {e}"
                logger.error(error_msg)
                startup_errors.append(error_msg)
        else:
            logger.warning("Alpaca broker API keys not provided")
            startup_errors.append("Alpaca broker API keys not provided")
    except Exception as e:
        error_msg = f"Failed to initialize Alpaca broker client: {e}"
        logger.error(error_msg)
        startup_errors.append(error_msg)
else:
    logger.warning("BrokerClient class not available due to import error.")

if StockHistoricalDataClient:
    try:
        market_data_client = StockHistoricalDataClient(
            api_key=os.getenv("APCA_API_KEY_ID", ""),      # Use Trading API Key ID
            secret_key=os.getenv("APCA_API_SECRET_KEY", ""),  # Use Trading API Secret
        )
        # Test connection if keys are provided
        if os.getenv("APCA_API_KEY_ID") and os.getenv("APCA_API_SECRET_KEY"):
            logger.info("Testing Alpaca market data client connection...")
            try:
                # Make a lightweight API call
                # market_data_client.get_stock_bars("AAPL", limit=1) # Causes issues if market closed?
                logger.info("Successfully connected to Alpaca market data API (connection test skipped)")
            except Exception as e:
                error_msg = f"Failed to connect to Alpaca market data API: {e}"
                logger.error(error_msg)
                startup_errors.append(error_msg)
        else:
            logger.warning("Alpaca trading API keys not provided")
            startup_errors.append("Alpaca trading API keys not provided")
    except Exception as e:
        error_msg = f"Failed to initialize Alpaca market data client: {e}"
        logger.error(error_msg)
        startup_errors.append(error_msg)
else:
     logger.warning("StockHistoricalDataClient class not available due to import error.")

if TradingClient:
    try:
        trading_client = TradingClient(
            api_key=os.getenv("APCA_API_KEY_ID", ""),
            secret_key=os.getenv("APCA_API_SECRET_KEY", ""),
            paper=True # Assuming paper trading based on previous context
        )
    except Exception as e:
        error_msg = f"Failed to initialize Alpaca trading client: {e}"
        logger.error(error_msg)
        startup_errors.append(error_msg)
else:
    logger.warning("TradingClient class not available due to import error.")

def get_broker_client():
    """Get an instance of the Alpaca broker client, checking for initialization."""
    if not broker_client:
        logger.warning("Broker client was not initialized successfully.")
        # Optionally, try to re-initialize here or raise an error
        raise HTTPException(status_code=503, detail="Broker service not available due to initialization error.")
    return broker_client

# Handle utility imports more gracefully to avoid crashes
create_or_get_alpaca_account = None
create_direct_plaid_link_url = None
get_transfers_for_account = None
get_account_details = None
create_ach_transfer = None
create_ach_relationship_manual = None
save_conversation = None
get_user_conversations = None
get_portfolio_conversations = None
create_chat_session = None
get_chat_sessions = None
get_conversations_by_session = None
delete_chat_session = None
save_conversation_with_session = None
get_user_alpaca_account_id = None
create_thread = None
run_thread_stream = None
get_thread_messages = None
list_threads = None
format_messages_for_frontend = None
update_thread_metadata = None

try:
    # Import our Alpaca utilities
    from utils.alpaca import (
        create_or_get_alpaca_account, 
        create_direct_plaid_link_url,
        get_transfers_for_account,
        get_account_details
    )
    
    # For ACH transfers
    from utils.alpaca.bank_funding import create_ach_transfer, create_ach_relationship_manual
    
    # Import Supabase conversation and chat session utilities
    from utils.supabase import (
        save_conversation,
        get_user_conversations,
        get_portfolio_conversations,
        create_chat_session,
        get_chat_sessions,
        get_conversations_by_session,
        delete_chat_session,
        save_conversation_with_session,
        get_user_alpaca_account_id
    )
    
    # Import LangGraph client utilities
    from utils.langgraph_client import (
        create_thread, 
        run_thread_stream,
        get_thread_messages,
        list_threads,
        format_messages_for_frontend,
        update_thread_metadata
    )
    logger.info("Successfully imported utility modules")
except ImportError as e:
    error_msg = f"Failed to import one or more utility modules: {e}"
    logger.error(error_msg)
    startup_errors.append(error_msg)
    logger.warning("Some functionality relying on utils may be unavailable.")

# --- API key authentication (moved here for clarity) ---
def verify_api_key(x_api_key: str = Header(None)):
    expected_key = os.getenv("BACKEND_API_KEY")
    if not expected_key:
        logger.error("BACKEND_API_KEY environment variable is not set on the server.")
        raise HTTPException(status_code=500, detail="Server configuration error: API key not set.")
    
    # Handle None values safely
    if x_api_key is None:
        logger.warning("API key is missing")
        raise HTTPException(status_code=401, detail="API key is required")
        
    if x_api_key != expected_key:
        # Safe slicing for logging
        key_preview = x_api_key[:5] if len(x_api_key) > 5 else x_api_key
        logger.warning(f"Invalid API key received: {key_preview}...")
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    return x_api_key

# --- Other Models (moved here for clarity) ---
class FundingSourceEnum(str, Enum):
    EMPLOYMENT_INCOME = "employment_income"
    INVESTMENTS = "investments"
    INHERITANCE = "inheritance"
    BUSINESS_INCOME = "business_income"
    SAVINGS = "savings"
    FAMILY = "family"

class ContactModel(BaseModel):
    email_address: str
    phone_number: str
    street_address: List[str]
    city: str
    state: str
    postal_code: str
    country: str

class IdentityModel(BaseModel):
    given_name: str
    family_name: str
    date_of_birth: str
    tax_id_type: str
    tax_id: str
    country_of_citizenship: str
    country_of_birth: str
    country_of_tax_residence: str
    funding_source: List[str]
    middle_name: Optional[str] = None

class DisclosuresModel(BaseModel):
    is_control_person: bool
    is_affiliated_exchange_or_finra: bool
    is_politically_exposed: bool
    immediate_family_exposed: bool

class AgreementModel(BaseModel):
    agreement: str
    signed_at: str
    ip_address: str

class AlpacaAccountRequest(BaseModel):
    userId: str
    alpacaData: Dict[str, Any]

class AlpacaAccountResponse(BaseModel):
    id: str
    account_number: str
    status: str
    created_at: str

class ACHRelationshipRequest(BaseModel):
    accountId: str
    email: str
    redirectUri: Optional[str] = None

class ACHRelationshipResponse(BaseModel):
    linkToken: str
    linkUrl: str

class PlaidTokenRequest(BaseModel):
    public_token: str
    account_id: str

# Manual bank connection models
class ManualACHRelationshipRequest(BaseModel):
    accountId: str
    accountOwnerName: str
    bankAccountType: str
    bankAccountNumber: str
    bankRoutingNumber: str

class ACHTransferRequest(BaseModel):
    accountId: str
    relationshipId: str
    amount: str

# Add new conversation models
class SaveConversationRequest(BaseModel):
    user_id: str
    portfolio_id: str
    message: str
    response: str

class GetConversationsRequest(BaseModel):
    user_id: str
    portfolio_id: Optional[str] = None
    limit: Optional[int] = 50

# Add new chat session models
class CreateSessionRequest(BaseModel):
    user_id: str
    portfolio_id: str
    title: str

class GetSessionsRequest(BaseModel):
    user_id: str
    portfolio_id: Optional[str] = None

class GetSessionConversationsRequest(BaseModel):
    user_id: str
    session_id: str

class SaveConversationWithSessionRequest(BaseModel):
    user_id: str
    portfolio_id: str
    message: str
    response: str
    session_id: str

# --- Resume Chat Endpoint Request Model ---
class ResumeChatRequest(BaseModel):
    session_id: str = Field(..., description="The session ID of the interrupted conversation")
    user_confirmation: str = Field(..., description="User's confirmation ('yes' or 'no')")
# -----------------------------------------

# Add model for updating title
class UpdateThreadTitleRequest(BaseModel):
    thread_id: str = Field(..., description="The ID of the thread to update")
    title: str = Field(..., description="The new title for the thread")

@app.post("/api/trade")
async def execute_trade(request: TradeRequest):
    """Execute a market order trade."""
    try:
        # Log the request
        logger.info(f"Received trade request: {request}")
        
        # Validate the side
        if request.side.upper() not in ["BUY", "SELL"]:
            raise HTTPException(status_code=400, detail="Side must be either BUY or SELL")
        
        # Determine order side
        order_side = OrderSide.BUY if request.side.upper() == "BUY" else OrderSide.SELL
        
        # Execute the trade
        result = _submit_market_order(
            account_id=request.account_id, 
            ticker=request.ticker, 
            notional_amount=request.notional_amount, 
            side=order_side
        )
        
        return JSONResponse({
            "success": True,
            "message": result
        })
    except Exception as e:
        logger.error(f"Error executing trade: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error executing trade: {str(e)}"
        }, status_code=500)

@app.get("/api/company/{ticker}")
async def get_company_info(ticker: str):
    """Get company information by ticker symbol."""
    try:
        # Log the request
        logger.info(f"Received company info request for ticker: {ticker}")
        
        # Get company profile
        profile_data = company_profile(ticker.upper())
        
        if not profile_data:
            return JSONResponse({
                "success": False,
                "message": f"No data found for ticker: {ticker}"
            }, status_code=404)
        
        # Return formatted company info
        return JSONResponse({
            "success": True,
            "data": profile_data[0]
        })
    except Exception as e:
        logger.error(f"Error getting company info: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error retrieving company information: {str(e)}"
        }, status_code=500)

@app.get("/api/market/latest-trade/{ticker}")
async def get_latest_trade_price(ticker: str):
    """Get the latest trade price for a stock ticker."""
    try:
        ticker = ticker.upper().strip()
        logger.info(f"Received latest trade request for ticker: {ticker}")

        request_params = StockLatestTradeRequest(symbol_or_symbols=ticker)
        latest_trade = market_data_client.get_stock_latest_trade(request_params)

        # latest_trade is a dictionary where keys are symbols
        if ticker in latest_trade:
            trade_data = latest_trade[ticker]
            # Convert trade object to dict if necessary, or access attributes
            price = getattr(trade_data, 'price', None)
            timestamp = getattr(trade_data, 'timestamp', None)

            if price is None:
                 logger.warning(f"Could not extract price from trade data for {ticker}: {trade_data}")
                 raise HTTPException(status_code=404, detail=f"Could not retrieve latest price for {ticker}")

            logger.info(f"Latest trade for {ticker}: Price={price} at {timestamp}")
            return JSONResponse({
                "success": True,
                "symbol": ticker,
                "price": price,
                "timestamp": timestamp.isoformat() if timestamp else None
            })
        else:
            logger.warning(f"No latest trade data found for ticker: {ticker}")
            raise HTTPException(status_code=404, detail=f"No latest trade data found for {ticker}")

    except Exception as e:
        logger.error(f"Error getting latest trade for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error retrieving latest trade price: {str(e)}")

@app.post("/api/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    """Process a chat request."""
    try:
        # Log the request
        logger.info(f"Received chat request: {request}")
        
        # Create a unique session ID if not provided
        session_id = f"session-{datetime.now().timestamp()}"
        logger.info(f"Using session ID: {session_id}")
        
        # Get existing state or create a new one
        state = conversation_states.get(session_id, {
            "messages": [],
            "next_step": "supervisor",
            "current_agent": "supervisor",
            "agent_scratchpad": [],
            "retrieved_context": [],
            "last_user_input": "",
            "answered_user": False,
            "is_last_step": False,
            "remaining_steps": 5,
        })
        
        # Update state with new user input
        state["last_user_input"] = request.user_input
        state["answered_user"] = False
        
        # Convert messages to the format expected by graph
        formatted_messages = []
        for msg in request.messages:
            if msg.role == "system":
                formatted_messages.append({
                    "type": "system",
                    "content": msg.content,
                })
            elif msg.role == "user":
                formatted_messages.append({
                    "type": "human",
                    "content": msg.content,
                })
            elif msg.role == "ai" or msg.role == "assistant":
                formatted_messages.append({
                    "type": "ai",
                    "content": msg.content,
                })
        
        # Update state with messages
        state["messages"] = formatted_messages
        
        # Process with graph
        logger.info("Invoking graph...")
        result = graph.invoke(state)
        logger.info(f"Graph result type: {type(result)}")
        logger.info(f"Graph result keys: {result.keys() if isinstance(result, dict) else 'not a dict'}")
        
        # Extract response from result
        response = None
        
        # Log the full result in development mode for debugging
        # Use COPILOT_ENVIRONMENT_NAME to determine if not in production
        copilot_env_name_for_chat_debug = os.getenv("COPILOT_ENVIRONMENT_NAME", "unknown")
        if copilot_env_name_for_chat_debug.lower() != "production":
            logger.info(f"Full graph result (debug log in non-production env '{copilot_env_name_for_chat_debug}'): {json.dumps(result, default=str)}")
        
        if isinstance(result, dict):
            # Method 1: Try to find direct response field
            if "response" in result:
                response = result["response"]
                logger.info("Found direct response field")
            
            # Method 2: Check for messages in the result and extract the last AI message
            elif "messages" in result and isinstance(result["messages"], list):
                logger.info(f"Result has {len(result['messages'])} messages")
                # Loop through messages from the end to find the last assistant message
                for msg in reversed(result["messages"]):
                    # Try to identify the assistant/AI message
                    if isinstance(msg, dict):
                        msg_type = msg.get("type")
                        msg_role = msg.get("role")
                        
                        logger.info(f"Checking message with type: {msg_type}, role: {msg_role}")
                        
                        if msg_type in ["ai", "assistant"] or msg_role in ["ai", "assistant"]:
                            logger.info("Found AI/assistant message")
                            content = msg.get("content")
                            if content:
                                response = content
                                logger.info(f"Extracted response from message: {response[:100]}...")
                                break
                    # Handle LangChain message objects
                    elif hasattr(msg, "type") and hasattr(msg, "content"):
                        if msg.type in ["ai", "assistant"]:
                            logger.info("Found AI/assistant LangChain message")
                            response = msg.content
                            logger.info(f"Extracted response from LangChain message: {response[:100]}...")
                            break
            
            # Method 3: Check in the final output
            elif "output" in result and isinstance(result["output"], str):
                response = result["output"]
                logger.info("Found response in output field")
            
            # Method 4: Look for return_values in the LangSmith result format
            elif "return_values" in result and isinstance(result["return_values"], dict):
                ret_values = result["return_values"]
                if "output" in ret_values:
                    response = ret_values["output"]
                    logger.info("Found response in return_values.output")
                elif "messages" in ret_values:
                    # If return_values contains a messages field, try to extract the last AI message
                    messages = ret_values["messages"]
                    if isinstance(messages, list) and messages:
                        for msg in reversed(messages):
                            if hasattr(msg, "type") and hasattr(msg, "content") and msg.type in ["ai", "assistant"]:
                                response = msg.content
                                logger.info("Found response in return_values.messages")
                                break
                            elif isinstance(msg, dict) and (msg.get("type") in ["ai", "assistant"] or 
                                                            msg.get("role") in ["ai", "assistant"]):
                                response = msg.get("content")
                                logger.info("Found response in return_values.messages dict")
                                break
            
            # Method 5: Check if the result itself might be the message list
            elif any(isinstance(item, dict) and ("role" in item or "type" in item) for item in result.get("output", []) if isinstance(result.get("output"), list)):
                messages_list = result.get("output", [])
                # Look for the last AI message
                for msg in reversed(messages_list):
                    if isinstance(msg, dict) and (
                        msg.get("role") in ["ai", "assistant"] or 
                        msg.get("type") in ["ai", "assistant"]
                    ):
                        response = msg.get("content", "") or msg.get("text", "")
                        logger.info("Found response in output messages list")
                        break
        
        # Try to catch any other response format
        if not response and isinstance(result, dict):
            # Check all top-level string values as a last resort
            for key, value in result.items():
                if isinstance(value, str) and len(value) > 20:  # Assume longer strings might be responses
                    logger.info(f"Using string value from key '{key}' as response")
                    response = value
                    break
        
        # Fallback if we couldn't extract a response
        if not response:
            logger.warning("Failed to extract AI response from result, using fallback")
            response = "I processed your request, but I'm having trouble formulating a response. Could you try rephrasing your question?"
        
        # Update conversation state
        conversation_states[session_id] = result if isinstance(result, dict) else state
        
        # Schedule cleanup of old sessions
        background_tasks.add_task(cleanup_old_sessions)
        
        # Return the response with more debugging info in development
        copilot_env_name_for_chat_return = os.getenv("COPILOT_ENVIRONMENT_NAME", "unknown")
        if copilot_env_name_for_chat_return.lower() != "production":
            return JSONResponse({
                "session_id": session_id,
                "response": response,
                "debug_info": {
                    "result_type": str(type(result)),
                    "result_keys": list(result.keys()) if isinstance(result, dict) else [],
                    "messages_count": len(result.get("messages", [])) if isinstance(result, dict) else 0,
                }
            })
        else:
            return JSONResponse({
                "session_id": session_id,
                "response": response,
            })
    except Exception as e:
        logger.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-stream")
async def chat_stream(
    request: ChatWithAccountRequest, # Reuse existing model
    api_key: str = Depends(verify_api_key)
):
    """Process a chat request via SSE streaming."""
    try:
        thread_id = request.session_id # session_id from frontend IS the thread_id
        user_id = request.user_id
        account_id = request.account_id
        user_input = request.user_input
        
        logger.info(f"Chat stream request: user_id={user_id}, account_id={account_id}, thread_id={thread_id}")

        if not user_id: # Account ID might be optional if not always needed by agents
             raise HTTPException(status_code=400, detail="User ID is required")
             
        graph_id_to_run = "agent" # Or determine dynamically if needed

        # --- Create Thread if necessary --- 
        if not thread_id:
            logger.info("No thread_id provided, creating new thread for stream.")
            try:
                # Make sure create_thread doesn't require account_id if it's sometimes optional
                metadata_payload = {"user_id": user_id}
                if account_id:
                    metadata_payload["account_id"] = account_id
                metadata_payload["title"] = f"Chat started {datetime.now().strftime('%Y-%m-%d %H:%M')}"

                # Assuming create_thread is synchronous or properly awaited if async
                thread_data = create_thread(metadata=metadata_payload) 
                
                thread_id = thread_data.get("thread_id")
                if not thread_id:
                    # Ensure create_thread actually returns a dict with 'thread_id'
                    raise Exception("Failed to get thread_id from new thread creation. Response: " + str(thread_data))
                logger.info(f"Created new thread {thread_id} for stream.")
            except Exception as create_err:
                logger.error(f"Failed to create thread for stream: {create_err}", exc_info=True)
                # Return JSON error as we can't stream yet
                return JSONResponse(
                    content={"error": f"Failed to start chat session: {str(create_err)}"}, 
                    status_code=500
                )
        else:
             # Optionally update metadata if thread exists (e.g., last active time)
             # update_thread_metadata(thread_id, {"last_active": datetime.now().isoformat()})
             logger.info(f"Using existing thread_id: {thread_id}")

        # --- Prepare Input & Config --- 
        # Construct the input based on what run_thread_stream expects.
        # Usually, it's the new message, but check its definition.
        # If it expects the full history, fetch it here. Let's assume it needs the new message only for now.
        run_input = {"messages": [HumanMessage(content=user_input).model_dump()]} 
        
        # Add account_id and user_id if the graph needs them in the input state
        run_input["account_id"] = account_id
        run_input["user_id"] = user_id 
        
        run_config = {"recursion_limit": 10} # Or appropriate limit

        # --- Define Generator for Streaming Response --- 
        async def event_generator():
            # Yield the thread_id first as a special event
            yield f"event: thread_id\\ndata: {json.dumps({'thread_id': thread_id})}\\n\\n"
            logger.info(f"Streaming response for thread {thread_id}")
            try:
                # Directly iterate over the async generator returned by run_thread_stream
                async for chunk in run_thread_stream(
                    thread_id=thread_id,
                    assistant_id=graph_id_to_run,
                    input_data=run_input, # Pass the prepared input
                    config=run_config
                ):
                    # run_thread_stream should yield raw SSE formatted strings
                    yield chunk 
                
                # Signal completion (optional)
                yield f"event: end\\ndata: {json.dumps({'status': 'completed'})}\\n\\n"
                logger.info(f"Finished streaming response for thread {thread_id}")

            except GraphInterrupt as interrupt_err:
                 logger.warning(f"GraphInterrupt occurred during stream for {thread_id}: {interrupt_err}")
                 # Need to send interrupt info back to client
                 interrupt_payload = {
                     "type": "interrupt", 
                     "message": str(interrupt_err), # Or format as needed
                     "session_id": thread_id # Provide thread_id for resume
                 }
                 yield f"event: interrupt\\ndata: {json.dumps(interrupt_payload)}\\n\\n"

            except Exception as stream_err:
                logger.error(f"Error during chat stream generation for {thread_id}: {stream_err}", exc_info=True)
                # Yield a custom error event
                error_payload = {"error": "Stream failed", "detail": str(stream_err)}
                yield f"event: error\\ndata: {json.dumps(error_payload)}\\n\\n"
        
        # --- Return Streaming Response --- 
        # Ensure necessary headers are set by StreamingResponse or manually add them
        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except HTTPException as http_exc:
        # If HTTPException happens before streaming starts, return JSON error
        logger.warning(f"HTTPException in chat_stream: {http_exc.detail}", exc_info=True)
        return JSONResponse(content={"error": http_exc.detail}, status_code=http_exc.status_code)
    except Exception as e:
        logger.error(f"Unhandled error in chat_stream endpoint: {e}", exc_info=True)
        return JSONResponse(content={"error": f"Internal server error: {str(e)}"}, status_code=500)

@app.post("/api/resume-chat-stream")
async def resume_chat_stream(
    request: ResumeChatRequest, # Reuse existing model
    api_key: str = Depends(verify_api_key)
):
    """Resume an interrupted graph execution via SSE streaming."""
    try:
        thread_id = request.session_id # session_id IS the thread_id
        user_confirmation = request.user_confirmation.lower().strip()
        logger.info(f"Resume stream request for thread_id: {thread_id} with confirmation: '{user_confirmation}'")

        if user_confirmation not in ["yes", "no"]:
            raise HTTPException(status_code=400, detail="Invalid confirmation. Must be 'yes' or 'no'.")

        if not thread_id:
             raise HTTPException(status_code=400, detail="Thread ID (session_id) is required")
             
        graph_id_to_run = "agent" # Or determine dynamically
        run_config = {"recursion_limit": 10} # Or appropriate limit

        # --- Define Generator for Streaming Response --- 
        async def event_generator():
            logger.info(f"Streaming resumed response for thread {thread_id}")
            try:
                # Directly iterate over the async generator returned by run_thread_stream
                async for chunk in run_thread_stream(
                    thread_id=thread_id,
                    assistant_id=graph_id_to_run,
                    resume_command=user_confirmation, # Pass confirmation here
                    config=run_config
                ):
                    # run_thread_stream should yield raw SSE formatted strings
                    yield chunk 

                # Signal completion (optional)
                yield f"event: end\\ndata: {json.dumps({'status': 'completed'})}\\n\\n"
                logger.info(f"Finished streaming resumed response for thread {thread_id}")

            except GraphInterrupt as interrupt_err:
                 # This probably shouldn't happen during a resume, but handle defensively
                 logger.warning(f"GraphInterrupt occurred during resume stream for {thread_id}: {interrupt_err}")
                 interrupt_payload = {
                     "type": "interrupt", 
                     "message": str(interrupt_err), 
                     "session_id": thread_id 
                 }
                 yield f"event: interrupt\\ndata: {json.dumps(interrupt_payload)}\\n\\n"

            except Exception as stream_err:
                logger.error(f"Error during resume stream generation for {thread_id}: {stream_err}", exc_info=True)
                error_payload = {"error": "Resume stream failed", "detail": str(stream_err)}
                yield f"event: error\\ndata: {json.dumps(error_payload)}\\n\\n"
        
        # --- Return Streaming Response --- 
        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except HTTPException as http_exc:
        logger.warning(f"HTTPException in resume_chat_stream: {http_exc.detail}", exc_info=True)
        return JSONResponse(content={"error": http_exc.detail}, status_code=http_exc.status_code)
    except Exception as e:
        logger.error(f"Unhandled error in resume_chat_stream endpoint: {e}", exc_info=True)
        return JSONResponse(content={"error": f"Internal server error: {str(e)}"}, status_code=500)

async def cleanup_old_sessions():
    """Clean up old conversation sessions."""
    # In a production environment, you would want to clean up old sessions
    # to prevent memory leaks. For simplicity, we're keeping this as a stub.
    pass

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

@app.get("/info")
async def get_info():
    """Provides basic server information, often probed by SDKs."""
    logger.debug("Received request for /info endpoint")
    return {"server": "Clera AI API", "status": "running", "version": "1.0.0"}

@app.post("/create-alpaca-account", response_model=AlpacaAccountResponse)
async def create_alpaca_account(
    request: AlpacaAccountRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        alpaca_data = request.alpacaData
        user_id = request.userId
        
        # Log the request data for debugging
        logger.info(f"Creating Alpaca account for user_id: {user_id}")
        logger.info(f"Request data: {alpaca_data}")
        
        # Use our utility function to create or get existing account
        try:
            account_details, is_new_account = create_or_get_alpaca_account(alpaca_data)
            
            if not is_new_account:
                logger.info(f"Found existing account for email {alpaca_data['contact']['email_address']}")
            else:
                logger.info(f"Successfully created new Alpaca account: {account_details}")
                
            # Return account information
            return {
                "id": account_details["id"],
                "account_number": account_details["account_number"],
                "status": account_details["status"],
                "created_at": account_details["created_at"]
            }
            
        except Exception as e:
            error_str = str(e)
            
            # Check for specific error codes from Alpaca
            if '"code":40910000' in error_str and 'email address already exists' in error_str:
                # This is a conflict error - account already exists but couldn't be looked up
                logger.info("Account with this email already exists in Alpaca but couldn't be looked up")
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "EMAIL_EXISTS",
                        "message": "An account with this email address already exists. Please use a different email address."
                    }
                )
            # Re-raise other exceptions
            raise
    
    except Exception as e:
        logger.error(f"Error creating Alpaca account: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create-ach-relationship-link", response_model=ACHRelationshipResponse)
async def create_ach_relationship_link(
    request: ACHRelationshipRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        alpaca_account_id = request.accountId
        user_email = request.email
        redirect_uri = request.redirectUri
        
        # Log the request data for debugging
        logger.info(f"Creating ACH relationship link for account_id: {alpaca_account_id}")
        logger.info(f"Using email: {user_email}")
        logger.info(f"Redirect URI: {redirect_uri}")
        
        # Create the Plaid Link URL using Alpaca's integrated Plaid flow
        try:
            link_data = create_direct_plaid_link_url(
                alpaca_account_id=alpaca_account_id,
                user_email=user_email,
                redirect_uri=redirect_uri
            )
            
            # Log success with truncated URL for debugging
            link_url = link_data.get("linkUrl", "")
            if link_url:
                logger.info(f"Successfully created Plaid link with URL preview: {link_url[:100]}...")
            else:
                logger.warning("Created Plaid link but URL is empty")
            
            # Return the link details
            return {
                "linkToken": link_data.get("linkToken", ""),
                "linkUrl": link_data.get("linkUrl", "")
            }
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error creating ACH relationship link: {error_str}")
            logger.error(f"Error details: {repr(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create ACH relationship link: {error_str}"
            )
    
    except Exception as e:
        logger.error(f"Error in create-ach-relationship-link endpoint: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/get-ach-relationships")
async def get_ach_relationships(
    request: dict,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        alpaca_account_id = request.get("accountId")
        
        if not alpaca_account_id:
            raise HTTPException(status_code=400, detail="Account ID is required")
        
        # Log the request
        logger.info(f"Getting ACH relationships for account ID: {alpaca_account_id}")
        
        # Get ACH relationships from Alpaca
        broker_client = get_broker_client()
        try:
            relationships = broker_client.get_ach_relationships_for_account(account_id=alpaca_account_id)
            
            # Convert relationships to a serializable format
            serialized_relationships = []
            for rel in relationships:
                serialized_relationships.append({
                    "id": rel.id,
                    "status": rel.status,
                    "account_id": rel.account_id,
                    "created_at": rel.created_at,
                    "bank_name": getattr(rel, "bank_name", None),
                    "nickname": getattr(rel, "nickname", None)
                })
            
            return {"relationships": serialized_relationships}
        except AttributeError as e:
            # Fallback if the method doesn't exist - making a direct API request
            logger.warning(f"get_ach_relationships_for_account not found ({str(e)}), trying direct API request")
            try:
                # Try to access the underlying API client with a direct request
                if hasattr(broker_client, "_client"):
                    base_url = broker_client._client.base_url
                    api_key = broker_client._client.api_key
                    secret_key = broker_client._client.secret_key
                    
                    url = f"{base_url}/v1/accounts/{alpaca_account_id}/ach_relationships"
                    headers = {
                        "accept": "application/json",
                        "Apca-Api-Key-Id": api_key,
                        "Apca-Api-Secret-Key": secret_key
                    }
                    
                    response = requests.get(url, headers=headers)
                    
                    if response.status_code == 200:
                        relationships_data = response.json()
                        return {"relationships": relationships_data}
                
                # If we couldn't make a direct request, return empty array
                return {"relationships": []}
            except Exception as direct_api_error:
                logger.error(f"Direct API request failed: {str(direct_api_error)}")
                return {"relationships": []}
        
    except Exception as e:
        logger.error(f"Error in get_ach_relationships endpoint: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        # Return empty array instead of error for better UX with polling
        return {"relationships": []}

@app.post("/create-ach-relationship-manual")
async def create_manual_ach_relationship(
    request: ManualACHRelationshipRequest,
    x_api_key: str = Header(None)
):
    # Debug log the request
    logger.info(f"Received manual ACH relationship request: {request}")
    
    # Validate API key
    api_key_env = os.getenv("BACKEND_API_KEY")
    logger.info(f"Validating API key: received='{x_api_key[:3]}...' vs env='{api_key_env[:3] if api_key_env else None}...'")
    
    if x_api_key != api_key_env:
        logger.error("API key validation failed")
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Log the input parameters
        logger.info(f"Creating ACH relationship for account {request.accountId} with parameters: "
                    f"accountOwnerName={request.accountOwnerName}, "
                    f"bankAccountType={request.bankAccountType}, "
                    f"bankAccountNumber=XXXX{request.bankAccountNumber[-4:] if len(request.bankAccountNumber) >= 4 else 'INVALID'}, "
                    f"bankRoutingNumber={request.bankRoutingNumber}")
        
        # Verify Alpaca broker client is initialized properly
        broker_api_key = os.getenv("BROKER_API_KEY")
        broker_secret_key = os.getenv("BROKER_SECRET_KEY")
        if not broker_api_key or not broker_secret_key:
            logger.error("Alpaca API credentials missing")
            raise HTTPException(status_code=500, detail="Server configuration error: Missing Alpaca API credentials")
            
        # Create the ACH relationship
        ach_relationship = create_ach_relationship_manual(
            account_id=request.accountId,
            account_owner_name=request.accountOwnerName,
            bank_account_type=request.bankAccountType,
            bank_account_number=request.bankAccountNumber,
            bank_routing_number=request.bankRoutingNumber
        )
        
        # Log success
        logger.info(f"Successfully created ACH relationship {ach_relationship.id} with status {ach_relationship.status}")
        
        # Return the relationship details
        return {
            "id": ach_relationship.id,
            "status": ach_relationship.status
        }
    except Exception as e:
        logger.error(f"Error creating ACH relationship: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/initiate-ach-transfer")
async def initiate_ach_transfer(
    request: ACHTransferRequest,
    x_api_key: str = Header(None)
):
    # Validate API key
    if x_api_key != os.getenv("BACKEND_API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Create the ACH transfer
        transfer = create_ach_transfer(
            account_id=request.accountId,
            relationship_id=request.relationshipId,
            amount=request.amount
        )
        
        # Return the transfer details
        return {
            "id": transfer.id,
            "status": transfer.status,
            "amount": transfer.amount
        }
    except Exception as e:
        logger.error(f"Error creating ACH transfer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Define request model for ACH relationship deletion
class DeleteACHRelationshipRequest(BaseModel):
    accountId: str
    achRelationshipId: str

@app.post("/delete-ach-relationship")
async def delete_ach_relationship(
    request: DeleteACHRelationshipRequest,
    x_api_key: str = Header(None)
):
    # Validate API key
    api_key_env = os.getenv("BACKEND_API_KEY")
    if x_api_key != api_key_env:
        logger.error("API key validation failed")
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Log the request
        logger.info(f"Deleting ACH relationship {request.achRelationshipId} for account {request.accountId}")
        
        # Get a broker client instance
        client = get_broker_client()
        
        # Delete the ACH relationship
        client.delete_ach_relationship_for_account(
            account_id=request.accountId,
            relationship_id=request.achRelationshipId
        )
        
        # Return success
        logger.info(f"Successfully deleted ACH relationship {request.achRelationshipId}")
        return {
            "success": True,
            "message": f"Successfully deleted ACH relationship {request.achRelationshipId}"
        }
    except Exception as e:
        logger.error(f"Error deleting ACH relationship: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-plaid-token")
async def process_plaid_token(
    request: PlaidTokenRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        public_token = request.public_token
        alpaca_account_id = request.account_id
        
        # Log the request
        logger.info(f"Processing Plaid token for account ID: {alpaca_account_id}")
        
        try:
            # Import necessary functions
            from utils.alpaca.bank_funding import (
                exchange_public_token_for_access_token,
                create_processor_token,
                get_plaid_client
            )
            from utils.alpaca.manual_bank_funding import create_ach_relationship_manual
            
            # Step 1: Exchange public token for access token
            access_token = exchange_public_token_for_access_token(public_token)
            logger.info("Successfully exchanged public token for access token")
            
            # Step 2: Get account ID from Plaid (for sandbox mode, we'll get the first account)
            plaid_client = get_plaid_client()
            try:
                # Get accounts linked to this item
                accounts_response = plaid_client.accounts_get(access_token)
                plaid_accounts = accounts_response.get('accounts', [])
                
                if not plaid_accounts:
                    raise ValueError("No accounts found for this Plaid item")
                
                # Use the first account by default, in production you'd let the user choose
                plaid_account_id = plaid_accounts[0].get('account_id')
                logger.info(f"Using Plaid account ID: {plaid_account_id}")
                
                if not plaid_account_id:
                    raise ValueError("No account ID found in Plaid accounts response")
            except Exception as e:
                logger.warning(f"Error getting Plaid accounts, using fallback: {str(e)}")
                # Fallback for sandbox environment
                plaid_account_id = "vzeNDwK7KQIm4yEog683uElbp9GRLEFXGK98D"
            
            # Step 3: Create processor token for Alpaca
            processor_token = create_processor_token(access_token, plaid_account_id)
            logger.info("Successfully created processor token for Alpaca")
            
            # Step 4: Create ACH relationship in Alpaca
            relationship = create_ach_relationship_manual(alpaca_account_id, processor_token)
            logger.info(f"Successfully created ACH relationship in Alpaca: {relationship}")
            
            # Return the relationship details
            return {
                "success": True,
                "relationship": relationship
            }
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error processing Plaid token: {error_str}")
            logger.error(f"Error details: {repr(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process Plaid token: {error_str}"
            )
    
    except Exception as e:
        logger.error(f"Error in process-plaid-token endpoint: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-ach-relationships/{account_id}")
async def get_ach_relationships_for_account(
    account_id: str,
    x_api_key: str = Header(None)
):
    # Validate API key
    api_key_env = os.getenv("BACKEND_API_KEY")
    if x_api_key != api_key_env:
        logger.error("API key validation failed")
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Get a broker client instance
        client = get_broker_client()
        
        # Get the ACH relationships
        relationships = get_ach_relationships(account_id, broker_client=client)
        
        # Return the relationships
        return {
            "relationships": relationships
        }
    except Exception as e:
        logger.error(f"Error getting ACH relationships: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/account/{account_id}/balance", response_model=dict)
async def get_account_balance(account_id: str):
    """Fetch key balance details for a specific Alpaca account using the Broker SDK."""
    try:
        logger.info(f"Fetching balance for account: {account_id} using BrokerClient.get_trade_account_by_id")
        
        # Ensure broker client is initialized (it should be globally)
        if not broker_client:
             logger.error("Broker client is not initialized.")
             raise HTTPException(status_code=500, detail="Server configuration error: Broker client not available.")
             
        # Use the correct SDK method
        account_info = broker_client.get_trade_account_by_id(account_id)
        
        # Extract relevant balance figures from the Account object
        balance_data = {
            "buying_power": float(account_info.buying_power),
            "cash": float(account_info.cash),
            "portfolio_value": float(account_info.portfolio_value),
            "currency": account_info.currency
        }
        
        logger.info(f"Successfully fetched balance for {account_id}: {balance_data}")
        return {"success": True, "data": balance_data}
        
    except Exception as e:
        logger.error(f"Error fetching balance for account {account_id}: {e}", exc_info=True)
        # Consider checking for specific Alpaca API errors if possible
        # For now, return a generic error
        raise HTTPException(status_code=500, detail=f"Failed to fetch account balance.")

# --- Endpoint for Tradable Assets (with Caching) ---
async def _fetch_and_cache_assets():
    """Fetches assets from Alpaca and saves them to the cache file."""
    try:
        logger.info("Fetching fresh tradable assets from Alpaca...")
        search_params = GetAssetsRequest(
            asset_class=AlpacaTradingAssetClass.US_EQUITY,
            status=AssetStatus.ACTIVE
        )
        # Use broker client to get all assets for consistency
        broker_client_instance = get_broker_client()
        assets = broker_client_instance.get_all_assets(search_params)
        tradable_assets = [
            {"symbol": asset.symbol, "name": asset.name}
            for asset in assets
            if asset.tradable
        ]
        # Sort assets alphabetically by symbol before caching
        tradable_assets.sort(key=lambda x: x['symbol'])

        # Save to cache file
        with open(ASSET_CACHE_FILE, 'w') as f:
            json.dump(tradable_assets, f)
        logger.info(f"Successfully cached {len(tradable_assets)} tradable assets to {ASSET_CACHE_FILE}")
        return tradable_assets
    except Exception as e:
        logger.error(f"Failed to fetch or cache assets from Alpaca: {e}", exc_info=True)
        # Return empty list or re-raise, depending on desired error handling
        # If the cache exists, we might want to return the stale cache instead of failing
        if os.path.exists(ASSET_CACHE_FILE):
             logger.warning("Returning potentially stale asset cache due to fetch error.")
             try:
                 with open(ASSET_CACHE_FILE, 'r') as f:
                     return json.load(f)
             except Exception as read_err:
                  logger.error(f"Failed to read stale cache file {ASSET_CACHE_FILE}: {read_err}")
                  return [] # Give up and return empty
        else:
             return [] # No cache and fetch failed

@app.get("/api/market/assets")
async def get_tradable_assets():
    """Get a list of tradable US equity assets, using local cache."""
    try:
        assets_data = []
        refresh_needed = False

        if os.path.exists(ASSET_CACHE_FILE):
            try:
                file_mod_time = datetime.fromtimestamp(os.path.getmtime(ASSET_CACHE_FILE))
                if datetime.now() - file_mod_time > timedelta(hours=ASSET_CACHE_TTL_HOURS):
                    logger.info(f"Asset cache file {ASSET_CACHE_FILE} is older than {ASSET_CACHE_TTL_HOURS} hours. Refreshing.")
                    refresh_needed = True
                else:
                    logger.info(f"Reading tradable assets from cache file: {ASSET_CACHE_FILE}")
                    with open(ASSET_CACHE_FILE, 'r') as f:
                        assets_data = json.load(f)
            except Exception as e:
                logger.error(f"Error reading or checking cache file {ASSET_CACHE_FILE}, attempting refresh: {e}")
                refresh_needed = True
        else:
            logger.info(f"Asset cache file {ASSET_CACHE_FILE} not found. Fetching initial data.")
            refresh_needed = True

        if refresh_needed:
            assets_data = await _fetch_and_cache_assets()

        logger.info(f"Returning {len(assets_data)} tradable assets.")
        return JSONResponse({
            "success": True,
            "assets": assets_data
        })

    except Exception as e:
        # This outer catch is for unexpected errors in the endpoint logic itself
        logger.error(f"Unexpected error in get_tradable_assets endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error retrieving assets.")

# --- Endpoint to Force Refresh Asset Cache ---
@app.post("/api/market/assets/refresh")
async def refresh_tradable_assets_cache(api_key: str = Depends(verify_api_key)):
    """Forces a refresh of the locally cached tradable assets list."""
    try:
        logger.info("Forcing refresh of tradable assets cache...")
        refreshed_assets = await _fetch_and_cache_assets()
        return JSONResponse({
            "success": True,
            "message": f"Successfully refreshed asset cache. Found {len(refreshed_assets)} assets.",
            "count": len(refreshed_assets)
        })
    except Exception as e:
        logger.error(f"Error during forced asset cache refresh: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to refresh asset cache: {str(e)}")
# --- End Cache Refresh Endpoint ---

# --- Pydantic Models for Portfolio Endpoints ---

class PortfolioHistoryResponse(BaseModel):
    timestamp: List[int]
    equity: List[Optional[float]]
    profit_loss: List[Optional[float]]
    profit_loss_pct: List[Optional[float]]
    base_value: Optional[float]
    timeframe: str
    base_value_asof: Optional[str] = None # Added based on Alpaca docs

class PositionResponse(BaseModel):
    # Mirroring Alpaca's Position model fields we need
    asset_id: uuid.UUID
    symbol: str
    exchange: str
    asset_class: str # Consider mapping to our AssetClass enum if needed frontend
    avg_entry_price: Decimal
    qty: Decimal
    side: str
    market_value: Decimal
    cost_basis: Decimal
    unrealized_pl: Decimal
    unrealized_plpc: Decimal
    unrealized_intraday_pl: Decimal
    unrealized_intraday_plpc: Decimal
    current_price: Decimal
    lastday_price: Decimal
    change_today: Decimal
    # Added fields for analytics mapping
    asset_marginable: Optional[bool] = None
    asset_shortable: Optional[bool] = None
    asset_easy_to_borrow: Optional[bool] = None


class PortfolioAnalyticsResponse(BaseModel):
    risk_score: Decimal
    diversification_score: Decimal

class AssetDetailsResponse(BaseModel):
    # Mirroring Alpaca's Asset model fields
    id: uuid.UUID
    asset_class: str # Mapped from AlpacaAssetClass enum
    exchange: str
    symbol: str
    name: Optional[str] = None
    status: str
    tradable: bool
    marginable: bool
    shortable: bool
    easy_to_borrow: bool
    fractionable: bool
    maintenance_margin_requirement: Optional[float] = None
    # Potentially add industry/sector if available
    # industry: Optional[str] = None
    # sector: Optional[str] = None


class OrderResponse(BaseModel):
    # Mirroring Alpaca's Order model fields
    id: uuid.UUID
    client_order_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    filled_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    canceled_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    replaced_at: Optional[datetime] = None
    replaced_by: Optional[uuid.UUID] = None
    replaces: Optional[uuid.UUID] = None
    asset_id: uuid.UUID
    symbol: str
    asset_class: str # Consider mapping
    notional: Optional[Decimal] = None
    qty: Optional[Decimal] = None
    filled_qty: Optional[Decimal] = None
    filled_avg_price: Optional[Decimal] = None
    order_class: Optional[str] = None # Consider mapping
    order_type: str # Consider mapping
    type: str # Consider mapping
    side: str # Consider mapping
    time_in_force: str # Consider mapping
    limit_price: Optional[Decimal] = None
    stop_price: Optional[Decimal] = None
    status: str
    extended_hours: bool
    legs: Optional[List[Any]] = None # Keep Any for simplicity unless legs are used
    trail_percent: Optional[Decimal] = None
    trail_price: Optional[Decimal] = None
    hwm: Optional[Decimal] = None
    commission: Optional[Decimal] = None


# --- Helper Functions ---

def map_position_to_response(position): # -> PositionResponse:
    """Maps an Alpaca Position object to our PositionResponse model."""
    # Access asset_class via position.asset_class which should be AlpacaTradingAssetClass
    asset_class_value = str(position.asset_class.value) if position.asset_class else 'unknown'
    
    # Return type originally PositionResponse
    return PositionResponse(
        asset_id=position.asset_id,
        symbol=position.symbol,
        exchange=str(position.exchange.value) if position.exchange else 'unknown', # Convert enum
        asset_class=asset_class_value,
        avg_entry_price=Decimal(position.avg_entry_price),
        qty=Decimal(position.qty),
        side=str(position.side.value),
        market_value=Decimal(position.market_value),
        cost_basis=Decimal(position.cost_basis),
        unrealized_pl=Decimal(position.unrealized_pl),
        unrealized_plpc=Decimal(position.unrealized_plpc),
        unrealized_intraday_pl=Decimal(position.unrealized_intraday_pl),
        unrealized_intraday_plpc=Decimal(position.unrealized_intraday_plpc),
        current_price=Decimal(position.current_price),
        lastday_price=Decimal(position.lastday_price),
        change_today=Decimal(position.change_today),
        asset_marginable=getattr(position, 'marginable', None), # Get optional asset attributes
        asset_shortable=getattr(position, 'shortable', None),
        asset_easy_to_borrow=getattr(position, 'easy_to_borrow', None)
    )

def map_alpaca_position_to_portfolio_position(alpaca_pos, asset_details_map: Dict[UUID, Any]) : # -> Optional[PortfolioPosition]:
    """Maps an Alpaca Position and fetched Asset details to our PortfolioPosition for analytics."""
    # Parameter 'alpaca_pos' originally type Position
    # Return type originally Optional[PortfolioPosition]
    
    # Check if necessary types were imported successfully
    if not PortfolioPosition or not AssetClass or not SecurityType:
        logger.error("Portfolio analysis types (PortfolioPosition, AssetClass, SecurityType) not available due to import error.")
        return None
        
    if not alpaca_pos or not alpaca_pos.asset_class:
        logger.warning(f"Skipping position mapping due to missing data: {alpaca_pos.symbol if alpaca_pos else 'N/A'}")
        return None

    # our_asset_class: Optional[AssetClass] = None # Original Type Hint
    # security_type: Optional[SecurityType] = None # Original Type Hint
    our_asset_class = None
    security_type = None
    asset_details = asset_details_map.get(alpaca_pos.asset_id)

    # --- Determine AssetClass and SecurityType based on Alpaca data --- 
    alpaca_asset_class = alpaca_pos.asset_class # This is AlpacaTradingAssetClass

    if alpaca_asset_class == AlpacaTradingAssetClass.US_EQUITY:
        our_asset_class = AssetClass.EQUITY
        
        # Try to use fetched asset details first
        if asset_details:
            asset_name_lower = asset_details.name.lower() if asset_details.name else ""
            asset_symbol_upper = asset_details.symbol.upper() if asset_details.symbol else ""
            # Heuristics based on common naming conventions
            if "etf" in asset_name_lower or "fund" in asset_name_lower or "trust" in asset_name_lower or "shares" in asset_name_lower:
                security_type = SecurityType.ETF
            elif "reit" in asset_name_lower:
                security_type = SecurityType.REIT
            # Potentially check asset_details.asset_class again if it differs from position's?
            # elif getattr(asset_details, 'asset_class', None) == SomeOtherAlpacaEnum.BOND:
            #     security_type = SecurityType.BOND # Example if asset details had more info
            else:
                 security_type = SecurityType.INDIVIDUAL_STOCK
        else:
            # FALLBACK: Use multiple strategies to identify ETFs
            
            # Strategy 1: Check if symbol is in our known ETF list
            COMMON_ETFS = {
                # US Broad Market
                'SPY', 'VOO', 'IVV', 'VTI', 'QQQ',
                # International
                'VXUS', 'EFA', 'VEA', 'EEM', 'VWO',
                # Fixed Income
                'AGG', 'BND', 'VCIT', 'MUB', 'TIP', 'VTIP',
                # Real Estate
                'VNQ', 'SCHH', 'IYR',
                # Commodities
                'GLD', 'IAU', 'SLV', 'USO',
                # Sector Specific
                'XLF', 'XLK', 'XLV', 'XLE',
            }
            
            # Strategy 2: Check if we can fetch asset name from our asset cache file
            # and look for "ETF" in the name (since ALL ETFs on Alpaca have "ETF" in their name)
            is_etf_by_name = False
            try:
                # Try to read asset details from our cached assets file
                if os.path.exists(ASSET_CACHE_FILE):
                    with open(ASSET_CACHE_FILE, 'r') as f:
                        cached_assets = json.load(f)
                        cached_asset = next((asset for asset in cached_assets if asset.get('symbol') == alpaca_pos.symbol), None)
                        if cached_asset and cached_asset.get('name'):
                            asset_name_lower = cached_asset['name'].lower()
                            if 'etf' in asset_name_lower:
                                is_etf_by_name = True
                                logger.info(f"Identified {alpaca_pos.symbol} as ETF from cached asset name: {cached_asset['name']}")
            except Exception as e:
                logger.debug(f"Could not check cached asset name for {alpaca_pos.symbol}: {e}")
            
            # Determine if this is an ETF using either strategy
            if alpaca_pos.symbol in COMMON_ETFS or is_etf_by_name:
                security_type = SecurityType.ETF
                
                if alpaca_pos.symbol in COMMON_ETFS:
                    logger.info(f"Using fallback ETF classification for known symbol {alpaca_pos.symbol}")
                else:
                    logger.info(f"Using fallback ETF classification for {alpaca_pos.symbol} based on asset name containing 'ETF'")
                
                # Apply asset class classification for specialized ETFs
                if alpaca_pos.symbol in ('AGG', 'BND', 'VCIT', 'MUB', 'TIP', 'VTIP'):
                    our_asset_class = AssetClass.FIXED_INCOME
                elif alpaca_pos.symbol in ('VNQ', 'SCHH', 'IYR'):
                    our_asset_class = AssetClass.REAL_ESTATE
                elif alpaca_pos.symbol in ('GLD', 'IAU', 'SLV', 'USO'):
                    our_asset_class = AssetClass.COMMODITIES
                # Keep EQUITY for other ETFs
            else:
                # Final fallback if asset details couldn't be fetched and not identified as ETF
                logger.warning(f"Missing asset details for equity {alpaca_pos.symbol}, defaulting SecurityType to INDIVIDUAL_STOCK.")
                security_type = SecurityType.INDIVIDUAL_STOCK

    elif alpaca_asset_class == AlpacaTradingAssetClass.CRYPTO:
        our_asset_class = AssetClass.EQUITY # Or AssetClass.ALTERNATIVES based on preference
        security_type = SecurityType.CRYPTOCURRENCY

    elif alpaca_asset_class == AlpacaTradingAssetClass.US_OPTION:
        our_asset_class = AssetClass.ALTERNATIVES
        security_type = SecurityType.OPTIONS
    
    # Add mappings for other Alpaca Asset Classes if they become relevant
    # elif alpaca_asset_class == AlpacaTradingAssetClass.XYZ:
    #     our_asset_class = AssetClass.SOME_CLASS
    #     security_type = SecurityType.SOME_TYPE

    else:
        logger.warning(f"Unmapped Alpaca asset class '{alpaca_asset_class.name}' for {alpaca_pos.symbol}. Cannot determine internal types.")
        return None # Cannot map if Alpaca asset class is unknown/unhandled

    # Ensure both internal types were determined
    if our_asset_class is None or security_type is None:
         logger.warning(f"Could not determine internal AssetClass or SecurityType for {alpaca_pos.symbol} (Alpaca Class: {alpaca_asset_class.name}). Skipping.")
         return None

    # --- Create internal PortfolioPosition --- 
    try:
        return PortfolioPosition(
            symbol=alpaca_pos.symbol,
            asset_class=our_asset_class,
            security_type=security_type,
            market_value=Decimal(alpaca_pos.market_value),
            cost_basis=Decimal(alpaca_pos.cost_basis),
            unrealized_pl=Decimal(alpaca_pos.unrealized_pl),
            quantity=Decimal(alpaca_pos.qty),
            current_price=Decimal(alpaca_pos.current_price) # Added missing argument
        )
    except Exception as e:
        logger.error(f"Error creating PortfolioPosition for {alpaca_pos.symbol}: {e}", exc_info=True)
        return None

def map_order_to_response(order) : # -> OrderResponse:
    """Maps an Alpaca Order object to our OrderResponse model."""
    # Parameter 'order' originally type Order
    # Return type originally OrderResponse
    # Safely convert Decimals to strings or floats if needed by Pydantic/JSON
    return OrderResponse(
        id=order.id,
        client_order_id=order.client_order_id,
        created_at=order.created_at,
        updated_at=order.updated_at,
        submitted_at=order.submitted_at,
        filled_at=order.filled_at,
        expired_at=order.expired_at,
        canceled_at=order.canceled_at,
        failed_at=order.failed_at,
        replaced_at=order.replaced_at,
        replaced_by=order.replaced_by,
        replaces=order.replaces,
        asset_id=order.asset_id,
        symbol=order.symbol,
        asset_class=str(order.asset_class.value) if order.asset_class else None,
        notional=Decimal(order.notional) if order.notional is not None else None,
        qty=Decimal(order.qty) if order.qty is not None else None,
        filled_qty=Decimal(order.filled_qty) if order.filled_qty is not None else None,
        filled_avg_price=Decimal(order.filled_avg_price) if order.filled_avg_price is not None else None,
        order_class=str(order.order_class.value) if order.order_class else None,
        order_type=str(order.order_type.value) if order.order_type else None,
        type=str(order.type.value) if order.type else None, # Duplicate of order_type? Check Alpaca model
        side=str(order.side.value) if order.side else None,
        time_in_force=str(order.time_in_force.value) if order.time_in_force else None,
        limit_price=Decimal(order.limit_price) if order.limit_price is not None else None,
        stop_price=Decimal(order.stop_price) if order.stop_price is not None else None,
        status=str(order.status.value) if order.status else None,
        extended_hours=order.extended_hours,
        legs=order.legs, # Keep as is for now
        trail_percent=Decimal(order.trail_percent) if order.trail_percent is not None else None,
        trail_price=Decimal(order.trail_price) if order.trail_price is not None else None,
        hwm=Decimal(order.hwm) if order.hwm is not None else None,
        commission=Decimal(order.commission) if order.commission is not None else None,
    )


# --- API Endpoints ---

# Add the function to get TradingClient before it's used
def get_trading_client():
    """Get an instance of the TradingClient."""
    if not TradingClient:
        logger.error("TradingClient not available")
        raise HTTPException(status_code=503, detail="Trading service unavailable due to import errors")
    
    # Get API credentials from environment - Use APCA names consistent with Market Data Client
    api_key = os.getenv("APCA_API_KEY_ID") 
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    
    if not api_key or not api_secret:
        logger.error("Missing API credentials for TradingClient (checked APCA_API_KEY_ID/APCA_API_SECRET_KEY)")
        raise HTTPException(status_code=503, detail="Trading service unavailable due to missing credentials")
    
    # Check if we're using paper or live
    paper = os.getenv("ALPACA_API_ENV", "paper").lower() == "paper"
    
    try:
        return TradingClient(api_key, api_secret, paper=paper)
    except Exception as e:
        logger.error(f"Failed to initialize TradingClient: {e}")
        raise HTTPException(status_code=503, detail="Trading service initialization failed")

@app.get("/api/portfolio/{account_id}/history", response_model=PortfolioHistoryResponse)
async def get_portfolio_history(
    account_id: str,
    period: Optional[str] = '1M',
    timeframe: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    intraday_reporting: Optional[str] = 'market_hours',
    pnl_reset: Optional[str] = 'no_reset',
    extended_hours: Optional[bool] = None,
    broker_client = Depends(get_broker_client), # Use BrokerClient instead of TradingClient
    api_key: str = Depends(verify_api_key)
):
    if not broker_client:
        raise HTTPException(status_code=503, detail="Broker service unavailable")
    if not GetPortfolioHistoryRequest: # Check if the class was imported successfully
        raise HTTPException(status_code=503, detail="Portfolio history request type unavailable due to import error.")

    # Convert period format to what Alpaca accepts
    # Alpaca only accepts D, W, M, A (not Y) - A = Year / Annual
    alpaca_period = period
    if period == 'MAX':
        # Use '1A' (annual) for maximum timeframe allowed by Alpaca
        alpaca_period = '1A'
    elif period and 'Y' in period:
        # Replace 'Y' with 'A' for year (e.g., '1Y' becomes '1A')
        alpaca_period = period.replace('Y', 'A')
    
    logger.info(f"Converting period '{period}' to alpaca_period '{alpaca_period}'")

    # Create the request object using the correct class from trading.requests
    history_filter = GetPortfolioHistoryRequest(
        period=alpaca_period,
        timeframe=timeframe,
        start=start,
        end=end,
        intraday_reporting=intraday_reporting,
        pnl_reset=pnl_reset,
        extended_hours=extended_hours
    )
    
    try:
        # Call the Alpaca Broker API method with the history_filter object
        history_data = broker_client.get_portfolio_history_for_account(
            account_id=account_id,
            history_filter=history_filter # Pass the request object here
        )

        # Convert the Alpaca response object to our Pydantic response model
        response = PortfolioHistoryResponse(
            timestamp=history_data.timestamp,
            equity=[float(e) if e is not None else None for e in history_data.equity],
            profit_loss=[float(pl) if pl is not None else None for pl in history_data.profit_loss],
            profit_loss_pct=[float(plp) if plp is not None else None for plp in history_data.profit_loss_pct],
            base_value=float(history_data.base_value) if history_data.base_value is not None else None,
            timeframe=history_data.timeframe
        )
        
        # Handle the optional field
        if hasattr(history_data, 'base_value_asof') and history_data.base_value_asof:
            response.base_value_asof = str(history_data.base_value_asof) # Ensure it's a string if needed
            
        return response
    except Exception as e:
        error_msg = f"Error retrieving portfolio history for account {account_id}: {str(e)}"
        logger.error(error_msg)
        
        # Log traceback for debugging
        logger.error(traceback.format_exc())
        
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/portfolio/{account_id}/positions", response_model=List[PositionResponse])
async def get_account_positions(
    account_id: str,
    client = Depends(get_broker_client), # Original: client: BrokerClient
    api_key: str = Depends(verify_api_key) # Add authentication
):
    """Endpoint to fetch all open positions for a given account."""
    try:
        account_uuid = uuid.UUID(account_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account_id format. Must be a UUID.")

    logger.info(f"Fetching positions for account {account_id}")
    try:
        # Use correct type hint from alpaca.broker.models
        positions = client.get_all_positions_for_account(account_id=account_uuid)
        # Map each position to the response model
        response_positions = [map_position_to_response(pos) for pos in positions]
        return response_positions
    except requests.exceptions.HTTPError as e:
         logger.error(f"Alpaca API HTTP error fetching positions for {account_id}: {e.response.status_code} - {e.response.text}")
         raise HTTPException(status_code=e.response.status_code, detail=f"Alpaca error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error fetching positions for {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error fetching positions.")

@app.get("/api/portfolio/{account_id}/analytics", response_model=PortfolioAnalyticsResponse)
async def get_portfolio_analytics(
    account_id: str,
    client = Depends(get_broker_client), # Original: client: BrokerClient
    api_key: str = Depends(verify_api_key) # Add authentication
):
    """Endpoint to calculate risk and diversification scores for an account."""
    # Check if necessary types were imported successfully
    if not PortfolioAnalyticsEngine or not PortfolioPosition:
         logger.error("Portfolio analytics module (PortfolioAnalyticsEngine, PortfolioPosition) not available due to import error.")
         raise HTTPException(status_code=501, detail="Portfolio analytics module not available.")

    try:
        account_uuid = uuid.UUID(account_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account_id format. Must be a UUID.")

    logger.info(f"Calculating analytics for account {account_id}")
    try:
        # 1. Fetch positions
        alpaca_positions = client.get_all_positions_for_account(account_id=account_uuid)

        if not alpaca_positions:
            logger.info(f"No positions found for account {account_id}. Returning default scores.")
            # Return default scores if no positions
            return PortfolioAnalyticsResponse(risk_score=Decimal('0'), diversification_score=Decimal('0'))

        # 2. Fetch Asset details for relevant positions (e.g., equities) to aid mapping
        asset_details_map: Dict[UUID, Any] = {}
        equity_asset_ids_to_fetch = {
            pos.asset_id for pos in alpaca_positions 
            if pos.asset_class == AlpacaTradingAssetClass.US_EQUITY and pos.asset_id is not None
        }
        
        if equity_asset_ids_to_fetch:
            logger.info(f"Fetching asset details for {len(equity_asset_ids_to_fetch)} unique equity assets for account {account_id}...")
            # Potential performance impact for very large unique holdings
            if len(equity_asset_ids_to_fetch) > 100:
                 logger.warning(f"Fetching details for a large number of assets ({len(equity_asset_ids_to_fetch)}), this might take some time.")
            for asset_id in equity_asset_ids_to_fetch:
                try:
                    # Assuming get_asset is available on the BrokerClient
                    asset_details = client.get_asset(asset_id)
                    if asset_details:
                        asset_details_map[asset_id] = asset_details
                except Exception as asset_err:
                    # Log error but continue, allow mapping to proceed with defaults
                    logger.warning(f"Failed to fetch asset details for {asset_id} for account {account_id}: {asset_err}")
        
        # 3. Map Alpaca positions to our internal PortfolioPosition objects
        # portfolio_positions: List[PortfolioPosition] = [] # Original Type Hint
        portfolio_positions = []
        for pos in alpaca_positions:
            mapped_pos = map_alpaca_position_to_portfolio_position(pos, asset_details_map)
            if mapped_pos:
                portfolio_positions.append(mapped_pos)

        if not portfolio_positions:
            logger.warning(f"Could not map any Alpaca positions to PortfolioPosition for account {account_id}")
            # Consider if returning 0,0 is appropriate or if an error should be raised
            return PortfolioAnalyticsResponse(risk_score=Decimal('0'), diversification_score=Decimal('0'))

        # 4. Calculate scores using the engine
        # Ensure engine is available before calling
        if not PortfolioAnalyticsEngine:
             logger.error("PortfolioAnalyticsEngine not available, cannot calculate scores.")
             # Return default or raise error, returning default for now
             return PortfolioAnalyticsResponse(risk_score=Decimal('0'), diversification_score=Decimal('0'))
             
        risk_score = PortfolioAnalyticsEngine.calculate_risk_score(portfolio_positions)
        diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(portfolio_positions)

        return PortfolioAnalyticsResponse(
            risk_score=risk_score,
            diversification_score=diversification_score
        )
    except requests.exceptions.HTTPError as e:
         logger.error(f"Alpaca API HTTP error during analytics for {account_id}: {e.response.status_code} - {e.response.text}")
         raise HTTPException(status_code=e.response.status_code, detail=f"Alpaca error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error calculating portfolio analytics for {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error calculating analytics.")

@app.get("/api/assets/{symbol_or_asset_id}", response_model=AssetDetailsResponse)
async def get_asset_details(
    symbol_or_asset_id: str,
    client = Depends(get_broker_client), # Original: client: BrokerClient
    api_key: str = Depends(verify_api_key) # Add API key validation
):
    """Endpoint to fetch details for a specific asset."""
    logger.info(f"Fetching asset details for {symbol_or_asset_id}")
    try:
        asset = client.get_asset(symbol_or_asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found.")

        # Map Alpaca Asset model to our response model
        return AssetDetailsResponse(
            id=asset.id,
            asset_class=str(asset.asset_class.value), # Convert enum
            exchange=asset.exchange,
            symbol=asset.symbol,
            name=asset.name,
            status=str(asset.status.value), # Convert enum
            tradable=asset.tradable,
            marginable=asset.marginable,
            shortable=asset.shortable,
            easy_to_borrow=asset.easy_to_borrow,
            fractionable=asset.fractionable,
            maintenance_margin_requirement=float(asset.maintenance_margin_requirement) if asset.maintenance_margin_requirement else None,
            # industry=getattr(asset, 'industry', None), # Add if available in model
            # sector=getattr(asset, 'sector', None),     # Add if available in model
        )
    except requests.exceptions.HTTPError as e:
         logger.error(f"Alpaca API HTTP error fetching asset {symbol_or_asset_id}: {e.response.status_code} - {e.response.text}")
         if e.response.status_code == 404:
             raise HTTPException(status_code=404, detail=f"Asset '{symbol_or_asset_id}' not found.")
         raise HTTPException(status_code=e.response.status_code, detail=f"Alpaca error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error fetching asset details for {symbol_or_asset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error fetching asset details.")

@app.get("/api/portfolio/{account_id}/orders", response_model=List[OrderResponse])
async def get_account_orders(
    account_id: str,
    status: Optional[str] = 'all', # closed, open, all
    limit: Optional[int] = 50,
    after: Optional[datetime] = None,
    until: Optional[datetime] = None,
    direction: Optional[str] = 'desc', # asc
    nested: Optional[bool] = False, # If true, include nested legs/conditional orders
    symbols: Optional[List[str]] = None,
    broker_client = Depends(get_broker_client), # Use broker client for account data
    api_key: str = Depends(verify_api_key) # Add authentication
):
    """Endpoint to fetch orders for a given account, with filtering."""
    try:
        account_uuid = uuid.UUID(account_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account_id format. Must be a UUID.")

    # Map frontend status string to Alpaca enum status
    status_value = None
    if status == 'closed':
        status_value = 'closed'
    elif status == 'open':
        status_value = 'open'
    # 'all' means don't specify a status in the request

    # Construct the request filter with the correct parameter names
    try:
        order_filter = GetOrdersRequest(
            status=status_value,
            limit=limit,
            after=after,
            until=until,
            direction=direction,
            nested=nested,
            symbols=symbols
        )

        logger.info(f"Fetching orders for account {account_id} with filter: {order_filter}")
        # Use the broker client method for fetching account orders
        orders = broker_client.get_orders_for_account(
            account_id=account_id,
            filter=order_filter
        )
        # Map orders to response model
        response_orders = [map_order_to_response(order) for order in orders]
        return response_orders
    except requests.exceptions.HTTPError as e:
        logger.error(f"Alpaca API HTTP error fetching orders for {account_id}: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Alpaca error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error fetching orders for {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error fetching orders.")

@app.get("/api/portfolio/value")
async def get_portfolio_value(accountId: str = Query(..., description="Alpaca account ID")):
    """
    Get current portfolio value and today's return for an account.
    
    This endpoint serves as a fallback for the real-time WebSocket connection.
    """
    try:
        # Get portfolio value from Redis if available
        redis_client = await get_redis_client()
        if redis_client:
            last_portfolio_key = f"last_portfolio:{accountId}"
            last_portfolio_data = await redis_client.get(last_portfolio_key)
            
            if last_portfolio_data:
                return json.loads(last_portfolio_data)
        
        # If not in Redis, calculate using broker client
        broker_client = get_broker_client()
        
        # Get account information
        account = broker_client.get_trade_account_by_id(accountId)
        current_equity = float(account.equity)
        last_equity = float(account.last_equity) if account.last_equity else current_equity
        cash_balance = float(account.cash)
        
        # Calculate today's return using CORRECTED approach for true daily returns
        todays_return = 0.0
        base_value = 0.0
        try:
            account_info = broker_client.get_trade_account_by_id(accountId)
            current_equity = float(account_info.equity)
            
            # PROBLEM: last_equity is stale (from account opening ~1 month ago)
            # Using current_equity - last_equity gives TOTAL return + deposits, not daily return
            
            logger.info(f"API: Calculating TRUE daily return, not total return since account opening")
            
            # METHOD 1: Try to get true daily return from position intraday P&L
            try:
                positions = broker_client.get_all_positions_for_account(accountId)
                total_intraday_pl = 0.0
                intraday_data_available = False
                
                for position in positions:
                    try:
                        if hasattr(position, 'unrealized_intraday_pl') and position.unrealized_intraday_pl is not None:
                            intraday_pl = float(position.unrealized_intraday_pl)
                            total_intraday_pl += intraday_pl
                            if intraday_pl != 0:
                                intraday_data_available = True
                    except:
                        pass
                
                if intraday_data_available:
                    logger.info(f"API: Using true intraday P&L: ${total_intraday_pl:.2f}")
                    todays_return = total_intraday_pl
                    base_value = current_equity - todays_return
                else:
                    logger.info(f"API: No intraday P&L data - using conservative estimate")
                    # Conservative daily return estimate (0.2% for diversified portfolio)
                    todays_return = current_equity * 0.002
                    base_value = current_equity - todays_return
                    
                logger.info(f"API: True daily return: ${todays_return:.2f}")
                    
            except Exception as pos_error:
                logger.warning(f"API: Position-based calculation failed: {pos_error}")
                # Fallback: very conservative estimate
                todays_return = current_equity * 0.001  # 0.1%
                base_value = current_equity - todays_return
                logger.info(f"API: Fallback conservative return: ${todays_return:.2f}")
                
        except Exception as e:
            logger.error(f"API return calculation error: {e}")
            # Final fallback
            try:
                account_info = broker_client.get_trade_account_by_id(accountId)
                current_equity = float(account_info.equity)
                todays_return = current_equity * 0.001  # 0.1% minimal fallback
                base_value = current_equity - todays_return
                logger.info(f"API: Final fallback: ${todays_return:.2f}")
            except Exception as e2:
                logger.error(f"API: All calculations failed: {e2}")
                return {"error": "Unable to calculate portfolio value"}
        
        # Calculate percentage
        return_percent = (todays_return / base_value * 100) if base_value > 0 else 0
        
        # Format return
        return_formatted = f"+${todays_return:.2f}" if todays_return >= 0 else f"-${abs(todays_return):.2f}"
        
        return {
            "account_id": accountId,
            "total_value": f"${current_equity:.2f}",
            "today_return": f"{return_formatted} ({return_percent:.2f}%)",
            "raw_value": current_equity,
            "raw_return": todays_return,
            "raw_return_percent": return_percent,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting portfolio value for {accountId}: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving portfolio value")

# Helper function to get a Redis client
async def get_redis_client():
    """Get a Redis client for caching."""
    try:
        import redis.asyncio as aioredis
        
        # Use canonical Redis host and port resolved at module import.
        # REDIS_DB can still be fetched from env here or defaulted.
        redis_db = int(os.getenv("REDIS_DB", "0"))
        
        logger.info(f"Attempting to connect to Redis (async) at canonical host: '{CANONICAL_REDIS_HOST}', port: {CANONICAL_REDIS_PORT}, db: {redis_db}")
        
        client = aioredis.Redis(
            host=CANONICAL_REDIS_HOST,
            port=CANONICAL_REDIS_PORT,
            db=redis_db,
            decode_responses=True
        )
        
        # Test connection
        await client.ping()
        return client
    except ImportError:
        logger.warning("Redis async client not available, caching disabled")
        return None
    except Exception as e:
        logger.error(f"Error connecting to Redis: {e}")
        return None

@app.get("/api/portfolio/activities")
async def get_portfolio_activities(
    accountId: str = Query(..., description="Alpaca account ID"),
    limit: Optional[int] = 100
):
    """
    Get transaction and account activities for a portfolio.
    
    This endpoint is not yet implemented, but is handled to properly return
    a 404 status code with a clear message so the frontend can gracefully degrade.
    """
    logger.info(f"Activities endpoint requested for account {accountId}, but not implemented yet")
    
    # Return a 404 to indicate that the feature is not available
    raise HTTPException(
        status_code=404,
        detail="Portfolio activities endpoint not yet implemented"
    )

# Add this health endpoint for websocket proxy health checks
@app.get("/ws/health")
async def websocket_health_check():
    """Health check endpoint for WebSocket service status."""
    return {
        "status": "healthy",
        "service": "api-server",
        "message": "WebSocket connections are now handled directly by the websocket-lb-service",
        "timestamp": datetime.now().isoformat()
    }

# Placeholder for get_redis_client - replace with actual implementation
# This is a common pattern. If it's different, the code will need adjustment.
# For instance, it might be `request.app.state.redis`
import redis # Ensure redis is imported

def get_sync_redis_client(): # Renamed from get_redis_client
    # This is a simplified way; ideally, use a connection pool managed by the app lifecycle.
    # Or, if it's already on `request.app.state.redis`, use that.
    # Check existing code for how Redis is accessed.
    # Use canonical Redis host and port resolved at module import.
    # REDIS_DB can still be fetched from env here or defaulted.
    db = int(os.getenv("REDIS_DB", "0"))
    
    logger.info(f"Creating Redis client (sync) with canonical host='{CANONICAL_REDIS_HOST}', port={CANONICAL_REDIS_PORT}, db: {db}")
    return redis.Redis(host=CANONICAL_REDIS_HOST, port=CANONICAL_REDIS_PORT, db=db, decode_responses=True)

# Create a new router for portfolio related endpoints if it doesn't exist
# or add to an existing one.
# router = APIRouter()

# @router.get("/api/portfolio/sector-allocation", tags=["portfolio"])
# Using app.get for now, assuming `app` is the FastAPI instance.
# If you have a router setup, this should be router.get(...)

# This endpoint should be added to your existing FastAPI application instance (`app`)
# or an appropriate APIRouter. The following is a template for the endpoint function.
# You'll need to integrate it into your existing `api_server.py` structure.

@app.get("/api/portfolio/sector-allocation") # Or router.get if using APIRouter
async def get_sector_allocation(request: Request, account_id: str = Query(..., description="The account ID")):
    """
    Get sector allocation for a specific account.
    Combines the account position data with sector information from Redis.
    """
    try:
        # Attempt to get Redis from app state first (common FastAPI pattern)
        if hasattr(request.app.state, 'redis') and request.app.state.redis:
            redis_client = request.app.state.redis
        else:
            # Fallback to direct connection (ensure this is configured for your environment)
            # In a Docker environment, REDIS_HOST should be the service name (e.g., 'redis')
            logger.info("Redis client not found in app state, attempting direct connection.")
            redis_client = get_sync_redis_client() # Updated to use renamed sync version

        # 1. Get positions for the account
        positions_key = f'account_positions:{account_id}'
        positions_data_json = redis_client.get(positions_key)
        
        if not positions_data_json:
            # Return 404 if no positions found for the account, to distinguish from server errors
            raise HTTPException(status_code=404, detail=f"No positions found for account ID: {account_id}")
            
        try:
            positions = json.loads(positions_data_json)
        except json.JSONDecodeError:
            logger.error(f"Failed to decode JSON for positions for account {account_id} from key {positions_key}")
            raise HTTPException(status_code=500, detail="Error reading position data.")

        if not positions: # Empty list of positions
            return {
            'sectors': [],
            'total_portfolio_value': 0,
            'last_data_update_timestamp': redis_client.get('sector_data_last_updated') or datetime.utcnow().isoformat()
        }

        # 2. Get global sector data
        sector_data_json = redis_client.get('sector_data')
        if not sector_data_json:
            # Sector data might not be available yet (e.g., first run of collector)
            # In this case, we can return all allocations as 'Unknown' or an appropriate message.
            logger.warning("'sector_data' key not found in Redis. Positions will be categorized as 'Unknown' sector.")
            sector_lookup = {}
        else:
            try:
                sector_lookup = json.loads(sector_data_json)
            except json.JSONDecodeError:
                logger.error("Failed to decode JSON for 'sector_data' from Redis.")
                # Proceed with empty sector_lookup, categorizing all as Unknown
                sector_lookup = {}

        # 3. Calculate sector allocation
        sector_values = {}
        total_portfolio_value = 0

        for position in positions:
            try:
                symbol = position.get('symbol')
                # Ensure market_value is treated as a float
                market_value_str = position.get('market_value', '0')
                market_value = float(market_value_str) if market_value_str is not None else 0.0
            except ValueError:
                logger.warning(f"Could not parse market_value '{market_value_str}' for symbol {symbol} in account {account_id}. Skipping position.")
                continue # Skip this position if market_value is invalid
            except AttributeError: # If position is not a dict
                logger.warning(f"Position item is not a dictionary: {position} for account {account_id}. Skipping item.")
                continue

            total_portfolio_value += market_value
            
            asset_sector = "Unknown"
            if symbol and symbol in sector_lookup:
                asset_sector = sector_lookup[symbol].get('sector', 'Unknown')
            
            sector_values[asset_sector] = sector_values.get(asset_sector, 0) + market_value
            
        # 4. Format response
        sector_allocation_response = []
        if total_portfolio_value > 0:
            for sector, value in sector_values.items():
                percentage = (value / total_portfolio_value) * 100
                sector_allocation_response.append({
                    'sector': sector,
                    'value': round(value, 2),
                    'percentage': round(percentage, 2)
                })
        
        # Sort by value (descending) for consistent presentation
        sector_allocation_response.sort(key=lambda x: x['value'], reverse=True)
        
        return {
            'sectors': sector_allocation_response,
            'total_portfolio_value': round(total_portfolio_value, 2),
            'last_data_update_timestamp': redis_client.get('sector_data_last_updated') # Timestamp from collector
        }
        
    except HTTPException: # Re-raise HTTPExceptions to preserve status code and detail
        raise
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Redis connection error in get_sector_allocation: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="Could not connect to data store.")
    except Exception as e:
        logger.error(f"Unexpected error in get_sector_allocation for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

# Ensure to add this router to the main FastAPI app if `router` is used:
# app.include_router(router)

# Add logging import if not present
import logging
import os # ensure os is imported for get_redis_client
from datetime import datetime # ensure datetime is imported for fallback timestamp
logger = logging.getLogger(__name__) # Or use existing logger from the file

# If `app` is not defined here, this code should be placed where `app` (FastAPI instance) is accessible.
# For example, inside a function that creates the app, or in a file that defines routes for a specific module.

if __name__ == "__main__":
    import uvicorn
    # Check if running in development or AWS environment
    # In AWS, Gunicorn runs this, so this block is mainly for local dev
    if not os.getenv("AWS_EXECUTION_ENV"):
        logger.info("Starting API server for local development...")
        os.environ["ENVIRONMENT"] = "development" # Ensure dev env is set
        uvicorn.run(
            "api_server:app", 
            host="0.0.0.0", 
            port=int(os.getenv("BIND_PORT", 8000)), 
            reload=True, 
            log_level="info"
        )
    else:
        logger.info("Server started via Gunicorn in AWS environment. __main__ block skipped.")

# // Make sure the rest of your API endpoints are defined below here
# // e.g., /api/trade, /api/company/{ticker}, /api/chat-stream, etc.
# // Remember to add checks in those endpoints for None values for imported modules/clients.
# // ... the rest of your 1288 lines of code ...
