"""
Background Service Manager with Leader Election

Manages background services (intraday tracker, daily scheduler) with
distributed leader election using Redis.

Follows SOLID principles:
- Single Responsibility: Manages background service lifecycle
- Dependency Injection: Services injected, not hardcoded
- Testability: All methods are independently testable
- Modularity: Separate concerns for retry, monitoring, lifecycle

Author: Clera AI
Date: 2025-10-07
"""

import asyncio
import logging
import random
from typing import Callable, Awaitable, Optional, List
from utils.leader_election import LeaderElectionService

logger = logging.getLogger(__name__)


class BackgroundServiceConfig:
    """Configuration for background service with leader election."""
    
    def __init__(
        self,
        service_name: str,
        service_func: Callable[[], Awaitable[None]],
        leader_key: str,
        retry_interval: int = 10,
        monitor_interval: int = 5,
        jitter_range: tuple = (0.8, 1.2)
    ):
        """
        Initialize background service configuration.
        
        Args:
            service_name: Human-readable service name for logging
            service_func: Async function to run as leader
            leader_key: Redis key for leader election
            retry_interval: Base interval between retry attempts (seconds)
            monitor_interval: How often to check leadership status (seconds)
            jitter_range: (min, max) multipliers for retry jitter
        """
        self.service_name = service_name
        self.service_func = service_func
        self.leader_key = leader_key
        self.retry_interval = retry_interval
        self.monitor_interval = monitor_interval
        self.jitter_range = jitter_range


