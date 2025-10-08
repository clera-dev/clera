# Production Webhook Setup for Plaid Investment API

## Overview
This document provides the complete setup for production-ready Plaid webhooks to ensure real-time portfolio data updates and automatic synchronization.

## Plaid Webhook Types for Investment API

Based on Plaid's Investment API documentation:

### 1. HOLDINGS Webhooks
- **Type:** `HOLDINGS`
- **Code:** `DEFAULT_UPDATE`
- **Trigger:** Holdings quantity or price changes detected
- **Frequency:** Daily after market hours, or real-time for significant changes
- **Use Case:** Update portfolio values when holdings change

### 2. INVESTMENTS_TRANSACTIONS Webhooks  
- **Type:** `INVESTMENTS_TRANSACTIONS`
- **Code:** `DEFAULT_UPDATE`
- **Trigger:** New or canceled investment transactions detected
- **Frequency:** Real-time when transactions occur
- **Use Case:** Update transaction history and cost basis calculations

## Production Setup Steps

### 1. Configure Webhook URL in Plaid Dashboard

**Development Webhook URL:**
```
http://localhost:8000/webhook/plaid
```

**Production Webhook URL:**
```
https://api.askclera.com/webhook/plaid
```

### 2. Database Migration for Webhook Tracking

Create table to track webhook processing:

```sql
-- Migration: Create webhook tracking table
CREATE TABLE public.plaid_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_type TEXT NOT NULL,
    webhook_code TEXT NOT NULL,
    item_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    processed_at TIMESTAMPTZ DEFAULT now(),
    processing_duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    raw_webhook_data JSONB DEFAULT '{}',
    
    -- Index for monitoring
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for webhook monitoring
CREATE INDEX idx_webhook_events_item_id ON public.plaid_webhook_events(item_id, created_at DESC);
CREATE INDEX idx_webhook_events_user_id ON public.plaid_webhook_events(user_id, created_at DESC);
CREATE INDEX idx_webhook_events_type ON public.plaid_webhook_events(webhook_type, webhook_code, created_at DESC);

-- RLS policies
ALTER TABLE public.plaid_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their webhook events" ON public.plaid_webhook_events
    FOR SELECT
    USING (auth.uid() = user_id);
```

### 3. Environment Variables

Add to `backend/.env`:
```bash
# Plaid Webhook Configuration
PLAID_WEBHOOK_URL=https://api.askclera.com/webhook/plaid
PLAID_WEBHOOK_VERIFICATION_KEY=your_webhook_verification_key_from_plaid_dashboard
```

### 4. Enhanced Link Token with Webhook

Update the link token creation to include webhook URL:

```python
# In plaid_provider.py create_link_token method
request_params = {
    'products': [Products('investments')],
    'client_name': "Clera",
    'country_codes': [CountryCode('US'), CountryCode('CA')],
    'language': 'en',
    'webhook': os.getenv('PLAID_WEBHOOK_URL'),  # Add webhook URL
    'user': LinkTokenCreateRequestUser(
        client_user_id=user_id,
        email_address=user_email
    )
}
```

### 5. Webhook Security Verification

Implement Plaid webhook verification (recommended for production):

```python
def verify_plaid_webhook(request_body: bytes, plaid_signature: str) -> bool:
    """
    Verify Plaid webhook signature for security.
    
    Args:
        request_body: Raw webhook request body
        plaid_signature: X-Plaid-Signature header value
        
    Returns:
        True if signature is valid
    """
    import hashlib
    
    webhook_key = os.getenv('PLAID_WEBHOOK_VERIFICATION_KEY')
    if not webhook_key:
        logger.warning("PLAID_WEBHOOK_VERIFICATION_KEY not configured")
        return True  # Allow in development
    
    # Compute expected signature
    expected_signature = hashlib.sha256(
        (webhook_key + request_body.decode('utf-8')).encode('utf-8')
    ).hexdigest()
    
    return hmac.compare_digest(plaid_signature, expected_signature)
```

## Production Data Flow

