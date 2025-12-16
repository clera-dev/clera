"""
Leader Election Service for Background Tasks

Ensures only ONE ECS task runs background services at a time,
even during deployments when multiple tasks are running.

Uses Redis for distributed leader election with automatic failover.
"""

import asyncio
import logging
import os
import uuid
from typing import Optional
from datetime import datetime, timedelta
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

class LeaderElectionService:
    """
    Distributed leader election using Redis.
    
    Ensures only one instance of background services runs across
    all ECS tasks, even during rolling deployments.
    """
    
    def __init__(
        self,
        redis_host: Optional[str] = None,
        redis_port: Optional[int] = None,
        leader_key: str = "portfolio:background_services:leader",
        lease_duration: int = 30,  # Seconds
        heartbeat_interval: int = 10  # Seconds
    ):
        """
        Initialize leader election service.
        
        Args:
            redis_host: Redis host (defaults to env var)
            redis_port: Redis port (defaults to env var)
            leader_key: Redis key for leader election
            lease_duration: How long leader lease lasts (seconds)
            heartbeat_interval: How often to renew lease (seconds)
        """
        self.redis_host = redis_host or os.getenv('REDIS_HOST', 'localhost')
        self.redis_port = redis_port or int(os.getenv('REDIS_PORT', '6379'))
        self.leader_key = leader_key
        self.lease_duration = lease_duration
        self.heartbeat_interval = heartbeat_interval
        
        # Unique ID for this instance
        self.instance_id = str(uuid.uuid4())
        
        # Redis client
        self.redis: Optional[aioredis.Redis] = None
        
        # Leader state
        self.is_leader = False
        self.heartbeat_task: Optional[asyncio.Task] = None
    
    async def connect(self):
        """Connect to Redis."""
        if self.redis is None:
            self.redis = await aioredis.from_url(
                f"redis://{self.redis_host}:{self.redis_port}",
                encoding="utf-8",
                decode_responses=True
            )
            logger.info(f"Leader election service connected to Redis at {self.redis_host}:{self.redis_port}")
    
    async def try_become_leader(self) -> bool:
        """
        Attempt to become the leader.
        
        Returns:
            True if this instance is now the leader, False otherwise
        """
        await self.connect()
        
        # Try to set the leader key with NX (only if not exists) and EX (expiration)
        # This is atomic in Redis
        was_set = await self.redis.set(
            self.leader_key,
            self.instance_id,
            nx=True,  # Only set if key doesn't exist
            ex=self.lease_duration  # Expire after lease_duration seconds
        )
        
        if was_set:
            self.is_leader = True
            logger.info(f"🎖️  Instance {self.instance_id[:8]} became LEADER for background services")
            return True
        else:
            # Check if we're already the leader (lease renewal)
            current_leader = await self.redis.get(self.leader_key)
            if current_leader == self.instance_id:
                # We're already the leader, renew lease
                await self.redis.expire(self.leader_key, self.lease_duration)
                self.is_leader = True
                return True
            else:
                self.is_leader = False
                return False
    
    async def renew_leadership(self) -> bool:
        """
        Renew leadership lease.
        
        Returns:
            True if still leader, False if lost leadership
        """
        await self.connect()
        
        current_leader = await self.redis.get(self.leader_key)
        
        if current_leader == self.instance_id:
            # We're still the leader, renew lease
            await self.redis.expire(self.leader_key, self.lease_duration)
            return True
        else:
            # Lost leadership
            self.is_leader = False
            logger.warning(f"⚠️  Instance {self.instance_id[:8]} LOST leadership")
            return False
    
    async def release_leadership(self):
        """Release leadership (e.g., during shutdown)."""
        if self.is_leader:
            await self.connect()
            
            # Only release if we're still the leader
            current_leader = await self.redis.get(self.leader_key)
            if current_leader == self.instance_id:
                await self.redis.delete(self.leader_key)
                logger.info(f"Instance {self.instance_id[:8]} released leadership")
            
            self.is_leader = False
    
    async def start_heartbeat(self):
        """Start heartbeat loop to maintain leadership."""
        while self.is_leader:
            try:
                await asyncio.sleep(self.heartbeat_interval)
                
                if not await self.renew_leadership():
                    logger.error(f"Instance {self.instance_id[:8]} lost leadership, stopping heartbeat")
                    break
                else:
                    logger.debug(f"Leader heartbeat: Instance {self.instance_id[:8]} renewed lease")
            
            except Exception as e:
                logger.error(f"Error in leader heartbeat: {e}")
                self.is_leader = False
                break
    
    async def run_as_leader(self, task_func, *args, **kwargs):
        """
        Run a task only if this instance is the leader.
        
        Automatically handles leader election and heartbeat.
        
        Args:
            task_func: Async function to run as leader
            *args, **kwargs: Arguments to pass to task_func
        """
        # Try to become leader
        if not await self.try_become_leader():
            logger.info(f"Instance {self.instance_id[:8]} is NOT leader, skipping background task")
            return
        
        # Start heartbeat in background
        self.heartbeat_task = asyncio.create_task(self.start_heartbeat())
        
        try:
            # Run the task
            logger.info(f"Instance {self.instance_id[:8]} running background task as LEADER")
            await task_func(*args, **kwargs)
        finally:
            # Cleanup
            if self.heartbeat_task:
                self.heartbeat_task.cancel()
                try:
                    await self.heartbeat_task
                except asyncio.CancelledError:
                    pass
            
            await self.release_leadership()
    
    async def close(self):
        """Close Redis connection."""
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
        
        await self.release_leadership()
        
        if self.redis:
            await self.redis.close()


# Global instance
_leader_election_service: Optional[LeaderElectionService] = None

def get_leader_election_service() -> LeaderElectionService:
    """Get the global leader election service instance."""
    global _leader_election_service
    if _leader_election_service is None:
        _leader_election_service = LeaderElectionService()
    return _leader_election_service

