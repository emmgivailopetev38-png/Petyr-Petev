import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { HISTORY_LIMIT, STORAGE_BUCKET } from "@/lib/files";
import { extractOutputUrls, urlsToAttachments } from "@/lib/output-urls";
import type { Attachment } from "@/lib/types";

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_URL ??
  "https://zopexpert.vercel.app";

function normaliseAppUrl(): string {
  const v = PUBLIC_BASE_URL.startsWith("http")
    ? PUBLIC_BASE_URL
    : `https://${PUBLIC_BASE_URL}`;
  return v.replace(/\/$/, "");
}

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

  // Build signed download URLs for any attachments
  let attachmentBlock = "";
  if (attachments.length > 0) {
    const signedLines: string[] = [];
    for (const a of attachments) {
      const { data } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(a.path, 60 * 60);
      if (data?.signedUrl) {
        signedLines.push(`- ${a.filename} (${a.mime}, ${a.size} bytes) → ${data.signedUrl}`);
      }
    }
    attachmentBlock = signedLines.length
      ? `[ZOPEXPERT context]\nYou have file tools (terminal, Python). The user attached the following files. Download with curl:\n${signedLines.join(
          "\n"
        )}\n\nTools available: pdfplumber, python-docx, openpyxl, pandas, Pillow+tesseract, reportlab, weasyprint.\n\nIf you generate output files, upload them with:\ncurl -X POST ${normaliseAppUrl()}/api/hermes-upload -H "Authorization: Bearer $HERMES_UPLOAD_TOKEN" -F "file=@/tmp/output" -F "filename=<name>"\nThe response JSON contains a "url" field — include that URL verbatim in your reply so the UI renders a download button.\n\n---\n\nUser message: ${message}`
      : "";
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
