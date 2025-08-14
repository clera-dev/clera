"""
ToolEventStore - Production-grade persistence for chat run and tool call lifecycle events.

Provides server-side database operations for tracking tool activities during LangGraph streaming.
Uses service-role Supabase client for privileged database access.
"""

import os
import logging
from typing import Optional, Literal
from datetime import datetime, timezone
from supabase import create_client, Client
from pydantic import BaseModel

# Configure logging
logger = logging.getLogger(__name__)

ToolStatus = Literal['running', 'complete', 'error']

class StartRunParams(BaseModel):
    run_id: str
    thread_id: str
    user_id: str
    account_id: str

class FinalizeRunParams(BaseModel):
    run_id: str
    status: Literal['complete', 'error']

class UpsertToolStartParams(BaseModel):
    run_id: str
    tool_key: str
    tool_label: str
    agent: Optional[str] = None
    at: Optional[str] = None

class UpsertToolCompleteParams(BaseModel):
    run_id: str
    tool_key: str
    status: Literal['complete', 'error']
    at: Optional[str] = None

class ToolEventStore:
    """
    Handles persistence of chat run and tool call lifecycle events.
    Never throws to avoid interfering with streaming operations.
    """
    
    _client: Optional[Client] = None
    
    @classmethod
    def _get_client(cls) -> Optional[Client]:
        """Get or create Supabase client with service role access."""
        if cls._client is not None:
            return cls._client
            
        try:
            url = os.getenv("SUPABASE_URL")
            service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            
            if not url or not service_key:
                logger.error("Missing Supabase URL or service role key")
                return None
                
            cls._client = create_client(url, service_key)
            return cls._client
            
        except Exception as e:
            logger.error(f"Failed to create Supabase client: {e}")
            return None
    
    @staticmethod
    def _to_iso_or_now(timestamp: Optional[str] = None) -> str:
        """Safely convert timestamp to ISO string, defaulting to current time."""
        try:
            if timestamp:
                # Parse and validate timestamp
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                return dt.isoformat()
            return datetime.now(timezone.utc).isoformat()
        except (ValueError, AttributeError):
            return datetime.now(timezone.utc).isoformat()
    
    @classmethod
    def start_run(cls, params: StartRunParams) -> bool:
        """
        Start a new chat run record.
        
        Args:
            params: Run initialization parameters
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            client = cls._get_client()
            if not client:
                return False
                
            result = client.table('chat_runs').upsert({
                'id': params.run_id,
                'thread_id': params.thread_id,
                'user_id': params.user_id,
                'account_id': params.account_id,
                'status': 'running',
            }, on_conflict='id').execute()
            
            if result.data:
                logger.debug(f"Started run {params.run_id}")
                return True
            else:
                logger.error(f"Failed to start run {params.run_id}")
                return False
                
        except Exception as e:
            logger.error(f"Exception in start_run: {e}")
            return False
    
    @classmethod
    def finalize_run(cls, params: FinalizeRunParams) -> bool:
        """
        Finalize a chat run and update any remaining tool calls.
        
        Args:
            params: Run finalization parameters
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            client = cls._get_client()
            if not client:
                return False
                
            ended_at = cls._to_iso_or_now()
            
            # Update run status
            run_result = client.table('chat_runs').update({
                'status': params.status,
                'ended_at': ended_at
            }).eq('id', params.run_id).execute()
            
            if not run_result.data:
                logger.error(f"Failed to finalize run {params.run_id}")
                return False
            
            # Mark remaining running tool calls with terminal status
            terminal_status = 'complete' if params.status == 'complete' else 'error'
            tool_result = client.table('chat_tool_calls').update({
                'status': terminal_status,
                'completed_at': ended_at
            }).eq('run_id', params.run_id).eq('status', 'running').execute()
            
            logger.debug(f"Finalized run {params.run_id} with status {params.status}")
            return True
            
        except Exception as e:
            logger.error(f"Exception in finalize_run: {e}")
            return False
    
    @classmethod
    def upsert_tool_start(cls, params: UpsertToolStartParams) -> bool:
        """
        Record the start of a tool execution.
        
        Args:
            params: Tool start parameters
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            client = cls._get_client()
            if not client:
                return False
                
            started_at = cls._to_iso_or_now(params.at)
            
            result = client.table('chat_tool_calls').upsert({
                'run_id': params.run_id,
                'tool_key': params.tool_key,
                'tool_label': params.tool_label,
                'agent': params.agent,
                'status': 'running',
                'started_at': started_at,
            }, on_conflict='run_id,tool_key', ignore_duplicates=False).execute()
            
            if result.data:
                logger.debug(f"Started tool {params.tool_key} for run {params.run_id}")
                return True
            else:
                logger.error(f"Failed to start tool {params.tool_key}")
                return False
                
        except Exception as e:
            logger.error(f"Exception in upsert_tool_start: {e}")
            return False
    
    @classmethod
    def upsert_tool_complete(cls, params: UpsertToolCompleteParams) -> bool:
        """
        Mark a tool execution as complete.
        
        Args:
            params: Tool completion parameters
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            client = cls._get_client()
            if not client:
                return False
                
            completed_at = cls._to_iso_or_now(params.at)
            
            # Find the latest running record for this tool
            running_result = client.table('chat_tool_calls').select('id').eq(
                'run_id', params.run_id
            ).eq('tool_key', params.tool_key).eq('status', 'running').order(
                'started_at', desc=True
            ).limit(1).execute()
            
            if running_result.data:
                # Update existing running record
                update_result = client.table('chat_tool_calls').update({
                    'status': params.status,
                    'completed_at': completed_at
                }).eq('id', running_result.data[0]['id']).execute()
                
                if update_result.data:
                    logger.debug(f"Completed tool {params.tool_key} for run {params.run_id}")
                    return True
                else:
                    logger.error(f"Failed to update tool completion {params.tool_key}")
                    return False
            else:
                # No running record found, create completed record
                fallback_result = client.table('chat_tool_calls').upsert({
                    'run_id': params.run_id,
                    'tool_key': params.tool_key,
                    'tool_label': params.tool_key,
                    'status': params.status,
                    'started_at': completed_at,
                    'completed_at': completed_at,
                }, on_conflict='run_id,tool_key', ignore_duplicates=False).execute()
                
                if fallback_result.data:
                    logger.debug(f"Created completed tool record {params.tool_key}")
                    return True
                else:
                    logger.error(f"Failed to create tool completion fallback {params.tool_key}")
                    return False
                    
        except Exception as e:
            logger.error(f"Exception in upsert_tool_complete: {e}")
            return False

    @classmethod
    def cleanup_orphaned_tool_calls(cls) -> int:
        """
        Clean up orphaned running tool calls for completed runs.
        
        Returns:
            int: Number of orphaned tool calls cleaned up, -1 on error
        """
        try:
            client = cls._get_client()
            if not client:
                return -1
                
            # Get completed run IDs
            completed_runs = client.table('chat_runs').select('id').eq('status', 'complete').execute()
            
            if not completed_runs.data:
                logger.info("No completed runs found for cleanup")
                return 0
                
            run_ids = [run['id'] for run in completed_runs.data]
            
            # Find orphaned tool calls
            orphaned_tools = client.table('chat_tool_calls').select('id').eq(
                'status', 'running'
            ).in_('run_id', run_ids).execute()
            
            if not orphaned_tools.data:
                logger.info("No orphaned tool calls found")
                return 0
                
            orphaned_ids = [tool['id'] for tool in orphaned_tools.data]
            
            # Mark as complete
            cleanup_result = client.table('chat_tool_calls').update({
                'status': 'complete',
                'completed_at': cls._to_iso_or_now()
            }).in_('id', orphaned_ids).execute()
            
            if cleanup_result.data:
                count = len(orphaned_ids)
                logger.info(f"Cleaned up {count} orphaned tool calls")
                return count
            else:
                logger.error("Failed to cleanup orphaned tool calls")
                return -1
                
        except Exception as e:
            logger.error(f"Exception in cleanup_orphaned_tool_calls: {e}")
            return -1
