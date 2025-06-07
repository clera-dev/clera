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
from datetime import datetime, timedelta, timezone
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
from clera_agents.tools.purchase_history import (
    get_comprehensive_account_activities,
    find_first_purchase_dates
)
from utils.account_utils import get_account_id



# Configure logging
logger = logging.getLogger(__name__)

# initialize Alpaca broker client
broker_client = BrokerClient(
    api_key=os.getenv("BROKER_API_KEY"),
    secret_key=os.getenv("BROKER_SECRET_KEY"),
    sandbox=os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
)



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
        
        # Get first purchase dates for enhanced information
        first_purchases = find_first_purchase_dates(config=config)
        
        # Add first purchase dates to position details
        for pos in position_details:
            pos['first_purchase'] = first_purchases.get(pos['symbol'])
        
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
            first_purchase_str = ""
            if pos.get('first_purchase'):
                purchase_date = pos['first_purchase'].strftime('%b %d, %Y')
                holding_days = (datetime.now(timezone.utc) - pos['first_purchase']).days
                if holding_days < 30:
                    holding_str = f"{holding_days} days"
                elif holding_days < 365:
                    months = holding_days // 30
                    holding_str = f"{months} month{'s' if months != 1 else ''}"
                else:
                    years = holding_days // 365
                    holding_str = f"{years} year{'s' if years != 1 else ''}"
                first_purchase_str = f"\n• First purchased: {purchase_date} ({holding_str} ago)"
            
            summary += f"""
{pos['emoji']} **{pos['symbol']}** ({weight_display})
• Value: ${pos['market_value']:,.2f}
• P&L: ${pos['unrealized_pl']:+,.2f} ({pos['unrealized_plpc']:+.2f}%){first_purchase_str}"""
        
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


@tool("get_account_activities")
def get_account_activities_tool(state=None, config=None) -> str:
    """Get comprehensive account activities including trading history, dividends, and other account transactions.
    
    This tool provides a complete view of your account activities including:
    - Purchase history (all buy and sell transactions that have been FILLED)  
    - Trading statistics and summaries
    - Dividends, fees, and other account activities
    - First purchase dates and holding periods
    
    IMPORTANT NOTES:
    - Trading activities shown are FILLED orders only (does NOT include pending orders)
    - Recent trading activities cover the last 60 days
    - First purchase dates cover the last 365 days for historical context
    - Pending/open orders are not included in this report
    
    This is the primary tool for understanding your complete executed trading and account history.
    
    Returns:
        str: Comprehensive formatted account activities report with trading history
    """
    try:
        logger.info("[Portfolio Agent] Retrieving comprehensive account activities")
        
        # Get comprehensive activities (60 days by default)
        activities_report = get_comprehensive_account_activities(days_back=60, config=config)
        
        return activities_report
        
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error retrieving account activities: {str(e)}")
        return f"""📋 **Account Activities**

❌ **Error Retrieving Activities**

Could not retrieve account activities: {str(e)}

💡 **Troubleshooting:**
• Check your internet connection
• Verify account permissions
• Try again in a few moments"""
