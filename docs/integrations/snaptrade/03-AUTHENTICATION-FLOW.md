# SnapTrade Authentication & Onboarding Flow

## Overview

This document explains how to integrate SnapTrade's connection flow into your existing onboarding system.

## Backend API Routes

### 1. Create SnapTrade Link Token Route

Create `/api/snaptrade/create-link-token/route.ts`:

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get request body
    const { connectionType = 'trade', broker, redirectUrl } = await request.json();
    
    // Call backend to get SnapTrade connection URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/snaptrade/connection-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.id,
        connection_type: connectionType,
        broker: broker || null,
        redirect_url: redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/snaptrade-callback`,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create SnapTrade connection URL');
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      connectionUrl: data.connection_url,
      userId: user.id,
    });
    
  } catch (error) {
    console.error('Error creating SnapTrade link token:', error);
    return NextResponse.json(
      { error: 'Failed to create connection URL' },
      { status: 500 }
    );
  }
}
```

### 2. Backend Python Endpoint

Create `backend/api_server.py` route:

```python
@app.post("/api/snaptrade/connection-url")
async def create_snaptrade_connection_url(
    request: Request,
    current_user: Dict = Depends(get_current_user)
):
    """
    Create SnapTrade connection portal URL for user.
    """
    try:
        body = await request.json()
        user_id = body.get('user_id')
        connection_type = body.get('connection_type', 'trade')
        broker = body.get('broker')
        redirect_url = body.get('redirect_url')
        
        # Validate user
        if user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        # Initialize SnapTrade provider
        from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
        provider = SnapTradePortfolioProvider()
        
        # Get connection portal URL
        connection_url = await provider.get_connection_portal_url(
            user_id=user_id,
            broker=broker,
            connection_type=connection_type,
            redirect_url=redirect_url
        )
        
        return {
            "success": True,
            "connection_url": connection_url,
            "user_id": user_id
        }
        
    except Exception as e:
        logger.error(f"Error creating SnapTrade connection URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/snaptrade/webhook")
async def snaptrade_webhook(request: Request):
    """
    Handle SnapTrade webhooks for connection events.
    """
    try:
        payload = await request.json()
        
        # Verify webhook signature (if configured)
        # webhook_signature = request.headers.get('x-snaptrade-signature')
        
        event_type = payload.get('type')
        logger.info(f"📩 Received SnapTrade webhook: {event_type}")
        
        if event_type == 'CONNECTION.CREATED':
            # Handle new connection
            await handle_connection_created(payload)
        
        elif event_type == 'CONNECTION.BROKEN':
            # Handle broken connection
            await handle_connection_broken(payload)
        
        elif event_type == 'ACCOUNT_HOLDINGS_UPDATED':
            # Handle holdings update
            await handle_holdings_updated(payload)
        
        elif event_type == 'USER_DELETED':
            # Handle user deletion
            await handle_user_deleted(payload)
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Error processing SnapTrade webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def handle_connection_created(payload: Dict):
    """Handle CONNECTION.CREATED webhook."""
    user_id = payload.get('userId')
    authorization_id = payload.get('authorizationId')
    brokerage = payload.get('brokerage', {})
    
    logger.info(f"✅ New connection created for user {user_id}: {brokerage.get('name')}")
    
    # Store connection in database
    supabase = get_supabase_client()
    
    # First, get or create SnapTrade user record
    user_result = supabase.table('snaptrade_users')\
        .select('*')\
        .eq('user_id', user_id)\
        .execute()
    
    if not user_result.data:
        logger.warning(f"User {user_id} not found in snaptrade_users table")
        return
    
    # Store connection
    connection_data = {
        'user_id': user_id,
        'authorization_id': authorization_id,
        'brokerage_slug': brokerage.get('slug', ''),
        'brokerage_name': brokerage.get('name', ''),
        'status': 'active'
    }
    
    supabase.table('snaptrade_brokerage_connections').insert(connection_data).execute()
    
    # Fetch and store accounts
    from utils.portfolio.snaptrade_provider import SnapTradePortfolioProvider
    provider = SnapTradePortfolioProvider()
    
    # Get user credentials
    credentials = supabase.table('snaptrade_users')\
        .select('snaptrade_user_id, snaptrade_user_secret')\
        .eq('user_id', user_id)\
        .execute()
    
    if credentials.data:
        snaptrade_user_id = credentials.data[0]['snaptrade_user_id']
        user_secret = credentials.data[0]['snaptrade_user_secret']
        
        # Get accounts for this authorization
        accounts_response = provider.client.account_information.list_user_accounts(
            user_id=snaptrade_user_id,
            user_secret=user_secret
        )
        
        # Filter accounts for this authorization
        for account in accounts_response.body:
            if account.get('brokerage_authorization') == authorization_id:
                account_data = {
                    'user_id': user_id,
                    'provider': 'snaptrade',
                    'provider_account_id': str(account['id']),
                    'snaptrade_authorization_id': authorization_id,
                    'institution_name': brokerage.get('name', ''),
                    'brokerage_name': brokerage.get('name', ''),
                    'account_name': account.get('name', ''),
                    'account_type': account.get('type', 'investment'),
                    'account_mode': 'snaptrade',
                    'connection_type': 'trade',  # Assume trade for now
                    'is_active': True
                }
                
                supabase.table('user_investment_accounts').insert(account_data).execute()
    
    logger.info(f"✅ Stored accounts for authorization {authorization_id}")


async def handle_connection_broken(payload: Dict):
    """Handle CONNECTION.BROKEN webhook."""
    authorization_id = payload.get('authorizationId')
    
    logger.warning(f"⚠️ Connection broken: {authorization_id}")
    
    # Update connection status
    supabase = get_supabase_client()
    
    supabase.table('snaptrade_brokerage_connections')\
        .update({
            'status': 'disabled',
            'disabled_date': datetime.now().isoformat(),
            'error_message': payload.get('reason', 'Connection broken')
        })\
        .eq('authorization_id', authorization_id)\
        .execute()
    
    # Update accounts status
    supabase.table('user_investment_accounts')\
        .update({
            'is_active': False,
            'connection_status': 'error'
        })\
        .eq('snaptrade_authorization_id', authorization_id)\
        .execute()


async def handle_holdings_updated(payload: Dict):
    """Handle ACCOUNT_HOLDINGS_UPDATED webhook."""
    account_id = payload.get('accountId')
    
    logger.info(f"📊 Holdings updated for account: {account_id}")
    
    # Trigger background sync for this account
    # This could queue a task to refresh holdings
    pass


async def handle_user_deleted(payload: Dict):
    """Handle USER_DELETED webhook."""
    user_id = payload.get('userId')
    
    logger.info(f"🗑️ User deleted from SnapTrade: {user_id}")
    
    # Clean up user data
    supabase = get_supabase_client()
    
    # Delete SnapTrade user record
    supabase.table('snaptrade_users').delete().eq('user_id', user_id).execute()
```

