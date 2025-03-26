import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    // Verify user authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse the request body
    const requestData = await request.json();
    const { public_token, metadata, accountId } = requestData;
    
    if (!public_token || !accountId) {
      return NextResponse.json(
        { error: 'Public token and account ID are required' },
        { status: 400 }
      );
    }
    
    console.log('Received Plaid callback with public token and account ID:', accountId);
    
    // Call the backend to handle the Plaid callback
    const backendUrl = `${process.env.BACKEND_API_URL}/handle-plaid-callback`;
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BACKEND_API_KEY || ''
      },
      body: JSON.stringify({
        public_token: public_token,
        account_id: accountId,
        metadata: metadata || {}
      })
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('Error handling Plaid callback:', errorText);
      return NextResponse.json(
        { error: 'Failed to process Plaid callback' },
        { status: backendResponse.status }
      );
    }
    
    const data = await backendResponse.json();
    console.log('Successfully handled Plaid callback:', data);
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in plaid-callback API route:', error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 