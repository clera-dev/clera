"""
Utility for interacting with LangGraph Cloud API.
This module provides functions to create threads, add messages, run threads,
and fetch thread history from a deployed LangGraph agent.
"""

import os
import json
import requests
import logging
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Dict, List, Any, Optional, Union
from dotenv import load_dotenv

# Configure logging
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# LangGraph API configuration
LANGGRAPH_API_URL = os.getenv("LANGGRAPH_API_URL")
LANGGRAPH_API_KEY = os.getenv("LANGGRAPH_API_KEY")

# --- Configure requests Session for robustness --- 

def create_session_with_retries(
    retries=3,
    backoff_factor=0.3,
    status_forcelist=(500, 502, 503, 504),
    session=None,
) -> requests.Session:
    session = session or requests.Session()
    retry_strategy = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        # Explicitly adding method_whitelist=False to retry on POST etc.
        # or specify methods: method_whitelist=frozenset(['HEAD', 'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'])
        allowed_methods=False 
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

# Global session object
langgraph_session = create_session_with_retries()
# ----------------------------------------------

def get_headers() -> Dict[str, str]:
    """
    Get the headers needed for LangGraph API requests.
    
    Returns:
        Dict[str, str]: Headers dictionary with API key and content type
    """
    # Content-Type is generally required for POST/PATCH, harmless for GET
    return {
        "x-api-key": LANGGRAPH_API_KEY,
        "Content-Type": "application/json" 
    }

