# Clera Chat Integration Documentation

## Overview

This document outlines the implementation of the chat interface integrated with Clera's AI agents, allowing users to interact with their financial advisor directly from the dashboard.

## Implementation Details

### Backend Modifications

1. **Dynamic Account ID Support**:
   - Updated `portfolio_management_agent.py` and `trade_execution_agent.py` to accept dynamic account IDs
   - Modified `get_account_id()` function to use the account_id from conversation state
   - Added state parameter to agent tools to pass account context

2. **LangGraph State Update**:
   - Updated the `State` TypedDict in `graph.py` to include an `account_id` field
   - Added `user_id` field to enable lookup from Supabase
   - This allows the conversation to maintain context about which user account is active

3. **New API Endpoint**:
   - Added `/api/chat-with-account` endpoint to `api_server.py`
   - This endpoint accepts chat messages along with the user's Alpaca account ID and Supabase user ID
   - Maintains both IDs in the conversation state for specialized agents

4. **Supabase Integration**:
   - Created a Supabase client utility in `utils/supabase/db_client.py`
   - Added functions to retrieve Alpaca account IDs from the user_onboarding table
   - Implemented fallback mechanisms if Supabase lookup fails
   - SQL function for looking up user IDs by email

5. **Conversation Storage System**:
   - Created `conversations` table in Supabase to store chat history
   - Added backend endpoints for saving and retrieving conversations
   - Implemented Row-Level Security to ensure user data privacy
   - Functions to convert between database records and chat messages

### Frontend Implementation

1. **API Client**:
   - Created `chat-client.ts` with functions for:
     - Sending chat requests with account ID and user ID
     - Saving/loading chat history from localStorage
     - Handling API responses
     - Saving and retrieving conversations from the database

2. **API Route**:
   - Created `/api/chat` route to proxy requests to the backend
   - Gets the authenticated user from Supabase and adds the user ID to the request
   - Forwards requests to the appropriate backend endpoint
   - Added routes for conversation storage and retrieval

3. **User ID Management**:
   - Dashboard page stores the user ID in localStorage
   - Chat component retrieves the user ID and sends it with each request
   - Used for direct database lookups in the backend

4. **Chat UI Components**:
   - `Chat.tsx`: Main chat interface with message history and input
   - `ChatMessage.tsx`: Individual message component with Markdown support
   - `ChatButton.tsx`: Floating button to activate the chat interface
   - `UserAvatar.tsx` & `CleraAvatar.tsx`: Avatar components for user and Clera
   - `ChatSkeleton.tsx`: Loading state with animated typing indicators
   - Added refresh button to reload conversation history from database

5. **Integration with Dashboard**:
   - Added `ChatButton` to `UserDashboard.tsx`
   - Passes the user's Alpaca account ID from localStorage

## User Experience

The chat interface provides a premium, human-like experience:

1. **Seamless Access**:
   - A floating "Chat with Clera" button at the bottom right of the dashboard
   - Opens a modern chat interface similar to professional messaging apps

2. **Human-like Interaction**:
   - Typing indicators that create a sense of real-time communication
   - Natural conversation flow with rich text formatting
   - Visual distinction between user and Clera messages

3. **Financial Context**:
   - Chat connected directly to the user's portfolio data via Supabase integration
   - Agents can provide personalized financial advice based on the user's actual investments
   - Ability to execute trades and analyze portfolio performance

4. **Persistent Conversations**:
   - Chat history stored in Supabase database
   - History available across devices and sessions
   - Ability to refresh conversation history
   - localStorage as backup for offline access or in case of database issues

## Technical Architecture

The implementation follows a layered approach:

1. **User Interface Layer**:
   - React components for chat UI
   - State management for messages and loading states
   - Responsive design for all device sizes

2. **API Layer**:
   - Next.js API routes to proxy requests
   - Authentication with Supabase
   - Error handling and response formatting

3. **Backend Integration**:
   - LangGraph agents with dynamic account IDs
   - State preservation between messages
   - Supabase integration for reliable user data access
   - Proper error handling and fallbacks

4. **Data Persistence**:
   - Primary storage: Supabase `conversations` table with RLS policies
   - Secondary storage: localStorage for offline access and as backup
   - Automatic conversion between storage formats
   - Fallback mechanisms if primary storage is unavailable

## How to Use

1. Navigate to the dashboard (`/dashboard`)
2. Click the "Chat with Clera" button at the bottom right
3. Type your question about your portfolio in the input field
4. Receive personalized responses from Clera based on your actual financial data
5. Chat history is automatically saved to both the database and localStorage
6. Click the refresh button to reload conversation history from the database

## Example Use Cases

1. **Portfolio Analysis**:
   - "How is my portfolio performing?"
   - "What's my current asset allocation?"
   - "Which of my investments has the highest return?"

