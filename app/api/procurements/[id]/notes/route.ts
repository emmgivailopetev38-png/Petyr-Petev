import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const authorEmail = typeof body.author_email === "string" ? body.author_email : null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("procurement_notes")
    .insert({ procurement_id: id, content, author_email: authorEmail })
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  await supabase.from("procurement_events").insert({
    procurement_id: id,
    event_type: "note_added",
    payload: { note_id: (data as { id: string }).id },
    actor_email: authorEmail,
  });

  return NextResponse.json({ note: data });
}
