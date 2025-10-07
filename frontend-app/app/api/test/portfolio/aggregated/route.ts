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
    
    // PRODUCTION GRADE: Extract query parameters for flexible control
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('force_refresh') === 'true';
    const maxAgeMinutes = parseInt(url.searchParams.get('max_age_minutes') || '30');
    
    console.log(`📊 Portfolio API: force_refresh=${forceRefresh}, max_age=${maxAgeMinutes}min`);
    
    // Proxy to backend following existing chat API pattern
    const backendUrl = `${process.env.BACKEND_API_URL}/api/test/portfolio/aggregated`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',  // Changed to POST to send user_id in body
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY!,
      },
      body: JSON.stringify({
        user_id: user.id,  // Send user_id in body, not JWT header
        force_refresh: forceRefresh,
        max_age_minutes: maxAgeMinutes
      })
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend error getting aggregated portfolio:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch portfolio data' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in aggregated portfolio route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
