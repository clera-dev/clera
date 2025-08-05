#clera_main.py
# This is a file to test Clera's functionality in terminal.
# graph.py is the real file to use for production.

#!/usr/bin/env python3
import os
import sys
import json
import uuid
from datetime import datetime
from dotenv import load_dotenv
from typing import List, Optional, Any, Dict, Tuple, Union, Annotated, Literal
from typing_extensions import TypedDict

# ---------------------------
# Import LangChain / LangGraph components
# ---------------------------
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage, FunctionMessage
from langchain_core.prompts import SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate
from langchain_core.tools import Tool, tool
from langchain.agents.format_scratchpad.log_to_messages import format_log_to_messages

from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph_supervisor import create_supervisor
from langgraph.prebuilt import create_react_agent
from langgraph.types import interrupt

# ---------------------------
# Import LLM clients (GroqCloud & Perplexity)
# ---------------------------
from langchain_groq import ChatGroq
from langchain_community.chat_models import ChatPerplexity

# ---------------------------
# Import tools for agents to use
# ---------------------------
from financial_analyst_agent import financial_news_research, summarize_news
from portfolio_management_agent import retrieve_portfolio_data, create_rebalance_instructions
# ---------------------------
# Disable tokenizer warnings and load environment variables
# ---------------------------
os.environ["TOKENIZERS_PARALLELISM"] = "false"
load_dotenv(override=True)

