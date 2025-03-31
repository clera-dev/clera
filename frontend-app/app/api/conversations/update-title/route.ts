import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
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
    
    // Parse request body
    const requestData = await request.json();
    const { session_id, title } = requestData;
    
    if (!session_id || !title) {
      return NextResponse.json(
        { error: 'Session ID and title are required' },
        { status: 400 }
      );
    }
    
    // Get backend URL from environment variable
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    
    // Send request to backend to update the session title
    const response = await fetch(`${backendUrl}/update-chat-session-title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        session_id,
        title,
        user_id: user.id,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.detail || 'Failed to update chat session title' },
        { status: response.status }
      );
    }
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Chat session title updated successfully',
    });
    
  } catch (error) {
    console.error('Error updating chat session title:', error);
    return NextResponse.json(
      { error: 'Failed to update chat session title' },
      { status: 500 }
    );
  }
} 