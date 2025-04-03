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
from enum import Enum
import asyncio
from datetime import datetime
from dotenv import load_dotenv
import uuid
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from langgraph.errors import GraphInterrupt
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage, FunctionMessage

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

class ChatWithAccountRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="Chat message history")
    user_input: str = Field(..., description="Latest user input")
    account_id: str = Field(..., description="User's Alpaca account ID")
    user_id: Optional[str] = Field(None, description="User's Supabase ID")
    session_id: Optional[str] = Field(None, description="Chat session ID")

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

# Import Alpaca broker client
from alpaca.broker import BrokerClient
from alpaca.broker.models import (
    Contact,
    Identity,
    Disclosures,
    Agreement
)
from alpaca.broker.requests import CreateAccountRequest
from alpaca.broker.enums import TaxIdType, FundingSource, AgreementType

# Initialize Alpaca broker client
broker_client = BrokerClient(
    api_key=os.getenv("BROKER_API_KEY"),
    secret_key=os.getenv("BROKER_SECRET_KEY"),
    sandbox=True  # Set to False for production
)

def get_broker_client():
    """Get an instance of the Alpaca broker client with API keys from environment."""
    return BrokerClient(
        api_key=os.getenv("BROKER_API_KEY"),
        secret_key=os.getenv("BROKER_SECRET_KEY"),
        sandbox=True  # Set to False for production
    )

# Import our Alpaca utilities
from utils.alpaca import (
    create_or_get_alpaca_account, 
    create_direct_plaid_link_url,
    get_transfers_for_account,
    get_account_details
)

# For ACH transfers
from utils.alpaca.bank_funding import create_ach_transfer, create_ach_relationship_manual

# Import Supabase conversation and chat session utilities
from utils.supabase import (
    save_conversation,
    get_user_conversations,
    get_portfolio_conversations,
    create_chat_session,
    get_chat_sessions,
    get_conversations_by_session,
    delete_chat_session,
    save_conversation_with_session,
    get_user_alpaca_account_id
)

# Import LangGraph client utilities
from utils.langgraph_client import (
    create_thread, 
    run_thread_stream,
    get_thread_messages,
    list_threads,
    format_messages_for_frontend,
    update_thread_metadata
)

# -----------------------------------------------------
# NOTE: Several LangGraph-related endpoints have been removed from this file
# as they are now handled directly by the frontend using the LangGraph JS/TS SDK.
#
# Operations now handled directly by the frontend in chat-client.ts:
# - Thread Creation: client.threads.create()
# - Thread Listing: client.threads.search()
# - Thread Deletion: client.threads.delete()
# - Thread Metadata Updates: client.threads.patchState()
# - Thread Message Retrieval: client.threads.getState()
#
# This approach reduces API call overhead and simplifies the backend.
# See frontend-app/utils/api/chat-client.ts for implementation.
# For details, refer to docs/chat-integration-notes.md
# -----------------------------------------------------

