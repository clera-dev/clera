# Account Closure Architecture - Automated Background Processing

## Overview

This document describes the production-ready architecture for handling account closure processes using an automated background processing system. This design addresses the critical issues with the previous implementation and provides a robust, scalable solution for managing long-running account closure workflows.

## Problem Statement

The original implementation had several critical issues:

1. **Incomplete Automation**: Account closure process would stop after initial liquidation, leaving accounts stuck in `pending_closure` status
2. **Multi-Day Transfer Limits**: Alpaca's $50,000 daily transfer limit wasn't properly handled
3. **No Recovery Mechanism**: Stuck accounts had no automated recovery process
4. **Poor User Experience**: Users saw loading screens indefinitely without progress updates
5. **Inconsistent Email Notifications**: Missing completion emails and poor email design

## Current Architecture

### Components

1. **AutomatedAccountClosureProcessor** (`utils/alpaca/automated_account_closure.py`)
   - Handles the complete multi-step account closure workflow
   - Manages state persistence in Redis for long-running processes
   - Implements multi-day fund transfer logic with 24-hour delays
   - Provides comprehensive logging and error handling

2. **AccountClosureManager** (`utils/alpaca/account_closure.py`)
   - Core Alpaca API interactions for liquidation, withdrawal, and closure
   - Implements $50,000 daily transfer limit handling
   - Manages partial withdrawal state and continuation logic

3. **ClosureStateManager** (integrated in `utils/alpaca/account_closure.py`)
   - Redis-based state persistence for multi-day workflows
   - Tracks withdrawal progress and next transfer dates
   - Enables process recovery after server restarts
   - Provides comprehensive state management methods

4. **Updated API Endpoints** (`api_server.py`)
   - Properly triggers AutomatedAccountClosureProcessor
   - Provides progress monitoring endpoints
   - Handles stuck account recovery

### Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server    │    │   Background    │
│                 │    │                 │    │   Processor     │
│ User clicks     │───▶│ /initiate       │───▶│ Automated       │
│ "Close Account" │    │ endpoint        │    │ Closure Process │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Progress      │    │   State         │
                       │   Monitoring    │    │   Management    │
                       │                 │    │   (Redis)       │
                       │ Real-time       │◀───│ Multi-day       │
                       │ Status Updates  │    │ State Persist   │
                       └─────────────────┘    └─────────────────┘
```

## Automated Processing System

### Process Structure

```python
class AutomatedAccountClosureProcessor:
    def __init__(self, sandbox: bool = True):
        self.manager = AccountClosureManager(sandbox)
        self.state_manager = ClosureStateManager()
        self.email_service = EmailService()
    
    async def initiate_automated_closure(
        self, 
        user_id: str, 
        account_id: str, 
        ach_relationship_id: str
    ) -> Dict[str, Any]:
        # Complete multi-step closure process with Redis state persistence
```

### ClosureStateManager API Reference

**Core State Management Methods**:
```python
# General closure state
set_closure_state(account_id: str, state: Dict[str, Any], ttl_hours: int = 72)
get_closure_state(account_id: str) -> Optional[Dict[str, Any]]
update_closure_state(account_id: str, updates: Dict[str, Any])

# Withdrawal state management  
set_withdrawal_state(account_id: str, state: Dict[str, Any], ttl_hours: int = 72)
get_withdrawal_state(account_id: str) -> Optional[Dict[str, Any]]

# Legacy partial withdrawal support
_set_partial_withdrawal_state(account_id: str, state: Dict[str, Any], ttl_hours: int = 72)
_get_partial_withdrawal_state(account_id: str) -> Optional[Dict[str, Any]]
_clear_partial_withdrawal_state(account_id: str)

# Process logic helpers
determine_current_step(account_info: Dict[str, Any], account_id: str = None) -> ClosureStep
is_ready_for_next_step(current_step: ClosureStep, account_info: Dict[str, Any], account_id: str = None) -> bool
get_next_action(current_step: ClosureStep, ready_for_next: bool) -> str
```

**Usage Examples**:
```python
# Initialize state manager
state_manager = ClosureStateManager()

