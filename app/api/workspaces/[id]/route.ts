import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type Patch = {
  title?: string;
  icon?: string;
  welcome_message?: string;
  system_prompt?: string;
};

const ALLOWED_FIELDS: Array<keyof Patch> = ["title", "icon", "welcome_message", "system_prompt"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let body: Patch;
  try {
    body = (await request.json()) as Patch;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Patch = {};
  for (const key of ALLOWED_FIELDS) {
    const v = body[key];
    if (typeof v === "string") {
      updates[key] = v;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("chats")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chat: data });
}
