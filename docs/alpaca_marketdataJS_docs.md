Alpaca Trade API JS
npm version CircleCI

Node.js library for Alpaca Trade API.

API Documentation
The REST API documentation can be found in https://docs.alpaca.markets. For detailed information about an endpoint, please consult the REST API docs. Documentation specific to this library can be found below.

News
We introduced Typescript support recently, which allows you to use strongly typed data structures and better IDE experience if you are using it.

Installation
npm install --save @alpacahq/alpaca-trade-api
Runtime Dependencies
Node.js v16.9 or newer
npm version 6 and above
Usage
Import the module first.

const Alpaca = require('@alpacahq/alpaca-trade-api')
Instantiate the API with config options, obtained from the dashboard at app.alpaca.markets.

const alpaca = new Alpaca({
  keyId: 'AKFZXJH121U18SHHDRFO',
  secretKey: 'pnq4YHlpMF3LhfLyOvmdfLmlz6BnASrTPQIASeiU',
  paper: true,
})
Note: keyId and secretKey may also be specified by setting the APCA_API_KEY_ID and APCA_API_SECRET_KEY environment variables, respectively. Also, rather than specifying paper, you may set APCA_API_BASE_URL as an environment variable to direct your API calls to the paper trading API.

Call methods, which will return a promise.

alpaca.getAccount().then((account) => {
  console.log('Current Account:', account)
})
The websocket api is a good way to watch and react to the market we have 2 types of websockets:

data websocket: get updates to data equities
account/trade websocket: get updates on your account
please refer to this example code to see how to use the websockets.

Data WS
The Alapca websocket service now supports V2. Make sure you update your old sample code accordingly.
You could use it even if you don't have a funded account.

Methods
As a general rule, required method parameters are passed as plain function arguments, and the final parameter is an object containing any optional parameters to the method.

Account API
Get Account
Calls GET /account and returns the current account.

getAccount() => Promise<Account>
Account Configurations API
Get Account Configurations
Calls GET /account/configurations and returns the current account configurations.

getAccountConfigurations() => Promise<AccountConfigurations>
Update Account Configurations
Calls PATCH /account/configurations to update the account configurations, and returns the updated configurations.

updateAccountConfigurations(AccountConfigurations) => Promise<AccountConfigurations>
Get Account Activities
Calls GET /account/activities and returns account activities.

getAccountActivities({
  activityTypes: string | string[], // Any valid activity type
  until: Date,
  after: Date,
  direction: string,
  date: Date,
  pageSize: number,
  pageToken: string
}) => Promise<AccountActivity[]>
Portfolio History API
Get Portfolio History
Calls GET /account/portfolio/history and returns portfolio history.

getPortfolioHistory({
  date_start: Date,
  date_end: Date,
  period: '1M' | '3M' | '6M' | '1A' | 'all' | 'intraday',
  timeframe: '1Min' | '5Min' | '15Min' | '1H' | '1D',
  extended_hours: Boolean
}) => Promise<PortfolioHistory>
Orders API
Create Order
Calls POST /orders and creates a new order.

createOrder({
  symbol: string, // any valid ticker symbol
  qty: number,
  notional: number, // qty or notional required, not both
  side: 'buy' | 'sell',
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop',
  time_in_force: 'day' | 'gtc' | 'opg' | 'ioc',
  limit_price: number, // optional,
  stop_price: number, // optional,
  client_order_id: string, // optional,
  extended_hours: boolean, // optional,
  order_class: string, // optional,
  take_profit: object, // optional,
  stop_loss: object, // optional,
  trail_price: string, // optional,
  trail_percent: string // optional,
}) => Promise<Order>
Get Orders
Calls GET /orders and returns a list of orders.

getOrders({
  status: 'open' | 'closed' | 'all',
  after: Date,
  until: Date,
  limit: number,
  direction: 'asc' | 'desc'
}) => Promise<Order[]>
Get Order by ID
Calls GET /orders/{id} and returns an order.

getOrder(uuid) => Promise<Order>
Get Order by Client ID
Calls GET /orders:by_client_order_id and returns an order by client_order_id. You can set client_order_id upon order creation to more easily keep track of your orders.

getOrderByClientOrderId(string) => Promise<Order>
Update Order by ID
Calls PATCH /orders/{id} and updates an existing open order. The updated order will have a new ID.

replaceOrder(uuid) => Promise<Order>
Cancel Order
Calls DELETE /orders/{id} and deletes an order.

cancelOrder(uuid) => Promise
Cancel all Orders
Calls DELETE /orders and deletes all open orders.

