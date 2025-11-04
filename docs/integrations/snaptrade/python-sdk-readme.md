
here is where you can find the python sdk from snaptrade and what the entire readme has available so you can be sure to make the most accurate migration documenation. you can find every single exact like of code you'll need to make a complete migration guide. from every part (including the exact code to replace our "portfolio rebuilding" we created for plaid to work with all of the more rich data that snap trade provides) 
@https://github.com/passiv/snaptrade-sdks/tree/HEAD/sdks/python#readme 

Requirements
Python >=3.8

Installation
pip install snaptrade-python-sdk==11.0.140
Getting Started
import os
import uuid
from pprint import pprint
from snaptrade_client import SnapTrade

# 1) Initialize a client with your clientID and consumerKey.
snaptrade = SnapTrade(
    consumer_key=os.environ["SNAPTRADE_CONSUMER_KEY"],
    client_id=os.environ["SNAPTRADE_CLIENT_ID"],
)

# 2) Check that the client is able to make a request to the API server.
api_response = snaptrade.api_status.check()
pprint(api_response.body)

# 3) Create a new user on SnapTrade
user_id = str(uuid.uuid4())
register_response = snaptrade.authentication.register_snap_trade_user(
    body={"userId": user_id}
)
pprint(register_response.body)

# Note: A user secret is only generated once. It's required to access
# resources for certain endpoints.
user_secret = register_response.body["userSecret"]

# 4) Get a redirect URI. Users will need this to connect
# their brokerage to the SnapTrade server.
redirect_uri = snaptrade.authentication.login_snap_trade_user(
    query_params={"userId": user_id, "userSecret": user_secret}
)
print(redirect_uri.body)

# 5) Obtaining account holdings data
holdings = snaptrade.account_information.get_all_user_holdings(
    query_params={"userId": user_id, "userSecret": user_secret}
)
pprint(holdings.body)

# 6) Deleting a user
deleted_response = snaptrade.authentication.delete_snap_trade_user(
    query_params={"userId": user_id}
)
pprint(deleted_response.body)
Async
async support is available by prepending a to any method.

import asyncio
from pprint import pprint
from snaptrade_client import SnapTrade, ApiException

snaptrade = SnapTrade(
    consumer_key="YOUR_CONSUMER_KEY",
    client_id="YOUR_CLIENT_ID",
)


async def main():
    try:
        # List account activities
        get_account_activities_response = (
            await snaptrade.account_information.aget_account_activities(
                account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
                user_id="snaptrade-user-123",
                user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
                start_date="2022-01-24",
                end_date="2022-01-24",
                offset=0,
                limit=1,
                type="BUY,SELL,DIVIDEND",
            )
        )
        pprint(get_account_activities_response.body)
        pprint(get_account_activities_response.body["data"])
        pprint(get_account_activities_response.body["pagination"])
        pprint(get_account_activities_response.headers)
        pprint(get_account_activities_response.status)
        pprint(get_account_activities_response.round_trip_time)
    except ApiException as e:
        print(
            "Exception when calling AccountInformationApi.get_account_activities: %s\n"
            % e
        )
        pprint(e.body)
        pprint(e.headers)
        pprint(e.status)
        pprint(e.reason)
        pprint(e.round_trip_time)


asyncio.run(main())
Reference
snaptrade.account_information.get_account_activities
Returns all historical transactions for the specified account.

This endpoint is paginated with a default page size of 1000. The endpoint will return a maximum of 1000 transactions per request. See the query parameters for pagination options.

Transaction are returned in reverse chronological order, using the trade_date field.

The data returned here is always cached and refreshed once a day.

🛠️ Usage
get_account_activities_response = snaptrade.account_information.get_account_activities(
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    start_date="2022-01-24",
    end_date="2022-01-24",
    offset=0,
    limit=1,
    type="BUY,SELL,DIVIDEND",
)
⚙️ Parameters
account_id: str
user_id: str
user_secret: str
start_date: date
The start date (inclusive) of the transaction history to retrieve. If not provided, the default is the first transaction known to SnapTrade based on trade_date.

end_date: date
The end date (inclusive) of the transaction history to retrieve. If not provided, the default is the last transaction known to SnapTrade based on trade_date.

offset: int
An integer that specifies the starting point of the paginated results. Default is 0.

limit: int
An integer that specifies the maximum number of transactions to return. Default of 1000.

type: str
Optional comma separated list of transaction types to filter by. SnapTrade does a best effort to categorize brokerage transaction types into a common set of values. Here are some of the most popular values: - BUY - Asset bought. - SELL - Asset sold. - DIVIDEND - Dividend payout. - CONTRIBUTION - Cash contribution. - WITHDRAWAL - Cash withdrawal. - REI - Dividend reinvestment. - STOCK_DIVIDEND - A type of dividend where a company distributes shares instead of cash - INTEREST - Interest deposited into the account. - FEE - Fee withdrawn from the account. - OPTIONEXPIRATION - Option expiration event. - OPTIONASSIGNMENT - Option assignment event. - OPTIONEXERCISE - Option exercise event. - TRANSFER - Transfer of assets from one account to another

🔄 Return
PaginatedUniversalActivity

🌐 Endpoint
/accounts/{accountId}/activities get

🔙 Back to Table of Contents

snaptrade.account_information.get_all_user_holdings
Deprecated

Deprecated, please use the account-specific holdings endpoint instead.

List all accounts for the user, plus balances, positions, and orders for each account.

🛠️ Usage
get_all_user_holdings_response = snaptrade.account_information.get_all_user_holdings(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    brokerage_authorizations="917c8734-8470-4a3e-a18f-57c3f2ee6631",
)
⚙️ Parameters
user_id: str
user_secret: str
brokerage_authorizations: str
Optional. Comma separated list of authorization IDs (only use if filtering is needed on one or more authorizations).

🔄 Return
AccountHoldings

🌐 Endpoint
/holdings get

🔙 Back to Table of Contents

snaptrade.account_information.get_user_account_balance
Returns a list of balances for the account. Each element of the list has a distinct currency. Some brokerages like Questrade allows holding multiple currencies in the same account.

