# Clera Chat Integration Documentation (LangGraph SDK Version)

## Overview

This document outlines the implementation of the chat interface integrated with Clera's AI agents, now primarily leveraging the LangGraph JS/TS SDK directly from the frontend. This allows users to interact with their financial advisor directly from the dashboard, streamlining communication and reducing backend complexity.

## Implementation Details

### Core Architecture: Frontend SDK Integration

The primary change involves the frontend application interacting directly with the LangGraph API via the official JS/TS SDK. This replaces the previous model which relied on backend API proxies.

1.  **LangGraph Client**:
    *   A configured LangGraph `Client` instance is created in the frontend (e.g., in `frontend-app/utils/api/chat-client.ts` via `getLangGraphClient`).
    *   This client handles authentication using environment variables (`NEXT_PUBLIC_LANGGRAPH_API_URL`, `NEXT_PUBLIC_LANGGRAPH_API_KEY`).

2.  **Thread Management (Frontend SDK)**:
    *   **Creation**: New chat sessions (threads) are created using `client.threads.create()`.
    *   **Listing**: User's existing threads are fetched using `client.threads.search()`.
    *   **Deletion**: Threads are deleted using `client.threads.delete(threadId)`.
    *   **Metadata/State Updates**: Thread titles or other metadata can be updated using `client.threads.patchState()`.

3.  **Message Handling (Frontend SDK)**:
    *   **Sending Messages**: User messages are submitted to a thread, likely using methods like `client.runs.stream()` or `client.runs.submit()`. The specific method determines how responses are received (streaming vs. complete).
    *   **Receiving Messages**: Agent responses are streamed or received via the SDK methods. Helper functions (e.g., `convertLangGraphMessages`) adapt the LangGraph message format for frontend display.
    *   **Retrieving History**: Full message history for a thread is loaded using `client.threads.getState()`.

### Agent Context Handling (`alpaca_account_id`, `user_id`)

A key challenge with the direct SDK approach is providing user-specific context (like Alpaca account ID and Supabase user ID) to the LangGraph agents (`portfolio_management_agent.py`, `trade_execution_agent.py`). The current implementation uses the following approach:

**Current Implementation: Context via LangGraph Run Configuration**

1. **Initial Context Passing (Frontend → Backend)**:
   * During the initial `thread.submit` call from `Chat.tsx`, the user context is included in the `config.configurable` object:
   ```typescript
   // Example from Chat.tsx
   thread.submit(userMessage, {
     config: {
       configurable: {
         account_id: accountId,
         user_id: userId
       }
     }
   });
   ```
   * LangGraph Cloud automatically incorporates these user-provided values in the run configuration.

2. **Context Access in Agent Tools**:
   * Agent tools use `langgraph.config.get_config()` to access the run configuration directly:
   ```python
   from langgraph.config import get_config
   
   def get_account_id(config=None):
     # Try to get config if not provided
     if config is None:
       config = get_config()
     
     # Extract the account_id from config.configurable
     if config and isinstance(config.get('configurable'), dict):
       account_id = config['configurable'].get('account_id')
       if account_id:
         return account_id
     
     # Fallback strategies if needed...
   ```
   * This approach is more reliable than attempting to extract values from graph state or metadata.

3. **LangGraph Run Configuration Structure**:
   The configuration object accessible via `get_config()` has this general structure:
   ```python
   {
     'tags': [], 
     'metadata': {  
       # Session/thread metadata
       'title': 'chat thread title',
       'user_id': 'a37c45d5-e372-44d7-9909-b027bd23efa2',
       'account_id': '9506fa62-68e0-4018-8e44-8c37fae8fa91',
       'thread_id': '9aac52c4-9dc6-40be-a007-76803904614e',
       'created_at': '2025-04-05T00:25:40.354Z', 
       
       # LangGraph metadata
       'graph_id': 'agent',
       'assistant_id': 'fe096781-5601-53d2-b2f6-0d3403f7e9ca',
       'run_attempt': 1, 
       'langgraph_version': '0.3.25',
       'langgraph_plan': 'enterprise',
       'langgraph_host': 'saas',
       'langgraph_step': 2,
       'langgraph_node': 'tools',
       
       # HTTP request metadata
       'x-real-ip': '10.0.0.45',
       'user-agent': '...',
       'x-request-id': '...',
       # ... other HTTP headers
     },
     'recursion_limit': 25,
     'configurable': {
       # User-provided context (most important for custom tools)
       'account_id': '9506fa62-68e0-4018-8e44-8c37fae8fa91',
       'user_id': 'a37c45d5-e372-44d7-9909-b027bd23efa2',
       
       # LangGraph runtime values
       'run_id': '1f011b49-5dd6-6dc4-90c2-96cada96905f',
       'thread_id': '9aac52c4-9dc6-40be-a007-76803904614e',
       'graph_id': 'agent',
       # ... other LangGraph runtime values
     }
   }
   ```
   * **Note**: Values may appear in both `metadata` and `configurable`. When setting custom values, always use `configurable`.
   * The most reliable path for custom values is `config['configurable']['account_id']`.

