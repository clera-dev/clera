#!/bin/bash

# Start all services for Clera portfolio real-time system
echo "Starting Clera portfolio real-time services..."

# Check if Redis is running
redis-cli ping > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Redis is not running. Starting Redis..."
    # Try to start Redis (macOS)
    brew services start redis 2>/dev/null
    
    # If brew command failed, try systemctl (Linux)
    if [ $? -ne 0 ]; then
        echo "Trying systemctl to start Redis..."
        sudo systemctl start redis-server 2>/dev/null
    fi
    
    # Check if Redis started successfully
    sleep 2
    redis-cli ping > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to start Redis. Please start it manually."
        exit 1
    else
        echo "Redis started successfully."
    fi
else
    echo "Redis is already running."
fi

# Start the WebSocket server directly (not through run_services.py)
echo "Starting WebSocket server on port 8001..."
python -m portfolio_realtime.websocket_server &
WEBSOCKET_PID=$!
echo "WebSocket server started with PID: $WEBSOCKET_PID"

# Wait a moment for the WebSocket server to initialize
sleep 3

# Start the API server with activate.sh to handle watchfiles issues
echo "Starting API server on port 8000..."
source activate.sh && python api_server.py &
API_PID=$!
echo "API server started with PID: $API_PID"

echo "All services started. Press Ctrl+C to stop."

# Function to handle process termination
cleanup() {
    echo "Stopping services..."
    kill $WEBSOCKET_PID 2>/dev/null
    kill $API_PID 2>/dev/null
    echo "Services stopped."
    exit 0
}

# Set up trap to catch Ctrl+C
trap cleanup SIGINT SIGTERM

# Keep the script running
wait 