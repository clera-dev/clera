#portfolio_management_agent.py

# Import necessary libraries
import os
import logging
from dotenv import load_dotenv
from langchain_core.tools import tool

from urllib.request import urlopen
import certifi
import json
from typing import List, Optional, Dict
from decimal import Decimal

# Load environment variables first, with override to ensure they're set
load_dotenv(override=True)
fin_modeling_prep_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

from alpaca.broker import BrokerClient
from langgraph.pregel import Pregel # Import if needed to understand config structure
from langgraph.config import get_config # Import get_config
from langchain_core.runnables.config import RunnableConfig


# Import our custom types
from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio, RiskProfile
)
from clera_agents.tools.portfolio_analysis import (
    PortfolioPosition, PortfolioAnalyzer, PortfolioAnalyticsEngine
)

# Import our Supabase helper
from utils.supabase import get_user_alpaca_account_id

# Configure logging
logger = logging.getLogger(__name__)

# initialize Alpaca broker client
broker_client = BrokerClient(
    api_key=os.getenv("ALPACA_API_KEY"),
    secret_key=os.getenv("ALPACA_API_SECRET"),
    sandbox=True
)

# Module-level variable to store the last valid account ID
_LAST_VALID_ACCOUNT_ID = None
_LAST_VALID_USER_ID = None

def get_account_id(config: RunnableConfig = None) -> str:
    """Get the account ID for the human.

    Primarily uses get_config() when running in LangGraph Cloud.
    Falls back to last known ID or Supabase lookup if needed.

    Args:
        config: Optional RunnableConfig (automatically passed or retrieved).

    Returns:
        str: Account ID to use for operations.
    """
    global _LAST_VALID_ACCOUNT_ID, _LAST_VALID_USER_ID

    current_user_id = None
    current_account_id = None

    # ---- STRATEGY 1: Use get_config() (Primary for LangGraph Cloud) ----
    retrieved_config = config
    if retrieved_config is None:
        try:
            retrieved_config = get_config()
            logger.info(f"[Portfolio Agent] Retrieved config via get_config(): {retrieved_config}")
        except Exception as e:
            logger.warning(f"[Portfolio Agent] Failed to get config via get_config(), proceeding with fallback strategies: {e}")
            retrieved_config = None

    if retrieved_config and isinstance(retrieved_config.get('configurable'), dict):
        configurable = retrieved_config['configurable']
        current_account_id = configurable.get('account_id')
        current_user_id = configurable.get('user_id') # Get user_id as well

        if current_account_id:
            logger.info(f"[Portfolio Agent] Using account_id from config: {current_account_id}")
            _LAST_VALID_ACCOUNT_ID = current_account_id
            if current_user_id: _LAST_VALID_USER_ID = current_user_id
            return current_account_id
        elif current_user_id:
            _LAST_VALID_USER_ID = current_user_id
            logger.info(f"[Portfolio Agent] User ID found in config ({current_user_id}), but no account_id. Will try Supabase lookup.")
        else:
            logger.info(f"[Portfolio Agent] Config retrieved but lacks account_id and user_id.")
    else:
        logger.info(f"[Portfolio Agent] No valid config retrieved via get_config() or passed argument.")

    # ---- STRATEGY 2: Use User ID (from config if available) for Supabase Lookup ----
    if current_user_id:
        logger.info(f"[Portfolio Agent] Attempting Supabase lookup for user_id from config: {current_user_id}")
        try:
            db_account_id = get_user_alpaca_account_id(current_user_id)
            if db_account_id:
                logger.info(f"[Portfolio Agent] Found account_id via Supabase: {db_account_id}")
                _LAST_VALID_ACCOUNT_ID = db_account_id
                return db_account_id
            else:
                 logger.warning(f"[Portfolio Agent] Supabase lookup failed for user_id: {current_user_id}")
        except Exception as e:
            logger.error(f"[Portfolio Agent] Error during Supabase lookup for {current_user_id}: {e}", exc_info=True)

    # ---- STRATEGY 3: Use last known valid account_id ----
    if _LAST_VALID_ACCOUNT_ID:
        logger.info(f"[Portfolio Agent] Using last known valid account_id: {_LAST_VALID_ACCOUNT_ID}")
        return _LAST_VALID_ACCOUNT_ID

    # ---- STRATEGY 4: Try to get account_id from last known user_id ----
    if _LAST_VALID_USER_ID:
        logger.info(f"[Portfolio Agent] Attempting Supabase lookup for last known user_id: {_LAST_VALID_USER_ID}")
        try:
            db_account_id = get_user_alpaca_account_id(_LAST_VALID_USER_ID)
            if db_account_id:
                logger.info(f"[Portfolio Agent] Found account_id via Supabase (last known user): {db_account_id}")
                _LAST_VALID_ACCOUNT_ID = db_account_id
                return db_account_id
        except Exception as e:
             logger.error(f"[Portfolio Agent] Error during Supabase lookup for last known user {_LAST_VALID_USER_ID}: {e}", exc_info=True)

    # ---- FALLBACK ----
    fallback_account_id = "4a045111-ef77-46aa-9f33-6002703376f6" # static account id for testing
    logger.error("[Portfolio Agent] CRITICAL: Using fallback account_id - all retrieval strategies failed")
    return fallback_account_id

