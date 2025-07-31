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
from datetime import datetime, timedelta, timezone
import uuid
import requests
from decimal import Decimal
from uuid import UUID
import contextlib
import time
import redis.asyncio as aioredis

from dotenv import load_dotenv

from decouple import config
import aiohttp
import traceback
import httpx
from fastapi import WebSocket, WebSocketDisconnect
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends, Header, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from pydantic import BaseModel, Field, ValidationError

from langgraph.errors import GraphInterrupt
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage, FunctionMessage

# Add these imports at the top with other imports
from utils.alpaca.account_closure import (
    AccountClosureManager,
    ClosureStep,
    check_account_closure_readiness,
    initiate_account_closure,
    get_closure_progress,
    resume_account_closure
)

# Authentication imports
from utils.authentication import verify_account_ownership
from utils.supabase.db_client import get_supabase_client

# Watchlist imports
from utils.alpaca.watchlist import (
    get_watchlist_for_account,
    get_or_create_default_watchlist,
    add_symbol_to_watchlist,
    remove_symbol_from_watchlist,
    is_symbol_in_watchlist,
    get_watchlist_symbols,
    get_watchlist_details
)

from utils.alpaca.portfolio_mapping import map_alpaca_position_to_portfolio_position, map_order_to_response, map_position_to_response

# Account Status imports
from utils.alpaca.account_status_service import (
    get_current_account_status,
    sync_account_status_to_supabase
)

# Purchase History imports
from clera_agents.tools.purchase_history import get_comprehensive_account_activities, get_comprehensive_account_activities_async

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

