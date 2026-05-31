import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chunkText } from "@/lib/knowledge/chunker";
import { extractText } from "@/lib/file-extract";
import type { KnowledgeSourceType } from "@/lib/knowledge/types";

export const maxDuration = 60;

const ALLOWED_TYPES: KnowledgeSourceType[] = [
  "document",
  "note",
  "kzk_decision",
  "vas_decision",
  "expert_note",
  "past_offer",
];

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  const workspaceId = form.get("workspaceId");
  const title = form.get("title");
  const sourceTypeRaw = form.get("sourceType");
  const text = form.get("text");
  const file = form.get("file");

  if (typeof workspaceId !== "string" || !workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (typeof title !== "string" || !title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const sourceType: KnowledgeSourceType =
    typeof sourceTypeRaw === "string" &&
    (ALLOWED_TYPES as string[]).includes(sourceTypeRaw)
      ? (sourceTypeRaw as KnowledgeSourceType)
      : "document";

  // Get content
  let content = "";
  if (typeof text === "string" && text.trim().length > 0) {
    content = text;
  } else if (file instanceof Blob && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = file instanceof File ? file.name : "uploaded";
    const extracted = await extractText(buf, file.type || "", filename);
    if (!extracted.ok || !extracted.text) {
      return NextResponse.json(
        { error: extracted.reason ?? "Could not extract text" },
        { status: 400 },
      );
    }
    content = extracted.text;
  } else {
    return NextResponse.json(
      { error: "Either text or file is required" },
      { status: 400 },
    );
  }

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    return NextResponse.json({ error: "No content to chunk" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Create source
  const { data: src, error: srcErr } = await supabase
    .from("knowledge_sources")
    .insert({
      workspace_id: workspaceId,
      source_type: sourceType,
      title,
      metadata: {},
    })
    .select()
    .single();

  if (srcErr || !src) {
    return NextResponse.json(
      { error: "Could not create source", detail: srcErr?.message },
      { status: 500 },
    );
  }

  const sourceId = (src as { id: string }).id;

  // Bulk insert chunks
  const rows = chunks.map((chunkContent, i) => ({
    source_id: sourceId,
    workspace_id: workspaceId,
    chunk_index: i,
    content: chunkContent,
  }));

  const { error: chunksErr } = await supabase.from("knowledge_chunks").insert(rows);
  if (chunksErr) {
    return NextResponse.json(
      { error: "Could not insert chunks", detail: chunksErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sourceId,
    chunkCount: rows.length,
  });
}
