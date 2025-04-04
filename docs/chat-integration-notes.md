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

A key challenge with the direct SDK approach is providing user-specific context (like Alpaca account ID and Supabase user ID) to the LangGraph agents (`portfolio_management_agent.py`, `trade_execution_agent.py`), as `client.runs.submit`/`stream` might not directly support passing arbitrary state like the previous backend endpoint did. Potential strategies include:

*   **Agent-Side Lookup (Most Likely)**: The agents, upon receiving a message or starting a run within a thread, could use the authenticated user information associated with the LangGraph API call (or information stored in thread metadata) to look up the required `user_id` and `alpaca_account_id` from Supabase. This requires the agent environment to have Supabase access. The existing `utils/supabase/db_client.py` and lookup functions might be used here.
*   **Thread Metadata**: The `alpaca_account_id` and `user_id` could be stored in the LangGraph thread's metadata when the thread is created or updated via the frontend SDK (`client.threads.create` or `client.threads.patchState`). Agents would then read this metadata.
*   **Initial Message Context**: The necessary IDs could be passed within the configuration or input of the *first* message/run initiated for a thread. The agent logic would need to extract and persist this information in the thread's state for subsequent interactions.

**Current Implementation: Context via Graph State**

The current approach passes the `user_id` and `account_id` in the `config.configurable` object during the initial `thread.submit` call from the frontend (`Chat.tsx`). LangGraph automatically populates the corresponding fields (`user_id`, `account_id`) in the main graph `State` (defined in `graph.py`) from this initial configuration.

When specialized agents (Portfolio Management, Trade Execution) need the context, their tool functions (e.g., `get_portfolio_summary`, `execute_buy_market_order`) receive the current graph `state` object as an argument. The `get_account_id` helper function within these agents is designed to prioritize reading `user_id` and `account_id` directly from this `state` dictionary.

This ensures that the correct context, originating from the frontend call, is available to the tools when they are executed within the agent's workflow.

### Backend Responsibilities (Reduced)

While most chat interaction logic moves to the frontend SDK, the backend still handles:

1.  **Agent Logic**: The core LangGraph agents (`portfolio_management_agent.py`, `trade_execution_agent.py`, `graph.py`) run server-side, processing messages, accessing tools (like Alpaca), and managing conversation state within LangGraph.
2.  **Long-Term Conversation Storage**: A backend API endpoint (e.g., `/api/conversations/save`) connected to Supabase is likely still used to persist conversation history for long-term retrieval, supplementing LangGraph's own state persistence. This involves:
    *   The `conversations` table in Supabase.
    *   Backend functions to save/retrieve history, respecting RLS policies.
    *   Frontend calls to this API after receiving messages.
3.  **Supabase Integration**: Backend utilities (`utils/supabase/db_client.py`) for agents to interact with Supabase (e.g., for user ID lookups or retrieving financial data).
4.  **Interrupt Resumption (Potentially)**: Depending on how interrupts are handled with the SDK, a backend endpoint like `/api/resume-chat` might still be needed if the SDK requires a server-side action to resume an interrupted graph execution.

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
    *   Potentially an endpoint for resuming interrupts (`/api/resume-chat`) if needed by the SDK flow.
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

## LangGraph Interrupt Handling (SDK Flow)

The SDK likely provides mechanisms to handle interrupts initiated by agents (e.g., for trade confirmations):

1.  **Agent Implementation**: Agent code (`trade_execution_agent.py`) still uses LangGraph's `interrupt()` mechanism.
2.  **SDK Detection**: When streaming or receiving responses via the SDK (`client.runs.stream`/`get`), the frontend code needs to check the response objects for an indication of an interrupt state (the exact format depends on the SDK's implementation). This replaces the backend API detecting `GraphInterrupt`.
3.  **Frontend UI**: If an interrupt is detected:
    *   Display the confirmation message from the interrupt payload.
    *   Show confirmation controls (Yes/No buttons).
    *   Store necessary information (like the run ID or thread ID) needed to resume.
4.  **Resuming Execution**:
    *   When the user confirms/denies, the frontend needs to signal LangGraph to resume the run. This might involve:
        *   A specific SDK method (e.g., `client.runs.resume(run_id, confirmation_input)` - **Check SDK docs for the actual method**).
        *   OR, potentially calling the existing backend endpoint (`/api/resume-chat`) if server-side logic is required to map the confirmation back to the correct LangGraph run. **[Clarify the resume mechanism]**.
5.  **User Experience**: Remains similar – user sees prompt, confirms/denies, execution continues/cancels.

## Troubleshooting

1.  **Agent Context Issues**:
    *   **Symptom**: Agent fails to access correct portfolio, uses defaults, or errors on lookups.
    *   **Causes**: Incorrect implementation of the context handling strategy (metadata, lookup, initial message); Missing Supabase records; Agent lacks Supabase credentials/permissions; Incorrect user mapping.
    *   **Solution**: Verify the chosen context passing mechanism; Check agent logs for lookup errors; Ensure Supabase data is present; Check LangGraph thread metadata if used.

2.  **LangGraph Connection Errors**:
    *   **Symptom**: Errors connecting to LangGraph API in the browser console.
    *   **Causes**: Incorrect `NEXT_PUBLIC_LANGGRAPH_API_URL` or `_KEY`; Network issues; LangGraph service down.
    *   **Solution**: Verify `.env.local` variables; Check network connection; Check LangGraph service status.

3.  **Interrupt Handling Failures**:
    *   **Symptom**: Confirmation prompts don't appear; Confirmation doesn't resume the flow.
    *   **Causes**: Frontend logic doesn't correctly detect interrupt state from SDK response; Incorrect SDK method used for resuming; Backend resume endpoint (`/api/resume-chat`) malfunctioning (if still used).
    *   **Solution**: Debug SDK response handling; Verify the correct SDK resume method/parameters; Check backend logs for the resume endpoint.

4.  **Conversation History Discrepancies**:
    *   **Symptom**: History in chat doesn't match Supabase or is lost.
    *   **Causes**: Failure in frontend calls to the backend save API; Errors in the backend save endpoint; Issues with `client.threads.getState`.
    *   **Solution**: Check browser network tab for failed save requests; Check backend logs for Supabase saving errors; Verify `getThreadMessages` implementation.

## Obsolete Backend APIs

The shift to the frontend SDK makes several previous backend proxy endpoints obsolete:

*   `/api/chat-with-account` (Main proxy endpoint)
*   Backend implementations for:
    *   `/create-new-thread`
    *   `/list-user-threads`
    *   `/delete-chat-session`
    *   `/update-thread-metadata`
    *   `/get-thread-messages`

The corresponding frontend API routes (`/api/chat`, `/api/conversations/delete-session`, etc.) that proxied to these are also either removed or significantly simplified (e.g., `/api/chat` might only handle initial auth checks if not removed entirely).

## Future Enhancements

(Section remains relevant, no changes needed based on SDK shift)
1. Voice Interaction
2. Enhanced Visualization
3. Advanced Personalization
4. Advanced Conversation Management
