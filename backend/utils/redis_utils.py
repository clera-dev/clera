"""
Redis Utilities

This module provides Redis client utilities to avoid circular imports
and maintain proper separation of concerns.
"""

import os
import redis
import logging

logger = logging.getLogger(__name__)

# Redis Host/Port Resolution (secure pattern)
_IS_PRODUCTION = os.getenv("COPILOT_ENVIRONMENT_NAME", "").lower() == "production" or os.getenv("ENVIRONMENT", "").lower() == "production"
if _IS_PRODUCTION:
    CANONICAL_REDIS_HOST = os.getenv("REDIS_HOST")
    if not CANONICAL_REDIS_HOST:
        raise RuntimeError("REDIS_HOST environment variable must be set in production!")
else:
    CANONICAL_REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
CANONICAL_REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

def get_sync_redis_client():
    """
    Get a synchronous Redis client instance.
    
    This is a simplified way; ideally, use a connection pool managed by the app lifecycle.
    Or, if it's already on `request.app.state.redis`, use that.
    Check existing code for how Redis is accessed.
    Use canonical Redis host and port resolved at module import.
    REDIS_DB can still be fetched from env here or defaulted.
    """
    try:
        # Get Redis database number from environment or default to 0
        redis_db = int(os.getenv("REDIS_DB", "0"))
        
        # Create Redis client with canonical host and port
        redis_client = redis.Redis(
            host=CANONICAL_REDIS_HOST,
            port=CANONICAL_REDIS_PORT,
            db=redis_db,
            decode_responses=False,  # Keep as bytes for compatibility
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True
        )
        
        # Test connection
        redis_client.ping()
        logger.debug(f"Successfully connected to Redis at {CANONICAL_REDIS_HOST}:{CANONICAL_REDIS_PORT}")
        
        return redis_client
        
    except redis.ConnectionError as e:
        logger.error(f"Failed to connect to Redis at {CANONICAL_REDIS_HOST}:{CANONICAL_REDIS_PORT}: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating Redis client: {e}")
        raise 