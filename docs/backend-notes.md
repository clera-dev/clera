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

For AWS deployment, two services are needed:

1. **API Server** (Port 8000)
   - Handles HTTP API requests
   - Proxies WebSocket connections to WebSocket Server
   - Requires WebSocket protocol support in load balancer settings

2. **WebSocket Server** (Port 8001)
   - Dedicated service for WebSocket connections
   - Only accessible internally from API Server (not directly exposed)
   - Uses Redis for inter-service communication

**Required AWS Copilot Configuration**:

1. Update the API Server manifest (`backend/copilot/api-service/manifest.yml`):
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

2. Create a WebSocket Server manifest (`backend/copilot/websocket-service/manifest.yml`):
   ```yaml
   # WebSocket server service definition
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
   
   # Important: Ensure sufficient connection time
   variables:
     HEARTBEAT_INTERVAL: 30  # Seconds
     CONNECTION_TIMEOUT: 300  # Seconds
     REDIS_HOST: '${REDIS_ENDPOINT}'
     REDIS_PORT: 6379
     WEBSOCKET_PORT: 8001
     WEBSOCKET_HOST: '0.0.0.0'
   
   # Service discovery configuration
   network:
     vpc:
       placement: 'private'
   ```

3. Update load balancer settings in environment manifest to support WebSockets:
   ```yaml
   # In copilot/environments/[env-name]/manifest.yml
   http:
     public:
       ingress:
         timeout: 300  # Set timeout to match WebSocket timeout
       protocol: 'HTTPS'  # Required for WSS (secure WebSockets)
   ```

For detailed testing and deployment steps, see:
- `docs/portfolio_realtime_setup.md`
- `docs/portfolio-page-notes.md`

### Agent Architecture (clera_agents/)

The system uses LangGraph to orchestrate multiple specialized agents:

1. **Financial Analyst Agent** (`financial_analyst_agent.py`)
   - Analyzes company fundamentals and financial data
   - Provides investment insights and recommendations

2. **Portfolio Management Agent** (`portfolio_management_agent.py`)
   - Manages investment portfolios
   - Suggests portfolio adjustments and rebalancing

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
