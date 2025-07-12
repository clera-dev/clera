# Account Closure Architecture - Durable Job Queue System

## Overview

This document describes the new architecture for handling account closure processes using a Redis-based durable job queue system. This design addresses the architectural issues with the previous implementation that used `asyncio.create_task()` for long-running background processes.

## Problem Statement

The original implementation had several critical issues:

1. **Process Restart Risk**: Background tasks spawned with `asyncio.create_task()` were lost if the web server restarted
2. **Memory Leaks**: Long-running tasks in the web server event loop could cause memory issues
3. **Request Context Coupling**: Background processes were tied to the request lifecycle
4. **No Durability**: No persistence or recovery mechanism if tasks failed
5. **No Monitoring**: Difficult to track job status and debug issues

## New Architecture

### Components

1. **Redis-based Job Queue** (`utils/job_queue.py`)
   - Durable job persistence in Redis
   - Job status tracking and monitoring
   - Automatic retry mechanism with exponential backoff
   - Job recovery on worker restart
   - Dead letter queue for failed jobs

2. **Account Closure Worker** (`utils/alpaca/account_closure_worker.py`)
   - Dedicated worker service for processing account closure tasks
   - Runs independently of the web server
   - Handles multi-day workflows (liquidation → settlement → withdrawal → closure)
   - Comprehensive logging and error handling

3. **Updated API Endpoints** (`api_server.py`)
   - Job enqueuing instead of `asyncio.create_task()`
   - Job status monitoring endpoints
   - Proper separation of concerns

4. **Monitoring Tools** (`scripts/monitor_jobs.py`)
   - Job status checking
   - Queue health monitoring
   - Failed job retry capabilities

### Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server    │    │   Job Queue     │
│                 │    │                 │    │   (Redis)       │
│ User clicks     │───▶│ /initiate       │───▶│ Enqueue job     │
│ "Close Account" │    │ endpoint        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Monitoring    │    │   Worker        │
                       │   Tools         │    │   Service       │
                       │                 │    │                 │
                       │ Job status      │◀───│ Process jobs    │
                       │ Queue health    │    │ Multi-day flow  │
                       └─────────────────┘    └─────────────────┘
```

## Job Queue System

### Job Structure

```python
@dataclass
class Job:
    id: str
    queue_name: str
    task_name: str
    args: List[Any]
    kwargs: Dict[str, Any]
    status: JobStatus
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    failed_at: Optional[datetime]
    retry_count: int
    max_retries: int
    error_message: Optional[str]
    result: Optional[Any]
```

### Job States

- **PENDING**: Job is queued and waiting for processing
- **PROCESSING**: Job is currently being processed by a worker
- **COMPLETED**: Job finished successfully
- **FAILED**: Job failed but may be retried
- **RETRYING**: Job is scheduled for retry after failure
- **DEAD**: Job failed maximum retry attempts and moved to dead letter queue

### Redis Keys

- `job_queue:{queue_name}`: Main job queue (list)
- `job_processing:{queue_name}`: Currently processing jobs (list)
- `job_data:{job_id}`: Job data storage (hash)
- `job_retry:{queue_name}`: Delayed retry queue (sorted set)
- `job_dead_letter:{queue_name}`: Failed jobs (list)

## Account Closure Workflow

### Phase 1: Initiation (Immediate)

1. User clicks "Close Account" in frontend
2. Frontend calls `/api/account-closure/initiate/{accountId}`
3. API server:
   - Updates Supabase status to `pending_closure`
   - Enqueues `automated_account_closure` job
   - Returns immediate response with job ID

### Phase 2: Background Processing (Hours/Days)

The worker processes the job through multiple phases:

1. **Liquidation Phase**
   - Cancel all open orders
   - Liquidate all positions
   - Wait for position clearing (up to 15 minutes)

2. **Settlement Phase**
   - Wait for T+1 settlement (1-3 business days)
   - Check settlement status hourly
   - Timeout after 3 days

3. **Withdrawal Phase**
   - Automatically withdraw all funds via ACH
   - Monitor transfer status every 2 hours
   - Timeout after 5 days

4. **Closure Phase**
   - Final safety checks
   - Close the account
   - Send completion email
   - Update Supabase status to `closed`

### Error Handling

- **Automatic Retries**: Jobs retry up to 3 times with exponential backoff
- **Dead Letter Queue**: Failed jobs are moved to dead letter queue for manual review
- **Partial Failures**: Each phase has its own error handling and can be resumed
- **Timeout Handling**: Long-running phases have timeout limits to prevent indefinite waiting

## Deployment

### Local Development

1. **Start Redis**:
   ```bash
   brew services start redis  # macOS
   sudo systemctl start redis-server  # Linux
   ```

2. **Start API Server**:
   ```bash
   cd backend
   source venv/bin/activate
   python api_server.py
   ```

3. **Start Worker**:
   ```bash
   cd backend
   source venv/bin/activate
   python -m utils.alpaca.account_closure_worker --sandbox
   ```

### Production Deployment

1. **API Service**: Existing ECS service continues to handle API requests
2. **Worker Service**: New ECS service runs the account closure worker
3. **Redis**: Shared ElastiCache Redis instance for job queue

#### Copilot Deployment

```bash
# Deploy the worker service
cd backend
copilot svc deploy --name worker-service --env production
```

## Monitoring

### Job Status Monitoring

```bash
# Check specific job status
python scripts/monitor_jobs.py --status <job_id>

