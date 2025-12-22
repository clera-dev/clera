# LangSmith Fetch CLI Guide

## Overview

`langsmith-fetch` is a CLI tool for retrieving and analyzing LangSmith traces and threads from your LangGraph/LangChain applications. This tool is essential for debugging agent workflows, understanding conversation flows, and analyzing production issues.

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

# Export the API key from .env
export LANGSMITH_API_KEY="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"

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
api-key: "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"
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
- `LANGSMITH_API_KEY="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"`

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

### For Engineers

```bash
# 1. Set up environment (do this once per terminal session)
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate
export LANGSMITH_API_KEY="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"

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

# 2. Export API key
export LANGSMITH_API_KEY="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"

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
export LANGSMITH_API_KEY="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"

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
export LANGSMITH_API_KEY="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"
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

### Thread JSON Structure

Each thread file contains:
- `thread_id`: Unique conversation identifier
- `messages`: Full conversation history
- `metadata`: Thread-level metadata
- Multiple traces may belong to one thread

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

## Related Files

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

