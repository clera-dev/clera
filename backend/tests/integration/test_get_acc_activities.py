#!/usr/bin/env python3
"""
Test file to verify the correct usage of get_account_activities.
"""

import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

from alpaca.broker import BrokerClient
from alpaca.broker.requests import GetAccountActivitiesRequest
from alpaca.trading.enums import ActivityType

load_dotenv()

api_key = os.getenv("BROKER_API_KEY")
secret_key = os.getenv("BROKER_SECRET_KEY")

broker_client = BrokerClient(api_key,
                             secret_key,
                             sandbox=True)

# account to get activities for
account_id = "60205bf6-1d3f-46a5-8a1c-7248ee9210c5"

# Calculate dates
today = datetime.now()
yesterday = (today - timedelta(days=1)).strftime("%Y-%m-%d")
two_days_ago = (today - timedelta(days=2)).strftime("%Y-%m-%d")

print(f"Checking activities for dates: {two_days_ago}, {yesterday}, and today ({today.strftime('%Y-%m-%d')})")

# Check activities from two days ago
activity_filter_two_days_ago = GetAccountActivitiesRequest(
    account_id=account_id,
    activity_types=[ActivityType.CSD],  # Cash Deposit
    date=two_days_ago
)

# Check activities from yesterday
activity_filter_yesterday = GetAccountActivitiesRequest(
    account_id=account_id,
    activity_types=[ActivityType.CSD],  # Cash Deposit
    date=yesterday
)

# Check activities from today
activity_filter_today = GetAccountActivitiesRequest(
    account_id=account_id,
    activity_types=[ActivityType.CSD],  # Cash Deposit
    date=today.strftime("%Y-%m-%d")
)

# Get account activities
activities_two_days_ago = broker_client.get_account_activities(activity_filter=activity_filter_two_days_ago)
activities_yesterday = broker_client.get_account_activities(activity_filter=activity_filter_yesterday)
activities_today = broker_client.get_account_activities(activity_filter=activity_filter_today)

if __name__ == "__main__":
    print(f"\nActivities on {two_days_ago}:")
    if activities_two_days_ago:
        for activity in activities_two_days_ago:
            print(f"  Type: {activity.activity_type}, Amount: ${activity.net_amount}, Time: {activity.date}")
    else:
        print("  No activities found.")
        
    print(f"\nActivities on {yesterday}:")
    if activities_yesterday:
        for activity in activities_yesterday:
            print(f"  Type: {activity.activity_type}, Amount: ${activity.net_amount}, Time: {activity.date}")
    else:
        print("  No activities found.")
        
    print(f"\nActivities on {today.strftime('%Y-%m-%d')}:")
    if activities_today:
        for activity in activities_today:
            print(f"  Type: {activity.activity_type}, Amount: ${activity.net_amount}, Time: {activity.date}")
    else:
        print("  No activities found.") 