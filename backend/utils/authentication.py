#!/usr/bin/env python3
"""
Authentication Module

This module handles secure authentication by deriving user identity from trusted sources
such as auth tokens, session context, or API keys, NOT from user-supplied parameters.

This prevents account takeover attacks and ensures proper authentication.
"""

import logging
import os
import jwt
from typing import Optional
from fastapi import HTTPException, Depends, Header, Request
from decouple import config
from utils.authorization import AuthorizationService, AuthorizationError

logger = logging.getLogger(__name__)


class AuthenticationService:
    """
    Service class for handling secure authentication.
    Derives user identity from trusted sources only.
    """
    
    @staticmethod
    def get_user_id_from_api_key(api_key: str) -> Optional[str]:
        """
        SECURITY: API keys are for service-to-service authentication only.
        They should NOT be used for user identity - use JWT tokens instead.
        
        In a production system, API keys could map to specific service accounts,
        but user identity must come from signed JWT tokens to prevent account takeover.
        """
        expected_api_key = config("BACKEND_API_KEY", default=None)
        
        if api_key == expected_api_key:
            logger.info("API key validated successfully")
            # API key is valid but provides no user identity information
            # User identity MUST come from JWT tokens for security
            return None
        
        logger.error("Invalid API key provided")
        return None
    
    @staticmethod
    def get_user_id_from_auth_token(auth_token: str) -> Optional[str]:
        """
        Derive user ID from authentication token using existing JWT implementation.
        This is a trusted source as tokens are issued by the auth system.
        
        Args:
            auth_token: The authentication token from the request
            
        Returns:
            User ID if token is valid, None otherwise
        """
        # Use the existing JWT implementation from the WebSocket server
        supabase_jwt_secret = config("SUPABASE_JWT_SECRET", default=None)
        
        if not auth_token:
            logger.warning("No auth token provided")
            return None
            
        if not supabase_jwt_secret:
            logger.error("SUPABASE_JWT_SECRET not configured")
            return None
        
        try:
            # Verify signature, expiration, and audience ('authenticated')
            payload = jwt.decode(
                auth_token, 
                supabase_jwt_secret, 
                algorithms=["HS256"], 
                audience="authenticated"  # CRUCIAL: Validate audience
            )
            user_id = payload.get("sub")
            if not user_id:
                logger.warning("Token valid but missing 'sub' (user ID)")
                return None
            logger.info(f"Token successfully verified for user: {user_id}")
            return user_id
        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return None
        except jwt.InvalidAudienceError:
            logger.warning("Invalid token audience")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error verifying token: {e}", exc_info=True)
            return None
    
    @staticmethod
    def get_user_id_from_session(request: Request) -> Optional[str]:
        """
        Derive user ID from session context.
        This is a trusted source as sessions are managed by the server.
        
        Args:
            request: The FastAPI request object
            
        Returns:
            User ID if session is valid, None otherwise
        """
        # TODO: Implement session-based user ID extraction
        # This should extract user ID from server-side session data
        # For now, this is a placeholder that needs to be implemented based on your auth system
        
        # Example implementation (replace with your actual logic):
        # session = request.session
        # return session.get("user_id")
        
        logger.warning("Session-based authentication not implemented - this needs to be implemented based on your auth system")
        return None


def get_authenticated_user_id(
    request: Request,
    api_key: str = Header(None, alias="X-API-Key"),
    auth_token: Optional[str] = Header(None, alias="Authorization"),
) -> str:
    """
    Secure dependency that derives user ID from JWT tokens only.
    
    SECURITY: This function ONLY accepts user identity from cryptographically
    signed JWT tokens to prevent account takeover attacks. Client-supplied
    headers like X-User-ID are NEVER trusted for user identity.
    
    Authentication flow:
    1. Validate API key for service access
    2. Extract and validate JWT token for user identity 
    3. Return user ID from validated JWT claims
    
    Args:
        request: The FastAPI request object
        api_key: The API key for service authentication
        auth_token: The JWT token for user authentication
        
    Returns:
        The authenticated user ID from JWT claims
        
    Raises:
        HTTPException: If authentication fails or no valid JWT provided
    """
    # First validate API key for service access
    if not api_key:
        logger.warning("Authentication failed - no API key provided")
        raise HTTPException(
            status_code=401,
            detail="Authentication required - API key missing"
        )
    
    # Validate the API key
    expected_api_key = config("BACKEND_API_KEY", default=None)
    if not expected_api_key or api_key != expected_api_key:
        logger.warning("Authentication failed - invalid API key")
        raise HTTPException(
            status_code=401,
            detail="Authentication required - invalid API key"
        )
    
    # Now extract user identity from JWT token (the ONLY trusted source)
    if auth_token:
        # Remove "Bearer " prefix if present
        if auth_token.startswith("Bearer "):
            auth_token = auth_token[7:]
        
        user_id = AuthenticationService.get_user_id_from_auth_token(auth_token)
        if user_id:
            logger.info(f"Successfully authenticated user via JWT token")
            return user_id
    
    # Try session as fallback (if implemented)
    user_id = AuthenticationService.get_user_id_from_session(request)
    if user_id:
        logger.info(f"Successfully authenticated user via session")
        return user_id
    
    # If no trusted source provided a valid user ID, authentication fails
    logger.warning("Authentication failed - no valid JWT token provided")
    raise HTTPException(
        status_code=401,
        detail="Authentication required - valid JWT token required"
    )


def verify_account_ownership(
    account_id: str,
    user_id: str = Depends(get_authenticated_user_id)
) -> str:
    """
    Verify that the authenticated user owns the specified account.
    Delegates to AuthorizationService for business logic.
    """
    try:
        return AuthorizationService.verify_user_account_ownership(account_id, user_id)
    except AuthorizationError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"Error verifying user account ownership: {e}")
        raise HTTPException(status_code=500, detail="Error verifying account ownership") 