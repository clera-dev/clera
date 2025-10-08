# Production Deployment Guide for Background Services

## Overview

This guide explains how background portfolio services work in AWS ECS production deployment.

## Architecture

### Components

1. **API Service** (ECS Fargate Task)
   - FastAPI application serving HTTP requests
   - Runs background services via leader election
   - Count: 1 (configurable)
   - Rolling deployments with zero downtime

2. **Background Services**
   - Intraday Portfolio Tracker (live updates every 30s during market hours)
   - Daily Snapshot Scheduler (runs at 4 AM EST)
   - **Only ONE instance runs these** via Redis leader election

3. **Redis** (AWS ElastiCache)
   - Distributed lock for leader election
   - Ensures only one ECS task runs background services
   - Automatic failover if leader crashes

## How Leader Election Works

### During Normal Operation

```
ECS Task 1 (LEADER):
  ├─ HTTP API ✅ Running
  ├─ Intraday Tracker ✅ Running (LEADER)
  └─ Daily Scheduler ✅ Running (LEADER)

ECS Task 2 (if count > 1):
  ├─ HTTP API ✅ Running
  ├─ Intraday Tracker ⏭️  Skipped (not leader)
  └─ Daily Scheduler ⏭️  Skipped (not leader)
```

### During Rolling Deployment

```
Time 0s: Old task is running
  ECS Task (old) - LEADER ✅
  
Time 10s: New task starts
  ECS Task (old) - LEADER ✅ (still holds lock)
  ECS Task (new) - FOLLOWER ⏭️  (can't acquire lock)
  
Time 40s: Old task stops
  ECS Task (old) - Releases lock
  ECS Task (new) - Becomes LEADER ✅
```

**Key Points:**
- Old task remains leader until it shuts down
- New task waits and tries to become leader
- No duplicate background services!
- Automatic failover within 30 seconds

## Redis Leader Election Keys

- `portfolio:background_services:leader` - Intraday tracker leader
- `portfolio:daily_scheduler:leader` - Daily scheduler leader

**Lease Duration**: 30 seconds
**Heartbeat Interval**: 10 seconds

If a task crashes, leadership automatically transfers after 30 seconds.

## Deployment Process

### Before Deployment

1. Ensure Redis is healthy:
   ```bash
   redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com ping
   # Should return: PONG
   ```

2. Check current leader:
   ```bash
   redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com \
     GET portfolio:background_services:leader
   # Returns: UUID of current leader task
   ```

### During Deployment

```bash
# Deploy via Copilot
cd backend
copilot svc deploy --name api-service --env production
```

**What Happens:**
1. New ECS task starts (takes ~30-60s)
2. New task tries to become leader → FAILS (old task is leader)
3. New task serves HTTP requests, skips background services
4. Health checks pass on new task
5. Old task receives SIGTERM
6. Old task releases Redis locks
7. New task becomes leader within 30s
8. Background services resume on new task

**Downtime:**
- HTTP API: **0 seconds** (zero-downtime deployment)
- Background services: **~30 seconds** (during leader transition)

### After Deployment

Check logs to confirm leader election:

```bash
# View logs
copilot svc logs --name api-service --env production --follow

# Look for:
✅ "This instance is the LEADER, starting background services"
# OR
⏭️  "This instance is NOT the leader, skipping background services"
```

## Scaling Considerations

### Scaling to count > 1

If you scale to multiple tasks:

```yaml
# copilot/api-service/manifest.yml
count: 2  # Multiple tasks for high availability
```

**Behavior:**
- All tasks serve HTTP requests (load balanced)
- Only ONE task runs background services (leader election)
- If leader crashes, another task becomes leader within 30s

**Benefits:**
- Zero downtime for API
- Automatic background service failover
- Cost-effective (only 1 task runs background services)

### Scaling to count: 0 (Stopping Services)

If you scale down to 0:
- Leader releases locks
- Background services stop
- All Redis locks automatically expire after 30s

## Monitoring

### CloudWatch Logs

```bash
# Check which task is leader
copilot svc logs --name api-service --env production | grep "LEADER"

# Expected output:
🎖️  Instance abc123de is the LEADER, starting background services
```

### Redis Monitoring

```bash
# Check current leader
redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com \
  GET portfolio:background_services:leader

# Check TTL (should be ~30 seconds)
redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com \
  TTL portfolio:background_services:leader
```

### Metrics to Watch

1. **Background Service Continuity**
   - Check Supabase for daily EOD snapshots
   - Verify intraday tracking continues during deployments

