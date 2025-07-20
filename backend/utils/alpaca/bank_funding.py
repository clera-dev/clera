#!/usr/bin/env python3

import os
import logging
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.processor_token_create_request import ProcessorTokenCreateRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
# The webhook module isn't available in this version of the Plaid library
# from plaid.model.link_token_create_request_webhook import LinkTokenCreateRequestWebhook
from plaid.model.country_code import CountryCode
from plaid.model.products import Products
from plaid.configuration import Configuration, Environment

from typing import Dict, Any, Tuple, Optional

# Import our broker client
from .create_account import get_broker_client

from dotenv import load_dotenv

load_dotenv()

from alpaca.broker.client import BrokerClient
from alpaca.broker.requests import CreateACHRelationshipRequest, CreateACHTransferRequest
from alpaca.broker.enums import BankAccountType, TransferDirection, TransferTiming

logger = logging.getLogger("alpaca-bank-funding-utils")

def get_plaid_client():
    """
    Initialize and return a Plaid client
    """
    # Check if Plaid credentials are set
    plaid_client_id = os.getenv("PLAID_CLIENT_ID")
    plaid_secret = os.getenv("PLAID_SECRET")
    
    if not plaid_client_id or not plaid_secret:
        logger.error("PLAID_CLIENT_ID and PLAID_SECRET must be set in .env")
        raise ValueError("Plaid credentials not set")
    
    # Determine which Plaid environment to use
    plaid_env = os.getenv("PLAID_ENV", "sandbox")
    logger.info(f"Using Plaid environment: {plaid_env}")
    
    if plaid_env == "sandbox":
        environment = Environment.Sandbox
    elif plaid_env == "development":
        environment = Environment.Development
    else:
        environment = Environment.Production
    
    # Configure Plaid client with proper headers
    configuration = Configuration(
        host=environment
    )
    
    # Initialize API client with our configuration
    api_client = plaid.ApiClient(configuration)
    client = plaid_api.PlaidApi(api_client)
    return client, plaid_client_id, plaid_secret

def create_plaid_link_token(user_email: str, alpaca_account_id: str, user_name: str = "Clera User") -> str:
    """
    Create a Plaid Link token for bank account connection
    
    Args:
        user_email: The user's email address
        alpaca_account_id: The user's Alpaca account ID to use as client_user_id
        user_name: The user's name
        
    Returns:
        Link token string
    """
    client, plaid_client_id, plaid_secret = get_plaid_client()
    
    # Use the Alpaca account ID as the client_user_id
    # This is consistent with our existing data model and isn't PII
    client_user_id = alpaca_account_id
    
    # Create a Link token for the given user
    request = LinkTokenCreateRequest(
        client_id=plaid_client_id,
        secret=plaid_secret,
        client_name="Clera Finance",
        products=[Products("auth")],
        country_codes=[CountryCode("US")],
        language="en",
        webhook=f"{os.getenv('BACKEND_PUBLIC_URL', '')}/webhook/plaid",
        user=LinkTokenCreateRequestUser(
            client_user_id=client_user_id,  # Use Alpaca account ID
            email_address=user_email,
            legal_name=user_name
        )
    )
    
    try:
        # Create the link token
        response = client.link_token_create(request)
        
        logger.info(f"Successfully created link token for (redacted email)")
        return response['link_token']
    except plaid.ApiException as e:
        logger.error(f"Error creating link token: {e}")
        logger.error(f"Error response: {e.body}")
        raise

def exchange_public_token_for_access_token(public_token: str) -> str:
    """
    Exchange a Plaid public token for an access token
    
    Args:
        public_token: The public token from Plaid Link
        
    Returns:
        Access token string
    """
    client, plaid_client_id, plaid_secret = get_plaid_client()
    
    # Exchange the public token for an access token
    exchange_request = ItemPublicTokenExchangeRequest(
        client_id=plaid_client_id,
        secret=plaid_secret,
        public_token=public_token
    )
    exchange_response = client.item_public_token_exchange(exchange_request)
    
    # Return the access token
    return exchange_response['access_token']

def create_processor_token(access_token: str, account_id: str) -> str:
    """
    Create a processor token for Alpaca
    
    Args:
        access_token: Plaid access token
        account_id: Plaid account ID
        
    Returns:
        Processor token string
    """
    client, plaid_client_id, plaid_secret = get_plaid_client()
    
    # Create a processor token for Alpaca
    processor_request = ProcessorTokenCreateRequest(
        client_id=plaid_client_id,
        secret=plaid_secret,
        access_token=access_token,
        account_id=account_id,
        processor="alpaca"
    )
    processor_response = client.processor_token_create(processor_request)
    
    # Return the processor token
    return processor_response['processor_token']

# Initialize the Alpaca Broker client
api_key = os.getenv("BROKER_API_KEY")
secret_key = os.getenv("BROKER_SECRET_KEY")
is_sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"

