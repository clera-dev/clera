#!/usr/bin/env python3

import os
import logging
from typing import Dict, Any, List, Optional
from uuid import UUID

from alpaca.broker.client import BrokerClient
from alpaca.trading.requests import CreateWatchlistRequest, UpdateWatchlistRequest
from alpaca.trading.models import Watchlist

from .create_account import get_broker_client

logger = logging.getLogger("alpaca-watchlist-utils")

# Default watchlist symbols for new accounts
# These provide a good mix of market exposure for new investors:
# SPY - S&P 500 ETF (broad market exposure)
# AGG - Aggregate Bond ETF (fixed income exposure)  
# DIA - Dow Jones Industrial Average ETF (blue chip exposure)
# QQQ - NASDAQ-100 ETF (technology exposure)
DEFAULT_WATCHLIST_SYMBOLS = ["SPY", "AGG", "DIA", "QQQ"]

def get_watchlist_for_account(account_id: str, watchlist_id: str = None, broker_client: BrokerClient = None) -> Optional[Watchlist]:
    """
    Get a specific watchlist or the default watchlist for an account.
    
    Args:
        account_id: Alpaca account ID
        watchlist_id: Optional specific watchlist ID. If None, gets the default/first watchlist
        broker_client: Optional existing broker client
        
    Returns:
        Watchlist object or None if not found
    """
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        if watchlist_id:
            # Get specific watchlist
            watchlist = broker_client.get_watchlist_for_account_by_id(
                account_id=account_id,
                watchlist_id=watchlist_id
            )
            return watchlist
        else:
            # Get all watchlists and return the first one (default)
            watchlists = broker_client.get_watchlists_for_account(account_id=account_id)
            if watchlists and len(watchlists) > 0:
                return watchlists[0]
            return None
            
    except Exception as e:
        logger.error(f"Error getting watchlist for account {account_id}: {str(e)}")
        return None

def get_all_watchlists_for_account(account_id: str, broker_client: BrokerClient = None) -> List[Watchlist]:
    """
    Get all watchlists for an account.
    
    Args:
        account_id: Alpaca account ID
        broker_client: Optional existing broker client
        
    Returns:
        List of Watchlist objects
    """
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        watchlists = broker_client.get_watchlists_for_account(account_id=account_id)
        return watchlists if watchlists else []
        
    except Exception as e:
        logger.error(f"Error getting watchlists for account {account_id}: {str(e)}")
        return []

def create_default_watchlist_for_account(account_id: str, broker_client: BrokerClient = None) -> Optional[Watchlist]:
    """
    Create a default watchlist for an account.
    
    Args:
        account_id: Alpaca account ID
        broker_client: Optional existing broker client
        
    Returns:
        Created Watchlist object or None if creation failed
    """
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        # Create default watchlist using module-level default symbols
        default_symbols = DEFAULT_WATCHLIST_SYMBOLS
        
        watchlist_data = CreateWatchlistRequest(
            name="My Watchlist",
            symbols=default_symbols
        )
        
        watchlist = broker_client.create_watchlist_for_account(
            account_id=account_id,
            watchlist_data=watchlist_data
        )
        
        logger.info(f"Created default watchlist for account {account_id}: {watchlist.id}")
        return watchlist
        
    except Exception as e:
        logger.error(f"Error creating default watchlist for account {account_id}: {str(e)}")
        return None

def get_or_create_default_watchlist(account_id: str, broker_client: BrokerClient = None) -> Optional[Watchlist]:
    """
    Get the default watchlist for an account, creating one if it doesn't exist.
    Also ensures the watchlist has default symbols if it's empty.
    
    Args:
        account_id: Alpaca account ID
        broker_client: Optional existing broker client
        
    Returns:
        Watchlist object or None if both get and create failed
    """
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        # Use module-level default symbols for new or empty watchlists
        default_symbols = DEFAULT_WATCHLIST_SYMBOLS
        
        # First try to get existing watchlist
        watchlist = get_watchlist_for_account(account_id, broker_client=broker_client)
        
        if watchlist:
            # Check if watchlist is empty and populate with defaults
            symbols = get_watchlist_symbols(account_id, str(watchlist.id), broker_client=broker_client)
            if not symbols:  # If watchlist is empty
                logger.info(f"Watchlist {watchlist.id} for account {account_id} is empty, adding default symbols")
                for symbol in default_symbols:
                    try:
                        add_symbol_to_watchlist(account_id, symbol, str(watchlist.id), broker_client=broker_client)
                    except Exception as e:
                        logger.warning(f"Failed to add default symbol {symbol} to watchlist: {str(e)}")
            
            return watchlist
        
        # If no watchlist exists, create one (which now includes default symbols)
        logger.info(f"No watchlist found for account {account_id}, creating default watchlist")
        return create_default_watchlist_for_account(account_id, broker_client=broker_client)
        
    except Exception as e:
        logger.error(f"Error getting or creating default watchlist for account {account_id}: {str(e)}")
        return None

