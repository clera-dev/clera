# LangSmith Fetch Setup - Complete Summary

**Date:** December 22, 2025  
**Status:** ✅ Complete and Tested

## What Was Set Up

This document summarizes the complete setup of the `langsmith-fetch` CLI tool for debugging and analyzing LangSmith traces and threads from the Clera agent workflow.

## Files Created/Modified

### 📄 Documentation Created

1. **`docs/operations/langsmith-fetch-guide.md`** (Main Guide)
   - Complete usage guide for engineers and AI agents
   - Authentication setup instructions
   - Common usage patterns and examples
   - Troubleshooting section
   - Real examples from Clera's production traces
   - Python code examples for trace analysis

2. **`docs/langsmith-samples/README.md`** (Sample Data Guide)
   - Explanation of trace file structure
   - Message type documentation
   - Common agents and tools reference
   - jq and Python analysis examples
   - Best practices for debugging

3. **`docs/operations/LANGSMITH_SETUP_SUMMARY.md`** (This File)
   - Setup summary and quick reference

### 🔧 Scripts Created

4. **`backend/scripts/fetch_langsmith_traces.sh`** (Helper Script)
   - Automated trace/thread fetching
   - Handles environment setup automatically
   - Loads API key from `.env` file
   - Color-coded terminal output
   - Support for bulk fetches and specific ID lookups

### 📝 Documentation Updated

5. **`docs/README.md`**
   - Added LangSmith Fetch Guide to Operations section
   - Added "Debugging Agent Workflows" quick start section

6. **`.gitignore`**
   - Added entries to ignore trace JSON files (may contain sensitive data)
   - Prevents accidental commits of user data

### 📦 Sample Data

7. **Sample Traces Fetched**
   - 5 recent traces saved to `docs/langsmith-samples/`
   - 3 recent threads saved to `docs/langsmith-samples/threads/`
   - All verified to contain complete conversation flows with tool calls

## Key Configuration

### Project Information
- **Project Name:** clera-agent-workflow
- **Project UUID:** `d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4`
- **API Key Location:** `backend/.env` → `LANGSMITH_API_KEY`
- **Endpoint:** https://api.smith.langchain.com

### Environment Variables (in backend/.env)
```bash
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT="https://api.smith.langchain.com"
LANGSMITH_API_KEY="<YOUR_LANGSMITH_API_KEY>"  # Get from backend/.env
LANGSMITH_PROJECT="clera-agent-workflow"
```

## Quick Start Commands

### Using Helper Script (Recommended)

```bash
# From project root
cd /Users/cristian_mendoza/Desktop/clera

# Fetch 10 recent traces
./backend/scripts/fetch_langsmith_traces.sh traces 10

# Fetch 5 recent threads
./backend/scripts/fetch_langsmith_traces.sh threads 5

# Fetch specific trace
./backend/scripts/fetch_langsmith_traces.sh trace 019b4756-e7e2-78f0-a11c-966f3b1e8d67

# View help
./backend/scripts/fetch_langsmith_traces.sh --help
```

### Manual Commands

```bash
# Set up environment
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"

# Fetch traces
langsmith-fetch traces ../docs/langsmith-samples --limit 10 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4

# Fetch threads
langsmith-fetch threads ../docs/langsmith-samples/threads --limit 5 --project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4
```

## What the Traces Contain

Each trace file includes:
- ✅ Complete conversation flow (user → agent → response)
- ✅ Agent transfers (Clera → portfolio_management_agent → back to Clera)
- ✅ Tool calls with arguments (e.g., `get_portfolio_summary`)
- ✅ Tool results (e.g., portfolio data, market data)
- ✅ All agent responses and reasoning

### Example Agent Flow from Real Trace

