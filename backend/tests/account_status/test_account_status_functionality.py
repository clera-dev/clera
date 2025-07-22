#!/usr/bin/env python3

import pytest
import json
import asyncio
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime
from fastapi.testclient import TestClient

# Import the modules we're testing
from utils.alpaca.account_status_service import (
    AlpacaAccountStatusService,
    create_account_status_service,
    get_current_account_status,
    sync_account_status_to_supabase
)

class TestAlpacaAccountStatusService:
    """Test the AlpacaAccountStatusService class."""
    
    def test_service_initialization(self):
        """Test that the service initializes correctly."""
        mock_broker = Mock()
        mock_supabase = Mock()
        
        service = AlpacaAccountStatusService(
            broker_client=mock_broker,
            supabase_client=mock_supabase
        )
        
        assert service.broker_client == mock_broker
        assert service.supabase == mock_supabase
        assert service.monitored_accounts == set()
        assert service.is_running is False
        assert service.reconnect_attempts == 0
        assert service.reconnect_delay == 30
        assert service.max_reconnect_attempts == 10

    def test_add_remove_account(self):
        """Test adding and removing accounts from monitoring."""
        service = AlpacaAccountStatusService(broker_client=Mock(), supabase_client=Mock())
        
        service.add_account("account1")
        assert "account1" in service.monitored_accounts
        
        service.add_account("account2")
        assert {"account1", "account2"} == service.monitored_accounts
        
        service.remove_account("account1")
        assert "account1" not in service.monitored_accounts
        assert "account2" in service.monitored_accounts
        
        service.remove_account("non_existent")
        assert "account2" in service.monitored_accounts

    def test_load_accounts_from_supabase(self):
        """Test loading accounts from Supabase."""
        mock_supabase = Mock()
        mock_response = Mock()
        mock_response.data = [
            {"alpaca_account_id": "acc_1"},
            {"alpaca_account_id": "acc_2"},
            {"alpaca_account_id": None}, # Should be ignored
        ]
        mock_supabase.table.return_value.select.return_value.not_.return_value.is_.return_value.execute.return_value = mock_response
        
        service = AlpacaAccountStatusService(broker_client=Mock(), supabase_client=mock_supabase)
        service.load_accounts_from_supabase()
        
        assert service.monitored_accounts == {"acc_1", "acc_2"}

    async def test_update_account_status_in_supabase(self):
        """Test updating account status in Supabase."""
        mock_supabase = Mock()
        
        # Mock getting current onboarding_data
        mock_select_response = Mock()
        mock_select_response.data = [{"onboarding_data": {"existing": "data"}}]
        
        # Mock update response
        mock_update_response = Mock()
        mock_update_response.data = [{"updated": True}]

        async def mock_execute_select(*args, **kwargs):
            return mock_select_response

        async def mock_execute_update(*args, **kwargs):
            return mock_update_response
        
        # When mocking to_thread, we need to handle the chained calls
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute = mock_execute_select
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute = mock_execute_update

        with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_to_thread:
             # Make to_thread return the result of execute
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func()

            service = AlpacaAccountStatusService(broker_client=Mock(), supabase_client=mock_supabase)
            
            event_data = {
                "status_from": "APPROVED",
                "status_to": "ACTIVE",
                "event_id": 12345,
                "event_ulid": "test_ulid",
                "at": "2023-01-01T00:00:00Z"
            }
            
            await service._update_account_status_in_supabase("account1", "ACTIVE", event_data)
            
            # Verify the update was called with correct data
            mock_supabase.table.return_value.update.assert_called_once()
            update_call_args = mock_supabase.table.return_value.update.call_args[0][0]
            
            assert update_call_args["alpaca_account_status"] == "ACTIVE"
            assert "updated_at" in update_call_args
            assert "onboarding_data" in update_call_args
            assert len(update_call_args["onboarding_data"]["account_status_events"]) == 1
    
    async def test_process_sse_event_monitored(self):
        """Test processing an SSE event for a monitored account."""
        service = AlpacaAccountStatusService(broker_client=Mock(), supabase_client=Mock())
        service.add_account("test_account")
        
        # Mock the update function
        service._update_account_status_in_supabase = AsyncMock()
        
        event_data = {
            "account_id": "test_account",
            "status_from": "SUBMITTED",
            "status_to": "APPROVED"
        }
        
        await service._process_sse_event(event_data)
        
        service._update_account_status_in_supabase.assert_called_once_with(
            "test_account", "APPROVED", event_data
        )

    async def test_process_sse_event_unmonitored(self):
        """Test ignoring an SSE event for an unmonitored account."""
        service = AlpacaAccountStatusService(broker_client=Mock(), supabase_client=Mock())
        service.add_account("another_account")
        
        service._update_account_status_in_supabase = AsyncMock()
        
        event_data = {
            "account_id": "unmonitored_account",
            "status_to": "ACTIVE"
        }
        
        await service._process_sse_event(event_data)
        
        service._update_account_status_in_supabase.assert_not_called()

    def test_get_status(self):
        """Test getting service status."""
        service = AlpacaAccountStatusService(broker_client=Mock(), supabase_client=Mock())
        service.add_account("account1")
        service.add_account("account2")
        service.is_running = True
        service.reconnect_attempts = 2
        
        status = service.get_status()
        
        assert status["is_running"] is True
        assert status["monitored_accounts"] == 2
        assert status["reconnect_attempts"] == 2
        assert status["max_reconnect_attempts"] == 10


