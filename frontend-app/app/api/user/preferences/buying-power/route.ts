import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    
    // PRODUCTION-GRADE: Proxy to backend with full authentication
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    // Get session for JWT token
    const session = await supabase.auth.getSession();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    // CRITICAL: Add JWT token for user authentication
    if (session.data.session?.access_token) {
      headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
    }
    
    // Add API key for service authentication
    if (backendApiKey) {
      headers['X-API-Key'] = backendApiKey;
    }
    
    const response = await fetch(`${backendUrl}/api/user/preferences/buying-power`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Backend preferences update error:', response.status, errorData);
      
      return NextResponse.json({ 
        error: 'Failed to update preferences',
        details: errorData 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Preferences update API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

