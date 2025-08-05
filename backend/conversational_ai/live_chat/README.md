# Clera Voice Assistant

This is a voice assistant implementation using LiveKit's Agents Framework. It integrates with your custom AI agent workflow defined in `backend/clera_agents/graph.py`.

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy the example environment file and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   You'll need to provide:
   - LiveKit API credentials (API key, secret, and URL)
   - Deepgram API key for speech-to-text and text-to-speech

4. Make sure your custom agent is properly set up in `backend/clera_agents/graph.py`.

## Running the Voice Assistant

You can run the voice assistant using the provided script:

```bash
chmod +x run_voice_agent.sh
./run_voice_agent.sh
```

Or run it directly with Python:

```bash
python agent.py
```

## How It Works

The voice assistant uses LiveKit's Agents Framework to:

1. Connect to a LiveKit room and wait for a participant to join
2. Listen to the participant's audio using Deepgram's speech-to-text
3. Process the transcribed text using your custom AI agent from `graph.py`
4. Convert the agent's response to speech using Deepgram's text-to-speech
5. Send the audio back to the participant

## Customization

You can customize the agent's behavior by:

- Modifying the system prompt in `agent.py`
- Updating your custom agent logic in `graph.py`
- Changing the STT/TTS providers in `agent.py`

## Troubleshooting

If you encounter issues:

1. Check that all environment variables are properly set
2. Ensure your custom agent in `graph.py` is working correctly
3. Verify that you have the correct permissions for the LiveKit project
4. Check the logs for any error messages

## Requirements

- Python 3.9+
- LiveKit Cloud account or self-hosted LiveKit server
- Deepgram API key

## Features

- Real-time voice conversations with the Clera financial assistant
- Integration with Clera's custom LLM from `graph.py`
- Speech-to-text and text-to-speech capabilities using Deepgram
- Voice activity detection using Silero VAD

## Prerequisites

- Python 3.9+ 
- LiveKit Cloud Project with API credentials
- Deepgram API key

## Architecture

The system consists of:

1. `agent.py` - Contains the core voice agent logic, using a custom adapter to integrate Clera's LLM
2. `server.py` - Entry point for the service
3. Frontend integration in the main Clera app, with token generation handled directly by Next.js

## Integration with Clera

This voice agent is designed to be integrated with the Clera web application. The frontend integration includes a "Chat with Clera" button that launches the voice interface, and handles token generation for LiveKit using the Next.js API route.

## Development

For local development, you can run the agent and test the integration with the frontend, which handles token generation internally. 