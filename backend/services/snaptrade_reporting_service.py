"""
SnapTrade Reporting Service

PRODUCTION-GRADE: Uses SnapTrade's native reporting API to fetch pre-calculated
portfolio history, which includes deposits, withdrawals, dividends, and market changes.

This is SUPERIOR to manual reconstruction because:
1. SnapTrade's backend has access to real-time brokerage data
2. Accounts for all cash flows (deposits, withdrawals, dividends, fees)
3. No need to fetch historical prices - already calculated
4. More reliable and accurate than our reconstruction
5. Covers up to 365 days of history
"""

import os
import logging
from datetime import datetime, timedelta, date
from decimal import Decimal
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class SnapTradeReportingService:
    """
    Service to fetch and process SnapTrade reporting data for portfolio history.
    
    Uses SnapTrade's `get_reporting_custom_range` endpoint which provides:
    - totalEquityTimeframe: Daily portfolio values
    - contributionTimeframe: Deposits over time
    - withdrawalTimeframe: Withdrawals over time
    - dividendTimeline: Dividend payments
    """
    
    def __init__(self):
        """Initialize the SnapTrade reporting service."""
        from snaptrade_client import SnapTrade
        
        self.client = SnapTrade(
            consumer_key=os.getenv('SNAPTRADE_CONSUMER_KEY'),
            client_id=os.getenv('SNAPTRADE_CLIENT_ID')
        )
    
    def _get_supabase_client(self):
        """Get Supabase client for database operations."""
        from supabase import create_client
        
        return create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        )
    
    async def fetch_portfolio_history(
        self,
        user_id: str,
        lookback_days: int = 365
    ) -> Dict[str, Any]:
        """
        Fetch portfolio history using SnapTrade's reporting API.
        
        Args:
            user_id: Clera user ID
            lookback_days: Number of days of history to fetch (max 365)
            
        Returns:
            Dict with 'success', 'snapshots_created', and optional 'error'
        """
        try:
            supabase = self._get_supabase_client()
            
            # Get SnapTrade credentials for this user
            user_creds = supabase.table('snaptrade_users')\
                .select('snaptrade_user_id, snaptrade_user_secret')\
                .eq('user_id', user_id)\
                .single()\
                .execute()
            
            if not user_creds.data:
                logger.warning(f"No SnapTrade credentials found for user {user_id}")
                return {
                    'success': False,
                    'error': 'No SnapTrade account found',
                    'snapshots_created': 0
                }
            
            snaptrade_user_id = user_creds.data['snaptrade_user_id']
            user_secret = user_creds.data['snaptrade_user_secret']
            
            # Get user's SnapTrade accounts
            accounts_response = self.client.account_information.list_user_accounts(
                user_id=snaptrade_user_id,
                user_secret=user_secret
            )
            
            if not accounts_response.body:
                logger.warning(f"No SnapTrade accounts found for user {user_id}")
                return {
                    'success': False,
                    'error': 'No SnapTrade accounts found',
                    'snapshots_created': 0
                }
            
            # Fetch reporting data for each account
            all_snapshots = []
            
            for account in accounts_response.body:
                account_id = str(account['id'])
                account_name = account.get('name', 'Unknown')
                
                logger.info(f"📊 Fetching history for account: {account_name}")
                
                # Fetch reporting data
                end_date = datetime.now()
                start_date = end_date - timedelta(days=min(lookback_days, 365))
                
                report = self.client.transactions_and_reporting.get_reporting_custom_range(
                    start_date=start_date.strftime('%Y-%m-%d'),
                    end_date=end_date.strftime('%Y-%m-%d'),
                    user_id=snaptrade_user_id,
                    user_secret=user_secret,
                    accounts=account_id,
                    detailed=True
                )
                
                # Extract daily portfolio values
                equity_timeline = report.body.get('totalEquityTimeframe', [])
                logger.info(f"   Retrieved {len(equity_timeline)} data points")
                
                # CRITICAL: Filter out unreliable data
                # SnapTrade's reporting API for some brokerages (like Webull) returns:
                # - Mostly zeros (181/182 values)
                # - Incorrect non-zero values (e.g., $14k when actual is $10k)
                # This is a known limitation - use snaptrade_history_estimator instead
                
                # Count non-zero values to detect if this API is reliable
                non_zero_count = sum(1 for dp in equity_timeline if dp.get('value', 0) > 0)
                zero_count = len(equity_timeline) - non_zero_count
                
                logger.info(f"   Data quality: {non_zero_count} non-zero, {zero_count} zero values")
                
                # If >90% of values are zero, this API is unreliable - skip it
                if len(equity_timeline) > 0 and (zero_count / len(equity_timeline)) > 0.9:
                    logger.warning(f"   ⚠️  SnapTrade reporting API is unreliable ({zero_count}/{len(equity_timeline)} zeros)")
                    logger.warning(f"   ⚠️  Skipping this data source - use snaptrade_history_estimator instead")
                    return {
                        'success': True,
                        'snapshots_created': 0,
                        'skipped': True,
                        'reason': 'Unreliable data source (>90% zeros)',
                        'use_instead': 'snaptrade_history_estimator'
                    }
                
                # Convert to snapshots (only if data looks reliable)
                for data_point in equity_timeline:
                    snapshot_date = datetime.strptime(data_point['date'], '%Y-%m-%d').date()
                    portfolio_value = Decimal(str(data_point.get('value', 0)))
                    
                    # Only store non-zero values
                    if portfolio_value > 0:
                        all_snapshots.append({
                            'user_id': user_id,
                            'value_date': snapshot_date.isoformat(),
                            'total_value': float(portfolio_value),
                            'total_cost_basis': float(portfolio_value),  # Not provided by API
                            'total_gain_loss': 0.0,  # Calculated separately if needed
                            'total_gain_loss_percent': 0.0,
                            'snapshot_type': 'reconstructed',  # Using 'reconstructed' type (from SnapTrade's reporting API)
                            'data_source': 'snaptrade',
                            'securities_count': 0  # Not provided in this endpoint
                        })
            
            # Sort by date
            all_snapshots.sort(key=lambda x: x['value_date'])
            
            # Store snapshots in database
            if all_snapshots:
                logger.info(f"💾 Storing {len(all_snapshots)} snapshots in database...")
                
                # Delete ONLY existing SnapTrade reconstructed snapshots for this user
                # CRITICAL: Do NOT delete 'daily_eod' snapshots - those are manually created/verified
                # (to avoid duplicates when re-fetching from reporting API)
                supabase.table('user_portfolio_history')\
                    .delete()\
                    .eq('user_id', user_id)\
                    .eq('data_source', 'snaptrade')\
                    .eq('snapshot_type', 'reconstructed')\
                    .execute()
                
                logger.info(f"🗑️  Cleaned up old reconstructed snapshots (preserved daily_eod snapshots)")
                
                # Batch insert new snapshots
                batch_size = 100
                for i in range(0, len(all_snapshots), batch_size):
                    batch = all_snapshots[i:i+batch_size]
                    supabase.table('user_portfolio_history')\
                        .insert(batch)\
                        .execute()
                
                logger.info(f"✅ Successfully stored {len(all_snapshots)} snapshots")
            else:
                logger.warning(f"⚠️  No portfolio data found in reporting API")
            
            return {
                'success': True,
                'snapshots_created': len(all_snapshots),
                'date_range': {
                    'start': all_snapshots[0]['value_date'] if all_snapshots else None,
                    'end': all_snapshots[-1]['value_date'] if all_snapshots else None
                }
            }
            
        except Exception as e:
            logger.error(f"Error fetching SnapTrade portfolio history: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'snapshots_created': 0
            }


# Singleton instance
_reporting_service_instance = None


def get_snaptrade_reporting_service() -> SnapTradeReportingService:
    """Get or create singleton instance of SnapTrade reporting service."""
    global _reporting_service_instance
    if _reporting_service_instance is None:
        _reporting_service_instance = SnapTradeReportingService()
    return _reporting_service_instance

