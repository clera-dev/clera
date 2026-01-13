"""
SnapTrade API routes for brokerage connection and trading.

This module provides REST API endpoints for:
- User registration with SnapTrade
- Brokerage connection portal URL generation
- Webhook handling for connection events
- Manual data refresh triggers
"""

import logging
import os
import asyncio
from fastapi import APIRouter, HTTPException, Request, Depends, Header
from typing import Dict, Any, Optional
from datetime import datetime

from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
from utils.supabase.db_client import get_supabase_client
from utils.authentication import get_authenticated_user_id

# Inline verify_api_key to avoid circular imports
def verify_api_key(x_api_key: str = Header(None)):
    """Verify API key for authentication."""
    expected_key = os.getenv("BACKEND_API_KEY")
    if not expected_key:
        return x_api_key  # If no key configured, allow all (dev mode)
    if x_api_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key


def validate_redirect_url(url: Optional[str]) -> bool:
    """
    SECURITY: Validate redirect URL to prevent Open Redirect attacks.
    
    Only allows redirects to trusted domains (our own app domains).
    Attackers could otherwise redirect users to malicious sites after
    legitimate authentication, enabling phishing attacks.
    """
    if not url:
        return True  # No redirect is safe
    
    from urllib.parse import urlparse
    
    try:
        parsed = urlparse(url)
        
        # SECURITY: Only allow http and https schemes
        # Blocks javascript:, data:, and other dangerous schemes
        if parsed.scheme.lower() not in ('http', 'https'):
            return False
        
        host = parsed.netloc.lower()
        
        # SECURITY: Reject empty hosts (malformed URLs)
        if not host:
            return False
        
        # Get allowed hosts from environment or use defaults
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        parsed_frontend = urlparse(frontend_url)
        
        # Build list of allowed hosts (filter out empty strings)
        allowed_hosts = []
        
        # SECURITY: Only allow localhost in development mode
        # In production, redirecting to localhost could be abused
        # IMPORTANT: Default to 'production' (fail-closed) - if ENVIRONMENT is unset,
        # we assume production and block localhost to prevent security bypass
        environment = os.getenv('ENVIRONMENT', 'production').lower()
        if environment in ('development', 'dev', 'local'):
            allowed_hosts.extend(['localhost', '127.0.0.1'])
        
        # Only add frontend netloc if it's non-empty
        if parsed_frontend.netloc:
            allowed_hosts.append(parsed_frontend.netloc)
        
        # Add Vercel preview URLs if configured
        # IMPORTANT: Parse the same way as FRONTEND_URL to extract just the host
        vercel_url = os.getenv('VERCEL_URL')
        if vercel_url:
            # Handle both full URLs (https://my-app.vercel.app) and bare hosts (my-app.vercel.app)
            parsed_vercel = urlparse(vercel_url if '://' in vercel_url else f'https://{vercel_url}')
            if parsed_vercel.netloc:
                allowed_hosts.append(parsed_vercel.netloc)
        
        # Add any additional allowed domains from env (filter empty)
        additional_hosts = os.getenv('ALLOWED_REDIRECT_HOSTS', '').split(',')
        allowed_hosts.extend([h.strip() for h in additional_hosts if h.strip()])
        
        # Check if host matches any allowed host
        for allowed in allowed_hosts:
            if not allowed:  # Skip empty strings
                continue
            allowed = allowed.lower()
            if host == allowed:
                return True
            # Also allow subdomains (e.g., preview.yourapp.com matches yourapp.com)
            if allowed and host.endswith('.' + allowed):
                return True
        
        return False
    except Exception:
        return False

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/snaptrade", tags=["snaptrade"])


