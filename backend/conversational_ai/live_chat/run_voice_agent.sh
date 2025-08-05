#!/bin/bash

# Activate virtual environment if it exists
if [ -d "venv" ]; then
  source venv/bin/activate
elif [ -d "../../../venv" ]; then
  source ../../../venv/bin/activate
fi

# Load environment variables
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

# Set up Python path properly
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../../.." && pwd )"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Add both root and backend to Python path
export PYTHONPATH="$PROJECT_ROOT:$BACKEND_DIR:$PYTHONPATH"
echo "PYTHONPATH set to: $PYTHONPATH"

# Check if required environment variables are set
if [ -z "$LIVEKIT_API_KEY" ] || [ -z "$LIVEKIT_API_SECRET" ] || [ -z "$LIVEKIT_URL" ]; then
  echo "Error: Required LiveKit environment variables are not set."
  echo "Please make sure LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL are defined in .env"
  exit 1
fi

if [ -z "$DEEPGRAM_API_KEY" ]; then
  echo "Warning: DEEPGRAM_API_KEY is not set. Speech-to-text functionality may not work properly."
fi

# Run the agent
echo "Starting Clera voice agent..."
python agent.py

# To run this script:
# chmod +x run_voice_agent.sh
# ./run_voice_agent.sh