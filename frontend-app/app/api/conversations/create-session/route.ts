import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account_id, title } = body;

    // Extract and validate account ID
    const accountId = ConversationAuthService.extractAccountId(body, 'account_id');
    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Use centralized authentication and authorization service
    const authResult = await ConversationAuthService.authenticateAndAuthorize(request, accountId);
    if (!authResult.success) {
      return authResult.error!;
    }

    const { user } = authResult.context!;

    // Create LangGraph client (server-side only)
    const langGraphClient = new Client({
      apiUrl: process.env.LANGGRAPH_API_URL,
      apiKey: process.env.LANGGRAPH_API_KEY,
    });

    // Create thread using LangGraph SDK
    const thread = await langGraphClient.threads.create({
      metadata: {
        user_id: user.id, // Always use the authenticated user's ID
        account_id: accountId,
        title: title || 'New Conversation',
      }
    });
    
    // Avoid logging sensitive account_id to protect user privacy
    console.log(`Created LangGraph thread: ${thread.thread_id} for account: [REDACTED]`);
    
    return NextResponse.json({ id: thread.thread_id });
  } catch (error: any) {
    console.error('Error creating chat session:', error);
    
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