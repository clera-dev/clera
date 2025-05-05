# Portfolio Real-Time System Troubleshooting Guide

This guide will help you diagnose and fix common issues with the Portfolio Real-Time System, which provides live updates of portfolio values and today's returns.

## Quick Fix Checklist

If your Portfolio Page isn't showing real-time updates, follow these steps in order:

1. **Start Redis**:
   ```bash
   brew services start redis  # macOS
   # OR
   sudo systemctl start redis-server  # Linux
   ```

2. **Run the start script (recommended)**:
   ```bash
   cd backend
   source venv/bin/activate
   ./start_services.sh  # This starts all required services
   ```

   OR **Start services manually**:

   **Start WebSocket Server** (in one terminal):
   ```bash
   cd backend
   source venv/bin/activate
   python -m portfolio_realtime.websocket_server
   ```

   **Start API Server** (in a separate terminal):
   ```bash
   cd backend
   source venv/bin/activate
   python api_server.py
   ```

3. **Start Frontend** (in a separate terminal):
   ```bash
   cd frontend-app
   npm run dev
   ```

## Important Note

The WebSocket server should be started directly with `python -m portfolio_realtime.websocket_server` and not through the combined service runner (`run_services.py`). This ensures the WebSocket server binds properly to the correct port and address.

## Connection Flow

The real-time connection flow works as follows:

1. Frontend connects to `/ws/portfolio/:accountId` (on port 3000)
2. Next.js proxies the connection to the API server on port 8000
3. API server acts as a proxy to the WebSocket server on port 8001
4. WebSocket server maintains real-time connections to clients and pushes updates

## Testing Connections

You can use the diagnostic script to test all connections:

```bash
cd backend
source venv/bin/activate
python test_websocket_connection.py
```

## Common Issues and Solutions

### 1. "WebSocket server is unavailable" Error

If you see this error in the browser console:
```
WebSocket connection closed, code: 1013, reason: WebSocket server is unavailable
```

**Solution**:
- Make sure the WebSocket server is running separately: `python -m portfolio_realtime.websocket_server`
- Check that it's running on port 8001
- Restart the API server if needed

### 2. API Errors (500) for Asset Details

If you see errors like:
```
Error: API Error (500): Internal Server Error when fetching /api/assets/XYZ
```

**Solution**:
This has been fixed by removing API key requirements from asset endpoints. If you still see this error:
- Make sure you're running the latest backend code
- Restart both the API server and frontend

### 3. Fallback to REST API

The system will automatically fall back to using REST API calls if the WebSocket connection fails. If you see a working portfolio value but it doesn't update in real-time, this indicates the WebSocket connection failed but the fallback is working.

### 4. Missing Activities Data

The activities endpoint is not yet implemented. The frontend will automatically handle this by displaying only order data. This is expected behavior.

## Environment Variables

The following environment variables can be used to configure the services:

```
# WebSocket Configuration
WEBSOCKET_PORT=8001           # Port for WebSocket server (should stay at 8001)
WEBSOCKET_HOST=localhost      # Host for WebSocket server (use localhost, not 0.0.0.0)

# Redis Configuration
REDIS_HOST=localhost          # Redis host
REDIS_PORT=6379               # Redis port
REDIS_DB=0                    # Redis database number

# API Server Configuration
BIND_PORT=8000                # API server port

# For frontend (.env.local)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000  # URL for backend API
```

## Understanding Real-Time System Architecture

The portfolio real-time system consists of multiple components:

1. **Redis**: Central message broker and data store
2. **Symbol Collector**: Collects portfolio positions from Alpaca
3. **Market Data Consumer**: Gets real-time price updates
4. **Portfolio Calculator**: Computes portfolio values
5. **WebSocket Server**: Delivers updates to clients
6. **API Server WebSocket Proxy**: Routes client connections
7. **Frontend Component**: Displays real-time data

## Advanced Diagnostics

For deeper investigation, follow these steps:

1. **Check WebSocket Server Logs**:
   ```bash
   # Look for errors in the log output of portfolio_realtime.run_services
   ```

2. **Verify Redis Messages**:
   ```bash
   redis-cli
   > SUBSCRIBE portfolio_updates
   ```
   You should see messages when price updates occur

3. **Test Direct WebSocket Connection**:
   ```bash
   # Install wscat if not already available
   npm install -g wscat
   
   # Connect directly to WebSocket server
   wscat -c ws://localhost:8001/ws/portfolio/your-account-id
   ```

4. **Inspect Network Traffic**:
   - Open browser developer tools
   - Look at Network tab, filter by WS
   - Inspect WebSocket frames

## Best Practices

- **Run Services in This Order**:
  1. Redis
  2. Portfolio Real-Time Services
  3. API Server
  4. Frontend

- **Keep All Three Terminal Windows Open**:
  1. Window 1: Portfolio Real-Time Services
  2. Window 2: API Server
  3. Window 3: Frontend

- **Use Direct Connection Mode** if the proxy isn't working:
  - Edit LivePortfolioValue.tsx to set `directConnectionMode = true` initially

- **Development vs. Production**:
  - Development environment uses WebSocket over HTTP
  - Production uses secure WebSockets (WSS over HTTPS)
  - Make sure your AWS deployment has proper security groups and load balancer settings 