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
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta
import pandas as pd

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
    api_key=os.getenv("BROKER_API_KEY"),
    secret_key=os.getenv("BROKER_SECRET_KEY"),
    sandbox=os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
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
                return "❌ **Portfolio Error:** No positions found in your account. Cannot generate rebalancing instructions."
        # Initialize our analytics engine
        analyzer = PortfolioAnalyzer()
        engine = PortfolioAnalyticsEngine()
        
        # Convert Alpaca positions to our internal format
        portfolio_positions = []
        
        for position in positions_data:
            try:
                # Using market_value as the notional amount (total dollar value)
                notional_value = float(position.market_value)
                
                # Convert Alpaca position to our PortfolioPosition format
                portfolio_position = PortfolioPosition(
                    symbol=position.symbol,
                    notional_amount=notional_value,
                    asset_class=AssetClass.US_EQUITY,  # Most positions will be US equity
                    security_type=SecurityType.STOCK  # Default to stock
                )
                portfolio_positions.append(portfolio_position)
                
            except (ValueError, AttributeError) as e:
                logger.warning(f"[Rebalance] Could not process position {position.symbol}: {e}")
                continue
        
        if not portfolio_positions:
            return "❌ **Rebalancing Error:** Could not process any positions from your account."
        
        # Get target portfolio based on user preference
        target_portfolio = get_target_portfolio_by_type(target_portfolio_type)
        
        # Calculate current and target allocations
        current_allocation = analyzer.calculate_current_allocation(portfolio_positions)
        total_value = sum(pos.notional_amount for pos in portfolio_positions)
        
        # Generate rebalancing instructions
        rebalancing_instructions = analyzer.generate_rebalancing_instructions(
            current_allocation, target_portfolio, total_value
        )
        
        # Format the instructions for human readability
        instructions_text = f"""📊 **Portfolio Rebalancing Analysis**

**Current Portfolio Value:** ${total_value:,.2f}
**Target Strategy:** {target_portfolio_type.title()}

**Current Allocation:**
"""
        
        for asset_class, percentage in current_allocation.items():
            instructions_text += f"• {asset_class.value}: {percentage:.1f}%\n"
        
        instructions_text += f"""
**Target Allocation:**
"""
        for asset_class, percentage in target_portfolio.allocations.items():
            instructions_text += f"• {asset_class.value}: {percentage:.1f}%\n"
        
        instructions_text += f"""
**📋 Rebalancing Instructions:**

"""
        
        if not rebalancing_instructions:
            instructions_text += "✅ **Your portfolio is already well-balanced!** No trades needed at this time."
        else:
            for instruction in rebalancing_instructions:
                action = "🟢 BUY" if instruction['action'] == 'buy' else "🔴 SELL"
                instructions_text += f"{action} ${instruction['amount']:,.2f} of {instruction['asset_class'].value}\n"
                if 'reason' in instruction:
                    instructions_text += f"   Reason: {instruction['reason']}\n"
                instructions_text += "\n"
        
        instructions_text += """
**💡 Next Steps:**
1. Review these recommendations carefully
2. Consider your risk tolerance and investment timeline
3. Use the trade execution agent to implement specific trades
4. Monitor and rebalance quarterly or when allocations drift >5%

**⚠️ Important Note:** These are general recommendations. Consider consulting with a financial advisor for personalized advice."""
        
        return instructions_text
        
    except Exception as e:
        logger.error(f"[Rebalance] Error generating rebalancing instructions: {e}", exc_info=True)
        return f"❌ **Rebalancing Error:** Could not generate rebalancing instructions. Error: {str(e)}"


