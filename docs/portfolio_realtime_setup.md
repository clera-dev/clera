# Portfolio Real-Time System Production Setup Guide

This guide provides instructions for setting up the real-time portfolio value tracking system in a production environment.

## Local Development and Testing

Before deploying to production, you should test the system locally. Follow these steps to set up and run the real-time portfolio value tracking system on your local machine.

### Prerequisites for Local Testing

- Python 3.9+
- Redis server installed locally
- Alpaca API keys (sandbox environment)
- Node.js for frontend testing

### Step 1: Install and Start Redis Locally

```bash
# Install Redis (macOS)
brew install redis

# Install Redis (Ubuntu/Debian)
sudo apt-get install redis-server

# Start Redis service
brew services start redis  # macOS
sudo systemctl start redis-server  # Ubuntu/Debian

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

### Step 2: Set Up Environment Variables

Create a `.env` file in your backend directory with the following configuration:

```
# Alpaca API credentials (use your sandbox keys)
BROKER_API_KEY=your_sandbox_broker_key
BROKER_SECRET_KEY=your_sandbox_broker_secret
APCA_API_KEY_ID=your_sandbox_market_key
APCA_API_SECRET_KEY=your_sandbox_market_secret
ALPACA_SANDBOX=true

# Redis configuration (local)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Service configuration
SYMBOL_COLLECTION_INTERVAL=60  # Shorter interval for testing
PRICE_TTL=3600
MIN_UPDATE_INTERVAL=1
RECALCULATION_INTERVAL=15
WEBSOCKET_PORT=8001
WEBSOCKET_HOST=0.0.0.0
```

### Step 3: Install Required Python Packages

```bash
# Make sure to install all required packages
pip install redis alpaca-py fastapi uvicorn websockets python-dotenv pytest pytest-asyncio
```

### Step 4: Run All Services

You can either run all services in separate terminals for easier debugging, or run them all in a single terminal.

#### Option 1: Run All Services in Separate Terminals

**Terminal 1: WebSocket Server**
```bash
cd backend
source venv/bin/activate  # Use direct venv activation
python -m portfolio_realtime.websocket_server
```

**Terminal 2: Symbol Collector**
```bash
cd backend
source venv/bin/activate  # Use direct venv activation
python -m portfolio_realtime.symbol_collector
```

**Terminal 3: Market Data Consumer**
```bash
cd backend
source venv/bin/activate  # Use direct venv activation
python -m portfolio_realtime.market_data_consumer
```

**Terminal 4: Portfolio Calculator**
```bash
cd backend
source venv/bin/activate  # Use direct venv activation
python -m portfolio_realtime.portfolio_calculator
```

#### Option 2: Run All Services in One Terminal

```bash
cd backend
source venv/bin/activate  # Use direct venv activation
python -m portfolio_realtime.run_services
```

### Step 5: Configure Frontend

Add this to your frontend `.env.local` file:
```
# For standalone WebSocket server (port 8001)
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8001

# For combined services mode (port 8000)
# NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8000
```

**Important Note About WebSocket Ports**: 
- When running the standalone WebSocket server (`python -m portfolio_realtime.websocket_server`), it listens on port 8001 by default.
- When running the combined services (`python -m portfolio_realtime.run_services`), the WebSocket server is available on port 8000.
- The frontend component has been updated to automatically try both ports.

### Step 6: Run Frontend as Usual

```bash
cd frontend-app
npm run dev
```

### Step 7: Testing the System

#### Test WebSocket Server Directly

You can test the WebSocket server directly using the test script:

```bash
cd backend
source venv/bin/activate
python -m pytest tests/test_websocket_server.py -v
```

#### Monitor WebSocket Connection in Browser

1. Navigate to your portfolio page with a valid Alpaca account ID
2. Open browser developer tools (F12 or Right-click → Inspect)
3. Check the "Network" tab and filter for "WS" to see WebSocket connections
4. You should see:
   - A successful WebSocket connection to `ws://localhost:8001/ws/portfolio/{your-account-id}`
   - Real-time updates in the LivePortfolioValue component

### Comprehensive Testing with Code Coverage

We've created a test runner script that automates testing with coverage reporting:

```bash
cd backend
source venv/bin/activate
./run_tests.py
```

This script:
1. Checks if Redis is running (and starts it if possible)
2. Checks if WebSocket server is running (on either port 8001 or 8000)
3. Runs the complete test suite with coverage
4. Generates an HTML coverage report

#### Important Testing Nuances

