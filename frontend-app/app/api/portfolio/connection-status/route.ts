import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    // Authenticate user with Supabase
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Proxy to backend connection status endpoint
    const backendUrl = `${process.env.BACKEND_API_URL}/api/portfolio/connection-status`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY!,
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend error getting connection status:', errorData);
      
      // Return default values if backend fails
      return NextResponse.json({
        portfolio_mode: 'aggregation',  // Default to aggregation mode
        plaid_accounts: [],
        alpaca_account: null,
        total_connected_accounts: 0
      });
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in connection status route:', error);
    
    // Return safe defaults on error
    return NextResponse.json({
      portfolio_mode: 'aggregation',
      plaid_accounts: [],
      alpaca_account: null,
      total_connected_accounts: 0
    });
  }
}