# Set initial closure state
state_manager.set_closure_state("account_id", {
    "user_id": "user_123",
    "phase": "liquidation", 
    "initiated_at": datetime.now().isoformat()
})

# Update phase progression
state_manager.update_closure_state("account_id", {
    "phase": "withdrawal",
    "withdrawable_amount": 48013.88
})

# Check withdrawal state for multi-day logic
withdrawal_state = state_manager.get_withdrawal_state("account_id")
if withdrawal_state and withdrawal_state.get("waiting_for_next_transfer"):
    # Handle 24-hour delay logic
    next_date = datetime.fromisoformat(withdrawal_state["next_transfer_date"])
    if datetime.now() >= next_date:
        # Ready for next transfer
        pass
```

### Process States

- **INITIATED**: Account closure has been started
- **LIQUIDATING**: Positions are being sold and orders cancelled
- **SETTLING**: Waiting for T+1 settlement (1-3 business days)
- **WITHDRAWING**: Transferring funds to ACH account (multi-day process)
- **CLOSING**: Final account closure steps
- **COMPLETED**: Account fully closed and user notified

### Redis State Keys

- `closure_state:{account_id}`: General closure state and progress tracking
- `withdrawal_state:{account_id}`: Multi-day withdrawal state and transfer history
- `partial_withdrawal:{account_id}`: Legacy support for partial withdrawal tracking

#### State Structure Examples

**Closure State** (`closure_state:{account_id}`):
```json
{
  "user_id": "uuid",
  "account_id": "alpaca_account_id", 
  "ach_relationship_id": "ach_id",
  "confirmation_number": "CLA-XXXXX-XXXXX",
  "phase": "liquidation|settlement|withdrawal|transfer_completion|final_closure|completed",
  "initiated_at": "2025-08-04T21:05:09.085524",
  "updated_at": "2025-08-04T21:05:09.227634"
}
```

**Withdrawal State** (`withdrawal_state:{account_id}`):
```json
{
  "phase": "withdrawal",
  "ach_relationship_id": "ach_id",
  "daily_limit": 50000.0,
  "started_at": "2025-08-04T21:05:09.085524",
  "transfers_completed": [
    {
      "amount": 50000.0,
      "transfer_id": "transfer_id",
      "initiated_at": "2025-08-04T21:05:09.085524",
      "status": "completed"
    }
  ],
  "next_transfer_date": "2025-08-05T21:05:09.085524",
  "waiting_for_next_transfer": true
}
```

## Account Closure Workflow

### Phase 1: Initiation (Immediate)

1. User clicks "Close Account" in frontend
2. Frontend calls `/api/account-closure/initiate/{accountId}`
3. API server:
   - Updates Supabase status to `pending_closure`
   - Triggers `AutomatedAccountClosureProcessor.initiate_automated_closure()`
   - Sends initiation email to user
   - Returns immediate response with confirmation number

### Phase 2: Background Processing (Hours/Days)

The AutomatedAccountClosureProcessor handles the complete workflow:

1. **Liquidation Phase**
   - Cancel all open orders
   - Liquidate all positions
   - Wait for position clearing (up to 15 minutes)
   - Update Redis state with progress

2. **Settlement Phase**
   - Wait for T+1 settlement (1-3 business days)
   - Check settlement status every 2 hours
   - Timeout after 3 days
   - Persist settlement state in Redis

3. **Withdrawal Phase** (Multi-Day Process)
   - Check withdrawable cash amount
   - If > $50,000: Transfer $50,000, wait 24 hours, repeat
   - If ≤ $50,000: Transfer full amount
   - Store withdrawal state in Redis for recovery
   - Monitor transfer status every 2 hours
   - Continue until withdrawable cash = $0

4. **Closure Phase**
   - Final safety checks
   - Close the account via Alpaca API
   - Send completion email with aesthetic design
   - Update Supabase status to `closed`

### Error Handling

- **Automatic Retries**: Each phase has retry logic with exponential backoff
- **State Recovery**: Redis state persistence allows process recovery after server restarts
- **Partial Failures**: Each phase has its own error handling and can be resumed
- **Timeout Handling**: Long-running phases have timeout limits to prevent indefinite waiting
- **Stuck Account Recovery**: `fix_stuck_account_closure.py` script can identify and resume stuck processes

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

3. **Test Account Closure**:
   ```bash
   # Test the fix script for stuck accounts
   python scripts/fix_stuck_account_closure.py --account-id <account_id> --dry-run
   ```

### Production Deployment

1. **API Service**: Existing ECS service handles API requests and background processing
2. **Redis**: Shared ElastiCache Redis instance for state persistence
3. **Email Service**: AWS SES configured for notification emails

#### Current Production Setup

The automated account closure process runs within the existing API service, using Redis for state persistence. No additional worker services are required.

## Monitoring

### Account Closure Monitoring

```bash
# Check specific account closure status
python scripts/fix_stuck_account_closure.py --account-id <account_id> --dry-run

