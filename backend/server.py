# server.py
#
# How to run:
# run `ngrok http http://localhost:8080`
# cd into clera_chatbots
# run `uvicorn server:app --reload --port=8080`
import os
import json
import uuid
import asyncio
from dotenv import load_dotenv
from datetime import datetime
from typing import TypedDict, List, Optional, Union, Generator, AsyncGenerator, Annotated

from typing_extensions import TypedDict
import uvicorn
import time  # Add this import at the top with other imports


# FastAPI & Retell
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from retell import Retell
from concurrent.futures import TimeoutError as ConnectionTimeoutError
from starlette.websockets import WebSocketState, WebSocketDisconnect 
from concurrent.futures import TimeoutError as ConnectionTimeoutError

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

# ------------------------------------------------------------------
# 1) Load environment
# ------------------------------------------------------------------
load_dotenv(override=True)
app = FastAPI()

RETELL_API_KEY = os.environ["RETELL_API_KEY"]
retell = Retell(api_key=RETELL_API_KEY)

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
            print(f"[answer()] output_events: {output_events}")

            for event in output_events:
                if 'chatbot' in event:
                    messages = event['chatbot'].get('messages', [])
                    if messages:
                        # Get the last message which should be the AI's response
                        last_message = messages[-1]
                        if isinstance(last_message, AIMessage):
                            return last_message.content
            
            return "Error: def answer() did not return a response."
     
            # The final node returns something like {"messages": [...]}.
            '''if not output_events:
                return "Error: No output events in def answer()."

            final_event = output_events[-1]
            if "messages" not in final_event:
                return "Error: No final messages in def answer()."

            messages = final_event.get("messages", [])
            if not messages:
                return "Error: No messages in final event in def answer()."
            
            last_message = messages[-1]
            return last_message.content'''
        except Exception as e:
            print(f"Error in answer(): {str(e)}")
            return "I apologize, but there was an unexpected error. Could you please try again?"

# We create a single agent instance to use for all calls
rag_agent = FinancialRAGAgent()

# ------------------------------------------------------------------
# 3) Data classes that mirror the Retell "custom_types" example
#    In real code, you'd define these in separate .py files.
# ------------------------------------------------------------------

class ResponseRequiredRequest(TypedDict):
    interaction_type: str
    response_id: int
    transcript: list  # each item typically: {"content": str, "is_bot": bool, ...}

class LlmEvent:
    """
    An event to send back over the WebSocket. Typically we set:
      response_type: "update" / "completed" / "ping_pong" / "config", etc.
      content: The text for the user
      done: If streaming, 'False' until final chunk
      response_id: Must match Retell's response_id
      timestamp: current time in ms
    """
    def __init__(
        self,
        response_type: str,
        content: str = "",
        done: bool = False,
        response_id: int = 0,
        timestamp: int = 0
    ):
        self.response_type = response_type
        self.content = content
        self.done = done
        self.response_id = response_id
        self.timestamp = timestamp

    @property
    def dict(self):
        return {
            "response_type": self.response_type,
            "content": self.content,
            "done": self.done,
            "response_id": self.response_id,
            "timestamp": self.timestamp,
        }

class ConfigResponse:
    """
    An initial config event telling Retell how to handle the call.
    """
    def __init__(
        self,
        response_type: str,
        config: dict,
        response_id: int
    ):
        self.response_type = response_type
        self.config = config
        self.response_id = response_id
    @property
    def dict(self):
        return {
            "response_type": self.response_type,
            "config": self.config,
            "response_id": self.response_id
        }

# ------------------------------------------------------------------
# 4) LlmClient that shapes how we produce "draft" events for Retell
# ------------------------------------------------------------------
class LlmClient:
    """
    This class handles how we send the initial "begin" message,
    plus how we respond to each "response_required" from Retell.
    """

    def draft_begin_message(self) -> LlmEvent:
        """
        Optionally send an 'update' with an empty content
        to signal readiness. If you want the bot to greet
        first, you could put text in content here.
        """
        return LlmEvent(
            response_type="update",
            content="",
            done=False,
            response_id=1,
            timestamp=int(time.time() * 1000),
        )

    async def draft_response(
        self, request: ResponseRequiredRequest
    ) -> AsyncGenerator[LlmEvent, None]:
        """
        When Retell wants a response (interaction_type = 'response_required'),
        we read the user’s text from `request.transcript[-1]['content']`,
        pass it to our RAG pipeline, and yield events with the final answer.

        If you want partial streaming, you can break the final answer
        into multiple LlmEvents. For simplicity, we send one chunk.
        """
        try:
            # Retrieve the last user message from the transcript
            if not request["transcript"]:
                user_text = "Hello!"
            else:
                #user_text = request["transcript"][-1]["content"]
                last_message = request["transcript"][-1]
                user_text = last_message.get("content", "")
                if not user_text:
                    user_text = "Hello!"
        
            print(f"Processing user_text: {user_text!r}")

            # 1. Use your RAG pipeline to get an answer
            try:
                answer = rag_agent.answer(user_text)
                if not answer or not isinstance(answer, str):
                    raise ValueError("Invalid response from RAG pipeline")
            except Exception as e:
                #answer = f"Sorry, an error occurred. {str(e)}"
                print(f"RAG pipeline error: {str(e)}")
                answer = "I apologize, but I'm having trouble processing your request. Could you please try again?"

            # 2. If you want to chunk the answer for partial streaming,
            #    you could do something like split on sentences. Here, we
            #    just yield one final "update" with done=True.
            event = LlmEvent(
                response_type="update",
                content=answer,
                done=True,  # set True so Retell knows to speak
                response_id=request["response_id"],
                timestamp=int(time.time() * 1000),
            )
            print(f"user_text={user_text!r}")
            print(f"answer={answer!r}")

            yield event

        except Exception as e:
            print(f"Error in draft_response: {str(e)}")
            error_event = LlmEvent(
                response_type="update",
                content="I apologize, but there was an unexpected error. Could you please try again?",
                done=True,
                response_id=request["response_id"],
                timestamp=int(time.time() * 1000),
            )
            yield error_event