@tool("rebalance_instructions")
def rebalance_instructions(state=None, config=None) -> str:
    """Generate portfolio rebalancing instructions based on the user's current holdings.
    
    This tool analyzes the user's current portfolio and provides specific rebalancing
    recommendations to optimize their asset allocation. All recommendations are provided
    in dollar amounts that can be directly executed using trade execution functions.
    
    Returns:
        str: Detailed rebalancing instructions including:
             - Current vs target allocation analysis
             - Specific buy/sell recommendations in dollar amounts
             - Reasoning for each recommended change
             - Next steps for implementation
    """
    try:
        # Get current positions
        positions = retrieve_portfolio_positions(state=state, config=config)
        
        # Get user's investment strategy to determine target portfolio
        user_strategy = get_user_investment_strategy(state=state, config=config)
        target_portfolio_type = user_strategy.get('portfolio_type', 'aggressive')
        
        # Generate rebalancing instructions
        instructions = create_rebalance_instructions(
            positions, 
            target_portfolio_type, 
            state=state, 
            config=config
        )
        
        return instructions
        
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error in rebalance_instructions: {e}", exc_info=True)
        return f"❌ **Error:** Could not generate rebalancing instructions. Please try again later.\n\nError details: {str(e)}"


@tool("get_portfolio_summary")
def get_portfolio_summary(state=None, config=None) -> str:
    """Get a comprehensive summary of the user's current portfolio.
    
    This tool retrieves and analyzes the user's current portfolio positions,
    providing insights into allocation, performance, and key metrics.
    
    Returns:
        str: Formatted portfolio summary including:
             - Total portfolio value and position count
             - Individual position details with performance metrics
             - Asset allocation breakdown
             - Key portfolio statistics and insights
    """
    try:
        account_id = get_account_id(config=config)
        logger.info(f"[Portfolio Agent] Generating portfolio summary for account: {account_id}")
        
        # Get all positions
        positions = retrieve_portfolio_positions(state=state, config=config)
        
        if not positions:
            return """📊 **Portfolio Summary**

❌ **No Positions Found**

Your portfolio appears to be empty or we couldn't retrieve your positions. This could be because:
• You haven't made any investments yet
• Your positions are still settling
• There's a temporary issue with account access

💡 **Next Steps:**
• Check your account status
• Consider making your first investment
• Contact support if you believe this is an error"""

        # Calculate portfolio totals
        total_value = 0
        total_unrealized_pl = 0
        total_cost_basis = 0
        
        position_details = []
        
        for position in positions:
            try:
                # Extract numeric values
                market_value = float(position.market_value)
                unrealized_pl = float(position.unrealized_pl)
                cost_basis = float(position.cost_basis)
                unrealized_plpc = float(position.unrealized_plpc) * 100  # Convert to percentage
                
                total_value += market_value
                total_unrealized_pl += unrealized_pl
                total_cost_basis += cost_basis
                
                # Format position details
                gain_loss_emoji = "📈" if unrealized_pl >= 0 else "📉"
                position_details.append({
                    'symbol': position.symbol,
                    'market_value': market_value,
                    'unrealized_pl': unrealized_pl,
                    'unrealized_plpc': unrealized_plpc,
                    'emoji': gain_loss_emoji,
                    'weight': market_value / total_value if total_value > 0 else 0
                })
                
            except (ValueError, AttributeError) as e:
                logger.warning(f"[Portfolio Agent] Could not process position {position.symbol}: {e}")
                continue
        
        # Calculate overall return percentage
        overall_return_pct = (total_unrealized_pl / total_cost_basis * 100) if total_cost_basis > 0 else 0
        overall_emoji = "📈" if total_unrealized_pl >= 0 else "📉"
        
        # Sort positions by market value (largest first)
        position_details.sort(key=lambda x: x['market_value'], reverse=True)
        
        # Get current timestamp
        current_timestamp = datetime.now().strftime('%A, %B %d, %Y at %I:%M %p')
        
        # Build summary
        summary = f"""📊 **Portfolio Summary**
**Generated:** {current_timestamp}

{overall_emoji} **Portfolio Overview**
• **Total Value:** ${total_value:,.2f}
• **Total Positions:** {len(position_details)}
• **Unrealized P&L:** ${total_unrealized_pl:+,.2f} ({overall_return_pct:+.2f}%)
• **Cost Basis:** ${total_cost_basis:,.2f}

📈 **Holdings Breakdown**
"""
        
        # Add position details
        for pos in position_details:
            weight_display = f"{pos['weight']*100:.1f}%"
            summary += f"""
{pos['emoji']} **{pos['symbol']}** ({weight_display})
• Value: ${pos['market_value']:,.2f}
• P&L: ${pos['unrealized_pl']:+,.2f} ({pos['unrealized_plpc']:+.2f}%)"""
        
        # Add insights
        summary += f"""

💡 **Portfolio Insights**
• **Largest Position:** {position_details[0]['symbol']} ({position_details[0]['weight']*100:.1f}% of portfolio)
• **Best Performer:** {max(position_details, key=lambda x: x['unrealized_plpc'])['symbol']} ({max(position_details, key=lambda x: x['unrealized_plpc'])['unrealized_plpc']:+.2f}%)
• **Concentration Risk:** {'HIGH' if position_details[0]['weight'] > 0.3 else 'MODERATE' if position_details[0]['weight'] > 0.2 else 'LOW'}"""
        
        if len(position_details) >= 3:
            summary += f"""
• **Top 3 Holdings:** {position_details[0]['symbol']}, {position_details[1]['symbol']}, {position_details[2]['symbol']}"""
        
        summary += """

📋 **Quick Actions**
• Want to rebalance? Ask for rebalancing instructions
• Need analysis? Ask about specific stock performance
• Ready to trade? Use the trade execution agent"""
        
        logger.info(f"[Portfolio Agent] Successfully generated portfolio summary with {len(position_details)} positions")
        return summary
        
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error generating portfolio summary: {e}", exc_info=True)
        return f"❌ **Error:** Could not generate portfolio summary. Please try again later.\n\nError details: {str(e)}"


