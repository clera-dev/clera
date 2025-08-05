#!/usr/bin/env python3

"""
Simple launcher for the Clera voice agent.
This script directly runs the agent.py module.
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("clera-voice-launcher")

def main():
    """Main function to run the agent."""
    try:
        # Import and run the agent module
        logger.info("Starting Clera Voice Agent...")
        import agent
        logger.info("Agent module imported successfully")
        # The __name__ == "__main__" block in agent.py will automatically run
    except Exception as e:
        logger.error(f"Error running agent: {e}", exc_info=True)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main()) 