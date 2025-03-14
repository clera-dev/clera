#!/usr/bin/env python3

"""
API server for Clera AI chat.
This provides a simple API to interact with the graph.py implementation.
"""

import os
import sys
import json
import logging
from typing import List, Dict, Any, Optional
import asyncio
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("clera-api-server")

# Add parent directory to path to find graph.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logger.info(f"Python path: {sys.path}")

try:
    # Import the graph from clera_agents
    from clera_agents.graph import graph
    logger.info("Successfully imported graph from clera_agents")
except ImportError as e:
    logger.error(f"Failed to import graph from clera_agents: {e}")
    logger.error("Please make sure the clera_agents module is in your Python path.")
    sys.exit(1)

# Create FastAPI app
app = FastAPI(
    title="Clera AI API",
    description="API for interacting with Clera AI",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define request model
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="Chat message history")
    user_input: str = Field(..., description="Latest user input")

# Define trade execution models
class TradeRequest(BaseModel):
    account_id: str = Field(..., description="Account ID for the trade")
    ticker: str = Field(..., description="Stock ticker symbol")
    notional_amount: float = Field(..., description="Dollar amount to trade")
    side: str = Field(..., description="BUY or SELL")

class CompanyInfoRequest(BaseModel):
    ticker: str = Field(..., description="Stock ticker symbol")

# Track conversation states by session ID
conversation_states = {}

# Import trade execution functionality
try:
    from clera_agents.trade_execution_agent import _submit_market_order, OrderSide
    from clera_agents.tools.company_analysis import company_profile
    logger.info("Successfully imported trade execution and company analysis modules")
except ImportError as e:
    logger.error(f"Failed to import trade modules: {e}")
    logger.error("Trade functionality will not be available.")

@app.post("/api/trade")
async def execute_trade(request: TradeRequest):
    """Execute a market order trade."""
    try:
        # Log the request
        logger.info(f"Received trade request: {request}")
        
        # Validate the side
        if request.side.upper() not in ["BUY", "SELL"]:
            raise HTTPException(status_code=400, detail="Side must be either BUY or SELL")
        
        # Determine order side
        order_side = OrderSide.BUY if request.side.upper() == "BUY" else OrderSide.SELL
        
        # Execute the trade
        result = _submit_market_order(
            account_id=request.account_id, 
            ticker=request.ticker, 
            notional_amount=request.notional_amount, 
            side=order_side
        )
        
        return JSONResponse({
            "success": True,
            "message": result
        })
    except Exception as e:
        logger.error(f"Error executing trade: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error executing trade: {str(e)}"
        }, status_code=500)

@app.get("/api/company/{ticker}")
async def get_company_info(ticker: str):
    """Get company information by ticker symbol."""
    try:
        # Log the request
        logger.info(f"Received company info request for ticker: {ticker}")
        
        # Get company profile
        profile_data = company_profile(ticker.upper())
        
        if not profile_data:
            return JSONResponse({
                "success": False,
                "message": f"No data found for ticker: {ticker}"
            }, status_code=404)
        
        # Return formatted company info
        return JSONResponse({
            "success": True,
            "data": profile_data[0]
        })
    except Exception as e:
        logger.error(f"Error getting company info: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error retrieving company information: {str(e)}"
        }, status_code=500)

