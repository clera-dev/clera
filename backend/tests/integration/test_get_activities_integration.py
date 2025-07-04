#!/usr/bin/env python3
"""
Integration test for Alpaca Broker API's get_account_activities method.
This test is designed to verify the correct usage of the API call
for retrieving account activities.
"""

import os
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
import uuid
import pytest

from alpaca.broker import BrokerClient
from alpaca.broker.requests import GetAccountActivitiesRequest
from alpaca.trading.enums import ActivityType

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Set up Alpaca API credentials
BROKER_API_KEY = os.getenv("BROKER_API_KEY")
BROKER_SECRET_KEY = os.getenv("BROKER_SECRET_KEY")

# Check if credentials are available
if not BROKER_API_KEY or not BROKER_SECRET_KEY:
    pytest.skip("Broker API credentials not available. Skipping integration test.", allow_module_level=True)

# Create broker client
broker_client = BrokerClient(
    api_key=BROKER_API_KEY,
    secret_key=BROKER_SECRET_KEY,
    sandbox=True  # Use sandbox for testing
)

# Test account ID (use an actual test account ID if available)
TEST_ACCOUNT_ID = os.getenv("TEST_ACCOUNT_ID", "60205bf6-1d3f-46a5-8a1c-7248ee9210c5")

def test_get_account_activities_integration():
    """Test the get_account_activities method with a real Alpaca API call."""
    # Calculate date ranges
    today = datetime.now()
    yesterday = today - timedelta(days=1)
    two_days_ago = today - timedelta(days=2)
    
    # Format dates for API request
    today_str = today.strftime("%Y-%m-%d")
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    two_days_ago_str = two_days_ago.strftime("%Y-%m-%d")
    
    logger.info(f"Testing with account ID: {TEST_ACCOUNT_ID}")
    logger.info(f"Date ranges: {two_days_ago_str}, {yesterday_str}, {today_str}")
    
    # Test 1: Get activities from today
    try:
        # Create a proper request filter for today
        activity_filter_today = GetAccountActivitiesRequest(
            account_id=TEST_ACCOUNT_ID,
            activity_types=[ActivityType.CSD],  # Cash Deposit
            date=today_str
        )
        
        # Make the API call
        activities_today = broker_client.get_account_activities(activity_filter=activity_filter_today)
        
        # Log results
        logger.info(f"Activities today ({today_str}): {len(activities_today)}")
        for activity in activities_today:
            logger.info(f"  Type: {activity.activity_type}, Amount: ${activity.net_amount}, Time: {activity.date}")
            
        # Basic assertions
        assert isinstance(activities_today, list), "Expected a list of activities"
        
    except Exception as e:
        logger.error(f"Error getting today's activities: {e}")
        pytest.fail(f"API call failed with error: {e}")
    
    # Test 2: Get activities from yesterday
    try:
        # Create a proper request filter for yesterday
        activity_filter_yesterday = GetAccountActivitiesRequest(
            account_id=TEST_ACCOUNT_ID,
            activity_types=[ActivityType.CSD],  # Cash Deposit
            date=yesterday_str
        )
        
        # Make the API call
        activities_yesterday = broker_client.get_account_activities(activity_filter=activity_filter_yesterday)
        
        # Log results
        logger.info(f"Activities yesterday ({yesterday_str}): {len(activities_yesterday)}")
        for activity in activities_yesterday:
            logger.info(f"  Type: {activity.activity_type}, Amount: ${activity.net_amount}, Time: {activity.date}")
            
    except Exception as e:
        logger.error(f"Error getting yesterday's activities: {e}")
        pytest.fail(f"API call failed with error: {e}")
    
    # Test 3: Try a different activity type
    try:
        # Create a request filter for all trade activities
        activity_filter_trades = GetAccountActivitiesRequest(
            account_id=TEST_ACCOUNT_ID,
            activity_types=[ActivityType.FILL],  # Trade fills
            date=today_str
        )
        
        # Make the API call
        trade_activities = broker_client.get_account_activities(activity_filter=activity_filter_trades)
        
        # Log results
        logger.info(f"Trade activities today ({today_str}): {len(trade_activities)}")
        for activity in trade_activities:
            logger.info(f"  Type: {activity.activity_type}, Symbol: {getattr(activity, 'symbol', 'N/A')}, Time: {activity.date}")
            
    except Exception as e:
        logger.error(f"Error getting trade activities: {e}")
        pytest.fail(f"API call failed with error: {e}")
    
    logger.info("All API calls completed successfully.")

if __name__ == "__main__":
    test_get_account_activities_integration() 