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
    """Get a comprehensive summary of the user's current portfolio with account-level breakdown.
    
    This tool retrieves and analyzes the user's portfolio across all connected accounts,
    providing insights into each individual account as well as overall portfolio metrics.
    
    **Account Breakdown Structure:**
    - For Plaid users: Shows each connected investment account (401k, IRA, Roth IRA, brokerage, etc.)
      with its specific holdings, value, and performance metrics
    - For Alpaca users: Shows the Clera brokerage account with holdings
    - For Hybrid users: Shows both Alpaca AND all Plaid accounts separately, plus combined totals
    
    **Per-Account Information:**
    - Account name and institution (e.g., "Fidelity 401(k)", "Vanguard Roth IRA")
    - Account-specific portfolio value
    - Account-specific risk and diversification scores
    - List of securities held within that specific account
    - Performance metrics for each security in the account
    
    **Overall Portfolio Information:**
    - Combined total value across all accounts
    - Overall risk and diversification scores
    - Portfolio insights and recommendations
    
    This enables users to understand:
    - How much is in each account (401k vs IRA vs brokerage)
    - What specific holdings are in each account
    - Risk/diversification for each account individually
    - Which accounts need rebalancing
    
    Returns:
        str: Formatted portfolio summary including:
             - Overall portfolio totals
             - Account-by-account breakdown with holdings
             - Per-account risk and diversification metrics
             - Key insights and recommendations
    """
    try:
        # Get user_id from config
        from utils.account_utils import get_user_id_from_config
        user_id = get_user_id_from_config(config)
        logger.info(f"[Portfolio Agent] Generating portfolio summary for user: {user_id}")
        
        # Use the unified portfolio data provider
        from clera_agents.services.portfolio_data_provider import PortfolioDataProvider
        provider = PortfolioDataProvider(user_id)
        
        # Get user's account mode
        mode = provider.get_user_mode()
        logger.info(f"[Portfolio Agent] User mode: {mode.mode}")
        
        # Get cash balance (for hybrid mode, this will be broken down later)
        cash_balance = provider.get_cash_balance()
        
        # For HYBRID mode, get separate cash balances for breakdown
        alpaca_cash = Decimal('0')
        plaid_cash = Decimal('0')
        
        if mode.mode == 'hybrid':
            # Get Alpaca cash (brokerage cash - what user can invest on our platform)
            try:
                account = provider.broker_client.get_account_by_id(mode.alpaca_account_id)
                alpaca_cash = Decimal(str(account.cash))
                logger.info(f"[Portfolio Agent] Hybrid mode - Alpaca cash: ${alpaca_cash}")
            except Exception as e:
                logger.warning(f"[Portfolio Agent] Could not fetch Alpaca cash for hybrid mode: {e}")
            
            # Get Plaid cash (external accounts cash)
            try:
                result = provider.supabase.table('user_aggregated_holdings')\
                    .select('total_market_value')\
                    .eq('user_id', user_id)\
                    .eq('security_type', 'cash')\
                    .execute()
                
                if result.data and len(result.data) > 0:
                    plaid_cash = Decimal(str(result.data[0].get('total_market_value', 0)))
                    logger.info(f"[Portfolio Agent] Hybrid mode - Plaid cash: ${plaid_cash}")
            except Exception as e:
                logger.warning(f"[Portfolio Agent] Could not fetch Plaid cash for hybrid mode: {e}")
        
        # Get all holdings from available sources
        holdings = provider.get_holdings()
        
        if not holdings and cash_balance == 0:
            return f"""📊 **Portfolio Summary**

❌ **No Positions Found**

Your portfolio appears to be empty or we couldn't retrieve your positions. This could be because:
• You haven't made any investments yet
• Your positions are still settling
• There's a temporary issue with account access

**Account Mode:** {mode.mode}
{"• Alpaca brokerage account connected" if mode.has_alpaca else ""}
{"• Plaid aggregation accounts connected" if mode.has_plaid else ""}

💡 **Next Steps:**
• Check your account status
• Consider making your first investment
• Contact support if you believe this is an error"""

        # Separate CASH from INVESTMENT positions
        # Cash (like "U S Dollar") should be shown separately, not counted as an investment position
        cash_holdings = []
        investment_holdings = []
        
        for holding in holdings:
            if holding.security_type == 'cash':
                cash_holdings.append(holding)
            else:
                investment_holdings.append(holding)
        
        # Calculate INVESTMENT position totals (excluding cash)
        positions_value = Decimal('0')
        total_unrealized_pl = Decimal('0')
        total_cost_basis = Decimal('0')
        
        position_details = []
        
        for holding in investment_holdings:
            try:
                # Already in Decimal format from provider
                market_value = holding.market_value
                unrealized_pl = holding.unrealized_pl
                cost_basis = holding.cost_basis
                
                # Handle sentinel value for unreliable cost basis
                # Backend uses -999999 to indicate "N/A" (can't use NULL in DB)
                if holding.unrealized_plpc <= Decimal('-999999'):
                    unrealized_plpc = None  # Mark as N/A
                    gain_loss_emoji = "⚠️"  # Unreliable data indicator
                else:
                    unrealized_plpc = float(holding.unrealized_plpc) * 100  # Convert to percentage
                    gain_loss_emoji = "📈" if unrealized_pl >= 0 else "📉"
                
                positions_value += market_value
                total_unrealized_pl += unrealized_pl
                total_cost_basis += cost_basis
                
                position_details.append({
                    'symbol': holding.symbol,
                    'security_name': holding.security_name,
                    'security_type': holding.security_type,
                    'quantity': holding.quantity,
                    'market_value': market_value,
                    'unrealized_pl': unrealized_pl,
                    'unrealized_plpc': unrealized_plpc,  # Can be None for N/A
                    'emoji': gain_loss_emoji,
                    'source': holding.source,
                })
                
            except (ValueError, AttributeError) as e:
                logger.warning(f"[Portfolio Agent] Could not process holding {holding.symbol}: {e}")
                continue
        
        # Calculate CASH balance from cash holdings
        cash_from_holdings = sum(h.market_value for h in cash_holdings)
        
        # Total cash = cash from holdings + cash_balance (for hybrid mode with Alpaca cash)
        total_cash = cash_from_holdings + cash_balance
        
        # Calculate TOTAL portfolio value (investments + cash)
        total_portfolio_value = positions_value + total_cash
        
        # Calculate weights based on TOTAL portfolio value (including cash)
        for pos in position_details:
            pos['weight'] = float(pos['market_value'] / total_portfolio_value) if total_portfolio_value > 0 else 0
        
        # Calculate overall return percentage
        overall_return_pct = float(total_unrealized_pl / total_cost_basis * 100) if total_cost_basis > 0 else 0
        overall_emoji = "📈" if total_unrealized_pl >= 0 else "📉"
        
        # Sort positions by market value (largest first)
        position_details.sort(key=lambda x: x['market_value'], reverse=True)
        
        # Get first purchase dates for enhanced information (only for Alpaca accounts)
        first_purchases = {}
        if mode.has_alpaca and mode.alpaca_account_id:
            try:
                first_purchases = find_first_purchase_dates(mode.alpaca_account_id)
            except Exception as e:
                logger.warning(f"[Portfolio Agent] Could not fetch first purchase dates: {e}")
        
        # Add first purchase dates to position details
        for pos in position_details:
            pos['first_purchase'] = first_purchases.get(pos['symbol'])
        
        # Calculate risk and diversification scores using the same logic as the backend API
        risk_score = Decimal('0')
        diversification_score = Decimal('0')
        
        if position_details:
            try:
                from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyzer, PortfolioAnalyticsEngine
                
                portfolio_positions = []
                
                # Use different conversion logic based on mode
                if mode.has_alpaca and not mode.has_plaid:
                    # Brokerage mode: Use Alpaca position mapping
                    original_positions = retrieve_portfolio_positions(config=config)
                    asset_details_map = {}
                    
                    for original_pos in original_positions:
                        mapped_pos = map_alpaca_position_to_portfolio_position(original_pos, asset_details_map)
                        if mapped_pos:
                            portfolio_positions.append(mapped_pos)
                else:
                    # Aggregation or hybrid mode: Convert holdings to PortfolioPosition format
                    # Use the same logic as backend's aggregated_calculations.py (lines 76-97)
                    for holding in holdings:
                        try:
                            current_price = Decimal('0')
                            if holding.quantity > 0:
                                current_price = holding.market_value / holding.quantity
                            
                            position = PortfolioPosition(
                                symbol=holding.symbol,
                                quantity=holding.quantity,
                                current_price=current_price,
                                market_value=holding.market_value,
                                cost_basis=holding.cost_basis,
                                unrealized_pl=holding.unrealized_pl,
                                unrealized_plpc=None
                            )
                            
                            # Classify the position for proper analytics
                            position = PortfolioAnalyzer.classify_position(position)
                            portfolio_positions.append(position)
                            
                        except Exception as e:
                            logger.warning(f"[Portfolio Agent] Could not convert {holding.symbol} to PortfolioPosition: {e}")
                            continue
                
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
        # Count holdings by source
        alpaca_count = sum(1 for p in position_details if p['source'] == 'alpaca')
        plaid_count = sum(1 for p in position_details if p['source'] == 'plaid')
        
        summary = f"""📊 **Portfolio Summary**
**Generated:** {current_timestamp}
**Account Mode:** {mode.mode.title()}

**Risk Score:** {float(risk_score):.1f}/10
**Diversification Score:** {float(diversification_score):.1f}/10
"""

        # Cash breakdown section for hybrid mode
        cash_breakdown = ""
        if mode.mode == 'hybrid' and (alpaca_cash > 0 or plaid_cash > 0):
            # Hybrid mode: Show breakdown of Clera vs External cash
            total_cash_display = alpaca_cash + plaid_cash
            cash_breakdown = f"""
• **Cash Balance:** ${float(total_cash_display):,.2f} ({float(total_cash_display/total_portfolio_value*100) if total_portfolio_value > 0 else 0:.1f}%)
  💰 **Clera Brokerage Cash:** ${float(alpaca_cash):,.2f} (available to invest on our platform)
  🏦 **External Accounts Cash:** ${float(plaid_cash):,.2f} (held in other brokerages)"""
        else:
            # Aggregation or Brokerage mode: Show total cash
            cash_breakdown = f"""
• **Cash Balance:** ${float(total_cash):,.2f} ({float(total_cash/total_portfolio_value*100) if total_portfolio_value > 0 else 0:.1f}%)"""
        
        summary += f"""{overall_emoji} **Portfolio Overview**
• **Total Portfolio Value:** ${float(total_portfolio_value):,.2f}
• **Investment Positions:** ${float(positions_value):,.2f} ({float(positions_value/total_portfolio_value*100) if total_portfolio_value > 0 else 0:.1f}%){cash_breakdown}
• **Total Positions:** {len(position_details)} investments"""
        
        # Add data source information for transparency
        if mode.mode == 'hybrid':
            summary += f"""
• **Alpaca Holdings:** {alpaca_count}
• **External Holdings (via Plaid):** {plaid_count}"""
        elif mode.mode == 'aggregation':
            summary += f"""
• **Data Source:** External accounts (via Plaid aggregation)"""
        elif mode.mode == 'brokerage':
            summary += f"""
• **Data Source:** Alpaca brokerage account"""

        if total_cost_basis > 0:
            summary += f"""
• **Unrealized P&L:** ${float(total_unrealized_pl):+,.2f} ({overall_return_pct:+.2f}%)
• **Cost Basis:** ${float(total_cost_basis):,.2f}"""

        # ========== ACCOUNT BREAKDOWN SECTION (NEW!) ==========
        # For Plaid users, show account-level breakdown
        account_breakdown_section = ""
        if mode.has_plaid and position_details:
            try:
                from clera_agents.services.account_breakdown_service import AccountBreakdownService
                
                # Get account information
                account_info = AccountBreakdownService.get_account_information(user_id)
                
                # Group holdings by account
                account_holdings = AccountBreakdownService.group_holdings_by_account(holdings, user_id)
                
                if len(account_holdings) > 1 or (len(account_holdings) == 1 and 'all' not in account_holdings):
                    account_breakdown_section = "\n\n📁 **Account Breakdown**\n"
                    account_breakdown_section += "Here's how your portfolio is distributed across your connected accounts:\n"
                    
                    for account_id, holdings_list in sorted(account_holdings.items(), key=lambda x: sum(h['account_market_value'] for h in x[1]), reverse=True):
                        # Get account name
                        if account_id.startswith('plaid_'):
                            provider_id = account_id.replace('plaid_', '')
                            acct_info = account_info.get(provider_id, {})
                            
                            # Log available keys for debugging
                            if not acct_info:
                                logger.debug(f"[Portfolio Agent] No account info found for provider_id: {provider_id}")
                                logger.debug(f"[Portfolio Agent] Available account_info keys: {list(account_info.keys())[:5]}")
                            
                            account_name = acct_info.get('account_name', 'Unknown Account')
                            institution = acct_info.get('institution_name', 'Unknown Institution')
                            account_type = acct_info.get('account_subtype', acct_info.get('account_type', 'investment'))
                            account_display = f"{institution} - {account_name} ({account_type.replace('_', ' ').title()})"
                        elif account_id == 'alpaca':
                            account_display = "Clera Brokerage Account"
                        else:
                            account_display = "Unknown Account"
                        
                        # Calculate account value using account-specific market values
                        account_value = sum(h['account_market_value'] for h in holdings_list)
                        account_pct = float(account_value / total_portfolio_value * 100) if total_portfolio_value > 0 else 0
                        
                        # Calculate account metrics
                        metrics = AccountBreakdownService.calculate_account_metrics(holdings_list)
                        
                        account_breakdown_section += f"""
\n🏦 **{account_display}**
• **Account Value:** ${float(account_value):,.2f} ({account_pct:.1f}% of total portfolio)
• **Holdings:** {len(holdings_list)} securities
• **Risk Score:** {float(metrics['risk_score']):.1f}/10
• **Diversification Score:** {float(metrics['diversification_score']):.1f}/10
"""
                        
                        # List ALL holdings in this account (so agent knows complete picture)
                        sorted_holdings = sorted(holdings_list, key=lambda x: x['account_market_value'], reverse=True)
                        for h_item in sorted_holdings:  # Show ALL holdings per account
                            h = h_item['holding']
                            acct_mv = h_item['account_market_value']
                            h_pct = float(acct_mv / account_value * 100) if account_value > 0 else 0
                            account_breakdown_section += f"  • {h.symbol}: ${float(acct_mv):,.2f} ({h_pct:.1f}%)\n"
                
                logger.info(f"[Portfolio Agent] Generated account breakdown for {len(account_holdings)} accounts")
            except Exception as e:
                logger.warning(f"[Portfolio Agent] Could not generate account breakdown: {e}")
                # Continue without account breakdown
        
        # ========== MAIN HOLDINGS SECTION ==========
        if position_details:
            summary += f"""

📈 **Holdings Breakdown**
"""
            
            # Add position details
            for pos in position_details:
                weight_display = f"{pos['weight']*100:.1f}%"
                
                # Include security name and type for better context
                security_info = ""
                if pos['security_name'] != pos['symbol']:
                    security_info = f" - {pos['security_name']}"
                
                type_display = f" [{pos['security_type'].title()}]" if pos['security_type'] != 'equity' else ""
                
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
                
                # Format quantity display
                qty_display = f"\n• Quantity: {float(pos['quantity']):.2f} shares" if pos.get('quantity') else ""
                
                # Format return percentage (handle N/A for unreliable cost basis)
                if pos['unrealized_plpc'] is None:
                    plpc_display = "N/A"
                else:
                    plpc_display = f"{pos['unrealized_plpc']:+.2f}%"
                
                summary += f"""
{pos['emoji']} **{pos['symbol']}**{security_info}{type_display} ({weight_display})
• Value: ${float(pos['market_value']):,.2f}{qty_display}
• P&L: ${float(pos['unrealized_pl']):+,.2f} ({plpc_display}){first_purchase_str}"""
        
            # Add insights (all metrics exclude cash - these are investment positions only)
            summary += f"""

💡 **Portfolio Insights**
• **Largest Investment:** {position_details[0]['symbol']} ({position_details[0]['weight']*100:.1f}% of portfolio)"""
            
            # Find best performer (skip N/A values)
            valid_performers = [p for p in position_details if p['unrealized_plpc'] is not None]
            if valid_performers:
                best_performer = max(valid_performers, key=lambda x: x['unrealized_plpc'])
                summary += f"""
• **Best Performer:** {best_performer['symbol']} ({best_performer['unrealized_plpc']:+.2f}%)"""
            
            summary += f"""
• **Concentration Risk:** {'HIGH' if position_details[0]['weight'] > 0.3 else 'MODERATE' if position_details[0]['weight'] > 0.2 else 'LOW'}
• **Risk Score:** {float(risk_score):.1f}/10 ({'LOW' if float(risk_score) < 3 else 'MEDIUM' if float(risk_score) < 7 else 'HIGH'})
• **Diversification Score:** {float(diversification_score):.1f}/10 ({'POOR' if float(diversification_score) < 3 else 'MODERATE' if float(diversification_score) < 7 else 'GOOD'})"""
            
            if len(position_details) >= 3:
                summary += f"""
• **Top 3 Investments:** {position_details[0]['symbol']}, {position_details[1]['symbol']}, {position_details[2]['symbol']}"""
        else:
            summary += f"""

💡 **Portfolio Status**
• **Portfolio Type:** Cash-only portfolio
• **Investment Opportunity:** ${float(cash_balance):,.2f} available for investment
• **Next Steps:** Consider diversified investment strategy"""
        
        # Add account breakdown section if generated
        if account_breakdown_section:
            summary += account_breakdown_section
        
        summary += """

📋 **Quick Actions**
• Want to rebalance? Ask for rebalancing instructions
• Need analysis? Ask about specific stock performance
• Ready to trade? Use the trade execution agent"""
        
        logger.info(f"[Portfolio Agent] Successfully generated portfolio summary - Total: ${float(total_portfolio_value):,.2f} (Positions: ${float(positions_value):,.2f}, Cash: ${float(cash_balance):,.2f})")
        return summary
        
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"[Portfolio Agent] Account identification error: {error_msg}")
        
        # Check if this is a "no accounts connected" error
        if "no connected accounts" in error_msg.lower():
            return """📊 **Portfolio Summary**

❌ **No Accounts Connected**

You don't have any investment accounts connected yet.

💡 **Next Steps:**
• Connect your brokerage account (for trading capabilities)
• Or link external accounts via Plaid (for portfolio tracking)
• Visit the onboarding page to get started"""
        
        # Otherwise, it's an authentication/access error
        return f"""📊 **Portfolio Summary**

🚫 **Authentication Error**

Could not securely identify your account. This is a security protection to prevent unauthorized access.

**Error Details:** {error_msg}

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
    - For Alpaca brokerage accounts: Shows last 60 days of filled orders
    - For Plaid aggregation accounts: Shows last 12 months of investment transactions
    - Pending/open orders are not included in this report
    
    This is the primary tool for understanding your complete executed trading and account history.
    
    Returns:
        str: Comprehensive formatted account activities report with trading history
    """
    try:
        logger.info("[Portfolio Agent] Retrieving comprehensive account activities")
        
        # Get user_id from config
        from utils.account_utils import get_user_id_from_config
        user_id = get_user_id_from_config(config)
        
        # Use the unified portfolio data provider
        from clera_agents.services.portfolio_data_provider import PortfolioDataProvider
        provider = PortfolioDataProvider(user_id)
        mode = provider.get_user_mode()
        
        logger.info(f"[Portfolio Agent] Fetching activities for user {user_id} ({mode.mode} mode)")
        
        # Fetch activities based on mode
        alpaca_activities = []
        plaid_activities = []
        
        if mode.has_alpaca:
            # Try to get Alpaca activities (60 days)
            try:
                alpaca_activities = provider.get_account_activities_alpaca()
                logger.info(f"[Portfolio Agent] Retrieved {len(alpaca_activities)} Alpaca activities")
            except Exception as e:
                logger.warning(f"[Portfolio Agent] Could not fetch Alpaca activities: {e}")
        
        if mode.has_plaid:
            # Get Plaid investment transactions (12 months)
            try:
                plaid_activities = provider.get_account_activities_plaid(months_back=12)
                logger.info(f"[Portfolio Agent] Retrieved {len(plaid_activities)} Plaid transactions")
            except Exception as e:
                logger.warning(f"[Portfolio Agent] Could not fetch Plaid activities: {e}")
        
        # If both lists are empty, return appropriate message
        if not alpaca_activities and not plaid_activities:
            return f"""📋 **Account Activities**

❌ **No Activities Found**

We couldn't find any recent account activities.

**Account Mode:** {mode.mode}

💡 **This could mean:**
• You haven't made any trades or transactions yet
• Activities are still being processed
• Data sync is in progress

Contact support if you believe this is an error."""
        
        # Build the report
        current_timestamp = datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')
        report = f"""📋 **Account Activities Report**
**Generated:** {current_timestamp}
**Account Mode:** {mode.mode.title()}

"""
        
        # Add Alpaca activities if available
        if alpaca_activities:
            report += f"""**Alpaca Brokerage Account Activities (Last 60 Days)**
{len(alpaca_activities)} activities found

"""
            # Sort by date (most recent first)
            alpaca_activities.sort(key=lambda x: x['date'], reverse=True)
            
            for act in alpaca_activities[:20]:  # Show first 20
                symbol_str = f" - {act['symbol']}" if act.get('symbol') else ""
                report += f"""• {act['date']}: {act['description']}{symbol_str}
  Amount: ${float(act['amount']):,.2f}
"""
            
            if len(alpaca_activities) > 20:
                report += f"\n... and {len(alpaca_activities) - 20} more activities\n"
        
        # Add Plaid activities if available
        if plaid_activities:
            report += f"""
**External Account Transactions (via Plaid - Last 12 Months)**
{len(plaid_activities)} transactions found

"""
            # Sort by date (most recent first)
            plaid_activities.sort(key=lambda x: x['date'], reverse=True)
            
            for txn in plaid_activities[:20]:  # Show first 20
                report += f"""• {txn['date']}: {txn['description']}
  Quantity: {float(txn['quantity']):.2f}, Amount: ${float(txn['amount']):,.2f}
"""
            
            if len(plaid_activities) > 20:
                report += f"\n... and {len(plaid_activities) - 20} more transactions\n"
        
        report += """
💡 **Need More Details?**
• Ask about specific symbols or time periods
• Request trading statistics or summaries
"""
        
        return report
        
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"[Portfolio Agent] Account identification error: {error_msg}")
        
        # Check if this is a "no accounts connected" error
        if "no connected accounts" in error_msg.lower():
            return """📋 **Account Activities**

❌ **No Accounts Connected**

You don't have any investment accounts connected yet.

💡 **Next Steps:**
• Connect your brokerage account (for trading capabilities)
• Or link external accounts via Plaid (for portfolio tracking)
• Visit the onboarding page to get started"""
        
        return f"""📋 **Account Activities**

🚫 **Authentication Error**

Could not securely identify your account. This is a security protection to prevent unauthorized access.

**Error Details:** {error_msg}

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