### Interrupt Handling with LangGraph SDK

A critical feature for interactive agents is handling user confirmations for actions like trades. The LangGraph interrupt mechanism enables this:

1. **Backend Interrupt Implementation**:
   * Tools use the `interrupt()` function to pause execution and request user input:
   ```python
   from langgraph.types import interrupt
   
   @tool("execute_buy_market_order")
   def execute_buy_market_order(ticker, notional_amount, ...):
     # Validation and preparation...
     
     # Request user confirmation - this will pause execution
     confirmation_prompt = f"TRADE CONFIRMATION REQUIRED: Buy ${amount} worth of {ticker}..."
     user_confirmation = interrupt(confirmation_prompt)
     
     # Execution continues here after user responds
     if "yes" in user_confirmation.lower():
       # Execute the trade
     else:
       # Cancel the trade
   ```
   * **IMPORTANT**: The tool must let the `GraphInterrupt` exception propagate naturally. Catching it with `try/except` will prevent the frontend from detecting the interrupt.

2. **Frontend Interrupt Handling**:
   * The `useStream` hook automatically detects interrupts:
   ```typescript
   const thread = useStream<GraphStateType, { InterruptType: string }>({
     apiUrl, 
     apiKey, 
     assistantId, 
     threadId: currentThreadId,
     // other options...
   });
   
   // Derived state for interrupts
   const interrupt = thread.interrupt;
   const isInterrupting = interrupt !== undefined;
   const interruptMessage = isInterrupting ? String(interrupt.value) : null;
   ```
   * UI components conditionally render confirmation controls when `isInterrupting` is true.
   * User confirmation is sent back via the resume command:
   ```typescript
   // On user confirmation button press:
   thread.submit(undefined, { 
     command: { resume: "yes" }, // or "no" to reject
     config: { /* Same config as initial call */ }
   });
   ```

### Message Filtering in the Frontend

The frontend implementation uses a simplified approach to message filtering:

1. **Message Conversion**:
   * The `convertMessageFormat` function in `Chat.tsx` filters and converts LangGraph messages to UI-ready messages.
   * Human messages are passed through directly.
   * AI messages are included if:
     * They don't contain tool calls (which are intermediate steps)
     * They have meaningful content
   * The filtering relies mainly on the supervisor pattern in the backend, where the main `Clera` agent synthesizes information from sub-agents before responding to the user.

2. **Message Display**:
   * Only converted messages are displayed in the UI:
   ```typescript
   const messagesToDisplay = (thread.messages || [])
     .map(convertMessageFormat)
     .filter((msg): msg is Message => msg !== null);
   ```
   * This ensures users only see the final, coherent responses rather than intermediate agent communications.

### Backend Responsibilities (Reduced)

While most chat interaction logic moves to the frontend SDK, the backend still handles:

1.  **Agent Logic**: The core LangGraph agents (`portfolio_management_agent.py`, `trade_execution_agent.py`, `graph.py`) run server-side, processing messages, accessing tools (like Alpaca), and managing conversation state within LangGraph.
2.  **Long-Term Conversation Storage**: A backend API endpoint (e.g., `/api/conversations/save`) connected to Supabase is likely still used to persist conversation history for long-term retrieval, supplementing LangGraph's own state persistence. This involves:
    *   The `conversations` table in Supabase.
    *   Backend functions to save/retrieve history, respecting RLS policies.
    *   Frontend calls to this API after receiving messages.
3.  **Supabase Integration**: Backend utilities (`utils/supabase/db_client.py`) for agents to interact with Supabase (e.g., for user ID lookups or retrieving financial data).

### Frontend Implementation

1.  **API Client (`chat-client.ts`)**:
    *   Contains functions that wrap LangGraph SDK calls:
        *   `createChatSession` (`client.threads.create`)
        *   `getChatSessions` (`client.threads.search`)
        *   `deleteChatSession` (`client.threads.delete`)
        *   `updateChatThreadTitle` (`client.threads.patchState`)
        *   `getThreadMessages` (`client.threads.getState`)
        *   `streamChatResponse` or `submitChatMessage` (using `client.runs.stream`/`submit`)
    *   Handles calling the separate backend API for saving/loading conversations to/from Supabase.
    *   Manages LangGraph client instantiation (`getLangGraphClient`).
    *   Includes helpers like `convertLangGraphMessages`.

