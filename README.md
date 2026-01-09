# Clera Financial AI Platform

Clera is a financial AI platform leveraging advanced language models and agent-based architecture to provide financial analysis, portfolio management, brokerage services, and conversational capabilities. This monorepo contains all the code pertaining to building Clera, simplifying CI/CD pipelines, testing, and onboarding.

## 📚 Documentation

- **[Portfolio History Architecture](docs/architecture/portfolio-history/README.md)** - Production-grade portfolio history system with automated snapshots and backfill
- **[Backend API Documentation](backend/docs/)** - API endpoints, database schema, and service architecture
- **[Frontend Components](frontend-app/components/)** - React component library and UI patterns

## TL;DR
### How to run servers (for the frist time)
Open 3 terminals (T1, T2, T3)
In T1 run: 
```bash
cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python -m portfolio_realtime.websocket_server
```

In T2 run: 
```bash
cd backend && source venv/bin/activate && source activate.sh && python api_server.py
```
or 
```bash
cd backend && source venv/bin/activate && source activate.sh && uvicorn api_server:app --reload
```

In T3 run: 
```bash
cd frontend-app && npm install && npm run dev
```

If you need to run webhook to test stripe payments, you need 2 other terminals running:
```bash
ngrok http 8000
```
and
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

And to redeploy AWS servers (anytime you change backend):
``` bash
   copilot svc deploy --name api-service --env production
   copilot svc deploy --name websocket-lb-service --env production
```

To run in the background and allow you to close your laptop while it runs:
```bash
nohup copilot svc deploy --name api-service --env production > deployment.log 2>&1 &
```

If it crashes because there isn't enough room in docker, run:
``` bash
# WARNING: This command is extremely destructive and will delete ALL unused Docker containers, images, and volumes on your machine!
# Only run this in local development environments, NEVER on production or shared machines.
# This can cause data loss or outages if run on systems with other Docker workloads.
docker system prune -a --volumes -f
```
And you can track their progress in AWS > Elastic Container Service.

When cursor has to update, open up to these 4 terminals to get started again:
```bash
# t1
source venv/bin/activate && python -m portfolio_realtime.websocket_server
# t2 (option 1)
source venv/bin/activate && source activate.sh && python api_server.py
# t2 (option 2)
source venv/bin/activate && source activate.sh && uvicorn api_server:app --reload
# t3
npm install && rm -rf .next && npm run dev
# t4 (if needed)
ngrok http 8000
```

If you want to run our langgraph deployment locally, just run:
```bash
langgraph dev --tunnel
```

### How to get cursor to cook:

Run this command and use the file as context in chatsto help cursor easily know context of your branch
```bash
git diff main > frontend-app/git-diff.md
```

## Project Structure

The monorepo is organized into the following main directories:

-   `backend/`: Contains the Python-based backend services, including AI logic, API servers, and broker integrations.
-   `frontend-app/`: Houses the Next.js frontend application for `app.askclera.com`.
-   `docs/`: Documentation for the project, including detailed notes on backend and frontend architecture.
-   `packages/`: Shared code and utilities utilized across different parts of the stack.

## Backend (`backend/`)

The backend powers Clera's core functionalities, built primarily with Python.

**Key Components:**

*   **API Server (`api_server.py`):** A FastAPI application providing RESTful endpoints for chat, trade execution, company info, health checks, and Alpaca/Plaid operations (account creation, ACH funding).
*   **WebSocket Server (`server.py`):** Enables real-time communication, financial RAG, vector database connections (Pinecone), and voice capabilities (Retell integration).
*   **AI Agents (`clera_agents/`):** Utilizes LangGraph for orchestrating specialized agents:
    *   Financial Analyst Agent
    *   Portfolio Management Agent
    *   Trade Execution Agent
    *   Includes tools for portfolio and company analysis.
*   **Chatbots (`clera_chatbots/`):** Various chatbot implementations (frontend-facing, RAG-enabled with Perplexity/Llama).
*   **Conversational AI (`conversational_ai/`):** Integrates voice features using LiveKit, Deepgram (STT), and Cartesia (TTS).
*   **Broker Integration (`utils/alpaca/`):** Handles Alpaca Broker API interactions for account creation, management, and ACH funding via Plaid or manual entry.

### Market Data Management

