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

3. **ClosureStateManager** (`utils/alpaca/closure_state_manager.py`)
   - Redis-based state persistence for multi-day workflows
   - Tracks withdrawal progress and next transfer dates
   - Enables process recovery after server restarts

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
    def __init__(self, sandbox: bool = False):
        self.manager = AccountClosureManager(sandbox)
        self.state_manager = ClosureStateManager()
        self.email_service = EmailService()
    
    async def initiate_automated_closure(
        self, 
        user_id: str, 
        account_id: str, 
        ach_relationship_id: str
    ) -> Dict[str, Any]:
        # Complete multi-step closure process
```

### Process States

- **INITIATED**: Account closure has been started
- **LIQUIDATING**: Positions are being sold and orders cancelled
- **SETTLING**: Waiting for T+1 settlement (1-3 business days)
- **WITHDRAWING**: Transferring funds to ACH account (multi-day process)
- **CLOSING**: Final account closure steps
- **COMPLETED**: Account fully closed and user notified

### Redis State Keys

- `closure_state:{account_id}`: Current closure state and progress
- `withdrawal_state:{account_id}`: Multi-day withdrawal tracking
- `next_transfer_date:{account_id}`: Next transfer date for large amounts
- `closure_logs:{account_id}`: Detailed process logs

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

### Testing

1. **Unit Tests**: Test automated closure processor and state management
2. **Integration Tests**: Test full account closure workflow with multi-day transfers
3. **Stuck Account Tests**: Test recovery script functionality

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

## Troubleshooting

### Common Issues

1. **Redis Connection Issues**
   - Check Redis connectivity
   - Verify environment variables
   - Check network security groups

2. **Account Stuck in pending_closure**
   - Run `fix_stuck_account_closure.py` script
   - Check Redis state for the account
   - Verify Alpaca account status

3. **Multi-Day Transfer Issues**
   - Check withdrawal state in Redis
   - Verify next transfer date
   - Check Alpaca transfer status

### Debug Commands

```bash
# Check Redis connectivity
redis-cli ping

# Check account closure state
redis-cli get closure_state:<account_id>

# Check withdrawal state
redis-cli get withdrawal_state:<account_id>

# Find stuck accounts
python scripts/fix_stuck_account_closure.py --find-stuck --dry-run
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