cancelAllOrders() => Promise
Positions API
Get Position
Calls GET /positions/{symbol} and returns a position.

getPosition(symbol) => Promise<Position>
Get All Positions
Calls GET /positions and returns all positions.

getPositions() => Promise<Position[]>
Close a Position
Calls DELETE /positions/{symbol} and liquidates your position in the given symbol.

closePosition(symbol) => Promise
Close all Positions
Calls DELETE /positions and liquidates all open positions.

closeAllPositions() => Promise
Assets API
Get All Assets
Calls GET /assets and returns assets matching your parameters.

getAssets({
  status: 'active' | 'inactive',
  asset_class: string
}) => Promise<Asset[]>
Get information about an asset
Calls GET /assets/{symbol} and returns an asset entity.

getAsset(symbol) => Promise<Asset>
Calendar API
Calls GET /calendar and returns the market calendar.

getCalendar({ start: Date, end: Date }) => Promise<Calendar[]>
Clock API
Calls GET /clock and returns the market clock.

getClock() => Promise<Clock>
Watchlist API
available methods for you to use:

module.exports = {
    getWatchlists,
    getWatchlist,
    addWatchlist,
    addToWatchlist,
    updateWatchlist,
    deleteWatchlist,
    deleteFromWatchlist,
}
Get All Watchlists
alpaca.getWatchlists().then((response) => {
  console.log(response)
})
Get Specific Watchlist
 // xxxx.. are the watchlist id you get on creation or with get all
 alpaca.getWatchlist('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').then((response) => {
   console.log(response)
 })
Add a Watchlist
alpaca.addWatchlist("myWatchList", []).then((response) => {
  console.log(response)
})
Add to Watchlist
alpaca.addToWatchlist('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', "AAPL").then((response) => {
  console.log(response)
})
Update a Watchlist
alpaca.updateWatchlist("myWatchList", ["AAPL", "GOOG"]).then((response) => {
  console.log(response)
})
Delete a Watchlist
alpaca.deleteWatchlist('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').then((response) => {
  console.log(response)
})
Delete from Watchlist
alpaca.deleteFromWatchlist('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', "AAPL").then((response) => {
  console.log(response)
})
Data API - Stocks
Trades
getTradesV2(
  symbol: string,
  options: GetTradesParams,
  config?: any,
): AsyncGenerator<AlpacaTrade, void, unknown>;
getMultiTradesV2(
  symbols: Array<string>,
  options: GetTradesParams,
  config?: any,
): Promise<Map<string, AlpacaTrade[]>>;
getMultiTradesAsyncV2(
  symbols: Array<string>,
  options: GetTradesParams,
  config?: any,
): AsyncGenerator<AlpacaTrade, void, unknown>;
getLatestTrade(
  symbol: string,
  config?: any,
): Promise<AlpacaTrade>;
getLatestTrades(
  symbols: Array<string>,
  config?: any,
): Promise<Map<string, AlpacaTrade>>;
Example
const trade = await alpaca.getLatestTrade('AAPL');
console.log(trade);
Output:
{
  Timestamp: '2022-04-14T13:54:24.907840256Z',
  Exchange: 'P',
  Price: 169.33,
  Size: 100,
  Conditions: [ '@' ],
  ID: 12272,
  Tape: 'C'
}
Quotes
getQuotesV2(
  symbol: string,
  options: GetQuotesParams,
  config?: any,
): AsyncGenerator<AlpacaQuote, void, unknown>;
getMultiQuotesV2(
  symbols: Array<string>,
  options: GetQuotesParams,
  config?: any,
): Promise<Map<string, AlpacaQuote[]>>;
getMultiQuotesAsyncV2(
  symbols: Array<string>,
  options: GetQuotesParams,
  config?: any,
): AsyncGenerator<AlpacaQuote, void, unknown>;
 getLatestQuote(
   symbol: string,
   config?: any,
): Promise<AlpacaQuote>;
getLatestQuotes(
   symbols: Array<string>,
   config?: any,
): Promise<Map<string, AlpacaQuote>>;
Example
const trades = await alpaca.getMultiTradesV2(["PFE", "SPY"], {
  start: "2022-04-18T08:30:00Z",
  end: "2022-04-18T08:31:00Z",
  limit: 2,
});
console.log(trades);
Output:
{
  'PFE' => [
    {
      Timestamp: '2022-04-18T08:30:59.988642304Z',
      Exchange: 'P',
      Price: 53.25,
      Size: 5,
      Conditions: [Array],
      ID: 52983525028174,
      Tape: 'A',
      Symbol: 'PFE'
    }
  ],
  'SPY' => [
    {
      Timestamp: '2022-04-18T08:30:00.066013952Z',
      Exchange: 'P',
      Price: 436.39,
      Size: 1,
      Conditions: [Array],
      ID: 52983525028949,
      Tape: 'B',
      Symbol: 'SPY'
    }
  ]
}
Bars
 getBarsV2(
   symbol: string,
   options: GetBarsParams,
   config?: any,
 ): AsyncGenerator<AlpacaBar, void, unknown>;