def get_user_investment_strategy(state=None, config=None) -> Dict:
    """Get the user's investment strategy and risk profile.
    
    This function would typically query a user preferences database,
    but for now returns a default aggressive strategy.
    
    Returns:
        Dict: User's investment strategy including portfolio type and risk profile
    """
    # TODO: Implement actual user preference lookup from database
    # For now, return default strategy
    return {
        'portfolio_type': 'aggressive',
        'risk_profile': 'high',
        'rebalancing_frequency': 'quarterly',
        'tax_optimization': True
    }


def get_target_portfolio_by_type(portfolio_type: str) -> TargetPortfolio:
    """Get target portfolio allocation by type.
    
    Args:
        portfolio_type: Type of portfolio ('aggressive', 'balanced', 'conservative')
    
    Returns:
        TargetPortfolio: Target allocation strategy
    """
    if portfolio_type.lower() == 'aggressive':
        return TargetPortfolio(
            name="Aggressive Growth",
            allocations={
                AssetClass.US_EQUITY: 70.0,
                AssetClass.INTERNATIONAL_EQUITY: 30.0,
                AssetClass.FIXED_INCOME: 0.0,
                AssetClass.ALTERNATIVES: 0.0,
                AssetClass.CASH: 0.0
            },
            risk_profile=RiskProfile.HIGH,
            description="High-growth portfolio focused on equity investments"
        )
    elif portfolio_type.lower() == 'balanced':
        return TargetPortfolio(
            name="Balanced",
            allocations={
                AssetClass.US_EQUITY: 40.0,
                AssetClass.INTERNATIONAL_EQUITY: 20.0,
                AssetClass.FIXED_INCOME: 35.0,
                AssetClass.ALTERNATIVES: 0.0,
                AssetClass.CASH: 5.0
            },
            risk_profile=RiskProfile.MEDIUM,
            description="Balanced portfolio with moderate risk and diversification"
        )
    elif portfolio_type.lower() == 'conservative':
        return TargetPortfolio(
            name="Conservative",
            allocations={
                AssetClass.US_EQUITY: 20.0,
                AssetClass.INTERNATIONAL_EQUITY: 10.0,
                AssetClass.FIXED_INCOME: 60.0,
                AssetClass.ALTERNATIVES: 0.0,
                AssetClass.CASH: 10.0
            },
            risk_profile=RiskProfile.LOW,
            description="Conservative portfolio focused on capital preservation"
        )
    else:
        # Default to balanced if unknown type
        return get_target_portfolio_by_type('balanced')
