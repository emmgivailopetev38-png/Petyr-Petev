import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { renderTemplate } from "@/lib/playbooks/templating";
import { streamHermes } from "@/lib/hermes-client";
import type { Playbook, PlaybookStep } from "@/lib/playbooks/types";
import type { HermesMessage } from "@/lib/hermes-client";

export const maxDuration = 60;

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    playbookId?: string;
    chatId?: string;
    initialInput?: string;
  };

  if (!body.playbookId || !body.chatId) {
    return NextResponse.json(
      { error: "playbookId and chatId are required" },
      { status: 400 },
    );
  }

  const initialInput = body.initialInput ?? "";
  const supabase = createServiceClient();

  // Load playbook + workspace
  const [{ data: playbookData, error: pbErr }, { data: chatData }] = await Promise.all([
    supabase
      .from("playbooks")
      .select("id, workspace_id, name, description, steps")
      .eq("id", body.playbookId)
      .single(),
    supabase
      .from("chats")
      .select("system_prompt")
      .eq("id", body.chatId)
      .single(),
  ]);

  if (pbErr || !playbookData) {
    return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  }

  const playbook = playbookData as unknown as Playbook;
  const systemPrompt = (chatData as { system_prompt: string | null } | null)?.system_prompt ?? null;

  // Create run
  const { data: runData, error: runErr } = await supabase
    .from("playbook_runs")
    .insert({
      playbook_id: playbook.id,
      chat_id: body.chatId,
      state: "running",
      current_step: 0,
      outputs: {},
      initial_input: initialInput,
    })
    .select()
    .single();

  if (runErr || !runData) {
    return NextResponse.json(
      { error: "Could not create run", detail: runErr?.message },
      { status: 500 },
    );
  }

  const runId = (runData as { id: string }).id;

  // Persist a marker user message announcing playbook start
  await supabase.from("messages").insert({
    chat_id: body.chatId,
    role: "user",
    content: `▶️ Стартирам playbook: ${playbook.name}${initialInput ? "\n\nВход:\n" + initialInput : ""}`,
    attachments: [],
  });

  // Execute steps sequentially. Client polls run + reloads messages.
  const stepOutputs: string[] = [];
  const steps = playbook.steps as PlaybookStep[];

  // Kick off async execution (don't await; respond with runId immediately)
  void (async () => {
    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const rendered = renderTemplate(step.prompt, initialInput, stepOutputs);

        const messages: HermesMessage[] = [];
        if (systemPrompt && systemPrompt.trim().length > 0) {
          messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: rendered });

        const { stream, fullText } = await streamHermes({ messages });
        await collectStream(stream); // drain
        const text = await fullText;

        stepOutputs.push(text);

        // Save step result as assistant message with a header
        await supabase.from("messages").insert({
          chat_id: body.chatId,
          role: "assistant",
          content: `**Стъпка ${i + 1}/${steps.length}: ${step.name}**\n\n${text}`,
          attachments: [],
        });

        // Update run progress
        await supabase
          .from("playbook_runs")
          .update({
            current_step: i + 1,
            outputs: Object.fromEntries(
              steps.slice(0, i + 1).map((s, idx) => [s.id, stepOutputs[idx]]),
            ),
          })
          .eq("id", runId);
      }

      // Mark completed
      await supabase
        .from("playbook_runs")
        .update({ state: "completed", completed_at: new Date().toISOString() })
        .eq("id", runId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("playbook_runs")
        .update({
          state: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
  })();

  return NextResponse.json({
    runId,
    playbookName: playbook.name,
    totalSteps: steps.length,
  });
}