1. **WebSocket Port Detection**:
   - The system uses two different ports depending on how you run it:
     - Port 8001: When running `python -m portfolio_realtime.websocket_server`
     - Port 8000: When running combined services via `python -m portfolio_realtime.run_services`
   - Tests have been updated to check both ports

2. **Known Issue: Hanging Test**:
   - The `test_event_loop_in_market_data_consumer` test may hang indefinitely
   - Workaround: Run with timeout parameter: `pytest --timeout=10`
   - Alternative: Skip this test: `pytest -k "not test_event_loop_in_market_data_consumer"`

3. **Running Full Test Suite**: 
   - Always ensure both Redis and WebSocket server (or combined services) are running
   - See `backend/tests/testing_guide.md` for complete details on testing

### Troubleshooting Local Setup

- **Redis connection errors**: Ensure Redis is running with `redis-cli ping` (should return "PONG")
- **No data showing up**: Check that you have positions in your Alpaca sandbox account
- **WebSocket connection failing**: Verify the port isn't blocked by a firewall
- **No price updates**: Market data is only available during market hours, use paper trading for testing
- **ModuleNotFoundError: No module named 'redis'**: If you see this error despite installing Redis, use direct virtual environment activation:
  ```bash
  # Instead of using activate.sh, directly activate the environment:
  source venv/bin/activate
  # Then run the services
  python -m portfolio_realtime.run_services
  ```

### Recent Fixes to Common Issues

1. **Event Loop Error in Market Data Consumer**: 
   - Fixed issue with Alpaca SDK attempting to use `asyncio.run()` inside another event loop
   - Solution: Implemented direct WebSocket handling instead of using `stock_stream.run()`

2. **WebSocket Connection Error in Frontend**:
   - Fixed handling of WebSocket error events (error objects aren't JSON serializable)
   - Added validation for account ID before attempting connection
   - Improved logging of connection state and errors
   - Added exponential backoff for reconnection attempts

3. **UUID Serialization Issue**:
   - Fixed error when serializing asset_id UUID objects to JSON
   - Solution: Convert UUID to string before JSON serialization

4. **WebSocket Port Detection in Tests**:
   - Fixed tests to detect WebSocket server on both ports 8001 and 8000
   - Update the test runner to check multiple ports

5. **Hanging Test Issue**:
   - Identified issue with asyncio task cancellation in `test_event_loop_in_market_data_consumer`
   - Added timeout handling to prevent indefinite hanging

## Production Setup

Once you've confirmed everything works locally, you can proceed with the production deployment.

## Prerequisites

- AWS account with permissions to create EC2 instances, ECS clusters, and other resources
- Redis cluster (AWS ElastiCache for Redis recommended)
- Docker installed for containerization
- Domain name for secure WebSocket connections (optional but recommended)

## Step 1: Set up Redis Cluster

1. **Create ElastiCache for Redis cluster**:
   - Sign in to AWS Management Console
   - Navigate to ElastiCache
   - Create a new Redis cluster with the following settings:
     - Cluster mode: disabled (for simplicity)
     - Node type: cache.t3.small (minimum for production)
     - Number of replicas: 2 (for high availability)
     - Multi-AZ: enabled
     - Encryption at-rest: enabled
     - Encryption in-transit: enabled
   - Note the primary endpoint URL for later use

2. **Configure security groups**:
   - Create a dedicated security group for Redis
   - Allow inbound traffic to Redis port (6379) only from your application server security group
   - Restrict all other access

## Step 2: Prepare Environment Variables

Create a production `.env` file with the following variables:

```
# Alpaca API credentials
BROKER_API_KEY=your_production_broker_api_key
BROKER_SECRET_KEY=your_production_broker_secret_key
MARKET_API_KEY=your_production_market_data_api_key
MARKET_SECRET_KEY=your_production_market_data_secret_key
ALPACA_SANDBOX=false

# Redis configuration
REDIS_HOST=your-redis-endpoint.cache.amazonaws.com
REDIS_PORT=6379
REDIS_DB=0
REDIS_USER=your_redis_user
REDIS_PASSWORD=your_redis_password
REDIS_SSL=true

# Service configuration
SYMBOL_COLLECTION_INTERVAL=300
PRICE_TTL=3600
MIN_UPDATE_INTERVAL=2
RECALCULATION_INTERVAL=30
WEBSOCKET_PORT=8001
WEBSOCKET_HOST=0.0.0.0

# Authentication (implement as needed)
API_KEY_SECRET=your_api_key_secret
JWT_SECRET=your_jwt_secret
```

Store these securely in AWS Systems Manager Parameter Store or AWS Secrets Manager.

## Step 3: Create Docker Containers

1. **Create a Dockerfile** for the services:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY portfolio_realtime/ ./portfolio_realtime/
COPY backend/ ./backend/
COPY entrypoint.sh .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Set environment variable for Python path
ENV PYTHONPATH="${PYTHONPATH}:/app"

# Default command
ENTRYPOINT ["./entrypoint.sh"]
```

2. **Create an entrypoint.sh script**:

```bash
#!/bin/bash
set -e

# Get service to run from environment variable or use default
SERVICE=${SERVICE:-"all"}

case $SERVICE in
  "symbol_collector")
    echo "Starting Symbol Collector service..."
    python -m portfolio_realtime.symbol_collector
    ;;
  "market_data_consumer")
    echo "Starting Market Data Consumer service..."
    python -m portfolio_realtime.market_data_consumer
    ;;
  "portfolio_calculator")
    echo "Starting Portfolio Calculator service..."
    python -m portfolio_realtime.portfolio_calculator
    ;;
  "websocket_server")
    echo "Starting WebSocket Server..."
    python -m portfolio_realtime.websocket_server
    ;;
  "all")
    echo "Starting all services..."
    python -m portfolio_realtime.run_services
    ;;
  *)
    echo "Unknown service: $SERVICE"
    exit 1
    ;;