class TestAccountStatusUtilityFunctions:
    """Test utility functions for account status."""
    
    def test_get_current_account_status_success(self):
        """Test getting current account status successfully."""
        mock_broker_client = Mock()
        mock_account = Mock()
        mock_account.status = "ACTIVE"
        mock_broker_client.get_account_by_id.return_value = mock_account
        
        with patch('utils.alpaca.account_status_service.get_broker_client', return_value=mock_broker_client):
            status = get_current_account_status("account1")
            
            assert status == "ACTIVE"
            mock_broker_client.get_account_by_id.assert_called_once_with("account1")
    
    def test_get_current_account_status_not_found(self):
        """Test getting current account status when account not found."""
        mock_broker_client = Mock()
        mock_broker_client.get_account_by_id.return_value = None
        
        with patch('utils.alpaca.account_status_service.get_broker_client', return_value=mock_broker_client):
            status = get_current_account_status("account1")
            
            assert status is None
    
    def test_get_current_account_status_error(self):
        """Test error handling in get_current_account_status."""
        mock_broker_client = Mock()
        mock_broker_client.get_account_by_id.side_effect = Exception("API Error")
        
        with patch('utils.alpaca.account_status_service.get_broker_client', return_value=mock_broker_client):
            status = get_current_account_status("account1")
            
            assert status is None
    
    def test_sync_account_status_to_supabase_success(self):
        """Test syncing account status to Supabase successfully."""
        mock_supabase = Mock()
        mock_update_response = Mock()
        mock_update_response.data = [{"updated": True}]
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_update_response
        
        with patch('utils.alpaca.account_status_service.get_current_account_status', return_value="ACTIVE"), \
             patch('utils.alpaca.account_status_service.get_supabase_client', return_value=mock_supabase):
            
            result = sync_account_status_to_supabase("account1")
            
            assert result is True
            mock_supabase.table.return_value.update.assert_called_once()
    
    def test_sync_account_status_to_supabase_no_status(self):
        """Test syncing when current status is not available."""
        with patch('utils.alpaca.account_status_service.get_current_account_status', return_value=None):
            result = sync_account_status_to_supabase("account1")
            
            assert result is False
    
    def test_create_account_status_service_factory(self):
        """Test the factory function for creating the service."""
        mock_broker = Mock()
        mock_supabase = Mock()
        
        with patch('utils.alpaca.account_status_service.get_broker_client', return_value=mock_broker), \
             patch('utils.alpaca.account_status_service.get_supabase_client', return_value=mock_supabase):
            
            callback = Mock()
            service = create_account_status_service(
                reconnect_delay=60,
                max_reconnect_attempts=5,
                status_change_callback=callback
            )
            
            assert isinstance(service, AlpacaAccountStatusService)
            assert service.broker_client == mock_broker
            assert service.supabase == mock_supabase
            assert service.reconnect_delay == 60
            assert service.max_reconnect_attempts == 5
            assert service.status_change_callback == callback


