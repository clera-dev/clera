"""
Centralized Alpaca BrokerClient factory to eliminate code duplication.
"""

import os
import logging
from typing import Optional
from alpaca.broker import BrokerClient

logger = logging.getLogger(__name__)

_broker_client_instance: Optional[BrokerClient] = None

def get_broker_client(force_new: bool = False) -> BrokerClient:
    """
    Get a shared Alpaca BrokerClient instance with proper configuration.
    
    Args:
        force_new: If True, creates a new client instance instead of using cached one
        
    Returns:
        BrokerClient: Configured Alpaca broker client
        
    Raises:
        ValueError: If required environment variables are missing
        Exception: If client initialization fails
    """
    global _broker_client_instance
    
    # Return cached instance unless forced to create new
    if not force_new and _broker_client_instance is not None:
        return _broker_client_instance
    
    # Get configuration from environment
    api_key = os.getenv("BROKER_API_KEY")
    secret_key = os.getenv("BROKER_SECRET_KEY")
    sandbox_str = os.getenv("ALPACA_SANDBOX", "true").lower()
    
    # Validate required credentials
    if not api_key or not secret_key:
        missing = []
        if not api_key:
            missing.append("BROKER_API_KEY")
        if not secret_key:
            missing.append("BROKER_SECRET_KEY")
        
        raise ValueError(f"Missing required Alpaca broker credentials: {', '.join(missing)}")
    
    # Parse sandbox setting
    sandbox = sandbox_str == "true"
    
    try:
        # Create new broker client
        client = BrokerClient(
            api_key=api_key,
            secret_key=secret_key,
            sandbox=sandbox
        )
        
        # Cache the instance for reuse
        _broker_client_instance = client
        
        logger.info(f"[BrokerClient Factory] Successfully created {'sandbox' if sandbox else 'live'} broker client")
        return client
        
    except Exception as e:
        logger.error(f"[BrokerClient Factory] Failed to create broker client: {e}")
        raise Exception(f"Failed to initialize Alpaca broker client: {str(e)}")

def reset_broker_client() -> None:
    """
    Reset the cached broker client instance.
    Useful for testing or when credentials change.
    """
    global _broker_client_instance
    _broker_client_instance = None
    logger.info("[BrokerClient Factory] Reset cached broker client instance")

def get_broker_config() -> dict:
    """
    Get the current broker configuration without creating a client.
    
    Returns:
        dict: Configuration dictionary with api_key_present, secret_key_present, sandbox flags
    """
    return {
        "api_key_present": bool(os.getenv("BROKER_API_KEY")),
        "secret_key_present": bool(os.getenv("BROKER_SECRET_KEY")),
        "sandbox": os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
    } 