@router.get("/trade-enabled-accounts")
async def get_trade_enabled_accounts(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Get all SnapTrade accounts that can place trades, with their cash balance and buying power.
    
    PRODUCTION-GRADE: Returns accounts from user_investment_accounts table with trading capabilities.
    If balances are null, triggers a real-time fetch from SnapTrade API.
    Respects user's buying_power_display preference (cash_only or cash_and_margin).
    
    IMPORTANT: Also validates connection health - accounts with disabled/broken connections
    are marked with connection_status='error' so the frontend can show appropriate UI.
    
    Returns:
        {
            "success": True,
            "accounts": [
                {
                    "id": str,  # Database UUID
                    "account_id": str,  # SnapTrade account ID
                    "institution_name": str,  # e.g., "Webull"
                    "account_name": str,
                    "cash": float,
                    "buying_power": float,  # Respects user preference
                    "type": "snaptrade",
                    "is_trade_enabled": True,
                    "connection_status": "active" | "error",  # NEW: Connection health indicator
                    "connection_error": Optional[str]  # NEW: Error message if connection broken
                }
            ],
            "alpaca_account": None  # For future hybrid mode
        }
    """
    try:
        logger.info(f"Fetching trade-enabled accounts for user {user_id}")
        
        supabase = get_supabase_client()
        
        # Get user's buying power display preference from user_preferences table
        user_prefs = supabase.table('user_preferences')\
            .select('buying_power_display')\
            .eq('user_id', user_id)\
            .execute()
        
        # Default to cash_only if preference not set (safer, discourages margin)
        if user_prefs.data and len(user_prefs.data) > 0:
            buying_power_display = user_prefs.data[0].get('buying_power_display', 'cash_only')
        else:
            buying_power_display = 'cash_only'
        
        logger.info(f"User preference: {buying_power_display}")
        
        supabase = get_supabase_client()
        
        # Get user's SnapTrade credentials
        snap_user_result = supabase.table('snaptrade_users')\
            .select('snaptrade_user_id, snaptrade_user_secret')\
            .eq('user_id', user_id)\
            .execute()
        
        if not snap_user_result.data:
            logger.warning(f"No SnapTrade user found for {user_id}")
            return {
                'success': True,
                'accounts': [],
                'alpaca_account': None
            }
        
        snaptrade_user_id = snap_user_result.data[0]['snaptrade_user_id']
        user_secret = snap_user_result.data[0]['snaptrade_user_secret']
        
        # Fetch SnapTrade accounts with trade capabilities (including authorization_id for reconnect)
        accounts_result = supabase.table('user_investment_accounts')\
            .select('id, provider_account_id, institution_name, account_name, cash_balance, buying_power, connection_type, connection_status, snaptrade_authorization_id')\
            .eq('user_id', user_id)\
            .eq('provider', 'snaptrade')\
            .eq('is_active', True)\
            .eq('connection_type', 'trade')\
            .execute()
        
        # Initialize SnapTrade provider for balance fetching and health checks
        from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
        provider = SnapTradePortfolioProvider()
        
        accounts_list = []
        for account in accounts_result.data:
            cash_balance = account.get('cash_balance')
            buying_power = account.get('buying_power')
            account_id = account['provider_account_id']
            connection_status = 'active'
            connection_error = None
            
            # PRODUCTION-GRADE: Check connection health via detail_brokerage_authorization API
            # This is more reliable than balance fetch which can succeed even when trading is disabled
            # SnapTrade's authorization object has a 'disabled' field that tells us the true status
            authorization_id = account.get('snaptrade_authorization_id')
            
            if authorization_id:
                try:
                    logger.info(f"📊 Checking authorization health for {account['institution_name']} (auth: {authorization_id})")
                    # PERFORMANCE: Run blocking SnapTrade API call in thread pool
                    # to avoid blocking the async event loop
                    auth_response = await asyncio.to_thread(
                        provider.client.connections.detail_brokerage_authorization,
                        authorization_id=authorization_id,
                        user_id=snaptrade_user_id,
                        user_secret=user_secret
                    )
                    
                    auth_data = auth_response.body
                    is_disabled = auth_data.get('disabled', False)
                    
                    if is_disabled:
                        connection_status = 'error'
                        connection_error = 'Connection expired. Please reconnect your brokerage account.'
                        
                        # Update database to mark connection as broken
                        supabase.table('user_investment_accounts')\
                            .update({'connection_status': 'error'})\
                            .eq('id', account['id'])\
                            .execute()
                        
                        logger.error(f"❌ Authorization disabled for {account['institution_name']} (auth {authorization_id})")
                    else:
                        # Authorization is healthy - now fetch balance
                        logger.info(f"✅ Authorization healthy for {account['institution_name']}")
                        
                except Exception as auth_error:
                    error_str = str(auth_error)
                    logger.warning(f"⚠️  Could not check authorization for {account['institution_name']}: {auth_error}")
                    
                    # Check if this is a connection-disabled error
                    from services.snaptrade_trading_service import is_connection_disabled_error
                    if is_connection_disabled_error(error_str):
                        connection_status = 'error'
                        connection_error = 'Connection expired. Please reconnect your brokerage account.'
                        
                        supabase.table('user_investment_accounts')\
                            .update({'connection_status': 'error'})\
                            .eq('id', account['id'])\
                            .execute()
                        
                        logger.error(f"❌ Connection disabled for {account['institution_name']} (account {account_id})")
            
            # Fetch balance (only if connection is healthy)
            if connection_status == 'active':
                try:
                    # PERFORMANCE: Run blocking SnapTrade API call in thread pool
                    balances_response = await asyncio.to_thread(
                        provider.client.account_information.get_user_account_balance,
                        user_id=snaptrade_user_id,
                        user_secret=user_secret,
                        account_id=account_id
                    )
                    
                    # Extract cash and buying power from all currencies (usually USD)
                    total_cash = 0
                    total_buying_power = 0
                    
                    for balance in balances_response.body:
                        if isinstance(balance, dict):
                            total_cash += float(balance.get('cash', 0) or 0)
                            total_buying_power += float(balance.get('buying_power', 0) or 0)
                    
                    cash_balance = total_cash
                    buying_power = total_buying_power if total_buying_power > 0 else total_cash
                    
                    # Update database with fetched balances and mark connection as active
                    supabase.table('user_investment_accounts')\
                        .update({
                            'cash_balance': cash_balance,
                            'buying_power': buying_power,
                            'connection_status': 'active'
                        })\
                        .eq('id', account['id'])\
                        .execute()
                    
                    logger.info(f"✅ Verified balance for {account['institution_name']}: cash=${cash_balance:.2f}")
                    
                except Exception as balance_error:
                    logger.warning(f"⚠️  Could not fetch balance for account {account_id}: {balance_error}")
                    # Use cached values for balance
                    cash_balance = cash_balance or 0
                    buying_power = buying_power or 0
            
            # PRODUCTION-GRADE: Respect user's buying power preference
            # cash_only = safer, discourages margin trading (default)
            # cash_and_margin = shows full buying power including margin
            display_buying_power = float(cash_balance or 0) if buying_power_display == 'cash_only' else float(buying_power or 0)
            
            account_data = {
                'id': account['id'],
                'account_id': account_id,
                'institution_name': account['institution_name'],
                'account_name': account['account_name'],
                'cash': float(cash_balance or 0),
                'buying_power': display_buying_power,
                'type': 'snaptrade',
                'is_trade_enabled': connection_status == 'active',  # Only trade-enabled if connection is healthy
                'connection_status': connection_status,
                'connection_error': connection_error,
            }
            
            # PRODUCTION-GRADE: For broken connections, include reconnect URL
            # This allows frontend to show a one-click "Reconnect" button
            if connection_status == 'error':
                authorization_id = account.get('snaptrade_authorization_id')
                if authorization_id:
                    try:
                        # Generate reconnect URL with redirect back to our callback page
                        # The callback page will sync the connection and allow user to close the tab
                        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                        redirect_url = f"{frontend_url}/snaptrade-reconnect-callback"
                        
                        reconnect_url = await provider.get_connection_portal_url(
                            user_id=user_id,
                            connection_type='trade',
                            redirect_url=redirect_url,
                            reconnect=authorization_id
                        )
                        account_data['reconnect_url'] = reconnect_url
                        logger.info(f"Generated reconnect URL for broken {account['institution_name']} account")
                    except Exception as reconnect_error:
                        logger.warning(f"Could not generate reconnect URL: {reconnect_error}")
            
            accounts_list.append(account_data)
        
        # Log summary including connection health
        healthy_count = sum(1 for a in accounts_list if a['connection_status'] == 'active')
        broken_count = len(accounts_list) - healthy_count
        logger.info(f"Found {len(accounts_list)} trade-enabled SnapTrade accounts for user {user_id} ({healthy_count} healthy, {broken_count} broken)")
        
        return {
            'success': True,
            'accounts': accounts_list,
            'alpaca_account': None  # For future hybrid mode support
        }
        
    except Exception as e:
        logger.error(f"Error fetching trade-enabled accounts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-orders")
async def get_pending_orders(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Get all pending orders across all connected SnapTrade accounts.
    
    Returns:
        {
            "success": True,
            "orders": [
                {
                    "order_id": str,
                    "account_id": str,
                    "account_name": str,  # Brokerage name (e.g., "Webull")
                    "symbol": str,
                    "quantity": float,
                    "order_type": str,  # "limit", "market", etc.
                    "side": str,  # "buy" or "sell"
                    "status": str,  # "open", "pending", etc.
                    "price": float,
                    "created_at": str
                }
            ]
        }
    """
    try:
        logger.info(f"Fetching pending orders for user {user_id}")
        
        # Initialize SnapTrade provider
        provider = SnapTradePortfolioProvider()
        
        # Get user's SnapTrade credentials
        supabase = get_supabase_client()
        snap_user_result = supabase.table('snaptrade_users')\
            .select('snaptrade_user_id, snaptrade_user_secret')\
            .eq('user_id', user_id)\
            .execute()
        
        if not snap_user_result.data:
            logger.warning(f"No SnapTrade user found for {user_id}")
            return {
                "success": True,
                "orders": []
            }
        
        snap_user_id = snap_user_result.data[0]['snaptrade_user_id']
        snap_user_secret = snap_user_result.data[0]['snaptrade_user_secret']
        
        # Get all connected accounts
        accounts_response = provider.client.account_information.list_user_accounts(
            user_id=snap_user_id,
            user_secret=snap_user_secret
        )
        
        # Fetch pending orders from all accounts
        all_pending_orders = []
        
        for account in accounts_response.body:
            account_id = account.get('id')
            account_name = account.get('meta', {}).get('name', account.get('name', 'Unknown'))
            institution_name = account.get('institution_name', 'Unknown Brokerage')
            
            try:
                # Fetch orders for this account (state="open" for pending)
                orders_response = provider.client.account_information.get_user_account_orders(
                    user_id=snap_user_id,
                    user_secret=snap_user_secret,
                    account_id=account_id,
                    state='open'  # Only pending/open orders
                )
                
                # Transform to consistent format
                for order in orders_response.body:
                    all_pending_orders.append({
                        'order_id': order.get('id'),
                        'account_id': account_id,
                        'account_name': institution_name,  # Use brokerage name
                        'symbol': order.get('symbol'),
                        'quantity': float(order.get('quantity', 0)) if order.get('quantity') else 0,
                        'order_type': order.get('order_type', 'unknown'),
                        'side': order.get('action', 'unknown'),  # buy/sell
                        'status': order.get('status', 'pending'),
                        'price': float(order.get('price', 0)) if order.get('price') else None,
                        'created_at': order.get('opened_at') or order.get('created_at'),
                        'stop_price': float(order.get('stop_price', 0)) if order.get('stop_price') else None,
                        'time_in_force': order.get('time_in_force'),
                    })
                    
            except Exception as e:
                logger.warning(f"Failed to fetch orders for account {account_id}: {e}")
                continue
        
        # PRODUCTION-GRADE: Also include locally queued orders (for when market was closed)
        try:
            queued_orders_result = supabase.table('queued_orders')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('status', 'pending')\
                .order('created_at', desc=True)\
                .execute()
            
            for queued in queued_orders_result.data or []:
                all_pending_orders.append({
                    'order_id': queued['id'],
                    'account_id': queued['account_id'],
                    'account_name': 'Queued (Market Closed)',  # Special indicator
                    'symbol': queued['symbol'],
                    'quantity': float(queued.get('units') or 0),
                    'notional_value': float(queued.get('notional_value') or 0),
                    'order_type': queued.get('order_type', 'Market'),
                    'side': queued.get('action', 'BUY'),
                    'status': 'queued',  # Special status for queued orders
                    'price': float(queued.get('price') or 0) if queued.get('price') else None,
                    'created_at': queued.get('created_at'),
                    'time_in_force': queued.get('time_in_force', 'Day'),
                    'is_queued': True,  # Flag to identify queued orders
                    'queued_message': 'Will execute when market opens (9:30 AM ET)'
                })
                
            logger.info(f"Added {len(queued_orders_result.data or [])} queued orders")
        except Exception as e:
            logger.warning(f"Failed to fetch queued orders: {e}")
        
        logger.info(f"Found {len(all_pending_orders)} total pending orders for user {user_id}")
        
        return {
            "success": True,
            "orders": all_pending_orders
        }
        
    except Exception as e:
        logger.error(f"Error fetching pending orders: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending orders: {str(e)}")


@router.delete("/queued-order/{order_id}")
async def cancel_queued_order(
    order_id: str,
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Cancel a queued order (order placed when market was closed).
    
    Args:
        order_id: The queued order ID to cancel
        
    Returns:
        {
            "success": True,
            "message": str
        }
    """
    try:
        logger.info(f"Cancelling queued order {order_id} for user {user_id}")
        
        supabase = get_supabase_client()
        
        # Verify ownership and status
        result = supabase.table('queued_orders')\
            .select('*')\
            .eq('id', order_id)\
            .eq('user_id', user_id)\
            .single()\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Order not found")
        
        if result.data['status'] != 'pending':
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot cancel order with status: {result.data['status']}"
            )
        
        # Update status to cancelled
        from datetime import datetime, timezone
        supabase.table('queued_orders')\
            .update({
                'status': 'cancelled',
                'updated_at': datetime.now(timezone.utc).isoformat()
            })\
            .eq('id', order_id)\
            .execute()
        
        logger.info(f"✅ Queued order cancelled: {order_id}")
        
        return {
            "success": True,
            "message": f"Order cancelled successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling queued order: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market-status")
async def get_market_status(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Get current market status for trade UI.
    
    Returns:
        {
            "success": True,
            "market": {
                "is_open": bool,
                "status": "open" | "closed" | "pre_market" | "after_hours",
                "message": str,
                "next_open": str (ISO format) | None,
                "orders_accepted": bool
            }
        }
    """
    try:
        from services.snaptrade_trading_service import get_snaptrade_trading_service
        trading_service = get_snaptrade_trading_service()
        market_status = trading_service.get_market_status()
        
        return {
            "success": True,
            "market": market_status
        }
    except Exception as e:
        logger.error(f"Error getting market status: {e}", exc_info=True)
        # SECURITY: Don't expose internal error details to users
        raise HTTPException(status_code=500, detail="Unable to fetch market status. Please try again.")


@router.get("/queued-order-executor-status")
async def get_queued_order_executor_status(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Get the status of the queued order executor (for debugging/monitoring).
    
    SECURITY: Only returns pending order count for the authenticated user,
    not global platform metrics.
    
    Returns:
        {
            "success": True,
            "executor": {
                "is_running": bool,
                "pending_orders": int (user's orders only),
                "jobs": [...]
            }
        }
    """
    try:
        from services.queued_order_executor import get_queued_order_executor
        executor = get_queued_order_executor()
        
        # PERFORMANCE: Run synchronous DB queries in thread pool
        # to avoid blocking the async event loop
        status = await asyncio.to_thread(executor.get_status, user_id=user_id)
        
        return {
            "success": True,
            "executor": status
        }
    except Exception as e:
        logger.error(f"Error getting executor status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get executor status")


@router.post("/connection-url")
async def create_connection_url(
    request: Request,
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Generate SnapTrade connection portal URL for user to connect brokerage.
    
    SECURITY: User ID is now obtained from authenticated JWT token only.
    
    Request body:
        {
            "connection_type": Optional["read" | "trade"],  // default: None (shows ALL brokerages)
            "broker": Optional[str],  // e.g., "SCHWAB", "FIDELITY"
            "redirect_url": Optional[str]
        }
    
    Returns:
        {
            "success": True,
            "connection_url": str,
            "user_id": str
        }
    
    ARCHITECTURE NOTE:
    - When connection_type is None/omitted: Shows ALL available brokerages (recommended for onboarding)
    - When connection_type is 'read': Shows only brokerages that support read access
    - When connection_type is 'trade': Shows only brokerages that support trading
    """
    try:
        body = await request.json()
        # ARCHITECTURE: Default to None to show ALL brokerages
        # Only filter when explicitly requested (e.g., for trade-specific flows)
        connection_type = body.get('connection_type')  # None = show all
        broker = body.get('broker')
        redirect_url = body.get('redirect_url')
        
        # SECURITY: Validate redirect URL to prevent Open Redirect attacks
        if redirect_url and not validate_redirect_url(redirect_url):
            logger.warning(f"Rejected invalid redirect URL: {redirect_url}")
            raise HTTPException(status_code=400, detail="Invalid redirect URL - must be a trusted domain")
        
        # SECURITY FIX: user_id comes from authenticated JWT token, not request body
        
        # Initialize SnapTrade provider
        provider = SnapTradePortfolioProvider()
        
        # Get connection portal URL
        connection_url = await provider.get_connection_portal_url(
            user_id=user_id,
            broker=broker,
            connection_type=connection_type,
            redirect_url=redirect_url
        )
        
        return {
            "success": True,
            "connection_url": connection_url,
            "user_id": user_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating SnapTrade connection URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reconnect-url/{account_id}")
async def create_reconnect_url(
    account_id: str,
    request: Request,
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Generate SnapTrade reconnect portal URL for fixing a broken/disabled connection.
    
    PRODUCTION-GRADE: Uses SnapTrade's reconnect parameter to re-authorize an existing
    connection without creating a new one. This is the proper way to handle expired
    access tokens (which typically expire after a few weeks).
    
    Reference: https://docs.snaptrade.com/docs/fix-broken-connections
    
    Args:
        account_id: The provider_account_id of the disabled account
        
    Request body:
        {
            "redirect_url": Optional[str]  // Where to redirect after reconnection
        }
    
    Returns:
        {
            "success": True,
            "reconnect_url": str,
            "account_id": str,
            "institution_name": str
        }
    """
    try:
        body = {}
        try:
            body = await request.json()
        except Exception:
            pass  # Empty body is OK
        
        redirect_url = body.get('redirect_url')
        
        # SECURITY: Validate redirect URL to prevent Open Redirect attacks
        if redirect_url and not validate_redirect_url(redirect_url):
            logger.warning(f"Rejected invalid redirect URL: {redirect_url}")
            raise HTTPException(status_code=400, detail="Invalid redirect URL - must be a trusted domain")
        
        supabase = get_supabase_client()
        
        # Verify user owns this account and get the authorization ID
        account_result = supabase.table('user_investment_accounts')\
            .select('id, provider_account_id, snaptrade_authorization_id, institution_name')\
            .eq('user_id', user_id)\
            .eq('provider_account_id', account_id)\
            .eq('provider', 'snaptrade')\
            .execute()
        
        if not account_result.data:
            raise HTTPException(status_code=404, detail="Account not found or you don't have permission to reconnect it")
        
        account = account_result.data[0]
        authorization_id = account.get('snaptrade_authorization_id')
        institution_name = account.get('institution_name', 'your brokerage')
        
        if not authorization_id:
            # Fallback: Try to get authorization_id from snaptrade_brokerage_connections
            # CRITICAL: Must filter by brokerage_name to avoid returning wrong authorization
            # for users with multiple brokerage connections (e.g., Webull + Coinbase)
            conn_result = supabase.table('snaptrade_brokerage_connections')\
                .select('authorization_id')\
                .eq('user_id', user_id)\
                .eq('brokerage_name', institution_name)\
                .order('created_at', desc=True)\
                .limit(1)\
                .execute()
            
            if conn_result.data and len(conn_result.data) > 0:
                authorization_id = conn_result.data[0].get('authorization_id')
        
        if not authorization_id:
            raise HTTPException(
                status_code=400, 
                detail="Cannot reconnect this account - authorization ID not found. Please disconnect and reconnect the account."
            )
        
        logger.info(f"Generating reconnect URL for user {user_id}, account {account_id}, authorization {authorization_id}")
        
        # Initialize SnapTrade provider
        provider = SnapTradePortfolioProvider()
        
        # Get reconnect portal URL with the reconnect parameter
        reconnect_url = await provider.get_connection_portal_url(
            user_id=user_id,
            connection_type='trade',
            redirect_url=redirect_url,
            reconnect=authorization_id  # This is the key parameter!
        )
        
        logger.info(f"✅ Generated reconnect URL for {institution_name} account")
        
        return {
            "success": True,
            "reconnect_url": reconnect_url,
            "account_id": account_id,
            "institution_name": institution_name,
            "message": f"Click the link to reconnect your {institution_name} account"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating reconnect URL: {e}", exc_info=True)
        # SECURITY: Don't expose internal error details to users
        raise HTTPException(status_code=500, detail="Unable to create reconnect URL. Please try again or contact support.")


@router.post("/webhook")
async def snaptrade_webhook(request: Request):
    """
    Handle SnapTrade webhooks for connection and account events.
    
    SnapTrade sends webhooks for:
    - CONNECTION.CREATED - New brokerage connection established
    - CONNECTION.BROKEN - Connection lost/disabled
    - CONNECTION.REFRESHED - Connection data refreshed
    - ACCOUNT_HOLDINGS_UPDATED - Holdings data updated
    - TRANSACTIONS_UPDATED - New transactions available
    - USER_DELETED - User deleted from SnapTrade
    """
    try:
        payload = await request.json()
        
        # Log webhook for debugging
        logger.info(f"📦 Webhook payload type: {payload.get('eventType')}")
        
        # Verify webhook signature (PRODUCTION SECURITY)
        from utils.snaptrade_webhook_security import (
            verify_webhook_signature,
            validate_webhook_payload
        )
        
        # SnapTrade sends signature in 'Signature' header (capital S)
        webhook_signature = request.headers.get('Signature', '') or request.headers.get('x-snaptrade-signature', '')
        
        # Verify the webhook secret matches what we expect
        webhook_secret_in_payload = payload.get('webhookSecret', '')
        expected_secret = os.getenv('SNAPTRADE_WEBHOOK_SECRET', '')
        
        if webhook_secret_in_payload and webhook_secret_in_payload != expected_secret:
            logger.error(f"❌ Webhook secret mismatch! Expected: {expected_secret}, Got: {webhook_secret_in_payload}")
            raise HTTPException(status_code=401, detail="Invalid webhook secret")
        
        # For now, trust the webhook if the secret in payload matches
        # (SnapTrade includes the secret in the payload for verification)
        if not webhook_secret_in_payload:
            logger.warning("⚠️ No webhook secret in payload - validating signature")
            if not verify_webhook_signature(payload, webhook_signature):
                logger.error("❌ Invalid webhook signature - rejecting request")
                raise HTTPException(status_code=401, detail="Invalid webhook signature")
        
        # SnapTrade uses 'eventType' not 'type'
        event_type = payload.get('eventType') or payload.get('type')
        
        if not event_type:
            logger.error("❌ No event type in webhook payload")
            raise HTTPException(status_code=400, detail="Missing event type")
        
        logger.info(f"📩 Received SnapTrade webhook: {event_type} ✅")
        
        if event_type == 'CONNECTION.CREATED':
            await handle_connection_created(payload)
        
        elif event_type == 'CONNECTION.BROKEN':
            await handle_connection_broken(payload)
        
        elif event_type == 'CONNECTION.REFRESHED':
            await handle_connection_refreshed(payload)
        
        elif event_type == 'ACCOUNT_HOLDINGS_UPDATED':
            await handle_holdings_updated(payload)
        
        elif event_type == 'TRANSACTIONS_UPDATED':
            await handle_transactions_updated(payload)
        
        elif event_type == 'USER_DELETED':
            await handle_user_deleted(payload)
        
        else:
            logger.warning(f"Unknown webhook event type: {event_type}")
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing SnapTrade webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-all")
async def sync_all_connections(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Sync ALL SnapTrade connections for a user.
    
    This is called from the frontend callback page after SnapTrade redirect.
    Since SnapTrade does NOT return authorizationId in the URL, we fetch
    ALL user connections from SnapTrade API and sync them to our database.
    """
    try:
        logger.info(f"📥 Syncing ALL connections for user {user_id}")
        
        supabase = get_supabase_client()
        provider = SnapTradePortfolioProvider()
        
        # Get user's SnapTrade credentials
        user_creds = supabase.table('snaptrade_users')\
            .select('snaptrade_user_id, snaptrade_user_secret')\
            .eq('user_id', user_id)\
            .execute()
        
        if not user_creds.data:
            raise HTTPException(status_code=404, detail="SnapTrade user not found")
        
        snaptrade_user_id = user_creds.data[0]['snaptrade_user_id']
        user_secret = user_creds.data[0]['snaptrade_user_secret']
        
        # Fetch ALL brokerage authorizations (connections)
        logger.info(f"Fetching all brokerage authorizations for user {snaptrade_user_id}")
        authorizations_response = provider.client.connections.list_brokerage_authorizations(
            user_id=snaptrade_user_id,
            user_secret=user_secret
        )
        
        if not authorizations_response.body:
            logger.warning(f"No brokerage authorizations found for user {user_id}")
            return {
                "success": True,
                "message": "No connections found",
                "connections_synced": 0,
                "accounts_synced": 0
            }
        
        from datetime import datetime
        connections_synced = 0
        accounts_synced = 0
        
        # For each authorization, fetch accounts and store
        for auth in authorizations_response.body:
            authorization_id = str(auth.get('id'))
            brokerage = auth.get('brokerage', {})
            brokerage_name = brokerage.get('name', 'Unknown') if isinstance(brokerage, dict) else str(brokerage)
            
            # CRITICAL FIX: Determine actual connection_type from brokerage capabilities
            # SnapTrade's Brokerage object has 'allows_trading' field that indicates
            # whether the brokerage supports trade execution vs read-only access
            allows_trading = False
            if isinstance(brokerage, dict):
                allows_trading = brokerage.get('allows_trading', False)
            actual_connection_type = 'trade' if allows_trading else 'read'
            
            logger.info(f"Processing authorization {authorization_id} for brokerage {brokerage_name} (connection_type={actual_connection_type})")
            
            # Fetch accounts for this authorization
            accounts_response = provider.client.account_information.list_user_accounts(
                user_id=snaptrade_user_id,
                user_secret=user_secret
            )
            
            # Filter accounts for this specific authorization
            accounts_for_auth = []
            for account in accounts_response.body:
                auth_obj = account.get('brokerage_authorization')
                account_auth_id = None
                
                if isinstance(auth_obj, dict):
                    account_auth_id = str(auth_obj.get('id'))
                elif isinstance(auth_obj, str):
                    account_auth_id = auth_obj
                
                if account_auth_id == authorization_id:
                    accounts_for_auth.append(account)
            
            # Store connection with correct connection_type based on brokerage capabilities
            connection_data = {
                'user_id': user_id,
                'authorization_id': authorization_id,
                'brokerage_slug': brokerage_name.lower().replace(' ', '_'),
                'brokerage_name': brokerage_name,
                'connection_type': actual_connection_type,  # CRITICAL: Use actual capability, not hardcoded 'trade'
                'status': 'active',
                'accounts_count': len(accounts_for_auth),
                'created_at': datetime.now().isoformat()
            }
            
            supabase.table('snaptrade_brokerage_connections')\
                .upsert(connection_data, on_conflict='authorization_id')\
                .execute()
            
            connections_synced += 1
            logger.info(f"✅ Stored connection for authorization {authorization_id}")
            
            # Store each account
            for account in accounts_for_auth:
                account_id = str(account['id'])
                
                # PRODUCTION-GRADE: Fetch cash balance and buying power for trade validation
                cash_balance = None
                buying_power = None
                try:
                    balances_response = provider.client.account_information.get_user_account_balance(
                        user_id=snaptrade_user_id,
                        user_secret=user_secret,
                        account_id=account_id
                    )
                    
                    # Extract total cash from all currencies (usually USD)
                    total_cash = 0
                    for balance in balances_response.body:
                        if isinstance(balance, dict) and 'cash' in balance:
                            total_cash += float(balance.get('cash', 0) or 0)
                    
                    cash_balance = total_cash
                    buying_power = total_cash
                    logger.debug(f"💰 Account {account_id}: cash=${cash_balance:.2f}, buying_power=${buying_power:.2f}")
                except Exception as balance_error:
                    logger.warning(f"⚠️  Could not fetch balance for account {account_id}: {balance_error}")
                
                account_data = {
                    'user_id': user_id,
                    'provider': 'snaptrade',
                    'provider_account_id': account_id,
                    'snaptrade_authorization_id': authorization_id,
                    'institution_name': brokerage_name,
                    'brokerage_name': brokerage_name,
                    'account_name': account.get('name', 'Investment Account'),
                    'account_type': account.get('type', 'investment'),
                    'account_subtype': account.get('type', 'investment'),
                    'account_mode': 'snaptrade',
                    'connection_type': actual_connection_type,  # CRITICAL: Use actual capability
                    'connection_status': 'active',
                    'is_active': True,
                    'sync_status': 'success',
                    'last_synced': datetime.now().isoformat(),
                    'cash_balance': cash_balance,
                    'buying_power': buying_power
                }
                
                supabase.table('user_investment_accounts')\
                    .upsert(account_data, on_conflict='provider,provider_account_id,user_id')\
                    .execute()
                
                accounts_synced += 1
            
            logger.info(f"✅ Synced {len(accounts_for_auth)} accounts for authorization {authorization_id} (connection_type={actual_connection_type})")
        
        # Update user_onboarding status to 'submitted'
        from datetime import timezone
        onboarding_check = supabase.table('user_onboarding')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()
        
        if onboarding_check.data:
            supabase.table('user_onboarding')\
                .update({
                    'status': 'submitted',
                    'updated_at': datetime.now(timezone.utc).isoformat()
                })\
                .eq('user_id', user_id)\
                .execute()
            logger.info(f"✅ Updated user_onboarding status to 'submitted' for user {user_id}")
        else:
            supabase.table('user_onboarding')\
                .insert({
                    'user_id': user_id,
                    'status': 'submitted',
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                })\
                .execute()
            logger.info(f"✅ Created user_onboarding record with status 'submitted' for user {user_id}")
        
        # CRITICAL: After syncing accounts, also sync holdings!
        # This was missing - accounts were synced but holdings were never fetched
        holdings_synced = 0
        try:
            from utils.portfolio.snaptrade_sync_service import trigger_full_user_sync
            logger.info(f"🔄 Triggering holdings sync for user {user_id}")
            sync_result = await trigger_full_user_sync(user_id, force_rebuild=True)
            if sync_result.get('success'):
                holdings_synced = sync_result.get('positions_synced', 0)
                logger.info(f"✅ Synced {holdings_synced} holdings for user {user_id}")
            else:
                logger.warning(f"⚠️  Holdings sync returned non-success: {sync_result}")
        except Exception as holdings_error:
            logger.error(f"⚠️  Failed to sync holdings (non-fatal): {holdings_error}")
            # Don't fail the whole request if holdings sync fails
        
        # CRITICAL FIX: Generate portfolio history IMMEDIATELY after holdings sync
        # Without this, the portfolio chart shows a flat line (no historical data)
        # This uses current holdings + historical prices to estimate portfolio history
        history_generated = 0
        try:
            from services.snaptrade_holdings_based_history import get_estimator_service
            logger.info(f"📊 Generating estimated portfolio history for user {user_id}")
            estimator = get_estimator_service()
            history_result = await estimator.generate_estimated_history(user_id, lookback_days=365)
            if history_result.get('success'):
                history_generated = history_result.get('snapshots_created', 0)
                logger.info(f"✅ Generated {history_generated} portfolio history snapshots for user {user_id}")
            else:
                logger.warning(f"⚠️  History generation returned: {history_result.get('error')}")
        except Exception as history_error:
            logger.error(f"⚠️  Failed to generate portfolio history (non-fatal): {history_error}")
            # Don't fail the whole request if history generation fails
        
        return {
            "success": True,
            "message": f"Synced {connections_synced} connections, {accounts_synced} accounts, {holdings_synced} holdings, and generated {history_generated} history snapshots",
            "connections_synced": connections_synced,
            "accounts_synced": accounts_synced,
            "holdings_synced": holdings_synced,
            "history_snapshots_generated": history_generated,
            "user_id": user_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing all connections: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-connection")
async def sync_connection(
    request: Request,
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Sync SnapTrade connection after user connects brokerage.
    
    This is called from the frontend callback page (not webhook).
    It fetches the connection data from SnapTrade API and stores it.
    
    Request body:
        {
            "authorization_id": str,
            "broker": Optional[str]
        }
    
    Returns:
        {
            "success": True,
            "message": str,
            "accounts_synced": int
        }
    """
    try:
        body = await request.json()
        authorization_id = body.get('authorization_id')
        broker = body.get('broker')
        
        if not authorization_id:
            raise HTTPException(status_code=400, detail="authorization_id is required")
        
        logger.info(f"📥 Syncing connection for user {user_id}, authorization: {authorization_id}")
        
        supabase = get_supabase_client()
        provider = SnapTradePortfolioProvider()
        
        # Get user's SnapTrade credentials
        user_creds = supabase.table('snaptrade_users')\
            .select('snaptrade_user_id, snaptrade_user_secret')\
            .eq('user_id', user_id)\
            .execute()
        
        if not user_creds.data:
            raise HTTPException(status_code=404, detail="SnapTrade user not found")
        
        snaptrade_user_id = user_creds.data[0]['snaptrade_user_id']
        user_secret = user_creds.data[0]['snaptrade_user_secret']
        
        # Fetch all user accounts from SnapTrade
        accounts_response = provider.client.account_information.list_user_accounts(
            user_id=snaptrade_user_id,
            user_secret=user_secret
        )
        
        # CRITICAL FIX: Fetch authorization details to get actual connection_type
        # The brokerage object contains 'allows_trading' that determines capability
        actual_connection_type = 'read'  # Default to read-only (safer)
        try:
            auth_detail = provider.client.connections.detail_brokerage_authorization(
                authorization_id=authorization_id,
                user_id=snaptrade_user_id,
                user_secret=user_secret
            )
            if auth_detail.body:
                brokerage_obj = auth_detail.body.get('brokerage', {})
                if isinstance(brokerage_obj, dict):
                    allows_trading = brokerage_obj.get('allows_trading', False)
                    actual_connection_type = 'trade' if allows_trading else 'read'
                    logger.info(f"Brokerage {brokerage_obj.get('name', 'Unknown')} allows_trading={allows_trading}")
        except Exception as auth_detail_error:
            logger.warning(f"Could not fetch authorization details for {authorization_id}: {auth_detail_error}")
            # Fall back to 'read' as safer default
        
        # Find the account(s) associated with this authorization
        from datetime import datetime
        accounts_for_auth = []
        for account in accounts_response.body:
            # SnapTrade returns brokerage_authorization as the auth ID
            if str(account.get('brokerage_authorization')) == str(authorization_id):
                accounts_for_auth.append(account)
        
        if not accounts_for_auth:
            logger.warning(f"No accounts found for authorization {authorization_id}")
            # Still try to store the connection record
        
        # Get brokerage info from first account
        brokerage_name = broker or 'Unknown'
        if accounts_for_auth:
            brokerage_name = accounts_for_auth[0].get('institution', broker or 'Unknown')
        
        # Store connection in snaptrade_brokerage_connections with actual capability
        connection_data = {
            'user_id': user_id,
            'authorization_id': authorization_id,
            'brokerage_slug': broker or brokerage_name,
            'brokerage_name': brokerage_name,
            'connection_type': actual_connection_type,  # CRITICAL: Use actual capability
            'status': 'active',
            'accounts_count': len(accounts_for_auth),
            'created_at': datetime.now().isoformat()
        }
        
        # Use upsert to handle duplicates (unique constraint is on authorization_id only)
        supabase.table('snaptrade_brokerage_connections')\
            .upsert(connection_data, on_conflict='authorization_id')\
            .execute()
        
        logger.info(f"✅ Stored connection for authorization {authorization_id}")
        
        # Store each account in user_investment_accounts
        accounts_synced = 0
        for account in accounts_for_auth:
            account_id = str(account['id'])
            
            # PRODUCTION-GRADE: Fetch cash balance and buying power for trade validation
            cash_balance = None
            buying_power = None
            try:
                balances_response = provider.client.account_information.get_user_account_balance(
                    user_id=snaptrade_user_id,
                    user_secret=user_secret,
                    account_id=account_id
                )
                
                # Extract total cash from all currencies (usually USD)
                total_cash = 0
                for balance in balances_response.body:
                    if isinstance(balance, dict) and 'cash' in balance:
                        total_cash += float(balance.get('cash', 0) or 0)
                
                cash_balance = total_cash
                buying_power = total_cash
                logger.debug(f"💰 Account {account_id}: cash=${cash_balance:.2f}, buying_power=${buying_power:.2f}")
            except Exception as balance_error:
                logger.warning(f"⚠️  Could not fetch balance for account {account_id}: {balance_error}")
            
            account_data = {
                'user_id': user_id,
                'provider': 'snaptrade',
                'provider_account_id': account_id,
                'snaptrade_authorization_id': authorization_id,
                'institution_name': brokerage_name,
                'brokerage_name': brokerage_name,
                'account_name': account.get('name', 'Investment Account'),
                'account_type': account.get('type', 'investment'),
                'account_subtype': account.get('type', 'investment'),
                'account_mode': 'snaptrade',
                'connection_type': actual_connection_type,  # CRITICAL: Use actual capability
                'connection_status': 'active',
                'is_active': True,
                'sync_status': 'success',
                'last_synced': datetime.now().isoformat(),
                'cash_balance': cash_balance,
                'buying_power': buying_power
            }
            
            supabase.table('user_investment_accounts')\
                .upsert(account_data, on_conflict='provider,provider_account_id,user_id')\
                .execute()
            
            accounts_synced += 1
        
        logger.info(f"✅ Synced {accounts_synced} accounts for authorization {authorization_id} (connection_type={actual_connection_type})")
        
        # Update user_onboarding status to 'submitted'
        from datetime import timezone
        onboarding_check = supabase.table('user_onboarding')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()
        
        if onboarding_check.data:
            supabase.table('user_onboarding')\
                .update({
                    'status': 'submitted',
                    'updated_at': datetime.now(timezone.utc).isoformat()
                })\
                .eq('user_id', user_id)\
                .execute()
            logger.info(f"✅ Updated user_onboarding status to 'submitted' for user {user_id}")
        else:
            supabase.table('user_onboarding')\
                .insert({
                    'user_id': user_id,
                    'status': 'submitted',
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                })\
                .execute()
            logger.info(f"✅ Created user_onboarding record with status 'submitted' for user {user_id}")
        
        return {
            "success": True,
            "message": f"Synced connection {authorization_id}",
            "accounts_synced": accounts_synced,
            "user_id": user_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh")
async def trigger_refresh(
    request: Request,
    user_id: str = Depends(get_authenticated_user_id),
    api_key: str = Depends(verify_api_key)
):
    """
    Trigger manual refresh of SnapTrade data for user.
    
    SECURITY: User ID is now obtained from authenticated JWT token only.
    
    Request body:
        {
            "account_id": Optional[str]
        }
    
    Returns:
        {
            "success": True,
            "message": str
        }
    """
    try:
        body = await request.json()
        account_id = body.get('account_id')
        
        # SECURITY FIX: user_id comes from authenticated JWT token, not request body
        
        # Step 1: Trigger SnapTrade API refresh (pulls latest from brokerages)
        provider = SnapTradePortfolioProvider()
        api_refresh_success = await provider.refresh_data(user_id, account_id)
        
        # Step 2: Sync the data to our database
        from utils.portfolio.snaptrade_sync_service import trigger_full_user_sync, trigger_account_sync
        
        if account_id:
            # Sync specific account
            sync_result = await trigger_account_sync(user_id, account_id)
        else:
            # Full user sync
            sync_result = await trigger_full_user_sync(user_id, force_rebuild=True)
        
        if api_refresh_success and sync_result.get('success'):
            return {
                "success": True,
                "message": "Data refreshed and synced successfully",
                "positions_synced": sync_result.get('positions_synced', 0)
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to trigger refresh or sync")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering refresh: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# Webhook Handler Functions
# =====================================================

async def handle_connection_created(payload: Dict):
    """Handle CONNECTION.CREATED webhook."""
    try:
        user_id = payload.get('userId')
        # SnapTrade uses 'brokerageAuthorizationId' not 'authorizationId'
        authorization_id = payload.get('brokerageAuthorizationId') or payload.get('authorizationId')
        brokerage_id = payload.get('brokerageId', '')
        
        logger.info(f"✅ New connection created for user {user_id}, authorization: {authorization_id}")
        
        supabase = get_supabase_client()
        
        # Ensure user is registered in snaptrade_users
        user_check = supabase.table('snaptrade_users')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()
        
        if not user_check.data:
            logger.warning(f"User {user_id} not found in snaptrade_users - may have been registered externally")
        
        # Store connection in database
        connection_data = {
            'user_id': user_id,
            'authorization_id': authorization_id,
            'brokerage_slug': brokerage_id,
            'brokerage_name': brokerage_id,  # Will be updated when we sync accounts
            'connection_type': 'trade',
            'status': 'active'
        }
        
        supabase.table('snaptrade_brokerage_connections')\
            .insert(connection_data)\
            .execute()
        
        # Fetch and store accounts for this connection
        await sync_connection_accounts(user_id, authorization_id)
        
        logger.info(f"✅ Stored connection and accounts for authorization {authorization_id}")
        
        # CRITICAL: Update user_onboarding to mark brokerage connection as complete
        # This allows the frontend to recognize the user has completed onboarding
        from datetime import datetime, timezone
        try:
            # Check if user_onboarding record exists
            onboarding_check = supabase.table('user_onboarding')\
                .select('*')\
                .eq('user_id', user_id)\
                .execute()
            
            if onboarding_check.data:
                # Update existing record
                supabase.table('user_onboarding')\
                    .update({
                        'status': 'submitted',  # Mark as submitted/completed
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    })\
                    .eq('user_id', user_id)\
                    .execute()
                logger.info(f"✅ Updated user_onboarding status to 'submitted' for user {user_id}")
            else:
                # Create new record if it doesn't exist
                supabase.table('user_onboarding')\
                    .insert({
                        'user_id': user_id,
                        'status': 'submitted',
                        'created_at': datetime.now(timezone.utc).isoformat(),
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    })\
                    .execute()
                logger.info(f"✅ Created user_onboarding record with status 'submitted' for user {user_id}")
        except Exception as onboarding_error:
            logger.error(f"Failed to update user_onboarding for user {user_id}: {onboarding_error}")
        
    except Exception as e:
        logger.error(f"Error handling CONNECTION.CREATED: {e}", exc_info=True)


async def handle_connection_broken(payload: Dict):
    """Handle CONNECTION.BROKEN webhook."""
    try:
        authorization_id = payload.get('authorizationId')
        reason = payload.get('reason', 'Connection broken')
        
        logger.warning(f"⚠️ Connection broken: {authorization_id} - {reason}")
        
        supabase = get_supabase_client()
        
        # Update connection status
        supabase.table('snaptrade_brokerage_connections')\
            .update({
                'status': 'disabled',
                'disabled_date': datetime.now().isoformat(),
                'error_message': reason
            })\
            .eq('authorization_id', authorization_id)\
            .execute()
        
        # Disable associated accounts
        supabase.table('user_investment_accounts')\
            .update({
                'is_active': False,
                'connection_status': 'error'
            })\
            .eq('snaptrade_authorization_id', authorization_id)\
            .execute()
        
        logger.info(f"✅ Updated connection status to disabled for {authorization_id}")
        
    except Exception as e:
        logger.error(f"Error handling CONNECTION.BROKEN: {e}", exc_info=True)


async def handle_connection_refreshed(payload: Dict):
    """Handle CONNECTION.REFRESHED webhook."""
    try:
        authorization_id = payload.get('authorizationId')
        
        logger.info(f"🔄 Connection refreshed: {authorization_id}")
        
        supabase = get_supabase_client()
        
        # Update last synced timestamp
        supabase.table('snaptrade_brokerage_connections')\
            .update({'last_synced_at': datetime.now().isoformat()})\
            .eq('authorization_id', authorization_id)\
            .execute()
        
    except Exception as e:
        logger.error(f"Error handling CONNECTION.REFRESHED: {e}", exc_info=True)


async def handle_holdings_updated(payload: Dict):
    """Handle ACCOUNT_HOLDINGS_UPDATED webhook."""
    try:
        account_id = payload.get('accountId')
        user_id = payload.get('userId')
        
        logger.info(f"📊 Holdings updated for account: {account_id} (user: {user_id})")
        
        # Trigger background sync for this account
        from utils.portfolio.snaptrade_sync_service import trigger_account_sync
        result = await trigger_account_sync(user_id, f"snaptrade_{account_id}")
        
        if result.get('success'):
            logger.info(f"✅ Successfully synced {result.get('positions_synced', 0)} positions")
        else:
            logger.error(f"❌ Sync failed: {result.get('error')}")
        
    except Exception as e:
        logger.error(f"Error handling ACCOUNT_HOLDINGS_UPDATED: {e}", exc_info=True)


async def handle_transactions_updated(payload: Dict):
    """Handle TRANSACTIONS_UPDATED webhook."""
    try:
        account_id = payload.get('accountId')
        user_id = payload.get('userId')
        
        logger.info(f"💰 Transactions updated for account: {account_id} (user: {user_id})")
        
        # Trigger transaction sync
        # This may trigger portfolio history reconstruction if needed
        
    except Exception as e:
        logger.error(f"Error handling TRANSACTIONS_UPDATED: {e}", exc_info=True)


async def handle_user_deleted(payload: Dict):
    """Handle USER_DELETED webhook."""
    try:
        user_id = payload.get('userId')
        
        logger.info(f"🗑️ User deleted from SnapTrade: {user_id}")
        
        supabase = get_supabase_client()
        
        # Clean up user data
        # Note: CASCADE delete will handle related records
        supabase.table('snaptrade_users')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
        
        logger.info(f"✅ Cleaned up SnapTrade data for user {user_id}")
        
    except Exception as e:
        logger.error(f"Error handling USER_DELETED: {e}", exc_info=True)


async def sync_connection_accounts(user_id: str, authorization_id: str):
    """
    Sync accounts for a newly created connection.
    
    Args:
        user_id: User ID
        authorization_id: SnapTrade authorization ID
    """
    try:
        provider = SnapTradePortfolioProvider()
        supabase = get_supabase_client()
        
        # Get user credentials
        user_creds = supabase.table('snaptrade_users')\
            .select('snaptrade_user_id, snaptrade_user_secret')\
            .eq('user_id', user_id)\
            .execute()
        
        if not user_creds.data:
            logger.error(f"No SnapTrade credentials for user {user_id}")
            return
        
        snaptrade_user_id = user_creds.data[0]['snaptrade_user_id']
        user_secret = user_creds.data[0]['snaptrade_user_secret']
        
        # CRITICAL FIX: Fetch authorization details to get actual connection_type
        actual_connection_type = 'read'  # Default to read-only (safer)
        try:
            auth_detail = provider.client.connections.detail_brokerage_authorization(
                authorization_id=authorization_id,
                user_id=snaptrade_user_id,
                user_secret=user_secret
            )
            if auth_detail.body:
                brokerage_obj = auth_detail.body.get('brokerage', {})
                if isinstance(brokerage_obj, dict):
                    allows_trading = brokerage_obj.get('allows_trading', False)
                    actual_connection_type = 'trade' if allows_trading else 'read'
                    logger.info(f"Brokerage {brokerage_obj.get('name', 'Unknown')} allows_trading={allows_trading}")
        except Exception as auth_detail_error:
            logger.warning(f"Could not fetch authorization details for {authorization_id}: {auth_detail_error}")
        
        # Get all accounts
        accounts_response = provider.client.account_information.list_user_accounts(
            user_id=snaptrade_user_id,
            user_secret=user_secret
        )
        
        # Get connection info
        connection_info = supabase.table('snaptrade_brokerage_connections')\
            .select('*')\
            .eq('authorization_id', authorization_id)\
            .execute()
        
        if not connection_info.data:
            logger.error(f"Connection not found: {authorization_id}")
            return
        
        brokerage_name = connection_info.data[0]['brokerage_name']
        
        # Update connection with actual connection_type
        supabase.table('snaptrade_brokerage_connections')\
            .update({'connection_type': actual_connection_type})\
            .eq('authorization_id', authorization_id)\
            .execute()
        
        # Store each account associated with this authorization
        accounts_stored = 0
        for account in accounts_response.body:
            # Check if this account belongs to this authorization
            if account.get('brokerage_authorization') == authorization_id:
                account_id = str(account['id'])
                
                # PRODUCTION-GRADE: Fetch cash balance and buying power for trade validation
                cash_balance = None
                buying_power = None
                try:
                    balances_response = provider.client.account_information.get_user_account_balance(
                        user_id=snaptrade_user_id,
                        user_secret=user_secret,
                        account_id=account_id
                    )
                    
                    # Extract total cash from all currencies (usually USD)
                    total_cash = 0
                    for balance in balances_response.body:
                        if isinstance(balance, dict) and 'cash' in balance:
                            total_cash += float(balance.get('cash', 0) or 0)
                    
                    cash_balance = total_cash
                    # Buying power is usually cash balance (unless margin account)
                    # SnapTrade doesn't provide separate buying_power field, so use cash
                    buying_power = total_cash
                    logger.debug(f"💰 Account {account_id}: cash=${cash_balance:.2f}, buying_power=${buying_power:.2f}")
                except Exception as balance_error:
                    logger.warning(f"⚠️  Could not fetch balance for account {account_id}: {balance_error}")
                    # Continue without balance data (will be synced later)
                
                account_data = {
                    'user_id': user_id,
                    'provider': 'snaptrade',
                    'provider_account_id': account_id,
                    'snaptrade_authorization_id': authorization_id,
                    'institution_name': brokerage_name,
                    'brokerage_name': brokerage_name,
                    'account_name': account.get('name', 'Investment Account'),
                    'account_type': account.get('type', 'investment'),
                    'account_subtype': account.get('type', 'investment'),
                    'account_mode': 'snaptrade',
                    'connection_type': actual_connection_type,  # CRITICAL: Use actual capability
                    'connection_status': 'active',
                    'is_active': True,
                    'sync_status': 'success',
                    'last_synced': datetime.now().isoformat(),
                    'cash_balance': cash_balance,
                    'buying_power': buying_power
                }
                
                # Use upsert to handle duplicates
                supabase.table('user_investment_accounts')\
                    .upsert(account_data, on_conflict='provider,provider_account_id,user_id')\
                    .execute()
                
                accounts_stored += 1
        
        # Update connection accounts count
        supabase.table('snaptrade_brokerage_connections')\
            .update({'accounts_count': accounts_stored})\
            .eq('authorization_id', authorization_id)\
            .execute()
        
        logger.info(f"✅ Synced {accounts_stored} accounts for authorization {authorization_id} (connection_type={actual_connection_type})")
        
    except Exception as e:
        logger.error(f"Error syncing connection accounts: {e}", exc_info=True)


@router.post("/reconstruct-history")
async def reconstruct_portfolio_history(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Reconstruct portfolio history from SnapTrade transaction data.
    
    This endpoint:
    1. Fetches all historical transactions from SnapTrade
    2. Replays transactions chronologically
    3. Fetches historical EOD prices (cached for efficiency)
    4. Generates daily portfolio snapshots
    5. Stores snapshots in user_portfolio_history table
    
    This allows users to see their full portfolio history from account inception,
    not just from the date they connected to Clera.
    
    Returns:
        {
            "success": True,
            "accounts_processed": int,
            "total_transactions": int,
            "total_snapshots": int,
            "processing_duration_seconds": float,
            "earliest_date": str,
            "latest_date": str
        }
    """
    try:
        logger.info(f"🚀 Starting portfolio history reconstruction for user {user_id}")
        
        from services.snaptrade_portfolio_reconstruction_service import get_reconstruction_service
        service = get_reconstruction_service()
        
        result = await service.reconstruct_user_portfolio_history(user_id)
        
        if result['success']:
            logger.info(f"✅ Reconstruction complete: {result['total_snapshots']} snapshots created")
        else:
            logger.error(f"❌ Reconstruction failed: {result.get('error')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in reconstruction endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Reconstruction failed: {str(e)}")


@router.post("/estimate-history")
async def estimate_portfolio_history(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    SMART WORKAROUND: Generate estimated portfolio history from current holdings.
    
    Since SnapTrade transactions take 24 hours to sync on first connection,
    this endpoint provides immediate historical visualization by:
    
    1. Using current holdings (available immediately)
    2. Fetching historical prices for those holdings (1 year back)
    3. Assuming constant position sizes (conservative estimate)
    4. Generating daily portfolio value snapshots
    
    These 'estimated' snapshots give users immediate visual feedback
    and will be replaced by actual reconstructed data once SnapTrade
    syncs the full transaction history.
    
    Returns:
        {
            "success": True,
            "snapshots_created": int,
            "holdings_count": int,
            "start_date": str,
            "end_date": str,
            "is_estimated": True
        }
    """
    try:
        logger.info(f"📊 Generating estimated history for user {user_id}")
        
        from services.snaptrade_holdings_based_history import get_estimator_service
        service = get_estimator_service()
        
        # Generate 1 year of estimated history
        result = await service.generate_estimated_history(user_id, lookback_days=365)
        
        if result['success']:
            logger.info(f"✅ Estimated history complete: {result['snapshots_created']} snapshots")
        else:
            logger.error(f"❌ Estimation failed: {result.get('error')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in estimate-history endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Estimation failed: {str(e)}")


@router.post("/fetch-reporting-history")
async def fetch_reporting_history(
    user_id: str = Depends(get_authenticated_user_id),
    lookback_days: int = 365
):
    """
    PRODUCTION-GRADE: Fetch portfolio history using SnapTrade's native reporting API.
    
    This is SUPERIOR to manual reconstruction or estimation because:
    - Uses SnapTrade's pre-calculated portfolio values (totalEquityTimeframe)
    - Includes deposits, withdrawals, dividends, and fees automatically
    - More reliable and accurate than reconstructing from transactions
    - No need to fetch historical prices
    - Shows accurate "jumps" when users deposit/withdraw cash
    
    Args:
        lookback_days: Number of days of history to fetch (max 365)
    
    Returns:
        {
            "success": True,
            "snapshots_created": int,
            "date_range": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}
        }
    """
    try:
        logger.info(f"📊 Fetching SnapTrade reporting history for user {user_id} ({lookback_days} days)")
        
        from services.snaptrade_reporting_service import get_snaptrade_reporting_service
        service = get_snaptrade_reporting_service()
        
        result = await service.fetch_portfolio_history(user_id, lookback_days)
        
        if result['success']:
            logger.info(f"✅ Reporting history complete: {result['snapshots_created']} snapshots")
        else:
            logger.error(f"❌ Reporting fetch failed: {result.get('error')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in fetch-reporting-history endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Reporting fetch failed: {str(e)}")


@router.post("/capture-daily-snapshot")
async def capture_daily_snapshot(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    Manually capture a daily EOD snapshot for this user.
    
    This is useful for:
    - Testing the snapshot functionality
    - Manually triggering snapshot creation
    - Backfilling missing days
    
    Returns:
        {
            "success": True,
            "message": "Snapshot created"
        }
    """
    try:
        logger.info(f"📸 Manually capturing snapshot for user {user_id}")
        
        from services.daily_snaptrade_snapshot import get_daily_snapshot_service
        service = get_daily_snapshot_service()
        
        success = await service._capture_user_snapshot(user_id)
        
        if success:
            return {"success": True, "message": "Snapshot created"}
        else:
            return {"success": False, "message": "Snapshot already exists or no holdings found"}
        
    except Exception as e:
        logger.error(f"Error capturing snapshot: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Snapshot capture failed: {str(e)}")


@router.delete("/disconnect-account/{account_id}")
async def disconnect_account(
    account_id: str,
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    PRODUCTION-GRADE: Disconnect a brokerage account.
    
    This endpoint allows users to:
    - Remove a brokerage connection they no longer want
    - Fix broken connections by disconnecting and reconnecting
    - Switch to a different brokerage
    
    What this does:
    1. Deletes the user's holdings for this account
    2. Marks the account as inactive in our database
    3. Optionally removes the connection from SnapTrade (if remove_from_snaptrade=true)
    
    Args:
        account_id: The account ID (provider_account_id from user_investment_accounts)
    
    Returns:
        {
            "success": True,
            "message": "Account disconnected successfully",
            "account_id": str
        }
    """
    try:
        logger.info(f"🔌 Disconnecting account {account_id} for user {user_id}")
        
        supabase = get_supabase_client()
        
        # Step 1: Verify user owns this account
        account_check = supabase.table('user_investment_accounts')\
            .select('id, provider_account_id, institution_name, snaptrade_authorization_id')\
            .eq('user_id', user_id)\
            .eq('provider_account_id', account_id)\
            .eq('provider', 'snaptrade')\
            .execute()
        
        if not account_check.data:
            raise HTTPException(status_code=404, detail="Account not found or you don't have permission to disconnect it")
        
        account = account_check.data[0]
        institution_name = account.get('institution_name', 'Unknown')
        authorization_id = account.get('snaptrade_authorization_id')
        
        # Step 2: Delete holdings for this account
        holdings_result = supabase.table('user_aggregated_holdings')\
            .delete()\
            .eq('user_id', user_id)\
            .eq('account_id', account['id'])\
            .execute()
        
        holdings_deleted = len(holdings_result.data) if holdings_result.data else 0
        logger.info(f"Deleted {holdings_deleted} holdings for account {account_id}")
        
        # Step 3: Mark account as inactive (soft delete)
        supabase.table('user_investment_accounts')\
            .update({
                'is_active': False,
                'connection_status': 'disconnected',
                'sync_status': 'disabled'
            })\
            .eq('id', account['id'])\
            .execute()
        
        # Step 4: Check if this was the last account for this authorization
        # If so, we should also clean up the brokerage connection
        remaining_accounts = supabase.table('user_investment_accounts')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('snaptrade_authorization_id', authorization_id)\
            .eq('is_active', True)\
            .execute()
        
        if not remaining_accounts.data or len(remaining_accounts.data) == 0:
            # No more active accounts for this authorization, mark connection as inactive
            if authorization_id:
                supabase.table('snaptrade_brokerage_connections')\
                    .update({'status': 'disconnected'})\
                    .eq('authorization_id', authorization_id)\
                    .execute()
                logger.info(f"Marked brokerage connection {authorization_id} as disconnected")
        
        logger.info(f"✅ Successfully disconnected {institution_name} account {account_id}")
        
        return {
            "success": True,
            "message": f"Successfully disconnected {institution_name} account",
            "account_id": account_id,
            "holdings_deleted": holdings_deleted
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting account: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to disconnect account: {str(e)}")


@router.delete("/disconnect-all")
async def disconnect_all_accounts(
    user_id: str = Depends(get_authenticated_user_id)
):
    """
    PRODUCTION-GRADE: Disconnect ALL brokerage accounts and reset SnapTrade connection.
    
    This is a nuclear option for:
    - Switching from sandbox to production API keys
    - Complete account reset
    - User wants to start fresh
    
    What this does:
    1. Deletes all user holdings
    2. Deletes all user investment accounts (SnapTrade)
    3. Deletes SnapTrade user credentials
    4. Resets user_onboarding status
    
    After this, the user will need to reconnect their brokerage accounts.
    
    Returns:
        {
            "success": True,
            "message": "All accounts disconnected",
            "accounts_removed": int,
            "holdings_removed": int
        }
    """
    try:
        logger.info(f"🔌 Disconnecting ALL accounts for user {user_id}")
        
        supabase = get_supabase_client()
        
        # Step 1: Delete all holdings
        holdings_result = supabase.table('user_aggregated_holdings')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
        
        holdings_removed = len(holdings_result.data) if holdings_result.data else 0
        
        # Step 2: Delete all SnapTrade investment accounts
        accounts_result = supabase.table('user_investment_accounts')\
            .delete()\
            .eq('user_id', user_id)\
            .eq('provider', 'snaptrade')\
            .execute()
        
        accounts_removed = len(accounts_result.data) if accounts_result.data else 0
        
        # Step 3: Delete SnapTrade user credentials
        supabase.table('snaptrade_users')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
        
        # Step 4: Delete brokerage connections
        supabase.table('snaptrade_brokerage_connections')\
            .delete()\
            .eq('user_id', user_id)\
            .execute()
        
        # Step 5: Reset onboarding status so user can reconnect
        supabase.table('user_onboarding')\
            .update({'status': 'pending'})\
            .eq('user_id', user_id)\
            .execute()
        
        logger.info(f"✅ Disconnected all accounts: {accounts_removed} accounts, {holdings_removed} holdings")
        
        return {
            "success": True,
            "message": "All SnapTrade accounts disconnected. You can now reconnect with fresh credentials.",
            "accounts_removed": accounts_removed,
            "holdings_removed": holdings_removed
        }
        
    except Exception as e:
        logger.error(f"Error disconnecting all accounts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to disconnect accounts: {str(e)}")

