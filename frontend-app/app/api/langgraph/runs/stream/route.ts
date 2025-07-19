import { NextRequest } from "next/server";
import { Client } from "@langchain/langgraph-sdk";

//export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const client = new Client({
      apiUrl: process.env.LANGGRAPH_API_URL,
      apiKey: process.env.LANGGRAPH_API_KEY || undefined,
    });

    const stream = client.runs.stream(
      null, // No thread_id for stateless runs
      process.env.LANGGRAPH_ASSISTANT_ID || "agent",
              { 
          ...body,
          streamMode: ["updates", "custom"]
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