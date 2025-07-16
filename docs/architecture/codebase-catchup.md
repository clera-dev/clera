# Clera Codebase Catchup Guide

## Project Overview

**Clera** is an AI-powered financial platform that combines:
- **AI Agent Technology**: Multi-agent system using LangGraph for financial analysis, portfolio management, and trade execution
- **Commission-Free Brokerage**: Integration with Alpaca's Broker API for account creation and trading
- **Real-Time Portfolio Tracking**: WebSocket-based live updates during market hours
- **Banking Integration**: Plaid and manual bank account connection for ACH funding

## Architecture Overview

### Frontend (Next.js)
- **Path**: `frontend-app/`
- **Tech Stack**: Next.js 15.3 + TypeScript + TailwindCSS + Supabase Auth
- **Deployment**: Vercel (Production: `app.clera.ai`)

### Backend (Python)
- **Path**: `backend/`
- **Tech Stack**: FastAPI + LangGraph + Redis + PostgreSQL
- **Deployment**: AWS ECS via Copilot (Production: `api.askclera.com`)

### AI Agents (LangGraph)
- **Config**: `langgraph.json`
- **Deployment**: Dedicated LangGraph servers
- **Purpose**: Financial analysis, portfolio management, trade execution

---

## Frontend–Backend Integration: API Proxy Pattern

### How the Frontend Talks to the Backend

Clera uses a **proxy pattern** for all frontend-to-backend communication:
- **React components** do NOT call the backend directly.
- Instead, they call **Next.js API routes** (in `frontend-app/app/api/`).
- These API routes:
  - Authenticate and authorize the user (using Supabase Auth)
  - Proxy the request to the backend FastAPI server (using environment variables for the backend URL and API key)
  - Return the backend response to the frontend

#### Why?
- This pattern centralizes authentication/authorization and keeps backend API keys secret.
- It also allows for custom logic, caching, and error handling in the API route layer.

### Key API Route Mappings

| Frontend API Route                              | Backend Endpoint                                 | Purpose                                 |
|------------------------------------------------|--------------------------------------------------|-----------------------------------------|
| `/api/portfolio/positions`                     | `/api/portfolio/{account_id}/positions`          | Get user’s portfolio positions          |
| `/api/portfolio/orders`                        | `/api/portfolio/{account_id}/orders`             | Get user’s order history                |
| `/api/portfolio/analytics`                     | `/api/portfolio/{account_id}/analytics`          | Get portfolio analytics                 |
| `/api/portfolio/history`                       | `/api/portfolio/{account_id}/history`            | Get portfolio value history             |
| `/api/portfolio/sector-allocation`             | `/api/portfolio/sector-allocation`               | Get sector allocation                   |
| `/api/assets/[assetId]`                        | `/api/assets/{symbol_or_asset_id}`               | Get asset details                       |
| `/api/watchlist/[accountId]`                   | `/api/watchlist/{account_id}`                    | Get user’s watchlist                    |
| `/api/watchlist/[accountId]/add`/`/remove`     | `/api/watchlist/{account_id}/add`/`/remove`      | Add/remove symbol from watchlist        |
| `/api/account/[accountId]/balance`             | `/get-account-balance/{account_id}`              | Get account balance                     |
| `/api/broker/account-summary`                  | `/get-ach-relationships`                         | Get ACH relationships                   |
| `/api/account-closure/check-readiness/[accountId]` | `/account-closure/check-readiness/{account_id}` | Check if account can be closed          |
| `/api/account-closure/initiate/[accountId]`    | `/account-closure/initiate/{account_id}`         | Initiate account closure                |
| `/api/account-closure/progress/[accountId]`    | `/account-closure/progress/{account_id}`         | Get closure progress                    |
| `/api/trade`                                   | `/api/trade`                                     | Place a trade order                     |
| `/api/chat`                                    | `/api/chat-with-account`                         | AI chat with account context            |
| `/api/chat-stream`                             | `/api/chat-stream`                               | AI chat streaming                       |
| `/api/conversations/save`                      | `/save-conversation`                             | Save chat conversation                  |
| `/api/conversations/history`                   | `/get-conversations`                             | Get chat history                        |
| `/api/investment/research`                     | `/api/investment/research`                       | Get investment research                 |
| `/api/news/trending`                           | `/api/news/trending`                             | Get trending news                       |
| `/api/news/portfolio-summary`                  | `/api/news/portfolio-summary`                    | Get portfolio news summary              |
| `/api/companies/profiles/[symbol]`             | `/api/companies/profiles/{symbol}`               | Get company profile                     |
| `/api/broker/transfer`                         | `/api/broker/transfer`                           | Initiate ACH transfer                   |
| `/api/market/assets`                           | `/api/market/assets`                             | List tradable assets                    |
| `/api/market/latest-trade/[symbol]`            | `/api/market/latest-trade/{symbol}`              | Get latest trade price                  |
| `/api/market/quote/[symbol]`                   | `/api/market/quote/{symbol}`                     | Get market quote                        |
| `/api/ws/portfolio/[accountId]`                | `/ws/portfolio/{account_id}`                     | WebSocket proxy for real-time updates   |

