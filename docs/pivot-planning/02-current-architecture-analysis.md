# Current Architecture Analysis - Clera Platform

## Overview
This document provides a comprehensive analysis of the current Clera platform architecture, focusing on components that will be affected by the pivot from brokerage-focused to portfolio aggregation functionality.

## System Architecture Summary

### Technology Stack
- **Frontend**: Next.js 15.3, TypeScript, TailwindCSS, Supabase Auth
- **Backend**: Python FastAPI, LangGraph, Redis, PostgreSQL
- **Database**: Supabase PostgreSQL with Row-Level Security
- **Deployment**: Frontend on Vercel, Backend on AWS ECS
- **Real-time**: WebSocket server for portfolio updates
- **AI/ML**: LangGraph agents with OpenAI/Groq integration

## Frontend Architecture Analysis

### Core Pages and Components

#### 1. Portfolio Page (`frontend-app/app/portfolio/page.tsx`)
**Current Functionality:**
- Real-time portfolio value tracking via WebSocket
- Holdings table with individual positions
- Pending orders display
- Portfolio analytics (returns, performance metrics)
- Asset allocation visualization
- Trade execution buttons (Buy/Sell)

**Key Dependencies on Alpaca:**
- Live portfolio value from `/api/portfolio/positions`
- Order history from `/api/portfolio/orders`
- Real-time WebSocket updates from `wss://ws.askclera.com`

**Components to Modify for Aggregation:**
```typescript
// Current single-account structure
interface PositionData {
  symbol: string;
  qty: string;
  market_value: string;
  cost_basis: string;
  // ... Alpaca-specific fields
}

// Proposed multi-account structure
interface AggregatedPositionData {
  symbol: string;
  total_qty: string;
  total_market_value: string;
  average_cost_basis: string;
  accounts: AccountContribution[];
  institutions: string[];
}
```

#### 2. Invest Page (`frontend-app/app/invest/page.tsx`)
**Current Functionality:**
- Investment suggestions based on user preferences
- Stock search functionality
- Order modal for trade execution
- Account balance display
- Trending investments

**Pivot Impact:**
- Remove direct order execution
- Modify suggestions to work with aggregated portfolios
- Add referral links to external brokerages
- Enhance search to show holdings across all accounts

#### 3. News Page (`frontend-app/app/news/page.tsx`)
**Current Functionality:**
- Portfolio-specific news feed
- Trending financial news
- Watchlist-based news filtering

**Pivot Impact:**
- Minimal changes needed
- Enhance to show news for all holdings across accounts

### API Routes Analysis

#### Critical API Routes for Modification

1. **Portfolio Routes** (Requires Major Changes)
   - `/api/portfolio/positions` → Aggregate positions from Plaid
   - `/api/portfolio/analytics` → Multi-account analytics
   - `/api/portfolio/history` → Combined performance tracking

2. **Trading Routes** (Feature Flag to Disable)
   - `/api/trade` → Disable with feature flag
   - `/api/portfolio/orders` → Hide pending orders section

3. **Account Management** (Extend for Multi-Provider)
   - `/api/account/[accountId]/balance` → Aggregate balances
   - `/api/broker/account-summary` → Multi-provider summary

### Authentication & Authorization Pattern
**Current Implementation:**
```typescript
// Dual authentication pattern already implemented
const authContext = await AuthService.authenticateAndAuthorize(request, accountId);
// Secure headers to backend
headers: {
  'X-API-KEY': process.env.BACKEND_API_KEY,
  'Authorization': `Bearer ${user.access_token}`,
}
```
**Pivot Impact:** No changes needed - architecture already supports secure multi-service integration

## Backend Architecture Analysis

### API Server (`backend/api_server.py`)

#### Current Alpaca Integrations
1. **Account Management Endpoints:**
   - `/get-account-balance/{account_id}` 
   - `/api/portfolio/{account_id}/positions`
   - `/api/portfolio/{account_id}/orders`

2. **Trading Endpoints:**
   - `/api/trade` - Order execution via trade execution agent
   - Order status and management