class BackgroundServiceManager:
    """
    Manages background services with leader election.
    
    Responsibilities:
    - Retry logic for becoming leader
    - Continuous leadership monitoring
    - Graceful shutdown handling
    - Logging and observability
    
    Design Principles:
    - Dependency Injection: Services are passed in, not created
    - Single Responsibility: Only manages service lifecycle
    - Testability: All methods can be mocked/tested independently
    """
    
    def __init__(self):
        """Initialize the background service manager."""
        self.running_tasks: List[asyncio.Task] = []
    
    async def run_service_with_leader_election(
        self,
        config: BackgroundServiceConfig
    ) -> None:
        """
        Run a background service with automatic leader election and retry.
        
        This method:
        1. Retries becoming leader until success (with jitter)
        2. Monitors leadership status continuously
        3. Stops immediately if leadership is lost
        4. Handles graceful shutdown
        
        Args:
            config: Service configuration
            
        Raises:
            asyncio.CancelledError: When shutdown signal received
        """
        leader_service = LeaderElectionService(leader_key=config.leader_key)
        
        # Phase 1: Retry until we become leader
        await self._retry_until_leader(leader_service, config)
        
        # Phase 2: Start heartbeat
        heartbeat_task = asyncio.create_task(leader_service.start_heartbeat())
        
        try:
            # Phase 3: Run service with continuous monitoring
            await self._run_with_monitoring(
                leader_service,
                config,
                heartbeat_task
            )
        finally:
            # Phase 4: Cleanup
            await self._cleanup(leader_service, heartbeat_task, config.service_name)
    
    async def _retry_until_leader(
        self,
        leader_service: LeaderElectionService,
        config: BackgroundServiceConfig
    ) -> None:
        """
        Retry becoming leader until success.
        
        Implements:
        - Infinite retry with configurable interval
        - Jitter to prevent thundering herd
        - Progress logging (warnings after 1 minute)
        - Graceful cancellation
        
        Args:
            leader_service: Leader election service
            config: Service configuration
        """
        retry_count = 0
        
        while True:
            try:
                if await leader_service.try_become_leader():
                    # Success!
                    logger.info(f"🎖️  {config.service_name} is now LEADER")
                    if retry_count > 0:
                        total_time = retry_count * config.retry_interval
                        logger.info(
                            f"Became leader after {retry_count} attempts "
                            f"({total_time}s)"
                        )
                    return
                
                # Failed to become leader
                retry_count += 1
                self._log_retry_attempt(retry_count, config)
                
                # Sleep with jitter to prevent thundering herd
                sleep_time = self._calculate_sleep_with_jitter(config)
                await asyncio.sleep(sleep_time)
                
            except asyncio.CancelledError:
                logger.info(
                    f"{config.service_name} cancelled before becoming leader"
                )
                raise
            except Exception as e:
                logger.error(
                    f"Error during leader election for {config.service_name}: {e}"
                )
                sleep_time = self._calculate_sleep_with_jitter(config)
                await asyncio.sleep(sleep_time)
    
    async def _run_with_monitoring(
        self,
        leader_service: LeaderElectionService,
        config: BackgroundServiceConfig,
        heartbeat_task: asyncio.Task
    ) -> None:
        """
        Run service while continuously monitoring leadership status.
        
        If leadership is lost (e.g., network partition), stops service immediately.
        
        Args:
            leader_service: Leader election service
            config: Service configuration
            heartbeat_task: Running heartbeat task
            
        Raises:
            Exception: If leadership is lost
        """
        logger.info(f"🚀 Starting {config.service_name}...")
        
        # Start the actual service
        service_task = asyncio.create_task(config.service_func())
        
        try:
            # Monitor leadership while service runs
            while not service_task.done():
                await asyncio.sleep(config.monitor_interval)
                
                # Check if we're still the leader
                if not leader_service.is_leader:
                    logger.error(
                        f"⚠️  {config.service_name} LOST LEADERSHIP! "
                        f"Stopping immediately"
                    )
                    
                    # Cancel the service
                    service_task.cancel()
                    try:
                        await service_task
                    except asyncio.CancelledError:
                        pass
                    
                    raise Exception(
                        f"{config.service_name} lost leadership - "
                        f"another task is now leader"
                    )
            
            # Service finished on its own, check result
            try:
                await service_task
            except Exception as e:
                logger.error(f"{config.service_name} failed with error: {e}")
                raise
            
        except asyncio.CancelledError:
            logger.info(f"{config.service_name} cancelled (shutdown)")
            service_task.cancel()
            try:
                await service_task
            except asyncio.CancelledError:
                pass
            raise
    
    async def _cleanup(
        self,
        leader_service: LeaderElectionService,
        heartbeat_task: asyncio.Task,
        service_name: str
    ) -> None:
        """
        Clean up resources after service stops.
        
        Args:
            leader_service: Leader election service
            heartbeat_task: Running heartbeat task
            service_name: Service name for logging
        """
        # Cancel heartbeat
        if heartbeat_task and not heartbeat_task.done():
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        
        # Release leadership
        await leader_service.release_leadership()
        logger.info(f"✅ {service_name} cleaned up successfully")
    
    def _log_retry_attempt(
        self,
        retry_count: int,
        config: BackgroundServiceConfig
    ) -> None:
        """
        Log retry attempts with appropriate severity.
        
        Args:
            retry_count: Current retry count
            config: Service configuration
        """
        if retry_count == 1:
            logger.info(
                f"⏭️  {config.service_name} is NOT the leader, "
                f"will retry every {config.retry_interval} seconds"
            )
            logger.info("Waiting for current leader to release lock...")
        elif retry_count % 6 == 0:  # Every ~60 seconds
            total_time = retry_count * config.retry_interval
            logger.warning(
                f"⏰ Still waiting for {config.service_name} leadership "
                f"after {retry_count} attempts ({total_time}s)"
            )
        else:
            logger.debug(
                f"{config.service_name} leader election attempt {retry_count}, "
                f"retrying in ~{config.retry_interval}s..."
            )
    
    def _calculate_sleep_with_jitter(
        self,
        config: BackgroundServiceConfig
    ) -> float:
        """
        Calculate sleep time with jitter to prevent thundering herd.
        
        Args:
            config: Service configuration
            
        Returns:
            Sleep time in seconds with jitter applied
        """
        jitter = random.uniform(*config.jitter_range)
        return config.retry_interval * jitter
    
    def create_task(
        self,
        config: BackgroundServiceConfig
    ) -> asyncio.Task:
        """
        Create and track a background service task.
        
        Args:
            config: Service configuration
            
        Returns:
            Created asyncio task
        """
        task = asyncio.create_task(
            self.run_service_with_leader_election(config)
        )
        self.running_tasks.append(task)
        return task
    
    async def shutdown_all(self) -> None:
        """
        Gracefully shutdown all running background services.
        
        Cancels all tasks and waits for cleanup.
        """
        logger.info(f"Shutting down {len(self.running_tasks)} background services...")
        
        for task in self.running_tasks:
            if not task.done():
                task.cancel()
        
        # Wait for all tasks to finish cancellation
        await asyncio.gather(*self.running_tasks, return_exceptions=True)
        
        logger.info("All background services shut down successfully")
        self.running_tasks.clear()


# Singleton instance for the application
_background_service_manager: Optional[BackgroundServiceManager] = None


def get_background_service_manager() -> BackgroundServiceManager:
    """
    Get the global background service manager instance.
    
    Returns:
        BackgroundServiceManager singleton
    """
    global _background_service_manager
    if _background_service_manager is None:
        _background_service_manager = BackgroundServiceManager()
    return _background_service_manager

