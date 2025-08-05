#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Set defaults for essential environment variables
: "${WORKERS:=4}"
: "${BIND_PORT:=8000}"
: "${APP_HOME:=/app}"

# Print environment variables for debugging
echo "======== STARTUP INFORMATION ========"
echo "Starting Gunicorn with the following configuration:"
echo "WORKERS: $WORKERS"
echo "BIND_PORT: $BIND_PORT"
echo "APP_HOME: $APP_HOME"
echo "======== END STARTUP INFO ==========="

# Execute the Gunicorn server with error handling
echo "Starting server on port $BIND_PORT..."
exec gunicorn -w "$WORKERS" -k uvicorn.workers.UvicornWorker api_server:app --bind "0.0.0.0:$BIND_PORT" --chdir "$APP_HOME" --timeout 120 --graceful-timeout 60 