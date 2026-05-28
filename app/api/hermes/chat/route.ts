import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { HISTORY_LIMIT, STORAGE_BUCKET } from "@/lib/files";
import { extractOutputUrls, urlsToAttachments } from "@/lib/output-urls";
import { extractText } from "@/lib/file-extract";
import type { Attachment } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    message?: string;
    attachments?: Attachment[];
  };

  if (!body.chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }
  if (!body.message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const { chatId, message } = body;
  const attachments = body.attachments ?? [];
  const supabase = createServiceClient();

  // Persist user message with attachments
  await supabase.from("messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
    attachments,
  });

  // Server-side: download each attachment from Supabase Storage and extract text
  let attachmentBlock = "";
  if (attachments.length > 0) {
    const sections: string[] = [];
    for (const a of attachments) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(a.path);
      if (error || !data) {
        sections.push(
          `=== File: ${a.filename} (${a.mime}, ${a.size} bytes) ===\n[Could not download from storage: ${error?.message ?? "unknown"}]\n=== End of file ===`
        );
        continue;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      const extracted = await extractText(buffer, a.mime, a.filename);
      if (extracted.ok && extracted.text !== undefined) {
        const truncatedNote = extracted.truncated
          ? `\n\n[... truncated, total ${extracted.originalLength} characters in original file]`
          : "";
        sections.push(
          `=== File: ${a.filename} (${a.mime}, ${a.size} bytes) ===\n${extracted.text}${truncatedNote}\n=== End of file ===`
        );
      } else {
        sections.push(
          `=== File: ${a.filename} (${a.mime}, ${a.size} bytes) ===\n[${extracted.reason ?? "Could not extract content"}]\n=== End of file ===`
        );
      }
    }
    attachmentBlock = `[ZOPEXPERT context]\nThe user attached files. Below is the extracted text content. Respond based on this content. Answer in the user's language.\n\n${sections.join(
      "\n\n"
    )}\n\n---\n\nUser message: ${message}`;
  }

  const outboundContent = attachmentBlock || message;

  // Load up to 200 messages for context
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  const contextMessages = ((history ?? []) as Array<{ role: "user" | "assistant"; content: string }>).slice(
    0,
    -1 // drop the just-inserted user row; replace with augmented version
  );
  contextMessages.push({ role: "user", content: outboundContent });

  const openai = new OpenAI({
    baseURL: process.env.HERMES_BASE_URL,
    apiKey: process.env.HERMES_API_KEY!,
  });

  let stream;
  try {
    stream = await openai.chat.completions.create({
      model: "hermes-agent",
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
        const outputUrls = extractOutputUrls(fullContent);
        const outputAttachments = await urlsToAttachments(outputUrls);
        await supabase.from("messages").insert({
          chat_id: chatId,
          role: "assistant",
          content: fullContent,
          attachments: outputAttachments,
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
