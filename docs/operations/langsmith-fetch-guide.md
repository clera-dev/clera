# LangSmith Fetch CLI Guide

## Quick Reference

**TL;DR - Fastest Way to Get Started:**

```bash
# From project root - that's it!
./backend/scripts/fetch_langsmith_traces.sh traces 10
./backend/scripts/fetch_langsmith_traces.sh threads 5
```

**Manual Command:**
```bash
cd backend
source venv/bin/activate
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"
langsmith-fetch traces ./output --limit 10 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4
```

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Authentication Setup](#authentication-setup)
4. [Project Information](#project-information)
5. [Common Usage Patterns](#common-usage-patterns)
6. [Quick Start Workflow](#quick-start-workflow)
7. [Real Examples from Clera](#real-examples-from-clera)
8. [Troubleshooting](#troubleshooting)
9. [Helper Script](#helper-script)
10. [Best Practices](#best-practices)

---

## Overview

`langsmith-fetch` is a CLI tool for retrieving and analyzing LangSmith traces and threads from your LangGraph/LangChain applications. This tool is essential for debugging agent workflows, understanding conversation flows, and analyzing production issues.

### Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    LangSmith Fetch Workflow                  │
└─────────────────────────────────────────────────────────────┘

1. Setup Environment
   ┌────────────────────────────────────────┐
   │ Option A: Helper Script (Automatic)    │
   │ ./backend/scripts/fetch_langsmith_     │
   │    traces.sh traces 10                 │
   │                                        │
   │ Option B: Manual                       │
   │ • cd backend                           │
   │ • source venv/bin/activate             │
   │ • export LANGSMITH_API_KEY="..."       │
   └────────────────────────────────────────┘
                    ↓
2. Fetch Data
   ┌────────────────────────────────────────┐
   │ langsmith-fetch traces ./output        │
   │   --limit 10                           │
   │   --project-uuid <uuid>                │
   └────────────────────────────────────────┘
                    ↓
3. Output Created
   ┌────────────────────────────────────────┐
   │ docs/langsmith-samples/                │
   │ ├── 019b4756-...-8d67.json ← Trace 1  │
   │ ├── 019b4757-...-8d01.json ← Trace 2  │
   │ └── 019b4759-...-64b3.json ← Trace 3  │
   └────────────────────────────────────────┘
                    ↓
4. Analyze Traces
   ┌────────────────────────────────────────┐
   │ • View with jq                         │
   │ • Parse with Python                    │
   │ • Analyze agent behavior               │
   │ • Debug production issues              │
   └────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Trace Contents                            │
├─────────────────────────────────────────────────────────────┤
│ User Message → Agent Response → Tool Call → Tool Result    │
│                                                             │
│ Example Flow:                                               │
│ 1. User: "Buy $5 of stock"                                 │
│ 2. Clera: transfer_to_portfolio_management_agent()         │
│ 3. Portfolio Agent: get_portfolio_summary()                │
│ 4. Tool Result: {"holdings": [...], "cash": 325.98}       │
│ 5. Portfolio Agent: "Based on your holdings..."           │
│ 6. Portfolio Agent: transfer_back_to_clera()              │
│ 7. Clera: "I recommend JNJ for diversification..."        │
└─────────────────────────────────────────────────────────────┘
```

## Installation

The tool should already be installed in your Python virtual environment. If not:

```bash
cd backend
source venv/bin/activate
pip install langsmith-fetch
```

## Authentication Setup

### Option 1: Environment Variable (Recommended for Session Use)

The LangSmith API key is stored in `backend/.env` but needs to be explicitly exported for the CLI to access it:

```bash
# Navigate to backend and activate venv
cd backend
source venv/bin/activate

# Export the API key from .env (never hardcode the actual key!)
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"

# Now you can use langsmith-fetch commands
langsmith-fetch traces ./output --limit 10
```

**Note:** This export only lasts for the current terminal session. You'll need to re-export it in new terminal sessions.

### Option 2: Manual Config File (Permanent Setup)

You can manually edit the config file to store the API key permanently:

```bash
# Create config directory if it doesn't exist
mkdir -p ~/.langsmith-cli

# Edit config file
nano ~/.langsmith-cli/config.yaml
```

Add the following to the config file:

```yaml
api-key: "<YOUR_LANGSMITH_API_KEY>"  # Copy from backend/.env
project-uuid: "d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4"
project-name: "clera-agent-workflow"
base-url: "https://api.smith.langchain.com"
default-format: "pretty"
```

### Verify Configuration

```bash
langsmith-fetch config show
```

## Project Information

- **Project Name:** clera-agent-workflow
- **Project UUID:** d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4
- **LangSmith Endpoint:** https://api.smith.langchain.com

This information is also available in `backend/.env`:
- `LANGSMITH_PROJECT="clera-agent-workflow"`
- `LANGSMITH_API_KEY` (stored in `.env` - never commit to git!)

## Common Usage Patterns

### 1. Fetch Recent Traces (Most Common)

Traces represent individual execution runs of your agent workflow.

```bash
# Fetch 10 most recent traces to a directory
langsmith-fetch traces ./langsmith-samples --limit 10

# Fetch with project UUID explicitly
langsmith-fetch traces ./output --limit 10 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4

# Fetch to stdout (only if you need to pipe)
langsmith-fetch traces --limit 5 --format json
```

**Output:** Creates one JSON file per trace in the specified directory.

### 2. Fetch Recent Threads

Threads represent conversation sessions with multiple turns.

```bash
# Fetch 5 most recent threads to a directory
langsmith-fetch threads ./threads-output --limit 5 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4

# Thread fetching REQUIRES --project-uuid
langsmith-fetch threads ./output --limit 10 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4
```

**Note:** Thread fetching always requires the `--project-uuid` parameter.

### 3. Fetch Specific Trace by ID

If you have a specific trace ID from LangSmith UI or logs:

```bash
# View in terminal
langsmith-fetch trace 019b4756-e7e2-78f0-a11c-966f3b1e8d67

# Save to JSON
langsmith-fetch trace 019b4756-e7e2-78f0-a11c-966f3b1e8d67 --format raw > trace.json
```

### 4. Fetch Specific Thread by ID

```bash
# View in terminal
langsmith-fetch thread 03da1ced-e62c-429f-8323-4a59220aabb8

# Save to JSON
langsmith-fetch thread 03da1ced-e62c-429f-8323-4a59220aabb8 --format json > thread.json
```

## Output Formats

The tool supports three output formats:

1. **`--format pretty`** (default)
   - Human-readable with Rich panels
   - Color-coded output
   - Best for terminal viewing

2. **`--format json`**
   - Pretty-printed JSON with syntax highlighting
   - Good for human inspection

3. **`--format raw`**
   - Compact single-line JSON
   - Best for piping to other tools or scripts

## Quick Start Workflow

### Option 1: Using the Helper Script (Easiest)

We've created a helper script that handles all the setup automatically:

```bash
# Fetch recent traces (default: 10)
./backend/scripts/fetch_langsmith_traces.sh traces 10

# Fetch recent threads (default: 5)
./backend/scripts/fetch_langsmith_traces.sh threads 5

# Fetch specific trace by ID
./backend/scripts/fetch_langsmith_traces.sh trace 019b4756-e7e2-78f0-a11c-966f3b1e8d67

# Fetch specific thread by ID
./backend/scripts/fetch_langsmith_traces.sh thread 03da1ced-e62c-429f-8323-4a59220aabb8

# View help
./backend/scripts/fetch_langsmith_traces.sh --help
```

The helper script automatically:
- Activates the virtual environment
- Loads the API key from `backend/.env`
- Sets up the correct project UUID
- Creates output directories as needed

### Option 2: Manual Setup (For Engineers)

```bash
# 1. Set up environment (do this once per terminal session)
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"

# 2. Fetch recent traces for debugging
langsmith-fetch traces ~/Desktop/debug-traces --limit 10

# 3. Analyze specific trace
langsmith-fetch trace <trace-id-from-logs>
```

### For AI Coding Agents

When an AI agent needs to analyze LangSmith data:

```bash
# 1. Navigate and activate
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate

# 2. Export API key from .env (never hardcode!)
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"

# 3. Fetch to a structured directory (RECOMMENDED)
langsmith-fetch traces ./analysis-output --limit 15 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4

# 4. Parse JSON files for analysis
# Each trace is saved as <trace-id>.json
```

**Note:** Always use directory output mode unless explicitly requesting stdout output.

## Real Examples from Clera

### Example 1: Fetching Recent Agent Runs

```bash
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"

# Fetch 5 most recent traces
langsmith-fetch traces /Users/cristian_mendoza/Desktop/clera/docs/langsmith-samples --limit 5 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4
```

**Output:**
```
Fetching up to 5 recent trace(s)...
Found 5 trace(s) in 6.41s. Saving to /Users/cristian_mendoza/Desktop/clera/docs/langsmith-samples/
  ✓ Saved 019b4756-e7e2-78f0-a11c-966f3b1e8d67.json (11 messages)
  ✓ Saved 019b4755-fca2-7543-9636-6289bf9402a8.json (2 messages)
  ✓ Saved 019b4759-a0ff-7c42-9a9f-e2c9fc0664b3.json (25 messages)
  ✓ Saved 019b4759-3a9a-70d1-8178-cd6532e7acd0.json (25 messages)
  ✓ Saved 019b4757-9059-7a83-8993-b136933f0f01.json (22 messages)
```

### Example 2: Fetching Conversation Threads

```bash
# Fetch threads (conversation sessions)
langsmith-fetch threads /Users/cristian_mendoza/Desktop/clera/docs/langsmith-samples/threads --limit 3 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4
```

**Output:**
```
Fetching up to 3 recent thread(s)...
Found 3 thread(s). Saving to /Users/cristian_mendoza/Desktop/clera/docs/langsmith-samples/threads/
  ✓ Saved 03da1ced-e62c-429f-8323-4a59220aabb8.json (25 messages)
  ✓ Saved 1e7cd86a-d854-4f25-bde9-90a10ba85cfa.json (27 messages)
  ✓ Saved b8e79121-8e9c-42ab-a50f-401f0e6d08ed.json (12 messages)
```

## Troubleshooting

### Error: "LANGSMITH_API_KEY not found in environment or config"

**Solution:** Export the API key in your current terminal session:

```bash
# From the backend directory:
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"
```

Or set up the permanent config file as described in the Authentication Setup section.

### Error: "command not found: langsmith-fetch"

**Solution:** Make sure you're in the virtual environment:

```bash
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate
```

### Error: "Project UUID required for thread fetching"

**Solution:** Always include `--project-uuid` when fetching threads:

```bash
langsmith-fetch threads ./output --limit 5 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4
```

## Understanding the Output

### Trace JSON Structure

Each trace file contains:
- `trace_id`: Unique identifier for the trace
- `messages`: Array of conversation messages
- `metadata`: Agent execution metadata
- `inputs`: Input to the agent
- `outputs`: Final output from the agent
- `steps`: Individual agent steps/tool calls

**Example viewing a trace:**
```bash
# Pretty print with jq
cat docs/langsmith-samples/019b4756-e7e2-78f0-a11c-966f3b1e8d67.json | jq '.'

# Extract just the messages
cat docs/langsmith-samples/019b4756-e7e2-78f0-a11c-966f3b1e8d67.json | jq '.messages'

# Find tool calls
cat docs/langsmith-samples/*.json | jq '.messages[] | select(.tool_calls) | .tool_calls'
```

### Thread JSON Structure

Each thread file contains:
- `thread_id`: Unique conversation identifier
- `messages`: Full conversation history
- `metadata`: Thread-level metadata
- Multiple traces may belong to one thread

### Analyzing Traces with Python

```python
import json
from pathlib import Path

# Load all traces
traces_dir = Path("docs/langsmith-samples")
traces = []

for trace_file in traces_dir.glob("*.json"):
    with open(trace_file) as f:
        traces.append(json.load(f))

# Analyze tool usage
tool_usage = {}
for trace in traces:
    for message in trace.get("messages", []):
        if "tool_calls" in message:
            for tool_call in message["tool_calls"]:
                tool_name = tool_call["function"]["name"]
                tool_usage[tool_name] = tool_usage.get(tool_name, 0) + 1

print("Tool Usage Statistics:")
for tool, count in sorted(tool_usage.items(), key=lambda x: x[1], reverse=True):
    print(f"  {tool}: {count}")
```

## Clera-Specific Agent Insights

When analyzing Clera's agent workflow traces, you'll see:

### Agent Types
- **Supervisor Agent**: Routes tasks between specialized agents
- **Financial Analyst Agent**: Handles research and market analysis
- **Portfolio Management Agent**: Manages portfolio analysis and recommendations
- **Trade Execution Agent**: Handles order placement and execution

### Common Tool Calls
- `get_portfolio_data`: Fetches user portfolio information
- `get_market_data`: Retrieves market prices and data
- `analyze_stock`: Performs stock analysis
- `execute_trade`: Places trades via SnapTrade
- `search_news`: Searches for financial news
- `calculate_metrics`: Computes portfolio metrics

### Message Flow
1. User input → Supervisor Agent
2. Supervisor routes to specialized agent(s)
3. Agent uses tools (portfolio data, market data, etc.)
4. Agent formulates response
5. Supervisor consolidates and returns to user

**Example trace analysis:**
```bash
# Find all portfolio data fetches
cat docs/langsmith-samples/*.json | jq '.messages[] | select(.tool_calls[]?.function.name == "get_portfolio_data")'

# Find all trade executions
cat docs/langsmith-samples/*.json | jq '.messages[] | select(.tool_calls[]?.function.name == "execute_trade")'
```

## Integration with Development Workflow

### Debugging Production Issues

```bash
# 1. Get recent failing traces
langsmith-fetch traces ./prod-debug --limit 20

# 2. Analyze specific error trace
langsmith-fetch trace <failing-trace-id> --format json > error-trace.json

# 3. Review the trace content
cat error-trace.json | jq '.messages[] | select(.type == "error")'
```

### Analyzing Agent Behavior

```bash
# Fetch recent agent runs
langsmith-fetch traces ./agent-analysis --limit 50

# Use jq or Python to analyze patterns
# Example: Count tool usage
cat ./agent-analysis/*.json | jq '.messages[] | select(.tool_calls) | .tool_calls[].function.name'
```

### Code Reviews and Testing

When reviewing agent changes:

```bash
# Before code changes
langsmith-fetch traces ./before-changes --limit 10

# After code changes
langsmith-fetch traces ./after-changes --limit 10

# Compare behavior
diff <(cat before-changes/*.json) <(cat after-changes/*.json)
```

## Best Practices

1. **Always use directory output mode** for bulk fetches (recommended default)
2. **Export API key per session** or set up permanent config file
3. **Use specific trace IDs** when debugging known issues
4. **Limit results** appropriately (5-20 for analysis, more for bulk export)
5. **Organize output directories** by date or purpose (e.g., `./debug-2025-12-22/`)
6. **Include project UUID** for thread fetching (required)

## Helper Script

A convenience script is available at `backend/scripts/fetch_langsmith_traces.sh` that automates the entire process.

**Features:**
- Automatic environment setup
- API key loading from `.env`
- Organized output directory structure
- Colored terminal output
- Error handling

**Location:** `backend/scripts/fetch_langsmith_traces.sh`

**Usage Examples:**
```bash
# From project root
./backend/scripts/fetch_langsmith_traces.sh traces 20
./backend/scripts/fetch_langsmith_traces.sh threads 10
./backend/scripts/fetch_langsmith_traces.sh trace <trace-id>
```

## Related Files

- Helper Script: `backend/scripts/fetch_langsmith_traces.sh`
- API Key: `backend/.env` → `LANGSMITH_API_KEY`
- Project Config: `backend/.env` → `LANGSMITH_PROJECT`
- LangGraph Config: `langgraph.json`
- Sample Output: `docs/langsmith-samples/`

## Additional Resources

- LangSmith Dashboard: https://smith.langchain.com/
- LangSmith API Docs: https://docs.smith.langchain.com/
- Project URL: Check `LANGGRAPH_API_URL` in `backend/.env`

---

**Last Updated:** December 22, 2025
**Maintainer:** Clera Engineering Team

