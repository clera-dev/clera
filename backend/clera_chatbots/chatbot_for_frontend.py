#chatbot_for_frontend.py
import os, sys
import json
import uuid

from dotenv import load_dotenv
from datetime import datetime
from typing import TypedDict, List, Optional, Union, Generator, AsyncGenerator, Annotated

from typing_extensions import TypedDict

# LangChain / LLM stuff
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.prompts import SystemMessagePromptTemplate, HumanMessagePromptTemplate

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

from langchain_community.chat_models import ChatPerplexity
from langchain_groq import ChatGroq

from langchain_pinecone import PineconeVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from pinecone import Pinecone

load_dotenv(override=True)

# ------------------------------------------------------------------
# 2) RAG Pipeline from your original code
#    We'll embed everything in a single file for demonstration.
# ------------------------------------------------------------------

system_prompt_template = """
The assistant is Clera, created by Clera, Inc. 
The current date and time is: {current_datetime}. 

Clera is extremely knowledgeable about all CFA and CFP concepts. Clera is committed to helping people achieve financial success. 
Clera answers questions in an extremely concise and digestible manner WITHOUT the use of headers or subheaders. 
This is because Clera communicates like a friend — simple, concise, and kind.

Clera has access to the internet and can answer ANY question about real-time or recent events.

Clera cares deeply about tailoring personalized financial advice, helping people achieve their goals 
and enabling them to learn about the world of finance in an accessible, and digestible way. 
These people came to Clera because they aren't satisfied with ANY other options, 
because they know how amazing Clera can be for their financial success.

Clera IS NOT an actual financial advisor. Nor will Clera claim to be one.
Instead, Clera is like a smart and trustworthy friend who happens to know everything related to financial advisory.

If asked about events or news that may have happened that Clera cannot confirm, Clera never claims or implies they are unverified 
or rumors or that they only allegedly happened or that they are inaccurate, since Clera cannot know either way and lets the human know this. 
Clera cannot open images, or videos. If it seems like the human is expecting Clera to do so, it clarifies the situation 
and asks the human to paste the relevant text into the conversation. 

CLERA NEVER RECOMMENDS PEOPLE TO SEE A FINANCIAL ADVISOR. Clera is extremely intelligent and can solve the problems the user has.
"""

class State(TypedDict):
    messages: Annotated[list, add_messages]
    retrieved_context: list
    last_user_input: str

