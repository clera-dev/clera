# pplx_rag_for_apis.py
#
# This version of the perplexity rag bot will be used in addition to FastAPI
# to link LLM and its outputs to any web service
#
#
# perplexity_ragbot.py
import os
from typing import Annotated
from typing_extensions import TypedDict
import uuid

from langchain_perplexity import ChatPerplexity
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from perplexity import Perplexity
from langchain_core.prompts import (
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate
)

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from langchain_pinecone import PineconeVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from pinecone import Pinecone

from dotenv import load_dotenv 
from datetime import datetime

# ---------------------------------------------------------------------
# CHANGED: We no longer prompt in a while-loop here, so we can run in server mode.
# ---------------------------------------------------------------------

system_prompt_template = """
The assistant is Clera, created by Clera, Inc. 
The current date and time is: {current_datetime}. 

Clera is a extremely knowledgale about all CFA and CFP concepts. Clera is committed to helping people achieve financial success. 
Clera answers questions in small paragraphs WITHOUT the use of headers or subheaders.
This is because Clera communicates like a friend — simple, concise, and kind — and wants information to be EASILY DIGESTIBLE.

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


# Personal information for contextualization
personal_information = """
I am 25, fully-employed making $80,000 a year, have a 10+ year investment horizon for retirement, 
and love the technology sector. I am chatting with you because I know investing is important for 
my future but I struggle to understand the world of finance and investments on my own.
"""


class State(TypedDict):
    messages: Annotated[list, add_messages]
    retrieved_context: list
    last_user_input: str


class FinancialRAGAgent:

    def __init__(self):
        # Disable tokenizers to avoid huggingface/tokenizers warning
        os.environ["TOKENIZERS_PARALLELISM"] = "false"

        # Load environment variables
        load_dotenv()

        self.pplx_client = Perplexity()
        self.initalize_vectorstore()

        graph_builder = StateGraph(State)
        graph_builder.add_node("retriever_node", self.retrieval_node)
        graph_builder.add_node("chatbot", self.chatbot)
        graph_builder.set_entry_point('retriever_node')
        graph_builder.add_edge("retriever_node", "chatbot")
        graph_builder.add_edge("chatbot", END)

        memory = MemorySaver()
        self.graph = graph_builder.compile(checkpointer=memory)
    
    def initalize_vectorstore(self):
        self.connect_pinecone()
        self.initalize_embedding_model()

        vectorstore = PineconeVectorStore(
            index=self.index,
            embedding=self.embed,
            text_key="text"
        )
        self.retriever = vectorstore.as_retriever(search_kwargs={"k": 2})
        print("completed initialization of vectorstore")
    
    def connect_pinecone(self):
        self.pinecone_api_key = os.getenv("PINECONE_API_KEY")

        try:
            self.pc = Pinecone(api_key=self.pinecone_api_key)
            print("Pinecone initialized successfully")
        except Exception as e:
            print(f"Pinecone initialization failed: {str(e)}")

        self.index_name = "langchain-retrieval-augmentation"
        self.host_name="https://langchain-retrieval-augmentation-07ueldf.svc.aped-4627-b74a.pinecone.io"
        self.index = self.pc.Index(name=self.index_name, host=self.host_name)

    def initalize_embedding_model(self):
        try:
            self.embed = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        except Exception as e:
            print(f"Error initializing HuggingFace embeddings: {e}")
            exit(1)

    def retrieval_node(self, state: State):
        """
        Retrieve relevant context from Pinecone using the user's last message content.
        """
        user_message = HumanMessage(content=state['messages'][-1].content)
        docs = self.retriever.invoke(user_message.content)
        context_text = "\n".join([doc.page_content for doc in docs])
        cleaned_context = context_text.replace("\n", "")

        print(f"Final context for model: {cleaned_context}") 

        state["retrieved_context"] = [cleaned_context]
        state["last_user_input"] = user_message
        return {"retrieved_context": [cleaned_context], "last_user_input": user_message}
    
    def chatbot(self, state: State):
        """
        Compose the final prompt to the LLM. 
        """
        # Remove the last raw user message if it's there
        if state["messages"] and isinstance(state["messages"][-1], HumanMessage):
            state["messages"].pop()

        context = state["retrieved_context"]
        combined_context = ''.join(context)

        user_message = state["last_user_input"]
        current_datetime = datetime.now()
        
        # Possibly add system message once:
        system_already_present = any(isinstance(msg, SystemMessage) for msg in state["messages"])
        if not system_already_present:
            system_message_prompt = SystemMessagePromptTemplate.from_template(system_prompt_template)
            system_msgs = system_message_prompt.format_messages(current_datetime=current_datetime)
            state["messages"] = system_msgs + state["messages"]

        human_prompt = (
            "Hey! Since you are the world's BEST financial advisor, I need you to answer the following question:\n"
            "{input}\n"
            "ADDITIONAL CONTEXT TO REFERENCE:"
            f"{personal_information}\n"
            "BEFORE ANSWERING, here is some extra context from CFP documents (not to be quoted verbatim):"
            f"{combined_context}"
        )

        human_message_prompt = HumanMessagePromptTemplate.from_template(human_prompt)
        human_msgs = human_message_prompt.format_messages(input=user_message)
        state["messages"].extend(human_msgs)

        # Convert state["messages"] (a list of SystemMessage/HumanMessage/AIMessage) to dict format
        api_messages = []
        for msg in state["messages"]:
            role = "assistant" if isinstance(msg, AIMessage) else "user" if isinstance(msg, HumanMessage) else "system"
            api_messages.append({"role": role, "content": msg.content})
        
        # Call Perplexity API with streaming
        stream = self.pplx_client.chat.completions.create(messages=api_messages, model="sonar", stream=True)
        answer = ""
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                partial_text = chunk.choices[0].delta.content
                answer += partial_text
        
        # Wrap answer as AIMessage and append
        response = AIMessage(content=answer)
        state["messages"].append(response)
        return {"messages": state["messages"]}

    # ---------------------------------------------------------------------
    # CHANGED: Instead of a loop, we have a single method to process input
    # ---------------------------------------------------------------------
    def process_user_input(self, user_input: str) -> str:
        """
        Takes the user's text, runs it through our pipeline, and returns the AI's final response.
        """
        # Each new request is a fresh pass with:
        events = self.graph.stream(
            {"messages": [HumanMessage(content=user_input)]},
            {},
            stream_mode="values"
        )
        final_response = ""
        for event in events:
            if "messages" in event:
                ai_message = event["messages"][-1]
                if isinstance(ai_message, AIMessage):
                    final_response = ai_message.content
        return final_response

# We don't auto-run chat in a CLI loop here; that is handled by an external script or server.
if __name__ == "__main__":
    print("This script is primarily a library now. You can import `FinancialRAGAgent` into an API server.")
