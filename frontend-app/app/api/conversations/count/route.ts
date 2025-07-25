import { NextRequest, NextResponse } from 'next/server';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

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
    // Use centralized authentication service
    const authResult = await ConversationAuthService.authenticateUser(request);
    if (!authResult.success) {
      return authResult.error!;
    }

    const { user } = authResult;
    
    // Get backend URL from environment variable
    const backendUrl = process.env.BACKEND_API_URL;
    
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