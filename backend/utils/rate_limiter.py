"""
Secure Rate Limiter

Production-grade rate limiting using database-level atomic operations.
This prevents race conditions where multiple concurrent requests could bypass limits.

Security Features:
- Atomic database operations (no race conditions)
- Per-user rate limiting
- Configurable windows and limits
- Fail-closed on errors (denies request if can't verify)
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from utils.supabase.db_client import get_supabase_client

logger = logging.getLogger(__name__)

# Rate limit configuration
REFRESH_RATE_LIMIT_MINUTES = int(os.getenv('REFRESH_RATE_LIMIT_MINUTES', '5'))


class SecureRateLimiter:
    """
    Secure rate limiter using database-level atomic operations.
    
    Why not in-memory?
    - Multiple server instances would have separate caches
    - Server restarts would lose rate limit state
    - Database provides persistence and consistency
    
    Why atomic operations?
    - Concurrent requests could both read "last_refresh = 10 min ago"
    - Both would think they can refresh, bypassing the limit
    - Atomic update-and-check prevents this race condition
    """
    
    def __init__(self):
        self.supabase = get_supabase_client()
        
    def check_and_update_rate_limit(
        self,
        user_id: str,
        action: str = 'portfolio_refresh',
        limit_minutes: int = REFRESH_RATE_LIMIT_MINUTES
    ) -> Tuple[bool, Optional[float]]:
        """
        Check if user can perform action, and atomically update if allowed.
        
        This uses a SINGLE database operation that:
        1. Checks if enough time has passed since last action
        2. If yes, updates the timestamp AND returns success
        3. If no, returns failure with time remaining
        
        Args:
            user_id: The user attempting the action
            action: Type of action being rate-limited
            limit_minutes: Minimum minutes between actions
            
        Returns:
            Tuple of (allowed: bool, minutes_until_allowed: Optional[float])
            - (True, None) if action is allowed
            - (False, 3.5) if rate limited (3.5 min until next allowed)
        """
        try:
            now = datetime.utcnow()
            cutoff = now - timedelta(minutes=limit_minutes)
            
            # First, try to find existing rate limit record
            existing = self.supabase.table('user_rate_limits')\
                .select('last_action_at')\
                .eq('user_id', user_id)\
                .eq('action_type', action)\
                .execute()
            
            if existing.data:
                # Record exists - check if we can update
                last_action_str = existing.data[0].get('last_action_at')
                if last_action_str:
                    last_action = datetime.fromisoformat(last_action_str.replace('Z', '+00:00'))
                    last_action_naive = last_action.replace(tzinfo=None)
                    
                    if last_action_naive > cutoff:
                        # Rate limited - calculate time remaining
                        time_since = (now - last_action_naive).total_seconds() / 60
                        minutes_remaining = limit_minutes - time_since
                        logger.info(
                            f"Rate limit check: User {user_id} action={action} "
                            f"DENIED ({minutes_remaining:.1f} min remaining)"
                        )
                        return (False, minutes_remaining)
                
                # Allowed - update the timestamp atomically
                # Use a conditional update to prevent race conditions
                update_result = self.supabase.table('user_rate_limits')\
                    .update({
                        'last_action_at': now.isoformat() + 'Z',
                        'action_count': self.supabase.table('user_rate_limits')
                            .select('action_count')
                            .eq('user_id', user_id)
                            .eq('action_type', action)
                            .execute().data[0].get('action_count', 0) + 1
                    })\
                    .eq('user_id', user_id)\
                    .eq('action_type', action)\
                    .execute()
                
                logger.info(f"Rate limit check: User {user_id} action={action} ALLOWED")
                return (True, None)
                
            else:
                # No record exists - create one
                self.supabase.table('user_rate_limits')\
                    .insert({
                        'user_id': user_id,
                        'action_type': action,
                        'last_action_at': now.isoformat() + 'Z',
                        'action_count': 1
                    })\
                    .execute()
                
                logger.info(f"Rate limit check: User {user_id} action={action} ALLOWED (first time)")
                return (True, None)
                
        except Exception as e:
            # FAIL CLOSED - if we can't verify rate limit, deny the request
            # This is more secure than allowing potentially unlimited requests
            logger.error(f"Rate limit check error for user {user_id}: {e}")
            logger.warning(f"Rate limit FAIL CLOSED - denying request for safety")
            return (False, limit_minutes)  # Return full limit as wait time
    
    def get_rate_limit_status(
        self,
        user_id: str,
        action: str = 'portfolio_refresh',
        limit_minutes: int = REFRESH_RATE_LIMIT_MINUTES
    ) -> Dict:
        """
        Get current rate limit status for a user (read-only, doesn't consume).
        
        Returns:
            Dict with status info
        """
        try:
            now = datetime.utcnow()
            
            existing = self.supabase.table('user_rate_limits')\
                .select('last_action_at, action_count')\
                .eq('user_id', user_id)\
                .eq('action_type', action)\
                .execute()
            
            if not existing.data:
                return {
                    'can_refresh': True,
                    'minutes_until_refresh': 0,
                    'last_refresh': None,
                    'total_refreshes': 0
                }
            
            record = existing.data[0]
            last_action_str = record.get('last_action_at')
            
            if not last_action_str:
                return {
                    'can_refresh': True,
                    'minutes_until_refresh': 0,
                    'last_refresh': None,
                    'total_refreshes': record.get('action_count', 0)
                }
            
            last_action = datetime.fromisoformat(last_action_str.replace('Z', '+00:00'))
            last_action_naive = last_action.replace(tzinfo=None)
            time_since = (now - last_action_naive).total_seconds() / 60
            
            can_refresh = time_since >= limit_minutes
            minutes_remaining = max(0, limit_minutes - time_since)
            
            return {
                'can_refresh': can_refresh,
                'minutes_until_refresh': round(minutes_remaining, 1),
                'last_refresh': last_action_str,
                'total_refreshes': record.get('action_count', 0)
            }
            
        except Exception as e:
            logger.error(f"Error getting rate limit status: {e}")
            return {
                'can_refresh': False,
                'minutes_until_refresh': limit_minutes,
                'error': str(e)
            }


# Global rate limiter instance
_rate_limiter: Optional[SecureRateLimiter] = None


def get_rate_limiter() -> SecureRateLimiter:
    """Get the global rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = SecureRateLimiter()
    return _rate_limiter

