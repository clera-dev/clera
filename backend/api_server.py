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

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends, Header
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


if __name__ == "__main__":
    import uvicorn
    os.environ["ENVIRONMENT"] = "development"
    # Run the server
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
