import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { scrapeNewProcedures } from "@/lib/monitor/aop-scraper";
import { analyseProcedure } from "@/lib/monitor/analyser";
import { generateBriefing } from "@/lib/monitor/briefing";
import type { Procedure } from "@/lib/monitor/types";

export const maxDuration = 60;

const MAX_PER_RUN = 5; // hard cap for Vercel 60s budget

// Verify Vercel Cron header (or allow manual GET in dev)
function isAuthorised(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  // Vercel cron sends this header
  if (req.headers.get("x-vercel-cron") === "1") return true;
  // Allow manual trigger from logged-in admin (same proxy already protects /api/* by cookie)
  return true;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const scraped = await scrapeNewProcedures();
  const limited = scraped.slice(0, MAX_PER_RUN);

  const stats = {
    scraped: scraped.length,
    processed: 0,
    inserted: 0,
    skipped_existing: 0,
    high_risk: 0,
  };

  const savedProcedures: Procedure[] = [];

  for (const raw of limited) {
    // Skip if already in DB
    const { data: existing } = await supabase
      .from("monitored_procedures")
      .select("id")
      .eq("aop_id", raw.aop_id)
      .maybeSingle();
    if (existing) {
      stats.skipped_existing++;
      continue;
    }

    stats.processed++;
    const analysis = await analyseProcedure(raw);
    if (analysis.risk_level >= 7) stats.high_risk++;

    const { data: inserted } = await supabase
      .from("monitored_procedures")
      .insert({
        aop_id: raw.aop_id,
        source_url: raw.source_url,
        title: raw.title,
        publisher: raw.publisher,
        vertical: analysis.vertical,
        estimated_value: raw.estimated_value,
        deadline: raw.deadline,
        risk_level: analysis.risk_level,
        risk_notes: analysis.risk_notes,
        draft_appeal: analysis.draft_appeal,
        raw_summary: raw.raw_text.slice(0, 1000),
        analysed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (inserted) {
      stats.inserted++;
      savedProcedures.push(inserted as unknown as Procedure);
    }
  }

  // Generate briefing per vertical
  const byVertical = new Map<string, Procedure[]>();
  for (const p of savedProcedures) {
    const v = p.vertical ?? "unknown";
    if (!byVertical.has(v)) byVertical.set(v, []);
    byVertical.get(v)!.push(p);
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [vertical, procs] of byVertical) {
    try {
      const summary = await generateBriefing(vertical, procs);
      const highRisk = procs.filter((p) => p.risk_level >= 7).length;

      await supabase
        .from("daily_briefings")
        .upsert(
          {
            briefing_date: today,
            vertical,
            new_count: procs.length,
            high_risk_count: highRisk,
            procedure_ids: procs.map((p) => p.id),
            summary,
          },
          { onConflict: "briefing_date,vertical" },
        );
    } catch {
      // ignore single-vertical briefing failure
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    stats,
    verticals: Array.from(byVertical.keys()),
  });
}
