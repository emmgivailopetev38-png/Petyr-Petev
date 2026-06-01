import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ALL_STATUSES } from "@/lib/procurements/status";
import type { ProcurementStatus } from "@/lib/procurements/types";

const ALLOWED_PATCH_FIELDS = [
  "title",
  "publisher",
  "procedure_type",
  "estimated_value",
  "currency",
  "publication_date",
  "submission_deadline",
  "description",
  "workspace_id",
  "status",
  "priority",
  "owner_email",
  "go_no_go_notes",
  "risk_level",
  "risk_notes",
  "draft_appeal",
  "vertical",
  "linked_chat_id",
] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: procurement }, { data: notes }, { data: tasks }, { data: events }] = await Promise.all([
    supabase.from("procurements").select("*").eq("id", id).single(),
    supabase.from("procurement_notes").select("*").eq("procurement_id", id).order("created_at", { ascending: false }),
    supabase.from("procurement_tasks").select("*").eq("procurement_id", id).order("due_date", { ascending: true }),
    supabase.from("procurement_events").select("*").eq("procurement_id", id).order("occurred_at", { ascending: false }).limit(50),
  ]);

  if (!procurement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    procurement,
    notes: notes ?? [],
    tasks: tasks ?? [],
    events: events ?? [],
  });
}

export async function PATCH(
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

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_PATCH_FIELDS) {
    if (key in body) {
      const value = body[key];
      if (key === "status" && typeof value === "string") {
        if (!ALL_STATUSES.includes(value as ProcurementStatus)) {
          return NextResponse.json({ error: `Invalid status: ${value}` }, { status: 400 });
        }
      }
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: prev } = await supabase
    .from("procurements")
    .select("status")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("procurements")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  if (updates.status && prev && (prev as { status: string }).status !== updates.status) {
    await supabase.from("procurement_events").insert({
      procurement_id: id,
      event_type: "status_change",
      payload: { from: (prev as { status: string }).status, to: updates.status },
    });
  }

  return NextResponse.json({ procurement: data });
}
