Introduction to Investments  
=============================

#### View holdings and transactions from investment accounts 

Get started with Investments

[API Reference](https://plaid.com/docs/api/products/investments/index.html.md) [Quickstart](https://plaid.com/docs/quickstart/index.html.md)

#### Overview 

The Investments product allows you to obtain holding, security, and transactions data for investment-type accounts in financial institutions within the United States and Canada. This data can be used for personal financial management tools and wealth management analysis.

Looking for Plaid's solution to automate ACATS transfers and avoid friction, failures, and delays due to manual data entry? See [Investments Move](https://plaid.com/docs/investments-move/index.html.md) instead.

[Prefer to learn by watching? Get an overview of how Investments works in just 3 minutes!](https://www.youtube.com/watch?v=DYiKaQgYJ74)

#### Securities and holdings 

The [/investments/holdings/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentsholdingsget) endpoint provides both security data and holding data. Security data represents information about a specific security, such as its name, ticker symbol, and price. Security data is not specific to a user's account; any user who held the same security at the same financial institution at the same time would have identical security data.

```json
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
```

Holding data, by contrast, represents information about a user's specific ownership of that security, such as the number of shares owned and the cost basis. Each holding includes a `security_id` field that can be cross-referenced to a security for more detailed information about the security itself.

```json
{
  "account_id": "k67E4xKvMlhmleEa4pg9hlwGGNnnEeixPolGm",
  "cost_basis": 10,
  "institution_price": 10.42,
  "institution_price_as_of": null,
  "institution_value": 20.84,
  "iso_currency_code": "USD",
  "quantity": 2,
  "security_id": "NDVQrXQoqzt5v3bAe8qRt4A7mK7wvZCLEBBJk",
  "unofficial_currency_code": null
}
```

#### Transactions 

The [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) endpoint provides up to 24 months of investment transactions data. The schema for investment transactions is not the same as for transactions data returned by the [Transactions](https://plaid.com/docs/transactions/index.html.md) product, instead providing securities-specific information. Inflow, such as stock sales, is shown as a negative amount, and outflow, such as stock purchases, is positive. The [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) endpoint can only be used for investment-type accounts; for obtaining transaction history for other account types, use [Transactions](https://plaid.com/docs/transactions/index.html.md) .

```json
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
}
```

#### Investments transactions initialization behavior 

Unlike the Transactions product, Investments Transactions operates synchronously by default and will not fire a webhook to indicate when initial data is ready for an Item. If investments transactions data is not ready when [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) is first called, Plaid will wait for the data. For this reason, calling [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) immediately after Link may take up to one to two minutes to return.

If you are adding Investments to an Item by calling [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) [after the Item was originally linked](https://plaid.com/docs/link/initializing-products/index.html.md#adding-products-post-link) , instead of specifying the Investments product while calling [/link/token/create](https://plaid.com/docs/api/link/index.html.md#linktokencreate) , you can optionally request asynchronous behavior by specifying `async_update=true`. In this case, Investments will fire a [HISTORICAL\_UPDATE](https://plaid.com/docs/api/products/investments/index.html.md#investments_transactions-historical_update) webhook when data is ready to be fetched. In all other scenarios, Investments endpoints will operate synchronously and will not fire a webhook to indicate when the Item's initial data is available to be fetched.

#### Investments updates and webhooks 

Investments data is not static, since users' holdings will change as they trade and as market prices fluctuate. Plaid typically checks for updates to investment data overnight, after market hours. You can also request an update on-demand via the [/investments/refresh](https://plaid.com/docs/api/products/investments/index.html.md#investmentsrefresh) endpoint, which is available as an add-on for Investments customers. To request access to this endpoint, submit a [product access request](https://dashboard.plaid.com/settings/team/products) or contact your Plaid account manager.

There are two webhooks that are used for informing you of changes to investment data. The [DEFAULT\_UPDATE](https://plaid.com/docs/api/products/investments/index.html.md#holdings-default_update) webhook of type `HOLDINGS` fires when new holdings have been detected or the quantity or price of an existing holding has changed. The [DEFAULT\_UPDATE](https://plaid.com/docs/api/products/investments/index.html.md#investments_transactions-default_update) webhook of type `INVESTMENTS_TRANSACTIONS` fires when a new or canceled investment transaction has been detected.

When updating an Item with new Investments transactions data, it is recommended to call [/investments/transactions/get](https://plaid.com/docs/api/products/investments/index.html.md#investmentstransactionsget) with only the date range that needs to be updated, rather than the maximum available date range, in order to reduce the amount of data that you must receive and process.

#### Investments institution coverage 

By default, Investments provides access to data at over 2,400 institutions in the US and Canada.

Access to Fidelity Investments is available upon request. To request access, contact your Plaid Account Manager.

#### Testing Investments 

Investments can be tested in [Sandbox](https://plaid.com/docs/sandbox/index.html.md) without any additional permissions.

To test with realistic data, use the [custom user](https://github.com/plaid/sandbox-custom-users) . If provided real-world ticker symbols, Plaid will automatically populate securities with realistic data for both options and contracts. For examples, see the [sample Investments custom user](https://github.com/plaid/sandbox-custom-users/blob/main/investments/brokerage_custom_user.json) .

When using the custom Sandbox user, Investments must be placed in the `products` array of [/link/token/create](https://plaid.com/docs/api/link/index.html.md#linktokencreate) and cannot be used in the `optional_products`, `additional_consented_products`, or `required_if_supported_products` array. Omitting `investments` from the `products` array may cause custom Sandbox investments data not to be loaded.

#### Investments pricing 

Investments is billed on a [subscription model](https://plaid.com/docs/account/billing/index.html.md#subscription-fee) ; Investments Refresh is billed on a [per-request flat fee model](https://plaid.com/docs/account/billing/index.html.md#per-request-flat-fee) . To view the exact pricing you may be eligible for, [apply for Production access](https://dashboard.plaid.com/overview/production) or [contact Sales](https://plaid.com/contact/) . For more details about pricing and billing models, see [Plaid billing](https://plaid.com/docs/account/billing/index.html.md) .

#### Next steps 

To get started building with Investments, see [Add Investments to your App](https://plaid.com/docs/investments/add-to-app/index.html.md) .

If you're ready to launch to Production, see the Launch Center.

#### Launch Center 

See next steps to launch in Production

[Launch](https://dashboard.plaid.com/developers/launch-center)