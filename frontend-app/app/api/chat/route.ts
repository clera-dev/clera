import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  // Create a Supabase client - must await this as it returns a Promise
  const supabase = await createClient();
  
  try {
    // Check auth status
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request body
    const requestData = await request.json();
    
    // ALWAYS add user_id to the request - this is required, not optional
    requestData.user_id = user.id;
    
    // Ensure account_id is present - either from request or from user data
    if (!requestData.account_id) {
      try {
        // If not provided directly, try to get it from Supabase
        const { data, error } = await supabase
          .from('user_onboarding')
          .select('alpaca_account_id')
          .eq('user_id', user.id)
          .single();
          
        if (error || !data || !data.alpaca_account_id) {
          return NextResponse.json(
            { error: 'No Alpaca account found for this user. Please complete onboarding first.' },
            { status: 400 }
          );
        }
        
        requestData.account_id = data.alpaca_account_id;
      } catch (error) {
        console.error('Error fetching Alpaca account ID:', error);
        return NextResponse.json(
          { error: 'Failed to retrieve account information. Please try again.' },
          { status: 500 }
        );
      }
    }
    
    // Log the critical context being sent to the backend
    console.log(`Sending request with user_id: ${requestData.user_id} and account_id: ${requestData.account_id}`);
    
    // Get backend URL from environment variable
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    // Always use the chat-with-account endpoint 
    const endpoint = `${backendUrl}/api/chat-with-account`;
    
    // Forward the request to the backend
    const backendResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify(requestData),
    });
    
    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      console.error('Error from backend:', errorData);
      return NextResponse.json(
        { error: errorData.detail || 'Backend request failed' },
        { status: backendResponse.status }
      );
    }
    
    // Return the response from the backend
    const responseData = await backendResponse.json();
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('Error processing chat request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 