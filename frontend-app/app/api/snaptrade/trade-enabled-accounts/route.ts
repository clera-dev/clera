import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';

/**
 * GET /api/snaptrade/trade-enabled-accounts
 * 
 * PRODUCTION-GRADE: Proxies to backend which handles:
 * - User preferences (cash_only vs cash_and_margin)
 * - Live balance fetching if stale
 * - SnapTrade API integration
 * 
 * This ensures consistent behavior and respects user trading preferences.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get session for JWT token
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 401 }
      );
    }

    // PRODUCTION-GRADE: Proxy to backend which respects user preferences
    const backendUrl = process.env.BACKEND_API_URL;
    const apiKey = process.env.BACKEND_API_KEY;
    if (!backendUrl || !apiKey) {
      console.error('Backend API configuration missing for trade-enabled-accounts.');
      return NextResponse.json(
        { error: 'Backend service is not configured' },
        { status: 500 }
      );
    }
    
    const backendResponse = await fetch(`${backendUrl}/api/snaptrade/trade-enabled-accounts`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-API-Key': apiKey,
      },
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('Backend error:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch trade-enabled accounts from backend' },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in trade-enabled-accounts route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