broker_client = BrokerClient(
    api_key,
    secret_key,
    sandbox=is_sandbox
)

def create_ach_relationship_manual(
    account_id: str,
    account_owner_name: str,
    bank_account_type: str,
    bank_account_number: str,
    bank_routing_number: str
):
    """
    Create an ACH relationship manually with provided bank account details.
    
    Args:
        account_id: Alpaca account ID
        account_owner_name: Name of the bank account owner
        bank_account_type: Type of bank account (CHECKING or SAVINGS)
        bank_account_number: Bank account number
        bank_routing_number: Bank routing number
        
    Returns:
        The created ACH relationship
    """
    # Convert string bank account type to enum
    account_type = BankAccountType.CHECKING
    if bank_account_type == "SAVINGS":
        account_type = BankAccountType.SAVINGS

    # Create the ACH relationship request
    ach_data = CreateACHRelationshipRequest(
        account_owner_name=account_owner_name,
        bank_account_type=account_type,
        bank_account_number=bank_account_number,
        bank_routing_number=bank_routing_number,
    )
    
    # Create the ACH relationship
    ach_relationship = broker_client.create_ach_relationship_for_account(
        account_id=account_id,
        ach_data=ach_data
    )
    
    return ach_relationship

def create_ach_transfer(
    account_id: str,
    relationship_id: str,
    amount: str
):
    """
    Create an ACH transfer to fund the account.
    
    Args:
        account_id: Alpaca account ID
        relationship_id: ACH relationship ID
        amount: Amount to transfer (string)
        
    Returns:
        The created transfer
    """
    # Create the transfer request
    transfer_data = CreateACHTransferRequest(
        amount=amount,
        direction=TransferDirection.INCOMING,
        timing=TransferTiming.IMMEDIATE,
        relationship_id=relationship_id
    )
    
    # Create the transfer
    transfer = broker_client.create_transfer_for_account(
        account_id=account_id,
        transfer_data=transfer_data
    )
    
    return transfer

def get_ach_relationships(alpaca_account_id, broker_client=None):
    # Use provided client or initialize new one
    if broker_client is None:
        logger.warning("No broker client provided for get_ach_relationships, this may lead to authentication errors")
        broker_client = get_broker_client()

    relationships = broker_client.get_ach_relationships_for_account(account_id=alpaca_account_id)
    return relationships

def create_direct_plaid_link_url(alpaca_account_id: str, user_email: str, redirect_uri: str = None) -> Dict[str, Any]:
    """
    Create a direct Plaid Link URL for Alpaca ACH funding
    
    Following the standard Plaid-Alpaca integration flow:
    https://docs.alpaca.markets/docs/ach-funding
    
    Args:
        alpaca_account_id: Alpaca account ID
        user_email: User's email address
        redirect_uri: Redirect URI for Plaid OAuth (optional)
        
    Returns:
        Dictionary with link token and URL
    """
    logger.info(f"Creating Plaid Link for account {alpaca_account_id}")
    
    try:
        # Create a link token using our Plaid client
        link_token = create_plaid_link_token(user_email, alpaca_account_id)
        logger.info(f"Successfully created Plaid link token for (redacted email)")
        
        # Process and validate the redirect URI
        success_redirect = None
        if redirect_uri:
            try:
                from urllib.parse import urlparse, quote
                parsed_uri = urlparse(redirect_uri)
                origin = f"{parsed_uri.scheme}://{parsed_uri.netloc}"
                
                # Ensure the account_id is properly propagated in the redirect
                success_redirect = f"{origin}/plaid-success.html?account_id={alpaca_account_id}"
                logger.info(f"Created success redirect: {success_redirect}")
            except Exception as e:
                logger.warning(f"Failed to parse redirect URI: {e}")
                # Use original redirect_uri as fallback if parsing fails
                success_redirect = redirect_uri
        
        # Construct a direct link URL
        base_url = "https://cdn.plaid.com/link/v2/stable/link.html"
        
        # Create URL parameters
        url_params = [f"token={link_token}"]
        
        # Add redirect_uri if provided
        if success_redirect:
            # Make sure the redirect URI is properly encoded
            from urllib.parse import quote
            encoded_redirect = quote(success_redirect)
            url_params.append(f"redirect_uri={encoded_redirect}")
            
            # Add OAuth-specific parameters for better integration
            url_params.append("oauth_state_id=alpaca_plaid_oauth")
            
            # Set receive_redirect=true to ensure Plaid redirects after completion
            url_params.append("receive_redirect=true")
        
        # Build the full URL
        link_url = f"{base_url}?{'&'.join(url_params)}"
        logger.info(f"Created Plaid Link URL: {link_url[:100]}...")
        
        return {
            "linkToken": link_token,
            "linkUrl": link_url
        }
    except Exception as e:
        logger.error(f"Error creating Plaid Link URL: {str(e)}")
        # Re-raise the exception to be handled by the caller
        raise 