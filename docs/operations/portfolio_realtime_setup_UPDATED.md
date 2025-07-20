# Portfolio Real-Time Setup Guide (Updated)

Follow these steps to set up and run the real-time portfolio value tracking system.

## Prerequisites

1. Redis installed and running
2. Python 3.8+ with venv
3. Node.js 18+ for the frontend

## Step 1: Start Redis

Redis is required for inter-service communication and caching:

```bash
# macOS (with Homebrew)
brew services start redis

# Linux
sudo systemctl start redis-server

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

## Step 2: Start the WebSocket Server

The WebSocket server runs on port 8001 and handles real-time data streaming:

```bash
# From the project root
cd backend
source venv/bin/activate  # Activate your virtual environment

# Run the combined services (includes WebSocket server)
python -m portfolio_realtime.run_services
```

This will start:
- Symbol Collector (gathers tradable symbols from Alpaca)
- Market Data Consumer (subscribes to real-time market data)
- Portfolio Calculator (calculates portfolio values in real-time)
- WebSocket Server (streams updates to clients)

## Step 3: Start the API Server

The API server runs on port 8000 and proxies WebSocket connections:

```bash
# In a new terminal, from the project root
cd backend
source venv/bin/activate  # Activate your virtual environment

# Run the API server
python api_server.py
```

## Step 4: Start the Frontend

The frontend proxies WebSocket connections through the API server:

```bash
# In a new terminal, from the project root
cd frontend-app
npm run dev
```

This will start the Next.js development server on port 3000.

## Step 5: Verify Everything Works

Run the WebSocket test script to verify all connections are working:

```bash
# From the project root
cd backend
source venv/bin/activate
python test_websocket_connection.py
```

You should see both direct and proxied connection tests passing.

## Connection Flow

The real-time connection flow works as follows:

1. Frontend connects to `/ws/portfolio/:accountId` (on port 3000)
2. Next.js proxies the connection to the API server on port 8000
3. API server acts as a proxy to the WebSocket server on port 8001
4. WebSocket server maintains real-time connections to clients and pushes updates

## Troubleshooting

If you encounter issues with the WebSocket connections:

1. **Check Redis**: Make sure Redis is running on the default port (6379)
2. **Check Services**: Ensure both the WebSocket services and API server are running
3. **Check Logs**: Look for connection errors in the console logs of each service
4. **Health Checks**: Verify health endpoints are accessible:
   - API server: http://localhost:8000/ws/health
   - WebSocket server: http://localhost:8001/health

## Environment Variables

The following environment variables can be used to configure the services:

```
# WebSocket Configuration
WEBSOCKET_PORT=8001           # Port for WebSocket server (should stay at 8001)
WEBSOCKET_HOST=0.0.0.0        # Host for WebSocket server

# Redis Configuration
REDIS_HOST=localhost          # Redis host
REDIS_PORT=6379               # Redis port
REDIS_DB=0                    # Redis database number

# API Server Configuration
BIND_PORT=8000                # API server port

# For frontend (.env.local)
BACKEND_API_URL=http://localhost:8000  # URL for backend API
``` 