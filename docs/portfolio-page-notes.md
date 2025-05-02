# Portfolio Page Revamp Plan

**Goal:** Create a comprehensive, user-friendly portfolio page for retail investors (18-35, <$1M net worth) that displays key performance, risk, and holding information by connecting to the user's Alpaca account.

**Guiding Principles:**
*   Prioritize clarity and ease of understanding over complex financial jargon.
*   Ensure data accuracy by fetching directly from Alpaca via backend APIs.
*   Maintain a consistent, aesthetic dark theme based on the Figma design.
*   Implement robust error handling and loading states.

---

## I. Backend API Setup (`backend/api_server.py`)

**Objective:** Create secure API endpoints to fetch necessary data from Alpaca Broker API for the frontend.

1.  **Authentication:** Ensure all endpoints require user authentication and securely retrieve the user's Alpaca `account_id`.
2.  **Portfolio History Endpoint:**
    *   Create endpoint `/api/portfolio/history`.
    *   Accept query parameters: `period` (e.g., '1M', '6M', '1Y', 'MAX') or potentially `start`/`end` dates. Map 'MAX' to query history since account creation.
    *   Use `BrokerClient.get_portfolio_history_for_account`.
    *   Input `account_id` and map frontend `period` to appropriate `GetPortfolioHistoryRequest` parameters (`period`, `timeframe`, potentially `intraday_reporting`, `pnl_reset`, `force_engine_version='v2'`).
        *   For 'MAX' or periods > 30 days, use `timeframe='1D'`.
        *   For shorter periods, consider appropriate intraday timeframes (e.g., '15Min' or '1H'). Use `intraday_reporting='market_hours'` as a default unless crypto focus requires `continuous`. Use `pnl_reset='no_reset'` for cumulative PnL display.
    *   Return the relevant fields: `timestamp`, `equity`, `profit_loss`, `profit_loss_pct`, `base_value`. Handle potential errors from Alpaca.
3.  **Positions Endpoint:**
    *   Create endpoint `/api/portfolio/positions`.
    *   Use `BrokerClient.get_all_positions_for_account` with the user's `account_id`.
    *   Return the list of `Position` objects. Handle cases where there are no positions.
