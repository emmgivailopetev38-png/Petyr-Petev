import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    message?: string;
  };

  if (!body.chatId) {
    return NextResponse.json(
      { error: "chatId is required" },
      { status: 400 }
    );
  }
  if (!body.message) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  const { chatId, message } = body;
  const supabase = createServiceClient();

  // Persist user message
  await supabase.from("messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
  });

  // Load last 50 messages as context
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(50);

  const contextMessages = (history ?? []) as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  const openai = new OpenAI({
    baseURL: process.env.HERMES_BASE_URL,
    apiKey: process.env.HERMES_API_KEY!,
  });

  let stream;
  try {
    stream = await openai.chat.completions.create({
      model: "hermes",
      stream: true,
      messages: contextMessages,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Hermes call failed";
    return NextResponse.json(
      { error: "Hermes unavailable", detail },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  let fullContent = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            fullContent += text;
            controller.enqueue(encoder.encode(text));
          }
        }
        // Persist assistant reply
        await supabase.from("messages").insert({
          chat_id: chatId,
          role: "assistant",
          content: fullContent,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