#@tool("retrieve_portfolio_positions")
def retrieve_portfolio_positions(state=None, config=None) -> List:
    """Retrieve portfolio positions from the user's account.
    
    Returns:
        A list of Position objects from Alpaca API containing the following attributes:
        - symbol (str): The stock symbol (e.g., 'AAPL')
        - qty (str): Number of shares owned (for reference only)
        - current_price (str): Current price per share (for reference only)
        - market_value (str): Total dollar value of the position (this is the notional value)
        - asset_class (AssetClass): Type of asset (e.g., US_EQUITY)
        - exchange (AssetExchange): Exchange where the asset is traded
        - unrealized_pl (str): Unrealized profit/loss in dollars
        - unrealized_plpc (str): Unrealized profit/loss percentage
        - cost_basis (str): Total cost basis of the position in dollars
        - avg_entry_price (str): Average price paid per share (for reference only)
        
    Example object attributes:
        position.symbol = 'AAPL'
        position.qty = '8'  # Share quantity (for reference)
        position.current_price = '237.0981'  # Per share (for reference)
        position.market_value = '1896.7848'  # This is the notional dollar value
        position.unrealized_pl = '-20.9752'
        position.unrealized_plpc = '-0.0109373435674954'
        position.cost_basis = '1917.76'
        position.avg_entry_price = '239.72'
    """
    account_id = get_account_id(config=config)
    try:
        all_positions = broker_client.get_all_positions_for_account(account_id=account_id)
        return all_positions
    except Exception as e:
        logger.error(f"[Portfolio Agent] Failed to retrieve positions for account {account_id}: {e}", exc_info=True)
        # Return empty list or raise specific exception?
        return [] 

    
#@tool("rebalance_portfolio")
def create_rebalance_instructions(positions_data: List, target_portfolio_type: Optional[str] = "aggressive", state=None, config=None) -> str:
    """Calculate and explain portfolio rebalancing steps based on Alpaca position data and target portfolio type.
    
    This function analyzes the current portfolio positions and generates detailed instructions
    to rebalance according to the specified target portfolio allocation strategy. All rebalancing
    instructions are provided in dollar values (notional amounts), making it easy to execute trades
    using the trade execution agent's functions.
    
    Args:
        positions_data: List of Position objects from Alpaca API
        target_portfolio_type: The type of target portfolio to use for rebalancing. Options are:
            - "aggressive": 100% equity with 50% ETFs, 50% individual stocks
            - "balanced": 60% equity, 40% fixed income
            - "conservative": 30% equity, 60% fixed income, 10% cash
            Defaults to "aggressive" if not specified.
        
    Returns:
        str: A detailed set of instructions for rebalancing the portfolio, with all values expressed
        in dollar amounts (notional values) that can be directly used with trade execution functions
    """
    try:
        # Ensure positions are retrieved if not passed directly (though they usually are)
        if not positions_data:
             positions_data = retrieve_portfolio_positions(state=state, config=config)
             if not positions_data:
                  return "Error: Could not retrieve portfolio positions to generate rebalancing instructions."
             
        positions = [PortfolioPosition.from_alpaca_position(position) for position in positions_data]
        
        # Get target portfolio based on type (or potentially from user state/config in future)
        if target_portfolio_type.lower() == "balanced":
            target_portfolio = TargetPortfolio.create_balanced_portfolio()
        elif target_portfolio_type.lower() == "conservative":
            target_portfolio = TargetPortfolio.create_conservative_portfolio()
        else: 
            target_portfolio = TargetPortfolio.create_aggressive_growth_portfolio()
            
        instructions = PortfolioAnalyzer.generate_rebalance_instructions(
            positions=positions,
            target_portfolio=target_portfolio
        )
        return instructions
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error generating rebalance instructions: {e}", exc_info=True)
        return f"Error processing portfolio data: {str(e)}"