**Tradable Assets Cache (`backend/data/tradable_assets.json`):**
*   **Auto-Updated:** This file is automatically refreshed every 24 hours from Alpaca's live market data API to ensure current tradable instruments are available to users.
*   **Content:** Contains all active, tradable US equities available through Alpaca, including stocks, ETFs, and other securities.
*   **Git Workflow:** When this file is modified by the automatic update process:
    1. **Do NOT commit directly to main branch**
    2. **Create a dedicated branch** for market data updates (e.g., `update/market-data-YYYY-MM-DD`)
    3. **Review changes** to ensure they represent legitimate new tradable assets
    4. **Merge via pull request** to maintain audit trail of market data changes
*   **Why This Matters:** New assets are regularly added to Alpaca's platform, and this system ensures users have access to the latest investment opportunities without manual intervention.

**Technologies:**

*   Python, FastAPI, Uvicorn
*   LangGraph, LangChain
*   LLMs: Groq, Perplexity, Anthropic Claude
*   Vector DB: Pinecone
*   Broker API: Alpaca
*   Bank Integration: Snaptrade/ Stripe
*   Voice: LiveKit, Deepgram, Cartesia, Retell
*   Database: Supabase (via API)

**Deployment:**

*   A hybrid model:
    *   Non-AI logic (API Server, integrations) deployed on AWS ECS using AWS Copilot.
    *   AI Agent workflows hosted on dedicated LangGraph servers.
*   Backend API accessible via AWS Load Balancer.

*(See `docs/backend-notes.md` for more details)*

## Frontend (`frontend-app/`)

The frontend provides the user interface for interacting with Clera, built with Next.js and TypeScript.

**Key Components:**

*   **App Router (`app/`):** Organizes routes, including authentication pages, API routes, dashboard, and protected areas.
*   **Authentication:** Integrates with Supabase for user sign-up, sign-in, email verification, password reset, and protected routes using middleware and server actions.
*   **UI Components (`components/`):** Reusable components built with TailwindCSS and Shadcn UI, including forms, cards, buttons, and theme switching.
*   **Broker Onboarding (`components/onboarding/`):** A multi-step flow guiding users through Alpaca account creation (contact info, personal details, disclosures, agreements).
*   **Bank Connection & Funding:** Supports bank account linking via Plaid (OAuth) or manual entry, and initiating ACH transfers.
*   **Dashboard (`app/dashboard/`):** Displays Alpaca account info, connected banks, transfer history, and funding status.
*   **Supabase Integration (`utils/supabase/`):** Uses client and server components for interacting with Supabase Auth and Database (storing onboarding status, bank connections, transfers).

**Technologies:**

*   Next.js (App Router), React, TypeScript
*   TailwindCSS, Shadcn UI
*   Supabase (Auth, Database)
*   State Management: React Hooks, Server Actions
*   API Communication: Fetch API, Server Actions

**Deployment:**

*   Deployed via Vercel.
*   Utilizes Vercel's CI/CD, environment variable management, preview deployments, and global CDN.
*   Connects to the AWS-hosted backend API and LangGraph services.

*(See `docs/frontend-notes.md` for more details)*

## Packages (`packages/`)

Houses shared code, utilities, or configurations that can be utilized by both the frontend and backend applications, promoting code reuse and consistency.

## Documentation (`docs/`)

Contains detailed documentation about the project's architecture, setup, components, and deployment strategies. Key documents include:

*   `backend-notes.md`: In-depth information about the backend system.
*   `frontend-notes.md`: In-depth information about the frontend application.

## Getting Started

*(High-level steps - refer to specific `README.md` files within `backend/` and `frontend-app/` for detailed setup instructions)*

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd clera
    ```
2.  **Configure Environment Variables:** Set up necessary `.env` files in both `backend/` and `frontend-app/` with API keys and service configurations (Supabase, Alpaca, Plaid, AI models, AWS credentials, etc.). Refer to `.env.example` files if available.
3.  **Install Dependencies:**
    *   **Backend:** `cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
    *   **Frontend:** `cd frontend-app && npm install` (or `yarn install`)
4.  **Run Development Servers:**
    *   **Backend:** `cd backend && uvicorn api_server:app --reload` (and potentially `uvicorn server:app --reload --port=8080` for WebSocket)
    *   **Frontend:** `cd frontend-app && npm run dev` (or `yarn dev`)
