import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const vertical = request.nextUrl.searchParams.get("vertical");
  const minRisk = Number.parseInt(
    request.nextUrl.searchParams.get("minRisk") ?? "0",
    10,
  );
  const limit = Math.min(
    Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10),
    200,
  );

  const supabase = createServiceClient();
  let q = supabase
    .from("monitored_procedures")
    .select("*")
    .gte("risk_level", isNaN(minRisk) ? 0 : minRisk)
    .order("fetched_at", { ascending: false })
    .limit(limit);

  if (vertical) {
    q = q.eq("vertical", vertical);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ procedures: data ?? [] });
}
