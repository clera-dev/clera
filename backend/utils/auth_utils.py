"""
Authentication Utilities

This module provides authentication utilities to avoid circular imports
and maintain proper separation of concerns.
"""

import os
import secrets
from fastapi import HTTPException, Header
from typing import Optional

def verify_api_key(x_api_key: Optional[str] = Header(None)) -> str:
    """
    Verify API key from request headers.
    
    Args:
        x_api_key: API key from X-API-Key header
        
    Returns:
        The verified API key
        
    Raises:
        HTTPException: If API key is missing or invalid
    """
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required")
    
    # Get the expected API key from environment
    expected_api_key = os.getenv("BACKEND_API_KEY")
    
    if not expected_api_key:
        raise HTTPException(status_code=500, detail="Backend API key not configured")
    
    # Use constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(x_api_key, expected_api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    return x_api_key 