2. **Redis Connections**
   - Monitor ElastiCache connections
   - Alert if connection failures

3. **Leader Transitions**
   - Should only happen during deployments or task failures
   - Frequent transitions indicate instability

## Troubleshooting

### Background Services Not Running

**Symptom**: No task shows as leader

**Check:**
```bash
# Is Redis reachable?
redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com ping

# Are any tasks running?
copilot svc status --name api-service --env production

# Check logs
copilot svc logs --name api-service --env production --follow
```

**Solution:**
1. Restart ECS service: `copilot svc deploy --force`
2. Check Redis security groups
3. Verify REDIS_HOST and REDIS_PORT env vars

### Duplicate Background Services Running

**Symptom**: 2x EOD captures, 2x intraday updates

**Check:**
```bash
# How many tasks claim to be leader?
copilot svc logs --name api-service --env production | grep "is the LEADER"
```

**Solution:**
1. This should NEVER happen (Redis lock prevents it)
2. If it does, check Redis cluster health
3. Manually delete leader keys:
   ```bash
   redis-cli -h ... DEL portfolio:background_services:leader
   redis-cli -h ... DEL portfolio:daily_scheduler:leader
   ```

### Leader Stuck on Dead Task

**Symptom**: No background services running, old task ID holds lock

**Check:**
```bash
# Get current leader ID
LEADER_ID=$(redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com \
  GET portfolio:background_services:leader)

# Check if that task exists
aws ecs list-tasks --cluster clera-api-production --family api-service | grep $LEADER_ID
```

**Solution:**
```bash
# Delete the stale lock (will auto-expire in 30s anyway)
redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com \
  DEL portfolio:background_services:leader
```

## Best Practices

1. **Always Deploy During Non-Critical Hours**
   - Avoid 4:00 PM EST (market close / EOD capture)
   - Avoid 4:30 AM EST (daily reconstruction)
   - Best time: 10 AM - 2 PM EST

2. **Monitor First Deployment**
   - Watch logs during first production deployment
   - Verify leader election works
   - Confirm background services resume

3. **Test Leader Failover**
   - Manually stop a leader task
   - Verify another task becomes leader within 30s
   - Check background services continue

4. **Redis Backup**
   - Enable ElastiCache automatic backups
   - Leader keys are ephemeral (safe to lose)
   - Critical data is in Supabase, not Redis

## Emergency Procedures

### Force Background Services to Run

If leader election is broken and you need background services NOW:

```python
# SSH into ECS task (copilot svc exec --name api-service)
# Then in Python:
import asyncio
from services.intraday_portfolio_tracker import get_intraday_portfolio_tracker

tracker = get_intraday_portfolio_tracker()
# Manually capture EOD (if needed)
# ... (see service code for methods)
```

### Disable Background Services

If background services are causing issues:

```python
# Set Redis keys to prevent any task from becoming leader
redis-cli -h ... SET portfolio:background_services:leader "DISABLED" EX 3600
redis-cli -h ... SET portfolio:daily_scheduler:leader "DISABLED" EX 3600
```

This blocks leader election for 1 hour.

## Production Checklist

Before deploying to production:

- [ ] Redis cluster is healthy
- [ ] ElastiCache security groups allow ECS tasks
- [ ] REDIS_HOST and REDIS_PORT are correct in manifest.yml
- [ ] Tested leader election locally
- [ ] CloudWatch logs retention configured (30 days)
- [ ] Alerts set up for Redis connection failures
- [ ] Supabase has data retention policy for portfolio_history
- [ ] Backup plan for missed EOD captures (manual reconstruction)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    AWS ECS Fargate                       │
│                                                          │
│  ┌──────────────┐              ┌──────────────┐        │
│  │  Task 1      │              │  Task 2      │        │
│  │              │              │              │        │
│  │  API ✅      │              │  API ✅      │        │
│  │  BG ✅ LEAD  │              │  BG ⏭️       │        │
│  └──────┬───────┘              └──────┬───────┘        │
│         │                             │                 │
│         └─────────────┬───────────────┘                 │
│                       │                                 │
└───────────────────────┼─────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Redis Leader   │
              │  Election       │
              │  (ElastiCache)  │
              └─────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Supabase       │
              │  (Portfolio DB) │
              └─────────────────┘
```

## Conclusion

With leader election:
- ✅ Zero-downtime deployments
- ✅ No duplicate background services
- ✅ Automatic failover
- ✅ Scales safely to count > 1
- ✅ Production-ready for millions of users

The system is designed to handle ECS task lifecycle seamlessly.

