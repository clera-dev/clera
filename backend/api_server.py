#!/usr/bin/env python3

"""
API server for Clera AI. provides endpoints for chat, trade, and company analysis.
"""

import os
import sys
import json
import logging
import hmac
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
from pydantic import BaseModel, Field, ValidationError, model_validator

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
from utils.authentication import verify_account_ownership, get_authenticated_user_id
from utils.supabase.db_client import get_supabase_client

# User Watchlist Service (Supabase-based, works for both aggregation and brokerage)
from utils.supabase.user_watchlist_service import UserWatchlistService

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

# Portfolio imports
from utils.portfolio.portfolio_service import get_portfolio_service
from utils.portfolio.abstract_provider import ProviderError
from utils.portfolio.aggregated_portfolio_service import get_aggregated_portfolio_service
from utils.portfolio.sector_allocation_service import get_sector_allocation_service

# Portfolio History imports (Phase 1-3)
from services.portfolio_reconstruction_manager import get_portfolio_reconstruction_manager
from services.daily_portfolio_snapshot_service import get_daily_portfolio_service
from services.intraday_portfolio_tracker import get_intraday_portfolio_tracker

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
    
    # ═══════════════════════════════════════════════════════════════════════
    # START BACKGROUND PORTFOLIO SERVICES (WITH LEADER ELECTION)
    # ═══════════════════════════════════════════════════════════════════════
    
    from services.background_service_manager import (
        get_background_service_manager,
        BackgroundServiceConfig
    )
    from services.intraday_portfolio_tracker import get_intraday_portfolio_tracker
    from services.daily_portfolio_snapshot_service import DailyPortfolioScheduler
    
    bg_manager = None
    try:
        bg_manager = get_background_service_manager()
        
        # Configure Intraday Portfolio Tracker
        intraday_config = BackgroundServiceConfig(
            service_name="Intraday Portfolio Tracker",
            service_func=lambda: get_intraday_portfolio_tracker().start_live_update_loop(),
            leader_key="portfolio:background_services:leader"
        )
        
        # Configure Daily Scheduler
        scheduler_config = BackgroundServiceConfig(
            service_name="Daily Portfolio Scheduler",
            service_func=lambda: DailyPortfolioScheduler().start_daily_scheduler(),
            leader_key="portfolio:daily_scheduler:leader"
        )
        
        # Start background services with leader election
        bg_manager.create_task(intraday_config)
        bg_manager.create_task(scheduler_config)
        
        logger.info("✅ Background services configured with leader election")
        
    except Exception as e:
        logger.error(f"❌ Failed to configure background services: {e}")
        startup_errors.append(f"Background services configuration failed: {str(e)}")
        bg_manager = None
    
    # ═══════════════════════════════════════════════════════════════════════
    
    # Log completion of startup
    logger.info(f"API server startup process complete with {len(startup_errors)} errors/warnings.")
    
    yield  # This is where the application runs
    
    # Shutdown logic
    logger.info("Shutting down API server...")
    
    # Gracefully shutdown all background services (if initialized)
    if bg_manager is not None:
        try:
            await bg_manager.shutdown_all()
        except Exception as e:
            logger.error(f"Error shutting down background services: {e}")
    else:
        logger.warning("Background service manager was not initialized - skipping shutdown")

# Create FastAPI app with lifespan
app = FastAPI(
    title="Clera AI API",
    description="API for Clera AI platform, providing trading, portfolio management, and AI-powered financial insights.",
    version="1.0.0",
    lifespan=lifespan
)