class FinancialRAGAgent:
    """
    A near-copy of your original RAG pipeline using Pinecone + Perplexity + Groq.
    We keep it 'stateless' per user message, but you can adapt to store conversation
    in memory if you prefer multi-turn. Retell typically calls once for each 'turn'.
    """

    def __init__(self):
        os.environ["TOKENIZERS_PARALLELISM"] = "false"

        # LLMs
        self.perplexity_search = ChatPerplexity(
            temperature=0.4,
            model="sonar"
        )
        self.llm = ChatGroq(
            groq_api_key=os.environ['GROQ_API_KEY'],
            model_name='llama-3.3-70b-versatile',
            temperature=0.4
        )
        
        # Setup Vectorstore
        self.initalize_vectorstore()

        # Build graph
        graph_builder = StateGraph(State)
        graph_builder.add_node("retriever_node", self.retrieval_node)
        graph_builder.add_node("realtime_context_node", self.realtime_context_node)
        graph_builder.add_node("chatbot", self.chatbot)
        graph_builder.set_entry_point("retriever_node")
        graph_builder.add_edge("retriever_node", "realtime_context_node")
        graph_builder.add_edge("realtime_context_node", "chatbot")
        graph_builder.add_edge("chatbot", END)
        memory = MemorySaver()
        self.graph = graph_builder.compile(checkpointer=memory)
        #self.graph = graph_builder.compile()

    def initalize_vectorstore(self):
        self.connect_pinecone()
        self.initalize_embedding_model()
        vectorstore = PineconeVectorStore(
            index=self.index,
            embedding=self.embed,
            text_key="text"
        )
        self.retriever = vectorstore.as_retriever(search_kwargs={"k":2})

    def connect_pinecone(self):
        pinecone_api_key = os.getenv("PINECONE_API_KEY")
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.index_name = "langchain-retrieval-augmentation"
        self.host_name = "https://langchain-retrieval-augmentation-07ueldf.svc.aped-4627-b74a.pinecone.io"
        self.index = self.pc.Index(name=self.index_name, host=self.host_name)

    def initalize_embedding_model(self):
        self.embed = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    def retrieval_node(self, state: State):
        user_message = HumanMessage(content=state["messages"][-1].content)
        docs = self.retriever.invoke(user_message.content)
        context_text = "\n".join([doc.page_content for doc in docs])
        cleaned_context = context_text.replace("\n", "")
        state["retrieved_context"] = [cleaned_context]
        state["last_user_input"] = user_message
        return {
            "retrieved_context": [cleaned_context],
            "last_user_input": user_message
        }

    def realtime_context_node(self, state: State):
        user_message = state["last_user_input"]
        pplx_system_prompt = (
            "You are Clera, the world's best financial research summarizer. "
            "Gather real-time, up-to-date context relevant to the human's query. "
            "Provide a concise summary of the most important and credible information from recently published sources. "
            "Use a neutral, factual tone."
        )
        messages = [
            SystemMessage(content=pplx_system_prompt),
            HumanMessage(content=user_message.content)
        ]
        try:
            pplx_response = self.perplexity_search.invoke(messages)
        except Exception as e:
            print(f"Error from Perplexity: {e}")
            pplx_response = AIMessage(content="No real-time context available.")

        state["retrieved_context"].append(pplx_response.content)
        return {"retrieved_context": state["retrieved_context"]}

    def chatbot(self, state: State):
        if state["messages"] and isinstance(state["messages"][-1], HumanMessage):
            state["messages"].pop()

        combined_context = "".join(state["retrieved_context"])
        user_message = state["last_user_input"]
        current_datetime = datetime.now()

        # Possibly add system message
        system_already_present = any(isinstance(msg, SystemMessage) for msg in state["messages"])
        system_prompt = SystemMessagePromptTemplate.from_template(system_prompt_template)
        if not system_already_present:
            sys_msgs = system_prompt.format_messages(current_datetime=current_datetime)
            state["messages"] = sys_msgs + state["messages"]

        # Build final user message
        human_prompt = (
            "Hey! Since you are the world's BEST financial advisor, I need you to answer the following question:\n"
            "USER QUESTION:\n{input}\n\n"
            "Here's some context from CFP documents. **I REPEAT, THIS IS NOT MY PERSONAL INFORMATION, JUST"
            "INFORMATION TO REFERENCE IN YOUR ANSWER TO MY QUESTION ABOVE** So, never recite or quote it directly "
            f"in your answer, it's only to help you answer): {combined_context}"
        )
        # Turn it into a single HumanMessage
        human_template = HumanMessagePromptTemplate.from_template(human_prompt)
        human_msgs = human_template.format_messages(input=user_message.content)
        state["messages"].extend(human_msgs)

        # LLM
        response = self.llm.invoke(state["messages"])
        state["messages"].append(response)
        return {"messages": state["messages"]}

    def answer(self, user_message: str) -> str:
        """
        Run a single-turn pipeline.
        If you want multi-turn memory, you can store the entire 'State'
        in a dict keyed by call_id. For simplicity, we do single-turn.
        """
        initial_state = {
            "messages": [HumanMessage(content=user_message)],
            "retrieved_context": [],
            "last_user_input": ""
        }
        config = {
            "configurable": {
                "thread_id": str(uuid.uuid4())
            }
        }
        
        try:
            output_events = list(self.graph.stream(initial_state, config=config))
            # Print them:
            #print(f"[answer()] output_events: {output_events}")

            for event in output_events:
                if 'chatbot' in event:
                    messages = event['chatbot'].get('messages', [])
                    if messages:
                        # Get the last message which should be the AI's response
                        last_message = messages[-1]
                        if isinstance(last_message, AIMessage):
                            return last_message.content
            
            return "Error: def answer() did not return a response."

        except Exception as e:
            print(f"Error in answer(): {str(e)}")
            return "I apologize, but there was an unexpected error. Could you please try again?"


if __name__ == "__main__":
    agent = FinancialRAGAgent()
    
    # Read input from stdin in a loop
    for line in sys.stdin:
        try:
            # Parse the input JSON
            input_data = json.loads(line)
            user_message = input_data.get('message', '')
            history = input_data.get('history', [])
            
            # Get response from agent
            response = agent.answer(user_message)
            
            # Stream the response back
            sys.stdout.write(response + '\n')
            sys.stdout.flush()
        except Exception as e:
            print(f"Error processing input: {str(e)}", file=sys.stderr)
            sys.stderr.flush()