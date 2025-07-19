import { NextRequest } from "next/server";
import { Client } from "@langchain/langgraph-sdk";

//export const runtime = "edge";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ thread_id: string }> }
) {
  try {
    const { thread_id } = await context.params;
    const body = await req.json();

    console.log('🔧 API Route Debug:', {
      thread_id,
      body,
      LANGGRAPH_API_URL: process.env.LANGGRAPH_API_URL,
      LANGGRAPH_API_KEY: process.env.LANGGRAPH_API_KEY ? '***' : 'undefined',
      LANGGRAPH_ASSISTANT_ID: process.env.LANGGRAPH_ASSISTANT_ID
    });

    const client = new Client({
      apiUrl: process.env.LANGGRAPH_API_URL,
      apiKey: process.env.LANGGRAPH_API_KEY || undefined,
    });

    // Use the stream_mode from the request body if provided, otherwise default
    const streamMode = body.stream_mode || ["updates", "custom"];
    
    console.log('🔧 Using stream mode:', streamMode);
    
    const stream = client.runs.stream(
      thread_id,
      process.env.LANGGRAPH_ASSISTANT_ID || "agent",
      { 
        ...body,
        streamMode: streamMode
      }
    );

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              console.log('📦 Stream chunk received:', chunk);
              
              // The LangGraph SDK expects a specific SSE format
              // Just send the chunk as-is without wrapping it in event/data format
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            }
            controller.close();
          } catch (error) {
            console.error("Streaming error:", error);
            controller.error(error);
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("API route error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
} 