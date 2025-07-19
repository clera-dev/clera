import pytest
import uuid
from unittest.mock import Mock, patch
from datetime import datetime, timezone
from decimal import Decimal

from utils.alpaca.portfolio_mapping import map_order_to_response

class TestOrderMappingDirect:
    """Direct test of order mapping functionality."""

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

    def test_map_order_to_response_success(self, sample_order):
        """Test successful order mapping."""
        result = map_order_to_response(sample_order)
        
        # Assertions
        assert result.id == sample_order.id
        assert result.symbol == "AAPL"
        assert result.side == "buy"
        assert result.status == "filled"
        assert result.qty == Decimal("10")
        assert result.filled_qty == Decimal("10")
        assert result.filled_avg_price == Decimal("150.50")
        assert result.notional == Decimal("1505.00")

    def test_map_order_to_response_with_none_values(self):
        """Test order mapping with None values."""
        order = Mock()
        order.id = str(uuid.uuid4())
        order.client_order_id = "test-order-id"
        order.created_at = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        order.updated_at = datetime(2024, 1, 15, 10, 31, 0, tzinfo=timezone.utc)
        order.submitted_at = datetime(2024, 1, 15, 10, 30, 30, tzinfo=timezone.utc)
        order.filled_at = None
        order.expired_at = None
        order.canceled_at = None
        order.failed_at = None
        order.replaced_at = None
        order.replaced_by = None
        order.replaces = None
        order.asset_id = str(uuid.uuid4())
        order.symbol = "TSLA"
        order.notional = None
        order.qty = "5"
        order.filled_qty = None
        order.filled_avg_price = None
        order.order_class = None
        order.commission = None
        order.extended_hours = False
        order.legs = None
        order.trail_percent = None
        order.trail_price = None
        order.hwm = None
        
        # Mock enum fields with .value
        order.asset_class = Mock()
        order.asset_class.value = "us_equity"
        order.order_type = Mock()
        order.order_type.value = "limit"
        order.type = Mock()
        order.type.value = "limit"
        order.side = Mock()
        order.side.value = "sell"
        order.time_in_force = Mock()
        order.time_in_force.value = "day"
        order.status = Mock()
        order.status.value = "pending"
        order.limit_price = "250.00"
        order.stop_price = None
        
        result = map_order_to_response(order)
        
        # Assertions
        assert result.id == order.id
        assert result.symbol == "TSLA"
        assert result.side == "sell"
        assert result.status == "pending"
        assert result.qty == Decimal("5")
        assert result.filled_qty is None
        assert result.filled_avg_price is None
        assert result.notional is None
        assert result.limit_price == Decimal("250.00")

    def test_map_order_to_response_edge_cases(self):
        """Test order mapping with edge cases."""
        order = Mock()
        order.id = str(uuid.uuid4())
        order.client_order_id = None
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
        order.asset_id = str(uuid.uuid4())
        order.symbol = "MSFT"
        order.notional = "0.00"
        order.qty = "0"
        order.filled_qty = "0"
        order.filled_avg_price = "0.00"
        order.order_class = None
        order.commission = 0.0
        order.extended_hours = True
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
        order.status.value = "canceled"
        order.limit_price = None
        order.stop_price = None
        
        result = map_order_to_response(order)
        
        # Assertions
        assert result.id == order.id
        assert result.symbol == "MSFT"
        assert result.side == "buy"
        assert result.status == "canceled"
        assert result.qty == Decimal("0")
        assert result.filled_qty == Decimal("0")
        assert result.filled_avg_price == Decimal("0.00")
        assert result.notional == Decimal("0.00")
        assert result.extended_hours is True 