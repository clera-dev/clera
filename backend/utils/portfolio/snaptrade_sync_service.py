"""
SnapTrade Portfolio Synchronization Service

This service handles background synchronization of portfolio data from SnapTrade
to the aggregated_holdings table. It's triggered by webhooks and scheduled jobs.

Features:
- Webhook-driven sync (real-time updates)
- Scheduled full sync (daily)
- Incremental updates
- Error recovery and retry logic
- Deduplication
"""

import logging
import asyncio
from typing import Dict, List, Optional
from decimal import Decimal
from datetime import datetime

from utils.supabase.db_client import get_supabase_client
from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
from utils.portfolio.abstract_provider import Position

logger = logging.getLogger(__name__)


class SnapTradeSyncService:
    """Service for syncing SnapTrade data to aggregated holdings."""
    
    def __init__(self):
        self.provider = SnapTradePortfolioProvider()
        self.supabase = get_supabase_client()
    
    async def sync_user_portfolio(self, user_id: str, force_full: bool = False) -> Dict:
        """
        Sync all SnapTrade holdings for a user.
        
        Args:
            user_id: Supabase user ID
            force_full: If True, delete and rebuild all holdings
            
        Returns:
            Dict with sync stats
        """
        try:
            logger.info(f"🔄 Starting SnapTrade portfolio sync for user {user_id}")
            
            # Get all positions from SnapTrade
            positions = await self.provider.get_positions(user_id)
            
            if not positions:
                logger.info(f"No SnapTrade positions found for user {user_id}")
                return {
                    "success": True,
                    "user_id": user_id,
                    "positions_synced": 0,
                    "message": "No positions to sync"
                }
            
            # Group positions by symbol for aggregation
            symbol_holdings = {}
            for position in positions:
                symbol = position.symbol
                if symbol not in symbol_holdings:
                    symbol_holdings[symbol] = {
                        'positions': [],
                        'total_quantity': Decimal('0'),
                        'total_market_value': Decimal('0'),
                        'total_cost_basis': Decimal('0'),
                        'security_name': position.security_name,
                        'security_type': position.security_type
                    }
                
                symbol_holdings[symbol]['positions'].append(position)
                symbol_holdings[symbol]['total_quantity'] += position.quantity
                symbol_holdings[symbol]['total_market_value'] += position.market_value
                symbol_holdings[symbol]['total_cost_basis'] += position.cost_basis
            
            # If force_full, delete existing SnapTrade holdings
            if force_full:
                await self._clear_user_holdings(user_id)
            
            # Upsert aggregated holdings
            holdings_synced = 0
            for symbol, data in symbol_holdings.items():
                try:
                    await self._upsert_aggregated_holding(user_id, symbol, data)
                    holdings_synced += 1
                except Exception as e:
                    logger.error(f"Error upserting holding {symbol}: {e}", exc_info=True)
                    continue
            
            logger.info(f"✅ Synced {holdings_synced} holdings for user {user_id}")
            
            return {
                "success": True,
                "user_id": user_id,
                "positions_synced": holdings_synced,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error syncing SnapTrade portfolio for user {user_id}: {e}", exc_info=True)
            return {
                "success": False,
                "user_id": user_id,
                "error": str(e)
            }
    
    async def sync_specific_account(self, user_id: str, account_id: str) -> Dict:
        """
        Sync holdings for a specific SnapTrade account.
        
        This is used when a webhook notifies us of changes to one account.
        
        Args:
            user_id: Supabase user ID
            account_id: SnapTrade account ID (with or without prefix)
            
        Returns:
            Dict with sync stats
        """
        try:
            # Ensure account_id has snaptrade_ prefix
            if not account_id.startswith('snaptrade_'):
                account_id = f"snaptrade_{account_id}"
            
            logger.info(f"🔄 Syncing specific account {account_id} for user {user_id}")
            
            # Get positions for this specific account
            positions = await self.provider.get_positions(user_id, account_id=account_id)
            
            if not positions:
                logger.info(f"No positions found for account {account_id}")
                return {
                    "success": True,
                    "user_id": user_id,
                    "account_id": account_id,
                    "positions_synced": 0
                }
            
            # Get existing aggregated holdings for this user
            existing_holdings = self.supabase.table('user_aggregated_holdings')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('data_source', 'snaptrade')\
                .execute()
            
            existing_by_symbol = {h['symbol']: h for h in existing_holdings.data}
            
            # Update each position
            updated = 0
            for position in positions:
                try:
                    await self._update_position_in_aggregated(
                        user_id, 
                        position,
                        existing_by_symbol.get(position.symbol)
                    )
                    updated += 1
                except Exception as e:
                    logger.error(f"Error updating position {position.symbol}: {e}")
                    continue
            
            logger.info(f"✅ Updated {updated} positions for account {account_id}")
            
            return {
                "success": True,
                "user_id": user_id,
                "account_id": account_id,
                "positions_synced": updated,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error syncing account {account_id}: {e}", exc_info=True)
            return {
                "success": False,
                "user_id": user_id,
                "account_id": account_id,
                "error": str(e)
            }
    
    async def _upsert_aggregated_holding(self, user_id: str, symbol: str, data: Dict):
        """Upsert an aggregated holding record."""
        try:
            # Build accounts array
            accounts_list = []
            for position in data['positions']:
                accounts_list.append({
                    'account_id': position.account_id,
                    'institution_name': position.institution_name,
                    'quantity': float(position.quantity),
                    'market_value': float(position.market_value),
                    'cost_basis': float(position.cost_basis)
                })
            
            # Calculate average cost basis
            total_quantity = float(data['total_quantity'])
            total_cost_basis = float(data['total_cost_basis'])
            avg_cost_basis = total_cost_basis / total_quantity if total_quantity > 0 else 0
            
            # Calculate unrealized gain/loss
            total_market_value = float(data['total_market_value'])
            unrealized_gain_loss = total_market_value - total_cost_basis
            unrealized_gain_loss_percent = (unrealized_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0
            
            # Build holding record for INSERT (includes all fields)
            insert_record = {
                'user_id': user_id,
                'symbol': symbol,
                'security_name': data['security_name'],
                'security_type': data['security_type'],
                'total_quantity': total_quantity,
                'total_market_value': total_market_value,
                'total_cost_basis': total_cost_basis,
                'average_cost_basis': avg_cost_basis,
                'unrealized_gain_loss': unrealized_gain_loss,
                'unrealized_gain_loss_percent': unrealized_gain_loss_percent,
                'account_contributions': accounts_list,
                'account_count': len(accounts_list),
                'data_source': 'snaptrade',
                'updated_at': datetime.utcnow().isoformat()  # FIXED: Using 'updated_at' (after migration 009)
            }
            
            # Build update record WITHOUT timestamp fields (database will auto-update those)
            update_record = {
                'security_name': data['security_name'],
                'security_type': data['security_type'],
                'total_quantity': total_quantity,
                'total_market_value': total_market_value,
                'total_cost_basis': total_cost_basis,
                'average_cost_basis': avg_cost_basis,
                'unrealized_gain_loss': unrealized_gain_loss,
                'unrealized_gain_loss_percent': unrealized_gain_loss_percent,
                'account_contributions': accounts_list,
                'account_count': len(accounts_list)
                # NOTE: Omit 'updated_at' - database trigger will handle this automatically
            }
            
            # Check if holding exists
            existing = self.supabase.table('user_aggregated_holdings')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('symbol', symbol)\
                .eq('data_source', 'snaptrade')\
                .execute()
            
            if existing.data:
                # Update existing record (database trigger will auto-update 'updated_at')
                self.supabase.table('user_aggregated_holdings')\
                    .update(update_record)\
                    .eq('id', existing.data[0]['id'])\
                    .execute()
                logger.debug(f"Updated holding: {symbol}")
            else:
                # Insert new record
                self.supabase.table('user_aggregated_holdings')\
                    .insert(insert_record)\
                    .execute()
                logger.debug(f"Inserted holding: {symbol}")
                
        except Exception as e:
            logger.error(f"Error upserting holding {symbol}: {e}", exc_info=True)
            raise
    
    async def _update_position_in_aggregated(
        self, 
        user_id: str, 
        position: Position,
        existing_holding: Optional[Dict]
    ):
        """
        Update a single position in aggregated holdings.
        
        This is more complex because we need to handle the case where
        one symbol is held across multiple accounts.
        """
        try:
            if not existing_holding:
                # Create new holding for this symbol
                await self._upsert_aggregated_holding(user_id, position.symbol, {
                    'positions': [position],
                    'total_quantity': position.quantity,
                    'total_market_value': position.market_value,
                    'total_cost_basis': position.cost_basis,
                    'security_name': position.security_name,
                    'security_type': position.security_type
                })
                return
            
            # Update existing holding
            accounts_list = existing_holding.get('accounts', [])
            
            # Find and update this account's contribution
            account_found = False
            for acc in accounts_list:
                if acc.get('account_id') == position.account_id:
                    acc['quantity'] = float(position.quantity)
                    acc['market_value'] = float(position.market_value)
                    acc['cost_basis'] = float(position.cost_basis)
                    account_found = True
                    break
            
            # If account not in list, add it
            if not account_found:
                accounts_list.append({
                    'account_id': position.account_id,
                    'institution_name': position.institution_name,
                    'quantity': float(position.quantity),
                    'market_value': float(position.market_value),
                    'cost_basis': float(position.cost_basis)
                })
            
            # Recalculate totals
            total_quantity = sum(Decimal(str(acc['quantity'])) for acc in accounts_list)
            total_market_value = sum(Decimal(str(acc['market_value'])) for acc in accounts_list)
            total_cost_basis = sum(Decimal(str(acc['cost_basis'])) for acc in accounts_list)
            
            avg_cost_basis = total_cost_basis / total_quantity if total_quantity > 0 else Decimal('0')
            unrealized_gain_loss = total_market_value - total_cost_basis
            unrealized_gain_loss_percent = (unrealized_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else Decimal('0')
            
            # Update the record
            update_data = {
                'accounts': accounts_list,
                'total_quantity': float(total_quantity),
                'total_market_value': float(total_market_value),
                'total_cost_basis': float(total_cost_basis),
                'average_cost_basis': float(avg_cost_basis),
                'unrealized_gain_loss': float(unrealized_gain_loss),
                'unrealized_gain_loss_percent': float(unrealized_gain_loss_percent),
                'account_count': len(accounts_list),
                'last_synced': datetime.utcnow().isoformat()
            }
            
            self.supabase.table('user_aggregated_holdings')\
                .update(update_data)\
                .eq('id', existing_holding['id'])\
                .execute()
            
            logger.debug(f"Updated position {position.symbol} in aggregated holdings")
            
        except Exception as e:
            logger.error(f"Error updating position {position.symbol}: {e}", exc_info=True)
            raise
    
    async def _clear_user_holdings(self, user_id: str):
        """Clear all SnapTrade holdings for a user (for full rebuild)."""
        try:
            self.supabase.table('user_aggregated_holdings')\
                .delete()\
                .eq('user_id', user_id)\
                .eq('data_source', 'snaptrade')\
                .execute()
            
            logger.info(f"Cleared existing SnapTrade holdings for user {user_id}")
        except Exception as e:
            logger.error(f"Error clearing holdings: {e}", exc_info=True)
            raise


# Global service instance
_sync_service = None

def get_snaptrade_sync_service() -> SnapTradeSyncService:
    """Get global SnapTrade sync service instance."""
    global _sync_service
    if _sync_service is None:
        _sync_service = SnapTradeSyncService()
    return _sync_service


# Convenience functions for imports
async def trigger_account_sync(user_id: str, account_id: str) -> Dict:
    """
    Trigger sync for a specific account.
    Called by webhook handlers.
    """
    service = get_snaptrade_sync_service()
    return await service.sync_specific_account(user_id, account_id)


async def trigger_full_user_sync(user_id: str, force_rebuild: bool = False) -> Dict:
    """
    Trigger full sync for a user's entire portfolio.
    Called by manual refresh or scheduled jobs.
    """
    service = get_snaptrade_sync_service()
    return await service.sync_user_portfolio(user_id, force_full=force_rebuild)

