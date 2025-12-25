import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Disconnect a specific SnapTrade brokerage account.
 * 
 * This endpoint:
 * 1. Verifies user authentication
 * 2. Proxies the disconnect request to the backend
 * 3. Returns success/failure status
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;
    
    // SECURITY: Validate accountId format to prevent path traversal attacks
    // SnapTrade account IDs are UUIDs (e.g., "5ea10263-4b55-451c-8f07-faa20dc26442")
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!accountId || !uuidRegex.test(accountId)) {
      console.error(`[Disconnect Account] ❌ Invalid accountId format: ${accountId}`);
      return NextResponse.json(
        { error: 'Invalid account ID format' },
        { status: 400 }
      );
    }
    
    console.log(`[Disconnect Account] Starting disconnect for account: ${accountId}`);
    
    // Authenticate user via Supabase
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[Disconnect Account] ❌ Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log(`[Disconnect Account] User authenticated: ${user.id}`);
    
    // Get session for JWT token
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.error('[Disconnect Account] ❌ No active session');
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      );
    }
    
    // Call the backend endpoint
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    const apiKey = process.env.BACKEND_API_KEY;
    
    if (!apiKey) {
      console.error('[Disconnect Account] ❌ BACKEND_API_KEY not configured!');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    console.log(`[Disconnect Account] 📤 Calling backend: ${backendUrl}/api/snaptrade/disconnect-account/${accountId}`);
    
    const response = await fetch(`${backendUrl}/api/snaptrade/disconnect-account/${accountId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${session.access_token}`,
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      // Log full error details server-side only
      console.error('[Disconnect Account] ❌ Backend disconnect failed:', errorData);
      // Return generic error to client to avoid leaking internal details
      return NextResponse.json(
        { error: 'Failed to disconnect account' },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    console.log(`✅ [Disconnect Account] Account disconnected successfully:`, result);
    
    return NextResponse.json({
      success: true,
      message: result.message || 'Account disconnected successfully',
      ...result
    });
    
  } catch (error) {
    // Log full error details server-side only
    console.error('[Disconnect Account] ❌ Unexpected error:', error);
    // Return generic message to client to avoid leaking internal details
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