2. **Market Insights**:
   - "What's happening with tech stocks today?"
   - "How are my holdings affected by recent market news?"
   - "What's the outlook for my investments?"

3. **Trade Execution**:
   - "Buy $500 of AAPL"
   - "Sell $1000 of my Tesla stock"
   - "What's the best way to rebalance my portfolio?"

## Required Setup

1. **Supabase Configuration**:
   - Environment variables:
     - `SUPABASE_URL`: URL of your Supabase instance
     - `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin access

2. **Database Setup**:
   - Create the `conversations` table:
     ```sql
     create table if not exists public.conversations (
       id uuid default uuid_generate_v4() primary key,
       user_id uuid references auth.users not null,
       portfolio_id text not null,
       message text not null,
       response text not null,
       created_at timestamp with time zone default timezone('utc'::text, now()) not null
     );

     -- Set up RLS policies
     alter table conversations enable row level security;

     create policy "Users can view own conversations"
       on conversations for select
       using ( auth.uid() = user_id );

     create policy "Users can insert own conversations"
       on conversations for insert
       with check ( auth.uid() = user_id );
       
     -- Grant access to authenticated users
     grant select, insert on public.conversations to authenticated;
     ```

   - SQL function for user lookup:
     ```sql
     CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_input TEXT)
     RETURNS TABLE (id UUID) 
     SECURITY INVOKER
     AS $$
     BEGIN
       RETURN QUERY 
       SELECT auth.users.id 
       FROM auth.users 
       WHERE auth.users.email = email_input;
     END;
     $$ LANGUAGE plpgsql;
     ```

## Troubleshooting

1. **Account ID Not Found**:
   - **Symptom**: Agent uses fallback account ID instead of the user's actual ID
   - **Causes**:
     - User ID not stored in localStorage
     - User ID not passed to backend
     - Supabase connection issues
     - Missing user_onboarding record
   - **Solution**:
     - Check browser console for localStorage errors
     - Verify the SQL function exists in Supabase
     - Check backend logs for Supabase connection errors
     - Ensure the user has completed onboarding and has an Alpaca account ID in the user_onboarding table

2. **API Connection Errors**:
   - **Symptom**: "Failed to connect to backend" error in chat
   - **Causes**:
     - Backend server not running
     - CORS issues
     - Invalid API key
   - **Solution**:
     - Ensure the backend server is running (`langgraph dev`)
     - Check that CORS is properly configured in api_server.py
     - Verify the API key is correctly set in both .env files

3. **Chat Not Loading**:
   - **Symptom**: Chat interface fails to appear or load
   - **Causes**:
     - Missing React components
     - JS errors in the console
   - **Solution**:
     - Check browser console for JS errors
     - Verify all required npm packages are installed
     - Make sure all chat components are properly imported

4. **Conversation History Not Saving**:
   - **Symptom**: Conversations not appearing in history when reloading
   - **Causes**:
     - Database connection issues
     - Missing Supabase tables
     - Permission issues
   - **Solution**:
     - Check backend logs for database connection errors
     - Verify the `conversations` table exists
     - Check RLS policies are properly configured
     - Verify API routes for saving conversations

## Chat Session Deletion

- **Original Implementation**: Chat deletion was handled by a frontend API route (`/api/conversations/delete-session`) proxying to a backend endpoint (`/delete-chat-session`). The backend verified ownership using Supabase and then attempted deletion.
- **Current Implementation (as of YYYY-MM-DD)**: Deletion is now handled **directly on the frontend** using the LangGraph JS/TS SDK. The `deleteChatSession` function in `frontend-app/utils/api/chat-client.ts` instantiates the LangGraph `Client` and calls `client.threads.delete(threadId)`. This removes the need for the backend endpoint and the frontend API proxy route for deletion.
- **Benefit**: Faster deletion feedback for the user and reduced backend complexity.

## Direct LangGraph SDK Integration

The chat functionality has been updated to work directly with the LangGraph JS/TS SDK for most operations, reducing reliance on backend API proxies.

### Implementation Details

All primary thread operations now use the LangGraph SDK directly:

1. **Thread Operations Moved to Frontend**:
   - **Thread Creation**: `createChatSession` uses `client.threads.create()`
   - **Thread Listing**: `getChatSessions` uses `client.threads.search()`
   - **Thread Deletion**: `deleteChatSession` uses `client.threads.delete()`
   - **Title Updates**: `updateChatThreadTitle` uses `client.threads.patchState()`
   - **Message Retrieval**: `getThreadMessages` uses `client.threads.getState()`

2. **Benefits**:
   - **Performance**: Direct communication with LangGraph eliminates API proxy overhead
   - **Reduced Backend Complexity**: Fewer backend endpoints to maintain
   - **Improved Error Handling**: More direct error reporting from the source
   - **Simplified Architecture**: Client connects directly to its data source

3. **Configuration**:
   - Environment variables in `.env.local`:
     - `NEXT_PUBLIC_LANGGRAPH_API_URL`: URL of LangGraph deployment
     - `NEXT_PUBLIC_LANGGRAPH_API_KEY`: API key for authentication

4. **Helper Functions**:
   - `convertLangGraphMessages`: Converts LangGraph message format to frontend format
   - `getLangGraphClient`: Creates a configured LangGraph client instance

### Obsolete Backend APIs

The following backend routes are now obsolete and can be removed:
- `/create-new-thread` (replaced by `client.threads.create`)
- `/list-user-threads` (replaced by `client.threads.search`)
- `/delete-chat-session` (replaced by `client.threads.delete`)
- `/update-thread-metadata` (replaced by `client.threads.patchState`)
- `/get-thread-messages` (replaced by `client.threads.getState`)

### Implementation Pattern

```typescript
// Example of direct SDK pattern
export async function someOperation(threadId: string): Promise<Result> {
  try {
    const client = getLangGraphClient();
    // Directly call LangGraph SDK methods
    const result = await client.threads.someMethod(threadId, options);
    // Process result as needed
    return formattedResult;
  } catch (error) {
    console.error('Error in operation:', error);
    return fallbackValue;
  }
}
```

### Remaining Backend Integration

Some operations still require backend API routes:
- **Conversation Storage**: Saving conversations to Supabase for long-term persistence
- **Database-Specific Queries**: Operations that need access to other database tables
- **Complex Backend Logic**: Operations requiring server-side processing

## Future Enhancements

1. **Voice Interaction**:
   - Integration with voice recognition and synthesis
   - Support for voice commands and responses

2. **Enhanced Visualization**:
   - Charts and graphs within chat messages
   - Interactive portfolio visualizations

3. **Advanced Personalization**:
   - Learning from user interaction patterns
   - Tailored suggestions based on user preferences

4. **Advanced Conversation Management**:
   - Grouping conversations by topic or date
   - Ability to name and save important conversations
   - Conversation summarization for quick reference

## LangGraph Interrupt Handling

The chat integration implements a mechanism to handle LangGraph interrupts, specifically for trade confirmations:

1. **Backend Implementation**:
   - Trade execution agent uses `interrupt()` from LangGraph to pause execution and request confirmation
   - When a trade command is detected, the agent sends a confirmation request to the user
   - API server catches the `GraphInterrupt` exception and returns a special response
   - `/api/resume-chat` endpoint handles receiving user confirmations and resuming execution

2. **Frontend API Routes**:
   - `/api/chat` - Main chat endpoint that can receive and detect interrupts
   - `/api/resume-chat` - Dedicated endpoint for sending user confirmations back to resume the workflow

3. **Type Definitions**:
   - `ChatApiResponse` - Union type of `ChatResponse | InterruptResponse`
   - `ChatResponse` - Normal chat responses with type: 'response'
   - `InterruptResponse` - Interrupt responses with type: 'interrupt', message, and session_id

4. **Chat Component Logic**:
   - Detects interrupt responses using `response.type === 'interrupt'`
   - Displays confirmation UI with Yes/No buttons
   - Stores session ID for resuming the conversation
   - Calls `resumeChatRequest()` with confirmation when user clicks a button

5. **User Experience**:
   - When user attempts to execute a trade, they see a confirmation prompt
   - Trade only executes after explicit confirmation
   - Conversation flow is preserved throughout the interruption
   - Provides clear feedback about the trade details before execution

## Example Interrupt Flow

1. User types "Buy $100 of AAPL"
2. Backend trade_execution_agent creates an interrupt with confirmation message
3. Frontend receives response with `type: 'interrupt'`
4. Chat component displays confirmation UI
5. User clicks "Yes" or "No"
6. Frontend sends confirmation to `/api/resume-chat`
7. Backend resumes execution from the interrupt point
8. Trade executes (if confirmed) or cancels (if rejected)
9. Final response returns to frontend and displays to user

## Technical Implementation

The interrupt mechanism is implemented using LangGraph's built-in interrupt capability:

```python
# In trade_execution_agent.py
og_user_confirmation = interrupt(
    f"TRADE CONFIRMATION REQUIRED: Buy ${notional_amount} worth of {ticker}.\n\n"
    f"Please confirm with 'yes' to execute or 'no' to cancel this trade."
)
```

The frontend handles this through a dedicated workflow:

```typescript
// In Chat.tsx
if (response.type === 'interrupt') {
  setInterruptMessage(response.message);
  setInterruptSessionId(response.session_id);
  setIsInterrupting(true);
  // Later, when user confirms:
  const finalResponse = await resumeChatRequest(interruptSessionId, confirmation);
}
```

This mechanism enhances safety by requiring explicit user confirmation before executing trades, while maintaining a smooth conversational experience.