The data returned here is cached. How long the data is cached for varies by brokerage. Check the brokerage integrations doc and look for "Cache Expiry Time" to see the exact value for a specific brokerage. If you need real-time data, please use the manual refresh endpoint.

🛠️ Usage
get_user_account_balance_response = (
    snaptrade.account_information.get_user_account_balance(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
🔄 Return
Balance

🌐 Endpoint
/accounts/{accountId}/balances get

🔙 Back to Table of Contents

snaptrade.account_information.get_user_account_details
Returns account detail known to SnapTrade for the specified account.

The data returned here is always cached and refreshed once a day. If you need real-time data, please use the manual refresh endpoint.

🛠️ Usage
get_user_account_details_response = (
    snaptrade.account_information.get_user_account_details(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
🔄 Return
Account

🌐 Endpoint
/accounts/{accountId} get

🔙 Back to Table of Contents

snaptrade.account_information.get_user_account_order_detail
Returns the detail of a single order using the external order ID provided in the request body.

This endpoint only works for single-leg orders at this time. Support for multi-leg orders will be added in the future.

This endpoint is always realtime and does not rely on cached data.

This endpoint only returns orders placed through SnapTrade. In other words, orders placed outside of the SnapTrade network are not returned by this endpoint.

🛠️ Usage
get_user_account_order_detail_response = (
    snaptrade.account_information.get_user_account_order_detail(
        brokerage_order_id="66a033fa-da74-4fcf-b527-feefdec9257e",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    )
)
⚙️ Parameters
brokerage_order_id: str
Order ID returned by brokerage. This is the unique identifier for the order in the brokerage system.

account_id: str
user_id: str
user_secret: str
⚙️ Request Body
Any

🔄 Return
AccountOrderRecord

🌐 Endpoint
/accounts/{accountId}/orders/details post

🔙 Back to Table of Contents

snaptrade.account_information.get_user_account_orders
Returns a list of recent orders in the specified account.

The data returned here is cached. How long the data is cached for varies by brokerage. Check the brokerage integrations doc and look for "Cache Expiry Time" to see the exact value for a specific brokerage. If you need real-time data, please use the manual refresh endpoint.

🛠️ Usage
get_user_account_orders_response = (
    snaptrade.account_information.get_user_account_orders(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
        state="all",
        days=30,
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
state: str
defaults value is set to "all"

days: int
Number of days in the past to fetch the most recent orders. Defaults to the last 30 days if no value is passed in.

🔄 Return
AccountOrderRecord

🌐 Endpoint
/accounts/{accountId}/orders get

🔙 Back to Table of Contents

snaptrade.account_information.get_user_account_positions
Returns a list of stock/ETF/crypto/mutual fund positions in the specified account. For option positions, please use the options endpoint.

The data returned here is cached. How long the data is cached for varies by brokerage. Check the brokerage integrations doc and look for "Cache Expiry Time" to see the exact value for a specific brokerage. If you need real-time data, please use the manual refresh endpoint.

🛠️ Usage
get_user_account_positions_response = (
    snaptrade.account_information.get_user_account_positions(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
🔄 Return
Position

🌐 Endpoint
/accounts/{accountId}/positions get

🔙 Back to Table of Contents

snaptrade.account_information.get_user_account_recent_orders
A lightweight endpoint that returns a list of orders executed in the last 24 hours in the specified account. This endpoint is realtime and can be used to quickly check if account state has recently changed due to an execution, or check status of recently placed orders Differs from /orders in that it is realtime, and only checks the last 24 hours as opposed to the last 30 days By default only returns executed orders, but that can be changed by setting only_executed to false Because of the cost of realtime requests, each call to this endpoint incurs an additional charge. You can find the exact cost for your API key on the Customer Dashboard billing page

🛠️ Usage
get_user_account_recent_orders_response = (
    snaptrade.account_information.get_user_account_recent_orders(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
        only_executed=True,
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
only_executed: bool
Defaults to true. Indicates if request should fetch only executed orders. Set to false to retrieve non executed orders as well

🔄 Return
RecentOrdersResponse

🌐 Endpoint
/accounts/{accountId}/recentOrders get

🔙 Back to Table of Contents

snaptrade.account_information.get_user_account_return_rates
Returns a list of rate of return percents for a given account. Will include timeframes available from the brokerage, for example "ALL", "1Y", "6M", "3M", "1M"

🛠️ Usage
get_user_account_return_rates_response = (
    snaptrade.account_information.get_user_account_return_rates(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
🔄 Return
RateOfReturnResponse

🌐 Endpoint
/accounts/{accountId}/returnRates get

🔙 Back to Table of Contents

snaptrade.account_information.get_user_holdings
Returns a list of balances, positions, and recent orders for the specified account. The data returned is similar to the data returned over the more fine-grained balances, positions and orders endpoints. The finer-grained APIs are preferred. They are easier to work with, faster, and have better error handling than this coarse-grained API.

The data returned here is cached. How long the data is cached for varies by brokerage. Check the brokerage integrations doc and look for "Cache Expiry Time" to see the exact value for a specific brokerage. If you need real-time data, please use the manual refresh endpoint.

If the connection has become disabled, it can no longer access the latest data from the brokerage, but will continue to return the last available cached state. Please see this guide on how to fix a disabled connection.

🛠️ Usage
get_user_holdings_response = snaptrade.account_information.get_user_holdings(
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
)
⚙️ Parameters
account_id: str
user_id: str
user_secret: str
🔄 Return
AccountHoldingsAccount

🌐 Endpoint
/accounts/{accountId}/holdings get

🔙 Back to Table of Contents

snaptrade.account_information.list_user_accounts
Returns all brokerage accounts across all connections known to SnapTrade for the authenticated user.

The data returned here is always cached and refreshed once a day. If you need real-time data, please use the manual refresh endpoint.

🛠️ Usage
list_user_accounts_response = snaptrade.account_information.list_user_accounts(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
)
⚙️ Parameters
user_id: str
user_secret: str
🔄 Return
Account

🌐 Endpoint
/accounts get

🔙 Back to Table of Contents

snaptrade.account_information.update_user_account
Updates various properties of a specified account.

🛠️ Usage
update_user_account_response = snaptrade.account_information.update_user_account(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="accountId_example",
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
The ID of the account to update.

🔄 Return
Account

🌐 Endpoint
/accounts/{accountId} put

🔙 Back to Table of Contents

snaptrade.api_status.check
Check whether the API is operational and verify timestamps.

🛠️ Usage
check_response = snaptrade.api_status.check()
🔄 Return
Status

🌐 Endpoint
/ get

🔙 Back to Table of Contents

snaptrade.authentication.delete_snap_trade_user
Deletes a registered user and all associated data. This action is irreversible. This API is asynchronous and will return a 200 status code if the request is accepted. The user and all associated data will be queued for deletion. Once deleted, a USER_DELETED webhook will be sent.

🛠️ Usage
delete_snap_trade_user_response = snaptrade.authentication.delete_snap_trade_user(
    user_id="snaptrade-user-123",
)
⚙️ Parameters
user_id: str
🔄 Return
DeleteUserResponse

🌐 Endpoint
/snapTrade/deleteUser delete

🔙 Back to Table of Contents

snaptrade.authentication.list_snap_trade_users
Returns a list of all registered user IDs. Please note that the response is not currently paginated.

🛠️ Usage
list_snap_trade_users_response = snaptrade.authentication.list_snap_trade_users()
🔄 Return
UserList

🌐 Endpoint
/snapTrade/listUsers get

🔙 Back to Table of Contents

snaptrade.authentication.login_snap_trade_user
Authenticates a SnapTrade user and returns the Connection Portal URL used for connecting brokerage accounts. Please check this guide for how to integrate the Connection Portal into your app.

Please note that the returned URL expires in 5 minutes.

🛠️ Usage
login_snap_trade_user_response = snaptrade.authentication.login_snap_trade_user(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    broker="ALPACA",
    immediate_redirect=True,
    custom_redirect="https://snaptrade.com",
    reconnect="8b5f262d-4bb9-365d-888a-202bd3b15fa1",
    connection_type="read",
    show_close_button=True,
    connection_portal_version="v4",
)
⚙️ Parameters
user_id: str
user_secret: str
broker: str
Slug of the brokerage to connect the user to. See the integrations page for a list of supported brokerages and their slugs.

immediate_redirect: bool
When set to true, user will be redirected back to the partner's site instead of the connection portal. This parameter is ignored if the connection portal is loaded inside an iframe. See the guide on ways to integrate the connection portal for more information.

custom_redirect: str
URL to redirect the user to after the user connects their brokerage account. This parameter is ignored if the connection portal is loaded inside an iframe. See the guide on ways to integrate the connection portal for more information.

reconnect: str
The UUID of the brokerage connection to be reconnected. This parameter should be left empty unless you are reconnecting a disabled connection. See the guide on fixing broken connections for more information.

connection_type: str
Determines connection permissions (default: read) - read: Data access only. - trade: Data and trading access. - trade-if-available: Attempts to establish a trading connection if the brokerage supports it, otherwise falls back to read-only access automatically.

show_close_button: bool
Controls whether the close (X) button is displayed in the connection portal. When false, you control closing behavior from your app. Defaults to true.

connection_portal_version: str
Sets the connection portal version to render. Currently only v4 is supported and is the default. All other versions are deprecated and will automatically be set to v4.

⚙️ Request Body
SnapTradeLoginUserRequestBody

🌐 Endpoint
/snapTrade/login post

🔙 Back to Table of Contents

snaptrade.authentication.register_snap_trade_user
Registers a new SnapTrade user under your Client ID. A user secret will be automatically generated for you and must be properly stored in your system. Most SnapTrade operations require a user ID and user secret to be passed in as parameters.

🛠️ Usage
register_snap_trade_user_response = snaptrade.authentication.register_snap_trade_user(
    user_id="snaptrade-user-123",
)
⚙️ Parameters
user_id: str
SnapTrade User ID. This is chosen by the API partner and can be any string that is a) unique to the user, and b) immutable for the user. It is recommended to NOT use email addresses for this property because they are usually not immutable.

⚙️ Request Body
SnapTradeRegisterUserRequestBody

🔄 Return
UserIDandSecret

🌐 Endpoint
/snapTrade/registerUser post

🔙 Back to Table of Contents

snaptrade.authentication.reset_snap_trade_user_secret
Rotates the secret for a SnapTrade user. You might use this if userSecret is compromised. Please note that if you call this endpoint and fail to save the new secret, you'll no longer be able to access any data for this user, and your only option will be to delete and recreate the user, then ask them to reconnect.

🛠️ Usage
reset_snap_trade_user_secret_response = (
    snaptrade.authentication.reset_snap_trade_user_secret(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    )
)
⚙️ Parameters
user_id: str
SnapTrade User ID. This is chosen by the API partner and can be any string that is a) unique to the user, and b) immutable for the user. It is recommended to NOT use email addresses for this property because they are usually not immutable.

user_secret: str
SnapTrade User Secret. This is a randomly generated string and should be stored securely. If compromised, please rotate it via the rotate user secret endpoint.

⚙️ Request Body
UserIDandSecret

🔄 Return
UserIDandSecret

🌐 Endpoint
/snapTrade/resetUserSecret post

🔙 Back to Table of Contents

snaptrade.connections.detail_brokerage_authorization
Returns a single connection for the specified ID.

🛠️ Usage
detail_brokerage_authorization_response = (
    snaptrade.connections.detail_brokerage_authorization(
        authorization_id="87b24961-b51e-4db8-9226-f198f6518a89",
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    )
)
⚙️ Parameters
authorization_id: str
user_id: str
user_secret: str
🔄 Return
BrokerageAuthorization

🌐 Endpoint
/authorizations/{authorizationId} get

🔙 Back to Table of Contents

snaptrade.connections.disable_brokerage_authorization
Manually force the specified connection to become disabled. This should only be used for testing a reconnect flow, and never used on production connections. Will trigger a disconnect as if it happened naturally, and send a CONNECTION_BROKEN webhook for the connection.

This endpoint is available on test keys. If you would like it enabled on production keys as well, please contact support as it is disabled by default.

🛠️ Usage
disable_brokerage_authorization_response = (
    snaptrade.connections.disable_brokerage_authorization(
        authorization_id="87b24961-b51e-4db8-9226-f198f6518a89",
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    )
)
⚙️ Parameters
authorization_id: str
user_id: str
user_secret: str
🔄 Return
BrokerageAuthorizationDisabledConfirmation

🌐 Endpoint
/authorizations/{authorizationId}/disable post

🔙 Back to Table of Contents

snaptrade.connections.list_brokerage_authorizations
Returns a list of all connections for the specified user. Note that Connection and Brokerage Authorization are interchangeable, but the term Connection is preferred and used in the doc for consistency.

A connection is usually tied to a single login at a brokerage. A single connection can contain multiple brokerage accounts.

SnapTrade performs de-duping on connections for a given user. If the user has an existing connection with the brokerage, when connecting the brokerage with the same credentials, SnapTrade will return the existing connection instead of creating a new one.

🛠️ Usage
list_brokerage_authorizations_response = (
    snaptrade.connections.list_brokerage_authorizations(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
🔄 Return
BrokerageAuthorization

🌐 Endpoint
/authorizations get

🔙 Back to Table of Contents

snaptrade.connections.refresh_brokerage_authorization
Trigger a holdings update for all accounts under this connection. Updates will be queued asynchronously. ACCOUNT_HOLDINGS_UPDATED webhook will be sent once the sync completes for each account under the connection. This endpoint will also trigger a transaction sync for the past day if one has not yet occurred.

Please contact support before use. Because of the cost of refreshing a connection, each call to this endpoint incurs an additional charge. You can find the exact cost for your API key on the Customer Dashboard billing page

🛠️ Usage
refresh_brokerage_authorization_response = (
    snaptrade.connections.refresh_brokerage_authorization(
        authorization_id="87b24961-b51e-4db8-9226-f198f6518a89",
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    )
)
⚙️ Parameters
authorization_id: str
user_id: str
user_secret: str
🔄 Return
BrokerageAuthorizationRefreshConfirmation

🌐 Endpoint
/authorizations/{authorizationId}/refresh post

🔙 Back to Table of Contents

snaptrade.connections.remove_brokerage_authorization
Deletes the connection specified by the ID. This will also delete all accounts and holdings associated with the connection. This action is irreversible. This endpoint is synchronous, a 204 response indicates that the connection has been successfully deleted.

🛠️ Usage
snaptrade.connections.remove_brokerage_authorization(
    authorization_id="87b24961-b51e-4db8-9226-f198f6518a89",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
)
⚙️ Parameters
authorization_id: str
user_id: str
user_secret: str
🌐 Endpoint
/authorizations/{authorizationId} delete

🔙 Back to Table of Contents

snaptrade.connections.return_rates
Returns a list of rate of return percents for a given connection. Will include timeframes available from the brokerage, for example "ALL", "1Y", "6M", "3M", "1M"

🛠️ Usage
return_rates_response = snaptrade.connections.return_rates(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    authorization_id="87b24961-b51e-4db8-9226-f198f6518a89",
)
⚙️ Parameters
user_id: str
user_secret: str
authorization_id: str
🔄 Return
RateOfReturnResponse

🌐 Endpoint
/authorizations/{authorizationId}/returnRates get

🔙 Back to Table of Contents

snaptrade.connections.session_events
Returns a list of session events associated with a user.

🛠️ Usage
session_events_response = snaptrade.connections.session_events(
    partner_client_id="SNAPTRADETEST",
    user_id="917c8734-8470-4a3e-a18f-57c3f2ee6631,65e839a3-9103-4cfb-9b72-2071ef80c5f2",
    session_id="917c8734-8470-4a3e-a18f-57c3f2ee6631,65e839a3-9103-4cfb-9b72-2071ef80c5f2",
)
⚙️ Parameters
partner_client_id: str
user_id: str
Optional comma separated list of user IDs used to filter the request on specific users

session_id: str
Optional comma separated list of session IDs used to filter the request on specific users

🌐 Endpoint
/sessionEvents get

🔙 Back to Table of Contents

snaptrade.options.get_options_chain
Returns the option chain for the specified symbol in the specified account.

🛠️ Usage
get_options_chain_response = snaptrade.options.get_options_chain(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="accountId_example",
    symbol="symbol_example",
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
The ID of the account to get the options chain from.

symbol: str
Universal symbol ID if symbol

🔄 Return
OptionChain

🌐 Endpoint
/accounts/{accountId}/optionsChain get

🔙 Back to Table of Contents

snaptrade.options.list_option_holdings
Returns a list of option positions in the specified account. For stock/ETF/crypto/mutual fund positions, please use the positions endpoint.

The data returned here is cached. How long the data is cached for varies by brokerage. Check the brokerage integrations doc and look for "Cache Expiry Time" to see the exact value for a specific brokerage. If you need real-time data, please use the manual refresh endpoint.

🛠️ Usage
list_option_holdings_response = snaptrade.options.list_option_holdings(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
🔄 Return
OptionsPosition

🌐 Endpoint
/accounts/{accountId}/options get

🔙 Back to Table of Contents

snaptrade.reference_data.get_currency_exchange_rate_pair
Returns an Exchange Rate Pair object for the specified Currency Pair.

🛠️ Usage
get_currency_exchange_rate_pair_response = (
    snaptrade.reference_data.get_currency_exchange_rate_pair(
        currency_pair="currencyPair_example",
    )
)
⚙️ Parameters
currency_pair: str
A currency pair based on currency code for example, {CAD-USD}

🔄 Return
ExchangeRatePairs

🌐 Endpoint
/currencies/rates/{currencyPair} get

🔙 Back to Table of Contents

snaptrade.reference_data.get_partner_info
Returns configurations for your SnapTrade Client ID, including allowed brokerages and data access.

🛠️ Usage
get_partner_info_response = snaptrade.reference_data.get_partner_info()
🔄 Return
PartnerData

🌐 Endpoint
/snapTrade/partners get

🔙 Back to Table of Contents

snaptrade.reference_data.get_security_types
Return all available security types supported by SnapTrade.

🛠️ Usage
get_security_types_response = snaptrade.reference_data.get_security_types()
🔄 Return
SecurityType

🌐 Endpoint
/securityTypes get

🔙 Back to Table of Contents

snaptrade.reference_data.get_stock_exchanges
Returns a list of all supported Exchanges.

🛠️ Usage
get_stock_exchanges_response = snaptrade.reference_data.get_stock_exchanges()
🔄 Return
Exchange

🌐 Endpoint
/exchanges get

🔙 Back to Table of Contents

snaptrade.reference_data.get_symbols
Returns a list of Universal Symbol objects that match the given query. The matching takes into consideration both the ticker and the name of the symbol. Only the first 20 results are returned.

🛠️ Usage
get_symbols_response = snaptrade.reference_data.get_symbols(
    substring="AAPL",
)
⚙️ Parameters
substring: str
The search query for symbols.

⚙️ Request Body
SymbolQuery

🔄 Return
UniversalSymbol

🌐 Endpoint
/symbols post

🔙 Back to Table of Contents

snaptrade.reference_data.get_symbols_by_ticker
Returns the Universal Symbol object specified by the ticker or the Universal Symbol ID. When a ticker is specified, the first matching result is returned. We largely follow the Yahoo Finance ticker format(click on "Yahoo Finance Market Coverage and Data Delays"). For example, for securities traded on the Toronto Stock Exchange, the symbol has a '.TO' suffix. For securities traded on NASDAQ or NYSE, the symbol does not have a suffix. Please use the ticker with the proper suffix for the best results.

🛠️ Usage
get_symbols_by_ticker_response = snaptrade.reference_data.get_symbols_by_ticker(
    query="query_example",
)
⚙️ Parameters
query: str
The ticker or Universal Symbol ID to look up the symbol with.

🔄 Return
UniversalSymbol

🌐 Endpoint
/symbols/{query} get

🔙 Back to Table of Contents

snaptrade.reference_data.list_all_brokerage_authorization_type
Returns a list of all defined Brokerage authorization Type objects.

🛠️ Usage
list_all_brokerage_authorization_type_response = (
    snaptrade.reference_data.list_all_brokerage_authorization_type(
        brokerage="QUESTRADE,ALPACA",
    )
)
⚙️ Parameters
brokerage: str
Comma separated value of brokerage slugs

🔄 Return
BrokerageAuthorizationTypeReadOnly

🌐 Endpoint
/brokerageAuthorizationTypes get

🔙 Back to Table of Contents

snaptrade.reference_data.list_all_brokerage_instruments
Returns a list of all brokerage instruments available for a given brokerage. Not all brokerages support this. The ones that don't will return an empty list.

🛠️ Usage
list_all_brokerage_instruments_response = (
    snaptrade.reference_data.list_all_brokerage_instruments(
        slug="QUESTRADE",
    )
)
⚙️ Parameters
slug: str
A short, unique identifier for the brokerage. It is usually the name of the brokerage in capital letters and will never change.

🔄 Return
BrokerageInstrumentsResponse

🌐 Endpoint
/brokerages/{slug}/instruments get

🔙 Back to Table of Contents

snaptrade.reference_data.list_all_brokerages
Returns a list of all defined Brokerage objects.

🛠️ Usage
list_all_brokerages_response = snaptrade.reference_data.list_all_brokerages()
🔄 Return
Brokerage

🌐 Endpoint
/brokerages get

🔙 Back to Table of Contents

snaptrade.reference_data.list_all_currencies
Returns a list of all defined Currency objects.

🛠️ Usage
list_all_currencies_response = snaptrade.reference_data.list_all_currencies()
🔄 Return
Currency

🌐 Endpoint
/currencies get

🔙 Back to Table of Contents

snaptrade.reference_data.list_all_currencies_rates
Returns a list of all Exchange Rate Pairs for all supported Currencies.

🛠️ Usage
list_all_currencies_rates_response = (
    snaptrade.reference_data.list_all_currencies_rates()
)
🔄 Return
ExchangeRatePairs

🌐 Endpoint
/currencies/rates get

🔙 Back to Table of Contents

snaptrade.reference_data.symbol_search_user_account
Returns a list of Universal Symbol objects that match the given query. The matching takes into consideration both the ticker and the name of the symbol. Only the first 20 results are returned.

The search results are further limited to the symbols supported by the brokerage for which the account is under.

🛠️ Usage
symbol_search_user_account_response = (
    snaptrade.reference_data.symbol_search_user_account(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
        substring="AAPL",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
substring: str
The search query for symbols.

⚙️ Request Body
SymbolQuery

🔄 Return
UniversalSymbol

🌐 Endpoint
/accounts/{accountId}/symbols post

🔙 Back to Table of Contents

snaptrade.trading.cancel_order
Cancels an order in the specified account. Accepts order IDs for all asset types.

🛠️ Usage
cancel_order_response = snaptrade.trading.cancel_order(
    brokerage_order_id="66a033fa-da74-4fcf-b527-feefdec9257e",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
)
⚙️ Parameters
brokerage_order_id: str
Order ID returned by brokerage. This is the unique identifier for the order in the brokerage system.

user_id: str
user_secret: str
account_id: str
⚙️ Request Body
Any

🔄 Return
CancelOrderResponse

🌐 Endpoint
/accounts/{accountId}/trading/cancel post

🔙 Back to Table of Contents

snaptrade.trading.cancel_user_account_order
Deprecated

**This endpoint is deprecated. Please switch to the new cancel order endpoint ** Attempts to cancel an open order with the brokerage. If the order is no longer cancellable, the request will be rejected.

🛠️ Usage
cancel_user_account_order_response = snaptrade.trading.cancel_user_account_order(
    brokerage_order_id="66a033fa-da74-4fcf-b527-feefdec9257e",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
)
⚙️ Parameters
brokerage_order_id: str
Order ID returned by brokerage. This is the unique identifier for the order in the brokerage system.

user_id: str
user_secret: str
account_id: str
⚙️ Request Body
Any

🔄 Return
AccountOrderRecord

🌐 Endpoint
/accounts/{accountId}/orders/cancel post

🔙 Back to Table of Contents

snaptrade.trading.get_cryptocurrency_pair_quote
Gets a quote for the specified account.

🛠️ Usage
get_cryptocurrency_pair_quote_response = (
    snaptrade.trading.get_cryptocurrency_pair_quote(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
        instrument_symbol="BTC-USD",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
instrument_symbol: str
🔄 Return
CryptocurrencyPairQuote

🌐 Endpoint
/accounts/{accountId}/trading/instruments/cryptocurrencyPairs/{instrumentSymbol}/quote get

🔙 Back to Table of Contents

snaptrade.trading.get_order_impact
Simulates an order and its impact on the account. This endpoint does not place the order with the brokerage. If successful, it returns a Trade object and the ID of the object can be used to place the order with the brokerage using the place checked order endpoint. Please note that the Trade object returned expires after 5 minutes. Any order placed using an expired Trade will be rejected.

🛠️ Usage
get_order_impact_response = snaptrade.trading.get_order_impact(
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    action="BUY",
    universal_symbol_id="2bcd7cc3-e922-4976-bce1-9858296801c3",
    order_type="Market",
    time_in_force="Day",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    price=31.33,
    stop=31.33,
    units=10.5,
    notional_value=None,
)
⚙️ Parameters
account_id: str
Unique identifier for the connected brokerage account. This is the UUID used to reference the account in SnapTrade.

action: ActionStrict
universal_symbol_id: str
Unique identifier for the symbol within SnapTrade. This is the ID used to reference the symbol in SnapTrade API calls.

order_type: OrderTypeStrict
time_in_force: TimeInForceStrict
user_id: str
user_secret: str
price: Optional[Union[int, float]]
The limit price for Limit and StopLimit orders.

stop: Optional[Union[int, float]]
The price at which a stop order is triggered for Stop and StopLimit orders.

units: UnitsNullable
notional_value: NotionalValueNullable
⚙️ Request Body
ManualTradeForm

🔄 Return
ManualTradeAndImpact

🌐 Endpoint
/trade/impact post

🔙 Back to Table of Contents

snaptrade.trading.get_user_account_quotes
Returns quotes from the brokerage for the specified symbols and account.

The quotes returned can be delayed depending on the brokerage the account belongs to. It is highly recommended that you use your own market data provider for real-time quotes instead of relying on this endpoint.

This endpoint does not work for options quotes.

This endpoint is disabled for free plans by default. Please contact support to enable this endpoint if needed.

🛠️ Usage
get_user_account_quotes_response = snaptrade.trading.get_user_account_quotes(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    symbols="symbols_example",
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    use_ticker=True,
)
⚙️ Parameters
user_id: str
user_secret: str
symbols: str
List of Universal Symbol IDs or tickers to get quotes for. When providing multiple values, use a comma as separator

account_id: str
use_ticker: bool
Should be set to True if symbols are comprised of tickers. Defaults to False if not provided.

🔄 Return
SymbolsQuotes

🌐 Endpoint
/accounts/{accountId}/quotes get

🔙 Back to Table of Contents

snaptrade.trading.place_bracket_order
Places a bracket order (entry order + OCO of stop loss and take profit). Disabled by default please contact support for use. Only supported on certain brokerages

🛠️ Usage
place_bracket_order_response = snaptrade.trading.place_bracket_order(
    action="BUY",
    instrument={
        "symbol": "AAPL",
        "type": "EQUITY",
    },
    order_type="Market",
    time_in_force="Day",
    stop_loss={
        "stop_price": "48.55",
        "limit_price": "48.50",
    },
    take_profit={
        "limit_price": "49.95",
    },
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    price=31.33,
    stop=31.33,
    units=10.5,
)
⚙️ Parameters
action: ActionStrictWithOptions
instrument: TradingInstrument
order_type: OrderTypeStrict
time_in_force: TimeInForceStrict
stop_loss: StopLoss
take_profit: TakeProfit
account_id: str
The ID of the account to execute the trade on.

user_id: str
user_secret: str
price: Optional[Union[int, float]]
The limit price for Limit and StopLimit orders.

stop: Optional[Union[int, float]]
The price at which a stop order is triggered for Stop and StopLimit orders.

units: Union[int, float]
Number of shares for the order. This can be a decimal for fractional orders. Must be null if notional_value is provided.

⚙️ Request Body
ManualTradeFormBracket

🔄 Return
AccountOrderRecord

🌐 Endpoint
/accounts/{accountId}/trading/bracket post

🔙 Back to Table of Contents

snaptrade.trading.place_crypto_order
Places an order in the specified account. This endpoint does not compute the impact to the account balance from the order before submitting the order.

🛠️ Usage
place_crypto_order_response = snaptrade.trading.place_crypto_order(
    instrument={
        "symbol": "BTC",
        "type": "CRYPTOCURRENCY",
    },
    side="BUY",
    type="MARKET",
    time_in_force="GTC",
    amount="123.45",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    limit_price="123.45",
    stop_price="123.45",
    post_only=False,
    expiration_date="2024-01-01T00:00:00Z",
)
⚙️ Parameters
instrument: CryptoTradingInstrument
side: ActionStrict
type: str
The type of order to place.

time_in_force: str
The Time in Force type for the order. This field indicates how long the order will remain active before it is executed or expires. - GTC - Good Til Canceled. The order is valid until it is executed or canceled. - FOK - Fill Or Kill. The order must be executed in its entirety immediately or be canceled completely. - IOC - Immediate Or Cancel. The order must be executed immediately. Any portion of the order that cannot be filled immediately will be canceled. - GTD - Good Til Date. The order is valid until the specified date.

amount: str
The amount of the base currency to buy or sell.

user_id: str
user_secret: str
account_id: str
limit_price: str
The limit price. Required if the order type is LIMIT, STOP_LOSS_LIMIT or TAKE_PROFIT_LIMIT.

stop_price: str
The stop price. Required if the order type is STOP_LOSS_MARKET, STOP_LOSS_LIMIT, TAKE_PROFIT_MARKET or TAKE_PROFIT_LIMIT.

post_only: bool
Valid and required only for order type LIMIT. If true orders that would be filled immediately are rejected to avoid incurring TAKER fees.

expiration_date: datetime
The expiration date of the order. Required if the time_in_force is GTD.

⚙️ Request Body
CryptoOrderForm

🔄 Return
OrderUpdatedResponse

🌐 Endpoint
/accounts/{accountId}/trading/crypto post

🔙 Back to Table of Contents

snaptrade.trading.place_force_order
Places a brokerage order in the specified account. The order could be rejected by the brokerage if it is invalid or if the account does not have sufficient funds.

This endpoint does not compute the impact to the account balance from the order and any potential commissions before submitting the order to the brokerage. If that is desired, you can use the check order impact endpoint.

It's recommended to trigger a manual refresh of the account after placing an order to ensure the account is up to date. You can use the manual refresh endpoint for this.

🛠️ Usage
place_force_order_response = snaptrade.trading.place_force_order(
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    action="BUY",
    order_type="Market",
    time_in_force="Day",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    universal_symbol_id="2bcd7cc3-e922-4976-bce1-9858296801c3",
    symbol="AAPL",
    price=31.33,
    stop=31.33,
    units=10.5,
    notional_value=None,
)
⚙️ Parameters
account_id: str
Unique identifier for the connected brokerage account. This is the UUID used to reference the account in SnapTrade.

action: ActionStrictWithOptions
order_type: OrderTypeStrict
time_in_force: TimeInForceStrict
user_id: str
user_secret: str
universal_symbol_id: UniversalSymbolIDNullable
The universal symbol ID of the security to trade. Must be 'null' if symbol is provided, otherwise must be provided.

symbol: Optional[str]
The security's trading ticker symbol. If 'symbol' is provided, then 'universal_symbol_id' must be 'null'.

price: Optional[Union[int, float]]
The limit price for Limit and StopLimit orders.

stop: Optional[Union[int, float]]
The price at which a stop order is triggered for Stop and StopLimit orders.

units: Union[int, float]
For Equity orders, this represents the number of shares for the order. This can be a decimal for fractional orders. Must be null if notional_value is provided. If placing an Option order, this field represents the number of contracts to buy or sell. (e.g., 1 contract = 100 shares).

notional_value: NotionalValueNullable
⚙️ Request Body
ManualTradeFormWithOptions

🔄 Return
AccountOrderRecord

🌐 Endpoint
/trade/place post

🔙 Back to Table of Contents

snaptrade.trading.place_mleg_order
Places a multi-leg option order. Only supported on certain option trading brokerages. https://snaptrade.notion.site/brokerages has information on brokerage trading support

🛠️ Usage
place_mleg_order_response = snaptrade.trading.place_mleg_order(
    order_type="MARKET",
    time_in_force="Day",
    legs=[
        {
            "instrument": {
                "symbol": "PBI   250718C00006000",
                "instrument_type": "OPTION",
            },
            "action": "BUY_TO_OPEN",
            "units": 1,
        }
    ],
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    limit_price="",
    stop_price="",
    price_effect="DEBIT",
)
⚙️ Parameters
order_type: MlegOrderTypeStrict
time_in_force: TimeInForceStrict
legs: List[MlegLeg]
user_id: str
user_secret: str
account_id: str
limit_price: Optional[str]
The limit price. Required if the order type is LIMIT, STOP_LOSS_LIMIT.

stop_price: Optional[str]
The stop price. Required if the order type is STOP_LOSS_MARKET, STOP_LOSS_LIMIT.

price_effect: MlegPriceEffectStrictNullable
⚙️ Request Body
MlegTradeForm

🔄 Return
MlegOrderResponse

🌐 Endpoint
/accounts/{accountId}/trading/options post

🔙 Back to Table of Contents

snaptrade.trading.place_order
Places the previously checked order with the brokerage. The tradeId is obtained from the check order impact endpoint. If you prefer to place the order without checking for impact first, you can use the place order endpoint.

It's recommended to trigger a manual refresh of the account after placing an order to ensure the account is up to date. You can use the manual refresh endpoint for this.

🛠️ Usage
place_order_response = snaptrade.trading.place_order(
    trade_id="139e307a-82f7-4402-b39e-4da7baa87758",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    wait_to_confirm=True,
)
⚙️ Parameters
trade_id: str
Obtained from calling the check order impact endpoint

user_id: str
user_secret: str
wait_to_confirm: Optional[bool]
Optional, defaults to true. Determines if a wait is performed to check on order status. If false, latency will be reduced but orders returned will be more likely to be of status PENDING as we will not wait to check on the status before responding to the request.

⚙️ Request Body
ValidatedTradeBody

🔄 Return
AccountOrderRecord

🌐 Endpoint
/trade/{tradeId} post

🔙 Back to Table of Contents

snaptrade.trading.preview_crypto_order
Previews an order using the specified account.

🛠️ Usage
preview_crypto_order_response = snaptrade.trading.preview_crypto_order(
    instrument={
        "symbol": "BTC",
        "type": "CRYPTOCURRENCY",
    },
    side="BUY",
    type="MARKET",
    time_in_force="GTC",
    amount="123.45",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
    limit_price="123.45",
    stop_price="123.45",
    post_only=False,
    expiration_date="2024-01-01T00:00:00Z",
)
⚙️ Parameters
instrument: CryptoTradingInstrument
side: ActionStrict
type: str
The type of order to place.

time_in_force: str
The Time in Force type for the order. This field indicates how long the order will remain active before it is executed or expires. - GTC - Good Til Canceled. The order is valid until it is executed or canceled. - FOK - Fill Or Kill. The order must be executed in its entirety immediately or be canceled completely. - IOC - Immediate Or Cancel. The order must be executed immediately. Any portion of the order that cannot be filled immediately will be canceled. - GTD - Good Til Date. The order is valid until the specified date.

amount: str
The amount of the base currency to buy or sell.

user_id: str
user_secret: str
account_id: str
limit_price: str
The limit price. Required if the order type is LIMIT, STOP_LOSS_LIMIT or TAKE_PROFIT_LIMIT.

stop_price: str
The stop price. Required if the order type is STOP_LOSS_MARKET, STOP_LOSS_LIMIT, TAKE_PROFIT_MARKET or TAKE_PROFIT_LIMIT.

post_only: bool
Valid and required only for order type LIMIT. If true orders that would be filled immediately are rejected to avoid incurring TAKER fees.

expiration_date: datetime
The expiration date of the order. Required if the time_in_force is GTD.

⚙️ Request Body
CryptoOrderForm

🔄 Return
CryptoOrderPreview

🌐 Endpoint
/accounts/{accountId}/trading/crypto/preview post

🔙 Back to Table of Contents

snaptrade.trading.replace_order
Replaces an existing pending order with a new one. The way this works is brokerage dependent, but usually involves cancelling the existing order and placing a new one. The order's brokerage_order_id may or may not change, be sure to use the one returned in the response going forward. Only supported on some brokerages

🛠️ Usage
replace_order_response = snaptrade.trading.replace_order(
    brokerage_order_id="66a033fa-da74-4fcf-b527-feefdec9257e",
    action="BUY",
    order_type="Market",
    time_in_force="Day",
    account_id="2bcd7cc3-e922-4976-bce1-9858296801c3",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    price=31.33,
    symbol="AAPL",
    stop=31.33,
    units=10.5,
)
⚙️ Parameters
brokerage_order_id: str
Order ID returned by brokerage. This is the unique identifier for the order in the brokerage system.

action: ActionStrict
order_type: OrderTypeStrict
time_in_force: TimeInForceStrict
account_id: str
The ID of the account to execute the trade on.

user_id: str
user_secret: str
price: Optional[Union[int, float]]
The limit price for Limit and StopLimit orders.

symbol: str
The security's trading ticker symbol

stop: Optional[Union[int, float]]
The price at which a stop order is triggered for Stop and StopLimit orders.

units: UnitsNullable
⚙️ Request Body
ManualTradeReplaceForm

🔄 Return
AccountOrderRecord

🌐 Endpoint
/accounts/{accountId}/trading/replace post

🔙 Back to Table of Contents

snaptrade.trading.search_cryptocurrency_pair_instruments
Searches cryptocurrency pairs instruments accessible to the specified account. Both base and quote are optional. Omit both for a full list of cryptocurrency pairs.

🛠️ Usage
search_cryptocurrency_pair_instruments_response = (
    snaptrade.trading.search_cryptocurrency_pair_instruments(
        user_id="snaptrade-user-123",
        user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
        account_id="917c8734-8470-4a3e-a18f-57c3f2ee6631",
        base="BTC",
        quote="USD",
    )
)
⚙️ Parameters
user_id: str
user_secret: str
account_id: str
base: str
quote: str
🌐 Endpoint
/accounts/{accountId}/trading/instruments/cryptocurrencyPairs get

🔙 Back to Table of Contents

snaptrade.transactions_and_reporting.get_activities
Deprecated

This endpoint is being deprecated but will continue to be available for use via SDKs, please use the account level endpoint if possible

Returns all historical transactions for the specified user and filtering criteria. It's recommended to use startDate and endDate to paginate through the data, as the response may be very large for accounts with a long history and/or a lot of activity. There's a max number of 10000 transactions returned per request.

There is no guarantee to the ordering of the transactions returned. Please sort the transactions based on the trade_date field if you need them in a specific order.

The data returned here is always cached and refreshed once a day.

🛠️ Usage
get_activities_response = snaptrade.transactions_and_reporting.get_activities(
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    start_date="2022-01-24",
    end_date="2022-01-24",
    accounts="917c8734-8470-4a3e-a18f-57c3f2ee6631,65e839a3-9103-4cfb-9b72-2071ef80c5f2",
    brokerage_authorizations="917c8734-8470-4a3e-a18f-57c3f2ee6631,65e839a3-9103-4cfb-9b72-2071ef80c5f2",
    type="BUY,SELL,DIVIDEND",
)
⚙️ Parameters
user_id: str
user_secret: str
start_date: date
The start date (inclusive) of the transaction history to retrieve. If not provided, the default is the first transaction known to SnapTrade based on trade_date.

end_date: date
The end date (inclusive) of the transaction history to retrieve. If not provided, the default is the last transaction known to SnapTrade based on trade_date.

accounts: str
Optional comma separated list of SnapTrade Account IDs used to filter the request to specific accounts. If not provided, the default is all known brokerage accounts for the user. The brokerageAuthorizations parameter takes precedence over this parameter.

brokerage_authorizations: str
Optional comma separated list of SnapTrade Connection (Brokerage Authorization) IDs used to filter the request to only accounts that belong to those connections. If not provided, the default is all connections for the user. This parameter takes precedence over the accounts parameter.

type: str
Optional comma separated list of transaction types to filter by. SnapTrade does a best effort to categorize brokerage transaction types into a common set of values. Here are some of the most popular values: - BUY - Asset bought. - SELL - Asset sold. - DIVIDEND - Dividend payout. - CONTRIBUTION - Cash contribution. - WITHDRAWAL - Cash withdrawal. - REI - Dividend reinvestment. - INTEREST - Interest deposited into the account. - FEE - Fee withdrawn from the account. - OPTIONEXPIRATION - Option expiration event. - OPTIONASSIGNMENT - Option assignment event. - OPTIONEXERCISE - Option exercise event. - TRANSFER - Transfer of assets from one account to another

🔄 Return
UniversalActivity

🌐 Endpoint
/activities get

🔙 Back to Table of Contents

snaptrade.transactions_and_reporting.get_reporting_custom_range
Deprecated

Returns performance information (contributions, dividends, rate of return, etc) for a specific timeframe. Please note that Total Equity Timeframe and Rate of Returns are experimental features. Please contact support@snaptrade.com if you notice any inconsistencies.

🛠️ Usage
get_reporting_custom_range_response = snaptrade.transactions_and_reporting.get_reporting_custom_range(
    start_date="2022-01-24",
    end_date="2022-01-24",
    user_id="snaptrade-user-123",
    user_secret="adf2aa34-8219-40f7-a6b3-60156985cc61",
    accounts="917c8734-8470-4a3e-a18f-57c3f2ee6631,65e839a3-9103-4cfb-9b72-2071ef80c5f2",
    detailed=True,
    frequency="monthly",
)
⚙️ Parameters
start_date: date
end_date: date
user_id: str
user_secret: str
accounts: str
Optional comma separated list of account IDs used to filter the request on specific accounts

detailed: bool
Optional, increases frequency of data points for the total value and contribution charts if set to true

frequency: str
Optional frequency for the rate of return chart (defaults to monthly). Possible values are daily, weekly, monthly, quarterly, yearly.

🔄 Return
PerformanceCustom

🌐 Endpoint
/performance/custom get

🔙 Back to Table of Contents
