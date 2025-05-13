import pytest
from fastapi import status
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from unittest.mock import patch, MagicMock
import os

# Make sure the app can be imported
# Adjust the path as necessary if the test runner needs help finding the module
# In many setups, pytest handles this automatically if run from the project root
try:
    from portfolio_realtime.websocket_server import app
except ImportError:
    # You might need to adjust sys.path or configure pytest paths
    # depending on how you run your tests
    import sys
    from pathlib import Path
    # Add the project root to the path
    project_root = Path(__file__).parent.parent.parent.parent 
    sys.path.insert(0, str(project_root))
    from backend.portfolio_realtime.websocket_server import app

# Define fixtures or constants if needed
TEST_USER_ID = "test-user-id-123"
CORRECT_ACCOUNT_ID = "account-abc"
WRONG_ACCOUNT_ID = "account-xyz"

@pytest.fixture(scope="module")
def client():
    # Set a dummy secret for tests if verify_token is *not* fully mocked in a specific test
    # os.environ['SUPABASE_JWT_SECRET'] = 'test-secret' 
    with TestClient(app) as c:
        yield c
    # del os.environ['SUPABASE_JWT_SECRET']

# --- Test Cases ---

def test_websocket_connect_success(client):
    """Tests successful connection with valid token and matching account ID."""
    with patch("portfolio_realtime.websocket_server.verify_token") as mock_verify, \
         patch("portfolio_realtime.websocket_server.get_user_alpaca_account_id") as mock_get_account, \
         patch("portfolio_realtime.websocket_server.send_initial_portfolio_data") as mock_send_initial:
        
        mock_verify.return_value = TEST_USER_ID
        mock_get_account.return_value = CORRECT_ACCOUNT_ID
        mock_send_initial.return_value = None
        
        try:
            with client.websocket_connect(f"/ws/portfolio/{CORRECT_ACCOUNT_ID}?token=valid-token") as websocket:
                # If connection is successful, it shouldn't close immediately with an error code
                # We might receive an initial message (portfolio data)
                # For this auth test, simply not failing is sufficient, 
                # but we can add a check for initial data if needed.
                # data = websocket.receive_json() # Example: Check initial data if sent
                assert True # Connection succeeded without immediate closure
                websocket.close() # Cleanly close the connection for the test
        except WebSocketDisconnect as e:
            pytest.fail(f"WebSocket disconnected unexpectedly: {e.code} - {e.reason}")

def test_websocket_connect_no_token(client):
    """Tests connection attempt without a token."""
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(f"/ws/portfolio/{CORRECT_ACCOUNT_ID}") as websocket:
            pass # Should not reach here
            
    assert excinfo.value.code == status.WS_1008_POLICY_VIOLATION
    # assert "Authentication failed" in excinfo.value.reason # Check reason if needed

def test_websocket_connect_invalid_token(client):
    """Tests connection attempt with an invalid token."""
    with patch("portfolio_realtime.websocket_server.verify_token") as mock_verify:
        mock_verify.return_value = None # Simulate invalid/expired token
        
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect(f"/ws/portfolio/{CORRECT_ACCOUNT_ID}?token=invalid-token") as websocket:
                pass # Should not reach here
                
        assert excinfo.value.code == status.WS_1008_POLICY_VIOLATION
        # assert "Authentication failed" in excinfo.value.reason

def test_websocket_connect_mismatched_account_id(client):
    """Tests connection attempt with a valid token but for the wrong account ID."""
    with patch("portfolio_realtime.websocket_server.verify_token") as mock_verify, \
         patch("portfolio_realtime.websocket_server.get_user_alpaca_account_id") as mock_get_account:
        
        mock_verify.return_value = TEST_USER_ID
        # User is authorized for CORRECT_ACCOUNT_ID
        mock_get_account.return_value = CORRECT_ACCOUNT_ID 
        
        # But tries to connect to WRONG_ACCOUNT_ID
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect(f"/ws/portfolio/{WRONG_ACCOUNT_ID}?token=valid-token") as websocket:
                pass # Should not reach here
                
        assert excinfo.value.code == status.WS_1008_POLICY_VIOLATION
        assert "Forbidden" in excinfo.value.reason # Specific check for authorization failure

def test_websocket_connect_db_error_during_authz(client):
    """Tests connection attempt where DB lookup for account ID fails."""
    with patch("portfolio_realtime.websocket_server.verify_token") as mock_verify, \
         patch("portfolio_realtime.websocket_server.get_user_alpaca_account_id") as mock_get_account:
        
        mock_verify.return_value = TEST_USER_ID
        # Simulate database error during authorization check
        mock_get_account.side_effect = Exception("Database connection failed")
        
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect(f"/ws/portfolio/{CORRECT_ACCOUNT_ID}?token=valid-token") as websocket:
                pass # Should not reach here
                
        assert excinfo.value.code == status.WS_1011_INTERNAL_ERROR
        # assert "Authorization check failed" in excinfo.value.reason

# --- End of Test Cases --- 