# ------------------------------------------------------------------
# 5) Retell Webhook (verifying call_started, call_ended, etc.)
# ------------------------------------------------------------------
@app.post("/webhook")
async def handle_webhook(request: Request):
    """
    Retell sends events about the call lifecycle. We verify the signature,
    then handle them accordingly.
    """
    try:
        post_data = await request.json()

        # Verify the signature
        valid_signature = retell.verify(
            json.dumps(post_data, separators=(",", ":"), ensure_ascii=False),
            api_key=str(os.environ["RETELL_API_KEY"]),
            signature=str(request.headers.get("X-Retell-Signature")),
        )
        if not valid_signature:
            print("Received Unauthorized", post_data.get("event"), post_data["data"].get("call_id"))
            return JSONResponse(status_code=401, content={"message": "Unauthorized"})

        # Possible events: call_started, call_ended, call_analyzed
        event = post_data["event"]
        call_id = post_data["data"]["call_id"]
        if event == "call_started":
            print("Call started:", call_id)
        elif event == "call_ended":
            print("Call ended:", call_id)
        elif event == "call_analyzed":
            print("Call analyzed:", call_id)
        else:
            print("Unknown event:", event)

        return JSONResponse(status_code=200, content={"received": True})
    except Exception as err:
        print(f"Error in webhook: {err}")
        return JSONResponse(status_code=500, content={"message": "Internal Server Error"})

# ------------------------------------------------------------------
# 6) Retell WebSocket endpoint for text-based conversation
# ------------------------------------------------------------------
@app.websocket("/llm-websocket/{call_id}")
async def websocket_handler(websocket: WebSocket, call_id: str):
    try:
        await websocket.accept()
        llm_client = LlmClient()

        # Send optional config to Retell server
        config = ConfigResponse(
            response_type="config",
            config={
                "auto_reconnect": True,
                "call_details": True,
            },
            response_id=1,
        )
        await websocket.send_json(config.dict)

        # Send first message to signal ready of server
        response_id = 0
        first_event = llm_client.draft_begin_message()
        await websocket.send_json(first_event.dict)

        async def handle_message(request_json):
            nonlocal response_id
            try:
                # There are 5 types of interaction_type: call_details, pingpong, update_only, response_required, and reminder_required.
                if request_json["interaction_type"] == "call_details":
                    print(json.dumps(request_json, indent=2))
                    return
                
                if request_json["interaction_type"] == "ping_pong":
                    await websocket.send_json(
                        {
                            "response_type": "ping_pong",
                            "timestamp": request_json["timestamp"],
                        }
                    )
                    return
                
                if request_json["interaction_type"] == "update_only":
                    return

                if (
                    request_json["interaction_type"] == "response_required"
                    or request_json["interaction_type"] == "reminder_required"
                ):
                    current_response_id = request_json["response_id"]
                    request = {
                        "interaction_type": request_json["interaction_type"],
                        "response_id": current_response_id,
                        "transcript": request_json["transcript"],
                    }
                    
                    # Log the incoming request
                    last_transcript = request_json["transcript"][-1]["content"] if request_json["transcript"] else ""
                    print(
                        f"""Received interaction_type={request_json['interaction_type']}, """
                        f"""response_id={current_response_id}, last_transcript={last_transcript}"""
                    )

                    try:
                        async for event in llm_client.draft_response(request):
                            if websocket.client_state == WebSocketState.CONNECTED:
                                await websocket.send_json(event.dict)
                                # Check if we should continue based on response IDs
                                if request["response_id"] < response_id:
                                    break  # new response needed, abandon this one
                            else:
                                print(f"WebSocket disconnected during response for {call_id}")
                                return
                    except Exception as e:
                        print(f"Error during draft_response: {str(e)}")
                        if websocket.client_state == WebSocketState.CONNECTED:
                            await websocket.send_json({
                                "response_type": "update",
                                "content": "I apologize, but I encountered an error. Could you please try again?",
                                "done": True,
                                "response_id": current_response_id,
                                "timestamp": int(time.time() * 1000),
                            })

            except Exception as e:
                print(f"Error in handle_message: {str(e)}")
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json({
                        "response_type": "update",
                        "content": "I apologize, but something went wrong. Please try again.",
                        "done": True,
                        "response_id": request_json.get("response_id", 0),
                        "timestamp": int(time.time() * 1000),
                    })

        while True:
            try:
                data = await websocket.receive_json()
                asyncio.create_task(handle_message(data))
            except WebSocketDisconnect:
                print(f"WebSocket disconnected normally for {call_id}")
                break
            except Exception as e:
                print(f"Error receiving message: {str(e)}")
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.close(1011)
                    except:
                        pass
                break

    except WebSocketDisconnect:
        print(f"WebSocket disconnected for {call_id}")
    except Exception as e:
        print(f"Error in websocket_handler: {str(e)}")
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close(1011, "Server error")
            except:
                pass
    finally:
        print(f"WebSocket connection closed for {call_id}")

@app.get("/llm-websocket/{call_id}")
def health_check(call_id: str):
    return {"status": "OK"}

# ------------------------------------------------------------------
# 7) If you want to run via `python server.py` with uvicorn
# ------------------------------------------------------------------
#if __name__ == "__main__":
    # Typically run on port 8080 (or your preference), matching docs
    #uvicorn.run("server:app", host="0.0.0.0", port=8080, reload=True)
