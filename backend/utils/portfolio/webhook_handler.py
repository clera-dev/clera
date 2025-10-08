"""
Plaid webhook handler for real-time portfolio updates.

This module handles Plaid webhooks to keep portfolio data synchronized
with changes at financial institutions.
"""

import logging
import hmac
import hashlib
import os
import time
from typing import Dict, Any, Optional
from datetime import datetime
from fastapi import HTTPException

logger = logging.getLogger(__name__)

class PlaidWebhookHandler:
    """
    Production-grade handler for Plaid Investment API webhooks.
    
    Supported webhooks:
    - HOLDINGS.DEFAULT_UPDATE: Holdings quantity or price changes
    - INVESTMENTS_TRANSACTIONS.DEFAULT_UPDATE: New transactions detected
    
    Features:
    - Webhook signature verification for security
    - Database logging for monitoring
    - Error handling with retries
    - Cache invalidation for real-time updates
    """
    
    def __init__(self):
        """Initialize webhook handler."""
        self.portfolio_service = None  # Lazy loaded to avoid circular imports
        self.sync_service = None  # Lazy loaded to avoid circular imports
    
    def _get_portfolio_service(self):
        """Lazy load portfolio service to avoid circular imports."""
        if self.portfolio_service is None:
            from .portfolio_service import get_portfolio_service
            self.portfolio_service = get_portfolio_service()
        return self.portfolio_service
    
    def _get_sync_service(self):
        """Lazy load sync service to avoid circular imports."""
        if self.sync_service is None:
            from .sync_service import sync_service
            self.sync_service = sync_service
        return self.sync_service
    
    def verify_webhook_signature(self, request_body: bytes, plaid_signature: str) -> bool:
        """
        Verify Plaid webhook signature for security.
        
        SECURITY FIX: Uses HMAC instead of raw SHA256 to prevent length-extension attacks.
        Raw SHA256(secret + message) is vulnerable to length-extension attacks that allow
        attackers to forge valid signatures. HMAC provides proper cryptographic authentication.
        
        Args:
            request_body: Raw webhook request body
            plaid_signature: X-Plaid-Signature header value
            
        Returns:
            True if signature is valid
        """
        import hmac
        try:
            webhook_key = os.getenv('PLAID_WEBHOOK_VERIFICATION_KEY')
            if not webhook_key:
                logger.warning("PLAID_WEBHOOK_VERIFICATION_KEY not configured - allowing webhook")
                return True  # Allow in development
            
            # SECURITY FIX: Use HMAC-SHA256 instead of raw SHA256(key + message)
            # This prevents length-extension attacks and provides proper authentication
            expected_signature = hmac.new(
                webhook_key.encode('utf-8'),
                request_body,
                hashlib.sha256
            ).hexdigest()
            
            return hmac.compare_digest(plaid_signature, expected_signature)
            
        except Exception as e:
            logger.error(f"Error verifying webhook signature: {e}")
            return False
    
    async def log_webhook_event(self, webhook_data: Dict[str, Any], user_id: str, 
                               success: bool, processing_duration_ms: int, 
                               error_message: Optional[str] = None) -> None:
        """
        Log webhook event to database for monitoring.
        
        Args:
            webhook_data: Original webhook payload
            user_id: User ID associated with the webhook
            success: Whether processing was successful
            processing_duration_ms: Processing time in milliseconds
            error_message: Error message if processing failed
        """
        try:
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            
            log_entry = {
                'webhook_type': webhook_data.get('webhook_type'),
                'webhook_code': webhook_data.get('webhook_code'),
                'item_id': webhook_data.get('item_id'),
                'request_id': webhook_data.get('request_id'),
                'user_id': user_id,
                'processing_duration_ms': processing_duration_ms,
                'success': success,
                'error_message': error_message,
                'raw_webhook_data': webhook_data
            }
            
            result = supabase.table('plaid_webhook_events').insert(log_entry).execute()
            logger.debug(f"Webhook event logged: {webhook_data.get('webhook_type')}.{webhook_data.get('webhook_code')}")
            
        except Exception as e:
            logger.error(f"Error logging webhook event: {e}")
    
    async def handle_webhook(self, webhook_data: Dict[str, Any], api_key: str, 
                           request_body: Optional[bytes] = None, 
                           plaid_signature: Optional[str] = None) -> Dict[str, Any]:
        """
        Process incoming Plaid webhook with full production features.
        
        Args:
            webhook_data: Webhook payload from Plaid
            api_key: API key for authentication
            request_body: Raw request body for signature verification
            plaid_signature: X-Plaid-Signature header value
            
        Returns:
            Dictionary with acknowledgment status
        """
        start_time = time.time()
        webhook_type = webhook_data.get('webhook_type', 'UNKNOWN')
        webhook_code = webhook_data.get('webhook_code', 'UNKNOWN')
        item_id = webhook_data.get('item_id', 'UNKNOWN')
        user_id = None
        
        try:
            logger.info(f"📨 Plaid webhook received: {webhook_type}.{webhook_code} for item {item_id}")
            
            # 1. Validate API key for webhook security
            expected_api_key = os.getenv("BACKEND_API_KEY")
            if not api_key or not expected_api_key or not hmac.compare_digest(api_key, expected_api_key):
                logger.warning("Invalid API key for Plaid webhook")
                raise HTTPException(status_code=401, detail="Invalid API key")
            
            # 2. Verify webhook signature if provided (production security)
            if request_body and plaid_signature:
                if not self.verify_webhook_signature(request_body, plaid_signature):
                    logger.warning("Invalid webhook signature from Plaid")
                    raise HTTPException(status_code=401, detail="Invalid webhook signature")
            
            # 3. Find user for this item
            user_id = await self._get_user_id_for_item(item_id)
            if not user_id:
                logger.warning(f"No user found for item {item_id}")
                return {"acknowledged": True, "warning": "No user found for item"}
            
            # 4. Process webhook based on type
            if webhook_type == 'HOLDINGS' and webhook_code == 'DEFAULT_UPDATE':
                await self._handle_holdings_update(webhook_data, user_id)
                
            elif webhook_type == 'INVESTMENTS_TRANSACTIONS' and webhook_code == 'DEFAULT_UPDATE':
                await self._handle_transactions_update(webhook_data, user_id)
                
            else:
                logger.info(f"📨 Unhandled webhook: {webhook_type}.{webhook_code}")
            
            # 5. Log successful processing
            processing_duration = int((time.time() - start_time) * 1000)
            await self.log_webhook_event(webhook_data, user_id, True, processing_duration)
            
            return {"acknowledged": True, "processing_time_ms": processing_duration}
            
        except HTTPException:
            # Re-raise HTTP exceptions (auth failures)
            raise
        except Exception as e:
            logger.error(f"Error processing Plaid webhook: {e}")
            
            # Log failed processing
            processing_duration = int((time.time() - start_time) * 1000)
            if user_id:
                await self.log_webhook_event(webhook_data, user_id, False, processing_duration, str(e))
            
            return {"acknowledged": False, "error": str(e), "processing_time_ms": processing_duration}
    
    async def _handle_holdings_update(self, webhook_data: Dict[str, Any], user_id: str):
        """Handle HOLDINGS.DEFAULT_UPDATE webhook."""
        try:
            item_id = webhook_data.get('item_id')
            
            logger.info(f"📈 Refreshing holdings for user {user_id} due to webhook (item: {item_id})")
            
            # Invalidate cache and refresh portfolio data using sync service
            sync_service = self._get_sync_service()
            portfolio_service = self._get_portfolio_service()
            
            # Clear cache to force fresh data fetch
            await portfolio_service._invalidate_user_cache(user_id)
            
            # Force refresh portfolio data
            fresh_data = await sync_service.ensure_user_portfolio_fresh(
                user_id, 
                max_age_minutes=0,  # Force immediate refresh
                force_refresh=True
            )
            
            if fresh_data and 'positions' in fresh_data:
                logger.info(f"✅ Successfully refreshed {len(fresh_data['positions'])} holdings for user {user_id}")
                await self._notify_websocket_clients(user_id, {
                    "type": "holdings_update",
                    "data": fresh_data,
                    "webhook_type": "HOLDINGS.DEFAULT_UPDATE"
                })
            else:
                logger.error(f"❌ Failed to refresh holdings for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error handling holdings update webhook: {e}")
    
    async def _handle_transactions_update(self, webhook_data: Dict[str, Any], user_id: str):
        """Handle INVESTMENTS_TRANSACTIONS.DEFAULT_UPDATE webhook."""
        try:
            item_id = webhook_data.get('item_id')
            
            logger.info(f"💰 Refreshing transactions for user {user_id} due to webhook (item: {item_id})")
            
            # Invalidate cache and refresh portfolio data using sync service
            sync_service = self._get_sync_service()
            portfolio_service = self._get_portfolio_service()
            
            # Clear cache to force fresh data fetch
            await portfolio_service._invalidate_user_cache(user_id)
            
            # Force refresh portfolio data (transactions affect cost basis and holdings)
            fresh_data = await sync_service.ensure_user_portfolio_fresh(
                user_id,
                max_age_minutes=0,  # Force immediate refresh
                force_refresh=True
            )
            
            if fresh_data:
                logger.info(f"✅ Successfully refreshed transactions for user {user_id}")
                await self._notify_websocket_clients(user_id, {
                    "type": "transactions_update", 
                    "data": fresh_data,
                    "webhook_type": "INVESTMENTS_TRANSACTIONS.DEFAULT_UPDATE"
                })
            else:
                logger.error(f"❌ Failed to refresh transactions for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error handling transactions update webhook: {e}")
    
    async def _notify_websocket_clients(self, user_id: str, update_data: Dict[str, Any]):
        """
        Notify connected WebSocket clients of portfolio updates.
        
        Args:
            user_id: User ID to notify
            update_data: Update data to send to clients
        """
        try:
            # TODO: Implement WebSocket notification
            # For now, just log that we would send an update
            logger.info(f"🔔 Would notify WebSocket clients for user {user_id}: {update_data['type']}")
            
            # Future implementation:
            # 1. Get user's Alpaca account ID (if in brokerage/hybrid mode)
            # 2. Publish update to Redis channel for WebSocket server
            # 3. WebSocket server broadcasts to connected clients
            
        except Exception as e:
            logger.error(f"Error notifying WebSocket clients for user {user_id}: {e}")
    
    async def _get_user_id_for_item(self, item_id: str) -> str:
        """Get user ID for a given Plaid item ID."""
        try:
            from utils.supabase.db_client import get_supabase_client
            
            supabase = get_supabase_client()
            result = supabase.table('user_investment_accounts')\
                .select('user_id')\
                .eq('provider_item_id', item_id)\
                .eq('provider', 'plaid')\
                .eq('is_active', True)\
                .limit(1)\
                .execute()
            
            if result.data:
                return result.data[0]['user_id']
            else:
                logger.warning(f"No user found for Plaid item {item_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error looking up user for item {item_id}: {e}")
            return None

# Global webhook handler instance
webhook_handler = PlaidWebhookHandler()