4.  **Risk & Diversification Scores Endpoint:**
    *   Create endpoint `/api/portfolio/analytics`.
    *   Fetch current positions using `BrokerClient.get_all_positions_for_account`.
    *   Map Alpaca `Position` objects to the `PortfolioPosition` objects expected by `PortfolioAnalyticsEngine` (ensure necessary fields like `asset_class`, `market_value`, `security_type` are mapped correctly. May need to fetch `Asset` details via `BrokerClient.get_asset` if `security_type` isn't directly on the `Position` object).
    *   Call `PortfolioAnalyticsEngine.calculate_risk_score` and `PortfolioAnalyticsEngine.calculate_diversification_score`.
    *   Return the calculated scores (e.g., `{ "risk_score": score1, "diversification_score": score2 }`).
5.  **Asset Details Endpoint (Optional but recommended for Industry):**
    *   Create endpoint `/api/assets/{symbol_or_asset_id}`.
    *   Use `BrokerClient.get_asset` to fetch details for a specific asset.
    *   Investigate if the `Asset` object contains reliable `sector` or `industry` information. If not, this endpoint might only return basic info, and industry breakdown may need simplification or external data.
    *   Return relevant asset details.
6.  **Order History Endpoint:**
    *   Create endpoint `/api/portfolio/orders`.
    *   Accept optional query parameters for pagination (`limit`, `after`, etc.) and status (`status='closed'` might be useful).
    *   Use `BrokerClient.get_orders_for_account` with appropriate `GetOrdersRequest` filters.
    *   Return a list of relevant `Order` objects (or formatted transaction data).
7.  **"Add Funds" Functionality:** Verify the existing backend logic for adding funds is robust and doesn't need changes, only the frontend location will be updated.

---

## II. Frontend Implementation (Assuming React/Next.js)

**Objective:** Build the UI components, fetch data from the backend APIs, and display it according to the Figma design.

1.  **Overall Page Structure (`/pages/portfolio.js` or similar):**
    *   Set up the main page component.
    *   Implement fetching logic (e.g., using `useEffect`, `SWR`, or `React Query`) to call the backend APIs on page load.
    *   Manage loading states (show spinners/skeletons) and error states (show user-friendly messages).
    *   Organize the layout with distinct sections for each widget/component.

2.  **Portfolio History Chart Component:**
    *   **State:** Manage selected time range ('1M', '6M', '1Y', 'MAX'), chart data, loading/error status, all-time performance string.
    *   **Data Fetching:** Call `/api/portfolio/history` initially (e.g., for 'MAX' or default range) and refetch when a time range button is clicked, passing the new `period`.
    *   **Calculations:**
        *   Determine the all-time performance string from the 'MAX' data (`equity[-1] - base_value` for dollar amount, `profit_loss_pct[-1]` for percent).
        *   Determine chart color: Compare `equity[0]` and `equity[-1]` for the selected period. Green if `equity[-1] >= equity[0]`, Red otherwise.
    *   **UI:**
        *   Display the all-time performance string prominently above the chart.
        *   Use a charting library (e.g., Recharts, Chart.js) to render the line chart based on `timestamp` and `equity` data.
        *   Style the line and area gradient fill according to the calculated red/green color.
        *   Implement interactive tooltips showing date and equity value on hover.
        *   Create buttons for '1M', '6M', '1Y', 'MAX'. Style the active button. Handle click events to update the state and trigger data refetching.
        *   Format timestamps/dates on the X-axis appropriately for the selected range.
        *   Format currency values on the Y-axis.

3.  **Risk & Diversification Scores Component:**
    *   **State:** Manage risk score, diversification score, loading/error status.
    *   **Data Fetching:** Call `/api/portfolio/analytics` on initial load.
    *   **Automatic Updates (Polling Strategy):**
        *   Use `setInterval` within a `useEffect` hook (with proper cleanup) to refetch data from `/api/portfolio/analytics` every 5 minutes (or a configurable interval).
        *   Update the component state with the new scores.
    *   **UI:**
        *   Create visual representations for the scores (e.g., horizontal bars/gauges from 0-10).
        *   Use conditional styling (CSS or styled-components) to apply color gradients:
            *   **Risk:** 1 (Green) -> 5 (Yellow) -> 10 (Red).
            *   **Diversification:** 1 (Red) -> 5 (Yellow) -> 10 (Green).
        *   Display the numerical score alongside the visual representation.
        *   Add brief, user-friendly descriptions for each score (e.g., "Your portfolio risk is moderate," "Your portfolio is well diversified").

4.  **Asset/Industry Exposure Pie Chart Component:**
    *   **State:** Manage chart data (asset class vs. industry), selected view ('Asset Class' or 'Industry'), loading/error status.
    *   **Data Fetching:** Call `/api/portfolio/positions` on load.
    *   **Calculations (Frontend or Backend):**
        *   **Asset Class:** Group positions by `asset_class`, sum `market_value` for each class, calculate percentages of the total portfolio market value.
        *   **Industry:** *Requires investigation.* If industry data is available from `/api/assets/{symbol}` or directly on positions: Group positions by industry, sum `market_value`, calculate percentages. If not readily available, consider simplifying this view (e.g., only show Asset Class) or using a placeholder.
    *   **UI:**
        *   Use a pie chart library (e.g., Recharts) to display the data.
        *   Implement toggle buttons/tabs for 'Asset Class' and 'Industry' views. Update the chart data source when toggled.
        *   Configure interactive tooltips to show the category name and percentage on hover.
        *   Include a legend mapping colors to asset classes/industries.

5.  **"What If" Calculator Component:**
    *   **State:** Manage input values (initial investment, annual investment, time horizon, investment strategy/expected return). Manage calculated future value projection data.
    *   **Calculations:** Implement compound growth formula based on user inputs. This is purely frontend logic. The "Investment Strategy" could map to predefined expected annual return rates (e.g., Conservative: 4%, Moderate: 7%, Aggressive: 10%). Initial investment could default to the current portfolio value fetched elsewhere.
    *   **UI:**
        *   Use input fields, sliders, or dropdowns for user inputs (Initial Investment, Annual Investment, Time Horizon, Investment Strategy).
        *   Display the projected future value prominently.
        *   Optionally, show a simple chart visualizing the growth projection over the selected time horizon.
        *   Include clear disclaimers that this is a hypothetical projection and not a guarantee of future results.

6.  **Holdings List Component:**
    *   **State:** Manage holdings data, loading/error status, potentially sorting state.
    *   **Data Fetching:** Call `/api/portfolio/positions` on load.
    *   **Calculations:**
        *   Calculate the total portfolio market value to determine the 'Weight (%)' for each position (`position.market_value / total_market_value * 100`).
        *   Format data (currency, percentages).
        *   **Clarification:** "Date Bought" is not directly available on Alpaca positions. Use `avg_entry_price` for "Initial Price". Consider omitting "Date Bought" or investigating feasibility of retrieving the first purchase date from order history (complex). Propose using "Avg. Cost Basis" instead of "Initial Price" if more accurate.
    *   **UI:**
        *   Use a table component to display the holdings.
        *   Columns: Name (fetch from asset details if needed), Ticker (`symbol`), Avg. Cost Basis (`avg_entry_price`), Current Price (`current_price`), Shares (`qty`), Market Value (`market_value`), Total Return (`unrealized_pl` / `unrealized_plpc`), Weight (%).
        *   Implement sorting for columns if desired.
        *   Consider pagination or virtual scrolling if the list can be very long.
        *   Ensure clear headers and readable formatting.

7.  **Transaction History Component:**
    *   **State:** Manage transaction data, loading/error status, pagination state.
    *   **Data Fetching:** Call `/api/portfolio/orders` on load, potentially with default filters like `status=filled`. Implement logic for loading more transactions (pagination).
    *   **Calculations:** Format dates (`filled_at` or `submitted_at`), currency (`filled_avg_price`), quantities (`filled_qty`). Map `side` to 'Buy'/'Sell'.
    *   **UI:**
        *   Use a table component.
        *   Columns: Date (`filled_at`), Ticker (`symbol`), Type (`side`), Quantity (`filled_qty`), Price (`filled_avg_price`), Status (`status`).
        *   Implement pagination controls (e.g., "Load More" button or page numbers).
        *   Consider filtering options (e.g., by date range, type).

8.  **"Add Funds" Button Component:**
    *   Identify the existing component code used on the `/dashboard` page.
    *   Move the component files/code to the `/portfolio` page structure.
    *   Place the button prominently, likely near the Risk/Diversification widget as shown in Figma.
    *   Ensure the onClick handler and associated logic (modal display, API call) function correctly in the new location.

---

## III. Testing and Refinement

1.  **Backend:** Test API endpoints with various scenarios (valid account, invalid account, no positions, many positions, different time ranges).
2.  **Frontend:**
    *   Test data fetching and display for all components.
    *   Test loading and error states.
    *   Test interactivity (chart time range buttons, pie chart toggle, calculator inputs, table sorting/pagination).
    *   Test responsiveness across different screen sizes.
    *   Verify calculations (percentages, performance, risk scores).
    *   Cross-reference UI against the Figma design.
3.  **User Experience:** Review the flow and information presentation from the perspective of the target demographic. Simplify language and visuals where necessary. Ensure disclaimers for projections are clear.

---

## IV. Deployment

1.  Deploy backend API changes.
2.  Deploy frontend changes.
3.  Monitor logs and performance post-deployment.


## Alpaca Portfolio History API Notes (Backend)

During implementation of the `/api/portfolio/{account_id}/history` endpoint, several important details about the Alpaca Python SDK were identified:

1.  **Client Discrepancy:** The method to fetch portfolio history for a specific account, `get_portfolio_history_for_account`, resides on the `BrokerClient` (from `alpaca.broker.client`).
2.  **Request Object Origin:** However, the necessary request parameter object, `GetPortfolioHistoryRequest`, must be imported from the *trading* module: `from alpaca.trading.requests import GetPortfolioHistoryRequest`.
3.  **Parameter Name:** The `get_portfolio_history_for_account` method expects the `GetPortfolioHistoryRequest` object to be passed via the `history_filter` parameter.
4.  **`GetPortfolioHistoryRequest` Parameters:** The valid parameters for the `GetPortfolioHistoryRequest` class constructor are:
    *   `period: Optional[str]` (e.g., '1M', '1A', '1D')
    *   `timeframe: Optional[str]` (e.g., '1Min', '5Min', '15Min', '1H', '1D')
    *   `start: Optional[datetime]` (Start timestamp)
    *   `end: Optional[datetime]` (End timestamp)
    *   `intraday_reporting: Optional[str]` (e.g., 'market_hours', 'extended_hours', 'continuous')
    *   `pnl_reset: Optional[str]` (e.g., 'no_reset')
    *   `extended_hours: Optional[bool]`
    *   `cashflow_types: Optional[str]`
5.  **Period Value Format:** 
    *   Alpaca **ONLY** accepts these time unit specifiers: `D` (day), `W` (week), `M` (month), and `A` (year).
    *   The frontend may use `Y` for years (e.g., '1Y'), which must be converted to `A` (e.g., '1A') before passing to Alpaca.
    *   The value 'MAX' should also be converted (e.g., to '1A') as it's not directly supported by Alpaca.
    *   Examples of valid period values: '1D', '5D', '1W', '1M', '3M', '6M', '1A'
    *   Common conversion mapping:
        *   '1Y' → '1A'
        *   'MAX' → '1A' (or the longest period allowed)

**Incorrect Usage:** Passing parameters directly as keyword arguments (e.g., `broker_client.get_portfolio_history_for_account(..., period='1M', timeframe='1D')`) will result in a `TypeError` because the method expects the `history_filter` object.

**Correct Usage Example:**

```python
from alpaca.trading.requests import GetPortfolioHistoryRequest
from alpaca.broker.client import BrokerClient
import datetime

# Assuming broker_client is an initialized BrokerClient instance

history_filter = GetPortfolioHistoryRequest(
    period='1A',
    timeframe='1D',
    start=datetime.datetime(2023, 1, 1),
    end=datetime.datetime(2023, 12, 31),
    extended_hours=False
)

portfolio_history = broker_client.get_portfolio_history_for_account(
    account_id="YOUR_ACCOUNT_ID",
    history_filter=history_filter
)
```

Remember to handle potential `ImportError` for `GetPortfolioHistoryRequest` and check if the class is available before using it, especially if using mixed imports or older SDK versions.


## Real-Time Portfolio Value Tracking System

### Overview

To provide users with real-time portfolio value updates ("Today's Return" and "Total Portfolio Value") that update live during market hours, we need to implement a multi-component system that efficiently polls market data and computes portfolio values with minimal delay. This document outlines the technical architecture and implementation steps required.

### System Architecture

The real-time portfolio value tracking system consists of these key components:

1. **Backend WebSocket Server**: A dedicated service that maintains open connections with connected clients and pushes portfolio updates
2. **Centralized Market Data Consumer**: A single component that subscribes to real-time asset price updates from Alpaca for all unique symbols held by all users
3. **Shared Price Cache**: A Redis store containing the latest prices for all tracked symbols
4. **Portfolio Calculator**: A service that computes portfolio value based on current positions and latest price data from the shared cache
5. **Client WebSocket Consumer**: Frontend component that receives and displays real-time updates

### Data Flow

1. **Symbol Collection**: System periodically fetches all unique symbols held across all user accounts using a single Broker API call
2. **Centralized Market Data Subscription**: A single market data stream subscribes to quotes for all unique symbols
3. **Shared Price Updates**: When new quote data arrives, it updates a shared Redis cache
4. **On-Demand Portfolio Calculation**: Portfolio values are calculated using the latest prices from the shared cache
5. **User Updates**: Updates are pushed to connected clients via WebSockets

### Optimization Strategy

The key optimization in this system is that we're subscribing to market data only once per symbol, regardless of how many users hold that asset. This provides several benefits:

1. **Reduced API Calls**: Instead of each user requesting the same market data separately, we make a single subscription for all unique symbols
2. **Lower Resource Usage**: Significantly reduces network traffic, memory usage, and CPU load
3. **Improved Scalability**: The system can scale to millions of users with minimal additional overhead for market data
4. **Cost Efficiency**: Potentially reduces API usage costs by eliminating redundant data requests

### Implementation Plan

#### 1. Symbol Collection Service

This service identifies all unique symbols held across all user accounts:

```python
# backend/symbol_collector.py
import os
import asyncio
import redis
import json
from alpaca.broker import BrokerClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Redis client
redis_client = redis.Redis(host='localhost', port=6379, db=0)

# Initialize Broker client with BROKER API credentials
broker_api_key = os.getenv("BROKER_API_KEY")
broker_secret_key = os.getenv("BROKER_SECRET_KEY")
broker_client = BrokerClient(broker_api_key, broker_secret_key, sandbox=False)

# Track account positions and symbols globally
all_account_positions = {}  # account_id -> list of positions
unique_symbols = set()  # set of all unique symbols across accounts

async def collect_symbols():
    """Collect all unique symbols across all accounts and store in Redis"""
    global all_account_positions, unique_symbols
    
    try:
        # Use the efficient get_all_accounts_positions method to get positions for all accounts in one call
        all_positions = broker_client.get_all_accounts_positions()
        
        # Extract positions dictionary from the AllAccountsPositions object
        positions_dict = all_positions.positions
        
        # Update our global tracking variables
        all_account_positions = positions_dict
        
        # Extract unique symbols from all accounts
        new_unique_symbols = set()
        for account_id, positions in positions_dict.items():
            for position in positions:
                new_unique_symbols.add(position.symbol)
        
        # Identify symbols to add and remove from tracking
        symbols_to_add = new_unique_symbols - unique_symbols
        symbols_to_remove = unique_symbols - new_unique_symbols
        
        # Update our global set of unique symbols
        unique_symbols = new_unique_symbols
        
        # Store the updated symbol list in Redis for other services to access
        redis_client.set('tracked_symbols', json.dumps(list(unique_symbols)))
        
        # Store account positions for easy access by the portfolio calculator
        for account_id, positions in positions_dict.items():
            # Store each account's positions in Redis
            # Serialize each position object for storage
            serialized_positions = []
            for position in positions:
                # Extract relevant fields from position object
                pos_dict = {
                    'symbol': position.symbol,
                    'qty': str(position.qty),
                    'market_value': str(position.market_value),
                    'cost_basis': str(position.cost_basis),
                    'unrealized_pl': str(position.unrealized_pl),
                    'unrealized_plpc': str(position.unrealized_plpc),
                    'current_price': str(position.current_price),
                }
                serialized_positions.append(pos_dict)
            
            redis_client.set(f'account_positions:{account_id}', json.dumps(serialized_positions))
        
        print(f"Symbol collection complete. Tracking {len(unique_symbols)} unique symbols.")
        print(f"Symbols added: {symbols_to_add}")
        print(f"Symbols removed: {symbols_to_remove}")
        
        # Publish symbols_to_add and symbols_to_remove for the market data consumer to update subscriptions
        if symbols_to_add or symbols_to_remove:
            redis_client.publish('symbol_updates', json.dumps({
                'add': list(symbols_to_add),
                'remove': list(symbols_to_remove)
            }))
            
        return symbols_to_add, symbols_to_remove
        
    except Exception as e:
        print(f"Error collecting symbols: {e}")
        return set(), set()

async def run_symbol_collector():
    """Run the symbol collector periodically"""
    while True:
        await collect_symbols()
        # Wait for 5 minutes before checking again
        # This interval can be adjusted based on how frequently users' portfolios change
        await asyncio.sleep(300)  # 5 minutes

if __name__ == "__main__":
    asyncio.run(run_symbol_collector())
```

#### 2. Centralized Market Data Consumer

This component subscribes to a single market data stream for all symbols and updates the shared cache:

```python
# backend/market_data_consumer.py
import os
import asyncio
import json
import redis
from alpaca.data.live import StockDataStream
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Redis client
redis_client = redis.Redis(host='localhost', port=6379, db=0)
pubsub = redis_client.pubsub()

# Initialize Alpaca StockDataStream with TRADING/MARKET DATA API credentials (not Broker credentials)
market_api_key = os.getenv("APCA_API_KEY_ID")
market_secret_key = os.getenv("APCA_API_SECRET_KEY")
stock_stream = StockDataStream(market_api_key, market_secret_key)

# Track which symbols we're monitoring
monitored_symbols = set()

# Handle quote updates
async def quote_handler(quote):
    """Handle real-time quote updates and store in Redis"""
    try:
        symbol = quote.symbol
        
        # Store latest price in Redis with a TTL of 1 hour
        # Using ask_price as current price - could also use bid or last price depending on preference
        price = quote.ask_price
        redis_client.setex(f"price:{symbol}", 3600, str(price))
        
        # Optional: publish notification that a price has been updated
        # This allows services to listen for price updates rather than polling
        redis_client.publish('price_updates', json.dumps({
            'symbol': symbol,
            'price': price,
            'timestamp': quote.timestamp.isoformat() if hasattr(quote, 'timestamp') else None
        }))
        
    except Exception as e:
        print(f"Error handling quote for {quote.symbol}: {e}")

# Listen for symbol updates from the symbol collector
async def handle_symbol_updates():
    """Listen for symbol updates and modify subscriptions"""
    pubsub.subscribe('symbol_updates')
    
    for message in pubsub.listen():
        if message['type'] == 'message':
            try:
                data = json.loads(message['data'])
                symbols_to_add = data.get('add', [])
                symbols_to_remove = data.get('remove', [])
                
                # Update subscriptions
                if symbols_to_add:
                    print(f"Subscribing to quotes for: {symbols_to_add}")
                    stock_stream.subscribe_quotes(quote_handler, *symbols_to_add)
                    monitored_symbols.update(symbols_to_add)
                
                if symbols_to_remove:
                    print(f"Unsubscribing from quotes for: {symbols_to_remove}")
                    stock_stream.unsubscribe_quotes(*symbols_to_remove)
                    monitored_symbols.difference_update(symbols_to_remove)
                    
                    # Clean up Redis cache entries for removed symbols
                    for symbol in symbols_to_remove:
                        redis_client.delete(f"price:{symbol}")
                
            except Exception as e:
                print(f"Error processing symbol updates: {e}")

# Initialize symbols from Redis on startup
async def initialize_symbols():
    """Initialize symbols from Redis on startup"""
    try:
        # Get list of symbols from Redis
        symbols_json = redis_client.get('tracked_symbols')
        if symbols_json:
            symbols = json.loads(symbols_json)
            if symbols:
                print(f"Initializing with {len(symbols)} symbols from Redis")
                stock_stream.subscribe_quotes(quote_handler, *symbols)
                monitored_symbols.update(symbols)
    except Exception as e:
        print(f"Error initializing symbols: {e}")

# Main function
async def main():
    # Run initialization and handlers
    await initialize_symbols()
    
    # Start symbol update listener
    symbol_updates_task = asyncio.create_task(handle_symbol_updates())
    
    # Start the market data stream
    print("Starting market data stream...")
    await stock_stream.run()

if __name__ == "__main__":
    # Use asyncio.run() to run the main function
    asyncio.run(main())
```

#### 3. Portfolio Calculator Service

This service computes portfolio values for all accounts using the shared price cache:

```python
# backend/portfolio_calculator.py
import os
import asyncio
import json
import redis
from alpaca.broker import BrokerClient
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Redis client
redis_client = redis.Redis(host='localhost', port=6379, db=0)
pubsub = redis_client.pubsub()

# Initialize Broker client with BROKER API credentials
broker_api_key = os.getenv("BROKER_API_KEY")
broker_secret_key = os.getenv("BROKER_SECRET_KEY")
broker_client = BrokerClient(broker_api_key, broker_secret_key, sandbox=False)

# Cache for portfolio base values (previous day's closing value)
account_base_values = {}

# Get base value (previous day's closing value) for an account
def get_account_base_value(account_id):
    """Get the base value for calculating today's return"""
    if account_id in account_base_values:
        return account_base_values[account_id]
    
    try:
        # Get account information
        account = broker_client.get_account_by_id(account_id)
        base_value = float(account.last_equity)
        
        # Cache the value
        account_base_values[account_id] = base_value
        return base_value
    except Exception as e:
        print(f"Error fetching base value for account {account_id}: {e}")
        return 0.0

# Calculate portfolio value for an account using the shared price cache
def calculate_portfolio_value(account_id):
    """Calculate portfolio value using positions and cached prices"""
    try:
        # Get positions from Redis (cached by symbol_collector)
        positions_json = redis_client.get(f'account_positions:{account_id}')
        if not positions_json:
            # If positions not in Redis, fetch directly from Alpaca
            positions = broker_client.get_all_positions_for_account(account_id)
            if not positions:
                return None
        else:
            positions = json.loads(positions_json)
        
        # Get account information for cash balance
        account = broker_client.get_trade_account_by_id(account_id)
        cash_balance = float(account.cash)
        
        # Calculate total portfolio value
        portfolio_value = cash_balance
        
        for position in positions:
            # Handle both serialized dicts and Position objects
            if isinstance(position, dict):
                symbol = position['symbol']
                quantity = float(position['qty'])
            else:
                symbol = position.symbol
                quantity = float(position.qty)
            
            # Get latest price from Redis
            latest_price_str = redis_client.get(f"price:{symbol}")
            if latest_price_str:
                latest_price = float(latest_price_str)
                position_value = quantity * latest_price
                portfolio_value += position_value
            else:
                # If price not in cache, use last known price from the position
                if isinstance(position, dict) and 'current_price' in position:
                    position_value = quantity * float(position['current_price'])
                    portfolio_value += position_value
                elif hasattr(position, 'current_price'):
                    position_value = quantity * float(position.current_price)
                    portfolio_value += position_value
        
        # Get base value for "Today's Return" calculation
        base_value = get_account_base_value(account_id)
        today_return = portfolio_value - base_value
        today_return_percent = (today_return / base_value * 100) if base_value > 0 else 0
        
        # Format for display
        today_return_formatted = f"+${today_return:.2f}" if today_return >= 0 else f"-${abs(today_return):.2f}"
        today_return_percent_formatted = f"({today_return_percent:.2f}%)"
        
        # Return the calculated values
        return {
            "account_id": account_id,
            "total_value": f"${portfolio_value:.2f}",
            "today_return": f"{today_return_formatted} {today_return_percent_formatted}",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Error calculating portfolio value for account {account_id}: {e}")
        return None

# Listen for price updates and calculate values for relevant accounts
async def listen_for_price_updates():
    """Listen for price updates and recalculate portfolio values"""
    pubsub.subscribe('price_updates')
    
    # Cache to track when we last sent updates for each account
    # This prevents excessive recalculations and message sending
    last_update_time = {}
    min_update_interval = 2  # Minimum seconds between updates for any account
    
    # Load account/symbol mapping to know which accounts hold which symbols
    async def get_accounts_for_symbol(symbol):
        """Get list of account IDs that hold a given symbol"""
        accounts = []
        # Get all tracked account IDs
        account_keys = redis_client.keys('account_positions:*')
        for key in account_keys:
            account_id = key.decode('utf-8').split(':')[1]
            positions_json = redis_client.get(key)
            if positions_json:
                positions = json.loads(positions_json)
                if any(pos['symbol'] == symbol for pos in positions):
                    accounts.append(account_id)
        return accounts
    
    for message in pubsub.listen():
        if message['type'] == 'message':
            try:
                data = json.loads(message['data'])
                symbol = data.get('symbol')
                
                if not symbol:
                    continue
                
                # Find accounts that hold this symbol
                accounts = await get_accounts_for_symbol(symbol)
                
                # Current time for rate limiting
                current_time = datetime.now()
                
                # Calculate and publish portfolio values for each affected account
                for account_id in accounts:
                    # Check if we should update this account now
                    if (account_id not in last_update_time or 
                        (current_time - last_update_time[account_id]).total_seconds() > min_update_interval):
                        
                        # Calculate portfolio value
                        portfolio_data = calculate_portfolio_value(account_id)
                        
                        if portfolio_data:
                            # Publish to Redis for websocket server to pick up
                            redis_client.publish('portfolio_updates', json.dumps(portfolio_data))
                            
                            # Update last update time
                            last_update_time[account_id] = current_time
                
            except Exception as e:
                print(f"Error processing price update: {e}")

# Periodically recalculate all portfolio values as a backup
async def periodic_recalculation():
    """Periodically recalculate all portfolio values"""
    while True:
        try:
            # Get all accounts that have positions
            account_keys = redis_client.keys('account_positions:*')
            
            for key in account_keys:
                account_id = key.decode('utf-8').split(':')[1]
                
                # Calculate portfolio value
                portfolio_data = calculate_portfolio_value(account_id)
                
                if portfolio_data:
                    # Publish to Redis
                    redis_client.publish('portfolio_updates', json.dumps(portfolio_data))
        except Exception as e:
            print(f"Error in periodic recalculation: {e}")
        
        # Wait before next recalculation cycle
        await asyncio.sleep(30)  # Every 30 seconds

# Main function
async def main():
    """Run the portfolio calculator service"""
    # Start price update listener and periodic recalculation in parallel
    await asyncio.gather(
        listen_for_price_updates(),
        periodic_recalculation()
    )

if __name__ == "__main__":
    asyncio.run(main())
```

#### 4. WebSocket Server (Unchanged)

The WebSocket server code can remain largely the same as in the original approach:

```python
# backend/websocket_server.py
# (Same as original implementation)
```

#### 5. Frontend Component (Unchanged)

The frontend LivePortfolioValue component can also remain largely the same:

```typescript
// frontend-app/components/portfolio/LivePortfolioValue.tsx
// (Same as original implementation)
```

### Performance and Scaling Considerations

This optimized architecture provides several key benefits:

1. **Efficient Resource Usage**: 
   - Only subscribes to each symbol once, regardless of how many users hold it
   - Reduces API calls to Alpaca by up to 99.9% compared to per-user subscription models
   - Minimizes memory usage by maintaining a single connection to Alpaca

2. **Scaling Characteristics**:
   - The system scales based on the number of unique symbols, not the number of users
   - Even with millions of users, market data calls remain constant if they hold the same set of stocks
   - Can handle thousands of symbol price updates per second

3. **Reduced Costs**:
   - Minimizes API usage which directly impacts costs for market data subscriptions
   - Lower server resource requirements compared to per-user subscription approaches

4. **Deployment Strategy**:
   - The symbol collector and market data consumer can run as separate services
   - For high availability, multiple instances can be deployed behind a load balancer
   - Redis should be configured with replication for fault tolerance
   - Consider deploying close to Alpaca's data centers to minimize latency

5. **Monitoring**:
   - Track the number of unique symbols being monitored
   - Monitor the rate of price updates and portfolio calculations
   - Measure and alert on websocket connection counts and message throughput

### Security and Access Control

- All services should authenticate with Redis using strong credentials
- Implement proper authentication for WebSocket connections
- Ensure HTTPS/WSS for all client connections
- Only provide portfolio data for accounts a user is authorized to access

This optimized architecture ensures highly efficient real-time portfolio tracking that can scale to millions of users with minimal additional overhead.

## Real-Time Portfolio Value Tracking System Updates

### Recent Improvements and Bug Fixes

We've made several important fixes to the real-time portfolio value tracking system to improve stability, reliability, and error handling. These changes address key issues that were preventing the system from functioning correctly:

1. **Fixed Market Data Consumer Event Loop Issue**:
   - **Problem**: The Alpaca SDK was attempting to call `asyncio.run()` inside an already running event loop, causing a runtime error.
   - **Solution**: Implemented direct WebSocket connection handling instead of using the built-in `stock_stream.run()` method. This properly integrates with our existing event loop.
   - **Code Change**: Rewritten the connection management in `market_data_consumer.py` to directly manage the WebSocket connection lifecycle.

2. **Improved WebSocket Error Handling in Frontend**:
   - **Problem**: WebSocket error objects were causing JSON serialization errors when logged to console.
   - **Solution**: Modified error handling to avoid attempting to serialize the error object directly.
   - **Additional Improvements**:
     - Added validation for account ID before attempting connection
     - Enhanced error and connection state logging
     - Implemented proper reconnection logic with backoff

3. **Fixed JSON Serialization of UUID Objects**:
   - **Problem**: The `asset_id` field from Alpaca (which is a UUID object) was causing JSON serialization errors.
   - **Solution**: Explicitly convert UUID to string before attempting JSON serialization.
   - **Scope**: Updated all instances where position data is serialized to JSON for Redis caching.

4. **Added Comprehensive Testing**:
   - Created a dedicated WebSocket server test to verify connectivity and responsiveness
   - Implemented proper integration test for the real-time data flow
   - Added graceful test skipping when services aren't running

### Running the Real-Time System

To run the complete real-time portfolio value tracking system locally:

1. **Start Redis**: `brew services start redis`
2. **Run all services**:
   ```bash
   cd backend
   source venv/bin/activate  # Use direct activation instead of activate.sh
   python -m portfolio_realtime.run_services
   ```
3. **Configure frontend**: Add `NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8001` to `.env.local`
4. **Run frontend**: `cd frontend-app && npm run dev`

These improvements result in a more stable and reliable real-time portfolio value tracking system that properly handles errors and edge cases while maintaining high performance and scalability.

## WebSocket Proxy Architecture and AWS Deployment Guide

### WebSocket Architecture Overview

The real-time portfolio value tracking system uses a WebSocket architecture with the following components:

1. **Frontend WebSocket Client**: Connects to relative path `/ws/portfolio/{accountId}`
2. **Next.js API Route Proxy**: Acts as a proxy between frontend and backend WebSocket server
3. **API Server (Port 8000)**: Handles HTTP requests and proxies WebSocket connections
4. **WebSocket Server (Port 8001)**: Dedicated service for real-time WebSocket communication

The data flow follows this path:
1. Frontend connects to WebSocket at `/ws/portfolio/{accountId}`
2. Next.js proxy forwards the connection to the API server at port 8000
3. API server proxies the WebSocket connection to the dedicated WebSocket server on port 8001
4. WebSocket server maintains the connection and sends real-time portfolio updates

### AWS Deployment Configuration

For AWS deployment with Copilot, you only need to deploy **two services**:

1. **API Server** (Port 8000): Handles both HTTP API requests and WebSocket proxying
2. **WebSocket Server** (Port 8001): Dedicated WebSocket service 

You do **not** need to expose both ports publicly. Only the API server (port 8000) needs to be publicly accessible.

#### Required Configuration in Copilot

Update your Copilot service definition files in `backend/copilot/`:

1. **API Server Service (`api/manifest.yml`)**:
   ```yaml
   # Add or update these configurations
   http:
     path: '/'
     healthcheck:
       path: '/health'
       healthy_threshold: 2
       unhealthy_threshold: 2
       timeout: 5
       interval: 10
   
   # Ensure WebSocket protocol is allowed
   variables:
     ALLOWED_ORIGINS: '*'  # Configure more specifically in production
     WEBSOCKET_TIMEOUT: 300  # Timeout in seconds (5 minutes)
   
   # Add permission to communicate with the WebSocket service
   network:
     connect: true
   ```

2. **WebSocket Server Service (`websocket/manifest.yml`)**:
   ```yaml
   # This service does NOT need public exposure
   # It will be internally accessible by the API service
   
   http:
     # Internal health check endpoint
     healthcheck:
       path: '/health'
       healthy_threshold: 2
       unhealthy_threshold: 2
       timeout: 5
       interval: 10
   
   # Important: Ensure sufficient connection time
   variables:
     HEARTBEAT_INTERVAL: 30  # Seconds
     CONNECTION_TIMEOUT: 300  # Seconds
   ```

3. **Environment Variables Configuration**:
   Both services need these key environment variables:
   ```yaml
   variables:
     # Redis connection for inter-service communication
     REDIS_HOST: '${REDIS_ENDPOINT}'  # Use Copilot-managed Redis
     REDIS_PORT: 6379
     
     # Service discovery - allows API server to find WebSocket server
     WEBSOCKET_HOST: 'websocket.${APP_NAME}.${COPILOT_ENVIRONMENT_NAME}.internal'
     WEBSOCKET_PORT: 8001
   ```

### Networking Configuration

The most important aspect is ensuring proper communication between services:

1. **Service Discovery**: The API server needs to know how to reach the WebSocket server.
   - Copilot sets up internal DNS automatically. Use the service name: `websocket.${APP_NAME}.${COPILOT_ENVIRONMENT_NAME}.internal`

2. **Security Groups**: Ensure the security groups allow communication between services:
   ```yaml
   # In api/manifest.yml
   network:
     security-groups:
       - allow-internal-traffic
   ```

### Handling WebSocket Protocol

WebSockets use the standard HTTP upgrade mechanism. Ensure your load balancer settings are configured to handle WebSocket connections:

```yaml
# In copilot/environments/[env-name]/manifest.yml
http:
  public:
    ingress:
      timeout: 300  # Set timeout to match WebSocket timeout
    protocol: 'HTTPS'  # Required for WSS (secure WebSockets)
```

### Deployment Process

Your existing CI/CD pipeline that deploys on pushes to main should work without modification if the above configurations are in place. Here's the exact process:

1. Push changes to main branch
2. CI/CD pipeline triggers Copilot deployment
3. API server and WebSocket server are deployed as separate services
4. Redis is used for inter-service communication
5. Load balancer configurations are updated to handle WebSocket connections

No additional manual steps are required beyond setting up the configuration files properly.

### Verifying Deployment

To verify that WebSocket functionality is working correctly:

1. Check load balancer logs for successful WebSocket upgrades
2. Monitor CloudWatch metrics for WebSocket connections and messages
3. Test from the frontend using browser console: 
   ```javascript
   const ws = new WebSocket('wss://your-api-url.amazonaws.com/ws/portfolio/account-id');
   ws.onmessage = (event) => console.log(event.data);
   ws.onclose = (event) => console.log('Connection closed', event.code, event.reason);
   ```

Remember that WebSocket connections use the `wss://` protocol (secure WebSockets) in production rather than `ws://` used in local development.


