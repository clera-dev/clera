"""
Tests for Leader Election Service

Verifies that only one instance runs background services,
even during deployments or with multiple tasks.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from utils.leader_election import LeaderElectionService, get_leader_election_service


class TestLeaderElection:
    """Test leader election service"""
    
    @pytest.mark.asyncio
    async def test_first_instance_becomes_leader(self):
        """Test that first instance to try becomes leader"""
        service = LeaderElectionService()
        
        # Mock Redis
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock(return_value=True)  # SET NX succeeds
        service.redis = mock_redis
        
        result = await service.try_become_leader()
        
        assert result is True
        assert service.is_leader is True
        mock_redis.set.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_second_instance_cannot_become_leader(self):
        """Test that second instance cannot acquire leadership"""
        service = LeaderElectionService()
        
        # Mock Redis - leader key already exists
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock(return_value=False)  # SET NX fails (key exists)
        mock_redis.get = AsyncMock(return_value="different-instance-id")
        service.redis = mock_redis
        
        result = await service.try_become_leader()
        
        assert result is False
        assert service.is_leader is False
    
    @pytest.mark.asyncio
    async def test_leader_can_renew_lease(self):
        """Test that leader can renew its lease"""
        service = LeaderElectionService()
        service.is_leader = True
        
        # Mock Redis
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=service.instance_id)
        mock_redis.expire = AsyncMock()
        service.redis = mock_redis
        
        result = await service.renew_leadership()
        
        assert result is True
        assert service.is_leader is True
        mock_redis.expire.assert_called_once_with(
            service.leader_key,
            service.lease_duration
        )
    
    @pytest.mark.asyncio
    async def test_leader_loses_leadership_if_key_changes(self):
        """Test that leader detects when it loses leadership"""
        service = LeaderElectionService()
        service.is_leader = True
        
        # Mock Redis - leader key now belongs to different instance
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value="different-instance-id")
        service.redis = mock_redis
        
        result = await service.renew_leadership()
        
        assert result is False
        assert service.is_leader is False
    
    @pytest.mark.asyncio
    async def test_release_leadership(self):
        """Test that leader can release leadership"""
        service = LeaderElectionService()
        service.is_leader = True
        
        # Mock Redis
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=service.instance_id)
        mock_redis.delete = AsyncMock()
        service.redis = mock_redis
        
        await service.release_leadership()
        
        assert service.is_leader is False
        mock_redis.delete.assert_called_once_with(service.leader_key)
    
    @pytest.mark.asyncio
    async def test_release_leadership_only_if_still_leader(self):
        """Test that instance only releases if it's still the leader"""
        service = LeaderElectionService()
        service.is_leader = True
        
        # Mock Redis - leader key belongs to different instance
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value="different-instance-id")
        mock_redis.delete = AsyncMock()
        service.redis = mock_redis
        
        await service.release_leadership()
        
        # Should not delete if not leader
        mock_redis.delete.assert_not_called()
        assert service.is_leader is False
    
    @pytest.mark.asyncio
    async def test_leader_election_uses_different_keys(self):
        """Test that different services can have different leader keys"""
        service1 = LeaderElectionService(leader_key="service1:leader")
        service2 = LeaderElectionService(leader_key="service2:leader")
        
        # Mock Redis for both
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock(return_value=True)
        
        service1.redis = mock_redis
        service2.redis = mock_redis
        
        await service1.try_become_leader()
        await service2.try_become_leader()
        
        # Both should become leaders (different keys)
        assert service1.is_leader is True
        assert service2.is_leader is True
    
    @pytest.mark.asyncio
    async def test_run_as_leader_only_runs_if_leader(self):
        """Test that run_as_leader only executes task if instance is leader"""
        service = LeaderElectionService()
        
        # Mock Redis
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock(return_value=True)  # Become leader
        mock_redis.get = AsyncMock(return_value=service.instance_id)
        mock_redis.delete = AsyncMock()
        service.redis = mock_redis
        
        # Track if task was called
        task_called = False
        
        async def test_task():
            nonlocal task_called
            task_called = True
            await asyncio.sleep(0.1)
        
        await service.run_as_leader(test_task)
        
        assert task_called is True
    
    @pytest.mark.asyncio
    async def test_run_as_leader_skips_if_not_leader(self):
        """Test that run_as_leader skips task if instance is not leader"""
        service = LeaderElectionService()
        
        # Mock Redis - cannot become leader
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock(return_value=False)
        mock_redis.get = AsyncMock(return_value="different-instance-id")
        service.redis = mock_redis
        
        # Track if task was called
        task_called = False
        
        async def test_task():
            nonlocal task_called
            task_called = True
        
        await service.run_as_leader(test_task)
        
        # Task should not run
        assert task_called is False
    
    @pytest.mark.asyncio
    async def test_global_service_instance(self):
        """Test that get_leader_election_service returns singleton"""
        service1 = get_leader_election_service()
        service2 = get_leader_election_service()
        
        assert service1 is service2