3. **Market Data Endpoints:**
   - Asset details and quotes
   - Company profiles and research

#### Endpoints Requiring Modification

**High Priority (Core Functionality):**
```python
# Current single-account approach
@app.get("/api/portfolio/{account_id}/positions")
async def get_positions(account_id: str, user_id: str = Depends(get_authenticated_user_id)):
    # Alpaca-specific implementation
    
# Proposed multi-account approach  
@app.get("/api/portfolio/aggregated/positions")
async def get_aggregated_positions(user_id: str = Depends(get_authenticated_user_id)):
    # Plaid-based aggregation across multiple accounts
```

**Medium Priority (Enhanced Features):**
- Portfolio analytics endpoints
- Performance tracking endpoints
- Asset allocation endpoints

**Low Priority (Preserve with Feature Flags):**
- Trading endpoints
- Order management endpoints

### AI Agent System Analysis

#### Current Agent Structure (`backend/clera_agents/`)

1. **Financial Analyst Agent** (`financial_analyst_agent.py`)
   - Company analysis and research
   - Investment recommendations
   - **Pivot Impact:** Minimal - can work with aggregated data

2. **Portfolio Management Agent** (`portfolio_management_agent.py`)
   - Portfolio optimization suggestions
   - Risk analysis
   - Purchase history analysis
   - **Pivot Impact:** Moderate - needs multi-account capability

3. **Trade Execution Agent** (`trade_execution_agent.py`)
   - Order placement via Alpaca API
   - Order confirmation and tracking
   - **Pivot Impact:** Major - disable with feature flags, preserve for future

#### Agent Tools (`backend/clera_agents/tools/`)

**Portfolio Analysis Tools:**
```python
# Current single-account tools
def analyze_portfolio(account_id: str) -> PortfolioAnalysis:
    # Uses Alpaca data

# Proposed multi-account tools
def analyze_aggregated_portfolio(user_id: str) -> AggregatedPortfolioAnalysis:
    # Uses Plaid data across multiple accounts
```

**Company Analysis Tools:**
- No changes needed - already provider-agnostic

### Real-Time Portfolio System (`backend/portfolio_realtime/`)

#### Current Architecture
- `symbol_collector.py` - Collects symbols from user portfolios
- `market_data_consumer.py` - Fetches real-time price data
- `portfolio_calculator.py` - Calculates portfolio values
- `websocket_server.py` - Broadcasts updates to clients

#### Pivot Impact Analysis

**Major Changes Required:**
```python
# Current approach - single account symbols
def collect_user_symbols(account_id: str) -> List[str]:
    # Query Alpaca positions
    
# New approach - aggregated symbols across accounts  
def collect_aggregated_symbols(user_id: str) -> Dict[str, AccountSymbolMap]:
    # Query Plaid holdings across all connected accounts
```

**Implementation Complexity:**
- **High** - Requires complete rearchitecture for multi-account support
- Need to track which symbols belong to which accounts
- Calculate aggregated values while preserving per-account details

### Database Schema Analysis

#### Current Tables and Their Fate

**Preserve (Core User Data):**
- `auth.users` - No changes
- `user_personalization` - No changes

**Extend (Add Multi-Provider Support):**
```sql
-- Current: Single Alpaca account per user
user_onboarding (
  user_id UUID,
  alpaca_account_id TEXT,
  alpaca_account_number TEXT,
  status TEXT
);

-- Proposed: Multiple accounts from multiple providers
user_investment_accounts (
  user_id UUID,
  provider TEXT, -- 'alpaca', 'plaid_schwab', 'plaid_fidelity'
  provider_account_id TEXT,
  account_type TEXT,
  institution_name TEXT,
  is_active BOOLEAN
);
```

**Feature Flag (Preserve for Future):**
- `user_bank_connections` - Keep for Alpaca ACH relationships
- `user_transfers` - Keep for historical ACH transfer data

#### Data Migration Strategy

**Phase 1: Additive Changes**
1. Create new tables for multi-provider accounts
2. Maintain existing Alpaca-specific tables
3. Create database views for backward compatibility

