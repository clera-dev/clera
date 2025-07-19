import { NextRequest } from "next/server";
import { Client } from "@langchain/langgraph-sdk";

export const runtime = "edge";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ thread_id: string }> }
) {
  try {
    const { thread_id } = await context.params;
    const body = await req.json();

    const client = new Client({
      apiUrl: process.env.LANGGRAPH_API_UR,
      apiKey: process.env.LANGGRAPH_API_KEY || undefined,
    });

    const history = await client.threads.getHistory(thread_id, body);

    return new Response(JSON.stringify(history), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ thread_id: string }> }
) {
  try {
    const { thread_id } = await context.params;
    const url = new URL(req.url);
    const searchParams = Object.fromEntries(url.searchParams);

    const client = new Client({
      apiUrl: process.env.LANGGRAPH_API_URL || "http://localhost:8123",
      apiKey: process.env.LANGGRAPH_API_KEY || undefined,
    });

    const history = await client.threads.getHistory(thread_id, searchParams);

    return new Response(JSON.stringify(history), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
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