> **Note:** Not all backend endpoints are exposed to the frontend; only those listed above are actively used.

### Authentication & Authorization Flow
- **Frontend API routes** use Supabase Auth to verify the user and check account ownership before proxying.
- **Backend endpoints** require an API key (passed from the Next.js API route, never exposed to the browser).
- **WebSocket connections** are proxied through a Next.js API route for auth, then connect to the backend’s WebSocket service.

### Adding a New API Feature
1. **Implement the backend endpoint** in FastAPI (`backend/api_server.py`).
2. **Add a Next.js API route** in `frontend-app/app/api/` to:
   - Authenticate the user (if needed)
   - Proxy the request to the backend (using env vars for URL and API key)
3. **Call the new API route** from your React component or hook.
4. **Test end-to-end** (frontend → Next.js API route → backend → response).

---

## Key Directory Structure

```
clera/
├── frontend-app/           # Next.js frontend application
│   ├── app/               # Next.js App Router pages
│   ├── components/        # Reusable UI components
│   ├── utils/            # Client utilities and API helpers
│   └── .env.local        # Environment variables
├── backend/              # Python backend services
│   ├── api_server.py     # Main FastAPI server (REST API)
│   ├── clera_agents/     # LangGraph agent implementations
│   ├── portfolio_realtime/ # Real-time portfolio tracking system
│   ├── utils/            # Backend utilities (Alpaca, Plaid)
│   ├── copilot/          # AWS deployment configuration
│   └── .env             # Backend environment variables
└── docs/                # Documentation
```

## Core Features & Flows

### 1. User Authentication
- **Frontend**: Supabase Auth with email/password
- **Protection**: Middleware-based route protection
- **Key Files**: 
  - `frontend-app/app/actions.ts` (auth server actions)
  - `frontend-app/middleware.ts` (route protection)
  - `frontend-app/utils/supabase/` (auth clients)

### 2. Brokerage Account Onboarding
- **Purpose**: Create Alpaca brokerage accounts for users
- **Flow**: Multi-step form → Alpaca API → Supabase storage
- **Key Components**:
  - `frontend-app/components/onboarding/OnboardingFlow.tsx`
  - `frontend-app/app/api/broker/create-account/` (API route)
  - `backend/utils/alpaca/` (Alpaca integration)

### 3. Bank Account Connection & Funding
- **Methods**: Manual entry
- **Flow**: Connect bank → Create ACH relationship → Transfer funds
- **Key Components**:
  - `frontend-app/components/dashboard/BankConnectionButton.tsx`
  - `frontend-app/components/dashboard/ManualBankForm.tsx`
  - `frontend-app/app/api/broker/connect-bank/` (Plaid integration)
  - `backend/utils/alpaca/bank_funding.py` (ACH utilities)

### 4. Real-Time Portfolio Tracking
- **Architecture**: Distributed microservices with Redis messaging
- **Components**:
  - `backend/portfolio_realtime/symbol_collector.py` (collect symbols)
  - `backend/portfolio_realtime/market_data_consumer.py` (price feeds)
  - `backend/portfolio_realtime/portfolio_calculator.py` (calculate values)
  - `backend/portfolio_realtime/websocket_server.py` (client connections)
- **Frontend**: WebSocket connection to `wss://ws.askclera.com`

### 5. AI Agent System
- **Agents**:
  - Financial Analyst Agent (company analysis, recommendations)
  - Portfolio Management Agent (portfolio optimization, purchase history analysis)
  - Trade Execution Agent (order management)
- **Implementation**: Fixed import errors and consolidated duplicate functions across agents
- **Orchestration**: LangGraph workflows in `backend/clera_agents/graph.py`

## Database Schema (Supabase)

### Core Tables
1. **user_onboarding**: Stores onboarding data and Alpaca account info
2. **user_bank_connections**: Bank account relationships
3. **user_transfers**: ACH transfer history

### RLS Policies
- All tables use Row-Level Security
- Users can only access their own data

## Environment Configuration

### Frontend (.env.local)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Backend API
NEXT_PUBLIC_BACKEND_API_URL=

# Plaid
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox|production
```

### Backend (.env)
```env
# AI Services
OPENAI_API_KEY=
GROQ_API_KEY=

# Broker & Banking
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=

# Database & Cache
SUPABASE_URL=
REDIS_HOST=
```

## Development Workflow

### Local Development Setup
1. **Backend**:
   ```bash
   cd backend
   source venv/bin/activate
   source .watchfiles.env  # Reduces file watcher spam
   python api_server.py
   ```

2. **Frontend**:
   ```bash
   cd frontend-app
   npm run dev
   ```

3. **Real-time Portfolio** (if needed):
   ```bash
   cd backend
   python -m portfolio_realtime.run_services
   ```

### File Watcher Configuration
- Uses `.watchfiles.env` to ignore virtual environment changes
- Prevents excessive terminal spam during development

## Deployment

### Production URLs
- **Frontend**: `https://app.clera.ai` (Vercel)
- **Backend API**: `https://api.askclera.com` (AWS ECS)
- **WebSocket**: `wss://ws.askclera.com` (AWS ECS)