### Real-Time Updates
```
1. User trades on Schwab/Fidelity/etc.
2. Institution reports to Plaid (1-24 hours)
3. Plaid sends webhook to Clera API
4. Webhook handler refreshes user's portfolio data
5. Updated data available immediately on next page load
6. Optional: WebSocket push to connected frontend clients
```

### Background Sync Schedule
```
- Holdings: Daily at 2 AM EST (after market close + Plaid processing)
- Transactions: Real-time via webhooks
- Account balances: Every 6 hours
- Cache TTL: 30 minutes for normal requests, 5 minutes after webhooks
```

## Monitoring and Alerting

### Webhook Health Monitoring
```sql
-- Query to monitor webhook processing health
SELECT 
    webhook_type,
    webhook_code,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed,
    AVG(processing_duration_ms) as avg_processing_time_ms,
    MAX(created_at) as last_received
FROM public.plaid_webhook_events 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY webhook_type, webhook_code
ORDER BY total_events DESC;
```

### User Portfolio Freshness Monitoring
```sql
-- Query to monitor data freshness per user
SELECT 
    user_id,
    COUNT(*) as account_count,
    MAX(last_synced) as last_sync,
    AGE(NOW(), MAX(last_synced)) as time_since_sync,
    COUNT(*) FILTER (WHERE sync_status = 'error') as error_accounts
FROM public.user_investment_accounts
WHERE is_active = true
GROUP BY user_id
HAVING AGE(NOW(), MAX(last_synced)) > INTERVAL '6 hours'
ORDER BY time_since_sync DESC;
```

## Error Recovery

### Webhook Retry Logic
```python
async def retry_failed_sync(user_id: str, max_retries: int = 3):
    """Retry failed portfolio synchronization with exponential backoff."""
    for attempt in range(max_retries):
        try:
            portfolio_service = get_portfolio_service()
            success = await portfolio_service.refresh_data(user_id)
            
            if success:
                logger.info(f"✅ Retry {attempt + 1} successful for user {user_id}")
                return True
            
        except Exception as e:
            wait_time = 2 ** attempt  # Exponential backoff
            logger.warning(f"Retry {attempt + 1} failed for user {user_id}, waiting {wait_time}s: {e}")
            await asyncio.sleep(wait_time)
    
    logger.error(f"❌ All retries failed for user {user_id}")
    return False
```

### Manual Sync Endpoint
```python
@app.post("/api/portfolio/force-sync")
async def force_portfolio_sync(
    request: dict,
    user_id: str = Depends(get_authenticated_user_id)
):
    """Force immediate portfolio synchronization (admin/support use)."""
    try:
        sync_service = get_sync_service()
        portfolio_data = await sync_service._sync_user_portfolio(user_id)
        
        return {
            "success": True,
            "message": f"Portfolio synced successfully",
            "total_value": portfolio_data['summary']['total_value'],
            "last_updated": portfolio_data['metadata']['last_updated']
        }
        
    except Exception as e:
        logger.error(f"Error forcing portfolio sync for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Sync failed")
```

## AWS Production Deployment

### ALB Configuration for Webhooks
Add to your `backend/copilot/api-service/manifest.yml`:

```yaml
http:
  path: '/webhook/plaid'
  healthcheck: '/webhook/plaid/health'
  
environments:
  production:
    variables:
      PLAID_WEBHOOK_URL: "https://api.askclera.com/webhook/plaid"
      PLAID_WEBHOOK_VERIFICATION_KEY: 
        from_cfn: ${COPILOT_APPLICATION_NAME}-production-PlaidWebhookKey
```

### Secrets Manager Setup
```bash
# Store webhook verification key in AWS SSM
aws ssm put-parameter \
  --name "/copilot/clera/production/secrets/PLAID_WEBHOOK_VERIFICATION_KEY" \
  --value "your_webhook_key_from_plaid_dashboard" \
  --type "SecureString"
```

This production setup ensures reliable, real-time portfolio data updates with comprehensive monitoring and error recovery.
