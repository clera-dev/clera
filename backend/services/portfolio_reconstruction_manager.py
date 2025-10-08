"""
Portfolio Reconstruction Manager

Production service for managing portfolio history reconstruction operations.
Handles user onboarding, background processing, and status tracking.

Key Features:
- Automatic reconstruction on new user connection
- Background job processing for scalability  
- Real-time status updates for user experience
- Error handling and retry mechanisms
- Cost optimization and monitoring
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date, timedelta
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ReconstructionRequest:
    """Request for portfolio reconstruction."""
    user_id: str
    priority: str = 'normal'  # 'high', 'normal', 'low'
    requested_at: datetime = None
    
    def __post_init__(self):
        if self.requested_at is None:
            self.requested_at = datetime.now()

class PortfolioReconstructionManager:
    """
    Production manager for portfolio history reconstruction operations.
    
    Handles the complete lifecycle:
    1. Queue management for reconstruction requests
    2. Background processing with controlled concurrency
    3. Status tracking and user notifications
    4. Error handling and retry logic
    5. Performance monitoring and cost tracking
    """
    
    def __init__(self):
        """Initialize the reconstruction manager."""
        self.reconstructor = None  # Lazy loaded
        self.supabase = None  # Lazy loaded
        self.processing_queue = asyncio.Queue()
        self.is_processing = False
        self.active_reconstructions = set()
        
        # Performance tracking
        self.total_reconstructions_completed = 0
        self.total_api_cost = 0.0
        self.average_processing_time = 0.0
    
    def _get_services(self):
        """Lazy load required services."""
        if self.reconstructor is None:
            from services.portfolio_history_reconstructor import get_portfolio_history_reconstructor
            self.reconstructor = get_portfolio_history_reconstructor()
        
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
    
    def _get_supabase_client(self):
        """Get Supabase client (ensure compatibility with existing code)."""
        self._get_services()
        return self.supabase
    
    async def request_reconstruction_for_user(self, user_id: str, priority: str = 'normal') -> Dict[str, Any]:
        """
        Request portfolio reconstruction for a user.
        
        This is called when a user first connects their Plaid accounts
        and wants to see their complete portfolio history.
        
        Args:
            user_id: User requesting reconstruction
            priority: 'high' (new user), 'normal' (background), 'low' (retry)
            
        Returns:
            Status information for user experience
        """
        try:
            self._get_services()
            
            # Check if reconstruction already completed
            existing_status = await self._get_reconstruction_status(user_id)
            if existing_status and existing_status.get('reconstruction_status') == 'completed':
                logger.info(f"📋 User {user_id} already has completed reconstruction")
                return {
                    'status': 'already_completed',
                    'message': 'Portfolio history already available',
                    'data_points': existing_status.get('total_data_points', 0)
                }
            
            # Check if reconstruction already in progress
            if existing_status and existing_status.get('reconstruction_status') == 'in_progress':
                logger.info(f"⏳ User {user_id} reconstruction already in progress")
                return {
                    'status': 'in_progress',
                    'message': 'Portfolio history reconstruction in progress',
                    'progress': existing_status.get('reconstruction_progress', 0)
                }
            
            # Queue new reconstruction request
            request = ReconstructionRequest(user_id=user_id, priority=priority)
            await self.processing_queue.put(request)
            
            # Initialize status tracking
            await self._initialize_reconstruction_status(user_id)
            
            # Start background processor if not running
            if not self.is_processing:
                asyncio.create_task(self._start_background_processor())
            
            logger.info(f"📥 Queued reconstruction for user {user_id} (priority: {priority})")
            
            return {
                'status': 'queued',
                'message': 'Portfolio history reconstruction queued',
                'estimated_completion': datetime.now() + timedelta(minutes=3),
                'queue_position': self.processing_queue.qsize()
            }
            
        except Exception as e:
            logger.error(f"Error requesting reconstruction for user {user_id}: {e}")
            return {
                'status': 'error',
                'message': f'Failed to queue reconstruction: {str(e)}'
            }
    
    async def _start_background_processor(self):
        """
        Start background processor for reconstruction queue.
        
        Processes reconstruction requests with controlled concurrency
        to handle massive scale without overwhelming external APIs.
        """
        if self.is_processing:
            return
        
        self.is_processing = True
        logger.info("🔄 Starting portfolio reconstruction background processor")
        
        try:
            # Process with controlled concurrency (2 users at a time to manage API costs)
            semaphore = asyncio.Semaphore(2)
            
            while True:
                try:
                    # Get next request from queue (wait if empty)
                    request = await asyncio.wait_for(self.processing_queue.get(), timeout=10.0)
                    
                    # Process request with concurrency control
                    async with semaphore:
                        await self._process_reconstruction_request(request)
                    
                    # Mark task done
                    self.processing_queue.task_done()
                    
                except asyncio.TimeoutError:
                    # No requests in queue for 10 seconds - can stop processor
                    if self.processing_queue.empty():
                        break
                    
                except Exception as e:
                    logger.error(f"Error in background processor: {e}")
                    continue
        
        finally:
            self.is_processing = False
            logger.info("⏹️ Portfolio reconstruction background processor stopped")
    
    async def _process_reconstruction_request(self, request: ReconstructionRequest):
        """
        Process a single reconstruction request.
        """
        user_id = request.user_id
        
        try:
            # Ensure services are loaded
            self._get_services()
            
            # Mark as active
            self.active_reconstructions.add(user_id)
            
            logger.info(f"🚀 Processing reconstruction for user {user_id}")
            
            # Execute reconstruction
            result = await self.reconstructor.reconstruct_user_portfolio_history(user_id)
            
            if result.success:
                # Update tracking metrics
                self.total_reconstructions_completed += 1
                self.total_api_cost += result.api_cost_estimate
                self.average_processing_time = (
                    (self.average_processing_time * (self.total_reconstructions_completed - 1) + 
                     result.processing_duration_seconds) / self.total_reconstructions_completed
                )
                
                logger.info(f"✅ Reconstruction successful for user {user_id}: "
                           f"{result.total_data_points} data points, "
                           f"${result.api_cost_estimate:.2f} cost, "
                           f"{result.processing_duration_seconds:.1f}s")
            else:
                logger.error(f"❌ Reconstruction failed for user {user_id}: {result.error}")
                # Could implement retry logic here
            
        except Exception as e:
            logger.error(f"Error processing reconstruction for user {user_id}: {e}")
            # Mark as failed
            await self._update_reconstruction_status(user_id, 'failed', 0.0, str(e))
        
        finally:
            # Remove from active tracking
            self.active_reconstructions.discard(user_id)
    
    async def get_reconstruction_status_for_user(self, user_id: str) -> Dict[str, Any]:
        """
        Get current reconstruction status for a user.
        
        Used by frontend to show progress and completion status.
        """
        try:
            status = await self._get_reconstruction_status(user_id)
            
            if not status:
                return {
                    'status': 'not_started',
                    'message': 'Portfolio history reconstruction not started'
                }
            
            reconstruction_status = status.get('reconstruction_status', 'unknown')
            progress = status.get('reconstruction_progress', 0.0)
            
            # Build response based on status
            response = {
                'status': reconstruction_status,
                'progress': progress
            }
            
            if reconstruction_status == 'pending':
                response['message'] = 'Portfolio history reconstruction queued'
                response['estimated_completion'] = datetime.now() + timedelta(minutes=3)
                
            elif reconstruction_status == 'in_progress':
                response['message'] = 'Building your portfolio history...'
                estimated_remaining = (100 - progress) / 100 * 180  # Estimate 3 minutes total
                response['estimated_completion'] = datetime.now() + timedelta(seconds=estimated_remaining)
                response['current_phase'] = self._get_phase_from_progress(progress)
                
            elif reconstruction_status == 'completed':
                response['message'] = 'Portfolio history ready'
                response['completed_at'] = status.get('completed_at')
                response['total_data_points'] = status.get('total_data_points', 0)
                response['history_start_date'] = status.get('history_start_date')
                response['history_end_date'] = status.get('history_end_date')
                
            elif reconstruction_status == 'failed':
                response['message'] = 'Portfolio history reconstruction failed'
                response['error'] = status.get('error_message')
                response['retry_count'] = status.get('retry_count', 0)
                response['can_retry'] = status.get('retry_count', 0) < 3
            
            return response
            
        except Exception as e:
            logger.error(f"Error getting reconstruction status for user {user_id}: {e}")
            return {
                'status': 'error',
                'message': f'Unable to get reconstruction status: {str(e)}'
            }
    
    def _get_phase_from_progress(self, progress: float) -> str:
        """
        Get user-friendly phase description from progress percentage.
        """
        if progress < 10:
            return 'Getting your current portfolio...'
        elif progress < 20:
            return 'Analyzing your transaction history...'
        elif progress < 30:
            return 'Mapping your securities...'
        elif progress < 60:
            return 'Fetching historical price data...'
        elif progress < 90:
            return 'Reconstructing portfolio timeline...'
        else:
            return 'Finalizing your portfolio history...'
    
    async def _get_reconstruction_status(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get reconstruction status from database."""
        try:
            supabase = self._get_supabase_client()
            
            result = supabase.table('user_portfolio_reconstruction_status')\
                .select('*')\
                .eq('user_id', user_id)\
                .execute()
            
            if result.data and len(result.data) > 0:
                return result.data[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting reconstruction status for {user_id}: {e}")
            return None
    
    async def _initialize_reconstruction_status(self, user_id: str):
        """Initialize reconstruction status tracking for a user."""
        try:
            supabase = self._get_supabase_client()
            
            status_data = {
                'user_id': user_id,
                'reconstruction_status': 'pending',
                'reconstruction_progress': 0.0,
                'started_at': datetime.now().isoformat(),
                'retry_count': 0
            }
            
            supabase.table('user_portfolio_reconstruction_status')\
                .upsert(status_data, on_conflict='user_id')\
                .execute()
                
        except Exception as e:
            logger.error(f"Error initializing reconstruction status for {user_id}: {e}")
    
    async def _update_reconstruction_status(self, user_id: str, status: str, 
                                          progress: float, error: Optional[str] = None):
        """Update reconstruction status."""
        try:
            supabase = self._get_supabase_client()
            
            update_data = {
                'user_id': user_id,
                'reconstruction_status': status,
                'reconstruction_progress': progress,
                'updated_at': datetime.now().isoformat()
            }
            
            if error:
                update_data['error_message'] = error
            
            if status == 'completed':
                update_data['completed_at'] = datetime.now().isoformat()
            
            supabase.table('user_portfolio_reconstruction_status')\
                .upsert(update_data, on_conflict='user_id')\
                .execute()
                
        except Exception as e:
            logger.error(f"Error updating reconstruction status: {e}")
    
    async def get_global_reconstruction_metrics(self) -> Dict[str, Any]:
        """
        Get global metrics for monitoring and optimization.
        """
        try:
            supabase = self._get_supabase_client()
            
            # Get status distribution
            status_result = supabase.table('user_portfolio_reconstruction_status')\
                .select('reconstruction_status')\
                .execute()
            
            status_counts = {}
            if status_result.data:
                for row in status_result.data:
                    status = row['reconstruction_status']
                    status_counts[status] = status_counts.get(status, 0) + 1
            
            return {
                'total_users': len(status_result.data) if status_result.data else 0,
                'status_breakdown': status_counts,
                'active_reconstructions': len(self.active_reconstructions),
                'queue_size': self.processing_queue.qsize(),
                'total_completed': self.total_reconstructions_completed,
                'total_api_cost': self.total_api_cost,
                'average_processing_time_seconds': self.average_processing_time,
                'processor_running': self.is_processing
            }
            
        except Exception as e:
            logger.error(f"Error getting global metrics: {e}")
            return {}

# Global service instance
portfolio_reconstruction_manager = PortfolioReconstructionManager()

def get_portfolio_reconstruction_manager() -> PortfolioReconstructionManager:
    """Get the global portfolio reconstruction manager instance."""
    return portfolio_reconstruction_manager
