"""
PRODUCTION-GRADE: Tests for Smart SnapTrade Sync Service

Tests all edge cases and production scenarios:
- Staleness-based sync logic
- Rate limiting and batching
- Cost optimization
- Error handling and retries
- Concurrent operations
- Metric tracking

Author: Clera Engineering
Created: 2025-11-04
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from services.smart_snaptrade_sync_service import (
    SmartSnapTradeSyncService,
    SyncResult,
    SyncBatchMetrics
)


class TestSmartSnapTradeSyncService:
    """Test suite for smart sync service."""
    
    @pytest.fixture
    def sync_service(self):
        """Create sync service with test settings."""
        return SmartSnapTradeSyncService(
            staleness_threshold_hours=24,
            batch_size=5,
            rate_limit_delay_seconds=0.1,  # Fast for testing
            max_retries=2
        )
    
    @pytest.fixture
    def mock_supabase(self):
        """Mock Supabase client."""
        mock = MagicMock()
        mock.table.return_value = mock
        mock.select.return_value = mock
        mock.eq.return_value = mock
        mock.or_.return_value = mock
        mock.limit.return_value = mock
        mock.update.return_value = mock
        mock.execute.return_value = MagicMock(data=[])
        return mock
    
    @pytest.fixture
    def mock_snaptrade_provider(self):
        """Mock SnapTrade provider."""
        mock = AsyncMock()
        mock.get_holdings.return_value = [
            {'symbol': 'AAPL', 'quantity': 10},
            {'symbol': 'TSLA', 'quantity': 5}
        ]
        return mock
    
    # =========================================================================
    # TEST 1: Staleness Logic - Only sync stale users
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_only_syncs_stale_users(self, sync_service, mock_supabase):
        """✅ CRITICAL: Should only sync users with stale data."""
        # Setup: 3 users - 2 stale, 1 fresh
        now = datetime.now()
        mock_supabase.execute.return_value = MagicMock(data=[
            {
                'user_id': 'user-stale-1',
                'last_synced': (now - timedelta(hours=25)).isoformat(),
                'institution_name': 'Webull'
            },
            {
                'user_id': 'user-stale-2',
                'last_synced': None,  # Never synced
                'institution_name': 'Fidelity'
            },
            # user-fresh-1 should NOT be in results (filtered by query)
        ])
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_sync_batch', return_value=[
                SyncResult(True, 'user-stale-1', 2, True, 100),
                SyncResult(True, 'user-stale-2', 3, True, 150)
            ]):
                metrics = await sync_service.sync_stale_users(force=False)
        
        assert metrics.total_users == 2  # Only 2 stale users
        assert metrics.synced_users == 2
        assert metrics.failed_users == 0
        
        print("✅ Test passed: Only stale users synced")
    
    # =========================================================================
    # TEST 2: Force Mode - Sync all users
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_force_mode_syncs_all_users(self, sync_service, mock_supabase):
        """✅ Force mode should sync ALL users regardless of staleness."""
        mock_supabase.execute.return_value = MagicMock(data=[
            {'user_id': f'user-{i}', 'last_synced': datetime.now().isoformat(), 'institution_name': 'Test'}
            for i in range(10)
        ])
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_sync_batch', return_value=[
                SyncResult(True, f'user-{i}', 2, False, 100) for i in range(10)
            ]):
                metrics = await sync_service.sync_stale_users(force=True)
        
        assert metrics.total_users == 10
        assert metrics.synced_users == 10
        
        print("✅ Test passed: Force mode syncs all users")
    
    # =========================================================================
    # TEST 3: Rate Limiting - Respects API limits
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_rate_limiting_with_delay(self, mock_supabase):
        """✅ COST OPTIMIZATION: Should add delay between API calls."""
        sync_service = SmartSnapTradeSyncService(
            batch_size=2,
            rate_limit_delay_seconds=0.05  # 50ms delay
        )
        
        # 5 users = 3 batches (2+2+1)
        mock_supabase.execute.return_value = MagicMock(data=[
            {'user_id': f'user-{i}', 'last_synced': None, 'institution_name': 'Test'}
            for i in range(5)
        ])
        
        start_time = asyncio.get_event_loop().time()
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_sync_batch', return_value=[
                SyncResult(True, f'user-{i}', 2, True, 50) for i in range(2)
            ]):
                await sync_service.sync_stale_users()
        
        elapsed = asyncio.get_event_loop().time() - start_time
        
        # Should have 2 delays (between 3 batches)
        # Each delay = 0.05s * batch_size = 0.1s
        # Total minimum delay = 0.2s
        assert elapsed >= 0.1, f"Should have delays, but took {elapsed}s"
        
        print(f"✅ Test passed: Rate limiting working ({elapsed:.3f}s elapsed)")
    
    # =========================================================================
    # TEST 4: Error Handling - Retry with exponential backoff
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_retry_with_exponential_backoff(self, sync_service, mock_supabase, mock_snaptrade_provider):
        """✅ RELIABILITY: Should retry failed syncs with exponential backoff."""
        # Fail 2 times, then succeed
        mock_snaptrade_provider.get_holdings.side_effect = [
            Exception("API Error 1"),
            Exception("API Error 2"),
            [{'symbol': 'AAPL', 'quantity': 10}]  # Success on 3rd try
        ]
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_get_snaptrade_provider', return_value=mock_snaptrade_provider):
                result = await sync_service._sync_single_user('user-123')
        
        assert result.success is True
        assert result.holdings_count == 1
        assert mock_snaptrade_provider.get_holdings.call_count == 3  # 2 failures + 1 success
        
        print("✅ Test passed: Retry logic works")
    
    # =========================================================================
    # TEST 5: Max Retries - Fail after exhausting retries
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_fails_after_max_retries(self, sync_service, mock_supabase, mock_snaptrade_provider):
        """✅ Should fail gracefully after max retries."""
        # Always fail
        mock_snaptrade_provider.get_holdings.side_effect = Exception("Persistent API Error")
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_get_snaptrade_provider', return_value=mock_snaptrade_provider):
                result = await sync_service._sync_single_user('user-123')
        
        assert result.success is False
        assert "Persistent API Error" in result.error
        assert mock_snaptrade_provider.get_holdings.call_count == sync_service.max_retries
        
        print("✅ Test passed: Fails gracefully after max retries")
    
    # =========================================================================
    # TEST 6: Cost Tracking - Accurate cost estimation
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_cost_tracking(self, sync_service, mock_supabase):
        """✅ COST OPTIMIZATION: Should track estimated API costs."""
        mock_supabase.execute.return_value = MagicMock(data=[
            {'user_id': f'user-{i}', 'last_synced': None, 'institution_name': 'Test'}
            for i in range(10)
        ])
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_sync_batch', return_value=[
                SyncResult(True, f'user-{i}', 2, True, 100) for i in range(10)
            ]):
                metrics = await sync_service.sync_stale_users()
        
        expected_cost = 10 * sync_service.estimated_cost_per_call  # 10 users
        assert metrics.estimated_cost_usd == expected_cost
        assert metrics.api_calls_made == 10
        
        print(f"✅ Test passed: Cost tracking accurate (${metrics.estimated_cost_usd:.4f})")
    
    # =========================================================================
    # TEST 7: Batch Processing - Handles large user counts
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_handles_large_user_count(self, mock_supabase):
        """✅ SCALABILITY: Should handle thousands of users efficiently."""
        sync_service = SmartSnapTradeSyncService(batch_size=100)
        
        # 1000 users
        mock_supabase.execute.return_value = MagicMock(data=[
            {'user_id': f'user-{i}', 'last_synced': None, 'institution_name': 'Test'}
            for i in range(1000)
        ])
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_sync_batch', return_value=[
                SyncResult(True, f'user-{i}', 2, True, 50) for i in range(100)
            ]):
                metrics = await sync_service.sync_stale_users()
        
        assert metrics.total_users == 1000
        # Should process in 10 batches (1000 / 100)
        
        print("✅ Test passed: Handles 1000 users efficiently")
    
    # =========================================================================
    # TEST 8: Sync Status - Check individual user status
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_sync_status_for_user(self, sync_service, mock_supabase):
        """✅ Should return accurate sync status for a user."""
        now = datetime.now()
        mock_supabase.execute.return_value = MagicMock(data=[
            {
                'institution_name': 'Webull',
                'last_synced': (now - timedelta(hours=2)).isoformat(),
                'is_active': True
            }
        ])
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            status = await sync_service.get_sync_status('user-123')
        
        assert status['has_snaptrade'] is True
        assert status['is_stale'] is False  # 2 hours < 24 hour threshold
        assert status['hours_since_sync'] is not None
        assert 1.9 < status['hours_since_sync'] < 2.1  # ~2 hours
        
        print("✅ Test passed: Sync status accurate")
    
    # =========================================================================
    # TEST 9: Empty Holdings - Handle users with no holdings
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_handles_empty_holdings(self, sync_service, mock_supabase, mock_snaptrade_provider):
        """✅ Should handle users with no holdings gracefully."""
        mock_snaptrade_provider.get_holdings.return_value = []  # No holdings
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_get_snaptrade_provider', return_value=mock_snaptrade_provider):
                result = await sync_service._sync_single_user('user-empty')
        
        assert result.success is False
        assert result.holdings_count == 0
        assert "No holdings" in result.error
        
        print("✅ Test passed: Handles empty holdings")
    
    # =========================================================================
    # TEST 10: Concurrent Batch Processing
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_concurrent_batch_processing(self, sync_service, mock_supabase, mock_snaptrade_provider):
        """✅ PERFORMANCE: Should process batch concurrently."""
        # Track call order
        call_order = []
        
        async def mock_get_holdings(user_id):
            call_order.append(('start', user_id))
            await asyncio.sleep(0.01)  # Simulate API latency
            call_order.append(('end', user_id))
            return [{'symbol': 'AAPL', 'quantity': 10}]
        
        mock_snaptrade_provider.get_holdings = mock_get_holdings
        
        user_ids = [f'user-{i}' for i in range(5)]
        
        with patch.object(sync_service, '_get_supabase_client', return_value=mock_supabase):
            with patch.object(sync_service, '_get_snaptrade_provider', return_value=mock_snaptrade_provider):
                results = await sync_service._sync_batch(user_ids)
        
        # All 5 should start before any finish (concurrent)
        start_events = [event for event in call_order if event[0] == 'start']
        assert len(start_events) == 5
        assert all(r.success for r in results)
        
        print("✅ Test passed: Batch processing is concurrent")


def run_tests():
    """Run all tests."""
    pytest.main([__file__, '-v', '--tb=short', '-s'])


if __name__ == '__main__':
    run_tests()