class TestAccountStatusAPIEndpoints:
    """Test the FastAPI endpoints for account status."""
    
    @pytest.fixture
    def client(self):
        """Create a test client for the API."""
        from api_server import app
        return TestClient(app)
    
    def test_get_account_status_endpoint(self, client):
        """Test the GET /api/account/{account_id}/status endpoint."""
        with patch('api_server.get_current_account_status', return_value="ACTIVE"), \
             patch('api_server.sync_account_status_to_supabase', return_value=True), \
             patch.dict('os.environ', {'BACKEND_API_KEY': 'test_key'}):
            
            response = client.get(
                "/api/account/test_account/status",
                headers={"X-API-Key": "test_key"}
            )
            
            assert response.status_code == 200
            data = response.json()
            
            assert data["success"] == True
            assert data["data"]["account_id"] == "test_account"
            assert data["data"]["status"] == "ACTIVE"
            assert data["data"]["synced_to_database"] == True
            assert "timestamp" in data["data"]
    
    def test_get_account_status_endpoint_not_found(self, client):
        """Test the endpoint when account status is not found."""
        with patch('api_server.get_current_account_status', return_value=None), \
             patch.dict('os.environ', {'BACKEND_API_KEY': 'test_key'}):
            
            response = client.get(
                "/api/account/test_account/status",
                headers={"X-API-Key": "test_key"}
            )
            
            assert response.status_code == 404
            data = response.json()
            assert "Account test_account not found" in data["detail"]
    
    def test_sync_account_status_endpoint(self, client):
        """Test the POST /api/account/{account_id}/status/sync endpoint."""
        with patch('api_server.sync_account_status_to_supabase', return_value=True), \
             patch('api_server.get_current_account_status', return_value="ACTIVE"), \
             patch.dict('os.environ', {'BACKEND_API_KEY': 'test_key'}):
            
            response = client.post(
                "/api/account/test_account/status/sync",
                headers={"X-API-Key": "test_key"}
            )
            
            assert response.status_code == 200
            data = response.json()
            
            assert data["success"] == True
            assert data["data"]["account_id"] == "test_account"
            assert data["data"]["status"] == "ACTIVE"
            assert "synced_at" in data["data"]
            assert "message" in data["data"]
    
    def test_sync_account_status_endpoint_failure(self, client):
        """Test the sync endpoint when sync fails."""
        with patch('api_server.sync_account_status_to_supabase', return_value=False), \
             patch.dict('os.environ', {'BACKEND_API_KEY': 'test_key'}):
            
            response = client.post(
                "/api/account/test_account/status/sync",
                headers={"X-API-Key": "test_key"}
            )
            
            assert response.status_code == 500
            data = response.json()
            assert "Failed to sync account status to database" in data["detail"]
    
    def test_account_status_endpoint_authentication(self, client):
        """Test that endpoints require proper authentication."""
        # Test without API key
        with patch.dict('os.environ', {'BACKEND_API_KEY': 'test_key'}):
            response = client.get("/api/account/test_account/status")
            assert response.status_code == 401
        
        # Test with invalid API key
        with patch.dict('os.environ', {'BACKEND_API_KEY': 'valid_key'}):
            response = client.get(
                "/api/account/test_account/status",
                headers={"X-API-Key": "invalid_key"}
            )
            assert response.status_code == 401


class TestAccountStatusIntegration:
    """Integration tests for the account status functionality."""
    
    def test_end_to_end_status_flow(self):
        """Test the complete flow from Alpaca API to Supabase update."""
        # Mock Alpaca broker client
        mock_broker_client = Mock()
        mock_account = Mock()
        mock_account.status = "ACTIVE"
        mock_broker_client.get_account_by_id.return_value = mock_account
        
        # Mock Supabase client
        mock_supabase = Mock()
        mock_update_response = Mock()
        mock_update_response.data = [{"updated": True}]
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_update_response
        
        with patch('utils.alpaca.account_status_service.get_broker_client', return_value=mock_broker_client), \
             patch('utils.alpaca.account_status_service.get_supabase_client', return_value=mock_supabase):
            
            # Test getting current status
            status = get_current_account_status("test_account")
            assert status == "ACTIVE"
            
            # Test syncing to Supabase
            sync_result = sync_account_status_to_supabase("test_account")
            assert sync_result is True
            
            # Verify calls were made
            mock_broker_client.get_account_by_id.assert_called_with("test_account")
            mock_supabase.table.return_value.update.assert_called()
    
    async def test_service_event_processing_integration(self):
        """Test the service processing events and updating Supabase."""
        mock_broker = Mock()
        mock_supabase = MagicMock() # Use MagicMock for easier mocking of chained calls

        # Set up the mock for the Supabase call chain
        select_mock = MagicMock()
        select_mock.eq.return_value.execute.return_value = MagicMock(data=[{"onboarding_data": {}}])
        
        update_mock = MagicMock()
        update_mock.eq.return_value.execute.return_value = MagicMock(data=[{"updated": True}])
        
        table_mock = MagicMock()
        table_mock.select.return_value = select_mock
        table_mock.update.return_value = update_mock
        mock_supabase.table.return_value = table_mock
        
        callback_mock = Mock()
        
        # Patch to_thread to execute the function directly
        with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func()

            service = AlpacaAccountStatusService(
                broker_client=mock_broker,
                supabase_client=mock_supabase,
                status_change_callback=callback_mock
            )
            service.add_account("test_account")
            
            # Simulate an SSE event
            event_data = {
                "account_id": "test_account",
                "status_from": "APPROVED",
                "status_to": "ACTIVE",
                "event_id": 12345
            }
            
            await service._process_sse_event(event_data)
            
            # Verify Supabase was updated
            table_mock.update.assert_called()
            update_call_args = table_mock.update.call_args[0][0]
            assert update_call_args["alpaca_account_status"] == "ACTIVE"
            
            # Verify callback was called
            callback_mock.assert_called_once_with("test_account", "APPROVED", "ACTIVE")


if __name__ == "__main__":
    pytest.main([__file__, "-v"]) 