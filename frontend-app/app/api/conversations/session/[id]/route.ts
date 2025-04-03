import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Force Node.js runtime for this route
//export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  //const sessionId = params.id; // Access id directly from destructured params
  // Instead of directly accessing params.id, await params first:
  const { id } = await params;
  const sessionId = id;

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
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
    
    // Call the backend endpoint to get thread messages
    const response = await fetch(`${backendUrl}/get-thread-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        thread_id: sessionId, // Pass the correct thread ID
        user_id: user.id, // Pass user ID for potential validation backend-side
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Error loading session ${sessionId} from backend:`, errorData);
      return NextResponse.json(
        { error: errorData.message || 'Failed to get thread messages' },
        { status: response.status }
      );
    }
    
    // Parse and return the messages from the backend response
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error(`Error getting session messages for ${sessionId}:`, error);
    return NextResponse.json(
      { error: 'Failed to get session messages' },
      { status: 500 }
    );
  }
} 