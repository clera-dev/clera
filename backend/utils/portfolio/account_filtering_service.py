"""
Account Filtering Service - Modular holdings filtering for X-Ray Vision

This service provides clean, reusable account-level filtering for all portfolio
analytics. Follows Single Responsibility Principle.

Usage:
    filter_service = AccountFilteringService()
    filtered_holdings = await filter_service.filter_holdings_by_account(user_id, account_id)
    analytics = calculate_analytics(filtered_holdings)
"""

import logging
import json
from typing import List, Dict, Any, Optional
from decimal import Decimal

logger = logging.getLogger(__name__)


class AccountFilteringService:
    """Service for filtering aggregated holdings to specific accounts."""
    
    def __init__(self, supabase_client=None):
        """
        Initialize with optional Supabase client injection.
        
        Args:
            supabase_client: Supabase client instance (injected for testability)
        """
        self._supabase = supabase_client
    
    def _get_supabase_client(self):
        """Get or create Supabase client."""
        if self._supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self._supabase = get_supabase_client()
        return self._supabase
    
    async def filter_holdings_by_account(
        self,
        user_id: str,
        filter_account: Optional[str]
    ) -> List[Dict[str, Any]]:
        """
        Filter aggregated holdings to a specific account.
        
        Args:
            user_id: User ID
            filter_account: Account ID to filter to (e.g., 'plaid_xxxxx'), or None/'total' for all
            
        Returns:
            List of holdings for the specific account
        """
        try:
            supabase = self._get_supabase_client()
            
            # Get all holdings for user (INCLUDING CASH for accurate allocation calculation)
            result = supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', user_id)\
                .execute()
            
            if not result.data:
                logger.warning(f"No holdings found for user {user_id}")
                return []
            
            all_holdings = result.data
            
            # If no filter or total, return all holdings
            if not filter_account or filter_account == 'total':
                logger.info(f"Returning all {len(all_holdings)} holdings for user {user_id}")
                return all_holdings
            
            # CRITICAL FIX: Handle different account ID formats
            # account_contributions uses prefixed format: plaid_XXXX or snaptrade_XXXX
            account_id_for_filter = filter_account
            
            # If already prefixed (plaid_ or snaptrade_), use as-is
            if filter_account.startswith('plaid_') or filter_account.startswith('snaptrade_'):
                account_id_for_filter = filter_account
                logger.info(f"Using prefixed account ID directly: {account_id_for_filter}")
            else:
                # This might be a UUID, try to convert
                converted_id = self.get_prefixed_account_id_from_uuid(filter_account)
                if converted_id:
                    account_id_for_filter = converted_id
                    logger.info(f"Converted UUID {filter_account} to prefixed ID {account_id_for_filter}")
                else:
                    logger.warning(f"Could not convert {filter_account}, using as-is")
            
            # Filter to specific account
            filtered_holdings = []
            
            for holding in all_holdings:
                # Get account contributions for this holding
                contributions = holding.get('account_contributions')
                if isinstance(contributions, str):
                    contributions = json.loads(contributions) if contributions else []
                
                if not contributions:
                    continue
                
                # Find contribution from specific account
                for contrib in contributions:
                    if contrib.get('account_id') == account_id_for_filter:
                        # Create holding with account-specific values
                        filtered_holding = {
                            **holding,  # Copy all fields
                            # Override with account-specific values
                            'total_market_value': float(contrib.get('market_value', 0)),
                            'total_quantity': float(contrib.get('quantity', 0)),
                            'total_cost_basis': float(contrib.get('cost_basis', 0)) if 'cost_basis' in contrib else float(holding.get('total_cost_basis', 0)),
                            # Recalculate unrealized gain/loss for this account
                            'unrealized_gain_loss': float(contrib.get('market_value', 0)) - float(contrib.get('cost_basis', 0)) if 'cost_basis' in contrib else 0,
                        }
                        filtered_holdings.append(filtered_holding)
                        break
            
            logger.info(f"Filtered {len(all_holdings)} holdings to {len(filtered_holdings)} for account {account_id_for_filter}")
            
            return filtered_holdings
            
        except Exception as e:
            logger.error(f"Error filtering holdings for user {user_id}, account {filter_account}: {e}")
            return []
    
    def get_prefixed_account_id_from_uuid(self, account_uuid: str) -> Optional[str]:
        """
        Convert account UUID to prefixed account ID format (plaid_ or snaptrade_).
        
        Args:
            account_uuid: UUID from frontend (e.g., '94ae8733-dce6...')
            
        Returns:
            Prefixed account ID (e.g., 'plaid_xxx' or 'snaptrade_xxx')
        """
        try:
            supabase = self._get_supabase_client()
            
            # Look up account by UUID
            result = supabase.table('user_investment_accounts')\
                .select('provider, provider_account_id')\
                .eq('id', account_uuid)\
                .single()\
                .execute()
            
            if result.data:
                # CRITICAL: Use 'plaid' as default to match aggregated_portfolio_service.py
                # Inconsistent defaults would cause silent filtering failures
                provider = result.data.get('provider', 'plaid')
                provider_account_id = result.data['provider_account_id']
                return f"{provider}_{provider_account_id}"
            
            logger.warning(f"Could not find account for UUID {account_uuid}")
            return None
            
        except Exception as e:
            logger.error(f"Error converting account UUID {account_uuid}: {e}")
            return None
    
    # Keep legacy method name for backwards compatibility
    def get_account_id_from_uuid(self, account_uuid: str) -> Optional[str]:
        """Legacy method - use get_prefixed_account_id_from_uuid instead."""
        return self.get_prefixed_account_id_from_uuid(account_uuid)


# Global service instance
_account_filtering_service = None

def get_account_filtering_service() -> AccountFilteringService:
    """Get singleton instance of account filtering service."""
    global _account_filtering_service
    if _account_filtering_service is None:
        _account_filtering_service = AccountFilteringService()
    return _account_filtering_service

