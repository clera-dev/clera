"""
Trade routing service for multi-brokerage trade execution.

This service determines which brokerage can/should execute a trade based on:
- User's connected accounts
- Symbol availability in accounts  
- Trading permissions
"""

import logging
from typing import Optional, Dict, Any, Tuple, List
from utils.supabase.db_client import get_supabase_client

logger = logging.getLogger(__name__)

class TradeRoutingService:
    """Service for routing trades to appropriate brokerages."""
    
    @staticmethod
    def get_user_portfolio_mode(user_id: str) -> Dict[str, Any]:
        """
        Determine user's portfolio mode and available trading accounts.
        
        Returns:
            {
                'mode': 'brokerage' | 'aggregation' | 'hybrid' | 'none',
                'has_alpaca': bool,
                'has_snaptrade': bool,
                'alpaca_account_id': Optional[str],
                'snaptrade_accounts': List[Dict]
            }
        """
        supabase = get_supabase_client()
        
        # Check for Alpaca account
        alpaca_result = supabase.table('user_onboarding')\
            .select('alpaca_account_id')\
            .eq('user_id', user_id)\
            .execute()
        
        has_alpaca = bool(alpaca_result.data and alpaca_result.data[0].get('alpaca_account_id'))
        alpaca_account_id = alpaca_result.data[0].get('alpaca_account_id') if alpaca_result.data else None
        
        # Check for SnapTrade accounts (with trade permission)
        snaptrade_result = supabase.table('user_investment_accounts')\
            .select('id, provider_account_id, institution_name, account_name, connection_type, brokerage_name')\
            .eq('user_id', user_id)\
            .eq('provider', 'snaptrade')\
            .eq('connection_type', 'trade')\
            .eq('is_active', True)\
            .execute()
        
        snaptrade_accounts = snaptrade_result.data or []
        has_snaptrade = bool(snaptrade_accounts)
        
        # Determine mode
        if has_alpaca and has_snaptrade:
            mode = 'hybrid'
        elif has_alpaca:
            mode = 'brokerage'
        elif has_snaptrade:
            mode = 'aggregation'
        else:
            mode = 'none'
        
        return {
            'mode': mode,
            'has_alpaca': has_alpaca,
            'has_snaptrade': has_snaptrade,
            'alpaca_account_id': alpaca_account_id,
            'snaptrade_accounts': snaptrade_accounts
        }
    
    @staticmethod
    def detect_symbol_account(symbol: str, user_id: str) -> Tuple[Optional[str], Optional[str], Optional[Dict]]:
        """
        Detect which account holds a specific symbol.
        
        PRODUCTION-GRADE: This method queries the user_aggregated_holdings table
        which stores account information in the 'account_contributions' JSONB column.
        The structure is: [{"account_id": "snaptrade_xxx", "quantity": 10, ...}, ...]
        
        Returns:
            (account_id, account_type, account_info)
            account_type: 'alpaca' | 'snaptrade' | None
        """
        supabase = get_supabase_client()
        
        # Check aggregated holdings
        # CRITICAL FIX: Query 'account_contributions' column, not 'accounts'
        # The database schema defines this column as JSONB with account breakdown
        holdings_result = supabase.table('user_aggregated_holdings')\
            .select('account_contributions')\
            .eq('user_id', user_id)\
            .eq('symbol', symbol.upper())\
            .execute()
        
        if not holdings_result.data:
            logger.debug(f"[TradeRouting] No holdings found for {symbol} for user {user_id}")
            return None, None, None
        
        # Get account contributions array from the JSONB column
        # CRITICAL FIX: The column is 'account_contributions', not 'accounts'
        accounts_data = holdings_result.data[0].get('account_contributions', [])
        
        if not accounts_data:
            logger.debug(f"[TradeRouting] Holdings exist for {symbol} but no account contributions data")
            return None, None, None
        
        logger.debug(f"[TradeRouting] Found {len(accounts_data)} account(s) holding {symbol}")
        
        # Prefer SnapTrade accounts with trade permission, then Alpaca
        for acc in accounts_data:
            account_id = acc.get('account_id', '')
            
            if account_id.startswith('snaptrade_'):
                # SECURITY: Check if this account has trade permission AND belongs to user
                account_info = supabase.table('user_investment_accounts')\
                    .select('*')\
                    .eq('user_id', user_id)\
                    .eq('provider_account_id', account_id.replace('snaptrade_', ''))\
                    .eq('provider', 'snaptrade')\
                    .eq('connection_type', 'trade')\
                    .eq('is_active', True)\
                    .execute()
                
                if account_info.data:
                    logger.info(f"[TradeRouting] Symbol {symbol} found in SnapTrade account {account_id}")
                    return account_id, 'snaptrade', account_info.data[0]
                else:
                    logger.debug(f"[TradeRouting] SnapTrade account {account_id} not trade-enabled or inactive")
            
            elif account_id.startswith('clera_') or account_id == 'alpaca':
                portfolio_mode = TradeRoutingService.get_user_portfolio_mode(user_id)
                if portfolio_mode['has_alpaca']:
                    logger.info(f"[TradeRouting] Symbol {symbol} found in Alpaca account")
                    return portfolio_mode['alpaca_account_id'], 'alpaca', None
        
        logger.debug(f"[TradeRouting] No tradeable account found for {symbol}")
        return None, None, None
    
    @staticmethod
    def get_trading_accounts(user_id: str) -> List[Dict[str, Any]]:
        """
        Get all trading-enabled accounts for a user.
        
        Returns:
            List of account dicts with: account_id, account_type, institution, can_trade
        """
        portfolio_mode = TradeRoutingService.get_user_portfolio_mode(user_id)
        accounts = []
        
        # Add Alpaca account if available
        if portfolio_mode['has_alpaca']:
            accounts.append({
                'account_id': portfolio_mode['alpaca_account_id'],
                'account_type': 'alpaca',
                'institution_name': 'Clera Brokerage',
                'account_name': 'Clera Account',
                'can_trade': True
            })
        
        # Add SnapTrade accounts
        for snap_acc in portfolio_mode.get('snaptrade_accounts', []):
            accounts.append({
                'account_id': f"snaptrade_{snap_acc['provider_account_id']}",
                'account_type': 'snaptrade',
                'institution_name': snap_acc.get('institution_name', 'Unknown'),
                'account_name': snap_acc.get('account_name', 'Investment Account'),
                'brokerage_name': snap_acc.get('brokerage_name', 'Unknown'),
                'can_trade': snap_acc.get('connection_type') == 'trade'
            })
        
        return accounts
    
    @staticmethod
    def get_snaptrade_user_credentials(user_id: str) -> Optional[Dict[str, str]]:
        """Get SnapTrade user credentials from database."""
        supabase = get_supabase_client()
        result = supabase.table('snaptrade_users')\
            .select('snaptrade_user_id, snaptrade_user_secret')\
            .eq('user_id', user_id)\
            .execute()
        
        if not result.data:
            return None
        
        return {
            'user_id': result.data[0]['snaptrade_user_id'],
            'user_secret': result.data[0]['snaptrade_user_secret']
        }