# API key authentication
def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != os.getenv("BACKEND_API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key

# Models
class FundingSourceEnum(str, Enum):
    EMPLOYMENT_INCOME = "employment_income"
    INVESTMENTS = "investments"
    INHERITANCE = "inheritance"
    BUSINESS_INCOME = "business_income"
    SAVINGS = "savings"
    FAMILY = "family"

class ContactModel(BaseModel):
    email_address: str
    phone_number: str
    street_address: List[str]
    city: str
    state: str
    postal_code: str
    country: str

class IdentityModel(BaseModel):
    given_name: str
    family_name: str
    date_of_birth: str
    tax_id_type: str
    tax_id: str
    country_of_citizenship: str
    country_of_birth: str
    country_of_tax_residence: str
    funding_source: List[str]
    middle_name: Optional[str] = None

class DisclosuresModel(BaseModel):
    is_control_person: bool
    is_affiliated_exchange_or_finra: bool
    is_politically_exposed: bool
    immediate_family_exposed: bool

class AgreementModel(BaseModel):
    agreement: str
    signed_at: str
    ip_address: str

class AlpacaAccountRequest(BaseModel):
    userId: str
    alpacaData: Dict[str, Any]

class AlpacaAccountResponse(BaseModel):
    id: str
    account_number: str
    status: str
    created_at: str

class ACHRelationshipRequest(BaseModel):
    accountId: str
    email: str
    redirectUri: Optional[str] = None

class ACHRelationshipResponse(BaseModel):
    linkToken: str
    linkUrl: str

class PlaidTokenRequest(BaseModel):
    public_token: str
    account_id: str

# Manual bank connection models
class ManualACHRelationshipRequest(BaseModel):
    accountId: str
    accountOwnerName: str
    bankAccountType: str
    bankAccountNumber: str
    bankRoutingNumber: str

class ACHTransferRequest(BaseModel):
    accountId: str
    relationshipId: str
    amount: str

# Add new conversation models
class SaveConversationRequest(BaseModel):
    user_id: str
    portfolio_id: str
    message: str
    response: str

class GetConversationsRequest(BaseModel):
    user_id: str
    portfolio_id: Optional[str] = None
    limit: Optional[int] = 50

# Add new chat session models
class CreateSessionRequest(BaseModel):
    user_id: str
    portfolio_id: str
    title: str

class GetSessionsRequest(BaseModel):
    user_id: str
    portfolio_id: Optional[str] = None

class GetSessionConversationsRequest(BaseModel):
    user_id: str
    session_id: str

class SaveConversationWithSessionRequest(BaseModel):
    user_id: str
    portfolio_id: str
    message: str
    response: str
    session_id: str

# --- Resume Chat Endpoint Request Model ---
class ResumeChatRequest(BaseModel):
    session_id: str = Field(..., description="The session ID of the interrupted conversation")
    user_confirmation: str = Field(..., description="User's confirmation ('yes' or 'no')")
# -----------------------------------------

# Add model for updating title
class UpdateThreadTitleRequest(BaseModel):
    thread_id: str = Field(..., description="The ID of the thread to update")
    title: str = Field(..., description="The new title for the thread")

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

@app.post("/api/chat-stream")
async def chat_stream(
    request: ChatWithAccountRequest, # Reuse existing model
    api_key: str = Depends(verify_api_key)
):
    """Process a chat request via SSE streaming."""
    try:
        thread_id = request.session_id # session_id from frontend IS the thread_id
        user_id = request.user_id
        account_id = request.account_id
        user_input = request.user_input
        
        logger.info(f"Chat stream request: user_id={user_id}, account_id={account_id}, thread_id={thread_id}")

        if not user_id: # Account ID might be optional if not always needed by agents
             raise HTTPException(status_code=400, detail="User ID is required")
             
        graph_id_to_run = "agent" # Or determine dynamically if needed

        # --- Create Thread if necessary --- 
        if not thread_id:
            logger.info("No thread_id provided, creating new thread for stream.")
            try:
                # Make sure create_thread doesn't require account_id if it's sometimes optional
                metadata_payload = {"user_id": user_id}
                if account_id:
                    metadata_payload["account_id"] = account_id
                metadata_payload["title"] = f"Chat started {datetime.now().strftime('%Y-%m-%d %H:%M')}"

                # Assuming create_thread is synchronous or properly awaited if async
                thread_data = create_thread(metadata=metadata_payload) 
                
                thread_id = thread_data.get("thread_id")
                if not thread_id:
                    # Ensure create_thread actually returns a dict with 'thread_id'
                    raise Exception("Failed to get thread_id from new thread creation. Response: " + str(thread_data))
                logger.info(f"Created new thread {thread_id} for stream.")
            except Exception as create_err:
                logger.error(f"Failed to create thread for stream: {create_err}", exc_info=True)
                # Return JSON error as we can't stream yet
                return JSONResponse(
                    content={"error": f"Failed to start chat session: {str(create_err)}"}, 
                    status_code=500
                )
        else:
             # Optionally update metadata if thread exists (e.g., last active time)
             # update_thread_metadata(thread_id, {"last_active": datetime.now().isoformat()})
             logger.info(f"Using existing thread_id: {thread_id}")

        # --- Prepare Input & Config --- 
        # Construct the input based on what run_thread_stream expects.
        # Usually, it's the new message, but check its definition.
        # If it expects the full history, fetch it here. Let's assume it needs the new message only for now.
        run_input = {"messages": [HumanMessage(content=user_input).model_dump()]} 
        
        # Add account_id and user_id if the graph needs them in the input state
        run_input["account_id"] = account_id
        run_input["user_id"] = user_id 
        
        run_config = {"recursion_limit": 10} # Or appropriate limit

        # --- Define Generator for Streaming Response --- 
        async def event_generator():
            # Yield the thread_id first as a special event
            yield f"event: thread_id\\ndata: {json.dumps({'thread_id': thread_id})}\\n\\n"
            logger.info(f"Streaming response for thread {thread_id}")
            try:
                # Directly iterate over the async generator returned by run_thread_stream
                async for chunk in run_thread_stream(
                    thread_id=thread_id,
                    assistant_id=graph_id_to_run,
                    input_data=run_input, # Pass the prepared input
                    config=run_config
                ):
                    # run_thread_stream should yield raw SSE formatted strings
                    yield chunk 
                
                # Signal completion (optional)
                yield f"event: end\\ndata: {json.dumps({'status': 'completed'})}\\n\\n"
                logger.info(f"Finished streaming response for thread {thread_id}")

            except GraphInterrupt as interrupt_err:
                 logger.warning(f"GraphInterrupt occurred during stream for {thread_id}: {interrupt_err}")
                 # Need to send interrupt info back to client
                 interrupt_payload = {
                     "type": "interrupt", 
                     "message": str(interrupt_err), # Or format as needed
                     "session_id": thread_id # Provide thread_id for resume
                 }
                 yield f"event: interrupt\\ndata: {json.dumps(interrupt_payload)}\\n\\n"

            except Exception as stream_err:
                logger.error(f"Error during chat stream generation for {thread_id}: {stream_err}", exc_info=True)
                # Yield a custom error event
                error_payload = {"error": "Stream failed", "detail": str(stream_err)}
                yield f"event: error\\ndata: {json.dumps(error_payload)}\\n\\n"
        
        # --- Return Streaming Response --- 
        # Ensure necessary headers are set by StreamingResponse or manually add them
        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except HTTPException as http_exc:
        # If HTTPException happens before streaming starts, return JSON error
        logger.warning(f"HTTPException in chat_stream: {http_exc.detail}", exc_info=True)
        return JSONResponse(content={"error": http_exc.detail}, status_code=http_exc.status_code)
    except Exception as e:
        logger.error(f"Unhandled error in chat_stream endpoint: {e}", exc_info=True)
        return JSONResponse(content={"error": f"Internal server error: {str(e)}"}, status_code=500)

@app.post("/api/resume-chat-stream")
async def resume_chat_stream(
    request: ResumeChatRequest, # Reuse existing model
    api_key: str = Depends(verify_api_key)
):
    """Resume an interrupted graph execution via SSE streaming."""
    try:
        thread_id = request.session_id # session_id IS the thread_id
        user_confirmation = request.user_confirmation.lower().strip()
        logger.info(f"Resume stream request for thread_id: {thread_id} with confirmation: '{user_confirmation}'")

        if user_confirmation not in ["yes", "no"]:
            raise HTTPException(status_code=400, detail="Invalid confirmation. Must be 'yes' or 'no'.")

        if not thread_id:
             raise HTTPException(status_code=400, detail="Thread ID (session_id) is required")
             
        graph_id_to_run = "agent" # Or determine dynamically
        run_config = {"recursion_limit": 10} # Or appropriate limit

        # --- Define Generator for Streaming Response --- 
        async def event_generator():
            logger.info(f"Streaming resumed response for thread {thread_id}")
            try:
                # Directly iterate over the async generator returned by run_thread_stream
                async for chunk in run_thread_stream(
                    thread_id=thread_id,
                    assistant_id=graph_id_to_run,
                    resume_command=user_confirmation, # Pass confirmation here
                    config=run_config
                ):
                    # run_thread_stream should yield raw SSE formatted strings
                    yield chunk 

                # Signal completion (optional)
                yield f"event: end\\ndata: {json.dumps({'status': 'completed'})}\\n\\n"
                logger.info(f"Finished streaming resumed response for thread {thread_id}")

            except GraphInterrupt as interrupt_err:
                 # This probably shouldn't happen during a resume, but handle defensively
                 logger.warning(f"GraphInterrupt occurred during resume stream for {thread_id}: {interrupt_err}")
                 interrupt_payload = {
                     "type": "interrupt", 
                     "message": str(interrupt_err), 
                     "session_id": thread_id 
                 }
                 yield f"event: interrupt\\ndata: {json.dumps(interrupt_payload)}\\n\\n"

            except Exception as stream_err:
                logger.error(f"Error during resume stream generation for {thread_id}: {stream_err}", exc_info=True)
                error_payload = {"error": "Resume stream failed", "detail": str(stream_err)}
                yield f"event: error\\ndata: {json.dumps(error_payload)}\\n\\n"
        
        # --- Return Streaming Response --- 
        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except HTTPException as http_exc:
        logger.warning(f"HTTPException in resume_chat_stream: {http_exc.detail}", exc_info=True)
        return JSONResponse(content={"error": http_exc.detail}, status_code=http_exc.status_code)
    except Exception as e:
        logger.error(f"Unhandled error in resume_chat_stream endpoint: {e}", exc_info=True)
        return JSONResponse(content={"error": f"Internal server error: {str(e)}"}, status_code=500)

async def cleanup_old_sessions():
    """Clean up old conversation sessions."""
    # In a production environment, you would want to clean up old sessions
    # to prevent memory leaks. For simplicity, we're keeping this as a stub.
    pass

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

@app.post("/create-alpaca-account", response_model=AlpacaAccountResponse)
async def create_alpaca_account(
    request: AlpacaAccountRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        alpaca_data = request.alpacaData
        user_id = request.userId
        
        # Log the request data for debugging
        logger.info(f"Creating Alpaca account for user_id: {user_id}")
        logger.info(f"Request data: {alpaca_data}")
        
        # Use our utility function to create or get existing account
        try:
            account_details, is_new_account = create_or_get_alpaca_account(alpaca_data)
            
            if not is_new_account:
                logger.info(f"Found existing account for email {alpaca_data['contact']['email_address']}")
            else:
                logger.info(f"Successfully created new Alpaca account: {account_details}")
                
            # Return account information
            return {
                "id": account_details["id"],
                "account_number": account_details["account_number"],
                "status": account_details["status"],
                "created_at": account_details["created_at"]
            }
            
        except Exception as e:
            error_str = str(e)
            
            # Check for specific error codes from Alpaca
            if '"code":40910000' in error_str and 'email address already exists' in error_str:
                # This is a conflict error - account already exists but couldn't be looked up
                logger.info("Account with this email already exists in Alpaca but couldn't be looked up")
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "EMAIL_EXISTS",
                        "message": "An account with this email address already exists. Please use a different email address."
                    }
                )
            # Re-raise other exceptions
            raise
    
    except Exception as e:
        logger.error(f"Error creating Alpaca account: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create-ach-relationship-link", response_model=ACHRelationshipResponse)
