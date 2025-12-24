# LangSmith Fetch - Quick Reference Card

## 🚀 Fastest Start (Copy & Paste)

```bash
cd /Users/cristian_mendoza/Desktop/clera
./backend/scripts/fetch_langsmith_traces.sh traces 10
```

## 📋 Common Commands

| Task | Command |
|------|---------|
| Fetch 10 traces | `./backend/scripts/fetch_langsmith_traces.sh traces 10` |
| Fetch 5 threads | `./backend/scripts/fetch_langsmith_traces.sh threads 5` |
| Fetch specific trace | `./backend/scripts/fetch_langsmith_traces.sh trace <TRACE_ID>` |
| View help | `./backend/scripts/fetch_langsmith_traces.sh --help` |

## 🔑 Manual Setup (If Needed)

```bash
cd /Users/cristian_mendoza/Desktop/clera/backend
source venv/bin/activate
# Load API key from .env file (never hardcode!)
export LANGSMITH_API_KEY="$(grep LANGSMITH_API_KEY .env | cut -d'=' -f2 | tr -d '\"')"
```

## 🔍 Analyzing Traces

### Quick View
```bash
cd /Users/cristian_mendoza/Desktop/clera
cat docs/langsmith-samples/*.json | jq '.'
```

### Find Tool Calls
```bash
cat docs/langsmith-samples/*.json | jq '.[] | select(.tool_calls) | .tool_calls[].function.name'
```

### Extract User Messages
```bash
cat docs/langsmith-samples/*.json | jq '.[] | select(.role == "user") | .content'
```

### Find Portfolio Summaries
```bash
cat docs/langsmith-samples/*.json | jq '.[] | select(.name == "get_portfolio_summary") | .content'
```

## 📦 Output Location

```
docs/langsmith-samples/
├── <trace-id>.json        ← Individual traces
└── threads/
    └── <thread-id>.json   ← Conversation threads
```

## 🎯 Project Info

| Key | Value |
|-----|-------|
| **Project** | clera-agent-workflow |
| **UUID** | d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4 |
| **API Key** | In `backend/.env` → `LANGSMITH_API_KEY` |

## 🤖 Common Agents

- `Clera` - Main supervisor
- `portfolio_management_agent` - Portfolio analysis
- `financial_analyst_agent` - Market research
- `trade_execution_agent` - Trade execution

## 🛠️ Common Tools

- `get_portfolio_summary` - Portfolio overview
- `get_portfolio_data` - Detailed portfolio
- `transfer_to_portfolio_management_agent` - Route to portfolio agent
- `transfer_to_financial_analyst_agent` - Route to analyst
- `transfer_back_to_clera` - Return to supervisor

## ⚠️ Troubleshooting

| Error | Fix |
|-------|-----|
| API key not found | Use helper script OR `export LANGSMITH_API_KEY="..."` |
| Command not found | `source backend/venv/bin/activate` |
| Project UUID required | Add `--project-uuid d0c6d2c8-b5de-4e18-80f9-d66dc66d7ed4` |

## 📚 Full Documentation

- **Main Guide:** `docs/operations/langsmith-fetch-guide.md`
- **Setup Summary:** `docs/operations/LANGSMITH_SETUP_SUMMARY.md`
- **Sample Data:** `docs/langsmith-samples/README.md`

---

**Last Updated:** December 22, 2025

