# Clera Backend Documentation

## Overview

Clera is a financial AI platform that leverages advanced language models and agent-based architecture to provide financial analysis, portfolio management, and conversational capabilities. The backend is built using Python with FastAPI, LangGraph for agent orchestration, and various AI services for natural language understanding and generation.

## Directory Structure

```
backend/
├── api_server.py          # FastAPI server for RESTful API endpoints
├── server.py              # WebSocket server for real-time communication
├── requirements.txt       # Python dependencies
├── README.md              # Project documentation
├── .env                   # Environment variables and API keys
├── clera_agents/          # Agent implementations using LangGraph
│   ├── graph.py           # Main agent workflow definition
│   ├── financial_analyst_agent.py  # Financial analysis capabilities
│   ├── portfolio_management_agent.py  # Portfolio management capabilities
│   ├── trade_execution_agent.py  # Trade execution functionality
│   ├── tools/             # Tool implementations for agents
│   │   ├── portfolio_analysis.py  # Portfolio analysis tools
│   │   └── company_analysis.py  # Company research tools
│   └── types/             # Type definitions
├── clera_chatbots/        # Chatbot implementations
│   ├── chatbot_for_frontend.py  # Frontend-facing chatbot
│   ├── perplexity_ragbot.py  # RAG-enabled chatbot using Perplexity
│   ├── llama_pplx_ragbot.py  # RAG-enabled chatbot using Llama & Perplexity
│   └── pplx_rag_for_apis.py  # API-focused RAG implementation
├── conversational_ai/     # Voice and conversational capabilities
│   ├── api.py             # API for conversational features
│   ├── live_chat/         # Live chat implementation
│   ├── audio_files/       # Audio file storage
│   └── learning_cartesia.py  # Integration with Cartesia voice AI
├── utils/                 # Utility functions
│   ├── alpaca/            # Alpaca broker integration utilities
│   │   ├── __init__.py    # Exports all functions
│   │   ├── bank_funding.py # Plaid integration for ACH funding
│   │   └── manual_bank_funding.py # Manual bank account connection
└── venv/                  # Python virtual environment
```

## Core Components

### API Server (api_server.py)

This is the main REST API server that provides endpoints for chat interactions, trade execution, company information, and brokerage account operations. Built with FastAPI, it handles:

- `/api/chat` - Primary chat endpoint for user interactions
- `/api/trade` - Trade execution endpoint
- `/api/company/{ticker}` - Company information lookup
- `/api/health` - Health check endpoint
- `/create-alpaca-account` - Endpoint for creating brokerage accounts via Alpaca
- `/create-ach-relationship-link` - Creates a Plaid Link for bank account connection
- `/create-ach-relationship-manual` - Creates an ACH relationship manually
- `/get-ach-relationships` - Retrieves all ACH relationships for an account
- `/initiate-ach-transfer` - Initiates an ACH transfer from bank to Alpaca

The API server imports the agent graph from `clera_agents.graph` and orchestrates the workflow between different specialized agents.

### WebSocket Server (server.py)

Provides real-time communication capabilities using WebSockets. Features:

- Financial RAG (Retrieval Augmented Generation) agent
- Connection to vector databases (Pinecone)
- Integration with Retell for voice capabilities
- Real-time LLM response streaming

### Real-Time Portfolio Value Tracking System (portfolio_realtime/)

A distributed system for providing real-time portfolio value updates during market hours. The architecture consists of:

1. **Multiple Interconnected Services**:
   - `symbol_collector.py`: Collects all unique symbols across user portfolios
   - `market_data_consumer.py`: Subscribes to real-time market data for tracked symbols
   - `portfolio_calculator.py`: Calculates portfolio values using latest prices
   - `websocket_server.py`: Maintains WebSocket connections with clients

2. **Data Flow Architecture**:
   - Frontend connects to `/ws/portfolio/{accountId}` WebSocket endpoint
   - Next.js proxy forwards to API Server (port 8000)
   - API Server proxies to dedicated WebSocket Server (port 8001)
   - WebSocket Server maintains client connections and sends updates
   - Redis used as shared cache and message broker between components

3. **Key Features**:
   - Centralized market data subscription (subscribe once per symbol)
   - Shared price cache for efficient portfolio calculations
   - Heartbeat mechanism to keep connections alive
   - Automatic reconnection with exponential backoff
   - Proper error handling and logging

#### Running Locally

To run the complete system locally, you need:

1. **Start Redis**:
   ```bash
   brew services start redis  # macOS
   # OR
   sudo systemctl start redis-server  # Linux
   ```

2. **Run all services together**:
   ```bash
   cd backend
   source venv/bin/activate  # Use direct venv activation
   python -m portfolio_realtime.run_services
   ```

3. **Configure frontend**:
   Add to `.env.local`:
   ```
   NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8001
   ```

4. **Start API server (in separate terminal)**:
   ```bash
   cd backend
   source venv/bin/activate
   python api_server.py
   ```

5. **Start frontend (in separate terminal)**:
   ```bash
   cd frontend-app
   npm run dev
   ```

#### AWS Deployment

For AWS deployment, two main services are involved in the real-time portfolio system:

1.  **API Server** (`api-service` on Port 8000)
    *   Handles HTTP API requests.
    *   Previously proxied WebSocket connections, but this is now handled directly by the `websocket-lb-service`.
    *   Still requires standard load balancer configurations for HTTP/HTTPS.

2.  **WebSocket Load Balanced Service** (`websocket-lb-service` on Port 8001 internally, exposed via HTTPS/WSS on `ws.askclera.com`)
    *   This is an AWS Copilot "Load Balanced Web Service" type.
    *   Directly handles client WebSocket connections.
    *   Uses Redis for inter-service communication if other backend components of the portfolio system need to publish updates (e.g., `market_data_consumer.py` publishing to Redis, `websocket_server.py` in `websocket-lb-service` reading from Redis and pushing to clients).
    *   Authenticates connections using a JWT passed as a query parameter (`?token=...`), validated against `SUPABASE_JWT_SECRET`.

**Required AWS Copilot Configuration Changes:**

1.  **Environment Manifest** (`backend/copilot/environments/production/manifest.yml`):
    *   Ensure it imports the wildcard SSL certificate for `*.askclera.com`.

    ```yaml
    # In copilot/environments/production/manifest.yml
    http:
      public:
        certificates:
          - arn:aws:acm:us-west-1:YOUR_ACCOUNT_ID:certificate/YOUR_WILDCARD_CERT_ID # For *.askclera.com
    # ... other environment configurations ...
    ```
    *Replace `YOUR_ACCOUNT_ID` and `YOUR_WILDCARD_CERT_ID` with your actual values.*

2.  **API Server Manifest** (`backend/copilot/api-service/manifest.yml`):
    *   No longer needs specific WebSocket proxy configurations if the frontend connects directly to `ws.askclera.com`.
    *   If it still needs to make outbound connections *to* the websocket service for any reason (unlikely for client-facing websockets), `network: connect: true` might be relevant for service discovery.
    *   It should define its own alias if accessed via a custom domain (e.g., `api.askclera.com`).
    ```yaml
    # backend/copilot/api-service/manifest.yml
    name: api-service
    type: Load Balanced Web Service # Or Backend Service if not publicly exposed

    http:
      path: '/' # Or your specific API paths
      alias: api.askclera.com # If using a custom domain for the API
      healthcheck:
        path: '/health'
    # ... other configurations ...
    image:
      port: 8000 # Your application port
    # ...
    variables:
      REDIS_HOST: 'your-redis-endpoint' # Ensure this is correctly configured
      REDIS_PORT: 6379
      SUPABASE_JWT_SECRET: ${SUPABASE_JWT_SECRET} # From SSM
      # ... other env vars
    secrets:
      SUPABASE_JWT_SECRET: /copilot/${COPILOT_APPLICATION_NAME}/${COPILOT_ENVIRONMENT_NAME}/secrets/SUPABASE_JWT_SECRET
    ```

