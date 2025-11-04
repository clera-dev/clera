import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get priority from request body
    const body = await request.json().catch(() => ({}));
    const priority = body.priority || 'normal';

    // Proxy to backend with authentication
    const backendUrl = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'http://localhost:8000';
    const backendApiKey = process.env.BACKEND_API_KEY;
    // CRITICAL FIX: Properly encode URL parameters to prevent injection and handle special characters
    const url = `${backendUrl}/api/portfolio/reconstruction/request?user_id=${encodeURIComponent(user.id)}&priority=${encodeURIComponent(priority)}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    // Add API key for backend authentication
    if (backendApiKey) {
      headers['X-API-Key'] = backendApiKey;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Backend reconstruction request error:', response.status, errorData);
      
      return NextResponse.json({ 
        error: 'Failed to request reconstruction',
        details: errorData 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Reconstruction request API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