1. **User:** "i want to test out your trading capabilities by buying $5..."
2. **Clera:** Makes initial recommendation without checking portfolio
3. **User:** "how do you know that you didn't even look at my actual portfolio"
4. **Clera:** Transfers to `portfolio_management_agent`
5. **Portfolio Agent:** Calls `get_portfolio_summary` tool
6. **Tool Result:** Returns complete portfolio data (TSLA 54.8%, AAPL 25.2%, etc.)
7. **Portfolio Agent:** Analyzes actual holdings and provides tailored recommendation
8. **Portfolio Agent:** Transfers back to Clera
9. **Clera:** Delivers final response with corrected recommendations

## Verification Tests Performed

✅ Helper script works from project root  
✅ Traces successfully fetched (5 samples)  
✅ Threads successfully fetched (3 samples)  
✅ API key loaded from `.env` file  
✅ Output directories created automatically  
✅ JSON files contain complete conversation data  
✅ Help command displays usage information  
✅ Files added to `.gitignore` to prevent data leaks

## Common Use Cases

### For Engineers

**Debugging a Production Issue:**
```bash
# Fetch recent traces
./backend/scripts/fetch_langsmith_traces.sh traces 20

# Analyze for errors
cat docs/langsmith-samples/*.json | jq '.[] | select(.content | contains("error"))'
```

**Analyzing Agent Performance:**
```bash
# Fetch traces
./backend/scripts/fetch_langsmith_traces.sh traces 50

# Count tool usage
cat docs/langsmith-samples/*.json | jq '.[] | select(.tool_calls) | .tool_calls[].function.name' | sort | uniq -c
```

### For AI Coding Agents

**Fetch and Analyze:**
```bash
# 1. Fetch recent traces
cd /Users/cristian_mendoza/Desktop/clera
./backend/scripts/fetch_langsmith_traces.sh traces 15

# 2. Read trace files to understand agent behavior
cat docs/langsmith-samples/019b4756-e7e2-78f0-a11c-966f3b1e8d67.json

# 3. Analyze patterns programmatically
```

## Documentation Locations

- **Main Guide:** `docs/operations/langsmith-fetch-guide.md`
- **Sample Data Guide:** `docs/langsmith-samples/README.md`
- **Helper Script:** `backend/scripts/fetch_langsmith_traces.sh`
- **Project Overview:** `docs/README.md`

## Troubleshooting Reference

| Issue | Solution |
|-------|----------|
| "LANGSMITH_API_KEY not found" | Run `export LANGSMITH_API_KEY="..."` or use helper script |
| "command not found: langsmith-fetch" | Activate venv: `source backend/venv/bin/activate` |
| "Project UUID required" | Add `--project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4` |
| Empty trace files | Check API key is correct and project UUID is valid |

## Next Steps for Engineers

1. **Read the full guide:** `docs/operations/langsmith-fetch-guide.md`
2. **Fetch your first traces:** `./backend/scripts/fetch_langsmith_traces.sh traces 10`
3. **Analyze the JSON:** Use jq or Python to explore trace structure
4. **Integrate into debugging workflow:** Fetch traces when investigating issues

## Next Steps for AI Agents

1. Use helper script to fetch traces: `./backend/scripts/fetch_langsmith_traces.sh traces 10`
2. Parse JSON files to understand agent behavior
3. Analyze tool usage patterns and agent routing
4. Identify issues in conversation flows
5. Provide insights based on trace data

## Security Notes

⚠️ **Important:** Trace files may contain:
- User portfolio data
- Account balances
- Trading activity
- Personal financial information

**Do NOT:**
- Commit trace JSON files to git (already in `.gitignore`)
- Share trace files publicly
- Include traces in documentation

**Safe to commit:**
- `README.md` files
- Guide documentation
- Helper scripts (no secrets embedded)

---

## Summary

✅ **Complete setup** of LangSmith fetch tooling  
✅ **Comprehensive documentation** for engineers and AI agents  
✅ **Automated helper script** for easy trace fetching  
✅ **Sample traces** demonstrating real agent workflows  
✅ **Security measures** to prevent data leaks  

**Ready to use!** Start debugging with:
```bash
./backend/scripts/fetch_langsmith_traces.sh traces 10
```

---

**Maintained by:** Clera Engineering Team  
**Last Updated:** December 22, 2025

