# Clera Development Runbook

## Quick Start (TLDR)

### Prerequisites
- Python 3.12+
- Node.js 18+
- Git

### First Time Setup
```bash
# Backend setup
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend-app
npm install
```

### Running the Application

**Terminal 1 (T1) - WebSocket Server:**
```bash
cd backend && source venv/bin/activate && python -m portfolio_realtime.websocket_server
```

**Terminal 2 (T2) - API Server:**
```bash
cd backend && source venv/bin/activate && source activate.sh && python api_server.py
```

**Terminal 3 (T3) - Frontend Development Server:**
```bash
cd frontend-app && npm run dev
```

**Terminal 4 (T4) - LangGraph Server (when needed):**
```bash
cd backend && source venv/bin/activate && cd .. && langgraph up
```

### When to Run LangGraph Server
Run Terminal 4 only when you:
- Modify agent files in `backend/clera_agents/`
- Update the graph configuration in `langgraph.json`
- Need to refresh the agent system

### Ports
- Frontend: http://localhost:3000
- API Server: http://localhost:8000
- WebSocket: http://localhost:8001
- LangGraph: http://localhost:8123

### Troubleshooting
- **Port already in use**: Kill processes with `lsof -ti:8000 | xargs kill -9`
- **Environment issues**: Ensure virtual environment is activated with `source venv/bin/activate`
- **Dependencies**: Reinstall with `pip install -r requirements.txt` and `npm install`