getMultiBarsV2(
  symbols: Array<string>,
  options: GetBarsParams,
  config?: any,
): Promise<Map<string, AlpacaBar[]>>;
 getMultiBarsAsyncV2(
   symbols: Array<string>,
   options: GetBarsParams,
   config?: any,
 ): AsyncGenerator<AlpacaBar, void, unknown>;
 getLatestBar(
  symbol: string,
  config?: any,
): Promise<AlpacaBar>;
getLatestBars(
  symbols: Array<string>,
  config?: any,
): Promise<Map<string, AlpacaBar>>;
Example
const bars = alpaca.getBarsV2("AAPL", {
  start: "2022-04-01",
  end: "2022-04-02",
  timeframe: alpaca.newTimeframe(30, alpaca.timeframeUnit.MIN),
  limit: 2,
});
const got = [];
for await (let b of bars) {
  got.push(b);
}
console.log(got);
Output:
[
  {
    Timestamp: '2022-04-01T08:00:00Z',
    OpenPrice: 175.25,
    HighPrice: 175.88,
    LowPrice: 175.1,
    ClosePrice: 175.35,
    Volume: 30015,
    TradeCount: 721,
    VWAP: 175.357657
  },
  {
    Timestamp: '2022-04-01T08:30:00Z',
    OpenPrice: 175.32,
    HighPrice: 175.37,
    LowPrice: 175.26,
    ClosePrice: 175.26,
    Volume: 5929,
    TradeCount: 123,
    VWAP: 175.332243
  }
]
Snapshots
getSnapshot(
  symbol: string,
  config?: any,
): Promise<AlpacaSnapshot>;
getSnapshots(
  symbols: Array<string>,
  config?: any,
): Promise<AlpacaSnapshot[]>;
Example
const snapshot = await alpaca.getSnapshot("TSLA");
console.log(snapshot);
Output:
{
  symbol: 'TSLA',
  LatestTrade: {
    Timestamp: '2022-04-19T10:09:23.844940801Z',
    Exchange: 'Q',
    Price: 1003,
    Size: 501,
    Conditions: [ '@', 'F', 'T' ],
    ID: 1861,
    Tape: 'C'
  },
  LatestQuote: {
    Timestamp: '2022-04-19T10:10:09.139921353Z',
    AskExchange: 'Q',
    AskPrice: 1004.38,
    AskSize: 1,
    BidExchange: 'Q',
    BidPrice: 1001,
    BidSize: 3,
    Conditions: [ 'R' ],
    Tape: 'C'
  },
  MinuteBar: {
    Timestamp: '2022-04-19T10:09:00Z',
    OpenPrice: 1003,
    HighPrice: 1003,
    LowPrice: 1003,
    ClosePrice: 1003,
    Volume: 647,
    TradeCount: 17,
    VWAP: 1003.071345
  },
  DailyBar: {
    Timestamp: '2022-04-18T04:00:00Z',
    OpenPrice: 989.19,
    HighPrice: 1014.92,
    LowPrice: 973.41,
    ClosePrice: 1004.29,
    Volume: 17209682,
    TradeCount: 543314,
    VWAP: 997.42604
  },
  PrevDailyBar: {
    Timestamp: '2022-04-14T04:00:00Z',
    OpenPrice: 998.51,
    HighPrice: 1012.7099,
    LowPrice: 982.19,
    ClosePrice: 985,
    Volume: 19449944,
    TradeCount: 579328,
    VWAP: 991.712944
  }
}
More detailed examples of stock data endpoints can be found in this file.

News
 getNews(
   options: GetNewsParams,
   config?: any,
 ): Promise<AlpacaNews[]>;
Details of the options parameter can be found here.

Example
 const news = await alpaca.getNews({});
 console.log(news[0]);