def add_symbol_to_watchlist(account_id: str, symbol: str, watchlist_id: str = None, broker_client: BrokerClient = None) -> bool:
    """
    Add a symbol to the watchlist.
    
    Args:
        account_id: Alpaca account ID
        symbol: Stock symbol to add
        watchlist_id: Optional specific watchlist ID. If None, uses default watchlist
        broker_client: Optional existing broker client
        
    Returns:
        True if successful, False otherwise
    """
    # Validate inputs
    if not account_id or not symbol:
        logger.error(f"Invalid inputs: account_id={account_id}, symbol={symbol}")
        return False
        
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        # Get or create default watchlist if no watchlist_id provided
        if not watchlist_id:
            watchlist = get_or_create_default_watchlist(account_id, broker_client=broker_client)
            if not watchlist:
                logger.error(f"Could not get or create watchlist for account {account_id}")
                return False
            watchlist_id = str(watchlist.id)
        
        # Check if symbol is already in watchlist
        symbol_upper = symbol.upper()
        if is_symbol_in_watchlist(account_id, symbol_upper, watchlist_id=watchlist_id, broker_client=broker_client):
            logger.info(f"Symbol {symbol_upper} is already in watchlist for account {account_id}")
            return True  # Return True since the goal (symbol in watchlist) is achieved
        
        # Add symbol to watchlist
        updated_watchlist = broker_client.add_asset_to_watchlist_for_account_by_id(
            account_id=account_id,
            watchlist_id=watchlist_id,
            symbol=symbol_upper
        )
        
        logger.info(f"Added symbol {symbol_upper} to watchlist {watchlist_id} for account {account_id}")
        return True
        
    except Exception as e:
        # Check if the error is specifically about duplicate symbols
        error_str = str(e)
        if "duplicate symbol" in error_str.lower():
            logger.info(f"Symbol {symbol} is already in watchlist for account {account_id} (duplicate symbol error)")
            return True  # Return True since the symbol is already in the watchlist
        
        logger.error(f"Error adding symbol {symbol} to watchlist for account {account_id}: {error_str}")
        return False

def remove_symbol_from_watchlist(account_id: str, symbol: str, watchlist_id: str = None, broker_client: BrokerClient = None) -> bool:
    """
    Remove a symbol from the watchlist.
    
    Args:
        account_id: Alpaca account ID
        symbol: Stock symbol to remove
        watchlist_id: Optional specific watchlist ID. If None, uses default watchlist
        broker_client: Optional existing broker client
        
    Returns:
        True if successful, False otherwise
    """
    # Validate inputs
    if not account_id or not symbol:
        logger.error(f"Invalid inputs: account_id={account_id}, symbol={symbol}")
        return False
        
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        # Get default watchlist if no watchlist_id provided
        if not watchlist_id:
            watchlist = get_watchlist_for_account(account_id, broker_client=broker_client)
            if not watchlist:
                logger.error(f"No watchlist found for account {account_id}")
                return False
            watchlist_id = str(watchlist.id)
        
        # Remove symbol from watchlist
        updated_watchlist = broker_client.remove_asset_from_watchlist_for_account_by_id(
            account_id=account_id,
            watchlist_id=watchlist_id,
            symbol=symbol.upper()
        )
        
        logger.info(f"Removed symbol {symbol} from watchlist {watchlist_id} for account {account_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error removing symbol {symbol} from watchlist for account {account_id}: {str(e)}")
        return False