## Frontend Components

### 1. SnapTrade Connect Button Component

Create `frontend-app/components/portfolio/SnapTradeConnectButton.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface SnapTradeConnectButtonProps {
  connectionType?: 'read' | 'trade';
  broker?: string;
  redirectUrl?: string;
  onSuccess?: () => void;
  className?: string;
}

export function SnapTradeConnectButton({
  connectionType = 'trade',
  broker,
  redirectUrl,
  onSuccess,
  className,
}: SnapTradeConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleConnect = async () => {
    try {
      setIsLoading(true);

      // Get connection URL from backend
      const response = await fetch('/api/snaptrade/create-link-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionType,
          broker,
          redirectUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create connection URL');
      }

      const data = await response.json();

      // Open SnapTrade connection portal
      window.location.href = data.connectionUrl;

    } catch (error) {
      console.error('Error connecting brokerage:', error);
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect brokerage. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Connecting...
        </>
      ) : (
        <>
          Connect External Brokerage
        </>
      )}
    </Button>
  );
}
```

### 2. SnapTrade Callback Page

Create `frontend-app/app/onboarding/snaptrade-callback/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function SnapTradeCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    // SnapTrade redirects back with connection status in URL params
    const params = new URLSearchParams(window.location.search);
    const connectionStatus = params.get('status');
    const error = params.get('error');

    if (error) {
      setStatus('error');
      toast({
        title: 'Connection Failed',
        description: error,
        variant: 'destructive',
      });
      
      // Redirect back to onboarding after 3 seconds
      setTimeout(() => {
        router.push('/onboarding');
      }, 3000);
    } else if (connectionStatus === 'success' || !error) {
      setStatus('success');
      toast({
        title: 'Connection Successful!',
        description: 'Your brokerage account has been connected.',
      });
      
      // Redirect to portfolio after 2 seconds
      setTimeout(() => {
        router.push('/portfolio');
      }, 2000);
    }
  }, [router, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {status === 'loading' && (
          <>
            <div className="mb-4">
              <svg className="animate-spin h-12 w-12 mx-auto text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Processing connection...</h2>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="mb-4">
              <svg className="h-12 w-12 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-green-600">Connection Successful!</h2>
            <p className="mt-2 text-gray-600">Redirecting to your account...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="mb-4">
              <svg className="h-12 w-12 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-red-600">Connection Failed</h2>
            <p className="mt-2 text-gray-600">Redirecting back to onboarding...</p>
          </>
        )}
      </div>
    </div>
  );
}
```

