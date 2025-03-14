FROM langchain/langgraph-api:3.11



# -- Adding local package . --
ADD . /deps/backend
# -- End of local package . --

# -- Installing all local dependencies --
RUN PYTHONDONTWRITEBYTECODE=1 pip install --no-cache-dir -c /api/constraints.txt -e /deps/*
# -- End of local dependencies install --
ENV LANGGRAPH_STORE='{"index": {"embed": "openai:text-embedding-3-small", "dims": 1536, "fields": ["$"]}}'
ENV LANGSERVE_GRAPHS='{"agent": "/deps/backend/clera_agents/graph.py:graph"}'

WORKDIR /deps/backend


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