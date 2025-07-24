import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Client } from '@langchain/langgraph-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, title } = body;

    if (!thread_id || !title) {
      return NextResponse.json(
        { error: 'Thread ID and title are required' },
        { status: 400 }
      );
    }

    // Create supabase server client
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create LangGraph client (server-side only)
    const langGraphClient = new Client({
      apiUrl: process.env.LANGGRAPH_API_URL,
      apiKey: process.env.LANGGRAPH_API_KEY,
    });

    // Authorization check: ensure the thread belongs to the authenticated user
    const thread = await langGraphClient.threads.get(thread_id);
    if (!thread || !thread.metadata || thread.metadata.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Update thread metadata with new title
    await langGraphClient.threads.update(thread_id, {
      metadata: {
        title: title
      }
    });
    // No logging of user input for security reasons
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating thread title:', error);
    
    if (error.message?.includes('Unauthorized') || error.message?.includes('Authentication')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 