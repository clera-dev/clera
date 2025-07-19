import pytest
import uuid
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone
from decimal import Decimal
from fastapi.testclient import TestClient
from alpaca.broker.models import Order
from alpaca.trading.enums import OrderSide, OrderType, TimeInForce, AssetClass

from alpaca.trading.requests import GetOrdersRequest

from api_server import app
from utils.alpaca.portfolio_mapping import map_order_to_response

client = TestClient(app)

class TestOrderAPI:
    """Test suite for order API endpoints."""

    @pytest.fixture
    def mock_broker_client(self):
        """Mock broker client for testing."""
        with patch('api_server.get_broker_client') as mock_client:
            yield mock_client

    @pytest.fixture
    def mock_verify_api_key(self):
        """Mock API key verification."""
        with patch('api_server.verify_api_key') as mock_verify:
            mock_verify.return_value = "test-api-key"
            yield mock_verify

    @pytest.fixture
    def sample_order(self):
        """Create a sample Alpaca order for testing."""
        order = Mock(spec=Order)
        order.id = uuid.uuid4()
        order.client_order_id = "test-client-order-id"
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
        order.asset_id = uuid.uuid4()
        order.symbol = "AAPL"
        order.asset_class = AssetClass.US_EQUITY
        order.notional = "1505.00"
        order.qty = "10"
        order.filled_qty = "10"
        order.filled_avg_price = "150.50"
        order.order_class = None
        order.order_type = OrderType.MARKET
        order.type = OrderType.MARKET
        order.side = OrderSide.BUY
        order.time_in_force = TimeInForce.DAY
        order.limit_price = None
        order.stop_price = None
        order.status = Mock()
        order.status.value = "filled"
        order.extended_hours = False
        order.legs = None
        order.trail_percent = None
        order.trail_price = None
        order.hwm = None
        order.commission = 0.0
        return order

    @pytest.fixture
    def sample_sell_order(self):
        """Create a sample sell order for testing."""
        order = Mock(spec=Order)
        order.id = uuid.uuid4()
        order.client_order_id = "test-sell-order-id"
        order.created_at = datetime(2024, 1, 14, 14, 20, 0, tzinfo=timezone.utc)
        order.updated_at = datetime(2024, 1, 14, 14, 21, 0, tzinfo=timezone.utc)
        order.submitted_at = datetime(2024, 1, 14, 14, 20, 30, tzinfo=timezone.utc)
        order.filled_at = datetime(2024, 1, 14, 14, 21, 0, tzinfo=timezone.utc)
        order.expired_at = None
        order.canceled_at = None
        order.failed_at = None
        order.replaced_at = None
        order.replaced_by = None
        order.replaces = None
        order.asset_id = uuid.uuid4()
        order.symbol = "TSLA"
        order.asset_class = AssetClass.US_EQUITY
        order.notional = "1253.75"
        order.qty = "5"
        order.filled_qty = "5"
        order.filled_avg_price = "250.75"
        order.order_class = None
        order.order_type = OrderType.MARKET
        order.type = OrderType.MARKET
        order.side = OrderSide.SELL
        order.time_in_force = TimeInForce.DAY
        order.limit_price = None
        order.stop_price = None
        order.status = Mock()
        order.status.value = "filled"
        order.extended_hours = False
        order.legs = None
        order.trail_percent = None
        order.trail_price = None
        order.hwm = None
        order.commission = 0.0
        return order

    @pytest.fixture
    def sample_pending_order(self):
        """Create a sample pending order for testing."""
        order = Mock(spec=Order)
        order.id = uuid.uuid4()
        order.client_order_id = "test-pending-order-id"
        order.created_at = datetime(2024, 1, 16, 9, 15, 0, tzinfo=timezone.utc)
        order.updated_at = datetime(2024, 1, 16, 9, 15, 30, tzinfo=timezone.utc)
        order.submitted_at = datetime(2024, 1, 16, 9, 15, 30, tzinfo=timezone.utc)
        order.filled_at = None
        order.expired_at = None
        order.canceled_at = None
        order.failed_at = None
        order.replaced_at = None
        order.replaced_by = None
        order.replaces = None
        order.asset_id = uuid.uuid4()
        order.symbol = "MSFT"
        order.asset_class = AssetClass.US_EQUITY
        order.notional = "8000.00"
        order.qty = "20"
        order.filled_qty = None
        order.filled_avg_price = None
        order.order_class = None
        order.order_type = OrderType.LIMIT
        order.type = OrderType.LIMIT
        order.side = OrderSide.BUY
        order.time_in_force = TimeInForce.DAY
        order.limit_price = "400.00"
        order.stop_price = None
        order.status = Mock()
        order.status.value = "pending"
        order.extended_hours = False
        order.legs = None
        order.trail_percent = None
        order.trail_price = None
        order.hwm = None
        order.commission = None
        return order

    def test_get_account_orders_success(self, mock_broker_client, mock_verify_api_key, sample_order, sample_sell_order):
        """Test successful order retrieval."""
        # Setup mock
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order, sample_sell_order]

        # Make request
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key")

        # Assertions
        assert response.status_code == 200
        orders = response.json()
        assert len(orders) == 2
        assert orders[0]["symbol"] == "AAPL"
        assert orders[0]["side"] == "buy"
        assert orders[0]["status"] == "filled"
        assert orders[1]["symbol"] == "TSLA"
        assert orders[1]["side"] == "sell"
        assert orders[1]["status"] == "filled"

        # Verify broker client was called correctly
        mock_client.get_orders_for_account.assert_called_once()
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["account_id"] == account_id
        assert isinstance(call_args[1]["filter"], GetOrdersRequest)

    def test_get_account_orders_with_filters(self, mock_broker_client, mock_verify_api_key, sample_order):
        """Test order retrieval with various filters."""
        # Setup mock
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        # Make request with filters
        account_id = str(uuid.uuid4())
        response = client.get(
            f"/api/portfolio/{account_id}/orders"
            "?x-api-key=test-key"
            "&status=closed"
            "&limit=10"
            "&direction=asc"
            "&nested=true"
            "&symbols=AAPL,TSLA"
        )

        # Assertions
        assert response.status_code == 200
        
        # Verify filter parameters were passed correctly
        call_args = mock_client.get_orders_for_account.call_args
        filter_obj = call_args[1]["filter"]
        assert filter_obj.status == "closed"
        assert filter_obj.limit == 10
        assert filter_obj.direction == "asc"
        assert filter_obj.nested is True
        assert filter_obj.symbols == ["AAPL", "TSLA"]

    def test_get_account_orders_invalid_account_id(self, mock_verify_api_key):
        """Test order retrieval with invalid account ID."""
        response = client.get("/api/portfolio/invalid-uuid/orders?x-api-key=test-key")
        assert response.status_code == 400
        assert "Invalid account_id format" in response.json()["detail"]

    def test_get_account_orders_broker_error(self, mock_broker_client, mock_verify_api_key):
        """Test order retrieval when broker client raises an error."""
        # Setup mock to raise exception
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.side_effect = Exception("Broker error")

        # Make request
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key")

        # Assertions
        assert response.status_code == 500
        assert "Internal server error" in response.json()["detail"]

    def test_get_account_orders_http_error(self, mock_broker_client, mock_verify_api_key):
        """Test order retrieval when broker client raises HTTP error."""
        from requests.exceptions import HTTPError
        
        # Setup mock to raise HTTPError
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.text = "Account not found"
        
        mock_client.get_orders_for_account.side_effect = HTTPError(response=mock_response)

        # Make request
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key")

        # Assertions
        assert response.status_code == 404
        assert "Alpaca error: Account not found" in response.json()["detail"]

    def test_get_account_orders_empty_result(self, mock_broker_client, mock_verify_api_key):
        """Test order retrieval when no orders are found."""
        # Setup mock to return empty list
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = []

        # Make request
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key")

        # Assertions
        assert response.status_code == 200
        orders = response.json()
        assert len(orders) == 0

    def test_get_account_orders_missing_api_key(self):
        """Test order retrieval without API key."""
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders")
        assert response.status_code == 401

    def test_get_account_orders_invalid_api_key(self, mock_verify_api_key):
        """Test order retrieval with invalid API key."""
        mock_verify_api_key.side_effect = Exception("Invalid API key")
        
        account_id = str(uuid.uuid4())
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=invalid-key")
        assert response.status_code == 401

    def test_map_order_to_response_comprehensive(self, sample_order, sample_sell_order, sample_pending_order):
        """Test comprehensive order mapping functionality."""
        # Test buy order mapping
        buy_response = map_order_to_response(sample_order)
        assert buy_response["id"] == str(sample_order.id)
        assert buy_response["symbol"] == "AAPL"
        assert buy_response["side"] == "buy"
        assert buy_response["status"] == "filled"
        assert buy_response["order_type"] == "market"
        assert buy_response["time_in_force"] == "day"
        assert buy_response["notional"] == Decimal("1505.00")
        assert buy_response["qty"] == Decimal("10")
        assert buy_response["filled_qty"] == Decimal("10")
        assert buy_response["filled_avg_price"] == Decimal("150.50")
        assert buy_response["commission"] == Decimal("0.0")
        assert buy_response["extended_hours"] is False

        # Test sell order mapping
        sell_response = map_order_to_response(sample_sell_order)
        assert sell_response["symbol"] == "TSLA"
        assert sell_response["side"] == "sell"
        assert sell_response["notional"] == Decimal("1253.75")
        assert sell_response["filled_avg_price"] == Decimal("250.75")

        # Test pending order mapping
        pending_response = map_order_to_response(sample_pending_order)
        assert pending_response["symbol"] == "MSFT"
        assert pending_response["status"] == "pending"
        assert pending_response["order_type"] == "limit"
        assert pending_response["limit_price"] == Decimal("400.00")
        assert pending_response["filled_qty"] is None
        assert pending_response["filled_avg_price"] is None
        assert pending_response["commission"] is None

    def test_map_order_to_response_edge_cases(self):
        """Test order mapping with edge cases."""
        # Test order with None values
        order = Mock(spec=Order)
        order.id = uuid.uuid4()
        order.client_order_id = "test-edge-case"
        order.created_at = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        order.updated_at = datetime(2024, 1, 15, 10, 31, 0, tzinfo=timezone.utc)
        order.submitted_at = None
        order.filled_at = None
        order.expired_at = None
        order.canceled_at = None
        order.failed_at = None
        order.replaced_at = None
        order.replaced_by = None
        order.replaces = None
        order.asset_id = None
        order.symbol = None
        order.asset_class = None
        order.notional = None
        order.qty = None
        order.filled_qty = None
        order.filled_avg_price = None
        order.order_class = None
        order.order_type = None
        order.type = None
        order.side = None
        order.time_in_force = None
        order.limit_price = None
        order.stop_price = None
        order.status = None
        order.extended_hours = False
        order.legs = None
        order.trail_percent = None
        order.trail_price = None
        order.hwm = None
        order.commission = None

        response = map_order_to_response(order)
        assert response["id"] == str(order.id)
        assert response["symbol"] is None
        assert response["side"] is None
        assert response["status"] is None
        assert response["notional"] is None
        assert response["qty"] is None
        assert response["filled_qty"] is None
        assert response["filled_avg_price"] is None
        assert response["commission"] is None

    def test_get_account_orders_status_filtering(self, mock_broker_client, mock_verify_api_key, sample_order):
        """Test order status filtering."""
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        account_id = str(uuid.uuid4())
        
        # Test closed status
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&status=closed")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].status == "closed"

        # Test open status
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&status=open")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].status == "open"

        # Test all status (default)
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&status=all")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].status is None

    def test_get_account_orders_pagination(self, mock_broker_client, mock_verify_api_key, sample_order):
        """Test order pagination parameters."""
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        account_id = str(uuid.uuid4())
        
        # Test with limit
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&limit=25")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].limit == 25

        # Test with direction
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&direction=asc")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].direction == "asc"

    def test_get_account_orders_symbols_filter(self, mock_broker_client, mock_verify_api_key, sample_order):
        """Test order symbols filtering."""
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        account_id = str(uuid.uuid4())
        
        # Test with single symbol
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&symbols=AAPL")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].symbols == ["AAPL"]

        # Test with multiple symbols
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&symbols=AAPL,TSLA,MSFT")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].symbols == ["AAPL", "TSLA", "MSFT"]

    def test_get_account_orders_nested_filter(self, mock_broker_client, mock_verify_api_key, sample_order):
        """Test nested orders filtering."""
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        account_id = str(uuid.uuid4())
        
        # Test with nested=true
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&nested=true")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].nested is True

        # Test with nested=false
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&nested=false")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].nested is False

    def test_get_account_orders_date_filtering(self, mock_broker_client, mock_verify_api_key, sample_order):
        """Test order date filtering."""
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        account_id = str(uuid.uuid4())
        
        # Test with after date
        response = client.get(
            f"/api/portfolio/{account_id}/orders"
            "?x-api-key=test-key"
            "&after=2024-01-01T00:00:00Z"
        )
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].after is not None

        # Test with until date
        response = client.get(
            f"/api/portfolio/{account_id}/orders"
            "?x-api-key=test-key"
            "&until=2024-01-31T23:59:59Z"
        )
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].until is not None

    def test_get_account_orders_large_limit(self, mock_broker_client, mock_verify_api_key, sample_order):
        """Test order retrieval with large limit."""
        mock_client = Mock()
        mock_broker_client.return_value = mock_client
        mock_client.get_orders_for_account.return_value = [sample_order]

        account_id = str(uuid.uuid4())
        
        # Test with large limit
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&limit=1000")
        assert response.status_code == 200
        
        call_args = mock_client.get_orders_for_account.call_args
        assert call_args[1]["filter"].limit == 1000

    def test_get_account_orders_malformed_request(self, mock_verify_api_key):
        """Test order retrieval with malformed request parameters."""
        account_id = str(uuid.uuid4())
        
        # Test with invalid limit
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&limit=invalid")
        assert response.status_code == 422  # Validation error

        # Test with invalid direction
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&direction=invalid")
        assert response.status_code == 422  # Validation error

        # Test with invalid nested parameter
        response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key&nested=invalid")
        assert response.status_code == 422  # Validation error

    def test_get_account_orders_broker_client_unavailable(self, mock_verify_api_key):
        """Test order retrieval when broker client is unavailable."""
        with patch('api_server.get_broker_client') as mock_get_client:
            mock_get_client.return_value = None
            
            account_id = str(uuid.uuid4())
            response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key")
            
            assert response.status_code == 503
            assert "Broker service unavailable" in response.json()["detail"]

    def test_get_account_orders_get_orders_request_unavailable(self, mock_broker_client, mock_verify_api_key):
        """Test order retrieval when GetOrdersRequest is unavailable."""
        with patch('api_server.GetOrdersRequest') as mock_request:
            mock_request.side_effect = ImportError("GetOrdersRequest not available")
            
            account_id = str(uuid.uuid4())
            response = client.get(f"/api/portfolio/{account_id}/orders?x-api-key=test-key")
            
            assert response.status_code == 503
            assert "Orders request type unavailable" in response.json()["detail"] 