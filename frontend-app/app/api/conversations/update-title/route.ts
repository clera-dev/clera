// ******************************************************************
// OBSOLETE: This API route is no longer used.
// The update title operation is now handled directly using LangGraph SDK 
// in the frontend via client.threads.patchState() - see chat-client.ts
// This file can be safely removed.
// ******************************************************************

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  try {
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { thread_id, title } = await request.json();
    if (!thread_id || !title) {
        return NextResponse.json({ error: 'Thread ID and title are required' }, { status: 400 });
    }

    // Get backend URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

    // Forward request to backend to update metadata
    const backendResponse = await fetch(`${backendUrl}/update-thread-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({ thread_id, title }),
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      console.error('Error from backend updating title:', errorData);
      return NextResponse.json(
        { error: errorData.detail || 'Backend request failed to update title' },
        { status: backendResponse.status }
      );
    }

    const responseData = await backendResponse.json();
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error processing update title request:', error);
    return NextResponse.json({ error: 'Failed to process update title request' }, { status: 500 });
  }
} 