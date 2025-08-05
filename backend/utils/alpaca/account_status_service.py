#!/usr/bin/env python3

import os
import asyncio
import json
import logging
import httpx
import time
from datetime import datetime
from typing import Dict, Any, Optional, Set, Callable
from urllib.parse import urlencode

from alpaca.broker.client import BrokerClient
from supabase import Client as SupabaseClient

from .broker_client_factory import get_broker_client
from ..supabase.db_client import get_supabase_client

logger = logging.getLogger("alpaca-account-status-service")

class AlpacaAccountStatusService:
    """
    Service to subscribe to Alpaca account status SSE events and update Supabase.
    
    Follows SOLID principles:
    - Single Responsibility: Handles only account status monitoring
    - Open/Closed: Can be extended without modification
    - Dependency Inversion: Depends on abstractions (BrokerClient, Supabase)
    """
    
    def __init__(self, 
                 broker_client: BrokerClient,
                 supabase_client: SupabaseClient,
                 reconnect_delay: int = 30,
                 max_reconnect_attempts: int = 10,
                 status_change_callback: Optional[Callable[[str, str, str], None]] = None):
        """
        Initialize the account status service.
        
        Args:
            reconnect_delay: Delay in seconds between reconnection attempts
            max_reconnect_attempts: Maximum number of reconnection attempts
            status_change_callback: Optional callback function for status changes
        """
        self.broker_client = broker_client
        self.supabase = supabase_client
        
        # Configuration
        self.reconnect_delay = reconnect_delay
        self.max_reconnect_attempts = max_reconnect_attempts
        self.status_change_callback = status_change_callback
        
        # State tracking
        self.monitored_accounts: Set[str] = set()
        self.is_running = False
        self.reconnect_attempts = 0
        
        # SSE connection details
        self.sse_base_url = self._get_sse_base_url()
        
        logger.info("Alpaca Account Status Service initialized")
    
    def _get_sse_base_url(self) -> str:
        """Get the base URL for Alpaca SSE events."""
        sandbox = os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
        if sandbox:
            return "https://broker-api.sandbox.alpaca.markets/v1/events/accounts/status"
        else:
            return "https://broker-api.alpaca.markets/v1/events/accounts/status"
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for Alpaca API."""
        api_key = os.getenv("BROKER_API_KEY")
        secret_key = os.getenv("BROKER_SECRET_KEY")
        
        if not api_key or not secret_key:
            raise ValueError("BROKER_API_KEY and BROKER_SECRET_KEY environment variables are required")
        
        return {
            "APCA-API-KEY-ID": api_key,
            "APCA-API-SECRET-KEY": secret_key,
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache"
        }
    
    def add_account(self, account_id: str) -> None:
        """Add an account to be monitored for status changes."""
        self.monitored_accounts.add(account_id)
        logger.info(f"Added account {account_id} to monitoring list")
    
    def remove_account(self, account_id: str) -> None:
        """Remove an account from monitoring."""
        self.monitored_accounts.discard(account_id)
        logger.info(f"Removed account {account_id} from monitoring list")
    
    def load_accounts_from_supabase(self) -> None:
        """Load all accounts from Supabase that should be monitored."""
        try:
            response = self.supabase.table("user_onboarding") \
                .select("alpaca_account_id") \
                .not_.is_("alpaca_account_id", "null") \
                .execute()
            
            if response.data:
                for record in response.data:
                    account_id = record.get("alpaca_account_id")
                    if account_id:
                        self.monitored_accounts.add(account_id)
                
                logger.info(f"Loaded {len(self.monitored_accounts)} accounts from Supabase for monitoring")
            else:
                logger.warning("No accounts found in Supabase to monitor")
                
        except Exception as e:
            logger.error(f"Error loading accounts from Supabase: {e}")
    
    async def _update_account_status_in_supabase(self, account_id: str, new_status: str, event_data: Dict[str, Any]) -> None:
        """Update account status in Supabase."""
        try:
            # Update the alpaca_account_status column
            update_data = {
                "alpaca_account_status": new_status,
                "updated_at": datetime.now().isoformat()
            }
            
            # Also store additional event data in the onboarding_data jsonb field
            if event_data:
                # Get current onboarding_data
                response = await asyncio.to_thread(
                    self.supabase.table("user_onboarding")
                    .select("onboarding_data")
                    .eq("alpaca_account_id", account_id)
                    .execute
                )
                
                if response.data and len(response.data) > 0:
                    current_data = response.data[0].get("onboarding_data", {}) or {}
                    
                    # Add account status event data
                    if "account_status_events" not in current_data:
                        current_data["account_status_events"] = []
                    
                    # Add the new event
                    event_record = {
                        "timestamp": datetime.now().isoformat(),
                        "status_from": event_data.get("status_from"),
                        "status_to": event_data.get("status_to"),
                        "event_id": event_data.get("event_id"),
                        "event_ulid": event_data.get("event_ulid"),
                        "at": event_data.get("at")
                    }
                    current_data["account_status_events"].append(event_record)
                    
                    # Keep only the last 10 events to prevent bloat
                    if len(current_data["account_status_events"]) > 10:
                        current_data["account_status_events"] = current_data["account_status_events"][-10:]
                    
                    update_data["onboarding_data"] = current_data
            
            # Update the record
            update_response = await asyncio.to_thread(
                self.supabase.table("user_onboarding")
                .update(update_data)
                .eq("alpaca_account_id", account_id)
                .execute
            )
            
            if update_response.data:
                logger.info(f"Successfully updated account status for {account_id}: {new_status}")
                
                # Call callback if provided
                if self.status_change_callback:
                    try:
                        self.status_change_callback(account_id, event_data.get("status_from", ""), new_status)
                    except Exception as callback_error:
                        logger.error(f"Error in status change callback: {callback_error}")
            else:
                logger.warning(f"No records updated for account {account_id}")
                
        except Exception as e:
            logger.error(f"Error updating account status in Supabase for {account_id}: {e}")
    
    async def _process_sse_event(self, event_data: Dict[str, Any]) -> None:
        """Process a single SSE event."""
        try:
            account_id = event_data.get("account_id")
            if not account_id:
                logger.debug("Received SSE event without account_id")
                return
            
            # Only process events for accounts we're monitoring
            if account_id not in self.monitored_accounts:
                logger.debug(f"Ignoring event for unmonitored account: {account_id}")
                return
            
            # Check for status change
            status_to = event_data.get("status_to")
            status_from = event_data.get("status_from")
            
            if status_to:
                logger.info(f"Account {account_id} status changed from {status_from} to {status_to}")
                await self._update_account_status_in_supabase(account_id, status_to, event_data)
            else:
                # Log other types of events for debugging
                event_type = "unknown"
                if "account_blocked" in event_data:
                    event_type = "account_blocked"
                elif "trading_blocked" in event_data:
                    event_type = "trading_blocked"
                elif "pattern_day_trader" in event_data:
                    event_type = "pattern_day_trader"
                
                logger.debug(f"Received {event_type} event for account {account_id}")
                
        except Exception as e:
            logger.error(f"Error processing SSE event: {e}", exc_info=True)
    
    async def _connect_and_listen(self) -> None:
        """Connect to Alpaca SSE and listen for events."""
        headers = self._get_auth_headers()
        
        # Build query parameters
        # We start from now to only get new events, not historical ones
        params = {}
        
        url = f"{self.sse_base_url}?{urlencode(params)}" if params else self.sse_base_url
        
        logger.info(f"Connecting to Alpaca account status SSE: {self.sse_base_url}")
        
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as response:
                    if response.status_code != 200:
                        raise Exception(f"SSE connection failed with status {response.status_code}: {await response.aread()}")
                    
                    logger.info("Successfully connected to Alpaca account status SSE")
                    self.reconnect_attempts = 0
                    
                    async for line in response.aiter_lines():
                        if not self.is_running:
                            break
                            
                        if line.startswith("data:"):
                            try:
                                data = line[len("data:"):].strip()
                                
                                # Handle potential array of events in a single data message
                                if data.startswith("[") and data.endswith("]"):
                                    events = json.loads(data)
                                    for event in events:
                                        await self._process_sse_event(event)
                                else:
                                    # Single event
                                    event = json.loads(data)
                                    await self._process_sse_event(event)
                                    
                            except json.JSONDecodeError as e:
                                logger.warning(f"Could not decode SSE data: {data}, error: {e}")
                            except Exception as e:
                                logger.error(f"Error processing SSE data: {data}, error: {e}", exc_info=True)
                        elif line:
                            logger.debug(f"Received non-data line from SSE: {line}")
                            
        except Exception as e:
            logger.error(f"SSE connection error: {e}")
            raise
    
    async def _run_with_reconnect(self) -> None:
        """Run the SSE listener with automatic reconnection."""
        while self.is_running:
            try:
                await self._connect_and_listen()
                
            except Exception as e:
                if not self.is_running:
                    break
                
                self.reconnect_attempts += 1
                logger.error(f"SSE connection failed (attempt {self.reconnect_attempts}/{self.max_reconnect_attempts}): {e}")
                
                if self.reconnect_attempts >= self.max_reconnect_attempts:
                    logger.error("Max reconnection attempts reached, stopping service")
                    self.is_running = False
                    break
                
                logger.info(f"Reconnecting in {self.reconnect_delay} seconds...")
                await asyncio.sleep(self.reconnect_delay)
    
    async def start(self) -> None:
        """Start the account status monitoring service."""
        if self.is_running:
            logger.warning("Service is already running")
            return
        
        logger.info("Starting Alpaca Account Status Service")
        
        # Load accounts from Supabase
        self.load_accounts_from_supabase()
        
        if not self.monitored_accounts:
            logger.warning("No accounts to monitor, service will still start but won't process events")
        
        self.is_running = True
        self.reconnect_attempts = 0
        
        # Start the SSE listener
        await self._run_with_reconnect()
    
    def stop(self) -> None:
        """Stop the account status monitoring service."""
        logger.info("Stopping Alpaca Account Status Service")
        self.is_running = False
    
    def get_status(self) -> Dict[str, Any]:
        """Get current service status."""
        return {
            "is_running": self.is_running,
            "monitored_accounts": len(self.monitored_accounts),
            "reconnect_attempts": self.reconnect_attempts,
            "max_reconnect_attempts": self.max_reconnect_attempts
        }


# Factory function for creating the service
def create_account_status_service(
    reconnect_delay: int = 30,
    max_reconnect_attempts: int = 10,
    status_change_callback: Optional[Callable[[str, str, str], None]] = None
) -> AlpacaAccountStatusService:
    """
    Factory function to create an AlpacaAccountStatusService instance.
    
    Args:
        reconnect_delay: Delay in seconds between reconnection attempts
        max_reconnect_attempts: Maximum number of reconnection attempts  
        status_change_callback: Optional callback for status changes
        
    Returns:
        AlpacaAccountStatusService: Configured service instance
    """
    broker_client = get_broker_client()
    supabase_client = get_supabase_client()
    
    return AlpacaAccountStatusService(
        broker_client=broker_client,
        supabase_client=supabase_client,
        reconnect_delay=reconnect_delay,
        max_reconnect_attempts=max_reconnect_attempts,
        status_change_callback=status_change_callback
    )


# Standalone function to check current account status
def get_current_account_status(account_id: str) -> Optional[str]:
    """
    Get the current account status from Alpaca API.
    
    Args:
        account_id: Alpaca account ID
        
    Returns:
        Current account status or None if not found
    """
    try:
        broker_client = get_broker_client()
        account = broker_client.get_account_by_id(account_id)
        
        if account and hasattr(account, 'status'):
            return str(account.status)
        else:
            logger.warning(f"Account {account_id} not found or has no status")
            return None
            
    except Exception as e:
        logger.error(f"Error getting current account status for {account_id}: {e}")
        return None


# Standalone function to sync account status
def sync_account_status_to_supabase(account_id: str) -> bool:
    """
    Sync the current account status from Alpaca to Supabase.
    
    Args:
        account_id: Alpaca account ID
        
    Returns:
        True if successful, False otherwise
    """
    try:
        current_status = get_current_account_status(account_id)
        if not current_status:
            return False
        
        # Update Supabase
        supabase = get_supabase_client()
        update_response = supabase.table("user_onboarding") \
            .update({
                "alpaca_account_status": current_status,
                "updated_at": datetime.now().isoformat()
            }) \
            .eq("alpaca_account_id", account_id) \
            .execute()
        
        if update_response.data:
            logger.info(f"Successfully synced account status for {account_id}: {current_status}")
            return True
        else:
            logger.warning(f"No records updated when syncing account {account_id}")
            return False
            
    except Exception as e:
        logger.error(f"Error syncing account status for {account_id}: {e}")
        return False 