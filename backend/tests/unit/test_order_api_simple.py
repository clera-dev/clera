import pytest
import uuid
from unittest.mock import Mock, patch
from datetime import datetime, timezone
from decimal import Decimal
from fastapi.testclient import TestClient

from api_server import app

client = TestClient(app)

class TestOrderAPISimple:
    """Simplified test suite for order API endpoints."""

    @pytest.fixture(autouse=True)
    def mock_broker_client(self):
        """Mock broker client for testing."""
        with patch('api_server.get_broker_client') as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            yield mock_client

    @pytest.fixture(autouse=True)
    def mock_env_vars(self):
        """Mock environment variables for testing."""
        with patch.dict('os.environ', {'BACKEND_API_KEY': 'test-key'}):
            yield

    @pytest.fixture
    def sample_order(self):
        """Create a sample order for testing."""
        order = Mock()
        order.id = str(uuid.uuid4())
        order.client_order_id = "test-order-id"
        order.created_at = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        order.updated_at = datetime(2024, 1, 15, 10, 31, 0, tzinfo=timezone.utc)
        order.submitted_at = datetime(2024, 1, 15, 10, 30, 30, tzinfo=timezone.utc)
        order.filled_at = datetime(2024, 1, 15, 10, 31, 0, tzinfo=timezone.utc)
        order.expired_at = None
        order.canceled_at = None
        order.failed_at = None
        order.replaced_at = None
        order.replaced_by = None
        order.replaces = None
        order.asset_id = str(uuid.uuid4())
        order.symbol = "AAPL"
        order.notional = "1505.00"
        order.qty = "10"
        order.filled_qty = "10"
        order.filled_avg_price = "150.50"
        order.order_class = None
        order.commission = 0.0
        order.extended_hours = False
        order.legs = None
        order.trail_percent = None
        order.trail_price = None
        order.hwm = None
        
        # Mock enum fields with .value
        order.asset_class = Mock()
        order.asset_class.value = "us_equity"
        order.order_type = Mock()
        order.order_type.value = "market"
        order.type = Mock()
        order.type.value = "market"
        order.side = Mock()
        order.side.value = "buy"
        order.time_in_force = Mock()
        order.time_in_force.value = "day"
        order.status = Mock()
        order.status.value = "filled"
        order.limit_price = None
        order.stop_price = None
        
        return order

    def test_get_account_orders_success(self, sample_order, mock_broker_client):
        """Test successful order retrieval."""
        # Setup mock
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        # Make request
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders", headers={"x-api-key": "test-key"})

        # Assertions
        assert response.status_code == 200
        orders = response.json()
        assert len(orders) == 1
        assert orders[0]["symbol"] == "AAPL"
        assert orders[0]["side"] == "buy"
        assert orders[0]["status"] == "filled"

        # Verify broker client was called correctly
        mock_client.get_orders_for_account.assert_called_once()

    def test_get_account_orders_empty_result(self, mock_broker_client):
        """Test order retrieval when no orders are found."""
        # Setup mock to return empty list
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = []

        # Make request
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders", headers={"x-api-key": "test-key"})

        # Assertions
        assert response.status_code == 200
        orders = response.json()
        assert len(orders) == 0

    def test_get_account_orders_missing_api_key(self):
        """Test order retrieval without API key."""
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders")
        assert response.status_code == 401

    def test_get_account_orders_invalid_account_id(self):
        """Test order retrieval with invalid account ID."""
        response = client.get("/api/portfolio/invalid-uuid/orders", headers={"x-api-key": "test-key"})
        assert response.status_code == 400
        assert "Invalid account_id format" in response.json()["detail"]

    def test_get_account_orders_broker_error(self, mock_broker_client):
        """Test order retrieval when broker client raises an error."""
        # Setup mock to raise exception
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.side_effect = Exception("Broker error")

        # Make request
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders", headers={"x-api-key": "test-key"})

        # Assertions
        assert response.status_code == 500
        assert "Internal server error" in response.json()["detail"] 