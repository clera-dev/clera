"""
SnapTrade Webhook Security

Handles webhook signature verification to ensure webhooks are genuinely from SnapTrade.
"""

import hmac
import hashlib
import logging
import os
from typing import Dict, Any

logger = logging.getLogger(__name__)


def verify_webhook_signature(payload: Dict[str, Any], signature: str) -> bool:
    """
    Verify SnapTrade webhook signature.
    
    Args:
        payload: The webhook payload as a dictionary
        signature: The x-snaptrade-signature header value
        
    Returns:
        True if signature is valid, False otherwise
    """
    try:
        # Get webhook secret from environment
        webhook_secret = os.getenv('SNAPTRADE_WEBHOOK_SECRET')
        
        if not webhook_secret:
            logger.warning("⚠️ SNAPTRADE_WEBHOOK_SECRET not set - skipping signature verification")
            return True  # Allow in dev, but log warning
        
        # Convert payload to JSON string (SnapTrade sends it as JSON)
        import json
        payload_string = json.dumps(payload, separators=(',', ':'), sort_keys=True)
        
        # Compute HMAC SHA256
        expected_signature = hmac.new(
            webhook_secret.encode('utf-8'),
            payload_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        # Compare signatures (constant time comparison)
        is_valid = hmac.compare_digest(expected_signature, signature)
        
        if not is_valid:
            logger.error(f"❌ Invalid webhook signature! Expected: {expected_signature[:10]}..., Got: {signature[:10] if signature else 'None'}...")
        
        return is_valid
        
    except Exception as e:
        logger.error(f"Error verifying webhook signature: {e}", exc_info=True)
        return False


def get_webhook_user_id(payload: Dict[str, Any]) -> str:
    """
    Extract user ID from webhook payload.
    
    SnapTrade webhooks include the user ID in different fields depending on the event type.
    
    Args:
        payload: Webhook payload
        
    Returns:
        User ID string, or raises ValueError if not found
    """
    user_id = payload.get('userId') or payload.get('user_id')
    
    if not user_id:
        raise ValueError("No user ID found in webhook payload")
    
    return user_id


def validate_webhook_payload(payload: Dict[str, Any]) -> bool:
    """
    Validate webhook payload structure.
    
    Ensures required fields are present.
    
    Args:
        payload: Webhook payload
        
    Returns:
        True if valid, False otherwise
    """
    try:
        # All webhooks must have a type
        if 'type' not in payload:
            logger.error("Webhook payload missing 'type' field")
            return False
        
        event_type = payload['type']
        
        # Validate based on event type
        if event_type in ['CONNECTION.CREATED', 'CONNECTION.BROKEN', 'CONNECTION.REFRESHED']:
            required_fields = ['userId', 'authorizationId']
        elif event_type in ['ACCOUNT_HOLDINGS_UPDATED', 'TRANSACTIONS_UPDATED']:
            required_fields = ['userId', 'accountId']
        elif event_type == 'USER_DELETED':
            required_fields = ['userId']
        else:
            logger.warning(f"Unknown event type: {event_type}")
            return True  # Allow unknown types for forward compatibility
        
        # Check required fields
        for field in required_fields:
            if field not in payload:
                logger.error(f"Webhook payload missing required field: {field}")
                return False
        
        return True
        
    except Exception as e:
        logger.error(f"Error validating webhook payload: {e}", exc_info=True)
        return False