class TestLeaderElectionInProduction:
    """Test production scenarios"""
    
    @pytest.mark.asyncio
    async def test_rolling_deployment_scenario(self):
        """
        Simulate ECS rolling deployment:
        - Old task is leader
        - New task starts
        - New task cannot become leader (old still running)
        - Old task shuts down and releases lock
        - New task becomes leader
        """
        old_task = LeaderElectionService()
        new_task = LeaderElectionService()
        
        # Mock Redis
        mock_redis = AsyncMock()
        
        # Simulate old task becoming leader first
        mock_redis.set = AsyncMock(return_value=True)
        old_task.redis = mock_redis
        assert await old_task.try_become_leader() is True
        
        # Now new task tries to become leader (should fail)
        mock_redis.set = AsyncMock(return_value=False)  # SET NX fails
        mock_redis.get = AsyncMock(return_value=old_task.instance_id)
        new_task.redis = mock_redis
        assert await new_task.try_become_leader() is False
        
        # Old task releases leadership (shutdown)
        mock_redis.get = AsyncMock(return_value=old_task.instance_id)
        mock_redis.delete = AsyncMock()
        await old_task.release_leadership()
        assert old_task.is_leader is False
        
        # New task can now become leader
        mock_redis.set = AsyncMock(return_value=True)
        mock_redis.get = AsyncMock(return_value=new_task.instance_id)
        assert await new_task.try_become_leader() is True
        assert new_task.is_leader is True
    
    @pytest.mark.asyncio
    async def test_leader_crash_failover(self):
        """
        Simulate leader crash:
        - Task 1 is leader
        - Task 1 crashes (doesn't release lock)
        - Lock expires after 30 seconds
        - Task 2 becomes leader
        """
        task1 = LeaderElectionService()
        task2 = LeaderElectionService()
        
        # Mock Redis
        mock_redis = AsyncMock()
        
        # Task 1 becomes leader
        mock_redis.set = AsyncMock(return_value=True)
        task1.redis = mock_redis
        await task1.try_become_leader()
        assert task1.is_leader is True
        
        # Task 1 crashes (doesn't release lock)
        # Simulate lock expiration - Redis returns None
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.set = AsyncMock(return_value=True)  # SET NX succeeds
        
        # Task 2 can now become leader (lock expired)
        task2.redis = mock_redis
        await task2.try_become_leader()
        assert task2.is_leader is True
    
    @pytest.mark.asyncio
    async def test_multiple_tasks_only_one_leader(self):
        """
        Test that with 5 tasks running, only 1 becomes leader
        """
        tasks = [LeaderElectionService() for _ in range(5)]
        
        # Mock Redis
        mock_redis = AsyncMock()
        
        # First task becomes leader
        first_task_id = tasks[0].instance_id
        mock_redis.set = AsyncMock(side_effect=[True, False, False, False, False])
        mock_redis.get = AsyncMock(return_value=first_task_id)
        
        for task in tasks:
            task.redis = mock_redis
        
        # All tasks try to become leader
        results = await asyncio.gather(*[task.try_become_leader() for task in tasks])
        
        # Only first should succeed
        assert results[0] is True
        assert all(r is False for r in results[1:])
        
        # Only first should be leader
        assert tasks[0].is_leader is True
        assert all(not task.is_leader for task in tasks[1:])

