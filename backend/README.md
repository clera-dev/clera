# Clera Backend

This repository contains the backend services for Clera, including LangGraph agents for financial analysis and portfolio management.

## Development Setup

### Prerequisites
- Docker and Docker Compose
- Python 3.12+

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd backend
```

2. Create a `.env` file with the required API keys (see `.env.example` if provided)

3. Build and start the containers:
```bash
docker-compose up --build
```

4. The LangGraph API will be available at http://localhost:64000

### Development with VS Code Dev Containers

This project supports development using VS Code Dev Containers:

1. Install the "Remote - Containers" extension in VS Code
2. Open the project folder in VS Code
3. Click on the green icon in the bottom-left corner and select "Reopen in Container"
4. VS Code will build and start the dev container

## Production Deployment

For production deployment on AWS:

1. Build the Docker image:
```bash
docker build -t clera-backend:latest .
```

2. Push the image to your container registry (ECR, etc.)

3. Deploy using ECS, EKS, or any other container orchestration service

4. Ensure all environment variables from `.env` are properly configured in your deployment

## Architecture

The application uses LangGraph for building and running agent workflows:

- `clera_agents/graph.py`: Main agent workflow definition
- `clera_agents/financial_analyst_agent.py`: Financial analysis agent
- `clera_agents/portfolio_management_agent.py`: Portfolio management agent
- `clera_agents/trade_execution_agent.py`: Trade execution agent

## License

[License information]

## Clera Chatbots
In this folder, we've build a bespoke RAGbot that extracts information from CFA and CFP material and feeds it to perplexity to answer queries to Clera.

## Clera Agents
The `clera_agents` directory contains the implementation of various financial agents used in the Clera platform.

### Testing
The `clera_agents/tests` directory contains test files for the Clera agents functionality. For more details, see the [tests README](clera_agents/tests/README.md).

To run the standalone portfolio test:
```bash
python clera_agents/tests/standalone_portfolio_test.py
```

## conversational_ai
This is the folder where we will build the conversational AI tools used in the platform.

We will use LiveKit (with Deepgram and Cartesia plugins) for live interactions wtih Clera. (Certesia will use Brooke's voice)

We will use Cartesia to save .mov files for the onboarding process.

## clera_audio_call and clera_onboarding_call
These were tests to see how Retell AI could work, but it's not suited for our usecase becuase it's best for call center stuff. However, I want to keep the files for not to be able to reference the websocket layout.

## Personal Note: 
* Here are the steps to deactivate and reactivate my virtual environment.

To deactivate:

```bash
deactivate
```

To reactivate:

```bash
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows (cmd)
```