### AWS Architecture
- **API Service**: ECS service for REST API (port 8000)
- **WebSocket Service**: ECS service for real-time connections (port 8001)
- **Load Balancer**: ALB with SSL termination
- **Secrets**: AWS SSM Parameter Store

### Deployment Commands
```bash
# Backend deployment
cd backend
copilot svc deploy --name api-service --env production
copilot svc deploy --name websocket-service --env production

# Frontend deployment
# Automatic via Vercel on git push to main
```

## API Integration Points

### External Services
1. **Alpaca Broker API**: Account creation, trading, portfolio data
2. **Plaid API**: Bank account connection and ACH transfers
3. **Financial Data APIs**: Market data and company information
4. **LangGraph**: AI agent orchestration and execution

### Internal APIs
- **REST API**: Standard CRUD operations via FastAPI
- **WebSocket API**: Real-time portfolio updates
- **Server Actions**: Next.js server actions for form handling

## Common Development Patterns

### Frontend Patterns
- **Server Actions**: For form submissions and database operations
- **Client Components**: Marked with "use client" for interactivity
- **API Routes**: Next.js API routes for external service integration
- **Supabase Integration**: Separate client/server utilities

### Backend Patterns
- **Agent Tools**: Modular tools in `clera_agents/tools/`
- **Utility Functions**: Reusable utilities in `utils/`
- **Error Handling**: Comprehensive try/catch with logging
- **Environment Variables**: Centralized configuration management

## Security Considerations

### Authentication
- **Frontend**: Supabase JWT tokens
- **Backend**: API key authentication
- **WebSocket**: JWT query parameter authentication

### Data Protection
- **RLS Policies**: Database-level access control
- **Environment Variables**: Sensitive data in SSM/Vercel
- **HTTPS/WSS**: Encrypted communication in production

## Debugging & Monitoring

### Development
- **Frontend**: Browser dev tools + React DevTools
- **Backend**: FastAPI automatic docs at `/docs`
- **WebSocket**: Browser WebSocket inspector
- **Database**: Supabase dashboard

### Production
- **AWS CloudWatch**: Logs and metrics
- **Vercel Analytics**: Frontend performance
- **Supabase Dashboard**: Database monitoring

## Common Issues & Solutions

### Health Check Failures
- **Problem**: ECS deployment failing health checks
- **Solution**: Increase timeout settings, check health endpoints

### WebSocket Connection Issues
- **Problem**: Real-time updates not working
- **Solution**: Check Redis connectivity, verify JWT authentication

### Plaid Integration Issues
- **Problem**: Bank connection failures
- **Solution**: Verify environment (sandbox vs production), check OAuth flow

### Database Connection Issues
- **Problem**: Supabase connection failures
- **Solution**: Check RLS policies, verify environment variables

## Testing Strategy

### Frontend Testing
- **Unit Tests**: Component testing with Jest/React Testing Library
- **Integration Tests**: API route testing
- **E2E Tests**: User flow testing with Playwright

### Backend Testing
- **Unit Tests**: pytest for individual functions
- **Integration Tests**: FastAPI test client
- **Agent Tests**: LangGraph workflow testing

## Performance Optimization

### Frontend
- **Next.js Optimizations**: Image optimization, static generation
- **Bundle Analysis**: Regular bundle size monitoring
- **Caching**: Appropriate cache headers and strategies

### Backend
- **Redis Caching**: Shared state and session management
- **Database Indexing**: Optimized queries and indexes
- **Connection Pooling**: Efficient database connections

## Key Files to Know

### Frontend Core Files
- `frontend-app/app/layout.tsx` - Root layout
- `frontend-app/middleware.ts` - Auth middleware
- `frontend-app/components/onboarding/OnboardingFlow.tsx` - Account creation
- `frontend-app/app/dashboard/page.tsx` - Main dashboard

### Backend Core Files
- `backend/api_server.py` - Main API server
- `backend/clera_agents/graph.py` - AI agent orchestration
- `backend/utils/alpaca/` - Broker integration
- `backend/portfolio_realtime/` - Real-time tracking system

### Configuration Files
- `frontend-app/.env.local` - Frontend environment
- `backend/.env` - Backend environment
- `backend/copilot/` - AWS deployment config
- `langgraph.json` - AI agent deployment config

## Quick Reference Commands

### Development
```bash
# Start full local environment
cd backend && source venv/bin/activate && python api_server.py &
cd frontend-app && npm run dev

# Run tests
cd backend && pytest
cd frontend-app && npm test

# Check logs
copilot svc logs --name api-service --follow
```

### Deployment
```bash
# Deploy backend
cd backend && copilot svc deploy --name api-service --env production

# Frontend deploys automatically via Vercel
```

This guide provides the essential knowledge needed to effectively work on the Clera codebase. Refer to the detailed documentation in `backend-notes.md` and `frontend-notes.md` for comprehensive implementation details. 