#!/usr/bin/env python3

"""
Server entry point for the Clera voice agent service.
This is a simple wrapper around agent.py that runs the agent.
"""

import os
import logging
import sys
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

# Configure logging
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("clera-voice-server")

# Print debug information about our environment
logger.info(f"Python version: {sys.version}")
logger.info(f"Current directory: {os.getcwd()}")
logger.info(f"Script location: {os.path.abspath(__file__)}")

# Check for necessary environment variables
api_key = os.environ.get("LIVEKIT_API_KEY")
api_secret = os.environ.get("LIVEKIT_API_SECRET")
livekit_url = os.environ.get("LIVEKIT_URL")

if not api_key or not api_secret or not livekit_url:
    logger.error("Missing LiveKit credentials. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL")
    sys.exit(1)

# Import and run the agent
try:
    # Run the agent module directly
    logger.info("Importing agent module...")
    import agent
    logger.info("Successfully imported agent module")
    
    # Run the agent
    logger.info("Starting Clera Voice Agent service...")
    if __name__ == "__main__":
        # The agent.py script will automatically run due to its 
        # if __name__ == "__main__" block when imported
        pass
except Exception as e:
    logger.error(f"Error starting agent: {e}", exc_info=True)
    sys.exit(1) 