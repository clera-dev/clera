"""
User Watchlist Service - Supabase-based watchlist management
Supports both aggregation and brokerage modes

This service manages user watchlists in Supabase, independent of Alpaca accounts.
"""

import logging
from typing import List, Dict, Any, Optional
from utils.supabase.db_client import get_supabase_client

logger = logging.getLogger(__name__)

# Default watchlist symbols for new users
# These provide a good mix of market exposure for new investors:
# SPY - S&P 500 ETF (broad market exposure)
# AGG - Aggregate Bond ETF (fixed income exposure)  
# DIA - Dow Jones Industrial Average ETF (blue chip exposure)
DEFAULT_WATCHLIST_SYMBOLS = ["SPY", "AGG", "DIA"]


class UserWatchlistService:
    """Service for managing user watchlists in Supabase"""
    
    @staticmethod
    def _populate_default_watchlist(user_id: str) -> bool:
        """
        Populate user's watchlist with default symbols.
        Called automatically when a user's watchlist is empty.
        
        Args:
            user_id: User ID
            
        Returns:
            True if successful, False otherwise
        """
        try:
            supabase = get_supabase_client()
            
            # Insert all default symbols in batch
            watchlist_entries = [
                {'user_id': user_id, 'symbol': symbol}
                for symbol in DEFAULT_WATCHLIST_SYMBOLS
            ]
            
            response = supabase.table('user_watchlist')\
                .insert(watchlist_entries)\
                .execute()
            
            if response.data:
                logger.info(f"Populated default watchlist for user {user_id} with {len(DEFAULT_WATCHLIST_SYMBOLS)} symbols")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error populating default watchlist for user {user_id}: {str(e)}")
            return False
    
    @staticmethod
    def get_user_watchlist(user_id: str) -> List[str]:
        """
        Get all symbols in user's watchlist.
        Automatically populates with default symbols if empty.
        
        Args:
            user_id: User ID
            
        Returns:
            List of symbols in watchlist
        """
        try:
            supabase = get_supabase_client()
            
            response = supabase.table('user_watchlist')\
                .select('symbol')\
                .eq('user_id', user_id)\
                .order('added_at', desc=True)\
                .execute()
            
            if response.data:
                return [item['symbol'] for item in response.data]
            
            # If watchlist is empty, populate with defaults
            logger.info(f"Empty watchlist for user {user_id}, populating with defaults")
            if UserWatchlistService._populate_default_watchlist(user_id):
                # Return the default symbols
                return DEFAULT_WATCHLIST_SYMBOLS
            
            return []
            
        except Exception as e:
            logger.error(f"Error getting watchlist for user {user_id}: {str(e)}")
            return []
    
    @staticmethod
    def add_symbol_to_watchlist(user_id: str, symbol: str) -> bool:
        """
        Add a symbol to user's watchlist
        
        Args:
            user_id: User ID
            symbol: Stock symbol to add
            
        Returns:
            True if successful, False otherwise
        """
        try:
            supabase = get_supabase_client()
            symbol = symbol.upper().strip()
            
            # Check if already exists
            existing = supabase.table('user_watchlist')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('symbol', symbol)\
                .execute()
            
            if existing.data:
                logger.info(f"Symbol {symbol} already in watchlist for user {user_id}")
                return True  # Already exists, consider it a success
            
            # Insert new symbol
            response = supabase.table('user_watchlist')\
                .insert({
                    'user_id': user_id,
                    'symbol': symbol
                })\
                .execute()
            
            if response.data:
                logger.info(f"Added symbol {symbol} to watchlist for user {user_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error adding symbol {symbol} to watchlist for user {user_id}: {str(e)}")
            return False
    
    @staticmethod
    def remove_symbol_from_watchlist(user_id: str, symbol: str) -> bool:
        """
        Remove a symbol from user's watchlist
        
        Args:
            user_id: User ID
            symbol: Stock symbol to remove
            
        Returns:
            True if successful, False otherwise
        """
        try:
            supabase = get_supabase_client()
            symbol = symbol.upper().strip()
            
            response = supabase.table('user_watchlist')\
                .delete()\
                .eq('user_id', user_id)\
                .eq('symbol', symbol)\
                .execute()
            
            logger.info(f"Removed symbol {symbol} from watchlist for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error removing symbol {symbol} from watchlist for user {user_id}: {str(e)}")
            return False
    
    @staticmethod
    def is_symbol_in_watchlist(user_id: str, symbol: str) -> bool:
        """
        Check if a symbol is in user's watchlist
        
        Args:
            user_id: User ID
            symbol: Stock symbol to check
            
        Returns:
            True if symbol is in watchlist, False otherwise
        """
        try:
            supabase = get_supabase_client()
            symbol = symbol.upper().strip()
            
            response = supabase.table('user_watchlist')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('symbol', symbol)\
                .execute()
            
            return bool(response.data)
            
        except Exception as e:
            logger.error(f"Error checking symbol {symbol} in watchlist for user {user_id}: {str(e)}")
            return False
    
    @staticmethod
    def get_watchlist_details(user_id: str) -> Dict[str, Any]:
        """
        Get watchlist details including metadata
        
        Args:
            user_id: User ID
            
        Returns:
            Dictionary with watchlist details
        """
        try:
            symbols = UserWatchlistService.get_user_watchlist(user_id)
            
            return {
                "watchlist_id": f"user_{user_id}",  # Virtual ID for consistency with Alpaca API
                "name": "My Watchlist",
                "symbols": symbols,
                "symbols_count": len(symbols)
            }
            
        except Exception as e:
            logger.error(f"Error getting watchlist details for user {user_id}: {str(e)}")
            return {
                "watchlist_id": f"user_{user_id}",
                "name": "My Watchlist",
                "symbols": [],
                "symbols_count": 0
            }

