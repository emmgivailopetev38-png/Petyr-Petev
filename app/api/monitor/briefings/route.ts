import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const supabase = createServiceClient();

  let q = supabase
    .from("daily_briefings")
    .select("*")
    .order("briefing_date", { ascending: false })
    .order("vertical", { ascending: true })
    .limit(20);

  if (date) {
    q = q.eq("briefing_date", date);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ briefings: data ?? [] });
}
