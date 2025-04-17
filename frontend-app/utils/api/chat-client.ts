// Chat API client for interacting with the Clera backend

import { Client } from '@langchain/langgraph-sdk';
import { Message as LangGraphMessage } from '@langchain/langgraph-sdk';
import { createClient } from "@/utils/supabase/client";

export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatRequest = {
  messages: Message[];
  user_input: string;
};

export type ChatResponse = {
  type: 'response';
  session_id: string;
  response: string;
  debug_info?: any;
};

export type InterruptResponse = {
  type: 'interrupt';
  session_id: string;
  message: string;
};

export type ChatApiResponse = ChatResponse | InterruptResponse;

export type Conversation = {
  id: string;
  user_id: string;
  portfolio_id: string;
  message: string;
  response: string;
  created_at: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
};

/**
 * Formats a conversation title from the first message
 */
export function formatChatTitle(message: string): string {
  // Get the first 5-6 words
  const words = message.split(' ');
  const title = words.slice(0, 6).join(' ');
  
  // If the title is too long, truncate it and add ellipsis
  return title.length > 40 ? `${title.substring(0, 40)}...` : title;
}

/**
 * Groups chat sessions by date for display in the sidebar
 */
export function groupChatsByDate(chats: ChatSession[]): {
  today: ChatSession[];
  yesterday: ChatSession[];
  lastWeek: ChatSession[];
  lastMonth: ChatSession[];
  older: ChatSession[];
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  // Create the groups with proper typing
  const groups: {
    today: ChatSession[];
    yesterday: ChatSession[];
    lastWeek: ChatSession[];
    lastMonth: ChatSession[];
    older: ChatSession[];
  } = {
    today: [],
    yesterday: [],
    lastWeek: [],
    lastMonth: [],
    older: []
  };

  // Process each chat
  return chats.reduce((acc, chat) => {
    const chatDate = new Date(chat.createdAt);
    
    // Strip time for date comparison
    const chatDateStripped = new Date(
      chatDate.getFullYear(), 
      chatDate.getMonth(), 
      chatDate.getDate()
    );

    if (chatDateStripped.getTime() === today.getTime()) {
      acc.today.push(chat);
    } else if (chatDateStripped.getTime() === yesterday.getTime()) {
      acc.yesterday.push(chat);
    } else if (chatDateStripped > lastWeek) {
      acc.lastWeek.push(chat);
    } else if (chatDateStripped > lastMonth) {
      acc.lastMonth.push(chat);
    } else {
      acc.older.push(chat);
    }

    return acc;
  }, groups);
}

/**
 * Starts a new chat stream or continues an existing one.
 *
 * @param messages Current message history (primarily for context if needed, not sent directly)
 * @param userInput The new user input to send.
 * @param accountId User's Alpaca account ID.
 * @param userId Optional user ID.
 * @param threadId Optional existing thread ID to continue.
 * @returns An EventSource instance connected to the streaming endpoint.
 */
