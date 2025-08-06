# Production Task Management - Account Closure

## Overview

This document describes the production-grade task management system for account closure background processes. The system provides comprehensive monitoring, cancellation capabilities, and operational control over long-running closure workflows.

## Architecture

### Hybrid Task Registry

The system uses a **hybrid approach** combining in-memory performance with Redis persistence:

```python
class AutomatedAccountClosureProcessor:
    # Class-level shared registry (fast, cross-instance access)
    _active_tasks = {}  # Dict[account_id, asyncio.Task]
    _task_lock = asyncio.Lock()  # Thread-safe access
```

**Benefits:**
- ✅ **Fast Access**: Class variables provide immediate task access
- ✅ **Cross-Instance**: All processor instances share the same registry
- ✅ **Distributed Monitoring**: Redis enables monitoring across processes/servers
- ✅ **Persistence**: Tasks survive process restarts via Redis state
- ✅ **Operational Control**: Support teams can monitor and cancel tasks

### Redis Task Metadata

Each active task stores metadata in Redis:

```json
{
  "task_id": "140234567890123",
  "created_at": "2025-01-14T10:30:00Z",
  "process_id": "12345",
  "status": "running"
}
```

**Key**: `active_task:{account_id}`  
**TTL**: 7 days (prevents Redis bloat)

## API Endpoints

### Task Status Monitoring

```http
GET /account-closure/task-status/{account_id}
```

**Response:**
```json
{
  "account_id": "abc123",
  "task_status": {
    "active": true,
    "task_id": "140234567890123",
    "source": "local_registry",
    "done": false,
    "cancelled": false
  },
  "timestamp": "2025-01-14T10:30:00Z"
}
```

### Task Cancellation

```http
POST /account-closure/cancel-task/{account_id}
```

**Response:**
```json
{
  "success": true,
  "message": "Task for account abc123 has been cancelled",
  "account_id": "abc123",
  "timestamp": "2025-01-14T10:30:00Z"
}
```

### System-Wide Monitoring

```http
GET /account-closure/all-active-tasks
```

**Response:**
```json
{
  "active_tasks": {
    "account1": {
      "task_id": "140234567890123",
      "source": "local_registry",
      "done": false
    },
    "account2": {
      "task_id": "140234567890456",
      "source": "redis_registry",
      "created_at": "2025-01-14T10:00:00Z",
      "process_id": "12345"
    }
  },
  "total_active": 2,
  "timestamp": "2025-01-14T10:30:00Z"
}
```

## Operational Tools

### Production Monitor Script

**Usage:**
```bash
# Monitor all active closures
python scripts/monitor_account_closures.py

# Monitor specific account
python scripts/monitor_account_closures.py --account-id abc123

# Cancel runaway task
python scripts/monitor_account_closures.py --cancel abc123

# Continuous monitoring
python scripts/monitor_account_closures.py --watch

# Production mode
python scripts/monitor_account_closures.py --production
```

**Sample Output:**
```
🔍 ACCOUNT CLOSURE PRODUCTION MONITOR
================================================================================
Timestamp: 2025-01-14T10:30:00Z
Environment: SANDBOX
Redis Connected: ✅

🚀 ACTIVE BACKGROUND TASKS (2 total)
--------------------------------------------------------------------------------
🏠 Account: abc123
   Status: ✅ Running
   Task ID: 140234567890123
   Source: local_registry

☁️ Account: def456
   Status: ✅ Running
   Task ID: 140234567890456
   Source: redis_registry
   Created: 2025-01-14T10:00:00Z
   Process: 12345

💾 REDIS CLOSURE STATES (3 total)
--------------------------------------------------------------------------------
🔄 Account: abc123
   Phase: liquidation
   User: user123
   Started: 2025-01-14T10:15:00Z

⌛ Account: def456
   Phase: withdrawal_waiting
   User: user456
   Started: 2025-01-14T09:30:00Z
   Next Action: 2025-01-15T09:30:00Z
```

### Emergency Task Cancellation

**For stuck or runaway processes:**

```bash
# Check task status
python scripts/monitor_account_closures.py --account-id STUCK_ACCOUNT_ID

# Cancel the task
python scripts/monitor_account_closures.py --cancel STUCK_ACCOUNT_ID

# Resume with fix script if needed
python scripts/fix_stuck_account_closure.py --account-id STUCK_ACCOUNT_ID
```

## Production Deployment

### ECS Task Definition Updates

Add the monitoring endpoints to your health checks:

```yaml
# Task Definition Health Check
healthCheck:
  command:
    - "CMD-SHELL"
    - "curl -f http://localhost:8000/account-closure/all-active-tasks -H 'x-api-key: $BACKEND_API_KEY' || exit 1"
  interval: 30
  timeout: 5
  retries: 3
```

### CloudWatch Monitoring

Set up CloudWatch alarms for task monitoring:

```json
{
  "AlarmName": "account-closure-tasks-stuck",
  "MetricName": "total_active",
  "Threshold": 10,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmDescription": "Too many active account closure tasks"
}
```

### Operational Runbooks

**Daily Monitoring:**
1. Check `/account-closure/all-active-tasks` for task count
2. Verify no tasks are stuck > 24 hours
3. Monitor Redis for stale closure states

**Weekly Maintenance:**
1. Run monitor script to check system health
2. Clean up completed closure states from Redis
3. Review task completion patterns

**Emergency Response:**
1. Use monitoring script to identify problematic accounts
2. Cancel stuck tasks via API or script
3. Use fix script to resume or complete closure
4. Update operational procedures based on findings

## Security Considerations

**API Key Protection:**
- All monitoring endpoints require API key authentication
- Use environment variables for production keys
- Rotate keys regularly

**Access Control:**
- Limit monitoring access to operations team
- Task cancellation should require approval
- Log all administrative actions

**Data Privacy:**
- Monitor logs don't expose sensitive account data
- Task IDs are process-local (not persistent identifiers)
- Redis task metadata has minimal PII

## Troubleshooting

### Common Issues

**1. Task Shows Active But No Progress**
```bash
# Check task details
python scripts/monitor_account_closures.py --account-id ACCOUNT_ID

# Check Redis closure state
# If stuck, cancel and resume
python scripts/monitor_account_closures.py --cancel ACCOUNT_ID
python scripts/fix_stuck_account_closure.py --account-id ACCOUNT_ID
```

**2. Multiple Tasks for Same Account**
```bash
# This shouldn't happen - indicates race condition
# Cancel all tasks and use fix script
python scripts/monitor_account_closures.py --cancel ACCOUNT_ID
# Wait 30 seconds, then resume
python scripts/fix_stuck_account_closure.py --account-id ACCOUNT_ID
```

**3. Redis Connection Issues**
```bash
# Check Redis connectivity
python scripts/monitor_account_closures.py --show-redis

# If Redis is down, tasks will still run but monitoring is limited
# Focus on local_registry tasks
```

### Performance Monitoring

**Metrics to Track:**
- Active task count over time
- Task completion times by phase
- Redis operation latency
- Task cancellation frequency

**Alerts to Configure:**
- > 5 active tasks simultaneously
- Tasks running > 48 hours
- High Redis error rate
- Frequent task cancellations

## Best Practices

**Development:**
- Always test task cancellation in sandbox
- Use the monitoring script during development
- Verify Redis cleanup after task completion

**Production:**
- Monitor task count during deployments
- Have emergency cancellation procedures ready
- Regular Redis maintenance for stale data

**Operations:**
- Daily monitoring script execution
- Weekly system health reviews
- Incident response procedures documented