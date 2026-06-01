import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("workspace_monitor_subscriptions")
    .select("*")
    .eq("workspace_id", id)
    .maybeSingle();
  return NextResponse.json({ subscription: data ?? null });
}

export async function PUT(
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

  const row = {
    workspace_id: id,
    enabled: typeof body.enabled === "boolean" ? body.enabled : true,
    vertical_filter: typeof body.vertical_filter === "string" ? body.vertical_filter : null,
    min_value: typeof body.min_value === "number" ? body.min_value : null,
    max_value: typeof body.max_value === "number" ? body.max_value : null,
    updated_at: new Date().toISOString(),
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("workspace_monitor_subscriptions")
    .upsert(row, { onConflict: "workspace_id" })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ subscription: data });
}