Output:
{
  ID: 26682466,
  Headline: 'Plug Power Enters Agreement With Walmart Pursuant To Which The Co. Will Deliver Liquid Green Hydrogen To New And Existing Walmart Sites In The United States',
  Author: 'Bill Haddad',
  CreatedAt: '2022-04-19T10:09:38Z',
  UpdatedAt: '2022-04-19T10:09:39Z',
  Summary: '',
  URL: 'https://www.benzinga.com/news/22/04/26682466/plug-power-enters-agreement-with-walmart-pursuant-to-which-the-co-will-deliver-liquid-green-hydrogen',
  Images: [],
  Symbols: [ 'PLUG', 'WMT' ],
  Source: 'benzinga'
}
Data API - Crypto
All the functions are similar to the stock ones.

Trades
  getCryptoTrades(
    symbols: Array<string>,
    options: GetCryptoTradesParams,
    config?: any,
  ): AsyncGenerator<CryptoTrade, void, unknown>;
  getLatestCryptoTrades(
    symbols: Array<string>,
    config?: any
  ): Promise<Map<string, CryptoTrade>>;
Quotes
  getCryptoQuotes(
    symbols: Array<string>,
    options: GetCryptoQuotesParams,
    config?: any,
  ): AsyncGenerator<CryptoQuote, void, unknown>;
 getLatestCryptoQuotes(
  symbols: Array<string>,
  config?: any,
): Promise<Map<string, CryptoQuote>>;
Bars
   getCryptoBars(
    symbols: Array<string>,
    options: GetCryptoBarsParams,
    config?: any,
  ): AsyncGenerator<CryptoBar, void, unknown>;
  getLatestCryptoBars(
    symbols: Array<string>,
    config?: any,
  ): Promise<Map<string, CryptoBar>>;
Snapshots
  getCryptoSnapshots(
    symbol: Array<string>,
    config?: any,
  ): Promise<CryptoSnapshot>;
Data API - Options
Bars
  getOptionBars(
    symbols: Array<string>,
    options: GetOptionBarsParams,
    config?: any,
  ): Promise<Map<string, AlpacaOptionBar[]>>;
Trades
  getOptionTrades(
    symbols: Array<string>,
    options: GetOptionTradesParams,
    config = any,
  ): Promise<Map<string, AlpacaOptionTrade[]>>;
  getOptionLatestTrades(
    symbols: Array<string>,
    config = any,
  ): Promise<Map<string, AlpacaOptionTrade>>;
Quotes
 getOptionLatestQuotes(
   symbols: Array<string>,
   config = any,
 ): Promise<Map<string, AlpacaOptionQuote>>;
Snapshots
  getOptionSnapshots(
    symbols: Array<string>,
    config = any,
  ): Promise<AlpacaOptionSnapshot[]>;
  getOptionChain(
    underlyingSymbols: string,
    options: GetOptionChainParams,
    config = any,
  ): Promise<AlpacaOptionSnapshot[]>;
Data API - Corporate Actions
  getCorporateActions(
    symbols: Array<string>,
    options: GetCorporateActionParams,
    config = any
  ): Promise<CorporateActions | undefined>;
Websockets
You can use data websocket with or without a funded account.

Working with websocket
const websocket = alpaca.data_stream_v2;
websocket.onConnect(() => {
  websocket.subscribeForTrades(["AAPL"]);
});
websocket.onStateChange((status) => {
  console.log("Status:", status);
});
websocket.onError((err) => {
  console.log("Error:", err);
});
websocket.onStockTrade((trade) => {
  console.log("Trade:", trade);
});
websocket.connect();
Output:
Status: connecting
Status: authenticating
Status: connected
Status: authenticated
Trade:  {
  T: 't',
  Symbol: 'AAPL',
  ID: 68,
  Exchange: 'V',
  Price: 165.02,
  Size: 50,
  Conditions: [ '@', 'T', 'I' ],
  Tape: 'C',
  Timestamp: 2022-04-19T12:50:29.214Z
}
The websocket is created when you first create the Alpaca instance
const websocket = alpaca.data_stream_v2: Get the websocket client instance.
websocket.connect(): Connect to the Alpaca server using websocket.
websocket.onConnect(() => {}): all the following code will be executed after the user authentication. You can also subscribe and unsubscribe for data outside this function.
websocket.subscribeForTrades(["AAPL"]): Subscribe for trades data for the given symbol(s). You can do the same with quotes, bars, dailyBars, updatedBars, statuses and lulds.
websocket.onStockTrade((trade) => {}): Get the data by subscribing for the trade data event in JS/TS and process it inside this function.
websocket.unsubscribeFromTrades(["symbol"]): Unsubscribe from symbol(s).
websocket.onDisconnect(() => {}) and websocket.disconnect(): the function inside the onDisconnect will run when you disconnect then closes the connection between the client and server.

Websocket client for real-time crypto and news data work the same. For a detailed example please take a look at this file.