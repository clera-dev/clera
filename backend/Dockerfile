# --- Builder Stage ---
# Use an official Python runtime as a parent image
FROM python:3.11-slim AS builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies if needed (e.g., for libraries like numpy or specific drivers)
# RUN apt-get update && apt-get install -y --no-install-recommends some-package && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
# Copy only requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# --- Runtime Stage ---
# Use a slim Python image for the final stage
FROM python:3.11-slim

# Set environment variables with defaults to prevent startup failures
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV APP_HOME=/app
ENV WORKERS=4
ENV BIND_PORT=8000
# WebSocket configuration
ENV WEBSOCKET_SERVICE_URL="websocket-service.production.clera-api.internal:8001"
ENV WEBSOCKET_TIMEOUT="300"

WORKDIR $APP_HOME

# Install system dependencies required at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    iputils-ping \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies from wheels built in the builder stage
COPY --from=builder /wheels /wheels
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
RUN pip install --no-cache-dir --no-index --find-links=/wheels /wheels/* \
    && rm -rf /wheels

# Copy application code
COPY . .

# Make scripts executable
RUN chmod +x /app/entrypoint.sh
RUN chmod +x /app/aws-entrypoint.sh

# Create a non-root user and group
RUN groupadd -r appuser && useradd --no-log-init -r -g appuser appuser

# Change ownership of the app directory
RUN chown -R appuser:appuser $APP_HOME

# Switch to the non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 8000

# Improved HEALTHCHECK configuration with more generous settings for AWS ECS
# Increased start period to 3 minutes to allow the app time to fully initialize
# Increased interval to 45s to reduce check frequency
# Increased timeout to 15s to allow for slower responses under load
HEALTHCHECK --interval=45s --timeout=15s --start-period=180s --retries=3 \
  CMD curl --silent --fail http://localhost:8000/api/health || exit 1

# Set the AWS-specific entrypoint script for more diagnostics
ENTRYPOINT ["/app/aws-entrypoint.sh"]

# Use the official Python image from the Docker Hub
#FROM python:3.12-slim

# Set the working directory in the container
#WORKDIR /app

# Copy the current directory contents into the container at /app
#COPY . /app

# Install any needed packages specified in requirements.txt
#RUN pip install --no-cache-dir -r requirements.txt

# Install the local package in development mode so modules can be imported
#RUN pip install -e .

# Make port 8080 available to the world outside this container
#EXPOSE 8080

# Define environment variables
#ENV PYTHONUNBUFFERED=1
#ENV PYTHONPATH=/app

# Install specific version of langgraph and related packages
#RUN pip install --no-cache-dir "langgraph>=0.2.73" "langgraph-cli>=0.1.74" "langgraph-sdk>=0.1.51" 

# Run the graph using langgraph CLI - which is the recommended way to serve graphs for LangGraph Studio
#CMD ["python", "-m", "langgraph_cli.cli", "serve", "--host", "0.0.0.0", "--port", "8080", "clera_agents.graph:graph"]

# Old/commented options
#CMD ["python", "-m", "langgraph_cli.cli", "serve", "--host", "0.0.0.0", "--port", "8080", "agent"]
#CMD ["python", "-m", "langgraph.api", "serve", "--port", "8080", "--host", "0.0.0.0", "agent"]
#CMD ["uvicorn", "graph_server:app", "--host", "0.0.0.0", "--port", "8080"]
#CMD ["python", "-m", "langgraph.cli", "run", "--port", "8080", "--host", "0.0.0.0", "agent"]
#CMD ["python", "-m", "clera_agents.graph", "--host", "0.0.0.0", "--port", "8080", "--reload"]
#CMD ["python", "-m", "langgraph.api", "--host", "0.0.0.0", "--port", "8080", "--reload"]
#CMD ["python", "-m", "clera_agents.graph"]