async def create_ach_relationship_link(
    request: ACHRelationshipRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        alpaca_account_id = request.accountId
        user_email = request.email
        redirect_uri = request.redirectUri
        
        # Log the request data for debugging
        logger.info(f"Creating ACH relationship link for account_id: {alpaca_account_id}")
        logger.info(f"Using email: {user_email}")
        logger.info(f"Redirect URI: {redirect_uri}")
        
        # Create the Plaid Link URL using Alpaca's integrated Plaid flow
        try:
            link_data = create_direct_plaid_link_url(
                alpaca_account_id=alpaca_account_id,
                user_email=user_email,
                redirect_uri=redirect_uri
            )
            
            # Log success with truncated URL for debugging
            link_url = link_data.get("linkUrl", "")
            if link_url:
                logger.info(f"Successfully created Plaid link with URL preview: {link_url[:100]}...")
            else:
                logger.warning("Created Plaid link but URL is empty")
            
            # Return the link details
            return {
                "linkToken": link_data.get("linkToken", ""),
                "linkUrl": link_data.get("linkUrl", "")
            }
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error creating ACH relationship link: {error_str}")
            logger.error(f"Error details: {repr(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create ACH relationship link: {error_str}"
            )
    
    except Exception as e:
        logger.error(f"Error in create-ach-relationship-link endpoint: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/get-ach-relationships")
async def get_ach_relationships(
    request: dict,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        alpaca_account_id = request.get("accountId")
        
        if not alpaca_account_id:
            raise HTTPException(status_code=400, detail="Account ID is required")
        
        # Log the request
        logger.info(f"Getting ACH relationships for account ID: {alpaca_account_id}")
        
        # Get ACH relationships from Alpaca
        broker_client = get_broker_client()
        try:
            relationships = broker_client.get_ach_relationships_for_account(account_id=alpaca_account_id)
            
            # Convert relationships to a serializable format
            serialized_relationships = []
            for rel in relationships:
                serialized_relationships.append({
                    "id": rel.id,
                    "status": rel.status,
                    "account_id": rel.account_id,
                    "created_at": rel.created_at,
                    "bank_name": getattr(rel, "bank_name", None),
                    "nickname": getattr(rel, "nickname", None)
                })
            
            return {"relationships": serialized_relationships}
        except AttributeError as e:
            # Fallback if the method doesn't exist - making a direct API request
            logger.warning(f"get_ach_relationships_for_account not found ({str(e)}), trying direct API request")
            try:
                # Try to access the underlying API client with a direct request
                if hasattr(broker_client, "_client"):
                    base_url = broker_client._client.base_url
                    api_key = broker_client._client.api_key
                    secret_key = broker_client._client.secret_key
                    
                    import requests
                    url = f"{base_url}/v1/accounts/{alpaca_account_id}/ach_relationships"
                    headers = {
                        "accept": "application/json",
                        "Apca-Api-Key-Id": api_key,
                        "Apca-Api-Secret-Key": secret_key
                    }
                    
                    response = requests.get(url, headers=headers)
                    
                    if response.status_code == 200:
                        relationships_data = response.json()
                        return {"relationships": relationships_data}
                
                # If we couldn't make a direct request, return empty array
                return {"relationships": []}
            except Exception as direct_api_error:
                logger.error(f"Direct API request failed: {str(direct_api_error)}")
                return {"relationships": []}
        
    except Exception as e:
        logger.error(f"Error in get_ach_relationships endpoint: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        # Return empty array instead of error for better UX with polling
        return {"relationships": []}

@app.post("/create-ach-relationship-manual")
async def create_manual_ach_relationship(
    request: ManualACHRelationshipRequest,
    x_api_key: str = Header(None)
):
    # Debug log the request
    logger.info(f"Received manual ACH relationship request: {request}")
    
    # Validate API key
    api_key_env = os.getenv("BACKEND_API_KEY")
    logger.info(f"Validating API key: received='{x_api_key[:3]}...' vs env='{api_key_env[:3] if api_key_env else None}...'")
    
    if x_api_key != api_key_env:
        logger.error("API key validation failed")
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Log the input parameters
        logger.info(f"Creating ACH relationship for account {request.accountId} with parameters: "
                    f"accountOwnerName={request.accountOwnerName}, "
                    f"bankAccountType={request.bankAccountType}, "
                    f"bankAccountNumber=XXXX{request.bankAccountNumber[-4:] if len(request.bankAccountNumber) >= 4 else 'INVALID'}, "
                    f"bankRoutingNumber={request.bankRoutingNumber}")
        
        # Verify Alpaca broker client is initialized properly
        broker_api_key = os.getenv("BROKER_API_KEY")
        broker_secret_key = os.getenv("BROKER_SECRET_KEY")
        if not broker_api_key or not broker_secret_key:
            logger.error("Alpaca API credentials missing")
            raise HTTPException(status_code=500, detail="Server configuration error: Missing Alpaca API credentials")
            
        # Create the ACH relationship
        ach_relationship = create_ach_relationship_manual(
            account_id=request.accountId,
            account_owner_name=request.accountOwnerName,
            bank_account_type=request.bankAccountType,
            bank_account_number=request.bankAccountNumber,
            bank_routing_number=request.bankRoutingNumber
        )
        
        # Log success
        logger.info(f"Successfully created ACH relationship {ach_relationship.id} with status {ach_relationship.status}")
        
        # Return the relationship details
        return {
            "id": ach_relationship.id,
            "status": ach_relationship.status
        }
    except Exception as e:
        logger.error(f"Error creating ACH relationship: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/initiate-ach-transfer")
async def initiate_ach_transfer(
    request: ACHTransferRequest,
    x_api_key: str = Header(None)
):
    # Validate API key
    if x_api_key != os.getenv("BACKEND_API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Create the ACH transfer
        transfer = create_ach_transfer(
            account_id=request.accountId,
            relationship_id=request.relationshipId,
            amount=request.amount
        )
        
        # Return the transfer details
        return {
            "id": transfer.id,
            "status": transfer.status,
            "amount": transfer.amount
        }
    except Exception as e:
        logger.error(f"Error creating ACH transfer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-plaid-token")
async def process_plaid_token(
    request: PlaidTokenRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        # Extract data from request
        public_token = request.public_token
        alpaca_account_id = request.account_id
        
        # Log the request
        logger.info(f"Processing Plaid token for account ID: {alpaca_account_id}")
        
        try:
            # Import necessary functions
            from utils.alpaca.bank_funding import (
                exchange_public_token_for_access_token,
                create_processor_token,
                get_plaid_client
            )
            from utils.alpaca.manual_bank_funding import create_ach_relationship_manual
            
            # Step 1: Exchange public token for access token
            access_token = exchange_public_token_for_access_token(public_token)
            logger.info("Successfully exchanged public token for access token")
            
            # Step 2: Get account ID from Plaid (for sandbox mode, we'll get the first account)
            plaid_client = get_plaid_client()
            try:
                # Get accounts linked to this item
                accounts_response = plaid_client.accounts_get(access_token)
                plaid_accounts = accounts_response.get('accounts', [])
                
                if not plaid_accounts:
                    raise ValueError("No accounts found for this Plaid item")
                
                # Use the first account by default, in production you'd let the user choose
                plaid_account_id = plaid_accounts[0].get('account_id')
                logger.info(f"Using Plaid account ID: {plaid_account_id}")
                
                if not plaid_account_id:
                    raise ValueError("No account ID found in Plaid accounts response")
            except Exception as e:
                logger.warning(f"Error getting Plaid accounts, using fallback: {str(e)}")
                # Fallback for sandbox environment
                plaid_account_id = "vzeNDwK7KQIm4yEog683uElbp9GRLEFXGK98D"
            
            # Step 3: Create processor token for Alpaca
            processor_token = create_processor_token(access_token, plaid_account_id)
            logger.info("Successfully created processor token for Alpaca")
            
            # Step 4: Create ACH relationship in Alpaca
            relationship = create_ach_relationship_manual(alpaca_account_id, processor_token)
            logger.info(f"Successfully created ACH relationship in Alpaca: {relationship}")
            
            # Return the relationship details
            return {
                "success": True,
                "relationship": relationship
            }
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error processing Plaid token: {error_str}")
            logger.error(f"Error details: {repr(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process Plaid token: {error_str}"
            )
    
    except Exception as e:
        logger.error(f"Error in process-plaid-token endpoint: {str(e)}")
        logger.error(f"Error details: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-ach-relationships/{account_id}")
async def get_ach_relationships_for_account(
    account_id: str,
    x_api_key: str = Header(None)
):
    # Validate API key
    api_key_env = os.getenv("BACKEND_API_KEY")
    if x_api_key != api_key_env:
        logger.error("API key validation failed")
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Get a broker client instance
        client = get_broker_client()
        
        # Get the ACH relationships
        relationships = get_ach_relationships(account_id, broker_client=client)
        
        # Return the relationships
        return {
            "relationships": relationships
        }
    except Exception as e:
        logger.error(f"Error getting ACH relationships: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/get-account-info/{account_id}")
async def get_account_info(
    account_id: str,
    x_api_key: str = Header(None)
):
    """
    Get the account information including cash balance from Alpaca.
    """
    # Validate API key
    api_key_env = os.getenv("BACKEND_API_KEY")
    if x_api_key != api_key_env:
        logger.error("API key validation failed")
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        # Get a broker client instance
        client = get_broker_client()
        
        # Get account details to get latest cash balance
        account_details = get_account_details(account_id, broker_client=client)
        
        # Get the transfers to calculate total funded amount
        transfers = get_transfers_for_account(account_id, broker_client=client)
        
        # Calculate total successful deposits
        total_funded = 0.0
        for transfer in transfers:
            if transfer.status == "COMPLETE" and transfer.direction == "INCOMING":
                total_funded += float(transfer.amount)
        
        # Extract cash balance - In Broker API, it's in last_equity field
        # The structure might be a dictionary or an object with attributes
        current_cash = 0.0
        
        if hasattr(account_details, 'last_equity'):
            # If it's an object with attributes
            current_cash = float(account_details.last_equity or 0)
        elif isinstance(account_details, dict) and 'last_equity' in account_details:
            # If it's a dictionary
            current_cash = float(account_details['last_equity'] or 0)
        elif hasattr(account_details, 'cash'):
            # Fallback to cash field if available
            current_cash = float(account_details.cash or 0)
        elif isinstance(account_details, dict) and 'cash' in account_details:
            # If it's a dictionary
            current_cash = float(account_details['cash'] or 0)
        
        logger.info(f"Account {account_id} current cash: {current_cash}, total funded: {total_funded}")
        
        return {
            "total_funded": total_funded,
            "current_balance": current_cash,
            "currency": "USD"
        }
    except Exception as e:
        logger.error(f"Error getting account info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/save-conversation")
async def save_chat_conversation(
    request: SaveConversationRequest,
    api_key: str = Depends(verify_api_key)
):
    """Save a chat conversation to the database."""
    try:
        # Log the request
        logger.info(f"Saving conversation for user {request.user_id}")
        
        # Save the conversation
        result = save_conversation(
            user_id=request.user_id,
            portfolio_id=request.portfolio_id,
            message=request.message,
            response=request.response
        )
        
        if not result:
            return JSONResponse({
                "success": False,
                "message": "Failed to save conversation"
            }, status_code=500)
        
        return JSONResponse({
            "success": True,
            "message": "Conversation saved successfully",
            "data": result
        })
    
    except Exception as e:
        logger.error(f"Error saving conversation: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error saving conversation: {str(e)}"
        }, status_code=500)

@app.post("/get-conversations")
async def get_chat_conversations(
    request: GetConversationsRequest,
    api_key: str = Depends(verify_api_key)
):
    """Get chat conversations for a user."""
    try:
        # Log the request
        logger.info(f"Getting conversations for user {request.user_id}")
        
        # Get the conversations
        if request.portfolio_id:
            # Get conversations for specific portfolio
            conversations = get_portfolio_conversations(
                user_id=request.user_id,
                portfolio_id=request.portfolio_id,
                limit=request.limit or 50
            )
        else:
            # Get all conversations for user
            conversations = get_user_conversations(
                user_id=request.user_id,
                limit=request.limit or 50
            )
        
        return JSONResponse({
            "success": True,
            "conversations": conversations
        })
    
    except Exception as e:
        logger.error(f"Error getting conversations: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error getting conversations: {str(e)}"
        }, status_code=500)

@app.post("/create-chat-session")
async def create_new_chat_session(
    request: CreateSessionRequest,
    api_key: str = Depends(verify_api_key)
):
    """Create a new chat session."""
    try:
        # Log the request
        logger.info(f"Creating chat session for user {request.user_id}")
        
        # Create the chat session
        session = create_chat_session(
            user_id=request.user_id,
            portfolio_id=request.portfolio_id,
            title=request.title
        )
        
        if not session:
            return JSONResponse({
                "success": False,
                "message": "Failed to create chat session"
            }, status_code=500)
        
        return JSONResponse({
            "success": True,
            "message": "Chat session created successfully",
            "session": session
        })
    
    except Exception as e:
        logger.error(f"Error creating chat session: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error creating chat session: {str(e)}"
        }, status_code=500)

@app.post("/get-chat-sessions")
async def get_user_chat_sessions(
    request: GetSessionsRequest,
    api_key: str = Depends(verify_api_key)
):
    """Get all chat sessions for a user."""
    try:
        # Log the request
        logger.info(f"Getting chat sessions for user {request.user_id}")
        
        # Get the chat sessions
        sessions = get_chat_sessions(
            user_id=request.user_id,
            portfolio_id=request.portfolio_id
        )
        
        # Process sessions into the expected format
        formatted_sessions = []
        for session in sessions:
            # Convert createdAt to ISO string
            created_at = session.get("created_at", "")
            
            formatted_sessions.append({
                "id": session.get("id", ""),
                "title": session.get("title", ""),
                "createdAt": created_at,
                "messages": []  # We'll populate this later if needed
            })
        
        return JSONResponse({
            "success": True,
            "sessions": formatted_sessions
        })
    
    except Exception as e:
        logger.error(f"Error getting chat sessions: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error getting chat sessions: {str(e)}"
        }, status_code=500)

@app.post("/get-session-conversations")
async def get_session_conversations(
    request: dict,
    api_key: str = Depends(verify_api_key)
):
    """Retrieve all conversations for a specific chat session."""
    try:
        session_id = request.get('session_id')
        user_id = request.get('user_id')
        
        if not session_id or not user_id:
            return JSONResponse({
                "success": False,
                "message": "Session ID and user ID are required",
                "messages": []
            }, status_code=400)
        
        logger.info(f"Getting conversations for session {session_id}, user {user_id}")
        
        # Connect to Supabase
        from utils.supabase.db_client import get_supabase_client, conversations_to_messages
        
        try:
            # Create Supabase client
            supabase = get_supabase_client()
            
            # Query the conversations table for this session and user
            response = supabase.table("conversations") \
                .select("message, response, created_at") \
                .eq("session_id", session_id) \
                .eq("user_id", user_id) \
                .order("created_at", desc=False) \
                .execute()
            
            # Check for errors
            if response.data is None and hasattr(response, 'error') and response.error:
                logger.error(f"Supabase error fetching conversations: {response.error}")
                return JSONResponse({
                    "success": False,
                    "message": f"Database error: {response.error.message}",
                    "messages": []
                }, status_code=500)
            
            # Convert database records to chat message format
            if response.data:
                chat_messages = conversations_to_messages(response.data)
                logger.info(f"Found {len(chat_messages)} messages for session {session_id}")
                return JSONResponse({
                    "success": True,
                    "messages": chat_messages
                })
            else:
                logger.info(f"No conversations found for session {session_id}")
                return JSONResponse({
                    "success": True,
                    "messages": []
                })
        except Exception as e:
            logger.error(f"Error fetching session conversations: {e}", exc_info=True)
            return JSONResponse({
                "success": False,
                "message": f"Error fetching session conversations: {str(e)}",
                "messages": []
            }, status_code=500)
    
    except Exception as e:
        logger.error(f"Error processing request: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error processing request: {str(e)}",
            "messages": []
        }, status_code=500)

