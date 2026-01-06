// Chat API client for interacting with the Clera backend

// Removed LangGraph SDK imports for security - all operations now go through API routes
import { createClient } from "@/utils/supabase/client";

export type Message = {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  isStatus?: boolean; // For temporary status/progress messages
  runId?: string; // Anchor tool activities to a specific user query
  citations?: string[]; // Source URLs from web search (for citation rendering)
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
  updatedAt: string;
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

  // Sort chats by updatedAt (most recent first) BEFORE grouping
  const sortedChats = [...chats].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // Process each chat
  return sortedChats.reduce((acc, chat) => {
    const chatDate = new Date(chat.updatedAt);
    
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
  accountId: string | undefined, 
  userId?: string, 
  threadId?: string 
): EventSource {
  // Construct the payload for the backend stream endpoint
  const payload = {
      user_input: userInput,
      account_id: accountId || null, // Can be null for aggregation-only users
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
  const qp = new URLSearchParams();
  qp.set('user_input', userInput);
  if (accountId) qp.set('account_id', accountId);
  if (userId) qp.set('user_id', userId);
  if (threadId) qp.set('session_id', threadId);
  const queryParams = qp.toString();

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
 * Creates a new chat session (thread) via API route
 */
export async function createChatSession(
  accountId: string | undefined,
  userId: string,
  title: string = "New Conversation"
): Promise<{ id: string } | null> {
  if (!userId) {
    console.error('Cannot create chat session: User ID is required.');
    return null;
  }

  try {
    console.log(`Creating new chat session with title: ${title}, userId: ${userId}, accountId: ${accountId || 'none (aggregation mode)'}`);
    
    const response = await fetch('/api/conversations/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_id: accountId || null,
        user_id: userId,
        title: title,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create chat session');
    }

    const data = await response.json();
    console.log(`Created new thread with ID: ${data.id}`);
    return { id: data.id };
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
 * Gets all chat sessions (threads) for the current user via API route
 */
export async function getChatSessions(
  portfolioId: string
): Promise<ChatSession[]> {
  try {
    console.log(`Fetching chat sessions with portfolio ID: ${portfolioId}`);
    
    // Get user ID from localStorage
    const userId = localStorage.getItem('userId');
    
    if (!userId) {
      console.warn('No user ID found in localStorage for thread search');
      return [];
    }
    
    const response = await fetch('/api/conversations/get-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portfolio_id: portfolioId,
        user_id: userId,
        limit: 20
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get chat sessions');
    }

    const data = await response.json();
    const sessions: ChatSession[] = data.sessions || [];
    
    console.log(`Found ${sessions.length} chat sessions`);
    return sessions;
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return [];
  }
}

/**
 * Get thread messages via API route
 */
export async function getThreadMessages(
  threadId: string
): Promise<Message[]> {
  try {
    console.log(`Fetching messages for thread: ${threadId}`);
    
    const response = await fetch('/api/conversations/get-thread-messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread_id: threadId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get thread messages');
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error(`Error getting thread messages for ${threadId}:`, error);
    return [];
  }
}

/**
 * Updates the title of a chat thread via API route
 */
export async function updateChatThreadTitle(
  threadId: string, 
  title: string
): Promise<boolean> {
  try {
    console.log(`Updating thread ${threadId} title to: ${title}`);
    
    const response = await fetch('/api/conversations/update-thread-title', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread_id: threadId,
        title: title,
      }),
    });

    if (!response.ok) {
      return false;
    }

    console.log(`Successfully updated title for thread ${threadId}`);
    return true;
  } catch (error) {
    console.error('Error updating thread title:', error);
    return false;
  }
}

/**
 * Deletes a chat session (thread) via API route
 */
export async function deleteChatSession(
  threadId: string
): Promise<boolean> {
  try {
    console.log(`Attempting to delete thread ${threadId}`);
    
    const response = await fetch('/api/conversations/delete-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread_id: threadId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Failed to delete thread ${threadId}:`, errorData.error);
      return false;
    }

    console.log(`Successfully deleted thread ${threadId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete thread ${threadId}:`, error);
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

// --- SECURITY NOTE ---
// Direct LangGraph client usage removed for security.
// All LangGraph operations now go through Next.js API routes that proxy to the backend.
// This prevents exposing API keys and URLs to the browser.
// ----------------------------------

// --- LangGraph SDK Helper Methods ---

// Message conversion is now handled by the backend API routes

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