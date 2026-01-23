# Clera Codebase Catchup Guide (January 2026)

> **📚 This is the canonical "Source of Truth"** for understanding Clera's architecture. All other documentation files should be treated as supplementary.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture At-a-Glance](#architecture-at-a-glance)
3. [Strategic Brokerage Integration: SnapTrade vs Alpaca](#strategic-brokerage-integration-snaptrade-vs-alpaca)
4. [AI Multi-Agent System (LangGraph)](#ai-multi-agent-system-langgraph)
5. [Frontend Deep Dive](#frontend-deep-dive)
6. [Backend Deep Dive](#backend-deep-dive)
7. [Database Schema (Supabase)](#database-schema-supabase)
8. [Frontend–Backend Integration Patterns](#frontendbackend-integration-patterns)
9. [Chat & Streaming Implementation](#chat--streaming-implementation)
10. [Real-Time Portfolio System](#real-time-portfolio-system)
11. [Environment Configuration](#environment-configuration)
12. [Development Workflow](#development-workflow)
13. [Testing Strategy](#testing-strategy)
14. [Common Gotchas & Troubleshooting](#common-gotchas--troubleshooting)
15. [Quick Reference](#quick-reference)

---

## Project Overview

**Clera** is an AI-powered financial platform that enables users to:
- **Connect any brokerage** (Robinhood, Webull, Fidelity, etc.) via SnapTrade
- **Chat with an AI advisor** that can analyze portfolios, research stocks, and execute trades
- **View aggregated portfolios** across all connected accounts in real-time
- **Execute trades** through natural conversation with confirmation flows

### Tech Stack Summary
| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, TypeScript, TailwindCSS, Framer Motion |
| **Backend** | FastAPI (Python), Redis, PostgreSQL (Supabase) |
| **AI Orchestration** | LangGraph with Claude 4.5 (Sonnet + Haiku) |
| **Auth** | Supabase Auth (Session + JWT dual-pattern) |
| **Brokerage** | SnapTrade (primary), Alpaca (legacy/internal) |
| **Payments** | Stripe |
| **Deployment** | Vercel (frontend), AWS ECS via Copilot (backend) |

---

## Architecture At-a-Glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                   │
│  Next.js 15 (Vercel)  │  app.askclera.com                               │
├─────────────────────────────────────────────────────────────────────────┤
│  /chat        │  /portfolio    │  /invest      │  /settings            │
│  Chat.tsx     │  HoldingsTable │  OrderModal   │  PIISection           │
│  ↓ streams    │  ↓ WebSocket   │  ↓ POST       │  ↓ forms              │
├─────────────────────────────────────────────────────────────────────────┤
│                    Next.js API Routes (Proxy Layer)                     │
│  /api/conversations/stream-chat  │  /api/portfolio/*  │  /api/trade   │
│  → LangGraph Cloud               │  → Backend API     │  → Backend    │
├─────────────────────────────────────────────────────────────────────────┤
│                              BACKEND                                    │
│  FastAPI (AWS ECS)  │  api.askclera.com                                │
├─────────────────────────────────────────────────────────────────────────┤
│  api_server.py  │  routes/snaptrade_routes.py  │  services/*           │
│       ↓                    ↓                           ↓               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Portfolio Provider Abstraction Layer                            │  │
│  │  AbstractPortfolioProvider → SnapTradeProvider / AlpacaProvider  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                         AI AGENT LAYER                                  │
│  LangGraph Cloud  │  Dedicated LangGraph servers                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Supervisor (Sonnet 4.5)                                               │
│       ├── Financial Analyst Agent (Haiku 4.5) → web_search, prices    │
│       ├── Portfolio Management Agent (Haiku 4.5) → holdings, risk     │
│       └── Trade Execution Agent (Haiku 4.5) → buy/sell orders         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Strategic Brokerage Integration: SnapTrade vs Alpaca

### The Big Picture
Clera migrated from "Alpaca-first" to **"SnapTrade-first"** to enable users to connect their *existing* brokerage accounts instead of requiring them to open new accounts.

| Feature | SnapTrade (Primary) | Alpaca (Secondary/Legacy) |
|---------|---------------------|---------------------------|
| **Reach** | 20+ External Brokerages (Robinhood, Webull, Fidelity, etc.) | Internal Clera-managed accounts |
| **Access** | Read + Write (Trading) | Read + Write (Trading) |
| **Connection** | OAuth redirect → SnapTrade Portal | Native Alpaca Broker API |
| **Data Sync** | Real-time Webhooks + On-demand | Real-time WebSocket feed |
| **Use Case** | "Bring your own brokerage" | "Let Clera manage everything" |

### Portfolio Provider Abstraction
All portfolio data flows through a provider abstraction (`backend/utils/portfolio/`):

```python
# abstract_provider.py - Interface all providers implement
class AbstractPortfolioProvider:
    def get_positions(user_id, account_id) -> List[Position]
    def get_account_balance(user_id, account_id) -> Balance
    def place_order(user_id, account_id, order) -> OrderResult

# Concrete implementations:
# - snaptrade_provider.py (745 lines) - Primary provider for external brokerages
# - alpaca_provider.py - For Clera-native accounts  
# - plaid_provider.py - Read-only banking/investment aggregation
```

### SnapTrade Connection Flow
```
1. User clicks "Connect Brokerage" 
2. Frontend calls /api/snaptrade/connect → Backend generates redirect URL
3. User completes OAuth in SnapTrade Portal → Selects their brokerage
4. SnapTrade sends webhook to /api/snaptrade/webhook
5. Backend verifies HMAC signature → Triggers SnapTradeSyncService
6. Holdings synced to user_aggregated_holdings table
```

---

## AI Multi-Agent System (LangGraph)

### Architecture Decision: Why Multi-Agent?
Clera uses a **Multi-Agent Supervisor Pattern** rather than a single agent because:
1. **Security**: Trade execution is isolated with its own validation logic
2. **Cost**: Haiku (cheap) handles specialized tasks, Sonnet (smart) only routes/synthesizes
3. **Reliability**: Each agent has focused tools, reducing tool confusion errors
4. **Compliance**: Financial regulations require clear audit trails

### Agent Structure (from `backend/clera_agents/graph.py`)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPERVISOR (Claude Sonnet 4.5)               │
│  Role: Route queries, synthesize responses, maintain flow       │
│  Prompt: create_personalized_supervisor_prompt()                │
└─────────────────────────┬───────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ FINANCIAL       │ │ PORTFOLIO       │ │ TRADE           │
│ ANALYST         │ │ MANAGEMENT      │ │ EXECUTION       │
│ (Haiku 4.5)     │ │ (Haiku 4.5)     │ │ (Haiku 4.5)     │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ Tools:          │ │ Tools:          │ │ Tools:          │
│ • web_search    │ │ • get_portfolio │ │ • execute_buy   │
│ • get_stock_    │ │   _summary      │ │   _market_order │
│   price         │ │ • rebalance_    │ │ • execute_sell  │
│ • calculate_    │ │   instructions  │ │   _market_order │
│   investment_   │ │ • get_account_  │ │                 │
│   performance   │ │   activities    │ │ Uses: interrupt │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Trade Execution Flow with Interrupts
The Trade Execution Agent uses LangGraph's `interrupt()` to require user confirmation:

```python
# From trade_execution_agent.py (856 lines)
@tool
def execute_buy_market_order(ticker: str, notional_amount: float, config: RunnableConfig):
    # 1. Validate account ownership
    # 2. Check buying power across SnapTrade/Alpaca
    # 3. Get current stock price
    # 4. INTERRUPT: Request user confirmation with order details
    user_confirmation = interrupt({
        "action": "trade_confirmation",
        "ticker": ticker,
        "amount": notional_amount,
        "estimated_shares": shares,
        "account": account_name
    })
    # 5. Parse confirmation (supports modified orders)
    # 6. Execute via SnapTradeTradingService or AlpacaProvider
    # 7. Trigger background portfolio sync
```

### Tool Implementations
| Tool | Location | Purpose |
|------|----------|---------|
| `web_search` | `financial_analyst_agent.py` | Perplexity-powered market research |
| `get_stock_price` | `financial_analyst_agent.py` | Real-time quotes via Alpaca Market Data |
| `get_portfolio_summary` | `portfolio_management_agent.py` | Aggregated holdings across all accounts |
| `execute_buy_market_order` | `trade_execution_agent.py` | Multi-provider trade routing |

---

## Frontend Deep Dive

### Directory Structure
```
frontend-app/
├── app/                      # Next.js App Router
│   ├── (auth-pages)/         # Sign-in, sign-up, forgot-password
│   ├── account/              # Account settings, add funds
│   ├── api/                  # 100+ API route handlers
│   ├── chat/                 # AI chat page
│   ├── dashboard/            # Main dashboard
│   ├── invest/               # Stock research & trading
│   ├── portfolio/            # Holdings, transactions, charts
│   └── settings/             # User preferences
├── components/               # 180+ React components
│   ├── chat/                 # Chat UI (Chat.tsx, ChatMessage.tsx, etc.)
│   ├── invest/               # Trading UI (OrderModal.tsx, StockChart.tsx)
│   ├── portfolio/            # Portfolio UI (HoldingsTable.tsx, etc.)
│   └── ui/                   # Shadcn UI primitives
├── hooks/                    # 24 custom hooks
└── utils/                    # Services, API clients, helpers
```

### Key Components (What's Actually Used)

#### Chat System (`components/chat/`)
| Component | Purpose |
|-----------|---------|
| `Chat.tsx` (883 lines) | Main chat container with message handling, interrupts, query limits |
| `ChatMessageList.tsx` | Renders messages with tool activity details |
| `TradeInterruptConfirmation.tsx` | Trade confirmation modal with amount editing |
| `SuggestedQuestions.tsx` | Starter prompts for new conversations |
| `TimelineRenderer.tsx` | Shows agent activity (e.g., "Analyzing portfolio...") |

#### Portfolio System (`components/portfolio/`)
| Component | Purpose |
|-----------|---------|
| `HoldingsTable.tsx` | Main holdings grid with Clera Assist buttons |
| `SnapTradeConnectButton.tsx` | Initiates SnapTrade OAuth flow |
| `LivePortfolioValue.tsx` | Real-time value via WebSocket |
| `PortfolioHistoryChart.tsx` | Performance chart over time |
| `AccountBreakdownSelector.tsx` | Filter by brokerage account |

#### Trading System (`components/invest/`)
| Component | Purpose |
|-----------|---------|
| `OrderModal.tsx` | Primary trade entry (supports SnapTrade + Alpaca) |
| `StockChart.tsx` | Price charts via FMP API |
| `StockSearchBar.tsx` | Ticker search with autocomplete |
| `StockWatchlist.tsx` | User's watchlist with real-time prices |

### Key Custom Hooks (`hooks/`)
| Hook | Purpose |
|------|---------|
| `useQueryLimit.ts` | Manages daily AI query limits with Stripe integration |
| `useMarketPercentages.ts` | Calculates portfolio % changes |
| `useToolActivitiesHydration.ts` | Hydrates chat history with tool details |
| `useWatchlistData.ts` | Fetches and caches watchlist with prices |
| `usePortfolioStatus.ts` | Checks if user has connected accounts |

### Key Services (`utils/services/`)
| Service | Purpose |
|---------|---------|
| `LangGraphStreamingService.ts` (945 lines) | Handles AI chat streaming, tool events, citations |
| `TimelineBuilder.ts` | Builds activity timeline from LangGraph events |
| `QueryLimitService.ts` | Client-side query limit enforcement |
| `MarketDataService.ts` | Batch market data fetching |

---

## Backend Deep Dive

### Directory Structure
```
backend/
├── api_server.py             # Main FastAPI server (5500+ lines)
├── clera_agents/             # LangGraph agent implementations
│   ├── graph.py              # Agent workflow definition
│   ├── financial_analyst_agent.py
│   ├── portfolio_management_agent.py
│   ├── trade_execution_agent.py
│   ├── services/             # Agent support services
│   │   ├── trade_routing_service.py  # Routes trades to correct provider
│   │   └── portfolio_data_provider.py
│   └── tools/                # Tool implementations
├── routes/                   # FastAPI route modules
│   ├── snaptrade_routes.py   # SnapTrade API (2000+ lines)
│   ├── market_routes.py      # Market data endpoints
│   └── account_filtering_routes.py
├── services/                 # Business logic services
│   ├── snaptrade_trading_service.py  # Trade execution via SnapTrade
│   ├── smart_snaptrade_sync_service.py
│   ├── queued_order_executor.py      # After-hours order queue
│   └── portfolio_history_reconstructor.py
├── utils/                    # Utilities
│   └── portfolio/            # Portfolio provider abstraction
│       ├── abstract_provider.py
│       ├── snaptrade_provider.py
│       ├── alpaca_provider.py
│       └── snaptrade_sync_service.py
└── portfolio_realtime/       # Real-time price system
    ├── symbol_collector.py
    ├── market_data_consumer.py
    ├── portfolio_calculator.py
    └── websocket_server.py
```

### Key Backend Services

#### Trade Execution (`services/snaptrade_trading_service.py`)
```python
class SnapTradeTradingService:
    def check_order_impact(user_id, account_id, symbol, amount)  # Pre-trade validation
    def place_order(user_id, account_id, symbol, amount, side)   # Execute trade
    def cancel_order(user_id, account_id, order_id)              # Cancel pending
    def get_account_orders(user_id, account_id, status)          # Order history
```

#### Smart Sync (`services/smart_snaptrade_sync_service.py`)
Intelligent syncing that avoids over-fetching:
- Tracks last sync time per account
- Only syncs when holdings might have changed
- Respects SnapTrade rate limits

#### Queued Orders (`services/queued_order_executor.py`)
Handles orders placed outside market hours:
- Stores in `queued_orders` table
- Background job executes at market open
- Retries with exponential backoff

---

## Database Schema (Supabase)

### Core Tables

| Table | Purpose |
|-------|---------|
| `user_onboarding` | Core user profile, Alpaca account ID, onboarding status |
| `user_investment_accounts` | Connected brokerage accounts (SnapTrade, Alpaca, Plaid) |
| `user_aggregated_holdings` | **Critical**: Unified holdings across ALL providers |
| `snaptrade_connections` | SnapTrade OAuth tokens and connection status |
| `portfolio_snapshots_daily` | Daily portfolio value snapshots |
| `portfolio_snapshots_intraday` | Intraday snapshots (every 30 min during market hours) |
| `user_watchlist` | User's stock watchlist |
| `queued_orders` | Orders waiting for market open |
| `chat_runs` | AI conversation runs with tool activities |
| `message_citations` | Citation URLs extracted from AI responses |
| `user_rate_limits` | Daily AI query limits |
| `user_payments` | Stripe subscription status |

### Aggregated Holdings Schema (Most Important!)
```sql
-- From 002_create_aggregated_holdings.sql
CREATE TABLE user_aggregated_holdings (
    user_id UUID NOT NULL,
    symbol TEXT NOT NULL,
    security_name TEXT,
    security_type TEXT,  -- 'equity', 'etf', 'crypto', etc.
    
    -- Aggregated across all accounts
    total_quantity DECIMAL(20, 8),
    total_market_value DECIMAL(20, 2),
    total_cost_basis DECIMAL(20, 2),
    
    -- Per-account breakdown (JSON)
    account_contributions JSONB,  -- [{account_id, quantity, value, institution}]
    institution_breakdown JSONB,  -- {Robinhood: {qty, value}, Fidelity: {...}}
    
    UNIQUE(user_id, symbol)
);
```

### Row-Level Security (RLS)
Every table has RLS enabled with policies like:
```sql
CREATE POLICY "Users can only access their own data"
ON user_aggregated_holdings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

---

## Frontend–Backend Integration Patterns

### The Proxy Pattern (CRITICAL!)
**React components NEVER call the backend directly.** All requests go through Next.js API routes.

```
React Component
      │
      ▼
Next.js API Route (/api/portfolio/positions)
      │ 
      ├── 1. Authenticate via Supabase (session or JWT)
      ├── 2. Verify account ownership
      ├── 3. Add secure headers (X-API-KEY + Authorization: Bearer)
      │
      ▼
FastAPI Backend (/api/portfolio/{account_id}/positions)
      │
      ├── 1. Validate API key
      ├── 2. Validate JWT → Extract user_id
      ├── 3. Verify user owns account_id
      │
      ▼
Return data
```

### Secure Header Pattern
```typescript
// REQUIRED for ALL frontend → backend calls
const headers = {
  'Content-Type': 'application/json',
  'X-API-KEY': process.env.BACKEND_API_KEY,        // Service auth
  'Authorization': `Bearer ${user.access_token}`,  // User auth (JWT)
};
```

### Key API Route Mappings

| Frontend Route | Backend Endpoint | Purpose |
|----------------|------------------|---------|
| `/api/portfolio/aggregated` | `/api/portfolio/aggregated-holdings` | All holdings across brokerages |
| `/api/snaptrade/connect` | `/api/snaptrade/login` | Get OAuth redirect URL |
| `/api/snaptrade/trade-enabled-accounts` | `/api/snaptrade/accounts?connection_type=trade` | Accounts that can trade |
| `/api/trade` | `/api/trade` | Place order (auto-routes to provider) |
| `/api/conversations/stream-chat` | LangGraph Cloud | AI chat streaming |
| `/api/market/quotes/batch` | `/api/market/quotes/batch` | Batch stock quotes |
| `/api/ws/portfolio/[accountId]` | `/ws/portfolio/{account_id}` | Real-time WebSocket |

---

## Chat & Streaming Implementation

### How AI Chat Works (End-to-End)

```
1. User types "Buy $500 of AAPL"
2. Chat.tsx calls handleSendMessage()
3. Creates/gets LangGraph thread ID
4. Calls chatClient.startStream(threadId, input, userId, accountId)
5. Frontend API route /api/conversations/stream-chat:
   - Authenticates user
   - Creates secure LangGraph config
   - Calls LangGraphStreamingService.createStreamingResponse()
6. LangGraph Cloud processes:
   - Supervisor routes to Trade Execution Agent
   - Agent calls execute_buy_market_order tool
   - Tool calls interrupt() for user confirmation
7. Stream sends interrupt event to frontend
8. TradeInterruptConfirmation.tsx renders confirmation UI
9. User confirms → handleInterruptConfirmation('yes')
10. LangGraph resumes → Order executed
11. Stream sends completion → Chat displays result
```

### LangGraphStreamingService Events
The streaming service (`utils/services/langGraphStreamingService.ts`) processes these event types:

| Event Type | Purpose |
|------------|---------|
| `messages_complete` | Final AI response with citations |
| `node_update` | Agent activity (e.g., "Analyzing portfolio...") |
| `tool_update` | Tool execution status (start/complete) |
| `agent_transfer` | Supervisor routing to specialist |
| `interrupt` | Trade confirmation needed |
| `error` | Error handling |

### Citation Extraction
Citations are extracted from tool responses and persisted:
```typescript
// Citations stored in message_citations table
// Format: <!-- CITATIONS: url1,url2,url3 -->
const citations = extractCitationsFromMessage(message);
await onCitationsCollected(runId, threadId, userId, citations);
```

---

## Real-Time Portfolio System

### Architecture
```
┌───────────────────┐     ┌───────────────────┐
│  SymbolCollector  │────▶│  Redis (pub/sub)  │
│  (collects tickers│     └────────┬──────────┘
│   from all users) │              │
└───────────────────┘              ▼
                          ┌───────────────────┐
┌───────────────────┐     │ MarketDataConsumer│
│  Price Providers  │────▶│  (Alpaca stream)  │
│  (Alpaca, etc.)   │     └────────┬──────────┘
└───────────────────┘              │
                                   ▼
                          ┌───────────────────┐
                          │PortfolioCalculator│
                          │  (per-user calc)  │
                          └────────┬──────────┘
                                   │
                                   ▼
                          ┌───────────────────┐
                          │  WebSocketServer  │────▶ Frontend clients
                          │  (port 8001)      │
                          └───────────────────┘
```

### Starting Real-Time Services
```bash
cd backend
python -m portfolio_realtime.run_services
```

---

## Environment Configuration

### Frontend (`frontend-app/.env.local`)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Backend (server-side only - no NEXT_PUBLIC_)
BACKEND_API_URL=http://localhost:8000
BACKEND_API_KEY=your-secret-key

# LangGraph
LANGGRAPH_API_URL=https://your-deployment.langchain.dev
LANGGRAPH_API_KEY=lch_xxx
LANGGRAPH_ASSISTANT_ID=agent

# Feature Flags
NEXT_PUBLIC_ENABLE_ADD_FUNDS=true

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

### Backend (`backend/.env`)
```env
# AI
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
PERPLEXITY_API_KEY=pplx-xxx

# SnapTrade (PRIMARY)
SNAPTRADE_CONSUMER_KEY=xxx
SNAPTRADE_CLIENT_ID=xxx
SNAPTRADE_WEBHOOK_SECRET=xxx

# Alpaca (SECONDARY)
ALPACA_API_KEY=xxx
ALPACA_SECRET_KEY=xxx

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
BACKEND_API_KEY=your-secret-key
```

---

## Development Workflow

### Local Setup
```bash
# 1. Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python api_server.py  # Runs on port 8000

# 2. Frontend (new terminal)
cd frontend-app
npm install
npm run dev  # Runs on port 3000

# 3. Real-time (optional, new terminal)
cd backend
source venv/bin/activate
python -m portfolio_realtime.run_services  # WebSocket on port 8001
```

### Running Tests
```bash
# Backend
cd backend
pytest                                    # All tests
pytest tests/services/                    # Service tests only
pytest -k "snaptrade"                     # SnapTrade tests

# Frontend
cd frontend-app
npm test                                  # All tests
npm test -- --testPathPattern="Chat"      # Chat tests
npm run test:coverage                     # With coverage
```

---

## Testing Strategy

### Backend Testing
- **Unit tests**: `backend/tests/` (pytest)
- **Service mocks**: Mock SnapTrade/Alpaca clients
- **Agent tests**: `backend/clera_agents/tests/`

### Frontend Testing
- **Unit tests**: Jest + React Testing Library
- **API route tests**: `frontend-app/tests/api/`
- **Hook tests**: `frontend-app/hooks/__tests__/`

### Key Test Files
```
backend/tests/
├── services/
│   └── test_snaptrade_sync_service.py
├── test_trade_routing_service.py
└── test_portfolio_provider.py

frontend-app/tests/
├── api/
│   └── portfolio-aggregated.test.ts
├── hooks/
│   └── useMarketPercentages.test.ts
└── utils/
    └── market-data-service.test.js
```

---

## Common Gotchas & Troubleshooting

### 1. "401 Unauthorized" on API Routes
**Check these in order:**
1. Is the user logged in? (Check Supabase session)
2. Is `BACKEND_API_KEY` set in both frontend and backend `.env`?
3. Is the JWT being passed? (Check `Authorization` header)

### 2. SnapTrade Sync Not Working
```bash
# Check webhook secret matches
echo $SNAPTRADE_WEBHOOK_SECRET

# Manually trigger sync
curl -X POST http://localhost:8000/api/snaptrade/sync \
  -H "Authorization: Bearer $JWT" \
  -H "X-API-KEY: $BACKEND_API_KEY"
```

### 3. Chat Not Streaming
1. Check `LANGGRAPH_API_URL` and `LANGGRAPH_API_KEY` are set
2. Check LangGraph deployment is running
3. Look for errors in browser Network tab → EventStream

### 4. WebSocket Connection Fails
1. Is Redis running? (`redis-cli ping`)
2. Is `portfolio_realtime` service running?
3. Check `ws://localhost:8001` is accessible

### 5. Trade Execution Fails
1. Is the account trade-enabled? (Check `connection_type='trade'`)
2. Does user have sufficient buying power?
3. Is market open? (Check `queued_orders` for after-hours trades)

### 6. Next.js Config Conflicts
- **Only use `next.config.mjs`** (not `.ts`)
- Rewrite rules can bypass API routes - check for conflicts
- Restart dev server after `.env` changes

---

## Quick Reference

### Production URLs
| Service | URL |
|---------|-----|
| Frontend | https://app.askclera.com |
| Backend API | https://api.askclera.com |
| WebSocket | wss://ws.askclera.com |
| LangGraph | https://clera.langchain.dev |

### Key Commands
```bash
# Development
cd backend && source venv/bin/activate && python api_server.py
cd frontend-app && npm run dev

# Testing
cd backend && pytest
cd frontend-app && npm test

# Deployment
cd backend && copilot svc deploy --name api-service --env production
# Frontend: Auto-deploys via Vercel on push to main

# Logs
copilot svc logs --name api-service --follow
```

### Key Files to Know
| File | Purpose |
|------|---------|
| `backend/api_server.py` | Main API entry point |
| `backend/clera_agents/graph.py` | LangGraph workflow |
| `backend/routes/snaptrade_routes.py` | SnapTrade API |
| `backend/utils/portfolio/snaptrade_provider.py` | SnapTrade data provider |
| `frontend-app/components/chat/Chat.tsx` | Main chat UI |
| `frontend-app/utils/services/langGraphStreamingService.ts` | AI streaming |
| `frontend-app/utils/api/auth-service.ts` | Authentication helper |

---

*Last Updated: January 2026*
*For detailed SnapTrade implementation, see `docs/integrations/snaptrade/`*