export function startChatStream(
  userInput: string, 
  accountId: string, 
  userId?: string, 
  threadId?: string 
): EventSource {
  if (!accountId) {
    throw new Error("Account ID is required to start chat stream");
  }
  
  // Construct the payload for the backend stream endpoint
  const payload = {
      user_input: userInput,
      account_id: accountId,
      user_id: userId, // Pass userId obtained from Supabase/localStorage
      session_id: threadId // Pass existing thread/session ID if available
  };

  console.log('Starting chat stream with payload:', payload);

  // Use POST for the stream request, sending data in the body
  // We need a way to send the payload with EventSource. Standard EventSource doesn't support POST body.
  // WORKAROUND: Use fetch to initiate the stream, then handle the response body manually.
  // OR: Use a library that wraps EventSource with POST support.
  // OR: Pass essential initial data via query params (less ideal for complex input).
  
  // Simplest approach for now: Use query params for critical IDs, fetch handles body.
  // NOTE: This might hit URL length limits if userInput is huge. Refactor might be needed.
  const queryParams = new URLSearchParams({
      user_input: userInput,
      account_id: accountId,
      // Add userId if available
      ...(userId && { user_id: userId }),
      // Add threadId if available
      ...(threadId && { session_id: threadId })
  }).toString();

  // Correct endpoint
  const url = `/api/chat/stream`; 
  
  // Since EventSource doesn't support POST body, we create it but don't send the body with it.
  // The API route /api/chat/stream will need to be adjusted to read from query OR have a way
  // to associate this EventSource connection with a POST request body (complex).
  
  // Let's stick to the original plan: EventSource connects to a GET endpoint that proxies POST.
  // The previous steps created POST proxy routes. EventSource CAN connect to them.
  
  // Revert: Use standard EventSource on the POST proxy route. The proxy handles the body.
  const eventSource = new EventSource(url, { withCredentials: true }); // Use POST proxy route

  // Log connection status
  eventSource.onopen = () => {
    console.log(`EventSource connected to ${url}`);
  };
  eventSource.onerror = (error) => {
    console.error(`EventSource error for ${url}:`, error);
    // Maybe close connection here or implement retry logic
    eventSource.close(); 
  };

  return eventSource;
}

/**
 * Resumes an interrupted chat stream with user confirmation.
 *
 * @param threadId The ID of the thread to resume.
 * @param confirmation User's confirmation ('yes' or 'no').
 * @returns An EventSource instance connected to the resume streaming endpoint.
 */
export function resumeChatStream(
  threadId: string,
  confirmation: 'yes' | 'no'
): EventSource {
  if (!threadId) {
    throw new Error("Thread ID (session_id) is required to resume chat stream");
  }

  const url = `/api/resume-chat/stream`;

  // Similar challenge: EventSource doesn't support POST body.
  // The POST proxy route needs to handle the body.
  // We need to trigger the POST from the component *before* creating the EventSource,
  // or find a way to link them. This is tricky.
  
  // --- Let's redesign Chat.tsx to handle this --- 
  // Chat.tsx will make a POST request to the proxy, and *then* EventSource will connect.
  // This client function becomes simpler: it just provides the URL.

  // --- Revised Approach --- 
  // These functions won't *create* the EventSource directly.
  // They'll provide configuration or trigger the POST proxy.
  // Let's simplify: The component will handle EventSource creation and POST calls.
  // Removing these functions for now, logic moves to Chat.tsx.

  // Placeholder - actual EventSource creation will be in Chat.tsx after a POST
  const eventSource = new EventSource(url, { withCredentials: true }); 

  eventSource.onopen = () => {
    console.log(`EventSource connected to ${url} for resume`);
  };
  eventSource.onerror = (error) => {
    console.error(`EventSource error for ${url} (resume):`, error);
    eventSource.close();
  };
  
  return eventSource; // This is conceptually wrong, fix in Chat.tsx
}

/**
 * Updates the title of a chat session
 */
export async function updateChatSessionTitle(sessionId: string, title: string): Promise<boolean> {
  try {
    const response = await fetch('/api/conversations/update-title', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        title,
      }),
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating chat session title:', error);
    return false;
  }
}

/**
 * Creates a new chat session (thread) directly using LangGraph SDK
 */
export async function createChatSession(
  portfolioId: string,
  title: string = "New Conversation"
): Promise<{ id: string } | null> {
  try {
    console.log(`Creating new chat session with title: ${title}`);
    const client = getLangGraphClient();
    
    // Get user ID from localStorage (assuming it's stored there after login)
    const userId = localStorage.getItem('userId');
    
    if (!userId) {
      console.warn('No user ID found in localStorage for thread creation');
    }
    
    // Create thread with metadata
    const thread = await client.threads.create({
      metadata: {
        user_id: userId || 'anonymous',
        account_id: portfolioId,
        title: title,
        created_at: new Date().toISOString()
      }
    });
    
    console.log(`Created new thread with ID: ${thread.thread_id}`);
    return { id: thread.thread_id };
  } catch (error) {
    console.error('Error creating chat session:', error);
    return null;
  }
}

