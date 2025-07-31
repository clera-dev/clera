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

from langgraph.pregel import Pregel # Import if needed to understand config structure
from langgraph.config import get_config # Import get_config
from langchain_core.runnables.config import RunnableConfig


# Import our custom types
from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio, RiskProfile, AssetAllocation
)
from clera_agents.tools.portfolio_analysis import (
    PortfolioPosition, PortfolioAnalyzer, PortfolioAnalyticsEngine
)
from clera_agents.tools.purchase_history import (
    get_comprehensive_account_activities,
    find_first_purchase_dates
)
from utils.account_utils import get_account_id
from utils.alpaca.broker_client_factory import get_broker_client
from utils.alpaca.portfolio_mapping import map_alpaca_position_to_portfolio_position



# Configure logging
logger = logging.getLogger(__name__)

# Use centralized broker client
broker_client = get_broker_client()



def get_account_cash_balance(config=None) -> Decimal:
    """Get the cash balance from the user's account.
    
    Returns:
        Decimal: The cash balance in the account
    """
    try:
        account_id = get_account_id(config=config)
        logger.info(f"[Portfolio Agent] Retrieving cash balance for account: {account_id}")
        
        # Get account information
        account = broker_client.get_trade_account_by_id(account_id)
        cash_balance = Decimal(str(account.cash))
        
        # Remove sensitive info from logs
        logger.debug("[Portfolio Agent] Cash balance retrieved successfully")
        return cash_balance
        
    except ValueError as e:
        logger.error(f"[Portfolio Agent] Account identification failed: {e}")
        return Decimal('0')
    except Exception as e:
        logger.error(f"[Portfolio Agent] Failed to retrieve cash balance: {e}", exc_info=True)
        return Decimal('0')


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
    try:
        account_id = get_account_id(config=config)
        logger.info(f"[Portfolio Agent] Retrieving positions for account: {account_id}")
        
        all_positions = broker_client.get_all_positions_for_account(account_id=account_id)
        logger.info(f"[Portfolio Agent] Successfully retrieved {len(all_positions)} positions")
        return all_positions
        
    except ValueError as e:
        logger.error(f"[Portfolio Agent] Account identification failed: {e}")
        return []
    except Exception as e:
        logger.error(f"[Portfolio Agent] Failed to retrieve positions: {e}", exc_info=True)
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
        
        # Get cash balance for complete portfolio analysis
        cash_balance = get_account_cash_balance(config=config)
        
        # Initialize our analytics engine
        analyzer = PortfolioAnalyzer()
        engine = PortfolioAnalyticsEngine()
        
        # Convert Alpaca positions to our internal format
        portfolio_positions = []
        failed_positions = []
        
        for position in positions_data:
            try:
                # Convert Alpaca position to our PortfolioPosition format
                portfolio_position = PortfolioPosition.from_alpaca_position(position)
                portfolio_positions.append(portfolio_position)
                
            except (ValueError, AttributeError) as e:
                # Collect failed positions for reporting
                symbol = getattr(position, 'symbol', 'UNKNOWN')
                failed_positions.append(f"{symbol}: {str(e)}")
                logger.warning(f"[Rebalance] Could not process position {symbol}: {e}")
                continue
        
        # Check if we have any usable data
        if not portfolio_positions and cash_balance == 0:
            error_msg = "❌ **Rebalancing Error:** Could not process any positions from your account."
            
            if failed_positions:
                error_msg += f"\n\n**Position Conversion Errors:**"
                for error in failed_positions[:5]:  # Show first 5 errors
                    error_msg += f"\n• {error}"
                if len(failed_positions) > 5:
                    error_msg += f"\n• ... and {len(failed_positions) - 5} more errors"
                    
                error_msg += f"\n\n**Troubleshooting:**"
                error_msg += f"\n• This usually indicates missing or invalid data from your broker"
                error_msg += f"\n• Try refreshing your positions or contact support if this persists"
                error_msg += f"\n• Some positions may still be settling"
            
            return error_msg
        
        # Provide feedback on partial success
        status_msg = ""
        if failed_positions:
            status_msg = f"\n**Note:** Successfully processed {len(portfolio_positions)} positions"
            if len(failed_positions) == 1:
                status_msg += f", but encountered 1 issue with position data."
            else:
                status_msg += f", but encountered {len(failed_positions)} issues with position data."
        
        # Get target portfolio based on user preference
        target_portfolio = get_target_portfolio_by_type(target_portfolio_type)
        
        # Generate rebalancing instructions including cash balance
        instructions = analyzer.generate_rebalance_instructions(
            portfolio_positions, 
            target_portfolio,
            cash_balance=cash_balance
        )
        
        # Add status message if there were any issues
        if status_msg:
            instructions += status_msg
        
        return instructions
        
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error in create_rebalance_instructions: {e}", exc_info=True)
        return "❌ **Error:** Could not generate rebalancing instructions. Please try again later or contact support if the issue persists."


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
        return "❌ **Error:** Could not generate rebalancing instructions. Please try again later."


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
        # Validate user context first
        account_id = get_account_id(config=config)
        logger.info(f"[Portfolio Agent] Generating portfolio summary for account: {account_id}")
        
        # Get cash balance first
        cash_balance = get_account_cash_balance(config=config)
        
        # Get all positions
        positions = retrieve_portfolio_positions(state=state, config=config)
        
        if not positions and cash_balance == 0:
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

        # Calculate portfolio totals (positions only)
        positions_value = Decimal('0')
        total_unrealized_pl = Decimal('0')
        total_cost_basis = Decimal('0')
        
        position_details = []
        
        for position in positions:
            try:
                # Extract numeric values
                market_value = Decimal(str(position.market_value))
                unrealized_pl = Decimal(str(position.unrealized_pl))
                cost_basis = Decimal(str(position.cost_basis))
                unrealized_plpc = float(position.unrealized_plpc) * 100  # Convert to percentage
                
                positions_value += market_value
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
                })
                
            except (ValueError, AttributeError) as e:
                logger.warning(f"[Portfolio Agent] Could not process position {position.symbol}: {e}")
                continue
        
        # Calculate TOTAL portfolio value including cash
        total_portfolio_value = positions_value + cash_balance
        
        # Calculate weights based on TOTAL portfolio value (including cash)
        for pos in position_details:
            pos['weight'] = float(pos['market_value'] / total_portfolio_value) if total_portfolio_value > 0 else 0
        
        # Calculate overall return percentage
        overall_return_pct = float(total_unrealized_pl / total_cost_basis * 100) if total_cost_basis > 0 else 0
        overall_emoji = "📈" if total_unrealized_pl >= 0 else "📉"
        
        # Sort positions by market value (largest first)
        position_details.sort(key=lambda x: x['market_value'], reverse=True)
        
        # Get first purchase dates for enhanced information
        first_purchases = find_first_purchase_dates(account_id)
        
        # Add first purchase dates to position details
        for pos in position_details:
            pos['first_purchase'] = first_purchases.get(pos['symbol'])
        
        # Calculate risk and diversification scores using the same logic as frontend
        risk_score = Decimal('0')
        diversification_score = Decimal('0')
        
        if position_details:
            try:
                # Import the same mapping function used by the backend API
                from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine
                
                # Get the original Alpaca positions for proper mapping
                original_positions = retrieve_portfolio_positions(config=config)
                
                # Create asset details map (empty for now, but could be enhanced)
                asset_details_map = {}
                
                # Map positions using the same logic as the backend API
                portfolio_positions = []
                
                for original_pos in original_positions:
                    mapped_pos = map_alpaca_position_to_portfolio_position(original_pos, asset_details_map)
                    if mapped_pos:
                        portfolio_positions.append(mapped_pos)
                
                if portfolio_positions:
                    risk_score = PortfolioAnalyticsEngine.calculate_risk_score(portfolio_positions)
                    diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(portfolio_positions)
                    logger.info(f"[Portfolio Agent] Calculated scores - Risk: {risk_score}, Diversification: {diversification_score}")
                else:
                    logger.warning("[Portfolio Agent] No positions could be mapped for score calculation")
            except Exception as e:
                logger.warning(f"[Portfolio Agent] Could not calculate risk/diversification scores: {e}")
                # Continue with default scores of 0
        # Get current timestamp in UTC
        current_timestamp = datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')

        # Build summary with CORRECTED portfolio value calculations
        summary = f"""📊 **Portfolio Summary**
**Generated:** {current_timestamp}

**Risk Score:** {float(risk_score):.1f}/10
**Diversification Score:** {float(diversification_score):.1f}/10
"""

        summary += f"""{overall_emoji} **Portfolio Overview**
• **Total Portfolio Value:** ${float(total_portfolio_value):,.2f}
• **Investment Positions:** ${float(positions_value):,.2f} ({float(positions_value/total_portfolio_value*100) if total_portfolio_value > 0 else 0:.1f}%)
• **Cash Balance:** ${float(cash_balance):,.2f} ({float(cash_balance/total_portfolio_value*100) if total_portfolio_value > 0 else 0:.1f}%)
• **Total Positions:** {len(position_details)}"""

        if total_cost_basis > 0:
            summary += f"""
• **Unrealized P&L:** ${float(total_unrealized_pl):+,.2f} ({overall_return_pct:+.2f}%)
• **Cost Basis:** ${float(total_cost_basis):,.2f}"""

        if position_details:
            summary += f"""

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
• Value: ${float(pos['market_value']):,.2f}
• P&L: ${float(pos['unrealized_pl']):+,.2f} ({pos['unrealized_plpc']:+.2f}%){first_purchase_str}"""
        
            # Add insights
            summary += f"""

💡 **Portfolio Insights**
• **Largest Position:** {position_details[0]['symbol']} ({position_details[0]['weight']*100:.1f}% of portfolio)
• **Best Performer:** {max(position_details, key=lambda x: x['unrealized_plpc'])['symbol']} ({max(position_details, key=lambda x: x['unrealized_plpc'])['unrealized_plpc']:+.2f}%)
• **Concentration Risk:** {'HIGH' if position_details[0]['weight'] > 0.3 else 'MODERATE' if position_details[0]['weight'] > 0.2 else 'LOW'}
• **Risk Score:** {float(risk_score):.1f}/10 ({'LOW' if float(risk_score) < 3 else 'MEDIUM' if float(risk_score) < 7 else 'HIGH'})
• **Diversification Score:** {float(diversification_score):.1f}/10 ({'POOR' if float(diversification_score) < 3 else 'MODERATE' if float(diversification_score) < 7 else 'GOOD'})"""
            
            if len(position_details) >= 3:
                summary += f"""
• **Top 3 Holdings:** {position_details[0]['symbol']}, {position_details[1]['symbol']}, {position_details[2]['symbol']}"""
        else:
            summary += f"""

💡 **Portfolio Status**
• **Portfolio Type:** Cash-only portfolio
• **Investment Opportunity:** ${float(cash_balance):,.2f} available for investment
• **Next Steps:** Consider diversified investment strategy"""
        
        summary += """

📋 **Quick Actions**
• Want to rebalance? Ask for rebalancing instructions
• Need analysis? Ask about specific stock performance
• Ready to trade? Use the trade execution agent"""
        
        logger.info(f"[Portfolio Agent] Successfully generated portfolio summary - Total: ${float(total_portfolio_value):,.2f} (Positions: ${float(positions_value):,.2f}, Cash: ${float(cash_balance):,.2f})")
        return summary
        
    except ValueError as e:
        logger.error(f"[Portfolio Agent] Account identification error: {e}")
        return f"""📊 **Portfolio Summary**

🚫 **Authentication Error**

Could not securely identify your account. This is a security protection to prevent unauthorized access.

**Error Details:** {str(e)}

💡 **Next Steps:**
• Please log out and log back in
• Ensure you have completed account setup
• Contact support if the issue persists

**Security Note:** This error prevents unauthorized access to financial data."""
        
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error generating portfolio summary: {e}", exc_info=True)
        return "❌ **Error:** Could not generate portfolio summary. Please try again later."


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
        # 100% equity portfolio with 50% ETFs, 50% individual stocks
        equity_allocation = AssetAllocation(
            percentage=100.0,
            security_allocations={
                SecurityType.ETF: 50.0,
                SecurityType.INDIVIDUAL_STOCK: 50.0
            }
        )
        
        return TargetPortfolio(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation
            },
            risk_profile=RiskProfile.AGGRESSIVE,
            name="Aggressive Growth Portfolio",
            notes="100% equity allocation with 50% ETFs and 50% individual stocks. Suitable for long-term investors with high risk tolerance."
        )
        
    elif portfolio_type.lower() == 'balanced':
        # 60% equity, 40% fixed income
        equity_allocation = AssetAllocation(
            percentage=60.0,
            security_allocations={
                SecurityType.ETF: 70.0,
                SecurityType.INDIVIDUAL_STOCK: 30.0
            }
        )
        
        fixed_income_allocation = AssetAllocation(
            percentage=40.0,
            security_allocations={
                SecurityType.ETF: 80.0,
                SecurityType.BOND: 20.0
            }
        )
        
        return TargetPortfolio(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation,
                AssetClass.FIXED_INCOME: fixed_income_allocation
            },
            risk_profile=RiskProfile.MODERATE,
            name="Balanced Portfolio",
            notes="60% equity, 40% fixed income. Balances growth with stability for medium-term goals."
        )
        
    elif portfolio_type.lower() == 'conservative':
        # 30% equity, 60% fixed income, 10% cash
        equity_allocation = AssetAllocation(
            percentage=30.0,
            security_allocations={
                SecurityType.ETF: 80.0,
                SecurityType.INDIVIDUAL_STOCK: 20.0
            }
        )
        
        fixed_income_allocation = AssetAllocation(
            percentage=60.0,
            security_allocations={
                SecurityType.ETF: 70.0,
                SecurityType.BOND: 30.0
            }
        )
        
        cash_allocation = AssetAllocation(
            percentage=10.0,
            security_allocations={
                SecurityType.MONEY_MARKET: 100.0
            }
        )
        
        return TargetPortfolio(
            asset_allocations={
                AssetClass.EQUITY: equity_allocation,
                AssetClass.FIXED_INCOME: fixed_income_allocation,
                AssetClass.CASH: cash_allocation
            },
            risk_profile=RiskProfile.CONSERVATIVE,
            name="Conservative Portfolio",
            notes="30% equity, 60% fixed income, 10% cash. Focused on capital preservation with modest growth."
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
        # Use thread pool to run async function in sync context
        import asyncio
        import concurrent.futures
        
        # Use the synchronous version directly since we're already in a thread pool context
        activities_report = get_comprehensive_account_activities(days_back=60, config=config)
        
        return activities_report
        
    except ValueError as e:
        logger.error(f"[Portfolio Agent] Account identification error: {e}")
        return f"""📋 **Account Activities**

🚫 **Authentication Error**

Could not securely identify your account. This is a security protection to prevent unauthorized access.

**Error Details:** _redacted for security_

💡 **Next Steps:**
• Please log out and log back in  
• Ensure you have completed account setup
• Contact support if the issue persists"""
        
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error retrieving account activities: {str(e)}")
        return f"""📋 **Account Activities**

❌ **Error Retrieving Activities**

Could not retrieve account activities.

💡 **Troubleshooting:**
• Check your internet connection
• Verify account permissions
• Try again in a few moments"""
