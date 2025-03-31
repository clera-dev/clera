// Chat API client for interacting with the Clera backend

export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatRequest = {
  messages: Message[];
  user_input: string;
};

export type ChatResponse = {
  type?: 'response';
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
 * Sends a chat request to the Clera API with the user's Alpaca account ID
 */
export async function sendChatRequest(
  messages: Message[],
  userInput: string,
  accountId: string,
  userId?: string,
  sessionId?: string
): Promise<ChatApiResponse> {
  if (!accountId) {
    throw new Error("Account ID is required for chat requests");
  }
  
  try {
    // Get userId from localStorage if not provided
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      try {
        const storedUserId = localStorage.getItem('userId');
        if (!storedUserId) {
          console.error("No user ID found in parameters or localStorage");
          throw new Error("User ID is required for chat requests");
        }
        effectiveUserId = storedUserId;
      } catch (error) {
        console.error("Error accessing localStorage for userId:", error);
        throw new Error("Failed to get user ID");
      }
    }
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        user_input: userInput,
        account_id: accountId,
        user_id: effectiveUserId,
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || errorData.error || 'Failed to send chat request');
    }

    const responseData: ChatApiResponse = await response.json();
    
    // Check if it's an interrupt response
    if (responseData.type === 'interrupt') {
      console.log('Received interrupt response:', responseData);
      return responseData;
    }

    // If it's a regular response, proceed with saving (if applicable)
    // Ensure type safety for regular response handling
    const regularResponse = responseData as ChatResponse;
    regularResponse.type = 'response';

    // Save conversation to database (but don't block waiting for it)
    if (regularResponse.response && !sessionId) {
      try {
        // For new conversations, create a new chat session with title from first message
        const firstUserMessage = userInput;
        const title = formatChatTitle(firstUserMessage);
        
        // Create a session first
        const session = await createChatSession(accountId, title);
        
        // Then save the conversation with the session ID
        if (session?.id) {
          await saveConversationToDatabase(
            accountId, 
            userInput, 
            regularResponse.response,
            session.id
          );
          
          // Update the response to include the session ID
          regularResponse.session_id = session.id;
        }
      } catch (error) {
        console.error('Error saving conversation to database:', error);
      }
    } else if (regularResponse.response && sessionId) {
      try {
        await saveConversationToDatabase(
          accountId, 
          userInput, 
          regularResponse.response,
          sessionId
        );
        
        // Check if this is the first user message in an existing session to update the title
        const isFirstMessage = await isFirstMessageInSession(sessionId);
        if (isFirstMessage) {
          const title = formatChatTitle(userInput);
          await updateChatSessionTitle(sessionId, title);
        }
      } catch (error) {
        console.error('Error saving conversation to database:', error);
      }
    }

    return regularResponse;
  } catch (error) {
    console.error('Error sending chat request:', error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('An unknown error occurred during the chat request.');
    }
  }
}

/**
 * Checks if this is the first message in a chat session
 */
async function isFirstMessageInSession(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/conversations/count?sessionId=${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.count === 0;
  } catch (error) {
    console.error('Error checking message count:', error);
    return false;
  }
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
 * Creates a new chat session
 */
export async function createChatSession(
  portfolioId: string,
  title: string
): Promise<{ id: string } | null> {
  try {
    const response = await fetch('/api/conversations/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portfolio_id: portfolioId,
        title,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create chat session');
    }

    const data = await response.json();
    return data.session || null;
  } catch (error) {
    console.error('Error creating chat session:', error);
    return null;
  }
}

/**
 * Saves a conversation to the database
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
 * Retrieves all chat sessions for the current user
 */
export async function getChatSessions(
  portfolioId: string
): Promise<ChatSession[]> {
  try {
    const response = await fetch('/api/conversations/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portfolio_id: portfolioId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get chat sessions');
    }

    const data = await response.json();
    return data.sessions || [];
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return [];
  }
}

/**
 * Deletes a chat session and all its conversations
 */
export async function deleteChatSession(
  sessionId: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/conversations/delete-session?id=${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete chat session');
    }

    return true;
  } catch (error) {
    console.error('Error deleting chat session:', error);
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

/**
 * Sends a confirmation response to resume an interrupted chat flow
 */
export async function resumeChatRequest(
  sessionId: string,
  confirmation: 'yes' | 'no'
): Promise<ChatResponse> {
  if (!sessionId) {
    throw new Error("Session ID is required to resume chat");
  }

  try {
    console.log(`Resuming chat session ${sessionId} with confirmation: ${confirmation}`);
    
    const response = await fetch('/api/resume-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_confirmation: confirmation,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error resuming chat:", errorData);
      throw new Error(errorData.detail || errorData.error || 'Failed to resume chat request');
    }

    const responseData: ChatResponse = await response.json();
    console.log("Chat resumed successfully, final response:", responseData);

    // Optionally save the final response to the database here if needed
    // Note: The backend might handle saving the final turn

    return responseData;

  } catch (error) {
    console.error('Error resuming chat request:', error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('An unknown error occurred while resuming the chat.');
    }
  }
} 