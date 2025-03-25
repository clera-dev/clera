import os
import logging
from dotenv import load_dotenv

load_dotenv()

from alpaca.broker.client import BrokerClient
from alpaca.broker.requests import CreateACHRelationshipRequest, CreateACHTransferRequest
from alpaca.broker.enums import BankAccountType, TransferDirection, TransferTiming

logger = logging.getLogger("alpaca-manual-bank-funding")

# Initialize the Alpaca Broker client
api_key = os.getenv("BROKER_API_KEY")
secret_key = os.getenv("BROKER_SECRET_KEY")
is_sandbox = os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "sandbox"

# Valid routing number for Alpaca sandbox
VALID_TEST_ROUTING_NUMBER = "121000358"

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
    logger.info(f"Creating manual ACH relationship for account {account_id}")
    
    # Validate routing number
    if is_sandbox and bank_routing_number != VALID_TEST_ROUTING_NUMBER:
        logger.error(f"Invalid routing number: {bank_routing_number}. In sandbox mode, use {VALID_TEST_ROUTING_NUMBER}")
        raise ValueError(f"Invalid routing number. In sandbox mode, use {VALID_TEST_ROUTING_NUMBER}")
    
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
    
    logger.info(f"Successfully created ACH relationship {ach_relationship.id}")
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
    logger.info(f"Creating ACH transfer of ${amount} for account {account_id}")
    
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
    
    logger.info(f"Successfully created transfer {transfer.id}")
    return transfer

def get_ach_relationships(account_id: str):
    """
    Get all ACH relationships for an account.
    
    Args:
        account_id: Alpaca account ID
        
    Returns:
        List of ACH relationships
    """
    logger.info(f"Fetching ACH relationships for account {account_id}")
    relationships = broker_client.get_ach_relationships_for_account(account_id=account_id)
    return relationships 