# Monitor queue health
python scripts/monitor_jobs.py --queue account_closure

# Show overall statistics
python scripts/monitor_jobs.py --stats

# Clean up old jobs
python scripts/monitor_jobs.py --cleanup
```

### API Endpoints

- `GET /api/job-status/{job_id}`: Get job status
- `GET /api/account-closure/progress/{account_id}`: Get account closure progress

### Health Checks

- Worker service exposes `/health` endpoint on port 8080
- Checks Redis connectivity and worker status

## Benefits

### Reliability

- **Durability**: Jobs survive server restarts
- **Retry Logic**: Automatic retry with exponential backoff
- **Dead Letter Queue**: Failed jobs are preserved for analysis
- **Monitoring**: Comprehensive job tracking and status monitoring

### Scalability

- **Horizontal Scaling**: Multiple workers can process jobs in parallel
- **Queue Isolation**: Different job types can use separate queues
- **Resource Efficiency**: Workers run independently of web server

### Maintainability

- **Separation of Concerns**: Clear separation between API and background processing
- **Error Handling**: Comprehensive error handling and logging
- **Monitoring Tools**: Built-in monitoring and debugging capabilities
- **Documentation**: Well-documented architecture and processes

## Migration

### From Old System

1. **Immediate**: API endpoints now enqueue jobs instead of spawning tasks
2. **Backward Compatible**: Existing status checking endpoints continue to work
3. **Gradual**: Old background process methods are deprecated but not removed

### Testing

1. **Unit Tests**: Test job queue operations
2. **Integration Tests**: Test full account closure workflow
3. **Load Tests**: Test queue performance under load

## Security Considerations

- **Credentials**: Worker uses same secure credential management as API service
- **Network**: Worker runs in private subnet with no direct internet access
- **Logging**: Sensitive data is redacted from logs
- **Monitoring**: Job status endpoints require API key authentication

## Future Enhancements

1. **Job Scheduling**: Support for delayed job execution
2. **Job Priorities**: Priority queue for urgent tasks
3. **Job Batching**: Batch processing for efficiency
4. **Metrics**: Integration with monitoring systems (CloudWatch, Prometheus)
5. **UI Dashboard**: Web interface for job monitoring

## Troubleshooting

### Common Issues

1. **Redis Connection Issues**
   - Check Redis connectivity
   - Verify environment variables
   - Check network security groups

2. **Job Stuck in Processing**
   - Check worker logs
   - Verify worker is running
   - Check for infinite loops in job processing

3. **Jobs Not Being Processed**
   - Verify worker is subscribed to correct queue
   - Check Redis queue contents
   - Verify job data integrity

### Debug Commands

```bash
# Check Redis connectivity
redis-cli ping

# List all Redis keys
redis-cli keys "*"

# Check job queue length
redis-cli llen job_queue:account_closure

# Check specific job data
redis-cli get job_data:<job_id>
```

## Conclusion

The new durable job queue architecture provides a robust, scalable, and maintainable solution for handling long-running account closure processes. It addresses all the architectural issues of the previous implementation while providing comprehensive monitoring and error handling capabilities.

The system is designed to be production-ready with proper error handling, monitoring, and deployment configurations. It follows best practices for distributed systems and provides a solid foundation for future enhancements. 