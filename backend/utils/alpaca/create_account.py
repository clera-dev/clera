#!/usr/bin/env python3

import os
import logging
from typing import Dict, Any, Optional, Tuple

from alpaca.broker import BrokerClient
from alpaca.broker.models import (
    Contact,
    Identity,
    Disclosures,
    Agreement
)
from alpaca.broker.requests import CreateAccountRequest
from alpaca.broker.enums import TaxIdType, FundingSource, AgreementType

logger = logging.getLogger("alpaca-utils")

def get_broker_client(sandbox: bool = True) -> BrokerClient:
    """
    Create and return an Alpaca broker client instance
    """
    api_key = os.getenv("BROKER_API_KEY")
    secret_key = os.getenv("BROKER_SECRET_KEY")
    
    if not api_key or not secret_key:
        raise ValueError("BROKER_API_KEY and BROKER_SECRET_KEY environment variables must be set")
    
    return BrokerClient(
        api_key=api_key,
        secret_key=secret_key,
        sandbox=sandbox
    )

def create_alpaca_account(account_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create an account with Alpaca using the broker client
    
    Args:
        account_data: Dictionary containing all required account information
        
    Returns:
        Dictionary with account details (id, account_number, status, etc.)
        
    Raises:
        Exception: If account creation fails
    """
    broker_client = get_broker_client()
    
    # Create Contact object
    contact_data = Contact(
        email_address=account_data["contact"]["email_address"],
        phone_number=account_data["contact"]["phone_number"],
        street_address=account_data["contact"]["street_address"],
        city=account_data["contact"]["city"],
        state=account_data["contact"]["state"],
        postal_code=account_data["contact"]["postal_code"],
        country=account_data["contact"]["country"]
    )
    
    # Create Identity object
    identity_data = Identity(
        given_name=account_data["identity"]["given_name"],
        middle_name=account_data["identity"].get("middle_name", ""),
        family_name=account_data["identity"]["family_name"],
        date_of_birth=account_data["identity"]["date_of_birth"],
        tax_id=account_data["identity"]["tax_id"],
        tax_id_type=TaxIdType.USA_SSN,  # Default to SSN for US customers
        country_of_citizenship=account_data["identity"]["country_of_citizenship"],
        country_of_birth=account_data["identity"]["country_of_birth"],
        country_of_tax_residence=account_data["identity"]["country_of_tax_residence"],
        funding_source=[FundingSource(src) for src in account_data["identity"]["funding_source"]]
    )
    
    # Create Disclosures object
    disclosure_data = Disclosures(
        is_control_person=account_data["disclosures"]["is_control_person"],
        is_affiliated_exchange_or_finra=account_data["disclosures"]["is_affiliated_exchange_or_finra"],
        is_politically_exposed=account_data["disclosures"]["is_politically_exposed"],
        immediate_family_exposed=account_data["disclosures"]["immediate_family_exposed"]
    )
    
    # Create Agreement objects
    agreement_data = []
    for agreement in account_data["agreements"]:
        # Map string agreement types to Alpaca enum values
        agreement_type_str = agreement["agreement"]
        agreement_type = None
        
        if agreement_type_str == "customer_agreement":
            agreement_type = AgreementType.CUSTOMER
        elif agreement_type_str == "account_agreement":
            agreement_type = AgreementType.ACCOUNT
        elif agreement_type_str == "margin_agreement":
            agreement_type = AgreementType.MARGIN
        elif agreement_type_str == "crypto_agreement":
            agreement_type = AgreementType.CRYPTO
            
        if agreement_type:
            agreement_data.append(
                Agreement(
                    agreement=agreement_type,
                    signed_at=agreement["signed_at"],
                    ip_address=agreement["ip_address"]
                )
            )
    
    # Create account request
    account_request = CreateAccountRequest(
        contact=contact_data,
        identity=identity_data,
        disclosures=disclosure_data,
        agreements=agreement_data
    )
    
    # Create account through Alpaca Broker API
    account = broker_client.create_account(account_request)
    
    # Return account information as dictionary
    return {
        "id": str(account.id),
        "account_number": account.account_number,
        "status": str(account.status),
        "created_at": account.created_at
    }

def find_account_by_email(email: str) -> Optional[Dict[str, Any]]:
    """
    Find an Alpaca account by email address
    
    Args:
        email: The email address to search for
        
    Returns:
        Dictionary with account details if found, None otherwise
    """
    broker_client = get_broker_client()
    
    try:
        # List all accounts and find the one with matching email
        accounts = broker_client.list_accounts()
        
        for account in accounts:
            # Check if contact info exists and email matches
            if account.contact and account.contact.get('email_address') == email:
                return {
                    "id": str(account.id),
                    "account_number": account.account_number,
                    "status": str(account.status),
                    "created_at": account.created_at
                }
                
        # No account found with this email
        return None
        
    except Exception as e:
        logger.error(f"Error looking up account by email: {str(e)}")
        return None

def create_or_get_alpaca_account(account_data: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """
    Create a new Alpaca account or return existing one if it already exists
    
    Args:
        account_data: Dictionary containing all required account information
        
    Returns:
        Tuple of (account_details, is_new_account)
        
    Raises:
        Exception: If account creation fails for reasons other than account exists
    """
    broker_client = get_broker_client()
    
    try:
        # Try to create the account
        account_details = create_alpaca_account(account_data)
        return account_details, True
    except Exception as e:
        error_str = str(e)
        
        # Check if this is an "account already exists" error
        if '"code":40910000' in error_str and 'email address already exists' in error_str:
            email = account_data["contact"]["email_address"]
            logger.info(f"Account with email (redacted) already exists, looking it up")
            
            # Look up the existing account
            existing_account = find_account_by_email(email)
            
            if existing_account:
                return existing_account, False
                
        # For any other errors, re-raise
        raise 