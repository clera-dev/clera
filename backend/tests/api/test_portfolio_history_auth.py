"""
PRODUCTION-GRADE: Test portfolio history endpoint authentication flows.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from api_server import app

client = TestClient(app)

TEST_API_KEY = "clera-is-the-goat-tok8s825nvjdk0482mc6"
TEST_USER_ID = "test-user-123"

@patch('api_server.get_authenticated_user_id')
def test_null_account_without_auth_returns_401(mock_auth):
    """❌ CRITICAL: account_id='null' without JWT must return 401, not 500."""
    from fastapi import HTTPException
    mock_auth.side_effect = HTTPException(status_code=401)
    
    response = client.get(
        "/api/portfolio/null/history?period=1W",
        headers={"X-API-Key": TEST_API_KEY}
    )
    
    # CRITICAL: Should be 401, not 500 (badly formed UUID)
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.json()}"
    assert "Authentication required" in response.json()['detail']
    print("✅ Test passed: null account without auth returns 401")

if __name__ == '__main__':
    test_null_account_without_auth_returns_401()
