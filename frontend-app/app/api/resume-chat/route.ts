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
    
    // Get backend URL from environment variable
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    // Forward the request to the backend
    const backendResponse = await fetch(`${backendUrl}/api/resume-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        session_id: requestData.session_id,
        user_confirmation: requestData.user_confirmation
      }),
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
    console.error('Error processing resume chat request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 