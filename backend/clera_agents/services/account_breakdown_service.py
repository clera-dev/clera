"""
Account Breakdown Service for Portfolio Management Agent

Provides account-level portfolio breakdown for comprehensive portfolio summaries.
"""

import logging
import decimal
from typing import List, Dict, Any, Optional
from decimal import Decimal
from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyzer, PortfolioAnalyticsEngine

logger = logging.getLogger(__name__)


class AccountBreakdownService:
    """Service for fetching and organizing portfolio data by account"""
    
    @staticmethod
    def get_account_information(user_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Fetch account information from database.
        
        Returns dict mapping provider_account_id to account details.
        """
        try:
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            result = supabase.table('user_investment_accounts')\
                .select('provider_account_id, account_name, account_type, account_subtype, institution_name')\
                .eq('user_id', user_id)\
                .eq('provider', 'plaid')\
                .eq('is_active', True)\
                .execute()
            
            account_info = {}
            if result.data:
                for account in result.data:
                    provider_account_id = account['provider_account_id']
                    account_info[provider_account_id] = {
                        'account_name': account.get('account_name', 'Unknown Account'),
                        'account_type': account.get('account_type', 'unknown'),
                        'account_subtype': account.get('account_subtype', 'unknown'),
                        'institution_name': account.get('institution_name', 'Unknown Institution'),
                    }
            
            logger.info(f"[AccountBreakdownService] Fetched info for {len(account_info)} accounts")
            return account_info
            
        except Exception as e:
            logger.error(f"[AccountBreakdownService] Error fetching account info: {e}")
            return {}
    
    @staticmethod
    def group_holdings_by_account(holdings: List[Any], user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Group holdings by their source account using account_contributions.
        
        Args:
            holdings: List of PortfolioHolding objects from PortfolioDataProvider
            user_id: User ID to ensure we only fetch this user's data
            
        Returns:
            Dict mapping account_id to list of holdings with per-account details
        """
        try:
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            # Get the raw holdings data with account_contributions
            symbols = [h.symbol for h in holdings]
            if not symbols:
                return {}
            
            # Fetch account_contributions for all holdings (MUST filter by user_id!)
            result = supabase.table('user_aggregated_holdings')\
                .select('symbol, account_contributions')\
                .eq('user_id', user_id)\
                .in_('symbol', symbols)\
                .execute()
            
            # Map symbol to account_contributions
            symbol_to_accounts = {}
            if result.data:
                for row in result.data:
                    symbol_to_accounts[row['symbol']] = row.get('account_contributions', [])
            
            # Group holdings by account
            account_holdings = {}
            
            for holding in holdings:
                contributions = symbol_to_accounts.get(holding.symbol, [])
                
                # If no account contributions, treat as unknown account
                if not contributions:
                    if 'unknown' not in account_holdings:
                        account_holdings['unknown'] = []
                    account_holdings['unknown'].append({
                        'holding': holding,
                        'account_quantity': holding.quantity,
                        'account_market_value': holding.market_value,
                        'is_shared': False
                    })
                    continue
                
                # Add holding to each account that holds it
                for contrib in contributions:
                    account_id = contrib.get('account_id', 'unknown')
                    
                    if account_id not in account_holdings:
                        account_holdings[account_id] = []
                    
                    # Create a holding entry for this specific account with actual values
                    try:
                        account_qty = Decimal(str(contrib.get('quantity', 0)))
                        account_mv = Decimal(str(contrib.get('market_value', 0)))
                    except (ValueError, TypeError) as e:
                        logger.warning(f"[AccountBreakdownService] Invalid values for {holding.symbol} in account {account_id}")
                        account_qty = holding.quantity
                        account_mv = holding.market_value
                    
                    account_holdings[account_id].append({
                        'holding': holding,
                        'account_quantity': account_qty,
                        'account_market_value': account_mv,
                        'is_shared': len(contributions) > 1  # Held in multiple accounts
                    })
            
            logger.info(f"[AccountBreakdownService] Grouped {len(holdings)} holdings into {len(account_holdings)} accounts")
            return account_holdings
            
        except Exception as e:
            logger.error(f"[AccountBreakdownService] Error grouping holdings by account: {e}", exc_info=True)
            # Fallback: group all holdings under 'all' key
            return {'all': [{'holding': h, 'account_quantity': h.quantity, 'account_market_value': h.market_value, 'is_shared': False} for h in holdings]}
    
    @staticmethod
    def calculate_account_metrics(account_holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate risk and diversification scores for a specific account's holdings.
        
        Args:
            account_holdings: List of holdings in the account
            
        Returns:
            Dict with risk_score and diversification_score
        """
        try:
            if not account_holdings:
                return {'risk_score': Decimal('0'), 'diversification_score': Decimal('0')}
            
            # Convert to PortfolioPosition format for analytics
            portfolio_positions = []
            
            for item in account_holdings:
                holding = item['holding']
                
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
                    
                    # Classify the position
                    position = PortfolioAnalyzer.classify_position(position)
                    portfolio_positions.append(position)
                    
                except Exception as e:
                    logger.warning(f"[AccountBreakdownService] Could not convert {holding.symbol}: {e}")
                    continue
            
            if not portfolio_positions:
                return {'risk_score': Decimal('0'), 'diversification_score': Decimal('0')}
            
            # Calculate scores
            risk_score = PortfolioAnalyticsEngine.calculate_risk_score(portfolio_positions)
            diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(portfolio_positions)
            
            return {
                'risk_score': risk_score,
                'diversification_score': diversification_score
            }
            
        except Exception as e:
            logger.error(f"[AccountBreakdownService] Error calculating account metrics: {e}")
            return {'risk_score': Decimal('0'), 'diversification_score': Decimal('0')}