3.  **WebSocket Service Manifest** (`backend/copilot/websocket-lb-service/manifest.yml`):
    *   This service is now a "Load Balanced Web Service" to be publicly accessible via HTTPS/WSS.
    ```yaml
    # backend/copilot/websocket-lb-service/manifest.yml
    name: websocket-lb-service
    type: Load Balanced Web Service

    http:
      path: '/' # The path your WebSocket server listens on, e.g., /ws/portfolio/*
      alias: ws.askclera.com # Custom domain for WebSocket
      healthcheck:
        path: '/health' # A simple HTTP health check endpoint in your WebSocket server code
        healthy_threshold: 2
        unhealthy_threshold: 2
        timeout: 5s
        interval: 10s
    
    image:
      build: backend/Dockerfile.websocket # Path to your WebSocket Dockerfile
      port: 8001 # The port your WebSocket application listens on internally

    cpu: 256
    memory: 512
    count: 1

    variables:
      REDIS_HOST: 'your-redis-endpoint' # Ensure this is correctly configured
      REDIS_PORT: 6379
      SUPABASE_JWT_SECRET: ${SUPABASE_JWT_SECRET} # From SSM
      # HEARTBEAT_INTERVAL, CONNECTION_TIMEOUT etc. specific to your app
    
    secrets:
      SUPABASE_JWT_SECRET: /copilot/${COPILOT_APPLICATION_NAME}/${COPILOT_ENVIRONMENT_NAME}/secrets/SUPABASE_JWT_SECRET

    # If this service needs to connect to other services like Redis within the VPC
    # network:
    #   vpc:
    #     placement: 'private' # Or 'public' if direct internet access is needed by the tasks
    ```
    *   **Note on Health Check for WebSockets**: ALBs health check HTTP/HTTPS endpoints. Your WebSocket server application (`portfolio_realtime/websocket_server.py`) should expose a simple HTTP GET endpoint (e.g., `/health`) that returns a 200 OK. Copilot uses this to determine task health.
    *   The `http.path` in the manifest should correspond to the base path the ALB forwards to your service. Your WebSocket server then handles specific paths like `/ws/portfolio/{accountId}`.

For detailed testing and deployment steps, see:
- `docs/portfolio_realtime_setup.md`
- `docs/portfolio-page-notes.md`

### Agent Architecture (clera_agents/)

The system uses LangGraph to orchestrate multiple specialized agents:

1. **Financial Analyst Agent** (`financial_analyst_agent.py`)
   - Analyzes company fundamentals and financial data
   - Provides investment insights and recommendations

2. **Portfolio Management Agent** (`portfolio_management_agent.py`)
   - Manages investment portfolios and suggests portfolio adjustments and rebalancing
   - Implementation includes purchase history analysis and account activity tracking
   - Integrates with shared utilities for account management via `utils.account_utils`
   - Fixed undefined variable errors and consolidated duplicate functions for cleaner code architecture

3. **Trade Execution Agent** (`trade_execution_agent.py`)
   - Executes trades via brokerage APIs (Alpaca)
   - Handles order placement and confirmation

4. **Main Agent Graph** (`graph.py`)
   - Defines the workflow and communication between agents
   - Uses LangGraph for state management and transitions

### Agent Tools (clera_agents/tools/)

Specialized tools available to the agents:

- **Portfolio Analysis** (`portfolio_analysis.py`) - Tools for analyzing portfolio performance, risk metrics, and allocation
- **Company Analysis** (`company_analysis.py`) - Company research tools, financial data retrieval, and analysis

### Alpaca Broker Integration

The backend includes integration with Alpaca's Broker API for brokerage account management:

1. **Account Creation** - Endpoint to create new brokerage accounts
   - Receives formatted user data from the frontend
   - Maps data to Alpaca's data models using the Alpaca Python SDK
   - Handles contact information, identity verification, disclosures, and agreements
   - Returns created account information to the frontend

2. **API Authentication** - Uses API key authentication for security
   - Validates API keys for all broker operations
   - Enforces secure communication between frontend and backend

3. **Alpaca SDK Implementation**
   - Uses Alpaca's official Python SDK for Broker API integration
   - Includes error handling and validation for API requests
   - Supports sandbox environment for testing and development

4. **ACH Funding with Plaid Integration**
   - Utility functions in `utils/alpaca/bank_funding.py` to connect bank accounts
   - Creates Plaid Link URLs with OAuth redirect support
   - Exchanges Plaid tokens for access tokens
   - Creates processor tokens for Alpaca integration
   - Establishes ACH relationships in Alpaca
   - Initiates ACH transfers from connected bank accounts

5. **Manual Bank Account Connection**
   - Utility functions in `utils/alpaca/manual_bank_funding.py`
   - Creates ACH relationships using manually entered bank details
   - Supports both checking and savings account types
   - Validates routing numbers against Alpaca's requirements
   - Handles Alpaca's single active ACH relationship constraint

### Chatbots (clera_chatbots/)

Multiple chatbot implementations for different use cases:

- **Frontend Chatbot** (`chatbot_for_frontend.py`) - Optimized for web interface
- **RAG-enabled Chatbots** - Various implementations using retrieval augmented generation
  - `perplexity_ragbot.py` - Using Perplexity AI
  - `llama_pplx_ragbot.py` - Hybrid approach with Llama and Perplexity
  - `pplx_rag_for_apis.py` - API-focused implementation

### Voice AI (conversational_ai/)

Voice and conversational capabilities:

- Integration with LiveKit for real-time audio
- Deepgram for speech-to-text
- Cartesia for text-to-speech with custom voices
- Audio file generation and playback

## Technologies

### Language Models
- Groq (via `langchain_groq`)
- Perplexity (via `langchain_community.chat_models.ChatPerplexity`)
- Anthropic Claude (via environment variables)

### Vector Databases
- Pinecone for embedding storage and retrieval

### Agent Frameworks
- LangGraph for agent orchestration and workflow management
- LangChain for LLM interactions and tools

### APIs and Services
- Alpaca for brokerage services and trade execution
  - Alpaca Broker API for account creation and management
  - Alpaca Trading API for executing trades
- Plaid for bank account linking and ACH transfers
- Financial Modeling Prep for financial data
- LiveKit, Deepgram, and Cartesia for voice features
- Retell for additional voice capabilities

## Configuration

The system uses environment variables (in `.env` file) for configuration:

- API keys for various services (Groq, OpenAI, Pinecone, etc.)
- Broker credentials (Alpaca API key and secret)
- Voice service configuration (LiveKit, Cartesia, Deepgram)
- Database connection settings (Supabase)
- Plaid configuration:
  - `PLAID_CLIENT_ID`: Plaid client ID
  - `PLAID_SECRET`: Plaid secret for chosen environment
  - `PLAID_ENV`: 'sandbox' for testing, 'development' for production
  - `BACKEND_PUBLIC_URL`: Public URL of the backend for webhooks

## API Routes

### Alpaca Broker Account Creation
- **Endpoint**: `/create-alpaca-account`
- **Method**: POST
- **Authentication**: API key
- **Request Body**:
  ```json
  {
    "userId": "user-id-from-supabase",
    "alpacaData": {
      "contact": {
        "email_address": "user@example.com",
        "phone_number": "555-555-5555",
        "street_address": ["123 Main St"],
        "city": "San Francisco",
        "state": "CA",
        "postal_code": "94105",
        "country": "USA"
      },
      "identity": {
        "given_name": "John",
        "family_name": "Doe",
        "date_of_birth": "1990-01-01",
        "tax_id_type": "USA_SSN",
        "tax_id": "123-45-6789",
        "country_of_citizenship": "USA",
        "country_of_birth": "USA",
        "country_of_tax_residence": "USA",
        "funding_source": ["employment_income"]
      },
      "disclosures": {
        "is_control_person": false,
        "is_affiliated_exchange_or_finra": false,
        "is_politically_exposed": false,
        "immediate_family_exposed": false
      },
      "agreements": [
        {
          "agreement": "customer_agreement",
          "signed_at": "2023-01-01T00:00:00Z",
          "ip_address": "127.0.0.1"
        }
      ]
    }
  }
  ```
- **Response**:
  ```json
  {
    "id": "account-id",
    "account_number": "account-number",
    "status": "SUBMITTED",
    "created_at": "2023-01-01T00:00:00Z"
  }
  ```

