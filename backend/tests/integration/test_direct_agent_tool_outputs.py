import os
import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta, timezone
# import pandas as pd  # unused import removed

from utils.account_utils import get_account_id
from utils.alpaca.broker_client_factory import get_broker_client
from clera_agents.types.portfolio_types import AssetClass, SecurityType, TargetPortfolio, RiskProfile, AssetAllocation
from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyzer
from clera_agents.tools.purchase_history import find_first_purchase_dates

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set up a mock config with the Alpaca account ID
ALPACA_ACCOUNT_ID = "60205bf6-1d3f-46a5-8a1c-7248ee9210c5"
mock_config = {
    'configurable': {
        'account_id': ALPACA_ACCOUNT_ID,
        'user_id': 'test-user-id'  # dummy user id for context
    }
}

def get_account_cash_balance(account_id):
    broker_client = get_broker_client()
    # Use get_trade_account_by_id for cash balance (as used in portfolio_calculator.py)
    trade_account = broker_client.get_trade_account_by_id(account_id)
    
    # Use the cash field (we confirmed it exists)
    cash_value = trade_account.cash
    return Decimal(str(cash_value))

def get_portfolio_positions(account_id):
    broker_client = get_broker_client()
    # Use get_all_positions_for_account (correct method name from Alpaca API)
    positions = broker_client.get_all_positions_for_account(account_id=account_id)
    return [PortfolioPosition.from_alpaca_position(p) for p in positions]

def get_target_portfolio_by_type(portfolio_type: str) -> TargetPortfolio:
    """Get target portfolio allocation by type.
    Args:
        portfolio_type: Type of portfolio ('aggressive', 'balanced', 'conservative')
    Returns:
        TargetPortfolio: Target allocation strategy
    """
    if portfolio_type.lower() == 'aggressive':
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
        return get_target_portfolio_by_type('balanced')

def get_risk_and_diversification_scores(account_id):
    """Get risk and diversification scores using the same backend logic as frontend."""
    # Import here to avoid circular imports
    from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine
    from api_server import map_alpaca_position_to_portfolio_position
    
    try:
        # Get the original Alpaca positions (not the converted ones)
        broker_client = get_broker_client()
        alpaca_positions = broker_client.get_all_positions_for_account(account_id=account_id)
        
        if not alpaca_positions:
            return {'risk_score': Decimal('0'), 'diversification_score': Decimal('0')}
        
        # Create asset details map (empty for now, but could be enhanced)
        asset_details_map = {}
        
        # Map positions using the same logic as the backend API
        portfolio_positions = []
        for alpaca_pos in alpaca_positions:
            mapped_pos = map_alpaca_position_to_portfolio_position(alpaca_pos, asset_details_map)
            if mapped_pos:
                portfolio_positions.append(mapped_pos)
        
        if not portfolio_positions:
            return {'risk_score': Decimal('0'), 'diversification_score': Decimal('0')}
        
        # Use the same logic as the backend analytics endpoint
        risk_score = PortfolioAnalyticsEngine.calculate_risk_score(portfolio_positions)
        diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(portfolio_positions)
        
        return {
            'risk_score': risk_score,
            'diversification_score': diversification_score
        }
    except Exception as e:
        logger.error(f"Error calculating risk/diversification scores: {e}")
        return {'risk_score': Decimal('0'), 'diversification_score': Decimal('0')}

def direct_get_portfolio_summary(config):
    """EXACT replica of the real get_portfolio_summary tool logic."""
    try:
        # Validate user context first
        account_id = get_account_id(config=config)
        logger.info(f"[Portfolio Agent] Generating portfolio summary for account: {account_id}")
        
        # Get cash balance first
        cash_balance = get_account_cash_balance(account_id)
        
        # Get all positions
        positions = get_portfolio_positions(account_id)
        
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
        
        # Get risk and diversification scores (same as frontend uses)
        scores = get_risk_and_diversification_scores(account_id)
        risk_score = float(scores['risk_score'])
        diversification_score = float(scores['diversification_score'])
        
        # Get current timestamp in UTC
        current_timestamp = datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')
        
        # Build summary with CORRECTED portfolio value calculations
        summary = f"""📊 **Portfolio Summary**
**Generated:** {current_timestamp}

{overall_emoji} **Portfolio Overview**
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
        
            # Add insights with risk and diversification scores
            risk_description = "LOW" if risk_score < 3 else "MODERATE" if risk_score < 7 else "HIGH" if risk_score < 9 else "VERY HIGH"
            div_description = "POOR" if diversification_score < 3 else "MODERATE" if diversification_score < 7 else "GOOD"
            
            summary += f"""

💡 **Portfolio Insights**
• **Largest Position:** {position_details[0]['symbol']} ({position_details[0]['weight']*100:.1f}% of portfolio)
• **Best Performer:** {max(position_details, key=lambda x: x['unrealized_plpc'])['symbol']} ({max(position_details, key=lambda x: x['unrealized_plpc'])['unrealized_plpc']:+.2f}%)
• **Worst Performer:** {min(position_details, key=lambda x: x['unrealized_plpc'])['symbol']} ({min(position_details, key=lambda x: x['unrealized_plpc'])['unrealized_plpc']:+.2f}%)
• **Concentration Risk:** {'HIGH' if position_details[0]['weight'] > 0.3 else 'MODERATE' if position_details[0]['weight'] > 0.2 else 'LOW'}
• **Risk Score:** {risk_score:.1f}/10 ({risk_description})
• **Diversification Score:** {diversification_score:.1f}/10 ({div_description})"""
            
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
        return f"❌ **Error:** Could not generate portfolio summary. Please try again later.\n\nError details: {str(e)}"

def direct_rebalance_instructions(config, target_type="balanced"):
    account_id = get_account_id(config)
    cash_balance = get_account_cash_balance(account_id)
    positions = get_portfolio_positions(account_id)
    target_portfolio = get_target_portfolio_by_type(target_type)
    instructions = PortfolioAnalyzer.generate_rebalance_instructions(positions, target_portfolio, cash_balance)
    return instructions

def run_all():
    print("\n=== get_portfolio_summary (REAL TOOL OUTPUT) ===")
    try:
        summary = direct_get_portfolio_summary(mock_config)
        print(summary)
    except Exception as e:
        print(f"Error in get_portfolio_summary: {e}")

    print("\n=== rebalance_instructions (REAL TOOL OUTPUT) ===")
    try:
        instructions = direct_rebalance_instructions(mock_config, target_type="balanced")
        print(instructions)
    except Exception as e:
        print(f"Error in rebalance_instructions: {e}")

if __name__ == "__main__":
    run_all() 