esac
```

3. **Build and push Docker images**:

```bash
# Build the Docker image
docker build -t clera/portfolio-realtime:latest .

# Tag the image for your ECR repository
docker tag clera/portfolio-realtime:latest your-aws-account-id.dkr.ecr.your-region.amazonaws.com/clera/portfolio-realtime:latest

# Push to ECR
aws ecr get-login-password --region your-region | docker login --username AWS --password-stdin your-aws-account-id.dkr.ecr.your-region.amazonaws.com
docker push your-aws-account-id.dkr.ecr.your-region.amazonaws.com/clera/portfolio-realtime:latest
```

## Step 4: Deploy Services to ECS

1. **Create ECS task definitions** for each service:
   - Symbol Collector
   - Market Data Consumer
   - Portfolio Calculator
   - WebSocket Server

2. **Sample task definition** (for Symbol Collector):

```json
{
  "family": "clera-symbol-collector",
  "executionRoleArn": "arn:aws:iam::your-account-id:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::your-account-id:role/cleraPortfolioRealtimeRole",
  "networkMode": "awsvpc",
  "containerDefinitions": [
    {
      "name": "symbol-collector",
      "image": "your-aws-account-id.dkr.ecr.your-region.amazonaws.com/clera/portfolio-realtime:latest",
      "essential": true,
      "environment": [
        { "name": "SERVICE", "value": "symbol_collector" }
      ],
      "secrets": [
        { "name": "BROKER_API_KEY", "valueFrom": "arn:aws:ssm:your-region:your-account-id:parameter/clera/BROKER_API_KEY" },
        { "name": "BROKER_SECRET_KEY", "valueFrom": "arn:aws:ssm:your-region:your-account-id:parameter/clera/BROKER_SECRET_KEY" },
        { "name": "REDIS_HOST", "valueFrom": "arn:aws:ssm:your-region:your-account-id:parameter/clera/REDIS_HOST" }
        // Add other environment variables from Parameter Store
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/clera-portfolio-realtime",
          "awslogs-region": "your-region",
          "awslogs-stream-prefix": "symbol-collector"
        }
      },
      "cpu": 256,
      "memory": 512
    }
  ],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512"
}
```

3. **Create ECS services** for each task definition:
   - Run 1 instance of Symbol Collector
   - Run 1 instance of Market Data Consumer
   - Run 1-2 instances of Portfolio Calculator (based on load)
   - Run 2+ instances of WebSocket Server (behind a load balancer)

## Step 5: Set Up Load Balancer for WebSocket Server

1. **Create an Application Load Balancer (ALB)**:
   - Navigate to EC2 → Load Balancers → Create Load Balancer
   - Select Application Load Balancer
   - Configure with listener on port 443 (HTTPS)
   - Add target group for the WebSocket Server containers
   - Set the idle timeout to at least 120 seconds (WebSocket connections need longer timeouts)
   - Configure health check to use the `/health` endpoint
   - Path: `/health`
   - Success codes: 200
   - Interval: 30 seconds
   - Timeout: 5 seconds
   - Unhealthy threshold: 2
   - Healthy threshold: 3

2. **Set up SSL certificate**:
   - Use AWS Certificate Manager to create or import a certificate for your domain
   - Attach the certificate to the ALB

3. **Verify your ALB is configured for WebSockets**:
   - Ensure the ALB security group allows inbound traffic on port 443
   - Verify the health check is properly configured and targets are healthy

## Step 6: Configure DNS in Cloudflare

1. **Add a new subdomain in Cloudflare**:
   - Log in to your Cloudflare dashboard
   - Select the "askclera.com" domain
   - Go to the "DNS" tab
   - Click "Add record" button
   - Configure the record:
     - Type: CNAME
     - Name: realtime (this creates realtime.askclera.com)
     - Target: Your AWS ALB DNS name (e.g., portfolio-ws-lb-123456789.us-east-1.elb.amazonaws.com)
     - Proxy status: Initially OFF (gray cloud icon) while testing
     - TTL: Auto
   - Click "Save"

2. **Configure Cloudflare for WebSockets**:
   - Stay in Cloudflare dashboard
   - Go to "Network" tab
   - Under "WebSockets", ensure it's set to "On"
   - Go to "SSL/TLS" tab
   - Set SSL mode to "Full" or "Full (strict)" if using AWS Certificate
   - Go to "Rules" → "Settings"
   - Under "WebSockets" ensure timeouts are set to at least 120 seconds

3. **Turn on Cloudflare Proxying (After Testing)**:
   - Once WebSockets are working, go back to DNS tab
   - Edit the CNAME record for "realtime"
   - Click the cloud icon to turn proxying ON (orange cloud)
   - Click "Save"

## Step 7: Configure Frontend

1. **Update environment variables** in your frontend application:

```
# In your .env.production file:
NEXT_PUBLIC_WEBSOCKET_URL=wss://realtime.askclera.com
```

2. **Test the WebSocket connection**:
   - Deploy a test version of your frontend with the new WebSocket URL
   - Open browser developer tools and check for successful WebSocket connections
   - Look for any connection errors in the console

3. **Troubleshooting WebSocket connections**:
   - If connections fail, check:
     - Cloudflare WebSocket settings are enabled
     - ALB health checks are passing
     - Security groups allow the WebSocket traffic
     - Try temporarily disabling Cloudflare proxying to test direct connection

## Step 8: Monitoring and Scaling

1. **Set up CloudWatch Alarms**:
   - Monitor CPU and memory usage of ECS tasks
   - Monitor connection count to the WebSocket server
   - Set up alerts for high resource usage or error rates

2. **Configure Auto Scaling**:
   - Set up ECS Service Auto Scaling for WebSocket Server based on connection count or CPU usage
   - Ensure scaling policies are appropriate for expected traffic patterns

3. **Implement logging and metrics**:
   - Capture key metrics like:
     - Number of symbols tracked
     - Number of price updates per second
     - Number of connections
     - Portfolio recalculation time

## Step 9: Security Hardening

1. **Implement authentication** for WebSocket connections:
   - Require authentication token in connection URL or headers
   - Validate tokens on connection establishment
   - Restrict access to only authenticated users

2. **Enable Redis authentication and encryption**:
   - Use Redis AUTH for authentication
   - Use SSL/TLS for encryption in transit

3. **Audit API permissions**:
   - Ensure Alpaca API keys have only the necessary permissions
   - Implement least privilege principle for all services

## Step 10: Backup and Disaster Recovery

1. **Configure Redis snapshots**:
   - Enable automatic backups for the Redis cluster
   - Test recovery procedures

2. **Document recovery procedures**:
   - Create step-by-step guides for recovering from failures
   - Include procedures for restoring services in the correct order

## Step 11: Testing in Production

1. **Perform load testing**:
   - Simulate thousands of concurrent WebSocket connections
   - Test with hundreds of different stock symbols
   - Ensure system performance under peak load

2. **Conduct chaos testing**:
   - Simulate Redis failure
   - Simulate service failures
   - Test automatic recovery

## Appendix: Cost Optimization

- **Redis**: Consider using Redis caching tier instead of cluster mode for lower costs
- **ECS Fargate**: Use Spot instances for non-critical components like the Symbol Collector
- **Scaling**: Implement automatic scaling down during non-market hours to reduce costs

By following this guide, you'll have a robust, secure, and scalable real-time portfolio value tracking system deployed in production. 