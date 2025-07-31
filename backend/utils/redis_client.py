"""
Redis Client Utilities

This module provides centralized Redis client creation utilities to avoid circular dependencies
between the API layer and service layer.
"""

import os
import logging
import redis.asyncio as aioredis
import redis

logger = logging.getLogger(__name__)

# Canonical Redis configuration - should match api_server.py
CANONICAL_REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
CANONICAL_REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


def get_sync_redis_client():
    """
    Create a synchronous Redis client.
    
    Returns:
        redis.Redis: Configured Redis client instance
    """
    db = int(os.getenv("REDIS_DB", "0"))
    
    logger.info(f"Creating Redis client (sync) with host='{CANONICAL_REDIS_HOST}', port={CANONICAL_REDIS_PORT}, db: {db}")
    return redis.Redis(
        host=CANONICAL_REDIS_HOST, 
        port=CANONICAL_REDIS_PORT, 
        db=db, 
        decode_responses=True
    )


def get_async_redis_client():
    """
    Create an asynchronous Redis client.
    
    Returns:
        aioredis.Redis: Configured async Redis client instance
    """
    db = int(os.getenv("REDIS_DB", "0"))
    
    logger.info(f"Creating Redis client (async) with host='{CANONICAL_REDIS_HOST}', port={CANONICAL_REDIS_PORT}, db: {db}")
    return aioredis.Redis(
        host=CANONICAL_REDIS_HOST, 
        port=CANONICAL_REDIS_PORT, 
        db=db, 
        decode_responses=True
    ) 