### Create ACH Relationship Link (Plaid)
- **Endpoint**: `/create-ach-relationship-link`
- **Method**: POST
- **Authentication**: API key
- **Request Body**:
  ```json
  {
    "accountId": "alpaca-account-id",
    "redirectUri": "https://app.example.com/callback"
  }
  ```
- **Response**:
  ```json
  {
    "link_url": "https://cdn.plaid.com/link/v2/stable/link.html?..."
  }
  ```

### Create ACH Relationship Manual
- **Endpoint**: `/create-ach-relationship-manual`
- **Method**: POST
- **Authentication**: API key
- **Request Body**:
  ```json
  {
    "accountId": "alpaca-account-id",
    "bankAccountType": "CHECKING",
    "bankAccountNumber": "123456789",
    "bankRoutingNumber": "121000358",
    "nickname": "My Checking Account"
  }
  ```
- **Response**:
  ```json
  {
    "id": "relationship-id",
    "status": "APPROVED",
    "created_at": "2023-01-01T00:00:00Z"
  }
  ```

### Get ACH Relationships
- **Endpoint**: `/get-ach-relationships`
- **Method**: GET
- **Authentication**: API key
- **Query Parameters**:
  ```
  accountId=alpaca-account-id
  ```
- **Response**:
  ```json
  {
    "relationships": [
      {
        "id": "relationship-id",
        "status": "APPROVED",
        "bank_name": "Bank Name",
        "bank_account_type": "CHECKING",
        "last_4": "6789",
        "created_at": "2023-01-01T00:00:00Z"
      }
    ]
  }
  ```

### Initiate ACH Transfer
- **Endpoint**: `/initiate-ach-transfer`
- **Method**: POST
- **Authentication**: API key
- **Request Body**:
  ```json
  {
    "accountId": "alpaca-account-id",
    "relationshipId": "relationship-id",
    "amount": 100.00,
    "direction": "INCOMING"
  }
  ```
- **Response**:
  ```json
  {
    "id": "transfer-id",
    "status": "SUBMITTED",
    "amount": 100.00,
    "created_at": "2023-01-01T00:00:00Z"
  }
  ```

## Deployment

The backend uses a hybrid deployment model:

1. **Non-AI Agent Logic (API Server, Broker Integration, etc.)**
   - Deployed on AWS using:
     - ECS (Elastic Container Service) for containerized workloads
     - AWS Copilot for deployment orchestration 
     - Load balancing through AWS Application Load Balancer
     - Environment variables managed through AWS Parameter Store
     - Production monitoring and logging with CloudWatch
   - Production API accessible at:
     `http://clera--Publi-3zZfi5RHJKzZ-523282791.us-west-1.elb.amazonaws.com`

2. **AI Agent Workflow (LangGraph)**
   - Hosted on dedicated LangGraph servers
   - Defined in the project's `langgraph.json` configuration file
   - Connects to the main backend through API calls
   - Environment variables for AI services managed separately
   - Specialized scaling for AI workload requirements

This split architecture allows for optimized resource allocation between standard web services and more compute-intensive AI processing.

### AWS Copilot Deployment Details

The AWS-hosted components are deployed using AWS Copilot, which orchestrates ECS services, networking, and related AWS resources:

#### Manifest Structure
```
backend/copilot/
├── api-service/           # API service configuration
│   └── manifest.yml       # Service manifest
├── environments/          # Environment configurations
│   └── production/        # Production environment
│       └── manifest.yml   # Environment manifest
└── pipelines/             # CI/CD pipeline configuration
```

#### Service Manifest Configuration
The `api-service` is configured as a Load Balanced Web Service in `backend/copilot/api-service/manifest.yml`, with the following key configuration:

```yaml
# The manifest for the "api-service" service
name: api-service
type: Load Balanced Web Service

http:
  path: '/'
  healthcheck:
    path: '/api/health'
    healthy_threshold: 2
    unhealthy_threshold: 5
    interval: 30s
    timeout: 15s

image:
  build:
    dockerfile: Dockerfile
    context: .
    platform: linux/amd64
    no_cache: true
  port: 8000

cpu: 1024      # 1 vCPU
memory: 2048   # 2 GB RAM
platform: linux/amd64
count: 1
exec: true

# Environment variables and secrets management
variables:
  # Static environment variables
  PYTHONUNBUFFERED: "1"
  WORKERS: "4"
  # Additional environment variables...

secrets:
  # Integration with SSM Parameter Store
  NEXT_PUBLIC_SUPABASE_ANON_KEY: /clera-api/production/next_public_supabase_anon_key
  OPENAI_API_KEY: /clera-api/production/openai_api_key
  # Additional secrets...

# Environment-specific overrides
environments:
  production:
    variables:
      LOG_LEVEL: "info"
    deployment:
      rolling: 'recreate'
      deployment_controller:
        type: ECS
      circuit_breaker:
        enable: true
        rollback: true
    logging:
      retention: 30
    observability:
      tracing: awsxray
```

#### Deployment Process

1. **Initial Setup**:
   ```bash
   copilot app init clera-api
   copilot env init --name production
   copilot svc init --name api-service --svc-type "Load Balanced Web Service"
   ```

2. **Deployment**:
   ```bash
   copilot svc deploy --name api-service --env production
   ```

3. **Continuous Deployment Pipeline**:
   ```bash
   copilot pipeline init
   copilot pipeline deploy
   ```

#### Secrets Management

AWS Copilot integrates with AWS Systems Manager Parameter Store for secure secrets management:

1. **Storing Secrets**:
   ```bash
   # Create a parameter
   aws ssm put-parameter \
     --name /clera-api/production/openai_api_key \
     --value "sk-..." \
     --type SecureString
   ```

2. **Accessing in Application**:
   Secrets are automatically injected as environment variables at runtime.

3. **Automated Setup Script**:
   The project includes a `setup-aws-secrets.sh` script that creates required parameters in SSM.

#### Health Checks and Monitoring

- **Health Check Endpoint**: `/api/health` provides basic API server status
- **CloudWatch Alarms**: Configured for CPU, memory, and service availability
- **X-Ray Tracing**: Enabled for production environment for detailed request tracing

#### Common Deployment Issues and Fixes

1. **YAML Syntax Errors in Manifest**:
   - Always validate YAML syntax before deploying with `yamllint`
   - Watch for indentation errors and string formatting issues
   - Fix: Use proper YAML formatting and indentation

2. **Service Deployment Failures**:
   - Check CloudWatch Logs at `/aws/ecs/clera-api-production-api-service`
   - View cluster events with `copilot svc logs`
   - Fix: Address application errors or resource constraints

3. **Secret Access Issues**:
   - Ensure SSM parameters exist in the correct region and with exact matching paths
   - Check IAM permissions for the ECS task role
   - Fix: Run `setup-aws-secrets.sh` or create missing parameters manually

4. **Container Health Check Failures**:
   - The container must return a 200 status on `/api/health` within the timeout period
   - Adjust healthcheck settings for slow-starting applications
   - Fix: Increase timeout or improve startup performance

#### Scaling Configuration

The service uses autoscaling based on CPU and memory metrics:

```yaml
count:
  range: 1-10
  cpu_percentage: 70
  memory_percentage: 80
```

This configures the service to autoscale between 1 and 10 tasks based on 70% CPU utilization or 80% memory utilization.

#### Service Endpoints

After successful deployment, the service is accessible through the AWS Application Load Balancer URL:

```
http://clera--Publi-3zZfi5RHJKzZ-523282791.us-west-1.elb.amazonaws.com
```

This endpoint serves:
- REST API for frontend communication
- Health check at `/api/health`
- All brokerage and financial API integrations
- Proxy requests to LangGraph services

For production usage, this URL is typically:
1. Hidden behind a custom domain with proper DNS configuration
2. Secured with HTTPS/TLS certificates
3. Protected with WAF (Web Application Firewall) rules

### LangGraph Deployment Details

The AI Agent workflow is deployed on dedicated LangGraph servers, separate from the main AWS infrastructure. This architecture optimizes for AI workloads that have different scaling characteristics than traditional web services.

#### LangGraph Configuration

The agent deployment is defined in the `langgraph.json` file at the project root:

```json
{
  "dockerfile_lines": [],
  "graphs": {
    "agent": "./backend/clera_agents/graph.py:graph" 
  },
  "env": "./backend/.env",
  "dependencies": ["./backend"],
  "store": {
    "index": {
      "embed": "openai:text-embedding-3-small",
      "dims": 1536,
      "fields": ["$"]
    }
  }
}
```

