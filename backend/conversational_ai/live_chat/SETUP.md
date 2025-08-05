# Quick Setup Guide for Clera Voice Agent

This guide provides step-by-step instructions to set up and run the Clera Voice Agent.

## Prerequisites

- Python 3.9+
- LiveKit Cloud account
- Deepgram API key
- Cartesia API key (optional)

## Backend Setup

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone https://github.com/your-repo/clera.git
   cd clera
   ```

2. **Set up the environment**:
   ```bash
   # Navigate to the live_chat directory
   cd backend/conversational_ai/live_chat
   
   # Create a virtual environment
   python3 -m venv venv
   
   # Activate the virtual environment
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Configure environment variables**:
   ```bash
   # Copy the example .env file
   cp .env.example .env
   
   # Edit the .env file with your API keys
   nano .env  # or any text editor
   ```

   Update the following values in the .env file:
   ```
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
   DEEPGRAM_API_KEY=your_deepgram_api_key
   CARTESIA_API_KEY=your_cartesia_api_key (optional)
   ```

4. **Run the voice agent**:
   ```bash
   # For Unix/macOS (using the convenience script)
   chmod +x run.sh
   ./run.sh
   
   # Alternatively, run directly
   python agent.py
   ```

## Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend_app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Configure environment variables**:
   ```bash
   # Copy the example .env file
   cp .env.local.example .env.local
   
   # Edit the .env.local file with your API keys
   nano .env.local  # or any text editor
   ```

   Update the following values in the .env.local file:
   ```
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
   ```

4. **Run the frontend**:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

5. **Access the application**:
   Open your browser and go to `http://localhost:3000`

## Troubleshooting

### Common Issues

1. **Import errors**: Make sure that Python can find the correct modules
   ```bash
   # Set PYTHONPATH to include the project root
   export PYTHONPATH=$PYTHONPATH:/path/to/clera
   ```

2. **LiveKit connection issues**: Verify that your LiveKit server is running and that your API keys are correct

3. **Audio issues**: Make sure your browser has permission to access your microphone

4. **Voice agent not responding**: Check the agent logs for errors and ensure that the agent is running

### Debug Mode

For more detailed logs, set `LOG_LEVEL=debug` in your `.env` file.

## Need Help?

If you encounter any issues, please check the logs and ensure all environment variables are correctly set. 