2.  **Chat UI Components**:
    *   `Chat.tsx`: Main interface, manages state, calls `chat-client.ts` functions, handles streaming responses and potential interrupts.
    *   `ChatMessage.tsx`, `ChatButton.tsx`, `UserAvatar.tsx`, `CleraAvatar.tsx`, `ChatSkeleton.tsx`: UI elements remain largely the same.
    *   Refresh button likely reloads history via `getThreadMessages` (SDK) and potentially syncs with the Supabase backup via a separate API call.

3.  **Context Propagation**:
    *   The dashboard (`UserDashboard.tsx`) still needs to make the `alpaca_account_id` available, potentially storing it in localStorage or context.
    *   The `user_id` is implicitly handled via Supabase authentication on the frontend, which informs the LangGraph SDK authentication. How agents access it depends on the chosen context handling strategy.

## User Experience

The user experience goals remain the same:

1.  **Seamless Access**: Floating chat button.
2.  **Human-like Interaction**: Typing indicators (handled client-side based on streaming state), Markdown support.
3.  **Financial Context**: Agents access portfolio data via Supabase/Alpaca, enabled by the context handling mechanism.
4.  **Persistent Conversations**:
    *   Primary persistence via LangGraph's thread state.
    *   Secondary/long-term persistence via Supabase backup (saved through a backend API).
    *   localStorage can still act as a tertiary cache/backup.

## Technical Architecture

The implementation follows a revised layered approach:

1.  **User Interface Layer**: React components, state management.
2.  **Frontend SDK Layer**: `chat-client.ts` interacting directly with the LangGraph API via the SDK. Handles thread management, message submission/streaming, and interrupt detection.
3.  **Backend API Layer (Minimal)**:
    *   Endpoints primarily for Supabase persistence (`/api/conversations/save`, `/api/conversations/load`).
4.  **LangGraph Agent Layer**: Python agents running server-side, managed by LangGraph. Handle core logic, tool use, internal state, and context retrieval.
5.  **Data Persistence**:
    *   LangGraph internal state management.
    *   Primary long-term storage: Supabase `conversations` table (via dedicated backend API).
    *   Secondary storage: localStorage.

## How to Use

The user flow remains largely unchanged:
1. Access dashboard.
2. Open chat via button.
3. Interact with Clera.
4. History is persisted (via LangGraph and Supabase backup).
5. Refresh reloads from LangGraph/Supabase.

## Example Use Cases

Remain the same (Portfolio Analysis, Market Insights, Trade Execution).

## Required Setup

1.  **LangGraph Configuration**:
    *   Frontend environment variables (`.env.local`):
        *   `NEXT_PUBLIC_LANGGRAPH_API_URL`
        *   `NEXT_PUBLIC_LANGGRAPH_API_KEY`
2.  **Supabase Configuration**:
    *   Backend environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3.  **Database Setup**:
    *   `conversations` table and RLS policies (as before).
    *   SQL function `get_user_id_by_email` (potentially used by agents or backend lookups).

## Troubleshooting

1.  **Agent Context Issues**:
    *   **Symptom**: Agent fails to access correct portfolio, uses defaults, or errors on lookups.
    *   **Causes**: 
        * Missing `account_id` or `user_id` in `config.configurable`
        * Error in `get_account_id` implementation
        * `get_config()` failing to retrieve run configuration
    *   **Solution**: Verify context is correctly passed in `thread.submit`, check agent logs for config retrieval, ensure `get_account_id` correctly processes config structure.

2.  **LangGraph Connection Errors**:
    *   **Symptom**: Errors connecting to LangGraph API in the browser console.
    *   **Causes**: Incorrect `NEXT_PUBLIC_LANGGRAPH_API_URL` or `_KEY`; Network issues; LangGraph service down.
    *   **Solution**: Verify `.env.local` variables; Check network connection; Check LangGraph service status.

3.  **Interrupt Handling Failures**:
    *   **Symptom**: Confirmation prompts don't appear; Confirmation doesn't resume the flow.
    *   **Causes**: 
        * Tool function catches `GraphInterrupt` instead of letting it propagate
        * Frontend `useStream` hook not correctly detecting the interrupt
        * Incorrect resume command format
    *   **Solution**: 
        * Ensure `interrupt()` calls aren't wrapped in `try/except` blocks that catch `GraphInterrupt`
        * Verify `thread.interrupt` state in frontend
        * Check the resume command format (`{ command: { resume: "yes" } }`)

4.  **Conversation History Discrepancies**:
    *   **Symptom**: History in chat doesn't match Supabase or is lost.
    *   **Causes**: Failure in frontend calls to the backend save API; Errors in the backend save endpoint; Issues with `client.threads.getState`.
    *   **Solution**: Check browser network tab for failed save requests; Check backend logs for Supabase saving errors; Verify `getThreadMessages` implementation.

## Future Enhancements

1. Voice Interaction
2. Enhanced Visualization
3. Advanced Personalization
4. Advanced Conversation Management
