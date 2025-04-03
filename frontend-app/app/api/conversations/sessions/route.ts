// ******************************************************************
// OBSOLETE: This API route is no longer used.
// The get sessions operation is now handled directly using LangGraph SDK 
// in the frontend via client.threads.search() - see chat-client.ts
// This file can be safely removed.
// ******************************************************************

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  // Create a Supabase client
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
    const { portfolio_id } = requestData;
    
    if (!portfolio_id) {
      return NextResponse.json(
        { error: 'Portfolio ID is required' },
        { status: 400 }
      );
    }
    
    // Get backend URL from environment variable
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    
    // Call backend to list threads for this user
    const response = await fetch(`${backendUrl}/list-user-threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        user_id: user.id,
        account_id: portfolio_id,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.message || 'Failed to get chat sessions' },
        { status: response.status }
      );
    }
    
    // Return sessions from backend
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return NextResponse.json(
      { error: 'Failed to get chat sessions' },
      { status: 500 }
    );
  }
} 