5.  **Access Applications:**
    *   Frontend typically available at `http://localhost:3000`.
    *   Backend API typically available at `http://localhost:8000`.

## Deployment Summary

*   **Backend:** Deployed to AWS ECS via AWS Copilot (non-AI parts) and LangGraph (AI agents). Requires AWS and LangGraph setup.
*   **Frontend:** Deployed to Vercel, connected to the production backend endpoints. Requires Vercel project setup and environment variable configuration.

Refer to the `docs/` directory and specific service manifests (`copilot/`, `langgraph.json`) for detailed deployment configurations.

# Real-Time Portfolio Value Tracking System

This system provides real-time updates of portfolio values for users of the Clera financial platform. It efficiently tracks the value of users' investment portfolios with minimal latency, enabling a responsive and engaging user experience.

## Architecture

The system consists of the following components:

1. **Symbol Collector**: Periodically scans all user accounts and creates a list of unique symbols that need to be monitored
2. **Market Data Consumer**: Subscribes to Alpaca's real-time market data for all tracked symbols
3. **Portfolio Calculator**: Computes portfolio values using the latest prices and account positions
4. **WebSocket Server**: Maintains connections with frontend clients and pushes portfolio updates
5. **Frontend Component**: Displays real-time portfolio values to users

## Prerequisites

- Python 3.9+
- Redis server running
- Alpaca account with API keys (both Broker and Market Data API keys)
- Node.js 16+ (for frontend)

## Installation

### Backend

1. Install the required Python packages:

```bash
pip install redis alpaca-py fastapi uvicorn python-dotenv
```

2. Configure environment variables:

Create a `.env` file in the backend directory with the following variables:

```
# Alpaca API credentials
BROKER_API_KEY=your_broker_api_key
BROKER_SECRET_KEY=your_broker_secret_key
APCA_API_KEY_ID=your_market_data_api_key # same as trading API key
APCA_API_SECRET=your_market_data_secret_key # same as trading API key
ALPACA_SANDBOX=true  # Set to false for production

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Service configuration
SYMBOL_COLLECTION_INTERVAL=300  # Seconds
PRICE_TTL=3600  # Seconds
MIN_UPDATE_INTERVAL=2  # Seconds
RECALCULATION_INTERVAL=30  # Seconds
WEBSOCKET_PORT=8001
WEBSOCKET_HOST=0.0.0.0
```

### Frontend

Add the WebSocket URL to your frontend environment variables:

```
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8001
```

## Running the System

### Option 1: Run all services together

```bash
cd backend
python -m portfolio_realtime.run_services
```

This will start all services in parallel.

### Option 2: Run services individually

For development or debugging, you can run each service in a separate terminal:

```bash
# Terminal 1 - Symbol Collector
cd backend
python -m portfolio_realtime.symbol_collector

# Terminal 2 - Market Data Consumer
cd backend
python -m portfolio_realtime.market_data_consumer

# Terminal 3 - Portfolio Calculator
cd backend
python -m portfolio_realtime.portfolio_calculator

# Terminal 4 - WebSocket Server
cd backend
python -m portfolio_realtime.websocket_server
```

## Frontend Integration

To use the real-time portfolio value component in your frontend:

```jsx
import LivePortfolioValue from '@/components/portfolio/LivePortfolioValue';

// In your component:
<LivePortfolioValue accountId={accountId} />
```

## System Performance

- The system is designed to be highly efficient, even with a large number of users
- Market data is subscribed to only once per symbol, regardless of how many users hold that asset
- Redis is used for fast data storage and inter-service communication
- Updates are throttled to avoid overwhelming clients

## Monitoring and Testing

- Each service includes logging that can be used for monitoring
- The WebSocket server provides a `/health` endpoint for status checks
- Run tests with: `cd backend && python -m unittest discover tests`

## Deployment Considerations

- For production, host Redis with proper persistence and replication
- Use secure WebSocket connections (WSS) in production
- Scale the WebSocket server horizontally behind a load balancer for high availability
- Configure proper authentication for WebSocket connections

## Troubleshooting

- Check Redis connection if services are not communicating
- Verify Alpaca API keys have the necessary permissions
- Ensure market data subscriptions are properly configured
- Look for error messages in the service logs

## License

This project is proprietary and confidential. Unauthorized copying, transferring, or reproduction of the contents of this repository, via any medium, is strictly prohibited. 
