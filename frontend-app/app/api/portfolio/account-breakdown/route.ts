import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Account Breakdown API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user_id from query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id') || user.id;

    console.log(`Account Breakdown API: Getting account breakdown for user: ${userId}`);

    // Proxy to backend API
    const backendUrl = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'http://localhost:8000';
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    // Add API key for backend authentication
    if (backendApiKey) {
      headers['X-API-Key'] = backendApiKey;
    }
    
    const targetUrl = `${backendUrl}/api/portfolio/account-breakdown?user_id=${encodeURIComponent(userId)}`;
    
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Backend account breakdown error:', response.status, errorData);
      return NextResponse.json(
        { error: 'Backend service error', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Account Breakdown API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