This configuration specifies:

1. **Agent Graph**: The main agent workflow is defined in `./backend/clera_agents/graph.py` as the `graph` object
2. **Environment Variables**: Loaded from `./backend/.env`
3. **Dependencies**: The entire `./backend` directory is included
4. **Vector Store**: Uses OpenAI's text-embedding-3-small model with 1536 dimensions

#### Deployment Process

1. **Initial Setup**:
   - LangGraph account and project configuration
   - API key generation for service authentication
   - Environment variable configuration

2. **Deployment**:
   - Direct deployment from GitHub repository
   - Automatic updates when changes are pushed to the main branch
   - Version control and rollback capabilities

3. **Integration Points**:
   - The AWS backend communicates with LangGraph using REST API calls
   - Frontend can initiate AI workflows through the backend API
   - Long-running agent sessions are maintained on LangGraph servers

#### Security Configuration

1. **Authentication**:
   - API key-based authentication for backend-to-LangGraph communication
   - No direct frontend-to-LangGraph communication (always proxied through backend)
   - Key rotation policies for production environments

2. **Data Handling**:
   - Sensitive user data remains in AWS backend
   - Only necessary context is passed to LangGraph
   - Compliance with data privacy regulations

#### Monitoring and Observability

1. **LangGraph Monitoring**:
   - Agent execution traces for debugging
   - Performance metrics for response times
   - Error tracking and alerting
   - Usage statistics for billing and capacity planning

2. **Integration with AWS Monitoring**:
   - Cross-service request tracking
   - End-to-end latency measurement
   - Correlation of backend events with LangGraph execution

#### Scaling and Performance

1. **Auto-scaling**:
   - Automatic scaling based on request volume
   - Reserved capacity for critical workloads
   - Burst capacity for peak usage periods

2. **Performance Optimizations**:
   - Response caching for common queries
   - Optimized model selection based on workload
   - Efficient context management to reduce token usage

### Local Development

For local development, both components can be run locally:
- Local development with Docker and Docker Compose
- VS Code Dev Containers for easy setup
- Support for running LangGraph locally during development

## Development Configuration

### File Watcher Configuration

The development server uses Uvicorn's file watching capability for automatic reloading when code changes. To prevent excessive terminal spam from virtual environment changes, the watchfiles library is configured to ignore certain directories:

- **Environment Variable**: `WATCHFILES_IGNORE_PATHS`
- **Configuration**: `.venv;venv;site-packages;__pycache__;.git`
- **Location**: Set in `.watchfiles.env` file or via `activate.sh` script

**Usage Options**:

1. Source the environment file before starting the server:
   ```bash
   source .watchfiles.env && python api_server.py
   ```

2. Use the helper activation script:
   ```bash
   source activate.sh && python api_server.py
   ```

This configuration prevents uvicorn's file watcher from detecting changes in virtual environment directories, which significantly reduces log spam and improves the development experience.

## Getting Started

1. Clone the repository
2. Configure the `.env` file with necessary API keys
3. Install dependencies: `pip install -r requirements.txt`
4. Start the API server: `uvicorn api_server:app --reload`
5. For WebSocket server: `uvicorn server:app --reload --port=8080`

## Integration Points

- **Frontend**: Connects via REST API and WebSockets
- **Financial Data Providers**: Integrated via API calls
- **Vector Databases**: Pinecone for knowledge retrieval
- **Voice Services**: LiveKit, Deepgram, and Cartesia integration
- **Brokerage Services**: Alpaca Broker API for account management and trading
- **Banking Services**: Plaid for bank account connection and ACH transfers

## AWS WebSocket Deployment Guide

This section provides a comprehensive guide for deploying and maintaining the WebSocket service alongside the API service in AWS ECS using Copilot CLI.

### Prerequisites

- AWS CLI configured
- AWS Copilot CLI installed
- Docker installed
- ElastiCache Redis instance running (or to be created)

### Step 1: Set Up Redis ElastiCache (First Deployment Only)

The WebSocket server requires Redis for inter-service communication. If you don't already have a Redis instance:

```bash
# Create a VPC subnet group first
aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name clera-cache-subnet \
    --subnet-ids subnet-YOUR-SUBNET-IDS \
    --description "Subnet group for Clera Redis"

# Create a Redis cluster in ElastiCache
aws elasticache create-cache-cluster \
    --cache-cluster-id clera-redis \
    --engine redis \
    --cache-node-type cache.t3.micro \
    --num-cache-nodes 1 \
    --cache-subnet-group-name clera-cache-subnet \
    --security-group-ids sg-YOUR-SECURITY-GROUP-ID
```

After creation, note the endpoint URL for configuration in Step 3. In our deployment:
- Redis endpoint: `clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com`
- Redis port: `6379`

### Step 2: Create WebSocket Service Definition

From the project root:

```bash
# Navigate to backend directory
cd backend

# Create a new service definition for the WebSocket server
copilot svc init --name websocket-service --app clera-api --svc-type "Backend Service"
```

This creates the initial manifest file at `backend/copilot/websocket-service/manifest.yml`.

### Step 3: Configure Service Manifests

#### 3.1: WebSocket Service Manifest

Edit `backend/copilot/websocket-service/manifest.yml`:

```yaml
name: websocket-service
type: Backend Service

# Internal health check endpoint
http:
  healthcheck:
    path: '/health'
    healthy_threshold: 2
    unhealthy_threshold: 2
    timeout: 5
    interval: 10

# Configure container
image:
  build:
    dockerfile: Dockerfile.websocket
    context: .
    platform: linux/amd64
  port: 8001

cpu: 512      # 0.5 vCPU
memory: 1024  # 1 GB RAM
count: 1      # Can be adjusted based on load
platform: linux/amd64
exec: true

# Environment variables
variables:
  WEBSOCKET_PORT: 8001
  WEBSOCKET_HOST: "0.0.0.0"
  HEARTBEAT_INTERVAL: 30
  CONNECTION_TIMEOUT: 300
  LOG_LEVEL: "info"
  
# Service discovery configuration
network:
  vpc:
    placement: 'private'

# Secrets from AWS SSM Parameter Store
secrets:
  REDIS_HOST: /clera-api/production/redis_host
  REDIS_PORT: /clera-api/production/redis_port
```

#### 3.2: API Service Manifest

Update `backend/copilot/api-service/manifest.yml` to enable WebSocket proxying:

```yaml
# In the http section
http:
  path: '/'
  # You can specify a custom health check path. The default is "/".
  healthcheck:
    path: '/api/health'
    healthy_threshold: 3
    unhealthy_threshold: 10  # Increased to allow more retries before failing
    interval: 60s           # Increased interval for better stability
    timeout: 30s            # Increased timeout for health check
  # Add WebSocket support
  deregistration_delay: 60s # Lower deregistration delay (default is 300s)
  stickiness: true # Enable session stickiness for WebSocket connections
  # Increase idle timeout for WebSocket connections
  additional_rules:
    - path: '/ws/*'
      healthcheck:
        path: '/api/health'  # Using the same health check path

# In the variables section
variables:
  PYTHONUNBUFFERED: "1"
  WORKERS: "4" # Adjust based on CPU/Memory if needed
  BIND_PORT: "8000"
  APP_HOME: "/app"
  LANGSMITH_TRACING: "true"
  LANGSMITH_ENDPOINT: "https://api.smith.langchain.com"
  BROKER_BASE_URL: "https://paper-api.alpaca.markets"
  ALPACA_ENVIRONMENT: "sandbox"
  PLAID_ENV: "sandbox"
  # Configuration for WebSocket proxying
  WEBSOCKET_SERVICE_URL: "websocket-service.production.clera-api.internal:8001" # Service discovery endpoint
  WEBSOCKET_TIMEOUT: "300" # 5 minutes timeout for WebSocket connections
  WEBSOCKET_CONNECT_TIMEOUT: "5" # 5 seconds timeout for initial WebSocket connection
  LOG_LEVEL: "info"
```

#### 3.3: Environment Manifest

The environment manifest (`backend/copilot/environments/production/manifest.yml`) should support HTTPS for WebSockets:

