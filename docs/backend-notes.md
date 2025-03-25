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

The API server imports the agent graph from `clera_agents.graph` and orchestrates the workflow between different specialized agents.

### WebSocket Server (server.py)

Provides real-time communication capabilities using WebSockets. Features:

- Financial RAG (Retrieval Augmented Generation) agent
- Connection to vector databases (Pinecone)
- Integration with Retell for voice capabilities
- Real-time LLM response streaming

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
- Financial Modeling Prep for financial data
- LiveKit, Deepgram, and Cartesia for voice features
- Retell for additional voice capabilities

## Configuration

The system uses environment variables (in `.env` file) for configuration:

- API keys for various services (Groq, OpenAI, Pinecone, etc.)
- Broker credentials (Alpaca API key and secret)
- Voice service configuration (LiveKit, Cartesia, Deepgram)
- Database connection settings (Supabase)

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

## Deployment

The backend supports:

- Local development with Docker and Docker Compose
- VS Code Dev Containers for easy setup
- Production deployment on AWS (ECS, EKS)

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
