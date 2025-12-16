import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
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
    
    // Proxy to backend following existing chat API pattern
    const backendUrl = `${process.env.BACKEND_API_URL}/api/test/user/investment-accounts`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',  // Consistent POST method
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY!,
      },
      body: JSON.stringify({
        user_id: user.id  // Send user_id in body
      })
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend error getting user investment accounts:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch user accounts' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in user investment accounts route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
