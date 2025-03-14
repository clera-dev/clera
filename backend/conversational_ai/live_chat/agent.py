#!/usr/bin/env python3

import asyncio
import logging
import os
import sys
import importlib.util

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    llm,
    metrics,
)
from livekit.agents.pipeline import VoicePipelineAgent
from livekit.plugins import deepgram, silero

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("clera-voice-assistant")

# Load environment variables
load_dotenv()

def find_clera_graph():
    """Find and import the clera_agents.graph module."""
    # Add paths to locate the module
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
    backend_path = os.path.join(project_root, "backend")
    
    # Add paths to sys.path if they're not already there
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
    
    logger.info(f"Looking for graph in: {backend_path}")
    
    try:
        # Try direct import
        from clera_agents.graph import graph
        logger.info("Successfully imported graph from clera_agents.graph")
        return graph
    except ImportError:
        # Try loading from file path
        graph_path = os.path.join(backend_path, "clera_agents", "graph.py")
        if os.path.exists(graph_path):
            try:
                spec = importlib.util.spec_from_file_location("graph", graph_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                if hasattr(module, "graph"):
                    logger.info(f"Successfully loaded graph from file: {graph_path}")
                    return module.graph
            except Exception as e:
                logger.error(f"Error loading module from {graph_path}: {e}")
    
    # If we get here, we couldn't find the module
    logger.error("Could not find clera_agents.graph module")
    raise ImportError("Could not find clera_agents.graph module")

# Try to find and import the clera_graph module
try:
    clera_graph = find_clera_graph()
    logger.info("Successfully imported clera_graph")
except ImportError as e:
    logger.error(f"Failed to import clera_graph: {e}")
    sys.exit(1)

# Custom LLM adapter to integrate with LiveKit
class CleraLLMAdapter(llm.LLM):
    def __init__(self):
        super().__init__()
        self.graph = clera_graph
        logger.info(f"CleraLLMAdapter initialized with graph")
        
    async def chat(self, chat_ctx, stream=True, **kwargs):
        try:
            # Convert LiveKit format to our LLM's format
            messages = []
            for msg in chat_ctx.messages:
                if msg.role == "system":
                    messages.append({"role": "system", "content": msg.text})
                elif msg.role == "user":
                    messages.append({"role": "human", "content": msg.text})
                elif msg.role == "assistant":
                    messages.append({"role": "ai", "content": msg.text})
            
            # Create the input state for the graph
            state = {"messages": messages}
            
            # Call the graph
            result = self.graph.invoke(state)
            
            # Extract the response
            response = self._extract_response(result)
            
            # Simulate streaming if requested
            if stream:
                chunks = response.split()
                for i in range(0, len(chunks), 3):
                    chunk = " ".join(chunks[i:i+3])
                    yield chunk
                    await asyncio.sleep(0.1)
            else:
                yield response
        except Exception as e:
            logger.error(f"Error in CleraLLMAdapter.chat: {e}", exc_info=True)
            yield "I'm sorry, I encountered an error processing your request. Please try again."
    
    def _extract_response(self, result):
        """Extract the response from the LLM result."""
        try:
            # Case 1: Result has a 'response' field
            if isinstance(result, dict) and "response" in result:
                return result["response"]
                
            # Case 2: Result is a dict with 'messages' field
            if isinstance(result, dict) and "messages" in result and result["messages"]:
                # Find the last AI message
                messages = result["messages"]
                for msg in reversed(messages):
                    if isinstance(msg, dict) and msg.get("role") in ["ai", "assistant"]:
                        return msg.get("content", "")
            
            # Case 3: Result has 'output' field
            if isinstance(result, dict) and "output" in result:
                output = result["output"]
                if isinstance(output, str):
                    return output
                elif isinstance(output, list):
                    # Try to extract from message list
                    for msg in reversed(output):
                        if isinstance(msg, dict) and msg.get("role") in ["ai", "assistant"]:
                            return msg.get("content", "")
            
            # Last resort: convert the whole result to string
            return str(result)
        except Exception as e:
            logger.error(f"Error extracting response: {e}", exc_info=True)
            return "Error extracting response from LLM result"

def prewarm(proc: JobProcess):
    """Preload models and save them to userdata."""
    proc.userdata["vad"] = silero.VAD.load()

async def entrypoint(ctx: JobContext):
    """Main entry point for the voice agent."""
    initial_ctx = llm.ChatContext().append(
        role="system",
        text=(
            "You are Clera, an AI assistant specializing in financial advice. Your interface with users will be voice. "
            "Keep your responses clear, concise, and easy to understand. Avoid using complex financial jargon unless "
            "specifically asked to explain a concept. You should provide helpful financial guidance based on best practices."
        ),
    )

    logger.info(f"Connecting to room {ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for the first participant to connect
    participant = await ctx.wait_for_participant()
    logger.info(f"Starting voice assistant for participant {participant.identity}")

    # Configure STT based on connection type
    dg_model = "nova-3-general"
    if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
        dg_model = "nova-2-phonecall"

    # Create the agent with our custom LLM
    agent = VoicePipelineAgent(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(model=dg_model),
        llm=CleraLLMAdapter(),
        tts=deepgram.TTS(),
        chat_ctx=initial_ctx,
    )

    agent.start(ctx.room, participant)

    # Set up usage collection
    usage_collector = metrics.UsageCollector()

    @agent.on("metrics_collected")
    def _on_metrics_collected(mtrcs: metrics.AgentMetrics):
        metrics.log_metrics(mtrcs)
        usage_collector.collect(mtrcs)

    async def log_usage():
        summary = usage_collector.get_summary()
        logger.info(f"Usage: ${summary}")

    ctx.add_shutdown_callback(log_usage)

    # Handle text chat messages
    chat = rtc.ChatManager(ctx.room)

    async def answer_from_text(txt: str):
        chat_ctx = agent.chat_ctx.copy()
        chat_ctx.append(role="user", text=txt)
        stream = agent.llm.chat(chat_ctx=chat_ctx)
        await agent.say(stream)

    @chat.on("message_received")
    def on_chat_received(msg: rtc.ChatMessage):
        if msg.message:
            asyncio.create_task(answer_from_text(msg.message))

    # Initial greeting
    await agent.say("Hello, I'm Clera, your financial assistant. How can I help you today?", allow_interruptions=True)

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    ) 