def create_thread(metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Create a new thread in LangGraph Cloud.
    Args: metadata (Dict, optional): Metadata...
    Returns: Dict: Thread info...
    Raises: Exception: If fails...
    """
    url = f"{LANGGRAPH_API_URL}/threads"
    payload = {}
    if metadata:
        payload["metadata"] = metadata
    
    try:
        # Use the session object
        response = langgraph_session.post(url, headers=get_headers(), json=payload)
        response.raise_for_status()
        thread_data = response.json()
        logger.info(f"Created thread: {thread_data['thread_id']}")
        return thread_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error creating thread: {e}")
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response: {e.response.text}")
        raise Exception(f"Failed to create thread: {str(e)}")

def run_thread_wait(
    thread_id: str, 
    assistant_id: str, 
    input_data: Dict[str, Any],
    config: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create a run using /runs/wait.
    Args: ...
    Returns: Dict: Final output...
    Raises: Exception: If fails...
    """
    url = f"{LANGGRAPH_API_URL}/threads/{thread_id}/runs/wait"
    payload = {"assistant_id": assistant_id, "input": input_data}
    if config: payload["config"] = config
    if metadata: payload["metadata"] = metadata
        
    logger.info(f"Running thread {thread_id} with assistant/graph '{assistant_id}' using /runs/wait, payload keys: {list(payload.keys())}")
    
    try:
        # Use the session object
        response = langgraph_session.post(url, headers=get_headers(), json=payload)
        response.raise_for_status()
        final_output = response.json()
        logger.info(f"Completed run for thread {thread_id} via /runs/wait")
        return final_output
    except requests.exceptions.RequestException as e:
        logger.error(f"Error running thread {thread_id} via /runs/wait: {e}")
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response status: {e.response.status_code}, Response body: {e.response.text}")
        raise Exception(f"Failed to run thread and wait: {str(e)}")

def get_thread_messages(thread_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Get the history (checkpoints/states) for a thread.
    Args: ...
    Returns: List[Dict]: Checkpoints...
    Raises: Exception: If fails...
    """
    url = f"{LANGGRAPH_API_URL}/threads/{thread_id}/history?limit={limit}"
    logger.info(f"Getting history for thread {thread_id} with limit {limit}")
    
    try:
        # Use the session object
        response = langgraph_session.get(url, headers=get_headers())
        response.raise_for_status()
        history_data = response.json()
        logger.info(f"Retrieved {len(history_data)} history items for thread {thread_id}")
        return history_data
    except requests.exceptions.RequestException as e:
        # Log the specific error more clearly
        error_message = f"Error getting history for thread {thread_id}: {e}"
        if isinstance(e, requests.exceptions.SSLError):
            error_message += " (SSL Error)"
        elif isinstance(e, requests.exceptions.ConnectionError):
             error_message += " (Connection Error)"
        logger.error(error_message)
        
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response status: {e.response.status_code}, Response body: {e.response.text}")
            # Check if body is empty or non-JSON before logging text
            try:
                 response_body = e.response.text
            except Exception:
                 response_body = "<Failed to read response body>"
            logger.error(f"Response status: {e.response.status_code}, Response body: {response_body}")
        else:
            logger.error("No response object available in exception.")
            
        # Re-raise a more specific exception if possible, otherwise generic
        raise Exception(f"Failed to get thread history: {str(e)}")

def get_thread(thread_id: str) -> Dict[str, Any]:
    """
    Get thread information.
    Args: ...
    Returns: Dict: Thread info...
    Raises: Exception: If fails...
    """
    url = f"{LANGGRAPH_API_URL}/threads/{thread_id}"
    try:
        # Use the session object
        response = langgraph_session.get(url, headers=get_headers())
        response.raise_for_status()
        thread_data = response.json()
        logger.info(f"Retrieved thread {thread_id}")
        return thread_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error getting thread {thread_id}: {e}")
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response: {e.response.text}")
        raise Exception(f"Failed to get thread: {str(e)}")

def list_threads(limit: int = 20, metadata_filter: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    List available threads using /threads/search.
    Args: ...
    Returns: List[Dict]: Threads...
    Raises: Exception: If fails...
    """
    url = f"{LANGGRAPH_API_URL}/threads/search"
    payload = {"limit": limit}
    if metadata_filter: payload["metadata"] = metadata_filter
    logger.info(f"Listing threads with payload: {payload}")

    try:
        # Use the session object
        response = langgraph_session.post(url, headers=get_headers(), json=payload)
        response.raise_for_status()
        threads_data = response.json()
        logger.info(f"Retrieved {len(threads_data)} threads via search")
        return threads_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error listing threads via search: {e}")
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response status: {e.response.status_code}, Response body: {e.response.text}")
        raise Exception(f"Failed to list threads: {str(e)}")

def update_thread_metadata(thread_id: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update thread metadata using PATCH.
    Args: ...
    Returns: Dict: Updated thread...
    Raises: Exception: If fails...
    """
    url = f"{LANGGRAPH_API_URL}/threads/{thread_id}"
    headers = get_headers()
    masked_headers = {k: (f"{v[:5]}...{v[-4:]}" if k == 'x-api-key' and v and len(v) > 9 else v) for k, v in headers.items()}
    logger.info(f"Attempting PATCH to {url} with headers: {masked_headers}")
    payload = {"metadata": metadata}

    try:
        # Use the session object
        response = langgraph_session.patch(url, headers=headers, json=payload)
        response.raise_for_status()
        updated_thread_data = response.json()
        logger.info(f"Successfully updated metadata for thread {thread_id}")
        return updated_thread_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error updating metadata for thread {thread_id}: {e}")
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response status: {e.response.status_code}, Response body: {e.response.text}")
        raise Exception(f"Failed to update thread metadata: {str(e)}") 


# Note: run_thread_stream needs careful handling with sessions and streaming.
# Using the global session might be okay, but keep an eye on potential issues
# if many streams are run concurrently or if sessions behave unexpectedly with streaming.
async def run_thread_stream(
    thread_id: str,
    assistant_id: str,
    input_data: Optional[Dict[str, Any]] = None,
    resume_command: Optional[Any] = None,
    config: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    callback: Optional[callable] = None
):
    """
    Stream events using /runs/stream. Handles initial and resume runs.
    Args: ...
    Yields: str: Raw SSE chunks...
    Raises: Exception: If fails...
    """
    url = f"{LANGGRAPH_API_URL}/threads/{thread_id}/runs/stream"
    headers = get_headers()
    headers["Accept"] = "text/event-stream"

    payload = {
        "assistant_id": assistant_id,
        "stream_mode": ["messages", "events", "custom"] # Requesting messages, events, and custom updates
    }
    
    if resume_command is not None:
        payload["command"] = {"resume": resume_command}
        run_type = "resume"
        log_input_desc = f"resume command: {type(resume_command)}"
    elif input_data is not None:
        payload["input"] = input_data
        run_type = "initial"
        log_input_desc = f"input keys: {list(input_data.keys())}"
    else:
         raise ValueError("Either input_data or resume_command must be provided")
    
    if config: payload["config"] = config
    if metadata: payload["metadata"] = metadata

    logger.info(f"Starting {run_type} stream for thread {thread_id} with assistant/graph '{assistant_id}'. Details: {log_input_desc}")

    lines_yielded = 0
    try:
        response = langgraph_session.post(
            url, 
            headers=headers, 
            json=payload, 
            stream=True
        )
        response.raise_for_status()
        
        logger.info(f"SSE stream connection established for thread {thread_id}.")
        
        for line in response.iter_lines(decode_unicode=True):
             # Strip whitespace from the line before processing
             clean_line = line.strip()
             if clean_line:
                 logger.debug(f"Raw SSE line received for {thread_id}: {clean_line}") 
                 
                 # Check for potential error events specifically
                 if clean_line.startswith("event: error"):
                     logger.error(f"Explicit error event received in stream for {thread_id}: {clean_line}")
                 # Check for data that might indicate an issue
                 if clean_line.startswith("data:"):
                     try:
                         # Process based on the cleaned line
                         data_content = json.loads(clean_line[len("data:"):].strip())
                         if isinstance(data_content, dict) and data_content.get("event") == "error":
                            logger.error(f"Parsed error event data for {thread_id}: {data_content}")
                     except json.JSONDecodeError:
                         logger.warning(f"Failed to parse JSON data for line: {clean_line}", exc_info=True)
                         pass # Ignore if data is not valid JSON
                         
                 # Format the line as a proper SSE chunk
                 sse_chunk = f"{line}\n\n"
                 
                 # Call the callback with the chunk if provided
                 if callback:
                     await callback(sse_chunk)
                     
                 # Yield the original line + standard SSE termination 
                 yield sse_chunk
                 lines_yielded += 1
             # else: # Log stripped empty lines if needed
             #    logger.debug(f"Empty line received (keep-alive) for {thread_id}")
                 
        logger.info(f"SSE stream finished for thread {thread_id}. Total lines yielded: {lines_yielded}")
        if lines_yielded == 0:
             logger.warning(f"Stream for thread {thread_id} finished immediately without yielding any data lines. Potential agent error?")

    except requests.exceptions.RequestException as e:
        logger.error(f"Error during streaming connection for thread {thread_id}: {e}")
        if hasattr(e, 'response') and e.response:
            try:
                 error_body = e.response.text
                 logger.error(f"Response status: {e.response.status_code}, Response body: {error_body}")
                 raise Exception(f"Failed to stream run ({e.response.status_code}): {error_body}") from e
            except Exception as read_err:
                 logger.error(f"Response status: {e.response.status_code}, Failed to read error body: {read_err}")
                 raise Exception(f"Failed to stream run ({e.response.status_code}): {str(e)}") from e
        else:
             raise Exception(f"Failed to stream run: {str(e)}") from e
    except Exception as e:
         logger.error(f"Unexpected error during stream processing for thread {thread_id}: {e}", exc_info=True)
         raise

# --- format_messages_for_frontend remains unchanged --- 
def format_messages_for_frontend(history: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """
    Format thread history (checkpoints) into a sequence of messages for the frontend.
    Extracts messages from the 'values' field within each history checkpoint,
    using message IDs for deduplication and handling various message types.
    
    Args:
        history (List[Dict]): List of checkpoints from LangGraph thread history.
    
    Returns:
        List[Dict]: Formatted messages for frontend [{"role": ..., "content": ...}]
    """
    processed_messages = []
    seen_message_ids = set()

    # Iterate through checkpoints in chronological order (history is newest first)
    for checkpoint in reversed(history):
        values = checkpoint.get("values")
        if not values:
            continue

        # Find the messages list within the state values.
        messages_key = 'messages' # Adjust if your graph stores messages differently
        checkpoint_messages = values.get(messages_key)

        if not isinstance(checkpoint_messages, list):
            continue
            
        for msg in checkpoint_messages:
            msg_id = None
            msg_type = None
            content = None
            role = None
            tool_calls = []

            # --- Extract common fields --- 
            if isinstance(msg, dict):
                msg_id = msg.get("id")
                msg_type = msg.get("type")
                content = msg.get("content")
                tool_calls = msg.get("tool_calls", [])
            elif hasattr(msg, 'id') and hasattr(msg, 'type') and hasattr(msg, 'content'): # Handle BaseMessage objects
                msg_id = msg.id
                msg_type = msg.type
                content = msg.content
                tool_calls = getattr(msg, 'tool_calls', []) # Get tool calls if they exist
            else:
                logger.warning(f"Skipping unrecognized message format: {type(msg)}")
                continue
            
            # --- Skip if already processed --- 
            if not msg_id or msg_id in seen_message_ids:
                continue
                
            # --- Determine Role and Filter/Format Content --- 
            if msg_type == "human":
                role = "user"
            elif msg_type in ["ai", "assistant"]:
                role = "assistant"
                # If content is empty but there are tool calls, maybe skip or format differently?
                # For now, we'll show the content even if it's empty alongside tool calls.
                # We will filter out the raw tool call representation below.
                if not content and tool_calls:
                     # Option 1: Skip this message entirely if it ONLY contains tool calls
                     # continue 
                     # Option 2: Provide placeholder text
                     # content = "[Assistant is using a tool...]"
                     # Option 3: Just use the (potentially empty) content - current behavior
                     pass 
            elif msg_type == "system":
                # Usually skip system messages for display
                continue 
            elif msg_type == "tool":
                # Skip tool results for display
                continue
            else:
                 logger.warning(f"Skipping message with unhandled type '{msg_type}': {msg_id}")
                 continue
                 
            # --- Final Content Check --- 
            # Ensure content is a string, handle None
            final_content = str(content) if content is not None else "" 
            
            # Avoid showing raw function/tool call syntax if it bled into content
            if final_content.startswith("<function=") or final_content.startswith("<tool_code>"):
                 logger.warning(f"Skipping message content that looks like raw tool call: {msg_id}")
                 # Decide: skip message entirely or show placeholder?
                 # continue # Option to skip
                 final_content = "[Assistant performed an action]" # Option for placeholder
                 
            # --- Add to list --- 
            if role:
                 processed_messages.append({
                    "role": role,
                    "content": final_content
                 })
                 seen_message_ids.add(msg_id)
            
    logger.info(f"Formatted {len(processed_messages)} messages for frontend from history using ID deduplication.")
    return processed_messages 