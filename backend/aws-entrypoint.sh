# -----------------------------------------------------------------------------
# ⚠️  DEPRECATED: The backend is now deployed automatically by the AWS Copilot
# ⚠️  CodePipeline defined in backend/copilot/pipelines/clera-main.  This
# ⚠️  script is kept only for disaster‑recovery or local troubleshooting.
# -----------------------------------------------------------------------------

#!/bin/sh
# Exit immediately if a command exits with a non-zero status
#!/bin/bash
echo "Starting container with architecture: $(uname -m)"
echo "Checking for /api/health endpoint..."

# Add more robust health check with proper retries at startup
MAX_RETRIES=10
RETRY_INTERVAL=5
RETRY_COUNT=0

# Wait for the server to fully start before checking health
echo "Waiting for API server to start..."
sleep 15

# More robust health check with retries
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  echo "Attempt $((RETRY_COUNT+1))/$MAX_RETRIES to check health endpoint..."
  if curl -s --fail http://localhost:8000/api/health; then
    echo "Health check passed!"
    break
  else
    echo "Health check not ready yet, retrying in $RETRY_INTERVAL seconds..."
    RETRY_COUNT=$((RETRY_COUNT+1))
    sleep $RETRY_INTERVAL
  fi
done

# Even if health check fails, continue with startup - the HEALTHCHECK in Dockerfile
# will let ECS determine if container is healthy later
echo "Proceeding with startup regardless of initial health check result"

set -e

echo "=========== AWS Environment Startup =========="
echo "Timestamp: $(date)"
echo "Testing network connectivity..."
ping -c 1 google.com || echo "Warning: Network connectivity issue"

# Set defaults for essential environment variables
: "${WORKERS:=4}"
: "${BIND_PORT:=8000}"
: "${APP_HOME:=/app}"

# Advanced diagnostic info
echo "Environment details:"
echo "Python version: $(python --version)"
echo "Machine: $(uname -a)"
echo "Container IP: $(hostname -i || echo 'Not available')"

# Print available disk space
echo "Disk space:"
df -h /app

# Verify health check endpoint is defined in FastAPI
echo "Verifying API server code..."
grep -q "/api/health" /app/api_server.py && echo "Health check endpoint found" || echo "WARNING: Health check endpoint not found"

echo "=========== Starting Gunicorn Server =========="
echo "Workers: $WORKERS"
echo "Port: $BIND_PORT"
echo "App Home: $APP_HOME"
echo "================================================"

# Start with increased timeout values for AWS environment
exec gunicorn \
  --bind "0.0.0.0:$BIND_PORT" \
  --chdir "$APP_HOME" \
  -w "$WORKERS" \
  -k uvicorn.workers.UvicornWorker \
  --timeout 120 \
  --keep-alive 65 \
  --graceful-timeout 60 \
  --log-level info \
  --access-logfile - \
  --error-logfile - \
  api_server:app # Application module MUST come last after all options 


#exec gunicorn \
#  --bind="0.0.0.0:$BIND_PORT" \
#  --chdir="$APP_HOME" \
#  -w="$WORKERS" \
#  -k=uvicorn.workers.UvicornWorker \
#  --timeout=120 \
#  --graceful-timeout=60 \
#  --log-level=info \
#  --access-logfile=- \
#  --error-logfile=- \
#  api_server:app