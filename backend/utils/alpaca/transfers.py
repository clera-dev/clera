# Add to backend/utils/alpaca/transfers.py
from alpaca.broker.client import BrokerClient
import os
import logging

logger = logging.getLogger(__name__)

def get_transfers_for_account(account_id: str, broker_client=None) -> list:
    """
    Get all transfers for an Alpaca account.
    
    Args:
        account_id: Alpaca account ID
        broker_client: Optional existing broker client to use
        
    Returns:
        List of Transfer objects
    """
    try:
        # Use provided client or initialize new one
        if broker_client is None:
            logger.warning("No broker client provided, this may lead to authentication errors")
            api_key = os.getenv("BROKER_API_KEY")
            api_secret = os.getenv("BROKER_SECRET_KEY")
            
            if not api_key or not api_secret:
                raise ValueError("Missing Alpaca API credentials")
                
            broker_client = BrokerClient(
                api_key=api_key,
                secret_key=api_secret,
                sandbox=os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
            )
        
        # Get all transfers for the account
        transfers = broker_client.get_transfers_for_account(
            account_id=account_id
        )
        return transfers
    except Exception as e:
        logger.error(f"Error getting transfers for account {account_id}: {str(e)}")
        raise

def get_account_details(account_id: str, broker_client=None):
    """
    Get account details from Alpaca.
    
    Args:
        account_id: Alpaca account ID
        broker_client: Optional existing broker client to use
        
    Returns:
        Account object
    """
    try:
        # Use provided client or initialize new one
        if broker_client is None:
            logger.warning("No broker client provided, this may lead to authentication errors")
            api_key = os.getenv("BROKER_API_KEY")
            api_secret = os.getenv("BROKER_SECRET_KEY")
            
            if not api_key or not api_secret:
                raise ValueError("Missing Alpaca API credentials")
                
            broker_client = BrokerClient(
                api_key=api_key,
                secret_key=api_secret,
                sandbox=os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"
            )
        
        # Get account details - using the correct method name
        account = broker_client.get_account_by_id(account_id=account_id)
        return account
    except Exception as e:
        logger.error(f"Error getting account details for {account_id}: {str(e)}")
        raise
