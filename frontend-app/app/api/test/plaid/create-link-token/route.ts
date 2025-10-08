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

    // Parse request body (handle empty body gracefully)
    let requestData: { email?: string } = {};
    try {
      const body = await request.text();
      if (body.trim()) {
        requestData = JSON.parse(body);
      }
    } catch (e) {
      // Empty or malformed body - use empty object
      requestData = {};
    }
    
    // Proxy to backend following existing chat API pattern
    const backendUrl = `${process.env.BACKEND_API_URL}/api/test/plaid/create-link-token`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY!,
      },
      body: JSON.stringify({
        user_id: user.id,  // Send user_id in body, not JWT header
        email: requestData.email || user.email || 'test@example.com'
      })
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend error creating link token:', errorData);
      return NextResponse.json(
        { error: 'Failed to create link token' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in create-link-token route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
