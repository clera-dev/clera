# Agent System Prompts - Investigation Log

## Overall System Structure
- Supervisor: `Clera` (Llama 3.3 70B)
  - Responsible for direct answers or routing to specialized agents.
  - Handles synthesizing agent responses.
- Specialized Agents (all use `create_react_agent`):
  - `financial_analyst_agent` (Llama 3.1 8B - `news_llm`)
    - Tools: `web_search`, `get_stock_price`
    - Prompt emphasizes one tool call.
  - `portfolio_management_agent` (Llama 3.1 8B - `rebalance_llm`)
    - Tools: `get_portfolio_summary`, `rebalance_instructions`
    - Prompt emphasizes one tool call and returning raw tool output.
  - `trade_execution_agent` (Llama 3.1 8B - `trade_llm`)
    - Tools: `execute_buy_market_order`, `execute_sell_market_order`
    - Prompt emphasizes one tool call and returning raw tool output via "Final Answer:".

## Issue 1: Looping in `portfolio_management_agent`
- **User Queries:** "How can I improve my risk score?", "What am I invested in?"
- **Behavior:** `Clera` -> `portfolio_management_agent` -> `rebalance_instructions` -> `get_portfolio_summary` -> loop. Leads to `GraphRecursionError`.
- **Analysis:**
  - `portfolio_management_agent` prompt is strict about "ONE tool" and "RETURN EXACTLY what the tool returns".
  - However, it does *not* use the "Final Answer:" pattern seen in `trade_execution_agent`'s prompt.
  - The `create_react_agent` framework might not recognize the agent's turn is complete without a clear "Final Answer:" prefix. This could cause it to re-prompt the agent. When re-prompted with the same state, the agent might alternate between its available tools if the initial query is ambiguous enough to map to either, or if it believes it needs to perform another action.
- **Hypothesis:** The agent isn't signaling completion correctly to the ReAct framework, leading to the recursion.
- **Potential Fix:** Modify `portfolio_management_agent`'s prompt to explicitly instruct it to output "Final Answer: [tool_output_verbatim]", similar to `trade_execution_agent`.

## Issue 2: `Clera` fails to delegate "buy $100 of SPY"
- **User Query:** "sounds great. buy me $100 of SPY"
- **Behavior:** `Clera` throws `APIError("Failed to call a function...")`. The error indicates `Clera` (supervisor) itself failed, not a sub-agent.
- **Analysis:**
  - `Clera`'s prompt for routing to `trade_execution_agent`: "ONLY for explicit BUY/SELL commands."
  - General instruction for routing output: "Output ONLY the name of the chosen agent (e.g., `portfolio_management_agent`) if routing."
  - It seems `Clera` (using `main_llm` - Llama 3.3 70B) may have attempted to call a tool directly (which it's forbidden to do) or failed to output *only* the agent's name as required for routing.
- **Hypothesis:** The 70B model needs even more explicit and restrictive output formatting instructions when its decision is to route.
- **Potential Fix:** Reinforce in `Clera`'s supervisor prompt, under the routing decision section: "If you decide to route, your entire response MUST BE ONLY the name of the chosen agent (e.g., `trade_execution_agent`). Absolutely no other text, no explanations, just the agent name."

## Issue 3: `portfolio_management_agent` fails on "What news is impacting my Portfolio today?"
- **User Query:** "What news is impacting my Portfolio today?"
- **Behavior:** `Clera` correctly routes to `portfolio_management_agent` first (as per its "Portfolio News Flow" logic to get holdings). `portfolio_management_agent` then throws an `APIError("Failed to call a function...")`.
- **Analysis:**
  - `Clera`'s "Portfolio News Flow" (current logic):
    1. "If user accepts the portfolio news offer -> Route to `portfolio_management_agent` first."
    2. "If receiving holdings from `portfolio_management_agent` *after* the user accepted the news offer -> Route to `financial_analyst_agent` with a combined query..."
  - A direct query like "What news is impacting my Portfolio today?" is interpreted by `Clera` as triggering the first step of this flow, so it routes to `portfolio_management_agent`.
  - However, `portfolio_management_agent` is equipped only with `get_portfolio_summary` and `rebalance_instructions`. It has no tools for fetching news.
  - When `portfolio_management_agent` receives a request that implies a need for news (even if the supervisor intended for it to just provide holdings), it seems to be trying to fulfill the underlying user need for news, leading to an error as it tries to call a non-existent or inappropriate tool.
- **Hypothesis:** `Clera` is correctly identifying the need to first get portfolio holdings via `portfolio_management_agent`, but it's not being explicit enough in the *task description it passes* to `portfolio_management_agent`. `Clera` needs to ensure that when it routes to `portfolio_management_agent` in this scenario, the actual request given to `portfolio_management_agent` is clearly "get portfolio summary" or similar, not the original user query about news.
- **Potential Fix for `Clera`'s supervisor prompt (Portfolio News Flow section):**
  - Clarify that when the user asks for portfolio-related news:
    1.  `Clera` determines it first needs portfolio holdings.
    2.  `Clera` routes to `portfolio_management_agent` with a *specific instruction* to provide the portfolio summary/holdings. For example, the input passed from `Clera` to `portfolio_management_agent` should be framed as "User wants news about their portfolio. First, provide the current portfolio summary." or "Get portfolio holdings."
    3.  After `portfolio_management_agent` returns the holdings (as per its updated prompt, it should just return the tool output), `Clera` then takes these holdings and proceeds to formulate a new request to `financial_analyst_agent` for news on those holdings (e.g., "Get news for TICKER1, TICKER2."). This second step is already generally covered in `Clera`'s "AGENT RESPONSE HANDLING" and specific "Portfolio News Flow".
  - This ensures `portfolio_management_agent` is only asked to do tasks within its capabilities.

## General Prompting Considerations
- **LLM Adherence for Sub-Agents:** Smaller models (like the 8B Llama 3.1s) need extremely explicit instructions, especially for stopping criteria and output formatting. The "Final Answer:" pattern is crucial for ReAct agents.
- **Supervisor Prompt Clarity:** `Clera`'s supervisor prompt is comprehensive but also complex. Any ambiguity in critical sections (like the format of routing decisions) can lead even powerful models like the 70B Llama 3.3 to misinterpret. Simplicity, directness, and explicit formatting examples are vital.
- **Tool Naming:** The tool names themselves (`web_search`, `get_stock_price`, `get_portfolio_summary`, `rebalance_instructions`, `execute_buy_market_order`, `execute_sell_market_order`) appear to be clear and descriptive. The issues don't seem to originate from unclear tool names.

## Web Search for Anthropic Prompts (Self-Correction/Awareness)
- General principles from high-quality prompts (like those potentially used by Anthropic for Claude) often emphasize:
    - Clear role definition and persona.
    - Explicit instructions on output format, often using XML tags or similar structural elements to delineate sections.
    - Step-by-step "thinking" process if the task is complex.
    - Clear articulation of constraints and limitations.
    - Examples of desired input/output.
- The existing prompts already use many of these (markdown, bolding, examples). The proposed refinements aim to tighten instructions where the LLMs show signs of deviation, particularly around output formatting and task scoping for sub-agents.