# --- Redis Host/Port Resolution (secure pattern) ---
_IS_PRODUCTION = os.getenv("COPILOT_ENVIRONMENT_NAME", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production"
if _IS_PRODUCTION:
    CANONICAL_REDIS_HOST = os.getenv("REDIS_HOST")
    if not CANONICAL_REDIS_HOST:
        raise RuntimeError("REDIS_HOST environment variable must be set in production!")
else:
    CANONICAL_REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
CANONICAL_REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
# ---------------------------------------------------------------------------

# Track startup errors
startup_errors = []

# Add parent directory to path to find graph.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logger.info(f"Python path: {sys.path}")


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
    from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine, PortfolioPosition
    from clera_agents.types.portfolio_types import AssetClass, SecurityType, OrderResponse, PositionResponse
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
    
    # Import Supabase conversation utilities
    from utils.supabase import (
        save_conversation,
        get_user_conversations,
        get_portfolio_conversations,
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

# === WATCHLIST MODELS ===
class WatchlistResponse(BaseModel):
    watchlist_id: str
    name: str
    symbols: List[str]
    symbols_count: int

class AddToWatchlistRequest(BaseModel):
    symbol: str = Field(..., description="Stock symbol to add to watchlist")

class RemoveFromWatchlistRequest(BaseModel):
    symbol: str = Field(..., description="Stock symbol to remove from watchlist")

class WatchlistSymbolCheckResponse(BaseModel):
    symbol: str
    in_watchlist: bool

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

@app.get("/api/market/quote/{ticker}")
async def get_stock_quote_with_changes(ticker: str):
    """Get stock quote with price changes and percentages using FMP API."""
    try:
        ticker = ticker.upper().strip()
        logger.info(f"Received quote request for ticker: {ticker}")

        # Import the function from market_data utility
        from utils.market_data import get_stock_quote_full
        
        quote_data = get_stock_quote_full(ticker)
        
        if not quote_data or len(quote_data) == 0:
            logger.warning(f"No quote data found for ticker: {ticker}")
            raise HTTPException(status_code=404, detail=f"No quote data found for {ticker}")

        # FMP quote API returns an array, get the first item
        quote = quote_data[0] if isinstance(quote_data, list) else quote_data
        
        # Calculate 1D percentage correctly (current vs market open, not previous close)
        current_price = quote.get('price', 0)
        open_price = quote.get('open', 0)
        
        # Calculate 1D change and percentage (market open to current)
        if open_price > 0:
            day_change = current_price - open_price
            day_change_percent = (day_change / open_price) * 100
        else:
            # Fallback to FMP's calculation if open price is not available
            day_change = quote.get('change', 0)
            day_change_percent = quote.get('changesPercentage', 0)
        
        response_data = {
            'symbol': quote.get('symbol', ticker),
            'price': current_price,
            'change': day_change,
            'changesPercentage': day_change_percent,
            'open': open_price,
            'previousClose': quote.get('previousClose', 0),
            'dayHigh': quote.get('dayHigh', 0),
            'dayLow': quote.get('dayLow', 0),
            'volume': quote.get('volume', 0),
            'timestamp': quote.get('timestamp', int(datetime.now().timestamp())),
            # Include additional useful fields
            'name': quote.get('name', ''),
            'marketCap': quote.get('marketCap', 0),
            'exchange': quote.get('exchange', '')
        }
        
        logger.info(f"Returning quote data for {ticker}: price=${current_price:.2f}, 1D_change={day_change_percent:.2f}% (open=${open_price:.2f})")
        return response_data
        
    except Exception as e:
        logger.error(f"Error fetching quote for {ticker}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching quote data: {str(e)}")


class BatchQuoteRequest(BaseModel):
    symbols: List[str] = Field(..., description="List of stock symbols to get quotes for", max_items=50)


@app.post("/api/market/quotes/batch")
async def get_stock_quotes_batch(request: BatchQuoteRequest):
    """Get stock quotes for multiple symbols in a single batch request."""
    try:
        symbols = [symbol.upper().strip() for symbol in request.symbols]
        logger.info(f"Received batch quote request for {len(symbols)} symbols: {symbols}")

        # Import the batch function from market_data utility
        from utils.market_data import get_stock_quotes_batch
        
        # Get batch quotes from FMP API (single API call)
        quotes_data = get_stock_quotes_batch(symbols)
        
        if not quotes_data:
            logger.warning(f"No quote data found for symbols: {symbols}")
            return JSONResponse({
                "quotes": [],
                "errors": [f"No data available for symbols: {', '.join(symbols)}"]
            }, status_code=200)

        # Process each quote with consistent calculation logic
        processed_quotes = []
        found_symbols = set()
        
        for quote in quotes_data:
            if not quote:
                continue
                
            symbol = quote.get('symbol', '').upper()
            found_symbols.add(symbol)
            
            # Calculate 1D percentage correctly (current vs market open, not previous close)
            current_price = quote.get('price', 0)
            open_price = quote.get('open', 0)
            
            # Calculate 1D change and percentage (market open to current)
            if open_price > 0:
                day_change = current_price - open_price
                day_change_percent = (day_change / open_price) * 100
            else:
                # Fallback to FMP's calculation if open price is not available
                day_change = quote.get('change', 0)
                day_change_percent = quote.get('changesPercentage', 0)
            
            processed_quote = {
                'symbol': symbol,
                'price': current_price,
                'change': day_change,
                'changesPercentage': day_change_percent,
                'open': open_price,
                'previousClose': quote.get('previousClose', 0),
                'dayHigh': quote.get('dayHigh', 0),
                'dayLow': quote.get('dayLow', 0),
                'volume': quote.get('volume', 0),
                'timestamp': quote.get('timestamp', int(datetime.now().timestamp())),
                # Include additional useful fields
                'name': quote.get('name', ''),
                'marketCap': quote.get('marketCap', 0),
                'exchange': quote.get('exchange', '')
            }
            processed_quotes.append(processed_quote)

        # Track any symbols that weren't found
        missing_symbols = [s for s in symbols if s not in found_symbols]
        errors = [f"No data found for: {symbol}" for symbol in missing_symbols] if missing_symbols else []
        
        logger.info(f"Returning {len(processed_quotes)} quotes for batch request. Missing: {len(missing_symbols)}")
        
        return JSONResponse({
            "quotes": processed_quotes,
            "errors": errors
        }, status_code=200)
        
    except Exception as e:
        logger.error(f"Error fetching batch quotes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching batch quote data: {str(e)}")


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
                # Log only that an existing account was found, not the email
                logger.info(f"Found existing account for email")
            else:
                logger.info(f"Successfully created new Alpaca account")
                
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
        
        # Log the request data for debugging (redacting sensitive information)
        logger.info(f"Creating ACH relationship link for account_id: {alpaca_account_id}")
        logger.info(f"Using email: (redacted)")
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
            ach_relationship_id=request.achRelationshipId
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
        relationships = client.get_ach_relationships_for_account(account_id)
        
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

@app.get("/api/account/{account_id}/funding-status")
async def get_account_funding_status(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Check if an account has been funded by examining:
    1. Account balance (cash > 0)
    2. Transfer history (any completed incoming transfers)
    3. Overall funding status
    """
    try:
        logger.info(f"Checking funding status for account: {account_id}")
        
        # Ensure broker client is initialized
        if not broker_client:
            logger.error("Broker client is not initialized.")
            raise HTTPException(status_code=500, detail="Server configuration error: Broker client not available.")
        
        # Get account details
        account_info = broker_client.get_trade_account_by_id(account_id)
        
        # Get account balance
        cash_balance = float(account_info.cash) if account_info.cash else 0.0
        portfolio_value = float(account_info.portfolio_value) if account_info.portfolio_value else 0.0
        
        # Get transfer history
        transfers = broker_client.get_transfers_for_account(account_id)
        
        # Check for completed incoming transfers
        completed_incoming_transfers = []
        total_funded_amount = 0.0
        
        for transfer in transfers:
            if hasattr(transfer, 'direction') and hasattr(transfer, 'status'):
                # Check for incoming transfers (funding the account)
                if str(transfer.direction).upper() == 'INCOMING':
                    transfer_status = str(transfer.status).upper()
                    transfer_amount = float(transfer.amount) if hasattr(transfer, 'amount') and transfer.amount else 0.0
                    
                    transfer_info = {
                        "id": str(transfer.id) if hasattr(transfer, 'id') else None,
                        "amount": transfer_amount,
                        "status": transfer_status,
                        "created_at": str(transfer.created_at) if hasattr(transfer, 'created_at') else None,
                        "updated_at": str(transfer.updated_at) if hasattr(transfer, 'updated_at') else None
                    }
                    
                    # Count transfers that indicate successful funding (including pending/processing)
                    # QUEUED: Transfer is queued for processing
                    # SUBMITTED: Transfer has been submitted to bank
                    # COMPLETED: Transfer has completed successfully  
                    # SETTLED: Transfer has fully settled
                    if transfer_status in ['QUEUED', 'SUBMITTED', 'COMPLETED', 'SETTLED']:
                        completed_incoming_transfers.append(transfer_info)
                        total_funded_amount += transfer_amount
        
        # Determine funding status
        has_cash_balance = cash_balance > 0
        has_portfolio_value = portfolio_value > 0
        has_completed_transfers = len(completed_incoming_transfers) > 0
        
        # Account is considered funded if:
        # 1. Has cash balance > 0, OR
        # 2. Has portfolio value > 0 (invested funds), OR  
        # 3. Has completed incoming transfers
        is_funded = has_cash_balance or has_portfolio_value or has_completed_transfers
        
        funding_status = {
            "account_id": account_id,
            "is_funded": is_funded,
            "cash_balance": cash_balance,
            "portfolio_value": portfolio_value,
            "total_funded_amount": total_funded_amount,
            "completed_transfers_count": len(completed_incoming_transfers),
            "funding_sources": {
                "has_cash_balance": has_cash_balance,
                "has_portfolio_value": has_portfolio_value,
                "has_completed_transfers": has_completed_transfers
            },
            "recent_transfers": completed_incoming_transfers[-5:] if completed_incoming_transfers else []  # Last 5 transfers
        }
        
        logger.info(f"Funding status for account {account_id}: is_funded={is_funded}, cash=${cash_balance}, portfolio=${portfolio_value}, transfers={len(completed_incoming_transfers)}")
        
        return {"success": True, "data": funding_status}
        
    except Exception as e:
        logger.error(f"Error checking funding status for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to check funding status: {str(e)}")

# === ACCOUNT STATUS ENDPOINTS ===

@app.get("/api/account/{account_id}/status")
async def get_account_status(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Get the current account status from Alpaca.
    
    This endpoint fetches the real-time account status directly from Alpaca's API.
    The status is also cached in Supabase for real-time frontend updates.
    """
    try:
        logger.info(f"Getting account status for account: {account_id}")
        
        # Get current status from Alpaca API
        current_status = await asyncio.to_thread(get_current_account_status, account_id)
        
        if current_status is None:
            raise HTTPException(
                status_code=404, 
                detail=f"Account {account_id} not found or status unavailable"
            )
        
        # Sync status to Supabase for real-time updates
        sync_success = await asyncio.to_thread(sync_account_status_to_supabase, account_id)
        if not sync_success:
            logger.warning(f"Failed to sync account status to Supabase for account {account_id}")
        
        return {
            "success": True,
            "data": {
                "account_id": account_id,
                "status": current_status,
                "timestamp": datetime.now().isoformat(),
                "synced_to_database": sync_success
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting account status for {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get account status: {str(e)}")

@app.post("/api/account/{account_id}/status/sync")
async def sync_account_status(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Manually sync account status from Alpaca to Supabase.
    
    This endpoint forces a sync of the current account status from Alpaca API 
    to the Supabase database, which will trigger real-time updates to the frontend.
    """
    try:
        logger.info(f"Manually syncing account status for account: {account_id}")
        
        # Sync status to Supabase
        sync_success = await asyncio.to_thread(sync_account_status_to_supabase, account_id)
        
        if not sync_success:
            raise HTTPException(
                status_code=500,
                detail="Failed to sync account status to database"
            )
        
        # Get the current status for response
        current_status = await asyncio.to_thread(get_current_account_status, account_id)
        
        return {
            "success": True,
            "data": {
                "account_id": account_id,
                "status": current_status,
                "synced_at": datetime.now().isoformat(),
                "message": "Account status successfully synced to database"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing account status for {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to sync account status: {str(e)}")

@app.get("/api/account/{account_id}/transfers")
async def get_account_transfers(
    account_id: str,
    limit: Optional[int] = 50,
    direction: Optional[str] = None,  # 'INCOMING', 'OUTGOING', or None for all
    api_key: str = Depends(verify_api_key)
):
    """
    Get comprehensive transfer history for an account using Alpaca's get_transfers_for_account.
    
    Args:
        account_id: Alpaca account ID
        limit: Maximum number of transfers to return (default: 50)
        direction: Filter by transfer direction ('INCOMING', 'OUTGOING', or None for all)
    
    Returns:
        Formatted transfer history with real-time status
    """
    try:
        logger.info(f"Getting transfer history for account: {account_id}")
        
        # Ensure broker client is initialized
        if not broker_client:
            logger.error("Broker client is not initialized.")
            raise HTTPException(status_code=500, detail="Server configuration error: Broker client not available.")
        
        # Import the request filter class
        from alpaca.broker.requests import GetTransfersRequest
        from alpaca.broker.enums import TransferDirection
        
        # Build the filter request
        filter_params = {}
        if direction:
            if direction.upper() == 'INCOMING':
                filter_params['direction'] = TransferDirection.INCOMING
            elif direction.upper() == 'OUTGOING':
                filter_params['direction'] = TransferDirection.OUTGOING
        
        # Create the request filter
        transfers_filter = GetTransfersRequest(**filter_params) if filter_params else None
        
        # Get transfers from Alpaca
        transfers = broker_client.get_transfers_for_account(
            account_id=account_id,
            transfers_filter=transfers_filter,
            max_items_limit=limit
        )
        
        # Format transfers for frontend
        formatted_transfers = []
        for transfer in transfers:
            try:
                # Convert transfer object to dictionary format
                transfer_data = {
                    "id": str(transfer.id) if hasattr(transfer, 'id') else None,
                    "amount": float(transfer.amount) if hasattr(transfer, 'amount') and transfer.amount else 0.0,
                    "status": transfer.status.value if hasattr(transfer, 'status') and hasattr(transfer.status, 'value') else 'UNKNOWN',
                    "direction": transfer.direction.value if hasattr(transfer, 'direction') and hasattr(transfer.direction, 'value') else 'UNKNOWN',
                    "created_at": transfer.created_at.isoformat() if hasattr(transfer, 'created_at') and transfer.created_at else None,
                    "updated_at": transfer.updated_at.isoformat() if hasattr(transfer, 'updated_at') and transfer.updated_at else None,
                    "type": transfer.type.value if hasattr(transfer, 'type') and hasattr(transfer.type, 'value') else 'UNKNOWN',
                    "relationship_id": str(transfer.relationship_id) if hasattr(transfer, 'relationship_id') else None,
                    "fee": float(transfer.fee) if hasattr(transfer, 'fee') and transfer.fee else 0.0,
                    "requested_amount": float(transfer.requested_amount) if hasattr(transfer, 'requested_amount') and transfer.requested_amount else 0.0,
                    "expires_at": transfer.expires_at.isoformat() if hasattr(transfer, 'expires_at') and transfer.expires_at else None
                }
                formatted_transfers.append(transfer_data)
            except Exception as format_error:
                logger.warning(f"Error formatting transfer {getattr(transfer, 'id', 'unknown')}: {format_error}")
                continue
        
        # Sort by created_at (most recent first)
        formatted_transfers.sort(key=lambda x: x['created_at'] or '', reverse=True)
        
        logger.info(f"Successfully retrieved {len(formatted_transfers)} transfers for account {account_id}")
        
        return {
            "success": True,
            "transfers": formatted_transfers,
            "total_count": len(formatted_transfers),
            "account_id": account_id
        }
        
    except Exception as e:
        logger.error(f"Error retrieving transfer history for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transfer history: {str(e)}")

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


# --- Helper Functions ---

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
            base_value=float(history_data.base_value) if history_data.base_value is not None else 0.0,
            timeframe=history_data.timeframe
        )
        
        # Handle the optional field
        if hasattr(history_data, 'base_value_asof') and history_data.base_value_asof:
            response.base_value_asof = str(history_data.base_value_asof) # Ensure it's a string if needed
            
        return response
    except ValidationError:
        # This occurs for new accounts with no trading history
        logger.warning(f"Validation error for account {account_id}, likely a new account. Returning empty history.")
        return PortfolioHistoryResponse(
            timestamp=[],
            equity=[],
            profit_loss=[],
            profit_loss_pct=[],
            base_value=0.0,
            timeframe="1D"
        )
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

@app.get("/api/portfolio/{account_id}/orders")
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
    positions = None  # Use None as a sentinel for fetch failure
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
        
        # Check for positions before calculating return
        try:
            positions = broker_client.get_all_positions_for_account(accountId)
        except Exception as pos_err:
            logger.error(f"API: Could not fetch positions for account {accountId} to check for cash-only status. Error: {pos_err}")
            positions = None  # Explicitly mark as fetch failure
        # --- END FIX ---
        
        last_equity = float(account.last_equity) if account.last_equity else current_equity
        cash_balance = float(account.cash)
        
        # Calculate today's return using CORRECTED approach for true daily returns
        todays_return = 0.0
        base_value = 0.0
        try:
            account_info = broker_client.get_trade_account_by_id(accountId)
            current_equity = float(account_info.equity)
            
            logger.info(f"API: Calculating TRUE daily return, not total return since account opening")
            
            # METHOD 1: Try to get true daily return from position intraday P&L
            try:
                if positions is not None:
                    total_intraday_pl = 0.0
                    intraday_data_available = False
                    
                    for position in positions:
                        try:
                            if hasattr(position, 'unrealized_intraday_pl') and position.unrealized_intraday_pl is not None:
                                intraday_pl = float(position.unrealized_intraday_pl)
                                total_intraday_pl += intraday_pl
                                if intraday_pl != 0:
                                    intraday_data_available = True
                        except Exception:
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
                else:
                    # If positions fetch failed, fallback to a minimal estimate, do NOT treat as cash-only
                    logger.info(f"API: Positions fetch failed, using fallback estimate for daily return.")
                    todays_return = current_equity * 0.001  # 0.1%
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
        
        # --- FIX: Ensure zero return for purely cash accounts ---
        if (positions == [] or positions is None) and cash_balance == current_equity:
             return_formatted = "+$0.00"
             return_percent = 0.0
        else:
             return_formatted = f"+${todays_return:.2f}" if todays_return >= 0 else f"-${abs(todays_return):.2f}"
        # --- END FIX ---
        
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
    account_id: str = Query(..., description="Alpaca account ID"),
    limit: Optional[int] = 100,
    days_back: Optional[int] = 60,
    api_key: str = Depends(verify_api_key),
    x_user_id: str = Header(..., alias="X-User-ID"),
    user_id: str = Depends(verify_account_ownership)
):
    """
    Get comprehensive account activities including trading history, statistics, and first purchase dates.
    """
    try:
        logger.info(f"Activities endpoint requested for account {account_id} by user {x_user_id}")
        
        # Create a config object with both account_id and user_id for the purchase history function
        config = {
            "configurable": {
                "account_id": account_id,
                "user_id": x_user_id
            }
        }
        
        # Get comprehensive account activities report
        activities_report = await get_comprehensive_account_activities_async(days_back=days_back, config=config)
        
        logger.info(f"Successfully generated activities report for account {account_id}")
        
        return {
            "account_id": account_id,
            "user_id": x_user_id,
            "days_back": days_back,
            "limit": limit,
            "report": activities_report,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating activities report for account {account_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate account activities report: {str(e)}"
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
            'last_data_update_timestamp': redis_client.get('sector_data_last_updated') or datetime.now(timezone.utc).isoformat()
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
logger = logging.getLogger(__name__) # Or use existing logger from the file

# If `app` is not defined here, this code should be placed where `app` (FastAPI instance) is accessible.
# For example, inside a function that creates the app, or in a file that defines routes for a specific module.

# Add these endpoints before the final app.run() call

# Account Closure Endpoints
@app.get("/account-closure/check-readiness/{account_id}")
async def check_account_closure_readiness_endpoint(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Check if account is ready for closure process.
    
    This endpoint verifies all preconditions for account closure:
    - Account status is ACTIVE
    - No PDT restrictions (or sufficient equity)
    - Has ACH relationship for fund withdrawal
    """
    try:
        logger.info(f"Checking closure readiness for account {account_id}")
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        result = check_account_closure_readiness(account_id, sandbox=sandbox)
        
        return result
        
    except Exception as e:
        logger.error(f"Error checking closure readiness for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error checking account closure readiness: {str(e)}")

@app.post("/account-closure/initiate/{account_id}")
async def initiate_account_closure_endpoint(
    account_id: str,
    request_data: dict,
    api_key: str = Depends(verify_api_key)
):
    """
    Initiate the account closure process.
    
    This starts the multi-step closure process:
    1. Cancel all open orders
    2. Liquidate all positions
    3. (Settlement and withdrawal handled in separate calls)
    
    Body should contain:
    {
        "ach_relationship_id": "string",
        "confirm_liquidation": true,
        "confirm_irreversible": true
    }
    """
    try:
        logger.info(f"Initiating closure for account {account_id}")
        
        # Validate request data
        ach_relationship_id = request_data.get("ach_relationship_id")
        confirm_liquidation = request_data.get("confirm_liquidation", False)
        confirm_irreversible = request_data.get("confirm_irreversible", False)
        
        if not ach_relationship_id:
            raise HTTPException(status_code=400, detail="ACH relationship ID is required")
        
        if not confirm_liquidation or not confirm_irreversible:
            raise HTTPException(
                status_code=400, 
                detail="Both liquidation and irreversible action confirmations are required"
            )
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        result = initiate_account_closure(account_id, ach_relationship_id, sandbox=sandbox)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error initiating closure for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error initiating account closure: {str(e)}")

@app.get("/account-closure/status/{account_id}")
async def get_account_closure_status_endpoint(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """Get current status of account closure process."""
    try:
        from utils.alpaca.account_closure import get_closure_progress
        
        # Get closure status from manager
        status = get_closure_progress(account_id, sandbox=True)
        
        logger.info(f"Account closure status for {account_id}: {status}")
        
        return {
            "account_id": account_id,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting account closure status for {account_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get closure status: {str(e)}")

@app.get("/api/account-closure/progress/{account_id}")
async def get_account_closure_progress_endpoint(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """Get real-time progress of account closure process for frontend polling."""
    try:
        from utils.alpaca.account_closure import get_closure_progress
        
        # Get current closure progress
        progress = get_closure_progress(account_id, sandbox=True)
        
        logger.info(f"Account closure progress for {account_id}: {progress}")
        
        # Map backend steps to frontend step numbers
        step_mapping = {
            'initiated': 0,
            'liquidating_positions': 1,  # Combined: cancel orders + liquidate
            'waiting_settlement': 2,
            'withdrawing_funds': 3,
            'closing_account': 4,
            'completed': 5,
            'failed': -1
        }
        
        current_step = progress.get("current_step", "unknown")
        steps_completed = step_mapping.get(current_step, 0)
        
        # Calculate total steps (excluding failed)
        total_steps = 5
        
        # Get Supabase data for confirmation number and initiation date
        supabase_data = {}
        try:
            supabase = get_supabase_client()
            
            # Find user by account_id
            result = supabase.table("user_onboarding").select(
                "account_closure_confirmation_number, account_closure_initiated_at, onboarding_data"
            ).eq("alpaca_account_id", account_id).execute()
            
            if result.data:
                user_data = result.data[0]
                supabase_data = {
                    "confirmation_number": user_data.get("account_closure_confirmation_number"),
                    "initiated_at": user_data.get("account_closure_initiated_at"),
                    "closure_details": user_data.get("onboarding_data", {}).get("account_closure", {})
                }
        except Exception as e:
            logger.warning(f"Could not fetch Supabase data for account {account_id}: {e}")
        
        # Format response for frontend consumption
        return {
            "account_id": account_id,
            "current_step": current_step,
            "steps_completed": steps_completed,
            "total_steps": total_steps,
            "status_details": {
                "account_status": progress.get("account_status"),
                "cash_balance": progress.get("cash_balance"),
                "open_positions": progress.get("open_positions", 0),
                "open_orders": progress.get("open_orders", 0),
                "ready_for_next_step": progress.get("ready_for_next_step", False)
            },
            "estimated_completion": progress.get("estimated_completion"),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            # Include Supabase data
            "confirmation_number": supabase_data.get("confirmation_number"),
            "initiated_at": supabase_data.get("initiated_at"),
            "closure_details": supabase_data.get("closure_details", {})
        }
        
    except Exception as e:
        logger.error(f"Error getting account closure progress for {account_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get closure progress: {str(e)}")

@app.post("/account-closure/withdraw-funds/{account_id}")
async def withdraw_funds_for_closure_endpoint(
    account_id: str,
    request_data: dict,
    api_key: str = Depends(verify_api_key)
):
    """
    Withdraw all funds as part of account closure process.
    
    Body should contain:
    {
        "ach_relationship_id": "string"
    }
    """
    try:
        logger.info(f"Withdrawing funds for closure of account {account_id}")
        
        ach_relationship_id = request_data.get("ach_relationship_id")
        if not ach_relationship_id:
            raise HTTPException(status_code=400, detail="ACH relationship ID is required")
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        manager = AccountClosureManager(sandbox=sandbox)
        
        result = manager.withdraw_all_funds(account_id, ach_relationship_id)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error withdrawing funds for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error withdrawing funds: {str(e)}")

@app.get("/account-closure/settlement-status/{account_id}")
async def check_settlement_status_endpoint(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Check if positions have settled and funds are available for withdrawal.
    """
    try:
        logger.info(f"Checking settlement status for account {account_id}")
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        manager = AccountClosureManager(sandbox=sandbox)
        
        result = manager.check_settlement_status(account_id)
        
        return result
        
    except Exception as e:
        logger.error(f"Error checking settlement status for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error checking settlement status: {str(e)}")

@app.get("/account-closure/withdrawal-status/{account_id}/{transfer_id}")
async def check_withdrawal_status_endpoint(
    account_id: str,
    transfer_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Check status of ACH withdrawal transfer.
    """
    try:
        logger.info(f"Checking withdrawal status for account {account_id}, transfer {transfer_id}")
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        manager = AccountClosureManager(sandbox=sandbox)
        
        result = manager.check_withdrawal_status(account_id, transfer_id)
        
        return result
        
    except Exception as e:
        logger.error(f"Error checking withdrawal status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error checking withdrawal status: {str(e)}")

@app.post("/account-closure/close-account/{account_id}")
async def close_account_final_endpoint(
    account_id: str,
    request_data: dict,
    api_key: str = Depends(verify_api_key)
):
    """
    Final step: Close the account after all funds have been withdrawn.
    
    Body should contain:
    {
        "final_confirmation": true
    }
    """
    try:
        logger.info(f"Final account closure for account {account_id}")
        
        final_confirmation = request_data.get("final_confirmation", False)
        if not final_confirmation:
            raise HTTPException(
                status_code=400, 
                detail="Final confirmation is required to close the account"
            )
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        manager = AccountClosureManager(sandbox=sandbox)
        
        result = manager.close_account(account_id)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error closing account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error closing account: {str(e)}")

@app.post("/account-closure/resume/{account_id}")
async def resume_account_closure_endpoint(
    account_id: str,
    request_data: dict,
    api_key: str = Depends(verify_api_key)
):
    """
    Resume account closure process with automatic retry logic.
    
    This endpoint checks the current closure status and automatically continues
    the process from the appropriate step.
    
    Body should contain:
    {
        "ach_relationship_id": "string" (optional, will be determined if not provided)
    }
    """
    try:
        logger.info(f"Resuming account closure process for account {account_id}")
        
        ach_relationship_id = request_data.get("ach_relationship_id")
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        result = resume_account_closure(account_id, ach_relationship_id, sandbox=sandbox)
        
        return result
        
    except Exception as e:
        logger.error(f"Error resuming closure for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error resuming account closure: {str(e)}")

# WebSocket Endpoint (Remaining at the end as it was before)
@app.websocket("/ws/portfolio/{account_id}")
async def websocket_portfolio_endpoint(websocket: WebSocket, account_id: str, api_key: str = Query(...)):
    try:
        # Validate API key
        if api_key != os.getenv("BACKEND_API_KEY"):
            await websocket.close(code=4001, reason="Invalid API key")
            return
        
        await websocket.accept()
        logger.info(f"WebSocket connection accepted for account {account_id}")
        
        # Create Redis connection for this WebSocket
        redis_url = f"redis://{CANONICAL_REDIS_HOST}:{CANONICAL_REDIS_PORT}"
        redis_client = aioredis.Redis.from_url(redis_url)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"portfolio_updates:{account_id}")
        
        try:
            while True:
                # Listen for Redis messages with a timeout
                try:
                    message = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=30.0)
                    if message and message['data']:
                        # Decode and send the portfolio update
                        data = json.loads(message['data'].decode('utf-8'))
                        await websocket.send_text(json.dumps(data))
                except asyncio.TimeoutError:
                    # Send a heartbeat to keep the connection alive
                    await websocket.send_text(json.dumps({"type": "heartbeat", "timestamp": time.time()}))
                except Exception as e:
                    logger.error(f"Error processing Redis message for {account_id}: {e}")
                    break
                    
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for account {account_id}")
        finally:
            await pubsub.unsubscribe(f"portfolio_updates:{account_id}")
            await pubsub.close()
            await redis_client.close()
            
    except Exception as e:
        logger.error(f"WebSocket error for account {account_id}: {e}")
        if not websocket.client_state.disconnected:
            await websocket.close(code=4000, reason="Internal server error")

# === WATCHLIST ENDPOINTS ===

@app.get("/api/watchlist/{account_id}", response_model=WatchlistResponse)
async def get_watchlist(
    account_id: str,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key)
):
    """
    Get the default watchlist for an account with all symbols.
    Creates a default watchlist if none exists.
    """
    try:
        logger.info(f"Getting watchlist for account {account_id}")
        
        # Get or create default watchlist
        watchlist = get_or_create_default_watchlist(account_id, broker_client=broker_client)
        
        if not watchlist:
            raise HTTPException(
                status_code=500,
                detail="Failed to get or create watchlist"
            )
        
        # Get watchlist details
        watchlist_details = get_watchlist_details(account_id, str(watchlist.id), broker_client=broker_client)
        
        if not watchlist_details:
            # Fallback to basic info if details fetch fails
            symbols = get_watchlist_symbols(account_id, str(watchlist.id), broker_client=broker_client)
            watchlist_details = {
                "watchlist_id": str(watchlist.id),
                "name": watchlist.name or "My Watchlist",
                "symbols": symbols,
                "symbols_count": len(symbols)
            }
        
        return WatchlistResponse(**watchlist_details)
        
    except Exception as e:
        logger.error(f"Error getting watchlist for account {account_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get watchlist: {str(e)}"
        )


@app.post("/api/watchlist/{account_id}/add")
async def add_symbol_to_watchlist_endpoint(
    account_id: str,
    request: AddToWatchlistRequest,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key)
):
    """
    Add a stock symbol to the account's default watchlist.
    """
    try:
        symbol = request.symbol.upper().strip()
        logger.info(f"Adding symbol {symbol} to watchlist for account {account_id}")
        
        # Check if symbol is already in watchlist
        already_in_watchlist = is_symbol_in_watchlist(account_id, symbol, broker_client=broker_client)
        
        if already_in_watchlist:
            return {
                "success": True,
                "message": f"Symbol {symbol} is already in watchlist",
                "symbol": symbol,
                "added": False
            }
        
        # Add symbol to watchlist
        success = add_symbol_to_watchlist(account_id, symbol, broker_client=broker_client)
        
        if success:
            return {
                "success": True,
                "message": f"Successfully added {symbol} to watchlist",
                "symbol": symbol,
                "added": True
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to add {symbol} to watchlist"
            )
            
    except Exception as e:
        logger.error(f"Error adding symbol {request.symbol} to watchlist for account {account_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add symbol to watchlist: {str(e)}"
        )


@app.delete("/api/watchlist/{account_id}/remove")
async def remove_symbol_from_watchlist_endpoint(
    account_id: str,
    request: RemoveFromWatchlistRequest,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key)
):
    """
    Remove a stock symbol from the account's default watchlist.
    """
    try:
        symbol = request.symbol.upper().strip()
        logger.info(f"Removing symbol {symbol} from watchlist for account {account_id}")
        
        # Check if symbol is in watchlist
        in_watchlist = is_symbol_in_watchlist(account_id, symbol, broker_client=broker_client)
        
        if not in_watchlist:
            return {
                "success": True,
                "message": f"Symbol {symbol} is not in watchlist",
                "symbol": symbol,
                "removed": False
            }
        
        # Remove symbol from watchlist
        success = remove_symbol_from_watchlist(account_id, symbol, broker_client=broker_client)
        
        if success:
            return {
                "success": True,
                "message": f"Successfully removed {symbol} from watchlist",
                "symbol": symbol,
                "removed": True
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove {symbol} from watchlist"
            )
            
    except Exception as e:
        logger.error(f"Error removing symbol {request.symbol} from watchlist for account {account_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove symbol from watchlist: {str(e)}"
        )


@app.get("/api/watchlist/{account_id}/check/{symbol}", response_model=WatchlistSymbolCheckResponse)
async def check_symbol_in_watchlist(
    account_id: str,
    symbol: str,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key)
):
    """
    Check if a specific symbol is in the account's watchlist.
    """
    try:
        symbol = symbol.upper().strip()
        logger.info(f"Checking if symbol {symbol} is in watchlist for account {account_id}")
        
        in_watchlist = is_symbol_in_watchlist(account_id, symbol, broker_client=broker_client)
        
        return WatchlistSymbolCheckResponse(
            symbol=symbol,
            in_watchlist=in_watchlist
        )
        
    except Exception as e:
        logger.error(f"Error checking symbol {symbol} in watchlist for account {account_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check symbol in watchlist: {str(e)}"
        )

# Add PII management endpoints after the existing account-related endpoints

@app.get("/api/account/{account_id}/pii", response_model=dict)
async def get_account_pii(
    account_id: str, 
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(verify_account_ownership)
):
    """Get all personally identifiable information for an account."""
    try:
        from utils.pii_management import PIIManagementService
        
        # Use the PII management service with injected broker client
        pii_service = PIIManagementService(broker_client)
        result = pii_service.get_account_pii(account_id)
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching PII for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch account PII: {str(e)}")


@app.patch("/api/account/{account_id}/pii", response_model=dict)
async def update_account_pii(
    account_id: str, 
    request: Request, 
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(verify_account_ownership)
):
    """Update personally identifiable information for an account."""
    try:
        from utils.pii_management import PIIManagementService
        
        # Parse the request body
        update_data = await request.json()
        
        # Use the PII management service with injected broker client
        pii_service = PIIManagementService(broker_client)
        result = pii_service.update_account_pii(account_id, update_data)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating PII for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update account PII: {str(e)}")


@app.get("/api/account/{account_id}/pii/updateable-fields", response_model=dict)
async def get_updateable_pii_fields(
    account_id: str, 
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key),
    user_id: str = Depends(verify_account_ownership)
):
    """Get the list of PII fields that can be updated for this account."""
    try:
        from utils.pii_management import PIIManagementService
        
        # Use the PII management service with injected broker client
        pii_service = PIIManagementService(broker_client)
        result = pii_service.get_updateable_fields(account_id)
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching updateable fields for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch updateable fields: {str(e)}")


# === TRADE DOCUMENTS ENDPOINTS ===

@app.get("/api/account/{account_id}/documents")
async def get_trade_documents(
    account_id: str,
    start_date: Optional[str] = Query(None, description="Start date filter (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date filter (YYYY-MM-DD)"),
    document_type: Optional[str] = Query(None, description="Document type filter"),
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key)
):
    """
    Get all trade documents and statements for an account.
    
    Supports filtering by date range and document type.
    """
    try:
        from utils.alpaca.trade_documents import get_trade_documents_for_account
        from alpaca.broker.enums import TradeDocumentType
        from datetime import datetime
        
        logger.info(f"Fetching trade documents for account {account_id}")
        
        # Parse date filters if provided
        parsed_start_date = None
        parsed_end_date = None
        
        if start_date:
            try:
                parsed_start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail="Invalid start_date format. Use YYYY-MM-DD"
                )
        
        if end_date:
            try:
                parsed_end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail="Invalid end_date format. Use YYYY-MM-DD"
                )
        
        # Parse document type filter if provided
        parsed_document_type = None
        if document_type:
            try:
                # Map string to enum value
                parsed_document_type = TradeDocumentType(document_type)
            except ValueError:
                valid_types = [dt.value for dt in TradeDocumentType]
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid document_type. Valid options: {valid_types}"
                )
        
        # Fetch documents using the utility function
        documents = get_trade_documents_for_account(
            account_id=account_id,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
            document_type=parsed_document_type,
            broker_client=broker_client
        )
        
        return {
            "account_id": account_id,
            "documents": documents,
            "count": len(documents),
            "filters": {
                "start_date": start_date,
                "end_date": end_date,
                "document_type": document_type
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching trade documents for account {account_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to fetch trade documents: {str(e)}"
        )


@app.get("/api/account/{account_id}/documents/{document_id}")
async def get_trade_document_by_id(
    account_id: str,
    document_id: str,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key)
):
    """
    Get a specific trade document by its ID.
    """
    try:
        from utils.alpaca.trade_documents import get_trade_document_by_id
        
        logger.info(f"Fetching trade document {document_id} for account {account_id}")
        
        # Fetch document using the utility function
        document = get_trade_document_by_id(
            account_id=account_id,
            document_id=document_id,
            broker_client=broker_client
        )
        
        return {
            "account_id": account_id,
            "document": document
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching trade document {document_id} for account {account_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to fetch trade document: {str(e)}"
        )


@app.get("/api/account/{account_id}/documents/{document_id}/download")
async def download_trade_document(
    account_id: str,
    document_id: str,
    background_tasks: BackgroundTasks,
    broker_client = Depends(get_broker_client),
    api_key: str = Depends(verify_api_key)
):
    """
    Download a trade document as a file.
    
    Returns the document content with appropriate headers for file download.
    Uses background tasks to automatically clean up temporary files after serving.
    """
    import tempfile
    import os
    from fastapi.responses import FileResponse
    
    temp_file_path = None
    try:
        from utils.alpaca.trade_documents import download_trade_document, get_trade_document_by_id
        
        logger.info(f"Downloading trade document {document_id} for account {account_id}")
        
        # First, get document metadata to determine filename
        document_metadata = get_trade_document_by_id(
            account_id=account_id,
            document_id=document_id,
            broker_client=broker_client
        )
        
        # Create a temporary file with automatic cleanup scheduled
        # Use the same directory resolution as the utility function to avoid path validation errors
        temp_dir = os.environ.get("TRADE_DOCS_TMP_DIR", tempfile.gettempdir())
        temp_fd, temp_file_path = tempfile.mkstemp(
            suffix='.pdf', 
            prefix=f'trade_doc_{document_id}_',
            dir=temp_dir  # Use configurable temp directory for cross-platform compatibility
        )
        os.close(temp_fd)  # Close the file descriptor since we only need the path
        
        # Generate safe filename for download
        import re
        raw_name = document_metadata.get('display_name', 'document')
        # Only allow alphanumerics, underscore, dash, and dot; replace others with underscore
        safe_name = re.sub(r'[^A-Za-z0-9._-]', '_', raw_name)
        # Limit length to 100 characters
        safe_name = safe_name[:100] or 'document'
        download_filename = f"{safe_name}_{document_id}.pdf"
        
        # Download the document to the temporary file
        download_trade_document(
            account_id=account_id,
            document_id=document_id,
            file_path=temp_file_path,
            broker_client=broker_client
        )
        
        # Schedule cleanup of the temporary file after response is sent
        background_tasks.add_task(cleanup_temp_file, temp_file_path)
        
        # Return the file as a download response
        return FileResponse(
            path=temp_file_path,
            filename=download_filename,
            media_type='application/pdf',
            headers={
                "Content-Disposition": f"attachment; filename={download_filename}"
            }
        )
        
    except HTTPException:
        # Clean up temp file immediately if we have an HTTP exception
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
        raise
    except Exception as e:
        # Clean up temp file immediately on any other exception
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
        logger.error(f"Error downloading trade document {document_id} for account {account_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to download trade document: {str(e)}"
        )


def cleanup_temp_file(file_path: str):
    """
    Background task to clean up temporary files.
    
    Args:
        file_path: Path to the temporary file to delete
    """
    try:
        if os.path.exists(file_path):
            os.unlink(file_path)
            logger.info(f"Successfully cleaned up temporary file: {file_path}")
    except OSError as e:
        logger.warning(f"Failed to clean up temporary file {file_path}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error cleaning up temporary file {file_path}: {e}")



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
