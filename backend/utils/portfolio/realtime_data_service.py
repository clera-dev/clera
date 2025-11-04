"""
Real-time Data Service

Production-grade service for managing real-time portfolio data updates across different
portfolio modes without breaking existing Alpaca-based functionality.
"""

import os
import logging
import json
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
from utils.portfolio.portfolio_mode_service import get_portfolio_mode_service, PortfolioMode

logger = logging.getLogger(__name__)

class RealtimeDataService:
    """
    Safe real-time data service that handles different portfolio modes.
    Preserves existing Alpaca functionality while adding support for aggregation mode.
    """
    
    def __init__(self, redis_client):
        self.redis_client = redis_client
        self.portfolio_service = get_portfolio_mode_service()
        self.alpaca_components = None  # Will be initialized only when needed
        self.last_alpaca_refresh = 0
        
    def initialize_alpaca_components(self):
        """
        Lazy initialization of Alpaca components.
        Only initialized when needed for brokerage/hybrid mode users.
        """
        try:
            if self.alpaca_components is not None:
                return True
                
            logger.info("Initializing Alpaca components for real-time data service")
            
            # Import here to avoid circular imports and only import when needed
            import sys
            import os
            
            # Add the parent directory to the path for imports
            current_dir = os.path.dirname(os.path.abspath(__file__))
            backend_dir = os.path.dirname(os.path.dirname(current_dir))
            if backend_dir not in sys.path:
                sys.path.insert(0, backend_dir)
            
            from portfolio_realtime.symbol_collector import SymbolCollector
            from portfolio_realtime.portfolio_calculator import PortfolioCalculator
            from portfolio_realtime.sector_data_collector import SectorDataCollector
            
            # Initialize components
            symbol_collector = SymbolCollector(
                redis_host=os.getenv("REDIS_HOST", "127.0.0.1"),
                redis_port=int(os.getenv("REDIS_PORT", "6379")),
                redis_db=int(os.getenv("REDIS_DB", "0")),
                sandbox=os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
            )
            
            portfolio_calculator = PortfolioCalculator(
                redis_host=os.getenv("REDIS_HOST", "127.0.0.1"),
                redis_port=int(os.getenv("REDIS_PORT", "6379")),
                redis_db=int(os.getenv("REDIS_DB", "0")),
                min_update_interval=1,
                sandbox=os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
            )
            
            # Sector data collector (optional)
            sector_collector = None
            try:
                sector_collector = SectorDataCollector(
                    redis_host=os.getenv("REDIS_HOST", "127.0.0.1"),
                    redis_port=int(os.getenv("REDIS_PORT", "6379")),
                    redis_db=int(os.getenv("REDIS_DB", "0")),
                    FINANCIAL_MODELING_PREP_API_KEY=os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
                )
                logger.info("Sector data collector initialized successfully")
            except Exception as e:
                logger.warning(f"Failed to initialize sector data collector: {e}. Sector data will not be available.")
            
            self.alpaca_components = {
                "symbol_collector": symbol_collector,
                "portfolio_calculator": portfolio_calculator,
                "sector_collector": sector_collector
            }
            
            logger.info("Alpaca components initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Alpaca components: {e}", exc_info=True)
            self.alpaca_components = None
            return False
    
    def get_active_account_ids_by_mode(self) -> Dict[str, List[str]]:
        """
        Get active account IDs grouped by portfolio mode.
        
        Returns:
            Dictionary with keys: 'alpaca', 'plaid', 'unknown'
        """
        try:
            account_keys = self.redis_client.keys('account_positions:*')
            
            accounts_by_mode = {
                'alpaca': [],
                'plaid': [], 
                'unknown': []
            }
            
            for key in account_keys:
                try:
                    account_id = key.decode('utf-8').split(':')[1]
                    
                    # Try to determine the account type from Redis metadata
                    account_meta_key = f"account_meta:{account_id}"
                    account_meta = self.redis_client.get(account_meta_key)
                    
                    if account_meta:
                        meta_data = json.loads(account_meta)
                        account_type = meta_data.get('type', 'unknown')
                        if account_type in accounts_by_mode:
                            accounts_by_mode[account_type].append(account_id)
                        else:
                            accounts_by_mode['unknown'].append(account_id)
                    else:
                        # No metadata - try to infer from account ID format
                        if account_id.startswith('plaid_'):
                            accounts_by_mode['plaid'].append(account_id)
                        else:
                            # Assume Alpaca for legacy accounts
                            accounts_by_mode['alpaca'].append(account_id)
                            
                except Exception as e:
                    logger.warning(f"Error processing account key {key}: {e}")
            
            logger.debug(f"Active accounts by mode: {accounts_by_mode}")
            return accounts_by_mode
            
        except Exception as e:
            logger.error(f"Error getting active account IDs: {e}")
            return {'alpaca': [], 'plaid': [], 'unknown': []}
    
    async def refresh_alpaca_accounts(self, account_ids: List[str], need_full_refresh: bool = False) -> int:
        """
        Refresh Alpaca-based accounts using existing components.
        
        Args:
            account_ids: List of Alpaca account IDs to refresh
            need_full_refresh: Whether to do full refresh including symbol collection
            
        Returns:
            Number of accounts successfully refreshed
        """
        if not account_ids:
            return 0
            
        if not self.initialize_alpaca_components():
            logger.error("Cannot refresh Alpaca accounts - components not initialized")
            return 0
            
        try:
            components = self.alpaca_components
            accounts_refreshed = 0
            
            # Do symbol collection if needed (full refresh)
            if need_full_refresh:
                logger.info("Starting Alpaca symbol collection...")
                await components["symbol_collector"].collect_symbols()
                await asyncio.sleep(1)  # Avoid rate limiting
            
            # Calculate portfolio values for each Alpaca account
            for account_id in account_ids:
                try:
                    portfolio_data = components["portfolio_calculator"].calculate_portfolio_value(account_id)
                    
                    if portfolio_data:
                        # Publish to Redis for WebSocket clients
                        self.redis_client.publish('portfolio_updates', json.dumps(portfolio_data))
                        accounts_refreshed += 1
                        
                        # Small delay between accounts to avoid rate limiting
                        if accounts_refreshed < len(account_ids):
                            await asyncio.sleep(0.5)
                            
                except Exception as e:
                    logger.error(f"Error refreshing Alpaca account {account_id}: {e}")
            
            logger.info(f"Refreshed {accounts_refreshed}/{len(account_ids)} Alpaca accounts")
            return accounts_refreshed
            
        except Exception as e:
            logger.error(f"Error in Alpaca account refresh: {e}", exc_info=True)
            return 0
    
    async def refresh_aggregation_users(self) -> int:
        """
        Refresh aggregation mode users and create intraday snapshots.
        This runs every 5 minutes to capture real portfolio movements.
        
        Returns:
            Number of users processed
        """
        try:
            from utils.supabase.db_client import get_supabase_client
            from services.intraday_snapshot_service import get_intraday_snapshot_service
            from utils.portfolio.aggregated_portfolio_service import get_aggregated_portfolio_service
            
            supabase = get_supabase_client()
            snapshot_service = get_intraday_snapshot_service()
            portfolio_service = get_aggregated_portfolio_service()
            
            # Only create snapshots during market hours
            if not snapshot_service.is_market_hours():
                logger.debug("Outside market hours - skipping intraday snapshots")
                return 0
            
            # Get all users with aggregation mode (SnapTrade or Plaid data)
            # Users with holdings in user_aggregated_holdings
            result = supabase.table('user_aggregated_holdings')\
                .select('user_id')\
                .execute()
            
            if not result.data:
                return 0
            
            # Get unique user IDs
            user_ids = list(set(row['user_id'] for row in result.data))
            logger.info(f"📸 Creating intraday snapshots for {len(user_ids)} aggregation users")
            
            snapshots_created = 0
            for user_id in user_ids:
                try:
                    # Check if snapshot should be created (respects 5-minute interval)
                    if not snapshot_service.should_create_snapshot(user_id):
                        continue
                    
                    # Get current portfolio value with live prices
                    portfolio_data = await portfolio_service.get_portfolio_value(user_id, include_cash=True)
                    current_value = portfolio_data.get('raw_value', 0)
                    
                    if current_value > 0:
                        # Create intraday snapshot
                        success = await snapshot_service.create_snapshot(
                            user_id=user_id,
                            portfolio_value=current_value,
                            metadata={
                                'data_source': 'aggregation_mode',
                                'securities_count': len(portfolio_data.get('holdings', []))
                            }
                        )
                        
                        if success:
                            snapshots_created += 1
                    
                except Exception as e:
                    logger.error(f"Error creating snapshot for user {user_id}: {e}")
                    continue
            
            logger.info(f"✅ Created {snapshots_created} intraday snapshots")
            return snapshots_created
            
        except Exception as e:
            logger.error(f"Error in aggregation user refresh: {e}", exc_info=True)
            return 0
    
    async def refresh_plaid_accounts(self, account_ids: List[str]) -> int:
        """
        Refresh Plaid-based accounts.
        For now, this is a placeholder - Plaid data is updated via webhooks.
        
        Args:
            account_ids: List of Plaid account IDs to refresh
            
        Returns:
            Number of accounts processed
        """
        if not account_ids:
            return 0
            
        try:
            logger.info(f"Processing {len(account_ids)} Plaid accounts for refresh")
            
            # For now, just validate that the accounts exist in Redis
            # In the future, this could trigger Plaid data refreshes or webhook processing
            accounts_processed = 0
            
            for account_id in account_ids:
                try:
                    # Check if account has data in Redis
                    account_key = f"account_positions:{account_id}"
                    if self.redis_client.exists(account_key):
                        accounts_processed += 1
                        
                        # For now, just log that we processed it
                        logger.debug(f"Processed Plaid account {account_id}")
                    else:
                        logger.warning(f"Plaid account {account_id} has no data in Redis")
                        
                except Exception as e:
                    logger.error(f"Error processing Plaid account {account_id}: {e}")
            
            logger.info(f"Processed {accounts_processed}/{len(account_ids)} Plaid accounts")
            return accounts_processed
            
        except Exception as e:
            logger.error(f"Error in Plaid account refresh: {e}", exc_info=True)
            return 0
    
    async def refresh_sector_data(self) -> bool:
        """
        Refresh sector data using Alpaca components.
        Only runs if Alpaca components are available.
        
        Returns:
            True if sector data was refreshed successfully
        """
        try:
            if not self.initialize_alpaca_components():
                logger.debug("Skipping sector data refresh - Alpaca components not available")
                return False
                
            sector_collector = self.alpaca_components.get("sector_collector")
            if not sector_collector:
                logger.debug("Skipping sector data refresh - sector collector not available")
                return False
            
            logger.info("Starting sector data collection...")
            await sector_collector.collect_sector_data()
            logger.info("Sector data collection completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error during sector data refresh: {e}", exc_info=True)
            return False
    
    async def perform_periodic_refresh(self, need_full_refresh: bool = False, need_sector_refresh: bool = False) -> Dict[str, Any]:
        """
        Perform periodic refresh of all active accounts.
        Handles different portfolio modes safely.
        
        Args:
            need_full_refresh: Whether to do full refresh including symbol collection
            need_sector_refresh: Whether to refresh sector data
            
        Returns:
            Dictionary with refresh results
        """
        refresh_start = datetime.now()
        logger.info(f"Starting periodic refresh (full: {need_full_refresh}, sector: {need_sector_refresh})")
        
        try:
            # Get accounts by mode
            accounts_by_mode = self.get_active_account_ids_by_mode()
            
            results = {
                "timestamp": refresh_start.isoformat(),
                "full_refresh": need_full_refresh,
                "sector_refresh": need_sector_refresh,
                "alpaca_accounts": len(accounts_by_mode['alpaca']),
                "plaid_accounts": len(accounts_by_mode['plaid']),
                "unknown_accounts": len(accounts_by_mode['unknown']),
                "alpaca_refreshed": 0,
                "plaid_refreshed": 0,
                "sector_success": False,
                "errors": []
            }
            
            # Refresh sector data if needed (do this first)
            if need_sector_refresh:
                try:
                    results["sector_success"] = await self.refresh_sector_data()
                    if results["sector_success"]:
                        await asyncio.sleep(2)  # Small delay after sector collection
                except Exception as e:
                    error_msg = f"Sector refresh error: {str(e)}"
                    results["errors"].append(error_msg)
                    logger.error(error_msg)
            
            # Refresh Alpaca accounts
            if accounts_by_mode['alpaca']:
                try:
                    results["alpaca_refreshed"] = await self.refresh_alpaca_accounts(
                        accounts_by_mode['alpaca'], 
                        need_full_refresh
                    )
                except Exception as e:
                    error_msg = f"Alpaca refresh error: {str(e)}"
                    results["errors"].append(error_msg)
                    logger.error(error_msg)
            
            # Refresh Plaid accounts
            if accounts_by_mode['plaid']:
                try:
                    results["plaid_refreshed"] = await self.refresh_plaid_accounts(
                        accounts_by_mode['plaid']
                    )
                except Exception as e:
                    error_msg = f"Plaid refresh error: {str(e)}"
                    results["errors"].append(error_msg)
                    logger.error(error_msg)
            
            # CRITICAL: Create intraday snapshots for aggregation users
            # This runs every 5 minutes during market hours to capture REAL portfolio movements
            # Not interpolation - actual live price updates stored in database
            try:
                snapshots_created = await self.refresh_aggregation_users()
                results["intraday_snapshots_created"] = snapshots_created
            except Exception as e:
                error_msg = f"Intraday snapshot error: {str(e)}"
                results["errors"].append(error_msg)
                logger.error(error_msg)
            
            # Handle unknown accounts (treat as Alpaca for backward compatibility)
            if accounts_by_mode['unknown']:
                try:
                    unknown_refreshed = await self.refresh_alpaca_accounts(
                        accounts_by_mode['unknown'], 
                        need_full_refresh
                    )
                    results["alpaca_refreshed"] += unknown_refreshed
                except Exception as e:
                    error_msg = f"Unknown accounts refresh error: {str(e)}"
                    results["errors"].append(error_msg)
                    logger.error(error_msg)
            
            refresh_duration = (datetime.now() - refresh_start).total_seconds()
            results["duration_seconds"] = refresh_duration
            
            total_refreshed = results["alpaca_refreshed"] + results["plaid_refreshed"]
            logger.info(f"Periodic refresh complete: {total_refreshed} accounts refreshed in {refresh_duration:.2f}s")
            
            return results
            
        except Exception as e:
            error_msg = f"Critical error in periodic refresh: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                "timestamp": refresh_start.isoformat(),
                "duration_seconds": (datetime.now() - refresh_start).total_seconds(),
                "errors": [error_msg],
                "alpaca_refreshed": 0,
                "plaid_refreshed": 0,
                "sector_success": False
            }