**Phase 2: Data Population**
1. Migrate existing Alpaca account data to new structure
2. Add Plaid account connections
3. Create aggregation logic in application layer

## Integration Points Analysis

### Current External API Dependencies

#### Alpaca APIs (To Modify/Flag)
1. **Broker API** - Account creation, management
2. **Trading API** - Order execution, portfolio positions
3. **Market Data API** - Real-time quotes and historical data

#### Plaid APIs (To Extend)
1. **Link API** - Currently used only for bank connections
2. **Accounts API** - Currently unused
3. **Investments API** - Not currently integrated (target for pivot)

### Current Plaid Integration Assessment

**Existing Implementation (`backend/utils/alpaca/bank_funding.py`):**
```python
# Current usage - bank account connections only
def create_plaid_link_token(user_email: str, alpaca_account_id: str) -> str:
    # Creates link token for bank connections
    
def exchange_public_token_for_access_token(public_token: str) -> str:
    # Exchanges for account access
```

**Extension Needed:**
```python
# New investment account capabilities
def get_investment_accounts(access_token: str) -> List[InvestmentAccount]:
    # Plaid /accounts/get with investment account filter
    
def get_investment_holdings(access_token: str, account_id: str) -> List[Holding]:
    # Plaid /investments/holdings/get
    
def get_investment_transactions(access_token: str, account_id: str) -> List[Transaction]:
    # Plaid /investments/transactions/get
```

## Component Reusability Assessment

### High Reusability (Minimal Changes)
- Authentication system
- News aggregation components
- Basic UI components (cards, modals, forms)
- Market data display components

### Medium Reusability (Moderate Changes)
- Portfolio analytics components (modify for multi-account)
- Holdings display components (add account grouping)
- Performance tracking components (aggregate calculations)

### Low Reusability (Major Changes)
- Trading components (disable with feature flags)
- Real-time portfolio updates (rearchitect for multi-account)
- Account-specific WebSocket connections

### Not Reusable (Preserve for Future)
- Order execution flows
- Alpaca-specific error handling
- Single-account assumption logic

## Performance Impact Analysis

### Current System Performance
- **Portfolio Page Load**: ~800ms (single account)
- **WebSocket Updates**: ~100ms latency
- **Database Queries**: Optimized for single-account lookups

### Projected Impact of Pivot
- **Multi-Account Data**: +300-500ms additional load time
- **Aggregation Logic**: +200ms for calculation overhead
- **Plaid API Calls**: +400-800ms per connected account

### Optimization Strategies
1. **Caching Layer**: Redis caching for aggregated portfolio data
2. **Background Processing**: Async aggregation with periodic updates
3. **Database Optimization**: Proper indexing on new multi-account tables
4. **API Batching**: Batch Plaid requests where possible

## Security Considerations

### Current Security Model
- JWT-based authentication via Supabase
- Row-Level Security on all user data
- API key protection for backend services
- Secure environment variable management

### Additional Security for Pivot
- **Multi-Provider Token Management**: Secure storage of Plaid access tokens
- **Data Isolation**: Ensure user data remains isolated across providers
- **Audit Trail**: Log all data access across multiple accounts
- **Compliance**: Ensure SOC 2 compliance for aggregated financial data

## Conclusion

The current architecture is well-positioned for the pivot with strong separation of concerns and modular design. Key architectural strengths include:

1. **Service Layer Abstraction**: Existing utility structure supports new providers
2. **Security Model**: Robust authentication/authorization supports multi-provider access
3. **Modular Frontend**: Component-based architecture facilitates feature toggling
4. **Database Design**: Extensible schema with RLS supports multi-tenant patterns

**Major Refactoring Areas:**
1. Real-time portfolio system (complete redesign needed)
2. Portfolio aggregation logic (new business logic layer)
3. AI agent adaptation (multi-account awareness)

**Preservation Priorities:**
1. User authentication and authorization
2. AI agent framework and tools
3. Trading functionality (via feature flags)
4. Core UI/UX components

The next documents will detail specific implementation strategies for each component area.
