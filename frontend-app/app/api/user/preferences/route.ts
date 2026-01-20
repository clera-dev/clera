import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // PRODUCTION-GRADE: Proxy to backend with full authentication
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    if (!backendUrl || !backendApiKey) {
      console.error('Backend API configuration missing for user preferences.');
      return NextResponse.json(
        { error: 'Backend service is not configured' },
        { status: 500 }
      );
    }
    
    // Get session for JWT token
    const session = await supabase.auth.getSession();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-API-Key': backendApiKey,
    };
    
    // CRITICAL: Add JWT token for user authentication
    if (session.data.session?.access_token) {
      headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
    }
    
    const response = await fetch(`${backendUrl}/api/user/preferences`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Backend preferences error:', response.status, errorData);
      
      return NextResponse.json({ 
        error: 'Failed to get preferences',
        details: errorData 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Preferences API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