# Register modular route modules (keep api_server.py clean)
from routes.account_filtering_routes import router as account_filtering_router
from routes.snaptrade_routes import router as snaptrade_router
app.include_router(account_filtering_router)
app.include_router(snaptrade_router)

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
    notional_amount: Optional[float] = Field(None, description="Dollar amount to trade")
    units: Optional[float] = Field(None, description="Number of shares to trade (alternative to notional_amount)")
    side: str = Field(..., description="BUY or SELL")
    
    @model_validator(mode='after')
    def validate_amount_or_units(self) -> 'TradeRequest':
        """Ensure at least one of notional_amount or units is provided with a positive value."""
        has_valid_notional = self.notional_amount is not None and self.notional_amount > 0
        has_valid_units = self.units is not None and self.units > 0
        
        if not has_valid_notional and not has_valid_units:
            raise ValueError('Please enter an order amount greater than $0 or at least 1 share.')
        return self

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
    OrderResponse = None
    PositionResponse = None

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
async def execute_trade(
    request: TradeRequest,
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Execute a market order trade via Alpaca or SnapTrade.
    
    PRODUCTION-GRADE: Automatically routes to correct brokerage based on account_id.
    For SnapTrade accounts, uses the new SnapTradeTradingService for proper order placement.
    """
    try:
        logger.info(f"Received trade request: {request} for user {user_id}")
        
        # Validate the side
        if request.side.upper() not in ["BUY", "SELL"]:
            raise HTTPException(status_code=400, detail="Side must be either BUY or SELL")
        
        # Determine order side
        order_side = OrderSide.BUY if request.side.upper() == "BUY" else OrderSide.SELL
        action = "BUY" if order_side == OrderSide.BUY else "SELL"
        
        # PRODUCTION-GRADE: Determine provider by querying database instead of relying on account ID format
        # This prevents UUID-format Alpaca accounts from being incorrectly routed to SnapTrade
        clean_account_id = request.account_id.replace('snaptrade_', '')
        
        # Initialize Supabase client
        supabase = get_supabase_client()
        
        # Query database to determine the account provider
        # First try to match by provider_account_id
        account_result = supabase.table('user_investment_accounts')\
            .select('provider, provider_account_id')\
            .eq('user_id', user_id)\
            .eq('provider_account_id', clean_account_id)\
            .execute()
        
        # If not found, try matching by UUID (id field)
        if not account_result.data or len(account_result.data) == 0:
            account_result = supabase.table('user_investment_accounts')\
                .select('provider, provider_account_id')\
                .eq('user_id', user_id)\
                .eq('id', clean_account_id)\
                .execute()
        
        is_snaptrade_account = False
        if account_result.data and len(account_result.data) > 0:
            account_provider = account_result.data[0]['provider']
            is_snaptrade_account = (account_provider == 'snaptrade')
            logger.info(f"Account {request.account_id} provider: {account_provider}")
        else:
            # If not found in user_investment_accounts, check if it's the legacy Alpaca account ID
            logger.info(f"Account {request.account_id} not found in user_investment_accounts, assuming Alpaca")
        
        if is_snaptrade_account:
            # SnapTrade account - use SnapTrade trading service
            logger.info(f"Routing trade to SnapTrade for account {request.account_id}")
            
            from services.snaptrade_trading_service import get_snaptrade_trading_service
            trading_service = get_snaptrade_trading_service()
            
            # Clean account ID (remove our prefix if present)
            clean_account_id = request.account_id.replace('snaptrade_', '')
            
            # Determine if using units directly or notional value
            # Units take priority (for sell orders by share amount)
            # Use explicit `is not None` checks to handle edge case of value=0 correctly
            order_units = request.units if request.units is not None else None
            order_notional = float(request.notional_amount) if request.notional_amount is not None and order_units is None else None
            
            logger.info(f"Order params - units: {order_units}, notional: {order_notional}")
            
            # Place order directly (force order without impact check)
            # For production, you could add an optional impact check step here
            result = trading_service.place_order(
                user_id=user_id,
                account_id=clean_account_id,
                symbol=request.ticker.upper(),
                action=action,
                order_type='Market',  # Market order for notional trades
                time_in_force='Day',
                notional_value=order_notional,
                units=order_units
            )
            
            if not result['success']:
                return JSONResponse({
                    "success": False,
                    "message": result.get('error', 'Failed to place order'),
                    "error": result.get('error')
                }, status_code=400)
            
            # Build order description for messages
            if order_units is not None:
                order_desc = f"{order_units} shares of {request.ticker}"
            else:
                order_desc = f"${order_notional:.2f} of {request.ticker}"
            
            # PRODUCTION-GRADE: Handle both executed orders and queued orders
            if result.get('queued'):
                # Order was queued (market closed)
                return JSONResponse({
                    "success": True,
                    "queued": True,
                    "message": result.get('message', f"Order queued for market open: {action} {order_desc}"),
                    "order": result.get('order', {})
                })
            else:
                # Order was executed immediately
                order = result['order']
                
                # PRODUCTION-GRADE: Trigger post-trade sync (SnapTrade webhooks can be delayed)
                try:
                    from utils.portfolio.snaptrade_sync_service import trigger_full_user_sync
                    
                    async def delayed_sync():
                        import asyncio
                        await asyncio.sleep(3)  # Small delay for brokerage processing
                        sync_result = await trigger_full_user_sync(user_id, force_rebuild=True)
                        logger.info(f"Post-trade sync result: {sync_result}")
                    
                    asyncio.create_task(delayed_sync())
                    logger.info(f"Scheduled post-trade holdings sync for user {user_id}")
                except Exception as sync_error:
                    logger.warning(f"Failed to schedule post-trade sync: {sync_error}")
                
                success_message = (
                    f"✅ {action} order placed successfully via SnapTrade: "
                    f"{order_desc}. "
                    f"Order ID: {order['brokerage_order_id']}"
                )
                
                return JSONResponse({
                    "success": True,
                    "message": success_message,
                    "order": order
                })
        
        else:
            # Alpaca account - use existing Alpaca trade execution
            logger.info(f"Routing trade to Alpaca for account {request.account_id}")
            
            if not _submit_market_order:
                raise HTTPException(
                    status_code=503,
                    detail="Alpaca trading service unavailable"
                )
            
            # PRODUCTION-GRADE: Alpaca path only supports notional_amount, not units
            # When shares mode is used (units provided instead of notional_amount), reject with clear error
            if request.notional_amount is None:
                return JSONResponse({
                    "success": False,
                    "error": "Alpaca accounts only support dollar-amount orders. Please use dollar amount instead of shares."
                }, status_code=400)
            
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

        # Import the async function from market_data utility
        from utils.market_data import get_stock_quote_full_async
        
        quote_data = await get_stock_quote_full_async(ticker)
        
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
async def get_stock_quotes_batch(request: BatchQuoteRequest, api_key: str = Depends(verify_api_key)):
    """Get stock quotes for multiple symbols in a single batch request."""
    try:
        symbols = [symbol.upper().strip() for symbol in request.symbols]
        logger.info(f"Received batch quote request for {len(symbols)} symbols: {symbols}")

        # Import the async batch function from market_data utility
        from utils.market_data import get_stock_quotes_batch_async
        
        # Get batch quotes from FMP API (single API call)
        quotes_data = await get_stock_quotes_batch_async(symbols)
        
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
            if ('"code":40910000' in error_str and 'email address already exists' in error_str) or \
               ('EMAIL_EXISTS' in error_str):
                # This is a conflict error - account already exists but couldn't be looked up
                logger.info("Account with this email already exists in Alpaca but couldn't be looked up")
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "EMAIL_EXISTS",
                        "message": "Email addresses cannot be reused after account closure. Please make a new Clera account with a different email.",
                        "user_friendly_title": "Email Already Used",
                        "suggestion": "Try using a different email address to create your new account."
                    }
                )
            # Re-raise other exceptions
            raise
    
    except HTTPException:
        # Re-raise HTTPExceptions (like our 409 EMAIL_EXISTS) as-is
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
    request: Request,
    period: Optional[str] = '1M',
    filter_account: Optional[str] = Query(None, description="Filter to specific account UUID for account-specific view"),
    timeframe: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    intraday_reporting: Optional[str] = 'market_hours',
    pnl_reset: Optional[str] = 'no_reset',
    extended_hours: Optional[bool] = None,
    broker_client = Depends(get_broker_client), # Use BrokerClient instead of TradingClient
    api_key: str = Depends(verify_api_key)
):
    # SECURITY FIX: Get user_id from authentication only (not from query params)
    # For aggregation mode, user_id is required. For brokerage mode, account_id is sufficient.
    authenticated_user_id = None
    try:
        auth_header = request.headers.get("Authorization")
        authenticated_user_id = get_authenticated_user_id(request, api_key, auth_header)
    except HTTPException:
        # No authenticated user - this is OK for brokerage mode (uses account_id)
        # Aggregation mode will not work without authentication
        pass
    
    # CRITICAL FIX: Portfolio mode aware history
    if authenticated_user_id:
        feature_flags = get_feature_flags()
        portfolio_mode = feature_flags.get_portfolio_mode(authenticated_user_id)
        
        logger.info(f"Portfolio history request for user {authenticated_user_id}, account {account_id}, mode: {portfolio_mode}")
        
        # Handle aggregation mode - construct history from snapshots
        if portfolio_mode == 'aggregation':
            if filter_account:
                logger.info(f"Aggregation mode: Building account-specific portfolio history for user {authenticated_user_id}, account {filter_account}")
            else:
                logger.info(f"Aggregation mode: Building portfolio history from snapshots for user {authenticated_user_id}")
            aggregated_service = get_aggregated_portfolio_service()
            return await aggregated_service.get_portfolio_history(authenticated_user_id, period, filter_account)
    
    # PRODUCTION-GRADE: If account_id is 'null' (string) but no authenticated user,
    # this means frontend is trying to use aggregation mode without proper auth
    if account_id == 'null' and not authenticated_user_id:
        logger.error("Portfolio history requested with account_id='null' but no authentication provided")
        raise HTTPException(
            status_code=401,
            detail="Authentication required for aggregated portfolio history"
        )
    
    # Handle brokerage/hybrid mode - use Alpaca history
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

# CRITICAL: Define specific route BEFORE parameterized route to avoid conflicts
@app.get("/api/portfolio/aggregated/analytics", response_model=PortfolioAnalyticsResponse)
async def get_aggregated_portfolio_analytics(
    user_id: str = Depends(get_authenticated_user_id),
    filter_account: Optional[str] = Query(None, description="Filter to specific account UUID for account-level analytics"),
    api_key: str = Depends(verify_api_key)
):
    """
    Get portfolio analytics (risk & diversification scores) for aggregation mode users.
    
    Calculates scores from Plaid aggregated holdings data using the same analytics
    engine as brokerage mode for consistency.
    
    Supports account-level filtering for X-Ray Vision into individual accounts.
    
    Args:
        user_id: User ID to calculate analytics for
        filter_account: Optional account ID to filter to specific account
        api_key: API key for authentication
    """
    try:
        logger.info(f"📊 Portfolio analytics request for user {user_id}, filter={filter_account}")
        
        # Use account filtering service for clean separation of concerns
        from utils.portfolio.account_filtering_service import get_account_filtering_service
        filter_service = get_account_filtering_service()
        
        # Get filtered holdings
        filtered_holdings = await filter_service.filter_holdings_by_account(user_id, filter_account)
        
        # Calculate analytics on filtered holdings
        from utils.portfolio.aggregated_calculations import calculate_portfolio_analytics
        analytics_result = calculate_portfolio_analytics(filtered_holdings, user_id)
        
        logger.info(f"✅ Analytics calculated for {len(filtered_holdings)} holdings: risk={analytics_result['risk_score']}, diversification={analytics_result['diversification_score']}")
        
        # Return in standard format
        return PortfolioAnalyticsResponse(
            risk_score=Decimal(analytics_result['risk_score']),
            diversification_score=Decimal(analytics_result['diversification_score'])
        )
        
    except Exception as e:
        logger.error(f"Error calculating aggregated portfolio analytics for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate analytics: {str(e)}"
        )

@app.get("/api/portfolio/{account_id}/analytics", response_model=PortfolioAnalyticsResponse)
async def get_portfolio_analytics(
    account_id: str,
    user_id: str = Depends(get_authenticated_user_id),
    client = Depends(get_broker_client), # Original: client: BrokerClient
    api_key: str = Depends(verify_api_key) # Add authentication
):
    """
    Production-grade endpoint to calculate risk and diversification scores.
    
    Supports:
    - Alpaca brokerage accounts (using live positions)
    - Plaid aggregated portfolios (using aggregated holdings)
    """
    # Check if necessary types were imported successfully
    if not PortfolioAnalyticsEngine or not PortfolioPosition:
         logger.error("Portfolio analytics module (PortfolioAnalyticsEngine, PortfolioPosition) not available due to import error.")
         raise HTTPException(status_code=501, detail="Portfolio analytics module not available.")

    try:
        account_uuid = uuid.UUID(account_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account_id format. Must be a UUID.")

    logger.info(f"Calculating analytics for account {account_id}, user {user_id}")
    
    try:
        # Determine portfolio mode for this user
        feature_flags = get_feature_flags()
        portfolio_mode = feature_flags.get_portfolio_mode(user_id)
        
        logger.info(f"Portfolio analytics request: mode={portfolio_mode}")
        
        # Handle aggregation mode - use Plaid aggregated data
        if portfolio_mode == 'aggregation':
            logger.info(f"Aggregation mode: Calculating analytics from aggregated holdings for user {user_id}")
            aggregated_service = get_aggregated_portfolio_service()
            analytics_result = await aggregated_service.get_portfolio_analytics(user_id)
            
            # Convert to response model
            return PortfolioAnalyticsResponse(
                risk_score=Decimal(analytics_result['risk_score']),
                diversification_score=Decimal(analytics_result['diversification_score'])
            )
        
        # Handle brokerage/hybrid mode - use existing Alpaca logic
        logger.info(f"Brokerage mode: Calculating analytics from Alpaca positions for account {account_id}")
        
        # 1. Fetch positions from Alpaca
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
    request: Request,
    client = Depends(get_broker_client), # Original: client: BrokerClient
    api_key: str = Depends(verify_api_key) # Add API key validation
):
    """
    PRODUCTION-GRADE multi-source asset details endpoint.
    
    Supports:
    - Alpaca brokerage assets (tradable securities)
    - Plaid external securities with rich metadata (mutual funds, bonds, etc.)
    - Intelligent fallback details for unknown securities
    
    For Plaid securities, provides rich details including sector, industry, 
    and proper security names from the Investment API.
    
    SECURITY: User ID is now obtained from authentication only (not query params).
    If no authenticated user, falls back to Alpaca-only lookup.
    """
    logger.info(f"Fetching asset details for {symbol_or_asset_id}")
    
    # SECURITY FIX: Get user_id from authentication only (not from query params)
    authenticated_user_id = None
    try:
        auth_header = request.headers.get("Authorization")
        authenticated_user_id = get_authenticated_user_id(request, api_key, auth_header)
    except HTTPException:
        # No authenticated user - will use Alpaca-only lookup or fallback
        pass
    
    try:
        # CRITICAL FIX: Use production-grade asset details service
        from utils.portfolio.asset_details_service import get_asset_details_service
        asset_service = get_asset_details_service()
        
        # Use multi-source lookup (requires user_id for Plaid securities)
        if authenticated_user_id:
            asset_details = await asset_service.get_asset_details_multi_source(symbol_or_asset_id, authenticated_user_id, client)
        else:
            # Backward compatibility: Try Alpaca first, then fallback
            try:
                asset = client.get_asset(symbol_or_asset_id)
                if asset:
                    logger.info(f"Found Alpaca asset details for {symbol_or_asset_id}")
                    asset_details = {
                        "id": str(asset.id),
                        "symbol": asset.symbol,
                        "name": asset.name,
                        "asset_class": str(asset.asset_class.value),
                        "exchange": asset.exchange,
                        "status": str(asset.status.value),
                        "tradable": asset.tradable,
                        "marginable": asset.marginable,
                        "shortable": asset.shortable,
                        "easy_to_borrow": asset.easy_to_borrow,
                        "fractionable": asset.fractionable,
                        "maintenance_margin_requirement": float(asset.maintenance_margin_requirement) if asset.maintenance_margin_requirement else None,
                        "data_source": "alpaca"
                    }
                else:
                    raise Exception("Asset not found in Alpaca")
            except:
                logger.info(f"Asset {symbol_or_asset_id} not found in Alpaca, using fallback")
                asset_details = asset_service.create_fallback_asset_details(symbol_or_asset_id)
        
        # Convert to response model
        return AssetDetailsResponse(
            id=uuid.UUID(asset_details["id"]) if isinstance(asset_details["id"], str) else asset_details["id"],
            asset_class=asset_details.get("asset_class", "us_equity"),
            exchange=asset_details.get("exchange", "UNKNOWN"),
            symbol=asset_details.get("symbol", symbol_or_asset_id),
            name=asset_details.get("name", symbol_or_asset_id),
            status=asset_details.get("status", "active"),
            tradable=asset_details.get("tradable", False),
            marginable=asset_details.get("marginable", False),
            shortable=asset_details.get("shortable", False),
            easy_to_borrow=asset_details.get("easy_to_borrow", False),
            fractionable=asset_details.get("fractionable", False),
            maintenance_margin_requirement=asset_details.get("maintenance_margin_requirement")
        )
        
    except Exception as e:
        logger.error(f"Error fetching asset details for {symbol_or_asset_id}: {e}", exc_info=True)
        
        # Robust fallback to prevent any crashes
        return AssetDetailsResponse(
            id=uuid.uuid4(),
            asset_class="us_equity",
            exchange="UNKNOWN",
            symbol=symbol_or_asset_id,
            name=symbol_or_asset_id,
            status="active",
            tradable=False,
            marginable=False,
            shortable=False,
            easy_to_borrow=False,
            fractionable=False,
            maintenance_margin_requirement=None
        )

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

@app.delete("/api/portfolio/{account_id}/orders/{order_id}")
async def cancel_order_for_account(
    account_id: str,
    order_id: str,
    broker_client = Depends(get_broker_client),
    authenticated_user_id: str = Depends(get_authenticated_user_id)
):
    """
    Cancel a specific order for an account.
    
    This endpoint provides secure order cancellation with proper authentication
    and account ownership verification to prevent unauthorized order manipulation.
    """
    try:
        # Validate account_id format
        try:
            account_uuid = uuid.UUID(account_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid account_id format. Must be a UUID.")
        
        # Validate order_id format 
        try:
            order_uuid = uuid.UUID(order_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid order_id format. Must be a UUID.")
        
        # Verify user owns this account (security check)
        verify_account_ownership(account_id, authenticated_user_id)
        
        logger.info(f"Cancelling order {order_id} for account {account_id} by user {authenticated_user_id}")
        
        # Use Alpaca's cancel_order_for_account_by_id method
        broker_client.cancel_order_for_account_by_id(
            account_id=account_id,
            order_id=order_id
        )
        
        logger.info(f"Successfully cancelled order {order_id} for account {account_id}")
        
        return JSONResponse({
            "success": True,
            "message": f"Order {order_id} has been successfully cancelled",
            "order_id": order_id,
            "account_id": account_id
        })
        
    except HTTPException:
        # Re-raise HTTP exceptions (auth failures, validation errors)
        raise
    except requests.exceptions.HTTPError as e:
        # Handle Alpaca API errors
        logger.error(f"Alpaca API HTTP error cancelling order {order_id} for account {account_id}: {e.response.status_code} - {e.response.text}")
        
        # Check for common order cancellation errors
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=404, 
                detail="Order not found or already processed"
            )
        elif e.response.status_code == 422:
            raise HTTPException(
                status_code=422, 
                detail="Order cannot be cancelled (may be filled or already cancelled)"
            )
        else:
            raise HTTPException(
                status_code=e.response.status_code, 
                detail=f"Alpaca error: {e.response.text}"
            )
    except Exception as e:
        # Handle unexpected errors
        logger.error(f"Error cancelling order {order_id} for account {account_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail="Internal server error cancelling order"
        )

@app.get("/api/portfolio/value")
async def get_portfolio_value(
    accountId: str = Query(..., description="Account ID (Alpaca or aggregated)"),
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Get current portfolio value and today's return for an account.
    
    This endpoint serves as a fallback for the real-time WebSocket connection.
    Supports both Alpaca brokerage accounts and Plaid aggregated portfolios.
    """
    positions = None  # Use None as a sentinel for fetch failure
    try:
        # Determine portfolio mode for this user
        feature_flags = get_feature_flags()
        portfolio_mode = feature_flags.get_portfolio_mode(user_id)
        
        logger.info(f"Portfolio value request for user {user_id}, account {accountId}, mode: {portfolio_mode}")
        
        # Handle aggregation mode users
        if portfolio_mode == 'aggregation':
            logger.info(f"Aggregation mode: Getting portfolio value from aggregated holdings for user {user_id}")
            aggregated_service = get_aggregated_portfolio_service()
            return await aggregated_service.get_portfolio_value(user_id)
        
        # Handle brokerage/hybrid mode users - use existing Alpaca logic
        # Get portfolio value from Redis if available
        redis_client = await get_redis_client()
        if redis_client:
            last_portfolio_key = f"last_portfolio:{accountId}"
            last_portfolio_data = await redis_client.get(last_portfolio_key)
            
            if last_portfolio_data:
                logger.info(f"Returning cached portfolio value for Alpaca account {accountId}")
                return json.loads(last_portfolio_data)
        
        # If not in Redis, calculate using broker client
        logger.info(f"Calculating live portfolio value for Alpaca account {accountId}")
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
    user_id: str = Depends(verify_account_ownership)
):
    """
    Get comprehensive account activities including trading history, statistics, and first purchase dates.
    """
    try:
        logger.info(f"Activities endpoint requested for account {account_id} by user {user_id}")
        
        # Create a config object with both account_id and user_id for the purchase history function
        config = {
            "configurable": {
                "account_id": account_id,
                "user_id": user_id
            }
        }
        
        # Get comprehensive account activities report
        activities_report = await get_comprehensive_account_activities_async(days_back=days_back, config=config)
        
        logger.info(f"Successfully generated activities report for account {account_id}")
        
        return {
            "account_id": account_id,
            "user_id": user_id,
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
async def get_sector_allocation(
    request: Request, 
    account_id: str = Query(..., description="The account ID"),
    user_id: str = Depends(get_authenticated_user_id),
    filter_account: Optional[str] = Query(None, description="Filter to specific account for account-level sector allocation"),
    api_key: str = Depends(verify_api_key)
):
    """
    Get sector allocation for a specific account.
    Combines the account position data with sector information from Redis.
    Supports aggregation mode with Plaid sector data and brokerage mode with FMP data.
    Supports account-level filtering for X-Ray Vision into individual accounts.
    """
    try:
        # CRITICAL FIX: Support aggregation mode with Plaid sector data
        feature_flags = get_feature_flags()
        portfolio_mode = feature_flags.get_portfolio_mode(user_id)
        
        logger.info(f"Sector allocation request for user {user_id}, account {account_id}, mode: {portfolio_mode}, filter: {filter_account}")
        
        # Handle aggregation mode - use Plaid sector data with account filtering
        if portfolio_mode == 'aggregation':
            logger.info(f"Aggregation mode: Getting sector allocation from Plaid metadata for user {user_id}")
            sector_service = get_sector_allocation_service()
            return await sector_service.get_plaid_sector_allocation(user_id, filter_account)
        
        # Handle brokerage/hybrid mode - use existing FMP logic
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




# ===============================================
# PORTFOLIO HISTORY RECONSTRUCTION ENDPOINTS (PHASE 1)
# ===============================================

@app.post("/api/portfolio/reconstruction/request")
async def request_portfolio_reconstruction(
    user_id: str = Depends(get_authenticated_user_id),
    priority: str = Query('normal', description="Priority: high, normal, low"),
    api_key: str = Depends(verify_api_key)
):
    """
    Request portfolio history reconstruction for a user.
    
    This triggers the complete historical timeline construction from Plaid
    transaction data and FMP price data. Typically takes 2-3 minutes.
    
    Called automatically when user first connects Plaid accounts.
    """
    try:
        logger.info(f"📥 Portfolio reconstruction requested for user {user_id} (priority: {priority})")
        
        reconstruction_manager = get_portfolio_reconstruction_manager()
        result = await reconstruction_manager.request_reconstruction_for_user(user_id, priority)
        
        return result
        
    except Exception as e:
        logger.error(f"Error requesting portfolio reconstruction: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to request reconstruction: {str(e)}")

@app.get("/api/portfolio/reconstruction/status")
async def get_portfolio_reconstruction_status(
    request: Request,
    user_id: Optional[str] = Query(None, description="User ID for reconstruction status (backward compatibility)"),
    api_key: str = Depends(verify_api_key)
):
    """
    Get portfolio reconstruction status for a user.
    
    Used by frontend to show progress, completion status, and error handling.
    Provides real-time updates during the 2-3 minute reconstruction process.
    
    SECURITY: Accepts user_id via query param for backward compatibility with current frontend.
    If Authorization header is present, validates it matches the query param user_id.
    """
    try:
        # Try to get authenticated user ID from JWT token (if provided)
        authenticated_user_id = None
        try:
            auth_header = request.headers.get("Authorization")
            authenticated_user_id = get_authenticated_user_id(request, api_key, auth_header)
        except HTTPException:
            # No valid JWT token - fall back to query param for backward compatibility
            pass
        
        # Use authenticated user ID if available, otherwise fall back to query param
        final_user_id = authenticated_user_id or user_id
        
        if not final_user_id:
            raise HTTPException(
                status_code=400,
                detail="user_id is required (either via query parameter or Authorization header)"
            )
        
        # Security: If both are provided, they must match
        if authenticated_user_id and user_id and authenticated_user_id != user_id:
            raise HTTPException(
                status_code=403,
                detail="Authenticated user ID does not match provided user_id"
            )
        
        reconstruction_manager = get_portfolio_reconstruction_manager()
        status = await reconstruction_manager.get_reconstruction_status_for_user(final_user_id)
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting reconstruction status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get reconstruction status: {str(e)}")

@app.get("/api/portfolio/history-data/{period}")
async def get_portfolio_history_data(
    period: str,
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Get portfolio history data for charts (Phase 1).
    
    Returns reconstructed historical data for chart display.
    Supports periods: 1W, 1M, 3M, 6M, 1Y, 2Y
    
    This replaces the Alpaca-only portfolio history for aggregation users.
    """
    try:
        logger.info(f"📊 Portfolio history data requested for user {user_id}, period: {period}")
        
        # Check if reconstruction is complete
        reconstruction_manager = get_portfolio_reconstruction_manager()
        status = await reconstruction_manager.get_reconstruction_status_for_user(user_id)
        
        if status['status'] != 'completed':
            return {
                'error': f"Portfolio history not ready. Status: {status['status']}",
                'reconstruction_status': status
            }
        
        # Get historical data from database
        from utils.supabase.db_client import get_supabase_client
        supabase = get_supabase_client()
        
        # Calculate date range based on period
        end_date = datetime.now().date()
        period_mapping = {
            '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730
        }
        days_back = period_mapping.get(period, 30)
        start_date = end_date - timedelta(days=days_back)
        
        # Get portfolio history data
        result = supabase.table('user_portfolio_history')\
            .select('value_date, total_value, total_gain_loss, total_gain_loss_percent, account_breakdown')\
            .eq('user_id', user_id)\
            .eq('snapshot_type', 'reconstructed')\
            .gte('value_date', start_date.isoformat())\
            .lte('value_date', end_date.isoformat())\
            .order('value_date')\
            .execute()
        
        if not result.data:
            return {
                'error': 'No portfolio history data found for the requested period',
                'period': period,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        
        # Convert to chart-compatible format
        timeline_data = {
            'timestamp': [],
            'equity': [],
            'profit_loss': [],
            'profit_loss_pct': [],
            'account_breakdown': [],
            'base_value': 0.0,
            'timeframe': '1D',
            'period': period,
            'data_source': 'plaid_reconstructed'
        }
        
        for row in result.data:
            # Convert date to timestamp (milliseconds for frontend charts)
            value_date = datetime.fromisoformat(row['value_date'])
            timestamp_ms = int(value_date.timestamp() * 1000)
            
            timeline_data['timestamp'].append(timestamp_ms)
            timeline_data['equity'].append(float(row['total_value']))
            timeline_data['profit_loss'].append(float(row['total_gain_loss']))
            timeline_data['profit_loss_pct'].append(float(row['total_gain_loss_percent']))
            
            # Parse account breakdown for future filtering
            account_breakdown_raw = row['account_breakdown']
            if isinstance(account_breakdown_raw, str):
                account_breakdown = json.loads(account_breakdown_raw) if account_breakdown_raw else {}
            else:
                account_breakdown = account_breakdown_raw if account_breakdown_raw else {}
            timeline_data['account_breakdown'].append(account_breakdown)
        
        # Calculate base value (oldest value in timeline)
        if timeline_data['equity']:
            timeline_data['base_value'] = timeline_data['equity'][0]
        
        logger.info(f"📈 Returning {len(timeline_data['timestamp'])} data points for {period} period")
        
        return timeline_data
        
    except Exception as e:
        logger.error(f"Error getting portfolio history data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get portfolio history: {str(e)}")

@app.get("/api/portfolio/reconstruction/metrics")
async def get_reconstruction_metrics(
    api_key: str = Depends(verify_api_key)
):
    """
    Get global reconstruction metrics for monitoring and optimization.
    
    Used for system monitoring, cost tracking, and performance optimization.
    Provides insights into reconstruction system health.
    """
    try:
        reconstruction_manager = get_portfolio_reconstruction_manager()
        metrics = await reconstruction_manager.get_global_reconstruction_metrics()
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error getting reconstruction metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")

@app.post("/api/portfolio/reconstruction/trigger-daily")
async def trigger_daily_reconstruction(
    api_key: str = Depends(verify_api_key)
):
    """
    Trigger daily reconstruction for all aggregation users.
    
    Called by cron at 4:30 AM EST (after market close) to reconstruct
    yesterday's portfolio values using actual transaction data.
    
    This ensures historical timelines stay up-to-date automatically.
    """
    try:
        logger.info("🔄 Daily reconstruction triggered by cron")
        
        # Get all aggregation users
        supabase = get_supabase_client()
        result = supabase.table('user_investment_accounts')\
            .select('user_id')\
            .eq('provider', 'plaid')\
            .eq('is_active', True)\
            .execute()
        
        if not result.data:
            logger.info("No aggregation users found for reconstruction")
            return {
                'success': True,
                'users_processed': 0,
                'message': 'No aggregation users to process'
            }
        
        # Get unique user IDs
        user_ids = list(set(user['user_id'] for user in result.data))
        
        logger.info(f"📊 Triggering reconstruction for {len(user_ids)} users")
        
        # Queue reconstruction for each user (low priority for automated runs)
        reconstruction_manager = get_portfolio_reconstruction_manager()
        queued_count = 0
        
        for user_id in user_ids:
            try:
                await reconstruction_manager.request_reconstruction_for_user(
                    user_id, 
                    priority='low'  # Low priority for automated runs
                )
                queued_count += 1
            except Exception as e:
                logger.error(f"Failed to queue reconstruction for user {user_id}: {e}")
                continue
        
        logger.info(f"✅ Queued {queued_count}/{len(user_ids)} users for daily reconstruction")
        
        return {
            'success': True,
            'users_found': len(user_ids),
            'users_queued': queued_count,
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in daily reconstruction trigger: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger reconstruction: {str(e)}")

# ===============================================
# DAILY SNAPSHOT ENDPOINTS (PHASE 2)
# ===============================================

@app.post("/api/portfolio/daily-snapshots/capture")
async def trigger_daily_eod_capture(
    api_key: str = Depends(verify_api_key)
):
    """
    Trigger daily end-of-day snapshot capture for all aggregation users.
    
    Called by cron job at 4 AM EST or manually for testing.
    Extends historical timelines forward with current portfolio values.
    """
    try:
        logger.info("📅 Daily EOD snapshot capture triggered")
        
        daily_service = get_daily_portfolio_service()
        result = await daily_service.capture_all_users_eod_snapshots()
        
        return {
            'success': True,
            'users_processed': result.total_users_processed,
            'successful_snapshots': result.successful_snapshots,
            'failed_snapshots': result.failed_snapshots,
            'total_portfolio_value': result.total_portfolio_value,
            'processing_duration_seconds': result.processing_duration_seconds,
            'error_count': len(result.errors)
        }
        
    except Exception as e:
        logger.error(f"Error triggering daily EOD capture: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger daily capture: {str(e)}")

# ===============================================
# LIVE PORTFOLIO TRACKING ENDPOINTS (PHASE 3)
# ===============================================

@app.post("/api/portfolio/live-tracking/start")
async def start_live_portfolio_tracking(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    # user_id now comes from authenticated JWT token, not query parameter
    # This prevents IDOR attacks where callers could start tracking for other users
    """
    Start real-time portfolio tracking for a user.
    
    Called when user opens portfolio page in aggregation mode.
    Initializes live tracking and returns initial portfolio state.
    """
    try:
        logger.info(f"📡 Starting live tracking for user {user_id}")
        
        intraday_tracker = get_intraday_portfolio_tracker()
        result = await intraday_tracker.start_live_tracking_for_user(user_id)
        
        return result
        
    except Exception as e:
        logger.error(f"Error starting live tracking: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start live tracking: {str(e)}")

@app.delete("/api/portfolio/live-tracking/stop")
async def stop_live_portfolio_tracking(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    # user_id now comes from authenticated JWT token, not query parameter
    """
    Stop real-time portfolio tracking for a user.
    
    Called when user closes portfolio page or disconnects.
    """
    try:
        intraday_tracker = get_intraday_portfolio_tracker()
        await intraday_tracker.stop_live_tracking_for_user(user_id)
        
        return {
            'success': True,
            'message': f'Live tracking stopped for user {user_id}'
        }
        
    except Exception as e:
        logger.error(f"Error stopping live tracking: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop live tracking: {str(e)}")

@app.get("/api/portfolio/live-tracking/status")
async def get_live_tracking_status(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    # user_id now comes from authenticated JWT token, not query parameter
    """
    Get live tracking status and current portfolio value.
    
    Returns real-time portfolio data for display.
    """
    try:
        intraday_tracker = get_intraday_portfolio_tracker()
        
        if user_id not in intraday_tracker.active_users:
            return {
                'tracking_active': False,
                'message': 'Live tracking not active for this user'
            }
        
        # Get current live data
        live_update = await intraday_tracker._calculate_current_portfolio_value(user_id)
        
        return {
            'tracking_active': True,
            'total_value': live_update.total_value,
            'intraday_change': live_update.intraday_change,
            'intraday_change_percent': live_update.intraday_change_percent,
            'today_high': live_update.today_high,
            'today_low': live_update.today_low,
            'account_breakdown': live_update.account_breakdown,
            'last_update': live_update.timestamp.isoformat(),
            'market_hours': intraday_tracker._is_market_hours()
        }
        
    except Exception as e:
        logger.error(f"Error getting live tracking status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get tracking status: {str(e)}")

@app.get("/api/portfolio/account-breakdown")
async def get_portfolio_account_breakdown(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Get detailed per-account portfolio breakdown for filtering UI.
    
    Returns portfolio value broken down by individual accounts
    (401k vs IRA vs brokerage, etc.) for the filtering dropdown.
    """
    try:
        # CRITICAL FIX: Always calculate LIVE account breakdown from current holdings
        # Historical snapshots are stale and don't include cash
        from utils.supabase.db_client import get_supabase_client
        supabase = get_supabase_client()
        
        # Get all current holdings with account contributions
        result = supabase.table('user_aggregated_holdings')\
            .select('symbol, security_type, total_market_value, account_contributions')\
            .eq('user_id', user_id)\
            .execute()
        
        account_breakdown = {}
        
        if result.data:
            import json
            for holding in result.data:
                market_value = float(holding.get('total_market_value', 0))
                contributions = holding.get('account_contributions', [])
                
                # Parse JSON if needed
                if isinstance(contributions, str):
                    contributions = json.loads(contributions) if contributions else []
                
                # Add each account's portion
                for contrib in contributions:
                    account_id = contrib.get('account_id', 'unknown')
                    contrib_value = float(contrib.get('market_value', 0))
                    account_breakdown[account_id] = account_breakdown.get(account_id, 0) + contrib_value
        
        logger.info(f"Account Breakdown API: Calculated live breakdown for {len(account_breakdown)} accounts")
        
        # Enhance account breakdown with account type information
        enhanced_breakdown = await _enhance_account_breakdown(user_id, account_breakdown)
        
        return {
            'account_breakdown': enhanced_breakdown,
            'total_accounts': len(enhanced_breakdown),
            'data_source': 'live_aggregated'
        }
        
    except Exception as e:
        logger.error(f"Error getting account breakdown: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get account breakdown: {str(e)}")

async def _enhance_account_breakdown(user_id: str, account_breakdown: Dict[str, float]) -> List[Dict[str, Any]]:
    """
    Enhance account breakdown with account type and institution information.
    """
    try:
        from utils.supabase.db_client import get_supabase_client
        supabase = get_supabase_client()
        
        # Get account information
        result = supabase.table('user_investment_accounts')\
            .select('id, provider_account_id, account_name, account_type, account_subtype, institution_name')\
            .eq('user_id', user_id)\
            .eq('provider', 'plaid')\
            .eq('is_active', True)\
            .execute()
        
        account_info = {}
        uuid_to_plaid_map = {}  # Map UUIDs to plaid IDs for lookup
        if result.data:
            for account in result.data:
                account_id = f"plaid_{account['provider_account_id']}"
                account_uuid = account['id']
                
                # Store both mappings
                uuid_to_plaid_map[account_uuid] = account_id
                account_info[account_id] = {
                    'uuid': account_uuid,  # CRITICAL: Include UUID for frontend filtering
                    'account_name': account['account_name'],
                    'account_type': account['account_type'],
                    'account_subtype': account['account_subtype'],
                    'institution_name': account['institution_name']
                }
        
        # Enhance breakdown with account information
        enhanced_breakdown = []
        for account_id, value in account_breakdown.items():
            if value > 0:
                info = account_info.get(account_id, {})
                enhanced_breakdown.append({
                    'account_id': account_id,  # Still include plaid_XXXX for backwards compat
                    'uuid': info.get('uuid'),  # CRITICAL: UUID for filtering
                    'account_name': info.get('account_name', 'Unknown Account'),
                    'account_type': info.get('account_type', 'unknown'),
                    'account_subtype': info.get('account_subtype', 'unknown'),
                    'institution_name': info.get('institution_name', 'Unknown Institution'),
                    'portfolio_value': value,
                    'percentage': 0.0  # Will be calculated by frontend
                })
        
        # Sort by value descending
        enhanced_breakdown.sort(key=lambda x: x['portfolio_value'], reverse=True)
        
        return enhanced_breakdown
        
    except Exception as e:
        logger.error(f"Error enhancing account breakdown: {e}")
        return []

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
    Initiate the COMPLETE automated account closure process.
    
    This starts the full automated closure pipeline:
    1. Cancel all open orders & liquidate positions (immediate)
    2. Start automated background process for:
       - Settlement waiting
       - Multi-day fund withdrawal ($50k chunks with 24hr delays)
       - Final account closure
    
    Body should contain:
    {
        "ach_relationship_id": "string",
        "confirm_liquidation": true,
        "confirm_irreversible": true
    }
    """
    try:
        logger.info(f"Initiating AUTOMATED closure for account {account_id}")
        
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
        
        # CRITICAL FIX: Get user_id from Supabase for automated process using async pattern
        try:
            from utils.supabase.db_client import get_user_id_by_alpaca_account_id
            
            # Use async wrapper to prevent event loop blocking
            user_id = await asyncio.to_thread(get_user_id_by_alpaca_account_id, account_id)
            
            if not user_id:
                raise HTTPException(status_code=404, detail="User not found for account ID")
                
            logger.info(f"Found user_id {user_id} for account {account_id}")
            
        except HTTPException:
            raise  # Re-raise HTTP exceptions without modification
        except Exception as e:
            logger.error(f"Failed to get user_id for account {account_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to identify user for automated process")
        
        # Use sandbox mode based on environment
        sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
        
        # CRITICAL FIX: Use AutomatedAccountClosureProcessor instead of basic initiation
        from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
        
        processor = AutomatedAccountClosureProcessor(sandbox=sandbox)
        result = await processor.initiate_automated_closure(
            user_id=user_id,
            account_id=account_id, 
            ach_relationship_id=ach_relationship_id
        )
        
        if result.get("success"):
            logger.info(f"Automated account closure initiated successfully for account {account_id}")
        else:
            logger.error(f"Automated account closure failed for account {account_id}: {result.get('error')}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error initiating automated closure for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error initiating automated account closure: {str(e)}")

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
        
        # Get Supabase data for confirmation number and initiation date using async pattern
        supabase_data = {}
        try:
            from utils.supabase.db_client import get_supabase_client
            
            # Helper function for async wrapper
            def get_account_closure_metadata(account_id: str) -> dict:
                supabase = get_supabase_client()
                result = supabase.table("user_onboarding").select(
                    "account_closure_confirmation_number, account_closure_initiated_at, onboarding_data"
                ).eq("alpaca_account_id", account_id).execute()
                
                if result.data:
                    user_data = result.data[0]
                    return {
                        "confirmation_number": user_data.get("account_closure_confirmation_number"),
                        "initiated_at": user_data.get("account_closure_initiated_at"),
                        "closure_details": user_data.get("onboarding_data", {}).get("account_closure", {})
                    }
                return {}
            
            # Use async wrapper to prevent event loop blocking
            supabase_data = await asyncio.to_thread(get_account_closure_metadata, account_id)
            
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
    except ValueError as e:
        # Manager signals not found via ValueError; surface as 404 without string matching
        raise HTTPException(status_code=404, detail=str(e))
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

# ============================================================================
# PRODUCTION TASK MONITORING - Account Closure Background Process Management
# ============================================================================

@app.get("/account-closure/task-status/{account_id}")
async def get_account_closure_task_status_endpoint(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Get status of active background task for a specific account closure.
    
    PRODUCTION ENDPOINT: Enables monitoring of running closure processes.
    """
    try:
        from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
        
        status = AutomatedAccountClosureProcessor.get_active_task_status(account_id)
        
        return {
            "account_id": account_id,
            "task_status": status,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting task status for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting task status: {str(e)}")

@app.post("/account-closure/cancel-task/{account_id}")
async def cancel_account_closure_task_endpoint(
    account_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Cancel active background task for a specific account closure.
    
    PRODUCTION ENDPOINT: Enables stopping runaway or problematic processes.
    """
    try:
        from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
        
        cancelled = await AutomatedAccountClosureProcessor.cancel_active_task(account_id)
        
        if cancelled:
            logger.info(f"Cancelled closure task for account {account_id}")
            return {
                "success": True,
                "message": f"Task for account {account_id} has been cancelled",
                "account_id": account_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        else:
            return {
                "success": False,
                "message": f"No active task found for account {account_id}",
                "account_id": account_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        
    except Exception as e:
        logger.error(f"Error cancelling task for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error cancelling task: {str(e)}")

@app.get("/account-closure/all-active-tasks")
async def get_all_active_tasks_endpoint(
    api_key: str = Depends(verify_api_key)
):
    """
    Get status of all active account closure tasks across the system.
    
    PRODUCTION MONITORING: Provides system-wide visibility of running processes.
    """
    try:
        from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
        
        all_tasks = AutomatedAccountClosureProcessor.get_all_active_tasks()
        
        return {
            "active_tasks": all_tasks,
            "total_active": len(all_tasks),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting all active tasks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting active tasks: {str(e)}")

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


# === USER PREFERENCES ENDPOINTS ===

@app.get("/api/user/preferences")
async def get_user_preferences(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Get user's trading preferences.
    
    PRODUCTION-GRADE: Returns user preferences for trading behavior.
    """
    try:
        supabase = get_supabase_client()
        
        result = supabase.table('user_preferences')\
            .select('buying_power_display')\
            .eq('user_id', user_id)\
            .execute()
        
        # Return default if no preferences exist yet
        if not result.data or len(result.data) == 0:
            return {
                'success': True,
                'preferences': {
                    'buying_power_display': 'cash_only'
                }
            }
        
        return {
            'success': True,
            'preferences': {
                'buying_power_display': result.data[0].get('buying_power_display', 'cash_only')
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching user preferences: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/user/preferences/buying-power")
async def update_buying_power_preference(
    request: Request,
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Update user's buying power display preference.
    
    PRODUCTION-GRADE: Allows users to choose between cash_only (safer, default)
    or cash_and_margin (includes margin for experienced traders).
    
    Body:
        {
            "buying_power_display": "cash_only" | "cash_and_margin"
        }
    """
    try:
        body = await request.json()
        buying_power_display = body.get('buying_power_display')
        
        # Validate input
        if buying_power_display not in ['cash_only', 'cash_and_margin']:
            raise HTTPException(
                status_code=400,
                detail="Invalid value. Must be 'cash_only' or 'cash_and_margin'"
            )
        
        supabase = get_supabase_client()
        
        # Upsert user preference (insert if doesn't exist, update if it does)
        supabase.table('user_preferences')\
            .upsert({
                'user_id': user_id,
                'buying_power_display': buying_power_display,
                'updated_at': datetime.now().isoformat()
            }, on_conflict='user_id')\
            .execute()
        
        logger.info(f"Updated buying power preference for user {user_id}: {buying_power_display}")
        
        return {
            'success': True,
            'message': f'Buying power display updated to: {buying_power_display}',
            'preference': buying_power_display
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating buying power preference: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# === USER-BASED WATCHLIST ENDPOINTS (Aggregation & Brokerage Mode) ===
# These endpoints work for all users regardless of having an Alpaca account

@app.get("/api/user/watchlist", response_model=WatchlistResponse)
async def get_user_watchlist(
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Get user's watchlist (works for both aggregation and brokerage modes).
    Stores watchlist in Supabase, independent of Alpaca accounts.
    
    SECURITY: user_id is derived from JWT token to prevent IDOR attacks.
    """
    try:
        logger.info(f"Getting watchlist for user {user_id}")
        
        symbols = UserWatchlistService.get_user_watchlist(user_id)
        watchlist_details = UserWatchlistService.get_watchlist_details(user_id)
        
        return WatchlistResponse(**watchlist_details)
        
    except Exception as e:
        logger.error(f"Error getting watchlist for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get watchlist: {str(e)}"
        )


@app.post("/api/user/watchlist/add")
async def add_symbol_to_user_watchlist(
    request: AddToWatchlistRequest,
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Add a symbol to user's watchlist (works for both aggregation and brokerage modes).
    
    SECURITY: user_id is derived from JWT token to prevent IDOR attacks.
    """
    try:
        symbol = request.symbol.upper().strip()
        logger.info(f"Adding symbol {symbol} to watchlist for user {user_id}")
        
        # Check if already in watchlist
        already_exists = UserWatchlistService.is_symbol_in_watchlist(user_id, symbol)
        
        if already_exists:
            return {
                "success": True,
                "message": f"Symbol {symbol} is already in watchlist",
                "symbol": symbol,
                "added": False
            }
        
        # Add to watchlist
        success = UserWatchlistService.add_symbol_to_watchlist(user_id, symbol)
        
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
        logger.error(f"Error adding symbol {request.symbol} to watchlist for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add symbol to watchlist: {str(e)}"
        )


@app.delete("/api/user/watchlist/remove")
async def remove_symbol_from_user_watchlist(
    request: RemoveFromWatchlistRequest,
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Remove a symbol from user's watchlist (works for both aggregation and brokerage modes).
    
    SECURITY: user_id is derived from JWT token to prevent IDOR attacks.
    """
    try:
        symbol = request.symbol.upper().strip()
        logger.info(f"Removing symbol {symbol} from watchlist for user {user_id}")
        
        # Check if in watchlist
        exists = UserWatchlistService.is_symbol_in_watchlist(user_id, symbol)
        
        if not exists:
            return {
                "success": True,
                "message": f"Symbol {symbol} is not in watchlist",
                "symbol": symbol,
                "removed": False
            }
        
        # Remove from watchlist
        success = UserWatchlistService.remove_symbol_from_watchlist(user_id, symbol)
        
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
        logger.error(f"Error removing symbol {request.symbol} from watchlist for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove symbol from watchlist: {str(e)}"
        )


# Add PII management endpoints after the existing account-related endpoints

@app.get("/api/account/{account_id}/pii", response_model=dict)
async def get_account_pii(
    account_id: str, 
    broker_client = Depends(get_broker_client),
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

# Import the new asset classification utilities
from utils.asset_classification import calculate_allocation, get_allocation_pie_data, AssetClassification

@app.get("/api/portfolio/cash-stock-bond-allocation")
async def get_cash_stock_bond_allocation(
    request: Request,
    account_id: str = Query(..., description="The account ID"),
    user_id: str = Depends(get_authenticated_user_id),
    filter_account: Optional[str] = Query(None, description="Filter to specific account for account-level allocation"),
    api_key: str = Depends(verify_api_key)
):
    """
    Get portfolio allocation split into cash, stocks, and bonds.
    
    This endpoint provides a more accurate allocation breakdown compared to 
    the simple asset_class grouping, specifically identifying bond ETFs as bonds
    rather than equities.
    
    Supports account-level filtering for X-Ray Vision into individual accounts.
    
    Returns:
        {
            'cash': {'value': float, 'percentage': float},
            'stock': {'value': float, 'percentage': float}, 
            'bond': {'value': float, 'percentage': float},
            'total_value': float,
            'pie_data': [{'name': str, 'value': float, 'rawValue': float, 'color': str}]
        }
    """
    try:
        # CRITICAL FIX: Support aggregation mode for asset allocation
        feature_flags = get_feature_flags()
        portfolio_mode = feature_flags.get_portfolio_mode(user_id)
        
        logger.info(f"Asset allocation request for user {user_id}, account {account_id}, mode: {portfolio_mode}, filter: {filter_account}")
        
        # Handle aggregation mode - use Plaid aggregated data with optional filtering
        if portfolio_mode == 'aggregation':
            logger.info(f"Aggregation mode: Getting asset allocation from aggregated holdings for user {user_id}")
            
            # Use account filtering service for clean separation of concerns
            from utils.portfolio.account_filtering_service import get_account_filtering_service
            filter_service = get_account_filtering_service()
            
            # Get filtered holdings
            filtered_holdings = await filter_service.filter_holdings_by_account(user_id, filter_account)
            
            # Calculate allocation on filtered holdings
            from utils.portfolio.aggregated_calculations import calculate_asset_allocation
            return calculate_asset_allocation(filtered_holdings, user_id)
        
        # Handle brokerage/hybrid mode - use existing Alpaca logic
        # Initialize broker_client to prevent NameError
        broker_client = None
        
        # Get Redis client for position data
        positions_key = f'account_positions:{account_id}'
        if hasattr(request.app.state, 'redis') and request.app.state.redis:
            redis_client = request.app.state.redis
            # Check if Redis client is async or sync
            result = redis_client.get(positions_key)
            if hasattr(result, '__await__'):
                positions_data_json = await result
            else:
                positions_data_json = result
        else:
            redis_client = await get_redis_client()
            # Use async Redis client (with await) if available
            if redis_client:
                positions_data_json = await redis_client.get(positions_key)
            else:
                positions_data_json = None
        
        if not positions_data_json:
            # Fallback: Fetch positions directly from Alpaca
            logger.info(f"Positions not in Redis for account {account_id}, fetching from Alpaca")
            try:
                broker_client = get_broker_client()
                alpaca_positions = await asyncio.to_thread(
                    broker_client.get_all_positions_for_account, UUID(account_id)
                )
                
                # Convert Alpaca positions to dict format
                positions = []
                for pos in alpaca_positions:
                    positions.append({
                        'symbol': pos.symbol,
                        'market_value': str(pos.market_value),
                        'asset_class': str(pos.asset_class.value) if pos.asset_class else 'us_equity',
                        'qty': str(pos.qty),
                        'current_price': str(pos.current_price)
                    })
            except Exception as e:
                logger.error(f"Error fetching positions from Alpaca for account {account_id}: {e}")
                positions = []
        else:
            try:
                positions = json.loads(positions_data_json)
            except json.JSONDecodeError:
                logger.error(f"Failed to decode positions JSON for account {account_id}")
                positions = []
        
        # 2. Get cash balance from account
        cash_balance = Decimal('0')
        try:
            if not broker_client:
                broker_client = get_broker_client()
            account = await asyncio.to_thread(
                broker_client.get_trade_account_by_id, UUID(account_id)
            )
            cash_balance = Decimal(str(account.cash)) if account.cash is not None else Decimal('0')
        except Exception as e:
            logger.error(f"Error fetching cash balance for account {account_id}: {e}")
            # Cash balance will remain 0
        
        # 3. Get asset details for enhanced classification
        # Load asset cache once outside the loop for performance
        cached_assets = {}
        if os.path.exists(ASSET_CACHE_FILE):
            with open(ASSET_CACHE_FILE, 'r') as f:
                cached_assets_list = json.load(f)
                cached_assets = {asset.get('symbol'): asset for asset in cached_assets_list}
        
        # Try to enrich positions with asset names for better bond detection
        enriched_positions = []
        for position in positions:
            enriched_position = position.copy()
            
            # Try to get asset name from cache or API
            try:
                symbol = position.get('symbol')
                if symbol:
                    
                    if symbol in cached_assets:
                        enriched_position['name'] = cached_assets[symbol].get('name')
                    else:
                        # Try to fetch from Alpaca API (but don't fail if it doesn't work)
                        try:
                            if broker_client:
                                asset_details = await asyncio.to_thread(
                                    broker_client.get_asset, symbol
                                )
                            else:
                                asset_details = None
                            if asset_details and hasattr(asset_details, 'name'):
                                enriched_position['name'] = asset_details.name
                        except:
                            pass  # Continue without name
            except:
                pass  # Continue without enrichment
            
            enriched_positions.append(enriched_position)
        
        # 4. Calculate allocation using our classification logic
        allocation = calculate_allocation(enriched_positions, cash_balance)
        
        # 5. Generate pie chart data
        pie_data = get_allocation_pie_data(allocation)
        
        # 6. Format response with float values for JSON serialization
        response = {
            'cash': {
                'value': float(allocation['cash']['value']),
                'percentage': float(allocation['cash']['percentage'])
            },
            'stock': {
                'value': float(allocation['stock']['value']),
                'percentage': float(allocation['stock']['percentage'])
            },
            'bond': {
                'value': float(allocation['bond']['value']),
                'percentage': float(allocation['bond']['percentage'])
            },
            'total_value': float(allocation['total_value']),
            'pie_data': pie_data
        }
        
        logger.info(f"Cash/Stock/Bond allocation calculated for account {account_id}: "
                   f"Cash: {response['cash']['percentage']}%, "
                   f"Stock: {response['stock']['percentage']}%, "
                   f"Bond: {response['bond']['percentage']}%")
        
        return response
        
    except Exception as e:
        logger.error(f"Error calculating cash/stock/bond allocation for account {account_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

# ===== PORTFOLIO AGGREGATION TEST ENDPOINTS =====
# These endpoints test the new Plaid Investment API integration


@app.post("/api/test/plaid/create-link-token")
async def test_create_plaid_link_token(
    request: dict,
    api_key: str = Header(None, alias="X-API-Key")
):
    """Test endpoint to create Plaid Link token for investment accounts."""
    try:
        logger.info(f"📋 Plaid link token request received: {request}")
        
        # Validate API key (following existing pattern)
        expected_api_key = os.getenv("BACKEND_API_KEY")
        if not api_key or not expected_api_key or not hmac.compare_digest(api_key, expected_api_key):
            logger.error("❌ Invalid API key for Plaid link token")
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        # Get user_id from request body (following chat API pattern)
        user_id = request.get('user_id')
        if not user_id:
            logger.error("❌ Missing user_id in request")
            raise HTTPException(status_code=400, detail="user_id is required")
        
        user_email = request.get('email', 'test@example.com')
        logger.info(f"🔗 Creating Plaid link token for user {user_id} with email {user_email}")
        
        portfolio_service = get_portfolio_service()
        logger.info("✅ Portfolio service retrieved")
        
        link_token = await portfolio_service.connect_plaid_account(user_id, user_email)
        logger.info(f"✅ Link token created successfully: {link_token[:20]}...")
        
        return {
            "success": True,
            "link_token": link_token,
            "user_id": user_id
        }
        
    except ProviderError as e:
        logger.error(f"❌ Provider error creating link token: {e}")
        return JSONResponse(
            status_code=400,
            content=e.to_dict()
        )
    except Exception as e:
        logger.error(f"❌ Error creating Plaid link token: {e}")
        logger.error(f"❌ Error details: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create link token: {str(e)}")

@app.post("/api/test/plaid/exchange-token")
async def test_exchange_plaid_token(
    request: dict,
    api_key: str = Header(None, alias="X-API-Key")
):
    """Test endpoint to exchange Plaid public token for access token."""
    try:
        # Validate API key (following existing pattern)
        expected_api_key = os.getenv("BACKEND_API_KEY")
        if not api_key or not expected_api_key or not hmac.compare_digest(api_key, expected_api_key):
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        # Get user_id from request body (following chat API pattern)
        user_id = request.get('user_id')
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        
        public_token = request.get('public_token')
        institution_name = request.get('institution_name', 'Test Institution')
        
        if not public_token:
            raise HTTPException(status_code=400, detail="public_token is required")
        
        portfolio_service = get_portfolio_service()
        result = await portfolio_service.complete_plaid_connection(
            user_id, public_token, institution_name
        )
        
        return result
        
    except ProviderError as e:
        logger.error(f"Provider error exchanging token: {e}")
        return JSONResponse(
            status_code=400,
            content=e.to_dict()
        )
    except Exception as e:
        logger.error(f"Error exchanging Plaid token: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to exchange token: {str(e)}")

@app.post("/api/test/portfolio/aggregated")
async def test_get_aggregated_portfolio(
    request: dict,
    api_key: str = Header(None, alias="X-API-Key")
):
    """Test endpoint to get aggregated portfolio data from all connected accounts."""
    try:
        # Validate API key (following existing pattern)
        expected_api_key = os.getenv("BACKEND_API_KEY")
        if not api_key or not expected_api_key or not hmac.compare_digest(api_key, expected_api_key):
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        # Get user_id from request body (following chat API pattern)
        user_id = request.get('user_id')
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        
        # PRODUCTION GRADE: Support force refresh and flexible cache control
        force_refresh = request.get('force_refresh', False)
        max_age_minutes = request.get('max_age_minutes', 30)
        
        logger.info(f"📊 Portfolio request for user {user_id}: force_refresh={force_refresh}, max_age={max_age_minutes}min")
        
        # Use sync service for production-ready data loading
        from utils.portfolio.sync_service import sync_service
        portfolio_data = await sync_service.ensure_user_portfolio_fresh(
            user_id, 
            max_age_minutes=max_age_minutes,
            force_refresh=force_refresh
        )
        
        return {
            "success": True,
            "data": portfolio_data
        }
        
    except ProviderError as e:
        logger.error(f"Provider error getting portfolio: {e}")
        return JSONResponse(
            status_code=400,
            content=e.to_dict()
        )
    except Exception as e:
        logger.error(f"Error getting aggregated portfolio: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get portfolio: {str(e)}")

@app.get("/api/test/portfolio/health")
async def test_portfolio_health():
    """Test endpoint to check health of all portfolio providers."""
    try:
        portfolio_service = get_portfolio_service()
        health_status = await portfolio_service.get_provider_health()
        
        return health_status
        
    except Exception as e:
        logger.error(f"Error checking portfolio health: {e}")
        return {
            "overall_status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.post("/api/test/user/investment-accounts")
async def test_get_user_investment_accounts(
    request: dict,
    api_key: str = Header(None, alias="X-API-Key")
):
    """Test endpoint to get user's connected investment accounts from database."""
    try:
        # Validate API key (following existing pattern)
        expected_api_key = os.getenv("BACKEND_API_KEY")
        if not api_key or not expected_api_key or not hmac.compare_digest(api_key, expected_api_key):
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        # Get user_id from request body (following chat API pattern)
        user_id = request.get('user_id')
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        
        from utils.supabase.db_client import get_supabase_client
        
        supabase = get_supabase_client()
        result = supabase.table('user_investment_accounts')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .execute()
        
        return {
            "success": True,
            "user_id": user_id,
            "accounts": result.data or [],
            "count": len(result.data or [])
        }
        
    except Exception as e:
        logger.error(f"Error getting user investment accounts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get accounts: {str(e)}")

# ===== PRODUCTION PORTFOLIO API ENDPOINTS =====
# These endpoints provide portfolio data for the main /portfolio page

from utils.feature_flags import get_feature_flags, FeatureFlagKey

@app.get("/api/portfolio/aggregated")
async def get_aggregated_portfolio_positions(
    user_id: str = Depends(get_authenticated_user_id),
    filter_account: Optional[str] = Query(None, description="Filter to specific account UUID for account-specific view"),
    include_clera: bool = Query(False, description="Include Clera brokerage positions (future hybrid mode)"),
    source_filter: Optional[str] = Query(None, description="Filter by source: 'clera', 'external', or None for all")
):
    """
    Get aggregated portfolio positions with future-ready hybrid mode support and account filtering.
    
    This endpoint transforms Plaid aggregated data into PositionData format and
    is ready for future hybrid mode combining Clera + external account data.
    Supports account-level filtering for X-Ray Vision into individual accounts.
    
    Args:
        user_id: Authenticated user ID
        filter_account: Optional account UUID to filter to specific account
        include_clera: If True, includes Clera brokerage positions (future feature)
        source_filter: Filter positions by source ('clera', 'external', None)
    """
    try:
        feature_flags = get_feature_flags()
        portfolio_mode = feature_flags.get_portfolio_mode(user_id)
        
        logger.info(f"📊 Portfolio aggregated request for user {user_id}, mode: {portfolio_mode}")
        
        if portfolio_mode == "disabled":
            return []
        
        # FUTURE-READY: Collect positions from multiple sources
        all_positions = []
        external_positions = []
        clera_positions = []
        
        # Get external account data (SnapTrade/Plaid aggregated holdings) - CURRENT IMPLEMENTATION
        if portfolio_mode in ['aggregation', 'hybrid']:
            # CRITICAL: Query user_aggregated_holdings directly for SnapTrade/Plaid data
            # This table is populated by snaptrade_sync_service and plaid background sync
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            logger.info(f"📊 Fetching aggregated holdings from database for user {user_id}")
            holdings_result = supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', user_id)\
                .execute()
            
            if holdings_result.data:
                logger.info(f"✅ Found {len(holdings_result.data)} aggregated holdings for user {user_id}")
                
                # CRITICAL: Enrich with live market prices using production-grade enrichment service
                # Uses FMP API (10x cheaper than Alpaca) with 60-second caching
                from utils.portfolio.live_enrichment_service import get_enrichment_service
                enrichment_service = get_enrichment_service()
                
                # Enrich holdings with live prices
                enriched_holdings = enrichment_service.enrich_holdings(holdings_result.data, user_id)
                
                # Transform to position format
                external_positions = []
                for h in enriched_holdings:
                    symbol = h['symbol']
                    quantity = float(h['total_quantity'])
                    cost_basis = float(h['total_cost_basis'])
                    market_value = float(h['total_market_value'])
                    unrealized_pl = float(h['unrealized_gain_loss'])
                    
                    # CRITICAL: enrichment service returns percentage as decimal already
                    # Frontend expects DECIMAL (0.7641) and will multiply by 100 for display
                    # PRODUCTION-GRADE: Use safe .get() to prevent KeyError if enrichment fails
                    unrealized_pl_percent = float(h.get('unrealized_gain_loss_percent', 0)) / 100 if not h.get('price_is_live') else (unrealized_pl / cost_basis) if cost_basis > 0 else 0
                    
                    current_price = (market_value / quantity) if quantity > 0 else 0
                    
                    external_positions.append({
                        'symbol': symbol,
                        'total_quantity': quantity,
                        'market_value': market_value,
                        'total_market_value': market_value,
                        'cost_basis': cost_basis,
                        'total_cost_basis': cost_basis,
                        'average_cost_basis': float(h['average_cost_basis']),
                        'current_price': current_price,
                        'unrealized_gain_loss': unrealized_pl,
                        'unrealized_gain_loss_percent': unrealized_pl_percent,
                        'security_name': h.get('security_name'),
                        'security_type': h.get('security_type'),
                        'data_source': 'external',
                        'account_id': 'aggregated',
                        'account_contributions': h.get('account_contributions', [])
                    })
                
                logger.info(f"💰 Total portfolio value: ${sum(p['market_value'] for p in external_positions):,.2f}")
            else:
                logger.warning(f"⚠️  No aggregated holdings found for user {user_id}")
                external_positions = []
        
        # Get Clera brokerage data (when include_clera=True or brokerage mode)
        if include_clera and portfolio_mode in ['brokerage', 'hybrid']:
            logger.info(f"🏦 Including Clera brokerage positions for user {user_id}")
            from utils.portfolio.alpaca_provider import get_clera_positions_aggregated
            clera_positions = await get_clera_positions_aggregated(user_id)
        
        # Combine positions based on source filter
        if source_filter == 'external':
            filtered_positions = external_positions
        elif source_filter == 'clera':
            filtered_positions = clera_positions  # Future implementation
        else:
            # Default: combine all sources (or just external for now)
            filtered_positions = external_positions + clera_positions
        
        # CRITICAL: Filter positions by account if filter_account is specified
        if filter_account and filter_account != 'total':
            logger.info(f"🔍 Filtering positions to account: {filter_account}")
            from utils.portfolio.account_filtering_service import get_account_filtering_service
            filter_service = get_account_filtering_service()
            
            # Get filtered holdings from the aggregated holdings table
            filtered_holdings = await filter_service.filter_holdings_by_account(user_id, filter_account)
            
            # Convert filtered holdings back to the positions format
            filtered_positions = filtered_holdings
            logger.info(f"✅ Filtered {len(filtered_positions)} positions for account {filter_account}")
        
        # Transform to PositionData format expected by frontend components
        positions = []
        total_portfolio_value = 0
        
        # CRITICAL: Calculate total portfolio value INCLUDING cash
        # Cash is excluded from holdings display, but MUST be included in portfolio value
        if filtered_positions:
            total_portfolio_value = sum(pos.get('total_market_value', 0) for pos in filtered_positions)
        
        # Transform each position to PositionData format with SOURCE ATTRIBUTION
        for position in filtered_positions:
            # CRITICAL: Filter out cash positions from portfolio holdings TABLE display
            # Cash should NOT appear in the holdings table, but IS included in total portfolio value
            if (position.get('security_type') == 'cash' or 
                position.get('symbol') == 'U S Dollar' or
                position.get('symbol') == 'USD'):
                continue  # Skip cash positions in holdings TABLE (cash is still in total_portfolio_value)
            # Determine position source for filtering capabilities
            institution_info = position.get('institutions', ['Unknown'])
            
            # Detect Clera positions vs external positions
            if 'Clera' in institution_info:
                position_source = 'clera'
            else:
                position_source = 'external'
            position_data = {
                # Standard PositionData fields
                "asset_id": f"{position_source}_{position['symbol']}",  # Source-attributed ID
                "symbol": position['symbol'],
                "exchange": "AGGREGATED" if position_source == 'external' else "CLERA",
                "asset_class": _map_security_type_to_asset_class(position.get('security_type', '')),
                "avg_entry_price": str(position.get('average_cost_basis', 0)),
                "qty": str(position.get('total_quantity', 0)),
                "side": position.get('side', 'long') if position_source == 'clera' else "long",  # Clera may have short positions
                "market_value": str(position.get('total_market_value', 0)),
                "cost_basis": str(position.get('total_cost_basis', 0)),
                "unrealized_pl": str(position.get('unrealized_gain_loss', 0)),
                "unrealized_plpc": (
                    "N/A" if (
                        position.get('unrealized_gain_loss_percent') is None or 
                        position.get('unrealized_gain_loss_percent') <= -999999
                    )
                    else str(position.get('unrealized_gain_loss_percent', 0))
                ),
                # Conditional data based on source (Clera has more real-time data)
                "unrealized_intraday_pl": str(position.get('change_today', 0)) if position_source == 'clera' else "0",
                "unrealized_intraday_plpc": str(position.get('change_today_percent', 0)) if position_source == 'clera' else "0",
                "current_price": str(
                    position.get('current_price', 0) if position_source == 'clera' else
                    (position.get('total_market_value', 0) / position.get('total_quantity', 1)
                     if position.get('total_quantity', 0) > 0 else 0)
                ),
                "lastday_price": str(
                    position.get('current_price', 0) if position_source == 'clera' else
                    (position.get('total_market_value', 0) / position.get('total_quantity', 1)
                     if position.get('total_quantity', 0) > 0 else 0)
                ),
                "change_today": str(position.get('change_today', 0)) if position_source == 'clera' else "0",
                "asset_marginable": position.get('is_marginable', False) if position_source == 'clera' else False,
                "asset_shortable": position.get('is_shortable', False) if position_source == 'clera' else False,
                "asset_easy_to_borrow": position.get('is_easy_to_borrow', False) if position_source == 'clera' else False,
                
                # Frontend-specific additions
                "name": position.get('security_name', position['symbol']),
                "weight": (
                    (position.get('total_market_value', 0) / total_portfolio_value * 100)
                    if total_portfolio_value > 0 else 0
                ),
                
                # FUTURE-READY: Enhanced source attribution and per-account insights
                "data_source": position_source,  # 'external' or 'clera' for filtering
                "institutions": institution_info,
                "account_count": len(position.get('accounts', [])),
                "account_breakdown": position.get('accounts', []),
                
                # FUTURE-READY: Source-specific metadata
                "source_metadata": {
                    "provider": "plaid" if position_source == 'external' else "alpaca",
                    "aggregated_across_accounts": len(position.get('accounts', [])) > 1,
                    "can_trade": position_source == 'clera',  # Only Clera positions are tradeable
                    "is_external": position_source == 'external'
                }
            }
            positions.append(position_data)
        
        # Sort by market value (descending) to match existing behavior
        positions.sort(key=lambda x: float(x.get('market_value', 0)), reverse=True)
        
        # FUTURE-READY: Provide source summary for filtering UI
        external_count = len([p for p in positions if p.get('data_source') == 'external'])
        clera_count = len([p for p in positions if p.get('data_source') == 'clera'])
        external_value = sum(float(p.get('market_value', 0)) for p in positions if p.get('data_source') == 'external')
        clera_value = sum(float(p.get('market_value', 0)) for p in positions if p.get('data_source') == 'clera')
        
        filter_msg = f", filtered to account: {filter_account}" if filter_account and filter_account != 'total' else ""
        logger.info(f"📊 Portfolio composition: {external_count} external positions (${external_value:,.2f}), {clera_count} Clera positions (${clera_value:,.2f}){filter_msg}")
        logger.info(f"💰 TOTAL PORTFOLIO VALUE (incl. cash): ${total_portfolio_value:,.2f}")
        
        # Return structured response for frontend
        return {
            "positions": positions,  # Holdings table (excludes cash)
            "summary": {
                "total_value": total_portfolio_value,  # INCLUDES cash for accurate portfolio value
                "total_positions": len(positions),  # Number of holdings displayed (excludes cash)
                "portfolio_mode": portfolio_mode
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting aggregated portfolio for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get aggregated portfolio: {str(e)}")

def _map_security_type_to_asset_class(security_type: str) -> str:
    """
    Map Plaid security types to Alpaca asset classes for frontend compatibility.
    
    Args:
        security_type: Plaid security type (equity, mutual_fund, etf, etc.)
        
    Returns:
        Alpaca-compatible asset class string
    """
    mapping = {
        'equity': 'us_equity',
        'etf': 'us_equity',  # ETFs are treated as equities
        'mutual_fund': 'us_equity',  # Mutual funds treated as equities for allocation
        'bond': 'fixed_income',
        'cash': 'cash',
        'crypto': 'crypto',
        'option': 'option',
        'other': 'us_equity'  # Default to equity for unknown types
    }
    
    return mapping.get(security_type.lower(), 'us_equity')

@app.get("/api/portfolio/connection-status")
async def get_portfolio_connection_status(
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get portfolio connection status for account management."""
    try:
        feature_flags = get_feature_flags()
        portfolio_mode = feature_flags.get_portfolio_mode(user_id)
        
        # Check connected accounts
        from utils.supabase.db_client import get_supabase_client
        supabase = get_supabase_client()
        
        # Get Plaid connections
        plaid_accounts = []
        if feature_flags.is_enabled(FeatureFlagKey.AGGREGATION_MODE.value, user_id):
            result = supabase.table('user_investment_accounts')\
                .select('id, institution_name, account_name, is_active, last_synced')\
                .eq('user_id', user_id)\
                .eq('provider', 'plaid')\
                .execute()
            plaid_accounts = result.data or []
        
        # Get SnapTrade connections
        snaptrade_accounts = []
        try:
            snaptrade_result = supabase.table('user_investment_accounts')\
                .select('id, institution_name, account_name, brokerage_name, connection_type, is_active, last_synced')\
                .eq('user_id', user_id)\
                .eq('provider', 'snaptrade')\
                .eq('is_active', True)\
                .execute()
            snaptrade_accounts = snaptrade_result.data or []
        except Exception as snaptrade_error:
            logger.warning(f"Error fetching SnapTrade accounts for user {user_id}: {snaptrade_error}")
        
        # Get Alpaca connection (if enabled)
        alpaca_account = None
        if feature_flags.is_enabled(FeatureFlagKey.BROKERAGE_MODE.value, user_id):
            result = supabase.table('user_onboarding')\
                .select('alpaca_account_id, alpaca_account_status')\
                .eq('user_id', user_id)\
                .single()
            
            if result.data and result.data.get('alpaca_account_id'):
                alpaca_account = {
                    'account_id': result.data['alpaca_account_id'],
                    'status': result.data.get('alpaca_account_status', 'unknown'),
                    'provider': 'alpaca'
                }
        
        total_accounts = len(plaid_accounts) + len(snaptrade_accounts) + (1 if alpaca_account else 0)
        
        return {
            'portfolio_mode': portfolio_mode,
            'plaid_accounts': plaid_accounts,
            'snaptrade_accounts': snaptrade_accounts,
            'alpaca_account': alpaca_account,
            'total_connected_accounts': total_accounts
        }
        
    except Exception as e:
        logger.error(f"Error getting connection status for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get connection status: {str(e)}")

# ===== PLAID WEBHOOK HANDLER FOR PRODUCTION =====

from utils.portfolio.webhook_handler import webhook_handler

@app.post("/webhook/plaid")
async def plaid_webhook_endpoint(
    request: Request,
    api_key: str = Header(None, alias="X-API-Key"),
    plaid_signature: str = Header(None, alias="X-Plaid-Signature")
):
    """
    Production webhook endpoint for Plaid Investment API updates.
    
    Supports:
    - HOLDINGS.DEFAULT_UPDATE: Holdings quantity or price changes
    - INVESTMENTS_TRANSACTIONS.DEFAULT_UPDATE: New transactions detected
    
    Security:
    - API key validation
    - Webhook signature verification (production)
    - Request logging and monitoring
    """
    try:
        # Get raw request body for signature verification
        request_body = await request.body()
        
        # Parse JSON from body
        try:
            webhook_data = json.loads(request_body.decode('utf-8'))
        except json.JSONDecodeError as json_err:
            raise json.JSONDecodeError("Invalid JSON in webhook payload", request_body.decode('utf-8'), 0)
        
        logger.info(f"📨 Plaid webhook endpoint called: {webhook_data.get('webhook_type', 'UNKNOWN')}.{webhook_data.get('webhook_code', 'UNKNOWN')}")
        
        # Process webhook with full security features
        result = await webhook_handler.handle_webhook(
            webhook_data, 
            api_key,
            request_body,
            plaid_signature
        )
        
        return result
        
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in Plaid webhook: {e}")
        return {"acknowledged": False, "error": "Invalid JSON payload"}
    except Exception as e:
        logger.error(f"Error in Plaid webhook endpoint: {e}")
        return {"acknowledged": False, "error": str(e)}

# ===== END PORTFOLIO AGGREGATION TEST ENDPOINTS =====

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