```yaml
# Configure ALB settings optimized for WebSockets
http:
  public:
    ingress:
      timeout: 300  # Set timeout to match WebSocket timeout
    protocol: 'HTTPS'  # Required for WSS (secure WebSockets)
    certificate: 'arn:aws:acm:us-west-1:039612860226:certificate/47cf4c0a-7b93-486d-93a5-95b2115b3d04'
```

### Step 4: Create WebSocket Dockerfile

Create `backend/Dockerfile.websocket`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create entrypoint script
COPY aws-entrypoint.sh /aws-entrypoint.sh
RUN chmod +x /aws-entrypoint.sh

# Set environment variables
ENV PYTHONPATH="/app"
ENV WEBSOCKET_PORT=8001
ENV WEBSOCKET_HOST="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Expose WebSocket port
EXPOSE 8001

# Run the WebSocket server
CMD ["python", "-m", "portfolio_realtime.websocket_server"]
```

### Step 5: Create Redis Parameters in SSM

Store Redis connection details in AWS SSM Parameter Store:

```bash
# Our Redis endpoint
REDIS_ENDPOINT="clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com"
REDIS_PORT="6379"

# Create parameters in SSM
aws ssm put-parameter \
    --name "/clera-api/production/redis_host" \
    --value "$REDIS_ENDPOINT" \
    --type "String" \
    --overwrite

aws ssm put-parameter \
    --name "/clera-api/production/redis_port" \
    --value "$REDIS_PORT" \
    --type "String" \
    --overwrite
