"""
Unit Tests for Background Service Manager

Tests the background service manager's leader election, retry logic,
monitoring, and graceful shutdown capabilities.

Following TDD principles:
- Test all public methods
- Test edge cases and error conditions
- Mock external dependencies (Redis, services)
- Verify correct behavior under all scenarios

Author: Clera AI
Date: 2025-10-07
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call
from services.background_service_manager import (
    BackgroundServiceManager,
    BackgroundServiceConfig,
    get_background_service_manager
)
from utils.leader_election import LeaderElectionService


class TestBackgroundServiceConfig:
    """Test BackgroundServiceConfig dataclass."""
    
    def test_config_initialization(self):
        """Test config initializes with correct defaults."""
        async def dummy_func():
            pass
        
        config = BackgroundServiceConfig(
            service_name="Test Service",
            service_func=dummy_func,
            leader_key="test:leader"
        )
        
        assert config.service_name == "Test Service"
        assert config.service_func == dummy_func
        assert config.leader_key == "test:leader"
        assert config.retry_interval == 10
        assert config.monitor_interval == 5
        assert config.jitter_range == (0.8, 1.2)
    
    def test_config_custom_values(self):
        """Test config accepts custom values."""
        async def dummy_func():
            pass
        
        config = BackgroundServiceConfig(
            service_name="Test",
            service_func=dummy_func,
            leader_key="test:leader",
            retry_interval=5,
            monitor_interval=3,
            jitter_range=(0.9, 1.1)
        )
        
        assert config.retry_interval == 5
        assert config.monitor_interval == 3
        assert config.jitter_range == (0.9, 1.1)


class TestBackgroundServiceManager:
    """Test BackgroundServiceManager class."""
    
    @pytest.mark.asyncio
    async def test_retry_until_leader_succeeds_first_try(self):
        """Test becoming leader on first attempt."""
        manager = BackgroundServiceManager()
        
        async def dummy_service():
            await asyncio.sleep(0.1)
        
        config = BackgroundServiceConfig(
            service_name="Test",
            service_func=dummy_service,
            leader_key="test:leader"
        )
        
        # Mock leader service to succeed immediately
        mock_leader = AsyncMock()
        mock_leader.try_become_leader = AsyncMock(return_value=True)
        mock_leader.is_leader = True
        
        with patch('services.background_service_manager.LeaderElectionService', return_value=mock_leader):
            await manager._retry_until_leader(mock_leader, config)
        
        # Should only try once
        assert mock_leader.try_become_leader.call_count == 1
    
    @pytest.mark.asyncio
    async def test_retry_until_leader_retries_on_failure(self):
        """Test retry logic when leader election fails initially."""
        manager = BackgroundServiceManager()
        
        async def dummy_service():
            pass
        
        config = BackgroundServiceConfig(
            service_name="Test",
            service_func=dummy_service,
            leader_key="test:leader",
            retry_interval=0.1  # Short for testing
        )
        
        # Mock leader service to fail 3 times, then succeed
        mock_leader = AsyncMock()
        mock_leader.try_become_leader = AsyncMock(
            side_effect=[False, False, False, True]
        )
        mock_leader.is_leader = True
        
        await manager._retry_until_leader(mock_leader, config)
        
        # Should try 4 times (3 failures + 1 success)
        assert mock_leader.try_become_leader.call_count == 4
    
    @pytest.mark.asyncio
    async def test_retry_handles_cancellation(self):
        """Test retry loop handles cancellation gracefully."""
        manager = BackgroundServiceManager()
        
        async def dummy_service():
            pass
        
        config = BackgroundServiceConfig(
            service_name="Test",
            service_func=dummy_service,
            leader_key="test:leader",
            retry_interval=1  # Long enough to cancel
        )
        
        mock_leader = AsyncMock()
        mock_leader.try_become_leader = AsyncMock(return_value=False)
        
        # Create task and cancel it during retry
        task = asyncio.create_task(
            manager._retry_until_leader(mock_leader, config)
        )
        
        await asyncio.sleep(0.1)  # Let it start
        task.cancel()
        
        with pytest.raises(asyncio.CancelledError):
            await task
    
    @pytest.mark.asyncio
    async def test_run_with_monitoring_detects_lost_leadership(self):
        """Test that monitoring detects and handles lost leadership."""
        manager = BackgroundServiceManager()
        
        service_called = False
        
        async def test_service():
            nonlocal service_called
            service_called = True
            await asyncio.sleep(1)  # Run long enough to be monitored
        
        config = BackgroundServiceConfig(
            service_name="Test",
            service_func=test_service,
            leader_key="test:leader",
            monitor_interval=0.1  # Check frequently for testing
        )
        
        mock_leader = AsyncMock()
        mock_leader.is_leader = True  # Start as leader
        
        mock_heartbeat = AsyncMock()
        
        # Simulate losing leadership after 0.2 seconds
        async def lose_leadership_after_delay():
            await asyncio.sleep(0.2)
            mock_leader.is_leader = False
        
        asyncio.create_task(lose_leadership_after_delay())
        
        # Should raise exception when leadership is lost
        with pytest.raises(Exception, match="lost leadership"):
            await manager._run_with_monitoring(
                mock_leader,
                config,
                mock_heartbeat
            )
        
        # Service should have been called
        assert service_called
    
    @pytest.mark.asyncio
    async def test_cleanup_releases_leadership(self):
        """Test cleanup properly releases leadership."""
        manager = BackgroundServiceManager()
        
        mock_leader = AsyncMock()
        mock_leader.release_leadership = AsyncMock()
        
        # Create actual asyncio task for heartbeat
        async def dummy_heartbeat():
            await asyncio.sleep(10)
        
        mock_heartbeat = asyncio.create_task(dummy_heartbeat())
        
        await manager._cleanup(mock_leader, mock_heartbeat, "Test Service")
        
        # Should cancel heartbeat and release leadership
        assert mock_heartbeat.cancelled()
        mock_leader.release_leadership.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_calculate_sleep_with_jitter(self):
        """Test jitter calculation is within expected range."""
        manager = BackgroundServiceManager()
        
        config = BackgroundServiceConfig(
            service_name="Test",
            service_func=lambda: asyncio.sleep(0),
            leader_key="test:leader",
            retry_interval=10,
            jitter_range=(0.8, 1.2)
        )
        
        # Calculate sleep time multiple times
        sleep_times = [
            manager._calculate_sleep_with_jitter(config)
            for _ in range(100)
        ]
        
        # All should be within jitter range
        assert all(8 <= t <= 12 for t in sleep_times), \
            f"Some sleep times outside range: {sleep_times}"
        
        # Should have some variation (not all the same)
        assert len(set(sleep_times)) > 10, "Not enough jitter variation"
    
    @pytest.mark.asyncio
    async def test_create_task_tracks_task(self):
        """Test that create_task adds task to running_tasks list."""
        manager = BackgroundServiceManager()
        
        async def dummy_service():
            await asyncio.sleep(0.1)
        
        config = BackgroundServiceConfig(
            service_name="Test",
            service_func=dummy_service,
            leader_key="test:leader"
        )
        
        # Mock the run_service_with_leader_election method
        with patch.object(manager, 'run_service_with_leader_election', new_callable=AsyncMock):
            task = manager.create_task(config)
        
        assert task in manager.running_tasks
        assert len(manager.running_tasks) == 1
    
    @pytest.mark.asyncio
    async def test_shutdown_all_cancels_tasks(self):
        """Test shutdown_all cancels all running tasks."""
        manager = BackgroundServiceManager()
        
        # Create mock tasks
        task1 = AsyncMock()
        task1.done = MagicMock(return_value=False)
        task1.cancel = MagicMock()
        
        task2 = AsyncMock()
        task2.done = MagicMock(return_value=False)
        task2.cancel = MagicMock()
        
        manager.running_tasks = [task1, task2]
        
        with patch('asyncio.gather', new_callable=AsyncMock):
            await manager.shutdown_all()
        
        # Both tasks should be cancelled
        task1.cancel.assert_called_once()
        task2.cancel.assert_called_once()
        
        # Running tasks should be cleared
        assert len(manager.running_tasks) == 0
    
    @pytest.mark.asyncio
    async def test_full_lifecycle_integration(self):
        """Integration test: full service lifecycle with leader election."""
        manager = BackgroundServiceManager()
        
        service_started = False
        service_completed = False
        
        async def test_service():
            nonlocal service_started, service_completed
            service_started = True
            await asyncio.sleep(0.1)
            service_completed = True
        
        config = BackgroundServiceConfig(
            service_name="Integration Test Service",
            service_func=test_service,
            leader_key="test:integration:leader",
            retry_interval=0.1,
            monitor_interval=0.05
        )
        
        # Mock leader service
        mock_leader = AsyncMock()
        mock_leader.try_become_leader = AsyncMock(return_value=True)
        mock_leader.is_leader = True
        mock_leader.start_heartbeat = AsyncMock(return_value=asyncio.sleep(10))
        mock_leader.release_leadership = AsyncMock()
        
        with patch('services.background_service_manager.LeaderElectionService', return_value=mock_leader):
            # Run service
            await manager.run_service_with_leader_election(config)
        
        # Service should have run
        assert service_started
        assert service_completed
        
        # Leadership should have been released
        mock_leader.release_leadership.assert_called_once()


class TestSingletonPattern:
    """Test get_background_service_manager singleton."""
    
    def test_get_background_service_manager_returns_singleton(self):
        """Test that get_background_service_manager returns same instance."""
        manager1 = get_background_service_manager()
        manager2 = get_background_service_manager()
        
        assert manager1 is manager2
    
    def test_singleton_state_persists(self):
        """Test that singleton state persists across calls."""
        manager = get_background_service_manager()
        
        # Add a mock task
        task = AsyncMock()
        manager.running_tasks.append(task)
        
        # Get manager again
        manager2 = get_background_service_manager()
        
        # Should have the same task
        assert task in manager2.running_tasks


class TestLoggingBehavior:
    """Test logging outputs correct messages."""
    
    def test_log_retry_attempt_first_attempt(self, caplog):
        """Test logging for first retry attempt."""
        manager = BackgroundServiceManager()
        
        config = BackgroundServiceConfig(
            service_name="Test Service",
            service_func=lambda: asyncio.sleep(0),
            leader_key="test:leader"
        )
        
        with caplog.at_level("INFO"):
            manager._log_retry_attempt(1, config)
        
        assert "Test Service" in caplog.text
        assert "NOT the leader" in caplog.text
    
    def test_log_retry_attempt_warning_after_minute(self, caplog):
        """Test warning log after 1 minute of retries."""
        manager = BackgroundServiceManager()
        
        config = BackgroundServiceConfig(
            service_name="Test Service",
            service_func=lambda: asyncio.sleep(0),
            leader_key="test:leader",
            retry_interval=10
        )
        
        with caplog.at_level("WARNING"):
            manager._log_retry_attempt(6, config)  # 6 * 10s = 60s
        
        assert "Still waiting" in caplog.text
        assert "60s" in caplog.text


class TestErrorHandling:
    """Test error handling in various scenarios."""
    
    @pytest.mark.asyncio
    async def test_service_exception_handled_gracefully(self):
        """Test that exceptions in service are logged and re-raised."""
        manager = BackgroundServiceManager()
        
        async def failing_service():
            raise ValueError("Service failed!")
        
        config = BackgroundServiceConfig(
            service_name="Failing Service",
            service_func=failing_service,
            leader_key="test:error:leader",
            monitor_interval=0.05
        )
        
        mock_leader = AsyncMock()
        mock_leader.try_become_leader = AsyncMock(return_value=True)
        mock_leader.is_leader = True
        mock_leader.start_heartbeat = AsyncMock(return_value=asyncio.sleep(10))
        mock_leader.release_leadership = AsyncMock()
        
        with patch('services.background_service_manager.LeaderElectionService', return_value=mock_leader):
            # Should raise ValueError after logging
            with pytest.raises(ValueError, match="Service failed!"):
                await manager.run_service_with_leader_election(config)
        
        # Leadership should still be released even after exception
        mock_leader.release_leadership.assert_called_once()

