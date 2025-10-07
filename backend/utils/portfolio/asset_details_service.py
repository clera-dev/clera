"""
Asset Details Service

Production-grade service for fetching asset details across different data sources
(Alpaca for brokerage assets, Plaid aggregated data for external securities).
"""

import logging
import uuid
import os
from typing import Optional, Dict, Any
from utils.portfolio.portfolio_mode_service import get_portfolio_mode_service, PortfolioMode

logger = logging.getLogger(__name__)

class AssetDetailsService:
    """
    Service for fetching asset details from appropriate data sources.
    Handles both Alpaca brokerage assets and Plaid external securities.
    """
    
    def __init__(self):
        self.portfolio_service = get_portfolio_mode_service()
    
    async def is_plaid_security(self, symbol: str, user_id: str) -> bool:
        """
        Determine if a symbol is a Plaid security by checking stored metadata.
        
        This is the PRODUCTION-GRADE approach using actual Plaid API data
        instead of pattern guessing.
        
        Args:
            symbol: The security symbol
            user_id: User ID to check Plaid metadata
            
        Returns:
            True if this is a Plaid security with stored metadata
        """
        try:
            import redis
            
            redis_client = redis.Redis(
                host=os.getenv("REDIS_HOST", "127.0.0.1"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                db=int(os.getenv("REDIS_DB", "0"))
            )
            
            metadata_key = f"plaid_security_metadata:{symbol}:{user_id}"
            metadata_exists = redis_client.exists(metadata_key)
            
            if metadata_exists:
                logger.debug(f"✅ {symbol} confirmed as Plaid security from stored metadata")
                return True
            
            # Fallback: Check if symbol exists in user's aggregated holdings
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            result = supabase.table('user_aggregated_holdings')\
                .select('symbol')\
                .eq('user_id', user_id)\
                .eq('symbol', symbol)\
                .eq('data_source', 'plaid')\
                .limit(1)\
                .execute()
            
            if result.data and len(result.data) > 0:
                logger.debug(f"✅ {symbol} confirmed as Plaid security from aggregated holdings")
                return True
            
            logger.debug(f"❌ {symbol} not found in Plaid data for user {user_id}")
            return False
            
        except Exception as e:
            logger.error(f"Error checking if {symbol} is Plaid security: {e}")
            # Default to False on error - will try Alpaca lookup
            return False
    
    async def get_plaid_security_details(self, symbol: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get asset details for a Plaid security from stored metadata and holdings.
        
        Uses the rich security data from Plaid API including sector, industry, 
        and proper security names as documented in the Plaid Investment API.
        
        Args:
            symbol: The security symbol
            user_id: User ID to lookup security metadata
            
        Returns:
            Asset details dictionary with rich Plaid data or None if not found
        """
        try:
            # First, try to get rich metadata from Redis
            import redis
            import json
            
            redis_client = redis.Redis(
                host=os.getenv("REDIS_HOST", "127.0.0.1"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                db=int(os.getenv("REDIS_DB", "0"))
            )
            
            metadata_key = f"plaid_security_metadata:{symbol}:{user_id}"
            metadata_json = redis_client.get(metadata_key)
            
            if metadata_json:
                security_metadata = json.loads(metadata_json)
                
                # Get current holding value from aggregated holdings
                from utils.supabase.db_client import get_supabase_client
                supabase = get_supabase_client()
                
                holding_result = supabase.table('user_aggregated_holdings')\
                    .select('total_market_value, total_quantity')\
                    .eq('user_id', user_id)\
                    .eq('symbol', symbol)\
                    .limit(1)\
                    .execute()
                
                current_price = security_metadata.get('close_price', 0.0)
                if holding_result.data and len(holding_result.data) > 0:
                    holding = holding_result.data[0]
                    if holding.get('total_quantity', 0) > 0:
                        current_price = holding.get('total_market_value', 0) / holding.get('total_quantity', 1)
                
                # Create rich asset details from Plaid API data
                asset_details = {
                    "id": str(uuid.uuid4()),
                    "symbol": security_metadata.get('ticker_symbol') or symbol,
                    "name": security_metadata.get('name', symbol),  # Use rich Plaid name
                    "asset_class": self._map_plaid_security_type_to_alpaca_class(security_metadata.get('type', 'equity')),
                    "exchange": security_metadata.get('market_identifier_code') or 'EXTERNAL',  # CRITICAL FIX: Never None
                    "status": "active",
                    "tradable": False,  # External securities not tradable through Clera
                    "marginable": False,
                    "shortable": False,
                    "easy_to_borrow": False,
                    "fractionable": True,
                    "maintenance_margin_requirement": None,
                    "current_price": current_price,
                    "data_source": "plaid",
                    
                    # Rich Plaid-specific data
                    "sector": security_metadata.get('sector'),
                    "industry": security_metadata.get('industry'),
                    "security_type": security_metadata.get('type'),
                    "security_subtype": security_metadata.get('subtype'),
                    "cusip": security_metadata.get('cusip'),
                    "isin": security_metadata.get('isin'),
                    "option_contract": security_metadata.get('option_contract'),
                    "fixed_income": security_metadata.get('fixed_income')
                }
                
                logger.info(f"✅ Found rich Plaid security details for {symbol}: {security_metadata.get('name')}")
                return asset_details
            
            # Fallback to aggregated holdings lookup if no metadata
            from utils.supabase.db_client import get_supabase_client
            supabase = get_supabase_client()
            
            result = supabase.table('user_aggregated_holdings')\
                .select('symbol, security_name, security_type, total_market_value, total_quantity')\
                .eq('user_id', user_id)\
                .eq('symbol', symbol)\
                .limit(1)\
                .execute()
            
            if result.data and len(result.data) > 0:
                holding = result.data[0]
                
                current_price = 0.0
                if holding.get('total_quantity', 0) > 0:
                    current_price = holding.get('total_market_value', 0) / holding.get('total_quantity', 1)
                
                asset_details = {
                    "id": str(uuid.uuid4()),
                    "symbol": holding['symbol'],
                    "name": holding.get('security_name', holding['symbol']),
                    "asset_class": self._map_plaid_security_type_to_alpaca_class(holding.get('security_type', 'equity')),
                    "exchange": "EXTERNAL",
                    "status": "active",
                    "tradable": False,
                    "marginable": False,
                    "shortable": False,
                    "easy_to_borrow": False,
                    "fractionable": True,
                    "maintenance_margin_requirement": None,
                    "current_price": current_price,
                    "data_source": "plaid_fallback"
                }
                
                logger.info(f"✅ Found Plaid security from holdings for {symbol}: {holding.get('security_name')}")
                return asset_details
            
            logger.warning(f"Plaid security {symbol} not found for user {user_id}")
            return None
            
        except Exception as e:
            logger.error(f"Error fetching Plaid security details for {symbol}: {e}")
            return None
    
    def _map_plaid_security_type_to_alpaca_class(self, security_type: str) -> str:
        """
        Map Plaid security types to Alpaca asset classes.
        
        Args:
            security_type: Plaid security type
            
        Returns:
            Corresponding Alpaca asset class string
        """
        type_mapping = {
            'equity': 'us_equity',
            'etf': 'us_equity',  # ETFs are traded as equities
            'mutual_fund': 'us_equity',  # Closest match
            'bond': 'us_equity',  # No bond class in Alpaca, use equity
            'option': 'us_option',
            'crypto': 'crypto',
            'cash': 'us_equity',  # Cash positions show as equity for display
            'other': 'us_equity'
        }
        
        return type_mapping.get(security_type, 'us_equity')
    
    def create_fallback_asset_details(self, symbol: str) -> Dict[str, Any]:
        """
        Create fallback asset details for unknown securities.
        
        Args:
            symbol: The security symbol
            
        Returns:
            Basic asset details dictionary
        """
        return {
            "id": str(uuid.uuid4()),
            "symbol": symbol,
            "name": symbol,  # Use symbol as name
            "asset_class": "us_equity",  # Default to equity
            "exchange": "UNKNOWN",
            "status": "active",
            "tradable": False,  # Unknown securities are not tradable
            "marginable": False,
            "shortable": False,
            "easy_to_borrow": False,
            "fractionable": False,
            "maintenance_margin_requirement": None,
            "data_source": "unknown"
        }
    
    async def get_asset_details_multi_source(self, symbol: str, user_id: str, alpaca_client) -> Dict[str, Any]:
        """
        Get asset details from appropriate source (Alpaca or Plaid).
        
        Production-grade approach: Check Plaid metadata first (uses actual API data),
        then try Alpaca, then fallback.
        
        Args:
            symbol: The security symbol
            user_id: User ID for Plaid security lookups
            alpaca_client: Alpaca broker client for brokerage securities
            
        Returns:
            Asset details dictionary with rich metadata
        """
        try:
            # PRODUCTION APPROACH: Check if this is a Plaid security first
            is_plaid = await self.is_plaid_security(symbol, user_id)
            
            if is_plaid:
                # This is a Plaid security - get rich details from stored metadata
                plaid_details = await self.get_plaid_security_details(symbol, user_id)
                if plaid_details:
                    logger.info(f"✅ Found rich Plaid security details for {symbol}")
                    return plaid_details
            else:
                # Try Alpaca first for standard tradable securities
                try:
                    asset = alpaca_client.get_asset(symbol)
                    if asset:
                        logger.info(f"✅ Found Alpaca asset details for {symbol}")
                        return {
                            "id": str(asset.id),
                            "symbol": asset.symbol,
                            "name": asset.name,
                            "asset_class": str(asset.asset_class.value),
                            "exchange": asset.exchange,
                            "status": str(asset.status.value),
                            "tradable": asset.tradable,
                            "marginable": asset.marginable,
                            "shortable": asset.shortable,
                            "easy_to_borrow": asset.easy_to_borrow,
                            "fractionable": asset.fractionable,
                            "maintenance_margin_requirement": float(asset.maintenance_margin_requirement) if asset.maintenance_margin_requirement else None,
                            "data_source": "alpaca"
                        }
                except Exception as alpaca_error:
                    logger.debug(f"Alpaca asset lookup failed for {symbol}: {alpaca_error}")
                    # Continue to Plaid lookup as fallback
                    
                    # Try Plaid as backup for unknown securities
                    plaid_details = await self.get_plaid_security_details(symbol, user_id)
                    if plaid_details:
                        logger.info(f"✅ Found Plaid security details as fallback for {symbol}")
                        return plaid_details
            
            # Final fallback: Return basic details
            logger.warning(f"Asset {symbol} not found in any source, returning fallback details")
            return self.create_fallback_asset_details(symbol)
            
        except Exception as e:
            logger.error(f"Error in multi-source asset lookup for {symbol}: {e}")
            return self.create_fallback_asset_details(symbol)

# Global service instance
asset_details_service = AssetDetailsService()

def get_asset_details_service() -> AssetDetailsService:
    """Get the global asset details service instance."""
    return asset_details_service