### 3. Update Onboarding Flow

Add to your existing `PlaidConnectionStep.tsx`:

```typescript
import { SnapTradeConnectButton } from '@/components/portfolio/SnapTradeConnectButton';

export function PlaidConnectionStep() {
  // ... existing code ...
  
  return (
    <div>
      <h2>Connect Your Investment Accounts</h2>
      
      {/* Option 1: Connect Clera Brokerage (Alpaca) */}
      <div className="border rounded-lg p-4 mb-4">
        <h3>Clera Brokerage Account</h3>
        <p>Open a new brokerage account managed by Clera</p>
        <Button onClick={handleAlpacaConnect}>
          Open Clera Account
        </Button>
      </div>
      
      {/* Option 2: Connect External Brokerages (SnapTrade) */}
      <div className="border rounded-lg p-4">
        <h3>Connect External Brokerage</h3>
        <p>Link your existing accounts from Schwab, Fidelity, TD Ameritrade, and more</p>
        <SnapTradeConnectButton
          connectionType="trade"
          redirectUrl={`${window.location.origin}/onboarding/snaptrade-callback`}
        />
      </div>
    </div>
  );
}
```

## Webhook Configuration

### 1. Set up webhook URL in SnapTrade Dashboard:

```
https://your-domain.com/api/snaptrade/webhook
```

### 2. Handle webhook events:

```python
# backend/api_server.py

SNAPTRADE_WEBHOOK_EVENTS = [
    'CONNECTION.CREATED',
    'CONNECTION.BROKEN',
    'CONNECTION.REFRESHED',
    'ACCOUNT_HOLDINGS_UPDATED',
    'TRANSACTIONS_UPDATED',
    'USER_DELETED'
]
```

## Testing the Flow

1. **Start your development servers**:
```bash
# Backend
cd backend && python api_server.py

# Frontend
cd frontend-app && npm run dev
```

2. **Test connection flow**:
   - Navigate to `/onboarding`
   - Click "Connect External Brokerage"
   - Complete SnapTrade connection
   - Verify redirect to callback page
   - Check database for new records

3. **Verify webhooks**:
```bash
# Use SnapTrade's webhook testing tool or ngrok for local testing
ngrok http 8000
# Update SnapTrade dashboard with ngrok URL
```

## Next Steps

1. ✅ User can register with SnapTrade
2. ✅ User can connect external brokerages
3. ✅ Webhooks update account status
4. ✅ Accounts ready for portfolio display

**Next**: Proceed to [04-PORTFOLIO-SERVICE.md](./04-PORTFOLIO-SERVICE.md) for portfolio service updates.

