import { NextRequest, NextResponse } from 'next/server';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

export async function POST(request: NextRequest) {
  try {
    // Use centralized authentication service
    const authResult = await ConversationAuthService.authenticateUser(request);
    if (!authResult.success) {
      return authResult.error!;
    }

    const { user } = authResult;
    
    // Parse request body
    const requestData = await request.json();
    
    // Validate required fields
    if (!requestData.portfolio_id || !requestData.message || !requestData.response) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Set user_id from authenticated user
    requestData.user_id = user.id;
    
    // Get backend URL from environment variable
    const backendUrl = process.env.BACKEND_API_URL;
    
    // Forward the request to the backend
    const backendResponse = await fetch(`${backendUrl}/save-conversation`, {
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
        { error: errorData.message || 'Backend request failed' },
        { status: backendResponse.status }
      );
    }
    
    // Return the response from the backend
    const responseData = await backendResponse.json();
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('Error saving conversation:', error);
    return NextResponse.json(
      { error: 'Failed to save conversation' },
      { status: 500 }
    );
  }
} 