@tool("rebalance_instructions")
def rebalance_instructions(state=None, config=None) -> str:
    """Generate one-time rebalancing recommendations for the user's portfolio.
    
    This function retrieves the current portfolio positions, analyzes them against the user's
    investment strategy, and provides specific buy/sell recommendations to optimize the portfolio.
    
    Returns:
        str: A detailed set of instructions for rebalancing the portfolio
    """
    try:
        # Get positions using context
        positions_data = retrieve_portfolio_positions(state=state, config=config)
        if not positions_data:
             # Handle case where positions couldn't be retrieved
             # Maybe check account status?
             account_id = get_account_id(config=config)
             return f"Could not retrieve portfolio positions for account {account_id}. Please ensure the account is active and funded."

        # Get user strategy (currently static, uses config for account_id)
        investment_strategy = get_user_investment_strategy(state=state, config=config)
        target_type = investment_strategy.get("risk_profile", "aggressive") # Default to aggressive
        
        return create_rebalance_instructions(
            positions_data=positions_data, 
            target_portfolio_type=target_type,
            state=state, 
            config=config
        )
        
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error in rebalance_instructions tool: {e}", exc_info=True)
        return f"Error analyzing portfolio: {str(e)}"


@tool("get_portfolio_summary")
def get_portfolio_summary(state=None, config=None) -> str:
    """Generate a one-time comprehensive summary of the user's investment portfolio.
    
    This tool provides a detailed analysis of the portfolio including:
    - Total portfolio value and asset allocation
    - Performance analysis with gain/loss by asset class
    - Risk assessment with risk and diversification scores
    - Concentration risk identification
    - Comparison to target allocation based on investment strategy
    
    Returns:
        str: Formatted portfolio summary with detailed metrics
    """
    try:
        # Get positions using context
        positions_data = retrieve_portfolio_positions(state=state, config=config)
        if not positions_data:
             account_id = get_account_id(config=config)
             # Consider more specific error based on Alpaca client response if available
             return f"Could not retrieve portfolio positions for account {account_id}. The portfolio might be empty or the account inactive."

        investment_strategy = get_user_investment_strategy(state=state, config=config)
        
        positions = [PortfolioPosition.from_alpaca_position(position) for position in positions_data]
        
        for i, position in enumerate(positions):
            if position.asset_class is None or position.security_type is None:
                positions[i] = PortfolioAnalyzer.classify_position(position)
        
        # TODO: Retrieve actual cash balance from Alpaca account details
        cash_value = Decimal('0') 
        
        metrics = PortfolioAnalyticsEngine.generate_complete_portfolio_metrics(
            positions=positions,
            cash_value=cash_value
        )
        
        summary = PortfolioAnalyticsEngine.format_portfolio_summary(
            metrics=metrics,
            investment_strategy=investment_strategy
        )
        return summary
        
    except Exception as e:
        # Catch specific exceptions if possible (e.g., AlpacaAPIError)
        logger.error(f"[Portfolio Agent] Error in get_portfolio_summary tool: {e}", exc_info=True)
        # Provide a more user-friendly error message
        return f"Error generating portfolio summary: {str(e)}. Please try again later."


#@tool("get_user_investment_strategy")
def get_user_investment_strategy(state=None, config=None) -> Dict:
    """Get the user's investment risk profile and strategy details.
    
    Args:
       None
    
    Returns:
        A dictionary containing:
        - risk_profile: The user's risk profile
        - target_portfolio: Details about the target portfolio allocation
        - notes: Additional notes about the user's investment preferences
    """
    # In the future, this might retrieve actual user preferences from a database
    # For now, we're using a static aggressive growth strategy

    account_id = get_account_id(config=config)
    logger.info(f"[Portfolio Agent] Determining investment strategy for account: {account_id}")
    
    target_portfolio = TargetPortfolio.create_aggressive_growth_portfolio()
    
    return {
        "risk_profile": target_portfolio.risk_profile.value,
        "target_portfolio": {
            "name": target_portfolio.name,
            "equity_percentage": 100.0,
            "fixed_income_percentage": 0.0,
            "etf_percentage": 50.0,
            "individual_stock_percentage": 50.0
        },
        "notes": "Long-term aggressive growth strategy suitable for investors with high risk tolerance and long time horizons."
    }
