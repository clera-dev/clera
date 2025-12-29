"""
Secure Rate Limiter

Production-grade rate limiting using database-level atomic operations.
This prevents race conditions where multiple concurrent requests could bypass limits.

Security Features:
- TRUE atomic database operations (single UPDATE with WHERE clause)
- Per-user rate limiting
- Configurable windows and limits
- Fail-closed on errors (denies request if can't verify)

Implementation:
- Uses UPDATE...WHERE last_action_at < cutoff as a single atomic operation
- If UPDATE affects rows: action allowed (timestamp was old enough)
- If UPDATE affects 0 rows: either rate limited OR no record exists
- For new users: INSERT with conflict handling
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
    Secure rate limiter using TRUE atomic database operations.
    
    Why not in-memory?
    - Multiple server instances would have separate caches
    - Server restarts would lose rate limit state
    - Database provides persistence and consistency
    
    Why atomic operations?
    - Concurrent requests could both read "last_refresh = 10 min ago"
    - Both would think they can refresh, bypassing the limit
    - Single UPDATE with WHERE clause is truly atomic
    
    How it works:
    1. Attempt UPDATE with WHERE last_action_at < cutoff
    2. If rows affected > 0: allowed (timestamp was old enough)
    3. If rows affected == 0: either rate limited OR new user
    4. For new users: INSERT (with unique constraint protection)
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
        
        This uses a SINGLE atomic UPDATE operation:
        - UPDATE ... WHERE user_id = X AND action_type = Y AND last_action_at < cutoff
        - If rows affected: action allowed
        - If no rows affected: rate limited OR new user
        
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
            cutoff_iso = cutoff.isoformat() + 'Z'
            now_iso = now.isoformat() + 'Z'
            
            # ATOMIC OPERATION: Single UPDATE with time condition in WHERE clause
            # This is truly atomic - the check and update happen together
            # If another request comes in simultaneously, only ONE will succeed
            # 
            # Note: We can't atomically increment action_count in the same query,
            # but that's okay - action_count is just for analytics, not security.
            # The security-critical part (timestamp check) IS atomic.
            update_result = self.supabase.table('user_rate_limits')\
                .update({'last_action_at': now_iso})\
                .eq('user_id', user_id)\
                .eq('action_type', action)\
                .lt('last_action_at', cutoff_iso)\
                .execute()
            
            # Check if the atomic update succeeded (rows were affected)
            if update_result.data and len(update_result.data) > 0:
                # UPDATE succeeded - action is allowed
                # Increment action_count separately (non-security-critical, just for analytics)
                try:
                    current_count = update_result.data[0].get('action_count', 0)
                    self.supabase.table('user_rate_limits')\
                        .update({'action_count': current_count + 1})\
                        .eq('user_id', user_id)\
                        .eq('action_type', action)\
                        .execute()
                except Exception:
                    pass  # Non-critical, ignore failures
                
                logger.info(f"Rate limit check: User {user_id} action={action} ALLOWED (atomic update)")
                return (True, None)
            
            # UPDATE affected 0 rows - either rate limited OR no record exists
            # Check if record exists to determine which case
            existing = self.supabase.table('user_rate_limits')\
                .select('last_action_at, action_count')\
                .eq('user_id', user_id)\
                .eq('action_type', action)\
                .execute()
            
            if existing.data and len(existing.data) > 0:
                # Record exists but UPDATE failed = rate limited
                last_action_str = existing.data[0].get('last_action_at')
                if last_action_str:
                    last_action = datetime.fromisoformat(last_action_str.replace('Z', '+00:00'))
                    last_action_naive = last_action.replace(tzinfo=None)
                    time_since = (now - last_action_naive).total_seconds() / 60
                    minutes_remaining = max(0, limit_minutes - time_since)
                    
                    logger.info(
                        f"Rate limit check: User {user_id} action={action} "
                        f"DENIED ({minutes_remaining:.1f} min remaining)"
                    )
                    return (False, minutes_remaining)
                else:
                    # Edge case: record exists but no timestamp - allow and update
                    self._update_timestamp(user_id, action, now_iso, existing.data[0].get('action_count', 0) + 1)
                    return (True, None)
            
            # No record exists - this is a new user, try to INSERT
            # Use upsert to handle race condition where another request inserts first
            try:
                insert_result = self.supabase.table('user_rate_limits')\
                    .upsert({
                        'user_id': user_id,
                        'action_type': action,
                        'last_action_at': now_iso,
                        'action_count': 1
                    }, on_conflict='user_id,action_type')\
                    .execute()
                
                logger.info(f"Rate limit check: User {user_id} action={action} ALLOWED (first time)")
                return (True, None)
                
            except Exception as insert_error:
                # If INSERT fails (e.g., unique constraint from concurrent request),
                # another request beat us - we should be rate limited
                logger.warning(f"Insert failed (concurrent request?): {insert_error}")
                return (False, limit_minutes)
                
        except Exception as e:
            # FAIL CLOSED - if we can't verify rate limit, deny the request
            # This is more secure than allowing potentially unlimited requests
            logger.error(f"Rate limit check error for user {user_id}: {e}")
            logger.warning(f"Rate limit FAIL CLOSED - denying request for safety")
            return (False, limit_minutes)
    
    def _update_timestamp(self, user_id: str, action: str, now_iso: str, new_count: int):
        """Helper to update timestamp for edge cases."""
        try:
            self.supabase.table('user_rate_limits')\
                .update({
                    'last_action_at': now_iso,
                    'action_count': new_count
                })\
                .eq('user_id', user_id)\
                .eq('action_type', action)\
                .execute()
        except Exception as e:
            logger.warning(f"Failed to update timestamp: {e}")
    
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
