import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { HISTORY_LIMIT, STORAGE_BUCKET } from "@/lib/files";
import { extractOutputUrls, urlsToAttachments } from "@/lib/output-urls";
import { extractText } from "@/lib/file-extract";
import { streamHermes, type HermesMessage } from "@/lib/hermes-client";
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

  // Fetch workspace system prompt
  const { data: chatRow } = await supabase
    .from("chats")
    .select("system_prompt")
    .eq("id", chatId)
    .single();
  const systemPrompt = (chatRow as { system_prompt: string | null } | null)?.system_prompt ?? null;

  // Persist user message with attachments
  await supabase.from("messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
    attachments,
  });

  // Server-side: download each attachment, extract text, inline in user message
  let attachmentBlock = "";
  if (attachments.length > 0) {
    const sections: string[] = [];
    for (const a of attachments) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(a.path);
      if (error || !data) {
        sections.push(
          `=== Файл: ${a.filename} (${a.mime}, ${a.size} bytes) ===\n[Файлът не можа да бъде свален от хранилището: ${error?.message ?? "неизвестна грешка"}]\n=== Край на файла ===`,
        );
        continue;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      const extracted = await extractText(buffer, a.mime, a.filename);
      if (extracted.ok && extracted.text !== undefined) {
        const truncatedNote = extracted.truncated
          ? `\n\n[... съкратено, общо ${extracted.originalLength} символа в оригиналния файл]`
          : "";
        sections.push(
          `=== Файл: ${a.filename} (${a.mime}, ${a.size} bytes) ===\n${extracted.text}${truncatedNote}\n=== Край на файла ===`,
        );
      } else {
        sections.push(
          `=== Файл: ${a.filename} (${a.mime}, ${a.size} bytes) ===\n[${extracted.reason ?? "Съдържанието не можа да бъде извлечено"}]\n=== Край на файла ===`,
        );
      }
    }
    attachmentBlock = `Потребителят прикачи файлове. По-долу е извлеченото съдържание. Отговори на база на това съдържание.\n\n${sections.join(
      "\n\n",
    )}\n\n---\n\nСъобщение на потребителя: ${message}`;
  }

  const outboundContent = attachmentBlock || message;

  // Load up to HISTORY_LIMIT messages for context
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  const contextMessages = ((history ?? []) as Array<{ role: "user" | "assistant"; content: string }>).slice(
    0,
    -1, // drop the just-inserted user row; replace with augmented version
  );
  contextMessages.push({ role: "user", content: outboundContent });

  // Compose messages: optional system + optional RAG context + history
  const messages: HermesMessage[] = [];
  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // Try to retrieve relevant knowledge chunks
  try {
    const { searchKnowledge } = await import("@/lib/knowledge/search");
    const chunks = await searchKnowledge(chatId, message, 3);
    if (chunks.length > 0) {
      const contextBlock = chunks
        .map((c, i) => `[Източник ${i + 1}]\n${c.content}`)
        .join("\n\n---\n\n");
      messages.push({
        role: "system",
        content: `Релевантна база знания за този въпрос:\n\n${contextBlock}\n\nИзползвай тази информация, когато е приложима. Ако цитираш, посочи кой източник.`,
      });
    }
  } catch {
    // ignore if search fails
  }

  for (const m of contextMessages) {
    messages.push({ role: m.role, content: m.content });
  }

  const { stream, fullText } = await streamHermes({ messages });

  // Persist assistant message after stream completes (in parallel with delivery)
  fullText.then(async (text) => {
    const outputUrls = extractOutputUrls(text);
    const outputAttachments = await urlsToAttachments(outputUrls);
    await supabase.from("messages").insert({
      chat_id: chatId,
      role: "assistant",
      content: text,
      attachments: outputAttachments,
    });
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
