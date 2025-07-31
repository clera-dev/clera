"""
Redis Data Parsing Utilities

This module provides utility functions for safely parsing and converting Redis data.
It handles common Redis data types and provides error-safe parsing operations.
"""

import json
import logging

logger = logging.getLogger(__name__)


def json_from_redis(value):
    """
    Safely decode and parse JSON from Redis.
    
    Args:
        value: The value from Redis (could be bytes or string)
        
    Returns:
        Parsed JSON data or None if parsing fails
    """
    try:
        if value is None:
            return None
        # Decode bytes to string before parsing JSON
        data_str = value.decode('utf-8') if isinstance(value, bytes) else value
        return json.loads(data_str)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.error(f"Failed to decode/parse JSON from Redis: {e}")
        return None


def float_from_redis(value):
    """
    Safely decode and convert Redis value to float.
    
    Args:
        value: The value from Redis (could be bytes or string)
        
    Returns:
        Float value or None if conversion fails
    """
    try:
        if value is None:
            return None
        # Decode bytes to string before converting to float
        data_str = value.decode('utf-8') if isinstance(value, bytes) else value
        return float(data_str)
    except (ValueError, UnicodeDecodeError) as e:
        logger.error(f"Failed to decode/convert Redis value to float: {e}")
        return None


def account_id_from_key(key):
    """
    Safely extract account ID from Redis key.
    
    Args:
        key: The Redis key (could be bytes or string)
        
    Returns:
        Account ID string or None if extraction fails
    """
    try:
        if key is None:
            return None
        # Decode bytes to string before splitting
        key_str = key.decode('utf-8') if isinstance(key, bytes) else key
        return key_str.split(':')[1]
    except (IndexError, UnicodeDecodeError) as e:
        logger.error(f"Failed to extract account ID from key: {e}")
        return None 