@app.post("/save-conversation-with-session")
async def save_conversation_to_session(
    request: SaveConversationWithSessionRequest,
    api_key: str = Depends(verify_api_key)
):
    """Save a conversation to a specific chat session."""
    try:
        # Log the request
        logger.info(f"Saving conversation to session {request.session_id}")
        
        # Save the conversation
        conversation = save_conversation_with_session(
            user_id=request.user_id,
            portfolio_id=request.portfolio_id,
            message=request.message,
            response=request.response,
            session_id=request.session_id
        )
        
        if not conversation:
            return JSONResponse({
                "success": False,
                "message": "Failed to save conversation"
            }, status_code=500)
        
        return JSONResponse({
            "success": True,
            "message": "Conversation saved successfully",
            "conversation": conversation
        })
    
    except Exception as e:
        logger.error(f"Error saving conversation: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error saving conversation: {str(e)}"
        }, status_code=500)

@app.post("/count-session-messages")
async def count_session_messages(
    request: dict,
    api_key: str = Depends(verify_api_key)
):
    """Count the number of messages in a chat session."""
    try:
        # Log the request
        logger.info(f"Counting messages for session {request.get('session_id')}")
        
        session_id = request.get('session_id')
        user_id = request.get('user_id')
        
        if not session_id or not user_id:
            return JSONResponse({
                "success": False,
                "message": "Session ID and user ID are required",
                "count": 0
            }, status_code=400)
        
        # Connect to Supabase
        from utils.supabase.db_client import get_supabase_client
        
        try:
            # Create Supabase client
            supabase = get_supabase_client()
            
            # Count messages for this session
            response = supabase.table("conversations") \
                .select("*", count="exact") \
                .eq("session_id", session_id) \
                .eq("user_id", user_id) \
                .execute()
            
            # Extract the count
            count = response.count if hasattr(response, 'count') else 0
            
            return JSONResponse({
                "success": True,
                "count": count
            })
        except Exception as e:
            logger.error(f"Error counting session messages: {e}", exc_info=True)
            return JSONResponse({
                "success": False,
                "message": f"Error counting session messages: {str(e)}",
                "count": 0
            }, status_code=500)
    
    except Exception as e:
        logger.error(f"Error counting session messages: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error counting session messages: {str(e)}",
            "count": 0
        }, status_code=500)