###############################################################################
# Define the conversation state type
###############################################################################
class State(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    next_step: str
    current_agent: str
    agent_scratchpad: List[BaseMessage]
    retrieved_context: List[str]
    last_user_input: str
    answered_user: bool

    # Add these two lines to allow supervisor to have state memory
    is_last_step: bool
    remaining_steps: int

###############################################################################
# Define Specialized Agents
###############################################################################

chat_perplexity = ChatPerplexity(
    temperature=0.4,
    model="sonar"
)

@tool("execute_trade")
def execute_trade(ticker: str, quantity: int, price: float) -> str: # in practice, this won't have price since we'll buy at market price automatically
    """Execute a trade for a given ticker, quantity, and price."""
    return f"Trade executed: {ticker} {quantity} @ {price}"


###############################################################################
# Build the Graph
###############################################################################

supervisor_clera_system_prompt = """
The assistant is Clera, created by Clera, Inc. 

Clera is extremely knowledgeable about all CFA and CFP concepts. Clera is committed to helping people achieve financial success. 
Clera answers questions in an extremely concise and digestible manner WITHOUT the use of headers or subheaders. 
This is because Clera communicates like a friend — simple, concise, and kind.

<IMPORTANT>
Clera is a team supervisor managing a financial analyst agent and a portfolio rebalance agent. 
Clera's role is to:
1. Analyze human's queries to determine which specialized agent to use
2. Delegate tasks to the appropriate agent
3. Synthesize responses from specialized agents into clear, actionable advice (because the human CANNOT see the responses from the agents)
For any question related to financial news, use financial_news_agent (which has access to any real-time financial news to either summarize OR perform an in-depth analysis on). 
For any question related to portfolio management, use portfolio_management_agent (which has access to the user's portfolio data AND the ability to rebalance the portfolio).
- NOTE: When Clera gets a response from the portfolio_management_agent or financial_news_agent, she must repeat the response to the human in a more digestible, personalized, and helpful manner.
When the human asks to execute a trade, or the portfolio_management_agent needs to execute a trade, use trade_execution_agent (which has access to the ability to execute trades).
- NOTE: When Clera gets a response from the trade_execution_agent, she must tell the human that the trade has been executed, and then VERY BRIEFLY list out the trade details.
IF YOU DON'T NEED A TOOL, JUST RESPOND NORMALLY directly to the human without using any tools.

DO NOT FORGET: The human CANNOT see the responses from the agents that Clera delegates to. This team of agents support Clera by providing her information. 
So Clera must respond to the human directly and completely, repeating the information from the agents to the human. CLERA WILL NEVER FORGET THIS — SHE WILL ALWAYS RESPOND TO THE HUMAN KNOWING THE HUMAN CANNOT SEE THE RESPONSES FROM THE AGENTS.
</IMPORTANT>

Clera cares deeply about tailoring personalized financial advice, helping people achieve their goals 
and enabling them to learn about the world of finance in an accessible, and digestible way. 
These people came to Clera because they aren't satisfied with ANY other options, 
because they know how amazing Clera can be for their financial success.

Clera IS a financial advisor.

If asked about events or news that may have happened that Clera cannot confirm, Clera never claims or implies they are unverified 
or rumors or that they only allegedly happened or that they are inaccurate, since Clera cannot know either way and lets the human know this. 
Clera cannot open images, or videos. If it seems like the human is expecting Clera to do so, it clarifies the situation 
and asks the human to paste the relevant text into the conversation. 

CLERA NEVER RECOMMENDS PEOPLE TO SEE A FINANCIAL ADVISOR. Clera is extremely intelligent and can solve the problems the human has.
"""

def build_graph(main_llm: ChatGroq, news_llm: ChatGroq, rebalance_llm: ChatGroq, trade_llm: ChatGroq):
    """Build the LangGraph workflow"""

    # Add memory
    checkpointer = MemorySaver()
    
    # Create specialized agents
    #print("Creating financial news agent...")
    financial_news_agent = create_react_agent( #
        model=news_llm,
        tools=[financial_news_research, summarize_news],
        prompt=("You are the world's BEST and most efficient financial news agent. Given a human query, provide a clear and concise response on the topic."
                "<IMPORTANT> You are efficient because of 3 reasons:"
                " 1) if the human is asking for summary of news, or a simple question about financial news, you use the summarize_news tool."
                " 2) if the human is asking for in-depth research on a financial topic or company, you use the financial_news_research tool."
                " 3) regardless of the human's query, you only choose ONE of the tools before responding to the human. NO MATTER WHAT."
                " So be thoughtful regarding which tool to use based on the human's query, because you can only choose ONE, the one that best fits the human's query."
                "REMEMBER: After calling one tool, you MUST STOP. Do not call another tool. You must respond to the human with the output from the 1 tool you called."
                "For example, if you already call the summarize_news tool, DO NOT call the financial_news_research tool after."
                "Similarly, if you already call the financial_news_research tool, DO NOT call the summarize_news tool after."),
        name="financial_news_agent",
        state_schema=State
    )

    portfolio_management_agent = create_react_agent(
        model=rebalance_llm,
        tools=[retrieve_portfolio_data, create_rebalance_instructions],
        prompt=("You are the world's BEST portfolio management agent."
                "You are able to create rebalance instructions for the user's portfolio based on the user's portfolio data."
                "You use the retrieve_portfolio_data tool to retrieve the user's portfolio data."
                "You use the create_rebalance_instructions, inputting the user's portfolio data, to help the user learn how exactly to rebalance their portfolio."
                "Important: You MUST use the retrieve_portfolio_data tool FIRST to retrieve the user's portfolio data before using the create_rebalance_instructions tool."
                "Your final output to the human will be a clear list of instructions for how to rebalance their portfolio, should they choose to do so."
                "When a human is curious about their portfolio, you must retrieve their portfolio data and run initial calculations to see what MIGHT need to be done (like rebalancing)."),
        name="portfolio_management_agent",
        state_schema=State
    )

    trade_execution_agent = create_react_agent(
        model=trade_llm,
        tools=[execute_trade],
        prompt=("You are the world's BEST trade execution agent."
                "You are able to execute trades for the human."
                "You use the execute_trade tool to execute a trade."
                "Remember: You MUST use the execute_trade tool to execute a trade." # Am not specifying how mayn times it needs to call it 
                "Just like a usual trade broker, you must call the execute_trade tool once for each trade you are instructed to execute."
                "You must call the execute_trade tool with the following format: 'TICKER:QUANTITY:PRICE'."
                "For example: 'AAPL:10:100'"
                "Remember: YOUR JOB IS SO SO IMPORTANT. You are dealing with the human's life savings."
                "You must be 100 percent accurate with everything you do. So think critically about every task."),
        name="trade_execution_agent",
        state_schema=State,
        interrupt_before=["tools"]
    )

    # Create supervisor workflow
    workflow = create_supervisor(
        [financial_news_agent, portfolio_management_agent, trade_execution_agent],
        model=main_llm,
        prompt=(supervisor_clera_system_prompt),
        output_mode="full_history",  # Include full message history from agents
        supervisor_name="Clera",

        # ADD THIS so that your custom State is recognized:
        state_schema=State
    )
    
    # Compile with memory components
    return workflow.compile(
        checkpointer=checkpointer
    )

###############################################################################
# Initialize and Run
###############################################################################

def process_query(user_query: str) -> str:
    """Process a user query through the graph"""
    # Initialize LLM
    main_llm = ChatGroq(
        groq_api_key=os.environ.get("GROQ_API_KEY"),
        model_name="llama-3.3-70b-versatile",
        temperature=0.5
    )
    	
    news_llm = ChatGroq(
        groq_api_key=os.environ.get("GROQ_API_KEY"),
        model_name="llama-3.1-8b-instant",
        temperature=0.4
    )

    rebalance_llm = ChatGroq(
        groq_api_key=os.environ.get("GROQ_API_KEY"),
        model_name="llama-3.1-8b-instant",
        temperature=0.3
    )

    trade_llm = ChatGroq(
        groq_api_key=os.environ.get("GROQ_API_KEY"),
        model_name="llama-3.1-8b-instant",
        temperature=0.2
    )
    
    # Build graph
    app = build_graph(main_llm, news_llm, rebalance_llm, trade_llm)
    
    # Format input for the graph
    input_data = {
        "messages": [
            {
                "role": "user",
                "content": user_query
            }
        ]
    }

    config = {
            "configurable": {
                "thread_id": "1", #str(uuid.uuid4()) # < ---- replaced with stable ID
                "user_id": "1"
            }
        }
    # "configurable": {"thread_id": "1", "user_id": user_id}}
    
    # Run the graph
    try:
        result = app.invoke(input_data, config=config, stream_mode="values")
        # Get the last message from the result
        if result and "messages" in result:
            messages = result["messages"]
            #print(f"Messages in result in process_query: {messages}")
            if messages:
                last_message = messages[-1]
                #print(f"Last message in process_query: {last_message}")
                if isinstance(last_message, dict):
                    return last_message.get("content", "No response generated.")
                return last_message
        return "I apologize, but I wasn't able to generate a response. Please try again."
    except Exception as e:
        return f"An error occurred processing your query: {e}"

#__all__ = ["app"]

# commenting out for docker
if __name__ == "__main__":
    print("Hello! I'm Clera, your personalized financial advisor. How can I help you today?")
    while True:
        user_input = input("User: ").strip()
        if not user_input:
            continue
        answer = process_query(user_input)
        print("\n" + "="*50 + "\n")
        print(f"Clera's answer: {answer.content}")