/**
 * Saves a conversation to the database
 * Note: We still need the backend for this as we're storing in Supabase as well
 */
export async function saveConversationToDatabase(
  portfolioId: string,
  message: string,
  response: string,
  sessionId: string
): Promise<void> {
  try {
    const saveResponse = await fetch('/api/conversations/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portfolio_id: portfolioId,
        message,
        response,
        session_id: sessionId,
      }),
    });

    if (!saveResponse.ok) {
      const errorData = await saveResponse.json();
      throw new Error(errorData.error || 'Failed to save conversation');
    }
    
    console.log('Conversation saved to database successfully');
  } catch (error) {
    console.error('Error saving conversation to database:', error);
    throw error;
  }
}

/**
 * Retrieves conversation history from the database
 */
export async function getConversationHistory(
  portfolioId: string,
  limit: number = 50
): Promise<Conversation[]> {
  try {
    const response = await fetch('/api/conversations/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portfolio_id: portfolioId,
        limit,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get conversation history');
    }

    const data = await response.json();
    return data.conversations || [];
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

/**
 * Gets all chat sessions (threads) for the current user directly using LangGraph SDK
 */
export async function getChatSessions(
  portfolioId: string
): Promise<ChatSession[]> {
  try {
    console.log(`Fetching chat sessions with portfolio ID: ${portfolioId}`);
    const client = getLangGraphClient();
    
    // Get user ID from localStorage
    const userId = localStorage.getItem('userId');
    
    if (!userId) {
      console.warn('No user ID found in localStorage for thread search');
      return [];
    }
    
    // Use threads.search to get all threads with matching metadata
    const threads = await client.threads.search({
      metadata: {
        user_id: userId
      }
    });
    
    // Format threads as ChatSessions
    const sessions: ChatSession[] = threads.map(thread => {
      const metadata = thread.metadata || {};
      return {
        id: thread.thread_id,
        title: (metadata.title as string) || "New Conversation",
        createdAt: thread.created_at || new Date().toISOString(),
        messages: []
      };
    });
    
    console.log(`Found ${sessions.length} chat sessions`);
    return sessions;
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return [];
  }
}

/**
 * Get thread messages directly using LangGraph SDK
 */
export async function getThreadMessages(
  threadId: string
): Promise<Message[]> {
  try {
    console.log(`Fetching messages for thread: ${threadId}`);
    const client = getLangGraphClient();
    
    // Get thread state
    const threadState = await client.threads.getState(threadId);
    
    // Extract messages from thread state with proper type handling
    let messages: LangGraphMessage[] = [];
    
    // Check if values exists and safely access the messages property
    if (threadState.values && typeof threadState.values === 'object') {
      // Access messages using type assertion since structure may vary
      const stateValues = threadState.values as Record<string, unknown>;
      if (Array.isArray(stateValues.messages)) {
        messages = stateValues.messages as LangGraphMessage[];
      }
    }
    
    // Convert messages to our format
    return convertLangGraphMessages(messages);
  } catch (error) {
    console.error(`Error getting thread messages for ${threadId}:`, error);
    return [];
  }
}

/**
 * Updates the title of a chat thread directly using LangGraph SDK
 */
export async function updateChatThreadTitle(
  threadId: string, 
  title: string
): Promise<boolean> {
  try {
    console.log(`Updating thread ${threadId} title to: ${title}`);
    const client = getLangGraphClient();
    
    // Use update() with metadata instead of patchState()
    await client.threads.update(threadId, {
      metadata: {
        title: title
      }
    });
    
    console.log(`Successfully updated title for thread ${threadId}`);
    return true;
  } catch (error) {
    console.error('Error updating thread title:', error);
    return false;
  }
}

/**
 * Deletes a chat session (thread) directly using LangGraph SDK.
 */
export async function deleteChatSession(
  threadId: string
): Promise<boolean> {
  try {
    console.log(`Attempting to delete thread ${threadId} using LangGraph SDK`);
    const client = getLangGraphClient();
    await client.threads.delete(threadId);
    console.log(`Successfully deleted thread ${threadId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete thread ${threadId}:`, error);
    // Optional: Check error type/status for more specific feedback
    // e.g., if (error.status === 404) console.error("Thread not found");
    return false;
  }
}

/**
 * Saves chat history to localStorage
 */
export function saveChatHistory(messages: Message[]): void {
  try {
    localStorage.setItem('chatHistory', JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

/**
 * Loads chat history from localStorage
 */
export function loadChatHistory(): Message[] {
  try {
    const history = localStorage.getItem('chatHistory');
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error loading chat history:', error);
    return [];
  }
}

/**
 * Clears chat history from localStorage
 */
export function clearChatHistory(): void {
  try {
    localStorage.removeItem('chatHistory');
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
}

/**
 * Converts database conversations to chat messages
 */
export function conversationsToMessages(conversations: Conversation[]): Message[] {
  const messages: Message[] = [];
  
  // Sort conversations by created_at (oldest first)
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  // Convert each conversation to a pair of messages
  sortedConversations.forEach(conversation => {
    messages.push({ role: 'user', content: conversation.message });
    messages.push({ role: 'assistant', content: conversation.response });
  });
  
  return messages;
}

// --- Get LangGraphClient Instance ---
// You need to configure this client with your LangGraph API URL and potentially API key.
// Assuming environment variables for configuration:
const getLangGraphClient = () => {
  const apiUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;
  const apiKey = process.env.NEXT_PUBLIC_LANGGRAPH_API_KEY;

  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_LANGGRAPH_API_URL is not set in environment variables.");
  }

  return new Client({
    apiUrl,
    ...(apiKey && { apiKey }),
  });
};
// ----------------------------------

// --- LangGraph SDK Helper Methods ---

/**
 * Converts LangGraph message format to our frontend Message format
 */
function convertLangGraphMessages(messages: LangGraphMessage[]): Message[] {
  const convertedMessages: Message[] = [];
  
  for (const msg of messages) {
    if (msg.type === 'human') {
      convertedMessages.push({
        role: 'user',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
    } else if (msg.type === 'ai') {
      // Skip tool calls and specific worker messages
      const hasAgentName = 'name' in msg && !!msg.name;
      const hasFunctionCalls = msg.tool_calls && msg.tool_calls.length > 0;
      
      if (hasFunctionCalls || (hasAgentName && msg.name !== 'Clera')) {
        continue;
      }
      
      convertedMessages.push({
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
    }
  }
  
  return convertedMessages;
}

/**
 * Retrieves the number of queries a user has made today (PST).
 */
export async function getUserDailyQueryCount(userId: string): Promise<number> {
  if (!userId) {
    console.error('User ID is required to fetch query count.');
    return 0; // Or throw an error
  }

  const supabase = createClient();
  try {
    const { data, error } = await supabase.rpc('get_user_query_count_today_pst', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error fetching user daily query count:', error);
      // Decide how to handle error - return 0, -1, or throw?
      // Returning 0 might falsely allow queries if the check fails.
      // Throwing might be better but needs handling upstream.
      throw error; // Let the caller handle the error state
    }

    console.log(`User ${userId} daily query count: ${data}`);
    return data ?? 0;
  } catch (error) {
    console.error('Exception fetching user daily query count:', error);
    throw error; // Re-throw for upstream handling
  }
}

/**
 * Records that a user has made a query by calling the Supabase RPC function.
 */
export async function recordUserQuery(userId: string): Promise<void> {
  if (!userId) {
    console.error('User ID is required to record a query.');
    return; // Or throw an error
  }

  const supabase = createClient();
  try {
    const { error } = await supabase.rpc('record_user_query', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error recording user query:', error);
      // Decide on error handling: maybe log and continue, or throw?
      // If recording fails, the user might get more queries than allowed.
      // Throwing might be safer.
      throw error;
    }

    console.log(`Recorded query for user ${userId}`);
  } catch (error) {
    console.error('Exception recording user query:', error);
    throw error; // Re-throw for upstream handling
  }
} 