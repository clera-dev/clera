import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('sessionId');
  
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID is required' },
      { status: 400 }
    );
  }
  
  try {
    // Create Supabase client
    const supabase = await createClient();
    
    // Check auth status
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get backend URL from environment variable
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    
    // Get the message count from the backend
    const response = await fetch(`${backendUrl}/count-session-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: user.id,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.detail || 'Failed to get message count' },
        { status: response.status }
      );
    }
    
    // Return the count
    const data = await response.json();
    return NextResponse.json({
      count: data.count || 0
    });
    
  } catch (error) {
    console.error('Error counting session messages:', error);
    return NextResponse.json(
      { error: 'Failed to get message count', count: 0 },
      { status: 500 }
    );
  }
} 