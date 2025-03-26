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
    const { publicToken, accountId } = requestData;
    
    if (!publicToken || !accountId) {
      return NextResponse.json(
        { error: 'Public token and account ID are required' },
        { status: 400 }
      );
    }
    
    console.log('Processing Plaid token for account:', accountId);
    
    // Call the backend to process the Plaid token
    const backendUrl = `${process.env.BACKEND_API_URL}/process-plaid-token`;
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BACKEND_API_KEY || ''
      },
      body: JSON.stringify({
        public_token: publicToken,
        account_id: accountId
      })
    });
    
    // Handle different status codes
    if (!backendResponse.ok) {
      let errorDetail = 'Failed to process Plaid token';
      
      try {
        const errorData = await backendResponse.json();
        errorDetail = errorData.detail || errorData.error || errorDetail;
      } catch (parseError) {
        // If we can't parse JSON, try to get text
        try {
          const errorText = await backendResponse.text();
          errorDetail = errorText || errorDetail;
        } catch (textError) {
          console.error('Error getting error text:', textError);
        }
      }
      
      console.error('Error processing Plaid token:', errorDetail);
      console.error('Status code:', backendResponse.status);
      
      return NextResponse.json(
        { error: errorDetail },
        { status: backendResponse.status }
      );
    }
    
    // Process successful response
    const data = await backendResponse.json();
    console.log('Successfully processed Plaid token:', data);
    
    // Record the successful connection in Supabase for analytics
    try {
      await supabase.from('bank_connections').insert({
        user_id: user.id,
        alpaca_account_id: accountId,
        status: 'connected',
        created_at: new Date().toISOString()
      });
    } catch (dbError) {
      // Don't fail the request if we can't record the event
      console.error('Error recording bank connection in database:', dbError);
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in process-plaid-token API route:', error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 