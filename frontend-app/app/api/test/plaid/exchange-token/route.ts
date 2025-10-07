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

    // Parse request body
    const requestData = await request.json();
    
    const { public_token, institution_name } = requestData;
    
    if (!public_token) {
      return NextResponse.json(
        { error: 'public_token is required' },
        { status: 400 }
      );
    }
    
    // Proxy to backend following existing chat API pattern
    const backendUrl = `${process.env.BACKEND_API_URL}/api/test/plaid/exchange-token`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY!,
      },
      body: JSON.stringify({
        user_id: user.id,  // Send user_id in body, not JWT header
        public_token,
        institution_name: institution_name || 'Test Institution'
      })
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend error exchanging token:', errorData);
      return NextResponse.json(
        { error: 'Failed to exchange token' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in exchange-token route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
