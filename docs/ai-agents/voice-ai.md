# Clera Voice AI & Chat Integration

This project integrates a voice AI agent and chat functionality into the Clera financial platform.

## Features

- Text chat interface that connects to Clera's AI agent
- Voice conversation capabilities using LiveKit
- Beautiful Tron-inspired UI design

## Project Structure

### Backend Components
- `backend/api_server.py` - FastAPI server that exposes Clera's graph.py as an API
- `backend/conversational_ai/live_chat/` - LiveKit voice agent implementation

### Frontend Components
- `frontend_app/src/components/chat/` - Chat UI components
- `frontend_app/src/components/VoiceAgent/` - Voice agent UI components
- `frontend_app/src/app/api/chat/` - API routes for chat functionality

## Setup and Running

### 1. Run the Backend API Server

```bash
cd backend
pip install fastapi uvicorn
python api_server.py
```

This starts the backend server at http://localhost:8000 that connects to your custom AI agent in graph.py.

### 2. Run the Voice Agent (Optional, for voice chat functionality)

```bash
cd backend/conversational_ai/live_chat
python agent.py dev
```

This starts the LiveKit voice agent that powers the "Talk with Clera" button.

### 3. Run the Frontend

```bash
cd frontend_app
npm install
npm run dev
```

Visit http://localhost:3000 to see the application.

## Usage

- On the main page, you'll see a blue chat tab on the right side of the screen.
- Click this tab to open the chat interface.
- Type messages to chat with Clera's AI.
- Click the "Talk with Clera" button to start a voice conversation.

## Development

### Adding Dependencies

If you need to add more UI components:

```bash
cd frontend_app
npm install @radix-ui/react-component-name
```

## Troubleshooting

- **API Connection Issues**: Ensure the backend API server is running at http://localhost:8000
- **Voice Agent Issues**: Make sure you've set up the LiveKit credentials correctly
- **Module Import Errors**: Ensure Python can find the graph.py module 