# Find all stuck accounts
python scripts/fix_stuck_account_closure.py --find-stuck --dry-run

# Resume stuck account closure
python scripts/fix_stuck_account_closure.py --account-id <account_id>
```

### API Endpoints

- `GET /api/account-closure/progress/{account_id}`: Get account closure progress
- `GET /api/account-closure/data`: Get closure data for current user

### Health Checks

- API service health checks include Redis connectivity
- Account closure progress is monitored via Redis state

## Benefits

### Reliability

- **State Persistence**: Redis-based state management survives server restarts
- **Multi-Day Processing**: Handles Alpaca's $50,000 daily transfer limits
- **Recovery Mechanisms**: Stuck account detection and recovery scripts
- **Comprehensive Logging**: Detailed process tracking and error handling

### Scalability

- **Background Processing**: Automated closure runs independently of API requests
- **State Management**: Redis enables process recovery and monitoring
- **Resource Efficiency**: No additional worker services required

### Maintainability

- **Modular Design**: Clear separation between API, processing, and state management
- **Error Handling**: Comprehensive error handling with retry logic
- **Monitoring Tools**: Built-in stuck account detection and recovery
- **Documentation**: Well-documented architecture and processes

## Migration

### From Old System

1. **Immediate**: API endpoints now trigger AutomatedAccountClosureProcessor
2. **Backward Compatible**: Existing status checking endpoints continue to work
3. **Stuck Account Recovery**: `fix_stuck_account_closure.py` script handles existing stuck accounts

### Testing & Debugging

#### 1. Testing Account Closure Process

**Unit Tests**:
```bash
cd backend
source venv/bin/activate
python -m pytest tests/account_closure/ -v
```

**Integration Tests**:
```bash
# Test complete closure flow
python -m pytest tests/account_closure/test_complete_closure_flow.py -v

# Test multi-day transfers
python -m pytest tests/account_closure/test_multi_day_transfers.py -v
```

#### 2. Debugging Stuck Accounts

**Check Account Status (Dry Run)**:
```bash
# Check specific account without making changes
python scripts/fix_stuck_account_closure.py --account-id <account_id> --dry-run

# Find all stuck accounts
python scripts/fix_stuck_account_closure.py --find-stuck --dry-run
```

**Resume Stuck Account**:
```bash
# Resume actual closure process
python scripts/fix_stuck_account_closure.py --account-id <account_id>
```

#### 3. Redis State Debugging

**Check Closure State**:
```bash
# General closure state
redis-cli get closure_state:<account_id>

# Withdrawal state 
redis-cli get withdrawal_state:<account_id>

# Partial withdrawal state (legacy)
redis-cli get partial_withdrawal:<account_id>
```

**Monitor State Changes**:
```bash
# Watch for real-time updates
redis-cli monitor

# Check all keys for an account
redis-cli keys "*<account_id>*"
```

#### 4. Testing Edge Cases

**Multi-Day Transfer Testing**:
```bash
# Set up test account with >$50K balance
# Initiate closure and monitor Redis state for multi-day logic

# Check withdrawal state progression
redis-cli get withdrawal_state:<account_id>
```

**Server Restart Recovery Testing**:
```bash
# 1. Start closure process
python scripts/fix_stuck_account_closure.py --account-id <account_id>

