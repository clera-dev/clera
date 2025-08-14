"""
Tool Events API - REST endpoints for tool activity persistence.

Provides HTTP endpoints for the frontend streaming service to persist
tool lifecycle events during LangGraph execution.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Literal, Optional
import logging

from utils.tool_event_store import (
    ToolEventStore, 
    StartRunParams, 
    FinalizeRunParams, 
    UpsertToolStartParams, 
    UpsertToolCompleteParams
)
from utils.authentication import get_authenticated_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tool-events", tags=["tool-events"])

class ToolEventRequest(BaseModel):
    """Base request model for tool event operations."""
    action: Literal['start_run', 'finalize_run', 'upsert_tool_start', 'upsert_tool_complete', 'cleanup_orphaned']
    params: Optional[dict] = None

class ToolEventResponse(BaseModel):
    """Response model for tool event operations."""
    success: bool
    message: str
    data: Optional[dict] = None

@router.post("/", response_model=ToolEventResponse)
async def handle_tool_event(
    request: ToolEventRequest,
    user_id: str = Depends(get_authenticated_user_id)
) -> ToolEventResponse:
    """
    Handle tool event persistence operations.
    
    Accepts different action types and routes to appropriate ToolEventStore methods.
    Requires authentication to prevent unauthorized database writes.
    """
    try:
        if request.action == 'start_run':
            if not request.params:
                raise HTTPException(status_code=400, detail="params required for start_run")
            
            params = StartRunParams(**request.params)
            # Validate user owns this run by checking user_id matches
            if params.user_id != user_id:
                raise HTTPException(status_code=403, detail="Access denied")
            
            success = ToolEventStore.start_run(params)
            return ToolEventResponse(
                success=success,
                message="Run started successfully" if success else "Failed to start run"
            )
        
        elif request.action == 'finalize_run':
            if not request.params:
                raise HTTPException(status_code=400, detail="params required for finalize_run")
            
            params = FinalizeRunParams(**request.params)
            success = ToolEventStore.finalize_run(params)
            return ToolEventResponse(
                success=success,
                message="Run finalized successfully" if success else "Failed to finalize run"
            )
        
        elif request.action == 'upsert_tool_start':
            if not request.params:
                raise HTTPException(status_code=400, detail="params required for upsert_tool_start")
            
            params = UpsertToolStartParams(**request.params)
            success = ToolEventStore.upsert_tool_start(params)
            return ToolEventResponse(
                success=success,
                message="Tool start recorded successfully" if success else "Failed to record tool start"
            )
        
        elif request.action == 'upsert_tool_complete':
            if not request.params:
                raise HTTPException(status_code=400, detail="params required for upsert_tool_complete")
            
            params = UpsertToolCompleteParams(**request.params)
            success = ToolEventStore.upsert_tool_complete(params)
            return ToolEventResponse(
                success=success,
                message="Tool completion recorded successfully" if success else "Failed to record tool completion"
            )
        
        elif request.action == 'cleanup_orphaned':
            # Admin-only operation, no params needed
            count = ToolEventStore.cleanup_orphaned_tool_calls()
            success = count >= 0
            return ToolEventResponse(
                success=success,
                message=f"Cleaned up {count} orphaned tool calls" if success else "Failed to cleanup orphaned tool calls",
                data={"cleaned_count": count} if success else None
            )
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {request.action}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error handling tool event {request.action}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint for tool events service."""
    return {"status": "healthy", "service": "tool-events"}
