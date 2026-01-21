"""
Tests for queued order execution logic.
"""

import sys
import types
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, Mock, patch

# Stub apscheduler modules for test environment
apscheduler_module = types.ModuleType('apscheduler')
apscheduler_schedulers = types.ModuleType('apscheduler.schedulers')
apscheduler_background = types.ModuleType('apscheduler.schedulers.background')
apscheduler_triggers = types.ModuleType('apscheduler.triggers')
apscheduler_triggers_cron = types.ModuleType('apscheduler.triggers.cron')
apscheduler_triggers_interval = types.ModuleType('apscheduler.triggers.interval')


class DummyScheduler:
    def add_job(self, *args, **kwargs):
        return None

    def start(self):
        return None

    def shutdown(self, wait=True):
        return None

    def get_jobs(self):
        return []


class DummyTrigger:
    def __init__(self, *args, **kwargs):
        pass


apscheduler_background.BackgroundScheduler = DummyScheduler
apscheduler_triggers_cron.CronTrigger = DummyTrigger
apscheduler_triggers_interval.IntervalTrigger = DummyTrigger

sys.modules.setdefault('apscheduler', apscheduler_module)
sys.modules.setdefault('apscheduler.schedulers', apscheduler_schedulers)
sys.modules.setdefault('apscheduler.schedulers.background', apscheduler_background)
sys.modules.setdefault('apscheduler.triggers', apscheduler_triggers)
sys.modules.setdefault('apscheduler.triggers.cron', apscheduler_triggers_cron)
sys.modules.setdefault('apscheduler.triggers.interval', apscheduler_triggers_interval)

from services.queued_order_executor import QueuedOrderExecutor


def _build_supabase_mock():
    supabase = MagicMock()
    table = supabase.table.return_value

    update_chain = table.update.return_value
    eq_chain = update_chain.eq.return_value
    eq_chain.eq.return_value = eq_chain
    eq_chain.execute.return_value = Mock(data=[{'id': 'order-123'}])

    # For status updates without double eq
    update_chain.eq.return_value.execute.return_value = Mock(data=[{'id': 'order-123'}])
    return supabase


@patch('services.queued_order_executor.get_supabase_client')
def test_execute_queued_order_uses_stored_parameters(mock_get_supabase):
    supabase = _build_supabase_mock()
    mock_get_supabase.return_value = supabase

    trading_service = MagicMock()
    trading_service.place_order.return_value = {'success': True, 'order': {'brokerage_order_id': 'br-123'}}

    executor = QueuedOrderExecutor(trading_service=trading_service)

    order = {
        'id': 'order-123',
        'user_id': 'user-456',
        'account_id': 'account-789',
        'symbol': 'AAPL',
        'action': 'BUY',
        'notional_value': 100.0,
        'units': None,
        'order_type': 'Limit',
        'time_in_force': 'Day',
        'price': 155.25,
        'stop_price': None,
        'after_hours_policy': 'queue_for_open',
        'extended_hours': False,
        'retry_count': 0
    }

    result = executor._execute_queued_order(order)

    assert result['success'] is True
    trading_service.place_order.assert_called_once()
    call_kwargs = trading_service.place_order.call_args.kwargs
    assert call_kwargs['order_type'] == 'Limit'
    assert call_kwargs['time_in_force'] == 'Day'
    assert call_kwargs['price'] == 155.25


@patch('services.queued_order_executor.get_supabase_client')
def test_execute_queued_order_cancels_if_older_than_5_days(mock_get_supabase):
    """Orders older than 5 days (120 hours) should be cancelled to handle weekends/holidays."""
    supabase = _build_supabase_mock()
    mock_get_supabase.return_value = supabase

    trading_service = MagicMock()
    executor = QueuedOrderExecutor(trading_service=trading_service)
    executor._notify_order_cancellation = Mock()

    # 121 hours = just over 5 days
    old_timestamp = (datetime.now(timezone.utc) - timedelta(hours=121)).isoformat()
    order = {
        'id': 'order-123',
        'user_id': 'user-456',
        'account_id': 'account-789',
        'symbol': 'AAPL',
        'action': 'BUY',
        'notional_value': 100.0,
        'units': None,
        'order_type': 'Limit',
        'time_in_force': 'Day',
        'price': 101.0,
        'stop_price': None,
        'after_hours_policy': 'queue_for_open',
        'extended_hours': False,
        'retry_count': 0,
        'created_at': old_timestamp,
        'last_price_at_creation': 100.0
    }

    result = executor._execute_queued_order(order)

    assert result['success'] is False
    assert result['stale'] is True
    assert result['reason'] == 'expired_stale'
    trading_service.place_order.assert_not_called()
    assert any(
        call.args[0].get('cancellation_reason') == 'expired_stale'
        for call in supabase.table.return_value.update.call_args_list
    )


@patch('services.queued_order_executor.get_supabase_client')
def test_execute_queued_order_cancels_if_price_deviation_exceeded(mock_get_supabase):
    supabase = _build_supabase_mock()
    mock_get_supabase.return_value = supabase

    trading_service = MagicMock()
    executor = QueuedOrderExecutor(trading_service=trading_service)
    executor._notify_order_cancellation = Mock()
    executor._get_current_price = Mock(return_value=115.0)

    recent_timestamp = datetime.now(timezone.utc).isoformat()
    order = {
        'id': 'order-123',
        'user_id': 'user-456',
        'account_id': 'account-789',
        'symbol': 'AAPL',
        'action': 'BUY',
        'notional_value': 100.0,
        'units': None,
        'order_type': 'Limit',
        'time_in_force': 'Day',
        'price': 101.0,
        'stop_price': None,
        'after_hours_policy': 'queue_for_open',
        'extended_hours': False,
        'retry_count': 0,
        'created_at': recent_timestamp,
        'last_price_at_creation': 100.0
    }

    result = executor._execute_queued_order(order)

    assert result['success'] is False
    assert result['stale'] is True
    assert result['reason'] == 'price_deviation_exceeded'
    trading_service.place_order.assert_not_called()
    assert any(
        call.args[0].get('cancellation_reason') == 'price_deviation_exceeded'
        for call in supabase.table.return_value.update.call_args_list
    )


@patch('services.queued_order_executor.get_supabase_client')
def test_execute_queued_order_allows_small_price_move(mock_get_supabase):
    supabase = _build_supabase_mock()
    mock_get_supabase.return_value = supabase

    trading_service = MagicMock()
    trading_service.place_order.return_value = {'success': True, 'order': {'brokerage_order_id': 'br-123'}}

    executor = QueuedOrderExecutor(trading_service=trading_service)
    executor._get_current_price = Mock(return_value=101.0)

    recent_timestamp = datetime.now(timezone.utc).isoformat()
    order = {
        'id': 'order-123',
        'user_id': 'user-456',
        'account_id': 'account-789',
        'symbol': 'AAPL',
        'action': 'BUY',
        'notional_value': 100.0,
        'units': None,
        'order_type': 'Limit',
        'time_in_force': 'Day',
        'price': 101.0,
        'stop_price': None,
        'after_hours_policy': 'queue_for_open',
        'extended_hours': False,
        'retry_count': 0,
        'created_at': recent_timestamp,
        'last_price_at_creation': 100.0
    }

    result = executor._execute_queued_order(order)

    assert result['success'] is True
    trading_service.place_order.assert_called_once()
    assert trading_service.place_order.call_args.kwargs['price'] == 101.0