# 2. Restart server while process is running
pkill -f api_server.py
python api_server.py &

# 3. Verify Redis state persisted
redis-cli get closure_state:<account_id>

# 4. Resume if needed
python scripts/fix_stuck_account_closure.py --account-id <account_id>
```

#### 5. Email Testing

**Test Email Templates**:
```bash
# Test initiation email design
python -c "
from utils.email.email_service import EmailService
service = EmailService()
html = service._generate_closure_email_html('Test User', 'test-account', 'CONF123')
print(html)
"

# Test completion email design  
python -c "
from utils.email.email_service import EmailService
service = EmailService()
html = service._generate_closure_complete_email_html('Test User', 'test-account', 'CONF123', 50000.0)
print(html)
"
```

## Security Considerations

- **Credentials**: Automated processor uses same secure credential management as API service
- **Network**: All processing runs within existing secure API service
- **Logging**: Sensitive data is redacted from logs
- **Monitoring**: Progress endpoints require proper authentication

## Future Enhancements

1. **Enhanced Monitoring**: Web dashboard for account closure progress
2. **Automated Alerts**: Proactive notifications for stuck accounts
3. **Batch Processing**: Handle multiple account closures efficiently
4. **Metrics**: Integration with monitoring systems (CloudWatch, Prometheus)
5. **Advanced Recovery**: Automated detection and recovery of stuck processes

## Exact Timing Logic

### Phase Timing Breakdown

**Phase 1: Liquidation** (0-15 minutes)
- Order cancellation: Immediate
- Position liquidation: 0-15 minutes (market dependent)
- State update: Real-time via Redis

**Phase 2: Settlement** (1-3 business days)  
- Settlement waiting: T+1 settlement cycle
- Status checks: Every 2 hours
- Timeout: 3 business days maximum
- State persistence: Continuous Redis updates

**Phase 3: Withdrawal** (Immediate when funds available)
- ≤ $50,000: Single transfer (immediate)
- > $50,000: Multiple transfers with exactly 24-hour delays
- Transfer monitoring: Every 2 hours
- State tracking: Complete transfer history in Redis

**Phase 4: Final Closure** (1-2 hours)
- Safety checks: Immediate
- Account closure: 15 minutes
- Email sending: Immediate
- Database updates: Real-time

### Transfer Logic Specifics

```python
# Daily limit enforcement
DAILY_LIMIT = 50000.0

if withdrawable_amount <= DAILY_LIMIT:
    # Single transfer - immediate
    transfer_amount = withdrawable_amount
    next_transfer_date = None
else:
    # Multi-day transfer - wait exactly 24 hours
    transfer_amount = DAILY_LIMIT
    next_transfer_date = datetime.now() + timedelta(hours=24)
```

## Troubleshooting

### Common Issues

#### 1. Redis Connection Issues
**Symptoms**: Process fails to start, state not persisting
```bash
# Check Redis connectivity
redis-cli ping
# Expected: PONG

# Check Redis configuration
env | grep REDIS
# Should show REDIS_URL or REDIS_HOST/PORT/DB

# Test Redis from Python
python -c "
import redis
import os
redis_url = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')
r = redis.from_url(redis_url, decode_responses=True)
print('Redis ping:', r.ping())
"
```

#### 2. Account Stuck in pending_closure
**Symptoms**: Account shows pending_closure for days, no progress updates

**Step 1: Check Current Status**
```bash
# Check account status with dry run
python scripts/fix_stuck_account_closure.py --account-id <account_id> --dry-run
```

**Step 2: Check Redis State**
```bash
# Check if any state exists
redis-cli get closure_state:<account_id>
redis-cli get withdrawal_state:<account_id>
redis-cli get partial_withdrawal:<account_id>
```

**Step 3: Resume Process**
```bash
# Resume the closure process
python scripts/fix_stuck_account_closure.py --account-id <account_id>
```

#### 3. Multi-Day Transfer Issues  
**Symptoms**: Transfers not initiating after 24 hours, wrong amounts

**Check Transfer State**:
```bash
# Get withdrawal state details
redis-cli get withdrawal_state:<account_id> | jq .