def is_symbol_in_watchlist(account_id: str, symbol: str, watchlist_id: str = None, broker_client: BrokerClient = None) -> bool:
    """
    Check if a symbol is in the watchlist.
    
    Args:
        account_id: Alpaca account ID
        symbol: Stock symbol to check
        watchlist_id: Optional specific watchlist ID. If None, uses default watchlist
        broker_client: Optional existing broker client
        
    Returns:
        True if symbol is in watchlist, False otherwise
    """
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        # Get watchlist - if no watchlist_id, get the default first
        if not watchlist_id:
            watchlist = get_watchlist_for_account(account_id, broker_client=broker_client)
            if not watchlist:
                return False
            watchlist_id = str(watchlist.id)
        
        # Get watchlist by ID to ensure assets are populated
        watchlist_with_assets = broker_client.get_watchlist_for_account_by_id(
            account_id=account_id,
            watchlist_id=watchlist_id
        )
        
        if not watchlist_with_assets or not watchlist_with_assets.assets:
            return False
        
        # Check if symbol is in the watchlist
        symbol_upper = symbol.upper()
        for asset in watchlist_with_assets.assets:
            if hasattr(asset, 'symbol') and asset.symbol == symbol_upper:
                return True
            # Handle case where asset might be a dict
            elif isinstance(asset, dict) and asset.get('symbol') == symbol_upper:
                return True
        
        return False
        
    except Exception as e:
        logger.error(f"Error checking if symbol {symbol} is in watchlist for account {account_id}: {str(e)}")
        return False

def get_watchlist_symbols(account_id: str, watchlist_id: str = None, broker_client: BrokerClient = None) -> List[str]:
    """
    Get all symbols in the watchlist.
    
    Args:
        account_id: Alpaca account ID
        watchlist_id: Optional specific watchlist ID. If None, uses default watchlist
        broker_client: Optional existing broker client
        
    Returns:
        List of symbols in the watchlist
    """
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        # Get watchlist - if no watchlist_id, get the default first
        if not watchlist_id:
            watchlist = get_watchlist_for_account(account_id, broker_client=broker_client)
            if not watchlist:
                return []
            watchlist_id = str(watchlist.id)
        
        # Get watchlist by ID to ensure assets are populated
        watchlist_with_assets = broker_client.get_watchlist_for_account_by_id(
            account_id=account_id,
            watchlist_id=watchlist_id
        )
        
        if not watchlist_with_assets or not watchlist_with_assets.assets:
            return []
        
        # Extract symbols from assets
        symbols = []
        for asset in watchlist_with_assets.assets:
            if hasattr(asset, 'symbol'):
                symbols.append(asset.symbol)
            # Handle case where asset might be a dict
            elif isinstance(asset, dict) and 'symbol' in asset:
                symbols.append(asset['symbol'])
        
        return symbols
        
    except Exception as e:
        logger.error(f"Error getting symbols from watchlist for account {account_id}: {str(e)}")
        return []

def get_watchlist_details(account_id: str, watchlist_id: str = None, broker_client: BrokerClient = None) -> Optional[Dict[str, Any]]:
    """
    Get detailed information about the watchlist including assets.
    
    Args:
        account_id: Alpaca account ID
        watchlist_id: Optional specific watchlist ID. If None, uses default watchlist
        broker_client: Optional existing broker client
        
    Returns:
        Dictionary with watchlist details or None if not found
    """
    try:
        if broker_client is None:
            broker_client = get_broker_client()
        
        # Get watchlist
        watchlist = get_watchlist_for_account(
            account_id, 
            watchlist_id=watchlist_id, 
            broker_client=broker_client
        )
        
        if not watchlist:
            return None
        
        # Get symbols for the watchlist
        symbols = get_watchlist_symbols(account_id, str(watchlist.id), broker_client=broker_client)
        
        # Convert to dictionary with proper field names for WatchlistResponse
        watchlist_data = {
            "watchlist_id": str(watchlist.id),
            "name": watchlist.name or "My Watchlist",
            "symbols": symbols,
            "symbols_count": len(symbols)
        }
        
        return watchlist_data
        
    except Exception as e:
        logger.error(f"Error getting watchlist details for account {account_id}: {str(e)}")
        return None 