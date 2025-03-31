import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  // Get the session ID from the context params
  const sessionId = context.params.id;
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  // Create Supabase client
  const supabase = await createClient();
  
  try {
    // Check user authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get backend URL from environment variable
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    
    // Call backend to get conversations for this session
    const response = await fetch(`${backendUrl}/get-session-conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        user_id: user.id,
        session_id: sessionId,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.detail || 'Failed to get session conversations' },
        { status: response.status }
      );
    }
    
    // Return the messages
    const responseData = await response.json();
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('Error getting session conversations:', error);
    return NextResponse.json(
      { error: 'Failed to get session conversations' },
      { status: 500 }
    );
  }
} 