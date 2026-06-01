import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ALL_STATUSES } from "@/lib/procurements/status";
import type { ProcurementStatus } from "@/lib/procurements/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const workspaceId = sp.get("workspaceId");
  const status = sp.get("status");
  const vertical = sp.get("vertical");
  const limit = Math.min(
    Number.parseInt(sp.get("limit") ?? "200", 10) || 200,
    500,
  );

  const supabase = createServiceClient();
  let q = supabase
    .from("procurements")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (status && ALL_STATUSES.includes(status as ProcurementStatus)) {
    q = q.eq("status", status);
  }
  if (vertical) q = q.eq("vertical", vertical);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ procurements: data ?? [] });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const row = {
    title,
    aop_id:              typeof body.aop_id === "string" && body.aop_id ? body.aop_id : null,
    source:              typeof body.source === "string" && ["cais","manual","open-data"].includes(body.source) ? body.source : "manual",
    source_url:          typeof body.source_url === "string" ? body.source_url : null,
    publisher:           typeof body.publisher === "string" ? body.publisher : null,
    procedure_type:      typeof body.procedure_type === "string" ? body.procedure_type : null,
    estimated_value:     typeof body.estimated_value === "number" ? body.estimated_value : null,
    currency:            typeof body.currency === "string" ? body.currency : "BGN",
    publication_date:    typeof body.publication_date === "string" ? body.publication_date : null,
    submission_deadline: typeof body.submission_deadline === "string" ? body.submission_deadline : null,
    description:         typeof body.description === "string" ? body.description : null,
    workspace_id:        typeof body.workspace_id === "string" ? body.workspace_id : null,
    status:              typeof body.status === "string" && ALL_STATUSES.includes(body.status as ProcurementStatus) ? body.status : "new",
    priority:            typeof body.priority === "number" ? body.priority : 3,
    owner_email:         typeof body.owner_email === "string" ? body.owner_email : null,
    vertical:            typeof body.vertical === "string" ? body.vertical : null,
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("procurements")
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Could not create procurement", detail: error?.message },
      { status: 500 },
    );
  }

  await supabase.from("procurement_events").insert({
    procurement_id: (data as { id: string }).id,
    event_type: "created",
    payload: { source: row.source, workspace_id: row.workspace_id },
  });

  return NextResponse.json({ procurement: data });
}
