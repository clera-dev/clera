#portfolio_management_agent.py

# Import necessary libraries
import os
from dotenv import load_dotenv
from langchain_core.tools import tool

from urllib.request import urlopen
import certifi
import json
from typing import List, Optional, Dict
from decimal import Decimal

from alpaca.broker import BrokerClient

# Import our custom types
from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio, RiskProfile
)
from clera_agents.tools.portfolio_analysis import (
    PortfolioPosition, PortfolioAnalyzer, PortfolioAnalyticsEngine
)

load_dotenv()
fin_modeling_prep_api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")

# initialize Alpaca broker client
broker_client = BrokerClient(
    os.getenv("BROKER_API_KEY"),
    os.getenv("BROKER_SECRET_KEY"),
    sandbox=True
)


def get_account_id() -> str:
    """Get the account ID for the human."""
    return "4a045111-ef77-46aa-9f33-6002703376f6" # static account id for now
    #return broker_client.get_account(os.getenv("BROKER_ACCOUNT_ID")).account_id

#@tool("retrieve_portfolio_positions")
def retrieve_portfolio_positions() -> List:
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
    account_id = get_account_id()
    all_positions = broker_client.get_all_positions_for_account(account_id=account_id)
    return all_positions

    
#@tool("rebalance_portfolio")
def create_rebalance_instructions(positions_data: List, target_portfolio_type: Optional[str] = "aggressive") -> str:
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
        # Convert positions to our standard format
        positions = [PortfolioPosition.from_alpaca_position(position) for position in positions_data]
        
        # Get the target portfolio based on the specified type
        if target_portfolio_type.lower() == "balanced":
            target_portfolio = TargetPortfolio.create_balanced_portfolio()
        elif target_portfolio_type.lower() == "conservative":
            target_portfolio = TargetPortfolio.create_conservative_portfolio()
        else:  # Default to aggressive
            target_portfolio = TargetPortfolio.create_aggressive_growth_portfolio()
            
        # Generate rebalance instructions
        instructions = PortfolioAnalyzer.generate_rebalance_instructions(
            positions=positions,
            target_portfolio=target_portfolio
        )
        
        return instructions
        
    except Exception as e:
        return f"Error processing portfolio data: {str(e)}"


@tool("analyze_and_rebalance_portfolio")
def analyze_and_rebalance_portfolio() -> str:
    """Complete function to retrieve portfolio positions, analyze them, and provide rebalancing instructions.
    
    This is a simplified function that handles the entire rebalancing process in one step, including:
    1. Retrieving the current portfolio positions
    2. Converting and analyzing the positions
    3. Generating rebalancing instructions based on the target portfolio type
    
    Args:
        target_portfolio_type: The type of target portfolio to use for rebalancing. Options are:
            - "aggressive": 100% equity with 50% ETFs, 50% individual stocks (default)
            - "balanced": 60% equity, 40% fixed income
            - "conservative": 30% equity, 60% fixed income, 10% cash
    
    Returns:
        str: A detailed set of instructions for rebalancing the portfolio
    """
    try:
        # Retrieve the current portfolio positions
        positions_data = retrieve_portfolio_positions()
        target_portfolio = get_user_investment_strategy()
        
        # Pass the positions to the create_rebalance_instructions function
        return create_rebalance_instructions(positions_data, target_portfolio["risk_profile"])
        
    except Exception as e:
        return f"Error analyzing portfolio: {str(e)}"


@tool("get_portfolio_summary")
def get_portfolio_summary() -> str:
    """Generate a comprehensive summary of the user's investment portfolio.
    
    This tool provides a detailed analysis of the portfolio including:
    - Total portfolio value and asset allocation
    - Performance analysis with gain/loss by asset class
    - Risk assessment with risk and diversification scores
    - Concentration risk identification
    - Comparison to target allocation based on investment strategy
    
    Returns:
        str: A formatted summary of the portfolio with detailed metrics
    """
    try:
        # Get account ID
        account_id = get_account_id()
        
        # Get the raw positions data
        positions_data = retrieve_portfolio_positions()
        
        # Get the user's investment strategy
        investment_strategy = get_user_investment_strategy()
        
        # Convert positions to our standard format
        positions = [PortfolioPosition.from_alpaca_position(position) for position in positions_data]
        
        # Classify each position by asset class and security type
        for i, position in enumerate(positions):
            if position.asset_class is None or position.security_type is None:
                positions[i] = PortfolioAnalyzer.classify_position(position)
        
        # Get cash balance (assuming 0 for now - could be retrieved from account data)
        cash_value = Decimal('0')
        
        # Generate comprehensive metrics
        metrics = PortfolioAnalyticsEngine.generate_complete_portfolio_metrics(
            positions=positions,
            cash_value=cash_value
        )
        
        # Format the metrics into a readable summary
        summary = PortfolioAnalyticsEngine.format_portfolio_summary(
            metrics=metrics,
            investment_strategy=investment_strategy
        )
        
        return summary
        
    except Exception as e:
        return f"Error generating portfolio summary: {str(e)}"


#@tool("get_user_investment_strategy")
def get_user_investment_strategy() -> Dict:
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

    account_id = get_account_id()
    
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