@app.post("/api/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    """Process a chat request."""
    try:
        # Log the request
        logger.info(f"Received chat request: {request}")
        
        # Create a unique session ID if not provided
        session_id = f"session-{datetime.now().timestamp()}"
        logger.info(f"Using session ID: {session_id}")
        
        # Get existing state or create a new one
        state = conversation_states.get(session_id, {
            "messages": [],
            "next_step": "supervisor",
            "current_agent": "supervisor",
            "agent_scratchpad": [],
            "retrieved_context": [],
            "last_user_input": "",
            "answered_user": False,
            "is_last_step": False,
            "remaining_steps": 5,
        })
        
        # Update state with new user input
        state["last_user_input"] = request.user_input
        state["answered_user"] = False
        
        # Convert messages to the format expected by graph
        formatted_messages = []
        for msg in request.messages:
            if msg.role == "system":
                formatted_messages.append({
                    "type": "system",
                    "content": msg.content,
                })
            elif msg.role == "user":
                formatted_messages.append({
                    "type": "human",
                    "content": msg.content,
                })
            elif msg.role == "ai" or msg.role == "assistant":
                formatted_messages.append({
                    "type": "ai",
                    "content": msg.content,
                })
        
        # Update state with messages
        state["messages"] = formatted_messages
        
        # Process with graph
        logger.info("Invoking graph...")
        result = graph.invoke(state)
        logger.info(f"Graph result type: {type(result)}")
        logger.info(f"Graph result keys: {result.keys() if isinstance(result, dict) else 'not a dict'}")
        
        # Extract response from result
        response = None
        
        # Log the full result in development mode for debugging
        if os.environ.get("ENVIRONMENT") == "development":
            logger.info(f"Full graph result: {json.dumps(result, default=str)}")
        
        if isinstance(result, dict):
            # Method 1: Try to find direct response field
            if "response" in result:
                response = result["response"]
                logger.info("Found direct response field")
            
            # Method 2: Check for messages in the result and extract the last AI message
            elif "messages" in result and isinstance(result["messages"], list):
                logger.info(f"Result has {len(result['messages'])} messages")
                # Loop through messages from the end to find the last assistant message
                for msg in reversed(result["messages"]):
                    # Try to identify the assistant/AI message
                    if isinstance(msg, dict):
                        msg_type = msg.get("type")
                        msg_role = msg.get("role")
                        
                        logger.info(f"Checking message with type: {msg_type}, role: {msg_role}")
                        
                        if msg_type in ["ai", "assistant"] or msg_role in ["ai", "assistant"]:
                            logger.info("Found AI/assistant message")
                            content = msg.get("content")
                            if content:
                                response = content
                                logger.info(f"Extracted response from message: {response[:100]}...")
                                break
                    # Handle LangChain message objects
                    elif hasattr(msg, "type") and hasattr(msg, "content"):
                        if msg.type in ["ai", "assistant"]:
                            logger.info("Found AI/assistant LangChain message")
                            response = msg.content
                            logger.info(f"Extracted response from LangChain message: {response[:100]}...")
                            break
            
            # Method 3: Check in the final output
            elif "output" in result and isinstance(result["output"], str):
                response = result["output"]
                logger.info("Found response in output field")
            
            # Method 4: Look for return_values in the LangSmith result format
            elif "return_values" in result and isinstance(result["return_values"], dict):
                ret_values = result["return_values"]
                if "output" in ret_values:
                    response = ret_values["output"]
                    logger.info("Found response in return_values.output")
                elif "messages" in ret_values:
                    # If return_values contains a messages field, try to extract the last AI message
                    messages = ret_values["messages"]
                    if isinstance(messages, list) and messages:
                        for msg in reversed(messages):
                            if hasattr(msg, "type") and hasattr(msg, "content") and msg.type in ["ai", "assistant"]:
                                response = msg.content
                                logger.info("Found response in return_values.messages")
                                break
                            elif isinstance(msg, dict) and (msg.get("type") in ["ai", "assistant"] or 
                                                            msg.get("role") in ["ai", "assistant"]):
                                response = msg.get("content")
                                logger.info("Found response in return_values.messages dict")
                                break
            
            # Method 5: Check if the result itself might be the message list
            elif any(isinstance(item, dict) and ("role" in item or "type" in item) for item in result.get("output", []) if isinstance(result.get("output"), list)):
                messages_list = result.get("output", [])
                # Look for the last AI message
                for msg in reversed(messages_list):
                    if isinstance(msg, dict) and (
                        msg.get("role") in ["ai", "assistant"] or 
                        msg.get("type") in ["ai", "assistant"]
                    ):
                        response = msg.get("content", "") or msg.get("text", "")
                        logger.info("Found response in output messages list")
                        break
        
        # Try to catch any other response format
        if not response and isinstance(result, dict):
            # Check all top-level string values as a last resort
            for key, value in result.items():
                if isinstance(value, str) and len(value) > 20:  # Assume longer strings might be responses
                    logger.info(f"Using string value from key '{key}' as response")
                    response = value
                    break
        
        # Fallback if we couldn't extract a response
        if not response:
            logger.warning("Failed to extract AI response from result, using fallback")
            response = "I processed your request, but I'm having trouble formulating a response. Could you try rephrasing your question?"
        
        # Update conversation state
        conversation_states[session_id] = result if isinstance(result, dict) else state
        
        # Schedule cleanup of old sessions
        background_tasks.add_task(cleanup_old_sessions)
        
        # Return the response with more debugging info in development
        if os.environ.get("ENVIRONMENT") == "development":
            return JSONResponse({
                "session_id": session_id,
                "response": response,
                "debug_info": {
                    "result_type": str(type(result)),
                    "result_keys": list(result.keys()) if isinstance(result, dict) else [],
                    "messages_count": len(result.get("messages", [])) if isinstance(result, dict) else 0,
                }
            })
        else:
            return JSONResponse({
                "session_id": session_id,
                "response": response,
            })
    except Exception as e:
        logger.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

async def cleanup_old_sessions():
    """Clean up old conversation sessions."""
    # In a production environment, you would want to clean up old sessions
    # to prevent memory leaks. For simplicity, we're keeping this as a stub.
    pass

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    os.environ["ENVIRONMENT"] = "development"
    # Run the server
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
