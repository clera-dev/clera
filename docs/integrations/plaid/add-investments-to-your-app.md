Add Investments to your app 
============================

#### Learn how to add Investments endpoints to your application 

In this guide, we'll start from scratch and walk through how to use [Investments](https://plaid.com/docs/api/products/investments/index.html.md) to retrieve information on securities and holdings. If you are already familiar with using Plaid and are set up to make calls to the Plaid API, you can skip ahead to [Fetching investment data](https://plaid.com/docs/investments/add-to-app/index.html.md#fetching-investment-data) .

#### Get Plaid API keys and complete application and company profile 

If you don't already have one, you'll need to [create a Plaid developer account](https://dashboard.plaid.com/signup) . After creating your account, you can find your [API keys](https://dashboard.plaid.com/developers/keys) under the Team Settings menu on the Plaid Dashboard.

You will also need to complete your [application profile](https://dashboard.plaid.com/settings/company/app-branding) and [company profile](https://dashboard.plaid.com/settings/company/profile) on the Dashboard. The information in your profile will be shared with users of your application when they manage their connection on the [Plaid Portal](https://my.plaid.com) . Your application profile and company profile must be completed before connecting to certain institutions in Production.

#### Install and initialize Plaid libraries 

You can use our official server-side client libraries to connect to the Plaid API from your application:

```javascript
// Install via npm
npm install --save plaid
```

After you've installed Plaid's client libraries, you can initialize them by passing in your `client_id`, `secret`, and the environment you wish to connect to (Sandbox or Production). This will make sure the client libraries pass along your `client_id` and `secret` with each request, and you won't need to explicitly include them in any other calls.

```javascript
// Using Express
const express = require('express');
const app = express();
app.use(express.json());


const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');


const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});


const client = new PlaidApi(configuration);
```

#### Create an Item in Link 

Plaid Link is a drop-in module that provides a secure, elegant authentication flow for each institution that Plaid supports. Link makes it secure and easy for users to connect their bank accounts to Plaid. Note that these instructions cover Link on the web. For instructions on using Link within mobile apps, see the [Link documentation](https://plaid.com/docs/link/index.html.md) .

Using Link, we will create a Plaid _Item_, which is a Plaid term for a login at a financial institution. An Item is not the same as a financial institution account, although every account will be associated with an Item. For example, if a user has one login at their bank that allows them to access both their checking account and their savings account, a single Item would be associated with both of those accounts. If you want to customize Link's look and feel, you can do so from the [Dashboard](https://dashboard.plaid.com/link) .

Before initializing Link, you will need to create a new `link_token` on the server side of your application. A `link_token` is a short-lived, one-time use token that is used to authenticate your app with Link. You can create one using the [/link/token/create](https://plaid.com/docs/api/link/index.html.md#linktokencreate) endpoint. Then, on the client side of your application, you'll need to initialize Link with the `link_token` that you just created.

##### Create a link\_token 

```javascript
const request: LinkTokenCreateRequest = {
  loading_sample: true
};
try {
  const response = await plaidClient.linkTokenCreate(request);
  const linkToken = response.data.link_token;
} catch (error) {
  // handle error
}
```

##### Install Link dependency 

```jsx

  Connect a bank
  

```

##### Configure the client-side Link handler 

```javascript
const linkHandler = Plaid.create({
  token: (await $.post('/create_link_token')).link_token,
  onSuccess: (public_token, metadata) => {
    // Send the public_token to your app server.
    $.post('/exchange_public_token', {
      public_token: public_token,
    });
  },
  onExit: (err, metadata) => {
    // Optionally capture when your user exited the Link flow.
    // Storing this information can be helpful for support.
  },
  onEvent: (eventName, metadata) => {
    // Optionally capture Link flow events, streamed through
    // this callback as your users connect an Item to Plaid.
  },
});


linkHandler.open();
```

#### Get a persistent access\_token 

Next, on the server side, we need to exchange our `public_token` for an `access_token` and `item_id`. The `access_token` will allow us to make authenticated calls to the Plaid API. Doing so is as easy as calling the [/item/public\_token/exchange](https://plaid.com/docs/api/items/index.html.md#itempublic_tokenexchange) endpoint from our server-side handler. We'll use the client library we configured earlier to make the API call.

Save the `access_token` and `item_id` in a secure datastore, as they’re used to access Item data and identify webhooks, respectively. The `access_token` will remain valid unless you actively chose to expire it via rotation or remove the corresponding Item via [/item/remove](https://plaid.com/docs/api/items/index.html.md#itemremove) . The `access_token` should be stored securely, and never in client-side code. A `public_token` is a one-time use token with a lifetime of 30 minutes, so there is no need to store it.

Select group for content switcher

Current librariesLegacy libraries

```javascript
app.post('/api/exchange_public_token', async function (
  request,
  response,
  next,
) {
  const publicToken = request.body.public_token;
  try {
    const response = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });


    // These values should be saved to a persistent database and
    // associated with the currently signed-in user
    const accessToken = response.data.access_token;
    const itemID = response.data.item_id;


    res.json({ public_token_exchange: 'complete' });
  } catch (error) {
    // handle error
  }
});
```

#### Fetching investment data 

Now that the authentication step is out of the way, we can begin using authenticated endpoints from the Plaid API. Once you've retrieved investment data for an account, you can then use it to analyze data such as trading activity, net worth, and asset allocations.

Investments endpoints return two primary pieces of information about the investment account. The first is details on the holding itself (if using [/investments/holdings/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentsholdingsget) ) or the transaction (if using [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) ). The second is details about the security itself. Each security, transaction, and holding contains a `security_id` field, which functions as a key for cross-referencing the holding or transaction with the security it pertains to. For more detailed information on the schema for information returned, see [/investments/holdings/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentsholdingsget) or [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) .

Investments data is typically updated daily, after market close. To be alerted when new data is available to be retrieved, listen to [Investments webhooks](https://plaid.com/docs/api/products/investments/index.html.md#webhooks) .

##### Fetching investment holdings 

Select group for content switcher

Current librariesLegacy libraries

```javascript
const { InvestmentsHoldingsGetRequest } = require('plaid');


// Pull Holdings for an Item
const request: InvestmentsHoldingsGetRequest = {
  access_token: accessToken,
};
try {
  const response = await plaidClient.investmentsHoldingsGet(request);
  const holdings = response.data.holdings;
  const securities = response.data.securities;
} catch (error) {
  // handle error
}
```

Example response data is below.

```json
{
  "accounts": [
    {
      "account_id": "5Bvpj4QknlhVWk7GygpwfVKdd133GoCxB814g",
      "balances": {
        "available": 43200,
        "current": 43200,
        "iso_currency_code": "USD",
        "limit": null,
        "unofficial_currency_code": null
      },
      "mask": "4444",
      "name": "Plaid Money Market",
      "official_name": "Plaid Platinum Standard 1.85% Interest Money Market",
      "subtype": "money market",
      "type": "depository"
    },
    {
      "account_id": "JqMLm4rJwpF6gMPJwBqdh9ZjjPvvpDcb7kDK1",
      "balances": {
        "available": null,
        "current": 320.76,
        "iso_currency_code": "USD",
        "limit": null,
        "unofficial_currency_code": null
      },
      "mask": "5555",
      "name": "Plaid IRA",
      "official_name": null,
      "subtype": "ira",
      "type": "investment"
    },
    {
      "account_id": "k67E4xKvMlhmleEa4pg9hlwGGNnnEeixPolGm",
      "balances": {
        "available": null,
        "current": 23631.9805,
        "iso_currency_code": "USD",
        "limit": null,
        "unofficial_currency_code": null
      },
      "mask": "6666",
      "name": "Plaid 401k",
      "official_name": null,
      "subtype": "401k",
      "type": "investment"
    }
  ],
  "holdings": [
    {
      "account_id": "JqMLm4rJwpF6gMPJwBqdh9ZjjPvvpDcb7kDK1",
      "cost_basis": 0.01,
      "institution_price": 0.011,
      "institution_price_as_of": null,
      "institution_value": 110,
      "iso_currency_code": "USD",
      "quantity": 10000,
      "security_id": "8E4L9XLl6MudjEpwPAAgivmdZRdBPJuvMPlPb",
      "unofficial_currency_code": null
    },
    {
      "account_id": "k67E4xKvMlhmleEa4pg9hlwGGNnnEeixPolGm",
      "cost_basis": 23,
      "institution_price": 27,
      "institution_price_as_of": null,
      "institution_value": 636.309,
      "iso_currency_code": "USD",
      "quantity": 23.567,
      "security_id": "JDdP7XPMklt5vwPmDN45t3KAoWAPmjtpaW7DP",
      "unofficial_currency_code": null
    }
  ],
  "item": {
    "available_products": [
      "balance",
      "credit_details",
      "identity",
      "investments",
      "liabilities",
      "transactions"
    ],
    "billed_products": ["assets", "auth", "investments"],
    "consent_expiration_time": null,
    "error": null,
    "institution_id": "ins_3",
    "item_id": "4z9LPae1nRHWy8pvg9jrsgbRP4ZNQvIdbLq7g",
    "webhook": "https://www.genericwebhookurl.com/webhook"
  },
  "request_id": "l68wb8zpS0hqmsJ",
  "securities": [
    {
      "close_price": 0.011,
      "close_price_as_of": null,
      "cusip": null,
      "institution_id": null,
      "institution_security_id": null,
      "is_cash_equivalent": false,
      "isin": null,
      "iso_currency_code": "USD",
      "name": "Nflx Feb 01'18 $355 Call",
      "proxy_security_id": null,
      "security_id": "8E4L9XLl6MudjEpwPAAgivmdZRdBPJuvMPlPb",
      "sedol": null,
      "ticker_symbol": "NFLX180201C00355000",
      "type": "derivative",
      "unofficial_currency_code": null,
      "market_identifier_code": "XNAS",
      "option_contract": {
        "contract_type": "call",
        "expiration_date": "2018-02-01",
        "strike_price": 355.00,
        "underlying_security_ticker": "NFLX"
      }
    },
    {
      "close_price": 27,
      "close_price_as_of": null,
      "cusip": "577130834",
      "institution_id": null,
      "institution_security_id": null,
      "is_cash_equivalent": false,
      "isin": "US5771308344",
      "iso_currency_code": "USD",
      "name": "Matthews Pacific Tiger Fund Insti Class",
      "proxy_security_id": null,
      "security_id": "JDdP7XPMklt5vwPmDN45t3KAoWAPmjtpaW7DP",
      "sedol": null,
      "ticker_symbol": "MIPTX",
      "type": "mutual fund",
      "unofficial_currency_code": null,
      "market_identifier_code": "XNAS",
      "option_contract": null
    }
  ]
}
```

##### Fetching investment transactions 

Select group for content switcher

Current librariesLegacy libraries

```javascript
const request: InvestmentsTransactionsGetRequest = {
  access_token: accessToken,
  start_date: '2019-01-01',
  end_date: '2019-06-10',
  options: {
    count: 250,
    offset: 0,
  },
};
try {
  const response = await plaidClient.investmentsTransactionsGet(request);
  const investmentTransactions = response.data.investment_transactions;
} catch (error) {
  // handle error
}
```

Sample response data is below.

```json
{
  "accounts": [
    {
      "account_id": "5e66Dl6jNatx3nXPGwZ7UkJed4z6KBcZA4Rbe",
      "balances": {
        "available": 100,
        "current": 110,
        "iso_currency_code": "USD",
        "limit": null,
        "unofficial_currency_code": null
      },
      "mask": "0000",
      "name": "Plaid Checking",
      "official_name": "Plaid Gold Standard 0% Interest Checking",
      "subtype": "checking",
      "type": "depository"
    },
    {
      "account_id": "KqZZMoZmBWHJlz7yKaZjHZb78VNpaxfVa7e5z",
      "balances": {
        "available": null,
        "current": 320.76,
        "iso_currency_code": "USD",
        "limit": null,
        "unofficial_currency_code": null
      },
      "mask": "5555",
      "name": "Plaid IRA",
      "official_name": null,
      "subtype": "ira",
      "type": "investment"
    },
    {
      "account_id": "rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj",
      "balances": {
        "available": null,
        "current": 23631.9805,
        "iso_currency_code": "USD",
        "limit": null,
        "unofficial_currency_code": null
      },
      "mask": "6666",
      "name": "Plaid 401k",
      "official_name": null,
      "subtype": "401k",
      "type": "investment"
    }
  ],
  "investment_transactions": [
    {
      "account_id": "rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj",
      "amount": -8.72,
      "cancel_transaction_id": null,
      "date": "2020-05-29",
      "fees": 0,
      "investment_transaction_id": "oq99Pz97joHQem4BNjXECev1E4B6L6sRzwANW",
      "iso_currency_code": "USD",
      "name": "INCOME DIV DIVIDEND RECEIVED",
      "price": 0,
      "quantity": 0,
      "security_id": "eW4jmnjd6AtjxXVrjmj6SX1dNEdZp3Cy8RnRQ",
      "subtype": "dividend",
      "type": "cash",
      "unofficial_currency_code": null
    },
    {
      "account_id": "rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj",
      "amount": -1289.01,
      "cancel_transaction_id": null,
      "date": "2020-05-28",
      "fees": 7.99,
      "investment_transaction_id": "pK99jB9e7mtwjA435GpVuMvmWQKVbVFLWme57",
      "iso_currency_code": "USD",
      "name": "SELL Matthews Pacific Tiger Fund Insti Class",
      "price": 27.53,
      "quantity": -47.74104242992852,
      "security_id": "JDdP7XPMklt5vwPmDN45t3KAoWAPmjtpaW7DP",
      "subtype": "sell",
      "type": "sell",
      "unofficial_currency_code": null
    },
    {
      "account_id": "rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj",
      "amount": 7.7,
      "cancel_transaction_id": null,
      "date": "2020-05-27",
      "fees": 7.99,
      "investment_transaction_id": "LKoo1ko93wtreBwM7yQnuQ3P5DNKbKSPRzBNv",
      "iso_currency_code": "USD",
      "name": "BUY DoubleLine Total Return Bond Fund",
      "price": 10.42,
      "quantity": 0.7388014749727547,
      "security_id": "NDVQrXQoqzt5v3bAe8qRt4A7mK7wvZCLEBBJk",
      "subtype": "buy",
      "type": "buy",
      "unofficial_currency_code": null
    }
  ],
  "item": {
    "available_products": ["assets", "balance", "identity", "transactions"],
    "billed_products": ["auth", "investments"],
    "consent_expiration_time": null,
    "error": null,
    "institution_id": "ins_12",
    "item_id": "8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq",
    "webhook": "https://www.genericwebhookurl.com/webhook"
  },
  "request_id": "iv4q3ZlytOOthkv",
  "securities": [
    {
      "close_price": 27,
      "close_price_as_of": null,
      "cusip": "577130834",
      "institution_id": null,
      "institution_security_id": null,
      "is_cash_equivalent": false,
      "isin": "US5771308344",
      "iso_currency_code": "USD",
      "name": "Matthews Pacific Tiger Fund Insti Class",
      "proxy_security_id": null,
      "security_id": "JDdP7XPMklt5vwPmDN45t3KAoWAPmjtpaW7DP",
      "sedol": null,
      "ticker_symbol": "MIPTX",
      "type": "mutual fund",
      "unofficial_currency_code": null,
      "market_identifier_code": "XNAS",
      "option_contract": null
    },
    {
      "close_price": 10.42,
      "close_price_as_of": null,
      "cusip": "258620103",
      "institution_id": null,
      "institution_security_id": null,
      "is_cash_equivalent": false,
      "isin": "US2586201038",
      "iso_currency_code": "USD",
      "name": "DoubleLine Total Return Bond Fund",
      "proxy_security_id": null,
      "security_id": "NDVQrXQoqzt5v3bAe8qRt4A7mK7wvZCLEBBJk",
      "sedol": null,
      "ticker_symbol": "DBLTX",
      "type": "mutual fund",
      "unofficial_currency_code": null,
      "market_identifier_code": "XNAS",
      "option_contract": null
    }
  ],
  "total_investment_transactions": 2
}
```

#### Next steps 

If you're ready to launch to Production, see the Launch checklist.

#### Launch checklist 

Recommended steps to take before launching in Production

[Launch](https://plaid.com/docs/launch-checklist/index.html.md)

## Python version:
Install and initialize Plaid libraries
You can use our official server-side client libraries to connect to the Plaid API from your application:

# Install through pip, only supports Python 3
pip install --upgrade plaid-python
After you've installed Plaid's client libraries, you can initialize them by passing in your client_id, secret, and the environment you wish to connect to (Sandbox or Production). This will make sure the client libraries pass along your client_id and secret with each request, and you won't need to explicitly include them in any other calls.

import plaid
from plaid.api import plaid_api

from flask import Flask
from flask import render_template
from flask import request
from flask import jsonify

app = Flask(name)

configuration = plaid.Configuration(
  host=plaid.Environment.Sandbox,
  api_key={
    'clientId': PLAID_CLIENT_ID,
    'secret': PLAID_SECRET,
  }
)

api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

# Additional server code goes here

if __name__ == "__main__":
    app.run(port=8000)
Create an Item in Link
Plaid Link is a drop-in module that provides a secure, elegant authentication flow for each institution that Plaid supports. Link makes it secure and easy for users to connect their bank accounts to Plaid. Note that these instructions cover Link on the web. For instructions on using Link within mobile apps, see the Link documentation.

Using Link, we will create a Plaid Item, which is a Plaid term for a login at a financial institution. An Item is not the same as a financial institution account, although every account will be associated with an Item. For example, if a user has one login at their bank that allows them to access both their checking account and their savings account, a single Item would be associated with both of those accounts. If you want to customize Link's look and feel, you can do so from the Dashboard.

Before initializing Link, you will need to create a new link_token on the server side of your application. A link_token is a short-lived, one-time use token that is used to authenticate your app with Link. You can create one using the /link/token/create endpoint. Then, on the client side of your application, you'll need to initialize Link with the link_token that you just created.

Create a link_token
request = LinkTokenCreateRequest(
  user=LinkTokenCreateRequestUser(
    client_user_id='user-abc',
    email_address='user@example.com'
  ),
  products=[Products('investments')],
  client_name='Investment Tracker',
  language='en',
  country_codes=[CountryCode('US')],
  webhook='https://sample-web-hook.com',
  redirect_uri='https://domainname.com/oauth-page.html'
)
# create link token
response = client.link_token_create(request)
link_token = response['link_token']
Install Link dependency
<head>
  <title>Connect a bank</title>
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
</head>
Configure the client-side Link handler
const linkHandler = Plaid.create({
  token: (await $.post('/create_link_token')).link_token,
  onSuccess: (public_token, metadata) => {
    // Send the public_token to your app server.
    $.post('/exchange_public_token', {
      public_token: public_token,
    });
  },
  onExit: (err, metadata) => {
    // Optionally capture when your user exited the Link flow.
    // Storing this information can be helpful for support.
  },
  onEvent: (eventName, metadata) => {
    // Optionally capture Link flow events, streamed through
    // this callback as your users connect an Item to Plaid.
  },
});

linkHandler.open();
Get a persistent access_token
Next, on the server side, we need to exchange our public_token for an access_token and item_id. The access_token will allow us to make authenticated calls to the Plaid API. Doing so is as easy as calling the /item/public_token/exchange endpoint from our server-side handler. We'll use the client library we configured earlier to make the API call.

Save the access_token and item_id in a secure datastore, as they’re used to access Item data and identify webhooks, respectively. The access_token will remain valid unless you actively chose to expire it via rotation or remove the corresponding Item via /item/remove. The access_token should be stored securely, and never in client-side code. A public_token is a one-time use token with a lifetime of 30 minutes, so there is no need to store it.

Select group for content switcher

Current libraries

Legacy libraries
access_token = None
item_id = None

@app.route('/exchange_public_token', methods=['POST'])
def exchange_public_token():
    global access_token
    public_token = request.form['public_token']
    request = ItemPublicTokenExchangeRequest(
      public_token=public_token
    )
    response = client.item_public_token_exchange(request)

    # These values should be saved to a persistent database and
    # associated with the currently signed-in user
    access_token = response['access_token']
    item_id = response['item_id']

    return jsonify({'public_token_exchange': 'complete'})
Fetching investment data
Now that the authentication step is out of the way, we can begin using authenticated endpoints from the Plaid API. Once you've retrieved investment data for an account, you can then use it to analyze data such as trading activity, net worth, and asset allocations.

Investments endpoints return two primary pieces of information about the investment account. The first is details on the holding itself (if using /investments/holdings/get) or the transaction (if using /investments/transactions/get). The second is details about the security itself. Each security, transaction, and holding contains a security_id field, which functions as a key for cross-referencing the holding or transaction with the security it pertains to. For more detailed information on the schema for information returned, see /investments/holdings/get or /investments/transactions/get.

Investments data is typically updated daily, after market close. To be alerted when new data is available to be retrieved, listen to Investments webhooks.

Fetching investment holdings
Select group for content switcher

Current libraries

Legacy libraries
import plaid
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest

# Pull Holdings for an Item
request = InvestmentsHoldingsGetRequest(access_token=access_token)
response = client.investments_holdings_get(request)

# Handle Holdings response
holdings = response['holdings']

# Handle Securities response
securities = response['securities']