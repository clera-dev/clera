#!/bin/bash

# LangSmith Trace Fetcher Helper Script
# This script simplifies fetching LangSmith traces and threads for debugging

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"
VENV_PATH="$BACKEND_DIR/venv"
ENV_FILE="$BACKEND_DIR/.env"

# LangSmith configuration
PROJECT_UUID="d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4"

# Default output directory
DEFAULT_OUTPUT_DIR="$PROJECT_ROOT/docs/langsmith-samples"

# Function to display usage
usage() {
    echo -e "${BLUE}LangSmith Trace Fetcher${NC}"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  traces [LIMIT]      Fetch recent traces (default: 10)"
    echo "  threads [LIMIT]     Fetch recent threads (default: 5)"
    echo "  trace [TRACE_ID]    Fetch specific trace by ID"
    echo "  thread [THREAD_ID]  Fetch specific thread by ID"
    echo ""
    echo "Options:"
    echo "  -o, --output DIR    Output directory (default: docs/langsmith-samples)"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 traces 20                    # Fetch 20 most recent traces"
    echo "  $0 threads 10                   # Fetch 10 most recent threads"
    echo "  $0 trace 019b4756-e7e2-78f0     # Fetch specific trace"
    echo "  $0 traces 15 -o ./debug         # Fetch to custom directory"
    echo ""
}

# Check if virtual environment exists
if [ ! -d "$VENV_PATH" ]; then
    echo -e "${YELLOW}Error: Virtual environment not found at $VENV_PATH${NC}"
    echo "Please set up the virtual environment first."
    exit 1
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Error: .env file not found at $ENV_FILE${NC}"
    exit 1
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source "$VENV_PATH/bin/activate"

# Load API key from .env
export LANGSMITH_API_KEY=$(grep '^LANGSMITH_API_KEY=' "$ENV_FILE" | cut -d '"' -f 2)

if [ -z "$LANGSMITH_API_KEY" ]; then
    echo -e "${YELLOW}Error: LANGSMITH_API_KEY not found in $ENV_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configured${NC}"

# Parse arguments
COMMAND=${1:-traces}
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"

case "$COMMAND" in
    traces)
        LIMIT=${2:-10}
        echo -e "${BLUE}Fetching $LIMIT most recent traces...${NC}"
        mkdir -p "$OUTPUT_DIR"
        langsmith-fetch traces "$OUTPUT_DIR" --limit "$LIMIT" --project-uuid "$PROJECT_UUID"
        ;;
    threads)
        LIMIT=${2:-5}
        THREAD_OUTPUT="$OUTPUT_DIR/threads"
        echo -e "${BLUE}Fetching $LIMIT most recent threads...${NC}"
        mkdir -p "$THREAD_OUTPUT"
        langsmith-fetch threads "$THREAD_OUTPUT" --limit "$LIMIT" --project-uuid "$PROJECT_UUID"
        ;;
    trace)
        TRACE_ID=${2}
        if [ -z "$TRACE_ID" ]; then
            echo -e "${YELLOW}Error: Trace ID required${NC}"
            usage
            exit 1
        fi
        echo -e "${BLUE}Fetching trace $TRACE_ID...${NC}"
        langsmith-fetch trace "$TRACE_ID"
        ;;
    thread)
        THREAD_ID=${2}
        if [ -z "$THREAD_ID" ]; then
            echo -e "${YELLOW}Error: Thread ID required${NC}"
            usage
            exit 1
        fi
        echo -e "${BLUE}Fetching thread $THREAD_ID...${NC}"
        langsmith-fetch thread "$THREAD_ID"
        ;;
    -h|--help|help)
        usage
        exit 0
        ;;
    *)
        echo -e "${YELLOW}Error: Unknown command '$COMMAND'${NC}"
        usage
        exit 1
        ;;
esac

echo -e "${GREEN}✓ Complete!${NC}"