```

### Step 6: Ensure API Server Has WebSocket Proxy Support

Update `backend/api_server.py` to include WebSocket proxy functionality:

```python
# Add this WebSocket endpoint to proxy WebSocket connections to the WebSocket server
@app.websocket("/ws/portfolio/{account_id}")
async def websocket_proxy(websocket: WebSocket, account_id: str):
    """
    Proxy WebSocket connections to the dedicated WebSocket server.
    
    This allows frontend clients to connect to the API server on port 8000
    while the actual WebSocket handling happens on the dedicated server on port 8001.
    """
    # Get WebSocket server URL from environment variable
    websocket_service_url = os.getenv("WEBSOCKET_SERVICE_URL", "localhost:8001")
    
    # Split host and port if a combined URL is provided
    if ":" in websocket_service_url:
        websocket_host, websocket_port = websocket_service_url.split(":", 1)
    else:
        websocket_host = websocket_service_url
        websocket_port = os.getenv("WEBSOCKET_PORT", "8001")
    
    # Connect timeout from environment (default 5 seconds)
    connect_timeout = int(os.getenv("WEBSOCKET_CONNECT_TIMEOUT", "5"))
    
    # Accept the WebSocket connection from the client
    await websocket.accept()
    
    try:
        # Create a WebSocket connection to the WebSocket server
        async with websockets.connect(
            f"ws://{websocket_host}:{websocket_port}/ws/portfolio/{account_id}",
            ping_interval=None,  # Let the server handle pings
            close_timeout=connect_timeout,
        ) as ws_server:
            # Create tasks for bidirectional communication
            consumer_task = asyncio.create_task(
                consumer_handler(websocket, ws_server)
            )
            producer_task = asyncio.create_task(
                producer_handler(websocket, ws_server)
            )
            
            # Wait for either task to complete (or fail)
            done, pending = await asyncio.wait(
                [consumer_task, producer_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            
            # Cancel any pending tasks
            for task in pending:
                task.cancel()
                
    except (websockets.exceptions.ConnectionClosed, 
            websockets.exceptions.WebSocketException,
            ConnectionRefusedError) as e:
        logger.error(f"WebSocket proxy error: {str(e)}")
    except Exception as e:
        logger.exception(f"Unexpected error in WebSocket proxy: {str(e)}")
    finally:
        # Ensure the client connection is closed
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()

# Helper functions for the WebSocket proxy
async def consumer_handler(client: WebSocket, server):
    """Forward messages from client to server"""
    try:
        while True:
            message = await client.receive_text()
            await server.send(message)
    except Exception as e:
        pass  # Connection closed

async def producer_handler(client: WebSocket, server):
    """Forward messages from server to client"""
    try:
        while True:
            message = await server.recv()
            await client.send_text(message)
    except Exception as e:
        pass  # Connection closed

# Add this health endpoint for websocket proxy health checks
@app.get("/ws/health")
async def websocket_health_check():
    """Health check endpoint specifically for WebSocket proxy functionality."""
    # Get WebSocket service URL from environment variable
    websocket_service_url = os.getenv("WEBSOCKET_SERVICE_URL", "localhost:8001")
    
    # Split host and port if needed
    if ":" in websocket_service_url:
        websocket_host, websocket_port = websocket_service_url.split(":", 1)
    else:
        websocket_host = websocket_service_url
        websocket_port = os.getenv("WEBSOCKET_PORT", "8001")
    
    # Return healthy status without checking actual connectivity
    # This prevents health check failures during startup
    return {
        "status": "healthy",
        "service": "api-server-websocket-proxy",
        "websocket_host": websocket_host,
        "websocket_port": websocket_port,
        "timestamp": datetime.datetime.now().isoformat()
    }
```

### Step 7: Deploy the Services

First, deploy the WebSocket service:

```bash
cd backend
copilot svc deploy --name websocket-service --env production
```

Then deploy the updated API service:

```bash
copilot svc deploy --name api-service --env production
```

### Step 8: Verify Deployment

Check the status of both services:

```bash
# Check WebSocket service status
copilot svc status --name websocket-service

# Check API service status
copilot svc status --name api-service
```

Check the logs to verify everything is running correctly:

```bash
# Stream WebSocket service logs
copilot svc logs --name websocket-service --follow

# Stream API service logs
copilot svc logs --name api-service --follow
```

### Common Deployment Issues and Solutions

#### Health Check Failures

**Problem**: ECS deployment failing with "Task failed ELB health checks" errors.

**Solution**:
1. Increase health check timeout and interval in the manifest:
   ```yaml
   healthcheck:
     path: '/api/health'
     healthy_threshold: 3
     unhealthy_threshold: 10  # Increased
     interval: 60s           # Increased
     timeout: 30s            # Increased
   ```

2. Ensure the health check endpoint doesn't depend on external services:
   ```python
   @app.get("/ws/health")
   async def websocket_health_check():
       # Return healthy without attempting to connect to WebSocket service
       return {
           "status": "healthy",
           # Additional info...
       }
   ```

3. In the AWS console, verify the health check settings for the target group:
   - Ensure the protocol is HTTP (not HTTPS) for internal health checks
   - Match timeout settings with your application startup time

#### Service Communication Issues

**Problem**: API service cannot connect to WebSocket service.

**Solution**:
1. Use the proper service discovery endpoint:
   ```
   websocket-service.production.clera-api.internal:8001
   ```

2. Add appropriate error handling and timeout settings:
   ```python
   connect_timeout = int(os.getenv("WEBSOCKET_CONNECT_TIMEOUT", "5"))
   
   try:
       # Connection code...
   except (websockets.exceptions.ConnectionClosed, 
           websockets.exceptions.WebSocketException,
           ConnectionRefusedError) as e:
       logger.error(f"WebSocket proxy error: {str(e)}")
   ```

3. Verify services are in the same VPC and security groups allow communication:
   ```bash
   # Check service discovery
   copilot svc exec --name api-service \
     --command "ping websocket-service.production.clera-api.internal"
   ```

#### HTTPS and SSL Certificate Issues

**Problem**: SSL certificate validation failures when clients try to connect.

**Solution**:
1. Use a valid SSL certificate in your ALB configuration:
   ```yaml
   http:
     public:
       protocol: 'HTTPS'
       certificate: 'arn:aws:acm:us-west-1:039612860226:certificate/47cf4c0a-7b93-486d-93a5-95b2115b3d04'
   ```

2. Ensure your domain (api.askclera.com) is included in certificate Subject Alternative Names (SANs)

3. Use secure WebSocket URLs in your frontend:
   ```javascript
   const ws = new WebSocket('wss://api.askclera.com/ws/portfolio/123');
   ```

4. For testing, you can use curl with the proper hostname:
   ```bash
   curl -v https://api.askclera.com/ws/health
   ```

#### Deployment Circuit Breaker Triggered

**Problem**: Deployment fails with "ECS Deployment Circuit Breaker triggered".

**Solution**:
1. Check if the task is failing immediately or after a health check:
   ```bash
   copilot svc logs --name api-service --follow
   ```

2. Wait for any previous deployments to fully roll back before trying again:
   ```bash
   copilot svc status --name api-service
   # Wait until you see "Running: 1/1" and no in-progress deployments
   ```

3. Adjust deployment circuit breaker settings in manifest:
   ```yaml
   deployment:
     rolling: 'recreate'
     circuit_breaker:
       enable: true
       rollback: true
     # Add rollout alarms for more control
   ```

### Redis Backend Configuration

Redis is used for communication between services. To ensure proper configuration:

1. **Redis Connection Testing**:
   ```python
   # Test code to verify Redis connectivity
   import redis
   
   r = redis.Redis(
       host=os.getenv("REDIS_HOST", "localhost"),
       port=int(os.getenv("REDIS_PORT", "6379")),
       socket_timeout=5,
       socket_connect_timeout=5,
   )
   
   try:
       response = r.ping()
       print(f"Redis connection successful: {response}")
   except Exception as e:
       print(f"Redis connection failed: {str(e)}")
   ```

2. **Security Group Configuration**:
   - Ensure the ECS task security group can access Redis port 6379
   - Add an inbound rule to the Redis security group allowing traffic from the ECS security group

3. **Redis Environment Variables**:
   Make sure both services have access to the same Redis instance:
   ```yaml
   # In both service manifests
   secrets:
     REDIS_HOST: /clera-api/production/redis_host
     REDIS_PORT: /clera-api/production/redis_port
   ```

### Load Balancer Configuration

Our production load balancer is configured with:

1. **HTTPS Listener (Port 443)**:
   - Forward to Target Group: clera-Targe-JDQU520PFGZO
   - Security Policy: ELBSecurityPolicy-TLS13-1-2-2021-06
   - Certificate: api.askclera.com (Certificate ID: 47cf4c0a-7b93-486d-93a5-95b2115b3d04)

2. **HTTP Listener (Port 80)**:
   - Redirects to HTTPS
   - Target Group: clera-Defau-4G2JCEUUKUNU

3. **WebSocket Support**:
   - Same target group as HTTP/HTTPS
   - Idle Timeout: 300 seconds (matches WEBSOCKET_TIMEOUT)
   - Stickiness: Enabled (required for WebSocket connections)

### API and WebSocket URLs

- Production API: https://api.askclera.com
- WebSocket URL: wss://api.askclera.com/ws/portfolio/{account_id}
- Health Check URLs:
  - API: https://api.askclera.com/api/health
  - WebSocket proxy: https://api.askclera.com/ws/health

### Redeployment Process

When making changes:

1. **Code Changes**:
   - Update the necessary files in the backend repository
   - Test locally with Redis and WebSocket server

2. **Deployment Order**:
   - Always deploy the WebSocket service first, then the API service
   - Wait for each deployment to complete before starting the next

3. **Verification**:
   - Check service status and logs after each deployment
   - Test the WebSocket health endpoint
   - Verify client connectivity

This deployment process has been tested and verified to work with both services running properly and communicating via Redis. The WebSocket proxy in the API service successfully forwards client connections to the WebSocket service.

## Data Collection Scripts

### Company Profiles Collection (`scripts/`)

The backend includes data collection scripts for populating the Supabase database with company profile information from external APIs.

#### Company Profiles Script (`collect_company_profiles_supabase.py`)

**Purpose**: Fetches company profile data from Financial Modeling Prep (FMP) API for all symbols in `tradable_assets.json` and stores them in the Supabase `company_profiles` table.

**Features**:
- Uses Supabase Python client for reliable database connectivity
- Respects FMP rate limit (270 requests per minute = 4.5 per second)
- Proper data validation to prevent database errors (especially date fields)
- Progress tracking with time estimates
- Resume capability for interrupted runs
- Batch processing for efficiency

**Database Schema**: The script stores data in the `company_profiles` table with fields for:
- Basic company info (symbol, name, sector, industry)
- Financial metrics (price, market cap, beta, etc.)
- Company details (description, CEO, website, logo URL)
- Metadata (IPO date, exchange, trading status)

**Usage**:
```bash
cd backend/scripts
python3 collect_company_profiles_supabase.py [--batch-size 50] [--start-from-symbol AAPL]
```

**Performance**: Processes ~240 symbols per minute (estimated 48 minutes for all 11,657 symbols)

**Data Quality**: Includes validation for:
- Date fields: Converts empty strings to NULL to prevent PostgreSQL errors
- Numeric fields: Handles empty/invalid values gracefully
- Text fields: Cleans and validates optional text data
- Boolean fields: Proper type conversion

**Integration**: The collected company profiles are used by the frontend for:
- Company logos in search results
- Stock picker displays  
- Relevant stocks in investment themes
- Cached company information for UI performance

**Note**: When users click on a security for detailed information, the system still fetches live data from FMP to ensure current pricing and metrics. The cached profiles are only used for display/logo purposes.

**Environment Requirements**:
- `FINANCIAL_MODELING_PREP_API_KEY`: FMP API access
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: Database access

## Troubleshooting and Debugging

### LangChain Tool Function Calling Issues

When you encounter `groq.APIError: Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.`, the root cause is almost always **Pydantic validation errors** in the function signature.

#### The Problem: Pydantic Type Enforcement

LangChain tools use Pydantic for parameter validation. When an LLM tries to call a function, Pydantic strictly validates each parameter against the expected type. Common issues:

1. **None values for string parameters**: If a function has `param: str = None`, Pydantic will reject `None` because it expects a string
2. **Type mismatches**: Passing integers where strings are expected, or vice versa
3. **Missing required parameters**: LLM fails to provide all required arguments

#### Debugging Process

**Step 1: Test the function directly**

```bash
cd backend
python -c "
from clera_agents.your_agent import your_function
result = your_function.invoke({
    'param1': 'value1',
    'param2': '',  # Use empty string instead of None
    'param3': True
})
print('SUCCESS: Function worked')
"
```

**Step 2: Check for common Pydantic issues**

Look for these patterns in your function signatures:

```python
# PROBLEMATIC - Pydantic rejects None for string parameters
@tool("my_tool")
def my_function(
    symbol: str,
    end_date: str = None,  # ❌ This will cause validation errors
    compare: bool = True
) -> str:
    pass

# SOLUTION - Use empty string as default
@tool("my_tool") 
def my_function(
    symbol: str,
    end_date: str = "",  # ✅ Pydantic accepts empty string
    compare: bool = True
) -> str:
    # Handle empty string in your logic
    if not end_date or end_date == "":
        end_date = datetime.now().strftime('%Y-%m-%d')
    pass
```

**Step 3: Update system prompts**

Ensure all examples in agent system prompts match the fixed signature:

```python
# In your agent system prompt
User: "How has Apple done YTD?"
→ calculate_investment_performance(symbol="AAPL", start_date="2025-01-01", end_date="", compare_to_sp500=True)
#                                                                            ^^^ Use empty string, not None
```

#### Common Pydantic Validation Patterns

1. **Optional String Parameters**:
   ```python
   # Instead of: param: str = None
   # Use: param: str = ""
   # Handle in function: if not param: param = default_value
   ```

2. **Optional Boolean Parameters**:
   ```python
   # These work fine as-is
   param: bool = True
   param: bool = False
   ```

3. **Optional Numeric Parameters**:
   ```python
   # Instead of: param: int = None
   # Use: param: int = 0 or param: int = -1
   # Handle in function: if param <= 0: param = default_value
   ```

#### Real Example: Financial Analyst Function Fix

**Problem**: `calculate_investment_performance` was failing with "Failed to call a function"

**Root Cause**: Function signature had `end_date: str = None`, but Pydantic rejected `None` values

**Solution**:
```python
# Before (broken)
def calculate_investment_performance(
    symbol: str,
    start_date: str,
    end_date: str = None,  # ❌ Pydantic validation error
    compare_to_sp500: bool = True
) -> str:
    if end_date is None:  # This logic was never reached
        end_date = datetime.now().strftime('%Y-%m-%d')

# After (working)  
def calculate_investment_performance(
    symbol: str,
    start_date: str,
    end_date: str = "",  # ✅ Pydantic accepts empty string
    compare_to_sp500: bool = True
) -> str:
    if not end_date or end_date == "":  # Fixed logic
        end_date = datetime.now().strftime('%Y-%m-%d')
```

#### Prevention Tips

1. **Always test functions directly** before deploying agent changes
2. **Use Pydantic-friendly defaults**: empty strings, 0, False, etc. instead of None
3. **Update system prompt examples** whenever you change function signatures
4. **Use consistent parameter naming** across all agent functions
5. **Test with the exact parameter format** the LLM will use

#### Advanced Debugging: Pydantic Error Details

If you need more detailed Pydantic error information:

```python
from pydantic import ValidationError
from your_module import your_function

try:
    result = your_function.invoke({
        'param1': 'value',
        'param2': None,  # This will fail
    })
except ValidationError as e:
    print("Pydantic validation errors:")
    for error in e.errors():
        print(f"  - Field: {error['loc']}")
        print(f"    Error: {error['msg']}")
        print(f"    Input: {error['input']}")
```

### General Debugging Principles

1. **Start from First Principles**: When an error occurs, test the individual components before testing the full system
2. **Validate Assumptions**: Don't assume the function works—test it directly with the exact parameters the LLM would use
3. **Check Type Systems**: Modern Python uses strict type validation—ensure your defaults match the expected types
4. **Read Error Messages Carefully**: "Failed to call a function" usually means parameter validation, not logic errors
5. **Test Incrementally**: Fix one parameter at a time and test after each fix

This debugging approach—testing functions directly, checking Pydantic validation, and updating system prompts—will resolve 95% of LangChain tool calling issues.

## Account Closure System (Latest Update - July 2025)

### Overview

The backend implements a production-ready account closure system that handles the complete lifecycle of brokerage account closure with 2025 Alpaca API compliance, comprehensive logging, automated email notifications, and real-time monitoring capabilities.

### Core Implementation Files

#### Primary Account Closure Logic
- **`utils/alpaca/account_closure.py`**: Complete account closure management
- **`utils/alpaca/account_closure_logger.py`**: Enhanced logging system
- **`utils/alpaca/automated_account_closure.py`**: Background automation
- **`monitor_account_closure.py`**: Real-time monitoring script

#### Email System
- **`utils/email/email_service.py`**: Professional email notifications
- **Email templates**: Branded initiation and completion emails

### Account Closure Flow

The system implements a secure, step-by-step closure process:

```python
class ClosureStep(Enum):
    INITIATED = "initiated"
    CANCELING_ORDERS = "canceling_orders"  # Combined with liquidation in 2025 API
    LIQUIDATING_POSITIONS = "liquidating_positions"
    WAITING_SETTLEMENT = "waiting_settlement"
    WITHDRAWING_FUNDS = "withdrawing_funds"
    CLOSING_ACCOUNT = "closing_account"
    COMPLETED = "completed"
    FAILED = "failed"
```

#### Step 1: Readiness Check (`check_account_closure_readiness`)
```python
def check_account_closure_readiness(account_id: str, sandbox: bool = False) -> dict:
    """Comprehensive account closure eligibility validation."""
    # Validates:
    # - Account status (must be ACTIVE)
    # - PDT restrictions (account must have >$25k equity or no day trading history)
    # - Open positions and orders
    # - ACH relationships for fund withdrawal
    return {'ready': bool, 'reason': str, 'details': dict}
```

#### Step 2: Initiate Closure (`initiate_account_closure`)
```python
def initiate_account_closure(account_id: str, ach_relationship_id: str, sandbox: bool = False) -> dict:
    """Start closure process with combined order cancellation and position liquidation."""
    # Uses 2025 Alpaca API: close_all_positions_for_account(cancel_orders=True)
    # - Cancels all open orders
    # - Liquidates all positions  
    # - Sends initiation email
    # - Updates Supabase status to 'pending_closure'
    return {'success': bool, 'step': str, 'message': str}
```

#### Step 3: Settlement Monitoring (`check_settlement_status`)
```python
def check_settlement_status(account_id: str, sandbox: bool = False) -> dict:
    """Monitor T+1 settlement for trade completion."""
    # Checks for:
    # - Zero open positions
    # - All orders in terminal states
    # - Settlement date compliance
    return {'settled': bool, 'details': dict}
```

#### Step 4: Fund Withdrawal (`withdraw_all_funds`)
```python
def withdraw_all_funds(account_id: str, ach_relationship_id: str, sandbox: bool = False) -> dict:
    """Withdraw all available cash via ACH transfer."""
    # Uses: create_ach_transfer_for_account with proper UUID validation
    # - Validates ACH relationship
    # - Creates outbound transfer
    # - Handles minimum balance requirements
    return {'success': bool, 'transfer_id': str, 'amount': float}
```

#### Step 5: Final Closure (`close_account`)
```python
def close_account(account_id: str, sandbox: bool = False) -> dict:
    """Permanently close the brokerage account."""
    # Final validations:
    # - Cash balance ≤ $1.00
    # - No open positions or orders
    # - All transfers completed
    # - Updates Supabase status to 'closed'
    # - Sends completion email
    return {'success': bool, 'message': str}
```

### 2025 Alpaca API Compliance

The system uses current, non-deprecated Alpaca API methods:

#### Current API Usage
```python
# ✅ CURRENT: Combined order cancellation and liquidation
broker_client.close_all_positions_for_account(
    account_id=account_id,
    cancel_orders=True
)

# ✅ CURRENT: Account closure
broker_client.close_account(account_id)

# ✅ CURRENT: ACH transfers with proper request objects
broker_client.create_ach_transfer_for_account(
    account_id,
    CreateACHTransferRequest(
        relationship_id=relationship_id,
        transfer_type=TransferType.ACH,
        direction=TransferDirection.OUTGOING,
        amount=amount
    )
)
```

### Enhanced Logging System (`AccountClosureLogger`)

#### Features
- **Individual Log Files**: One file per closure with timestamps
- **Real-Time Console Output**: Color-coded messages  
- **Comprehensive Data Logging**: Every API call and safety check
- **Email Tracking**: Complete email notification audit trail

#### Log File Structure
```
logs/account_closures/closure_{account_id}_{timestamp}.log
```

#### Logging Methods
```python
logger = AccountClosureLogger(account_id)

# Step tracking
logger.log_step_start("ACCOUNT_CLOSURE_INITIATION", {"account_id": account_id})
logger.log_step_completion("PRECONDITION_CHECKS", result)

# API data logging
logger.log_alpaca_data("ACCOUNT_DATA", account_data)
logger.log_alpaca_data("POSITIONS_DATA", positions)

# Safety validations
logger.log_safety_check("ACCOUNT_READINESS", "✅ PASSED", details)
logger.log_safety_check("LIQUIDATION_SUCCESS", "❌ FAILED", error_details)

# Email tracking
logger.log_email_attempt("INITIATION_EMAIL", recipient, success, details)

# Performance monitoring
logger.log_timing("LIQUIDATION_OPERATION", duration_seconds)
```

### Professional Email System

#### Branded Email Templates
- **Company Name**: "Clera" (updated from "Clera Investment Services")
- **Logo**: Transparent Clera logo (`https://askclera.com/clera-logo.png`)
- **Support Contact**: `support@askclera.com`
- **Phone References**: Removed (email-only support)

#### Email Types

**Initiation Email** (`send_account_closure_initiation_email`):
```python
def send_account_closure_initiation_email(account_data: dict, confirmation_code: str) -> bool:
    """Send professional closure initiation notification."""
    # Triggered after successful /initiate call
    # Includes closure timeline and confirmation code
    # Professional HTML + plain text versions
```

**Completion Email** (`send_account_closure_completion_email`):
```python  
def send_account_closure_completion_email(account_data: dict, confirmation_code: str) -> bool:
    """Send closure completion confirmation."""
    # Triggered after successful /close-account call
    # Confirms account fully closed
    # Includes final confirmation code
```

#### Email Logging Integration
```python
# Email tracking in closure process
try:
    email_success = send_account_closure_initiation_email(account_data, confirmation_code)
    logger.log_email_attempt("INITIATION_EMAIL", recipient, email_success, {
        "user": f"{first_name} {last_name}",
        "confirmation": confirmation_code
    })
except Exception as e:
    logger.log_email_attempt("INITIATION_EMAIL", recipient, False, {"error": str(e)})
```

### Automated Background Processing

#### `automated_account_closure.py`
- **Complete Automation**: Handles entire process after user confirmation
- **T+1 Settlement Monitoring**: Automatic checks for trade settlement
- **Fund Withdrawal**: Automated ACH transfer initiation
- **Status Tracking**: Real-time Supabase status updates
- **Error Handling**: Comprehensive error recovery and logging

#### Background Process Flow
```python
def automated_closure_process(account_id: str, ach_relationship_id: str):
    """Complete automated closure after user initiation."""
    # 1. Wait for T+1 settlement
    # 2. Automatically withdraw funds when settled  
    # 3. Monitor withdrawal completion
    # 4. Close account when funds transferred
    # 5. Update Supabase status throughout
    # 6. Send completion email
```

### Real-Time Monitoring (`monitor_account_closure.py`)

#### Monitor Features
```bash
# Monitor specific account
python monitor_account_closure.py --account ACCOUNT123

# Monitor all active closures  
python monitor_account_closure.py --all

# Follow logs in real-time
python monitor_account_closure.py --account ACCOUNT123 --follow
```

#### Color-Coded Output
- 🔍 **Blue**: General information
- ✅ **Green**: Success operations  
- ⚠️ **Yellow**: Warnings and retries
- ❌ **Red**: Errors and failures
- 📧 **Cyan**: Email notifications
- ⏱️ **Magenta**: Timing information

### API Endpoints

#### Account Closure REST API
```python
# FastAPI endpoints in api_server.py

@app.get("/account-closure/check-readiness/{account_id}")
async def check_readiness_endpoint(account_id: str) -> dict:
    """Check if account is ready for closure."""

@app.post("/account-closure/initiate/{account_id}")  
async def initiate_closure_endpoint(account_id: str, request: InitiateClosureRequest) -> dict:
    """Start the account closure process."""

@app.get("/account-closure/settlement-status/{account_id}")
async def settlement_status_endpoint(account_id: str) -> dict:
    """Check T+1 settlement status."""

@app.post("/account-closure/withdraw-funds/{account_id}")
async def withdraw_funds_endpoint(account_id: str, request: WithdrawFundsRequest) -> dict:
    """Withdraw all available funds."""

@app.post("/account-closure/close-account/{account_id}")
async def close_account_endpoint(account_id: str, request: CloseAccountRequest) -> dict:
    """Permanently close the account."""
```

### Database Integration

#### Supabase Status Tracking
```sql
-- Enhanced onboarding status enum
CREATE TYPE onboarding_status AS ENUM (
    'not_started',
    'in_progress', 
    'submitted',
    'approved',
    'pending_closure',  -- NEW: Closure in progress
    'closed'           -- NEW: Account permanently closed
);

-- Account closure tracking fields
ALTER TABLE user_onboarding ADD COLUMN closure_initiated_at TIMESTAMPTZ;
ALTER TABLE user_onboarding ADD COLUMN closure_completed_at TIMESTAMPTZ;
ALTER TABLE user_onboarding ADD COLUMN closure_confirmation_code TEXT;
```

#### Status Update Functions
```python
def update_closure_status(user_id: str, status: str, details: dict = None):
    """Update user closure status in Supabase."""
    # Updates:
    # - onboarding status
    # - closure timestamps  
    # - confirmation codes
    # - closure details (JSON)
```

### Security and Safety Features

#### Multi-Layer Validation
1. **Account Status Checks**: Only ACTIVE accounts
2. **Financial Validations**: PDT restrictions, minimum balances
3. **Settlement Verification**: T+1 compliance
4. **Final Safety Checks**: Zero positions before closure

#### Production Safety Measures
```python
# Critical safety validations before final closure
if float(account.cash) > 1.00:
    raise ValueError(f"Cannot close account with cash balance > $1.00: ${account.cash}")

if positions and len(positions) > 0:
    raise ValueError(f"Cannot close account with {len(positions)} open positions")

if orders and len([o for o in orders if o.status not in ['filled', 'canceled', 'expired']]) > 0:
    raise ValueError("Cannot close account with pending orders")
```

## Account Closure Process

### Overview
The account closure process is a 5-step automated workflow that safely closes user accounts:

1. **Cancel all orders** - Cancels any pending trades
2. **Liquidate all positions** - Sells all holdings
3. **Wait for settlement** - T+1 settlement period
4. **Withdraw all funds** - ACH transfer to user's bank
5. **Close account** - Permanently close the account

### Process Flow
```
User initiates closure → Cancel orders → Liquidate positions → 
Wait T+1 settlement → Withdraw funds → Close account → Send completion email
```

### API Endpoints

#### Check Progress
```bash
# Get current closure status
curl -X GET "http://localhost:8000/api/account-closure/progress/{account_id}" \
  -H "x-api-key: <YOUR_API_KEY>"
```

#### Resume Process
```bash
# Resume/retry closure process
curl -X POST "http://localhost:8000/api/account-closure/resume/{account_id}" \
  -H "Content-Type: application/json" \
  -H "x-api-key: <YOUR_API_KEY>" \
  -d '{}'
```

#### Check Settlement Status
```bash
# Check if funds have settled (T+1)
curl -X GET "http://localhost:8000/api/account-closure/settlement-status/{account_id}" \
  -H "x-api-key: <YOUR_API_KEY>"
```

#### Check Withdrawal Status
```bash
# Check withdrawal transfer status
curl -X GET "http://localhost:8000/api/account-closure/withdrawal-status/{account_id}/{transfer_id}" \
  -H "x-api-key: <YOUR_API_KEY>"
```

### Monitoring Account Closure

#### Real-Time Log Monitoring
```bash
# Monitor specific account closure
cd backend
# Monitor a specific user's closure
python monitor_account_closure.py --user <user_id>

# Get user's recent logs
python monitor_account_closure.py --user <user_id> --recent

# Check user's closure status
python monitor_account_closure.py --user <user_id> --summary

# Example
python monitor_account_closure.py 72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8 --recent --lines 10


# Test API endpoints
curl -X GET "http://localhost:8000/account-closure/status/72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" \
  -H "X-API-Key: ${BACKEND_API_KEY}"
```

#### Log File Location
```
backend/logs/account_closures/closure_{account_id}_{timestamp}.log
```

#### Log Contents
Each log file contains:
- **Step-by-step progress** with timestamps
- **API responses** from Alpaca
- **Account data** (cash, positions, orders)
- **Safety validations** and error details
- **Email notifications** sent
- **Performance metrics** (operation timing)

#### Example Log Output
```
[2025-07-09 10:33:07] 🔄 RESUME_CLOSURE_PROCESS STARTED
[2025-07-09 10:33:07] 📊 Account Status: ACTIVE
[2025-07-09 10:33:07] 💰 Cash Balance: $98,013.88
[2025-07-09 10:33:07] 📈 Open Positions: 0
[2025-07-09 10:33:07] 📋 Current Step: withdrawing_funds
[2025-07-09 10:33:07] ✅ WITHDRAW_ALL_FUNDS STARTED
[2025-07-09 10:33:08] 📧 Email sent: withdrawal_initiated@example.com
```

### Production Monitoring

#### Key Metrics to Watch
- **Step completion times** - Should be < 30 seconds per step
- **API error rates** - Should be < 1%
- **Settlement delays** - Monitor T+1 compliance
- **Withdrawal success rate** - Should be > 99%
- **Email delivery rate** - Should be > 95%

#### Common Issues & Solutions
- **Settlement delays**: Normal T+1 wait, no action needed
- **API rate limits**: Automatic retry with exponential backoff
- **ACH transfer failures**: Manual intervention may be required
- **Email delivery failures**: Logged but don't block process

#### Emergency Contacts
- **Support**: support@askclera.com
- **Logs**: `backend/logs/account_closures/`
- **Monitor Script**: `backend/monitor_account_closure.py`