# Check for next transfer timing
redis-cli get withdrawal_state:<account_id> | jq '.next_transfer_date'
```

**Manually Trigger Next Transfer** (Emergency Only):
```bash
# Clear waiting state to force immediate transfer
redis-cli del partial_withdrawal:<account_id>
python scripts/fix_stuck_account_closure.py --account-id <account_id>
```

#### 4. Email Not Sending
**Symptoms**: No initiation or completion emails received

**Check Email Service**:
```bash
# Test AWS SES configuration
python -c "
from utils.email.email_service import EmailService
service = EmailService()
print('Email service configured:', service._is_configured())
"

# Check email logs
grep -r "closure.*email" logs/
```

#### 5. Process Not Persistent
**Symptoms**: Process stops after server restart

**Verify State Persistence**:
```bash
# Before restart - check state exists
redis-cli get closure_state:<account_id>

# After restart - state should still exist
redis-cli get closure_state:<account_id>

# If state lost, check Redis configuration
redis-cli config get save
```

### Advanced Debugging

#### Check Process Phase Progression
```bash
# Monitor Redis state changes in real-time
redis-cli monitor | grep <account_id>

# Check phase transitions
watch -n 5 'redis-cli get closure_state:<account_id> | jq .phase'
```

#### Verify Alpaca API Status
```bash
# Test Alpaca connectivity and account status
python -c "
from utils.alpaca.account_closure import AccountClosureManager
manager = AccountClosureManager(sandbox=True)
info = manager.get_account_info('<account_id>')
print('Account Status:', info['account'].status)
print('Cash Balance:', info['cash_balance'])
print('Withdrawable:', info['cash_withdrawable'])
"
```

#### Database State Verification
```bash
# Check Supabase user status
python -c "
from utils.supabase.db_client import get_supabase_client
supabase = get_supabase_client()
result = supabase.table('user_onboarding').select('status,account_closure_initiated_at').eq('alpaca_account_id', '<account_id>').execute()
print('User Status:', result.data)
"
```

### Emergency Recovery Commands

#### Force Resume Stuck Account
```bash
# Clear all Redis state and restart
redis-cli del closure_state:<account_id>
redis-cli del withdrawal_state:<account_id>  
redis-cli del partial_withdrawal:<account_id>
python scripts/fix_stuck_account_closure.py --account-id <account_id>
```

#### Manual State Creation (Advanced)
```bash
# Create minimal state for manual recovery
redis-cli set closure_state:<account_id> '{
  "user_id": "<user_id>",
  "account_id": "<account_id>", 
  "ach_relationship_id": "<ach_id>",
  "confirmation_number": "CLA-MANUAL-RECOVERY",
  "phase": "withdrawal",
  "initiated_at": "'$(date -Iseconds)'"
}'
```

### Monitoring Commands

#### Real-Time Process Monitoring
```bash
# Watch account closure progress
watch -n 10 'python scripts/fix_stuck_account_closure.py --account-id <account_id> --dry-run'

# Monitor Redis state changes
redis-cli --latency-history -i 5

# Check process logs
tail -f logs/automated-account-closure.log | grep <account_id>
```

## Conclusion

The new automated account closure architecture provides a robust, scalable, and maintainable solution for handling long-running account closure processes. It addresses all the critical issues of the previous implementation while providing comprehensive monitoring, error handling, and recovery capabilities.

Key improvements include:
- **Complete Automation**: Full end-to-end account closure process
- **Multi-Day Transfer Handling**: Proper handling of Alpaca's $50,000 daily limits
- **State Persistence**: Redis-based state management for process recovery
- **Stuck Account Recovery**: Automated detection and recovery of stuck processes
- **Enhanced User Experience**: Dedicated closure page with proper navigation lockdown
- **Professional Email Notifications**: Aesthetic email design for initiation and completion

The system is designed to be production-ready with proper error handling, monitoring, and deployment configurations. It follows best practices for financial systems and provides a solid foundation for future enhancements. 