@app.post("/update-chat-session-title")
async def update_chat_session_title(
    request: dict,
    api_key: str = Depends(verify_api_key)
):
    """Update the title of a chat session."""
    try:
        # Log the request
        logger.info(f"Updating title for session {request.get('session_id')}")
        
        session_id = request.get('session_id')
        title = request.get('title')
        user_id = request.get('user_id')
        
        if not session_id or not title or not user_id:
            return JSONResponse({
                "success": False,
                "message": "Session ID, title, and user ID are required"
            }, status_code=400)
        
        # Connect to Supabase
        from utils.supabase.db_client import get_supabase_client
        
        try:
            # Create Supabase client
            supabase = get_supabase_client()
            
            # Update the session title
            response = supabase.table("chat_sessions") \
                .update({"title": title}) \
                .eq("id", session_id) \
                .eq("user_id", user_id) \
                .execute()
            
            # Check if the update was successful
            if not response.data:
                return JSONResponse({
                    "success": False,
                    "message": "Failed to update chat session title"
                }, status_code=404)
            
            return JSONResponse({
                "success": True,
                "message": "Chat session title updated successfully"
            })
        except Exception as e:
            logger.error(f"Error updating chat session title: {e}", exc_info=True)
            return JSONResponse({
                "success": False,
                "message": f"Error updating chat session title: {str(e)}"
            }, status_code=500)
    
    except Exception as e:
        logger.error(f"Error updating chat session title: {e}", exc_info=True)
        return JSONResponse({
            "success": False,
            "message": f"Error updating chat session title: {str(e)}"
        }, status_code=500)

if __name__ == "__main__":
    import uvicorn
    os.environ["ENVIRONMENT"] = "development"
    # Run the server
    uvicorn.run(
        "api_server:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True, 
        log_level="info"
    )
