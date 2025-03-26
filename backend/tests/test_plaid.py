#!/usr/bin/env python3

"""
Test script for Plaid integration with Alpaca.
This script tests the Plaid client initialization and link token creation.
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("plaid-test")

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv()

# Test Plaid client initialization and link token creation
def test_plaid_integration():
    try:
        # Import here to ensure environment is loaded first
        from utils.alpaca.bank_funding import get_plaid_client, create_plaid_link_token
        
        # Print environment configuration for debugging
        logger.info(f"PLAID_ENV: {os.getenv('PLAID_ENV', 'not set')}")
        logger.info(f"PLAID_CLIENT_ID: {os.getenv('PLAID_CLIENT_ID', 'not set')[:5]}...{os.getenv('PLAID_CLIENT_ID', 'not set')[-5:] if os.getenv('PLAID_CLIENT_ID') else ''}")
        logger.info(f"PLAID_SECRET: {os.getenv('PLAID_SECRET', 'not set')[:5]}...{os.getenv('PLAID_SECRET', 'not set')[-5:] if os.getenv('PLAID_SECRET') else ''}")
        
        # Test client initialization
        logger.info("Testing Plaid client initialization")
        client, client_id, secret = get_plaid_client()
        logger.info("✅ Plaid client initialized successfully")
        
        # Test link token creation
        logger.info("Testing Plaid link token creation")
        test_email = "test@example.com"
        test_alpaca_account_id = "test-account-id"  # For testing purposes
        link_token = create_plaid_link_token(user_email=test_email, alpaca_account_id=test_alpaca_account_id)
        logger.info(f"✅ Link token created successfully: {link_token[:10]}...")
        
        return True
    except Exception as e:
        logger.error(f"❌ Test failed: {str(e)}")
        logger.exception(e)
        return False

# Test direct Plaid link URL creation with Alpaca
def test_alpaca_plaid_integration():
    try:
        # Import here to ensure environment is loaded first
        from utils.alpaca.bank_funding import create_direct_plaid_link_url
        
        # Test account ID and email (for testing only)
        test_account_id = "test-account-id"  # Replace with a real account ID for actual testing
        test_email = "test@example.com"
        
        # Test Plaid link URL creation for Alpaca
        logger.info("Testing Alpaca-Plaid integration")
        result = create_direct_plaid_link_url(alpaca_account_id=test_account_id, user_email=test_email)
        
        # Verify result
        if result and "linkToken" in result and "linkUrl" in result:
            logger.info(f"✅ Plaid link URL created successfully: {result['linkUrl'][:30]}...")
            return True
        else:
            logger.error(f"❌ Failed to create Plaid link URL: {result}")
            return False
    except Exception as e:
        logger.error(f"❌ Test failed: {str(e)}")
        logger.exception(e)
        return False

if __name__ == "__main__":
    logger.info("Starting Plaid integration tests")
    
    # Run tests
    client_test_success = test_plaid_integration()
    
    if client_test_success:
        logger.info("Plaid client tests passed ✅")
        
        # Only try Alpaca integration if client tests pass
        alpaca_test_success = test_alpaca_plaid_integration()
        
        if alpaca_test_success:
            logger.info("Alpaca-Plaid integration tests passed ✅")
        else:
            logger.error("Alpaca-Plaid integration tests failed ❌")
    else:
        logger.error("Plaid client tests failed ❌") 