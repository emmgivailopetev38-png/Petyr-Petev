import { createServiceClient } from "@/lib/supabase/server";
import { ProcurementDetail } from "@/app/procurements/[id]/ProcurementDetail";
import type { Procurement, ProcurementNote, ProcurementEvent } from "@/lib/procurements/types";

export const dynamic = "force-dynamic";

export default async function ProcurementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: procurement }, { data: notes }, { data: events }] = await Promise.all([
    supabase.from("procurements").select("*").eq("id", id).single(),
    supabase.from("procurement_notes").select("*").eq("procurement_id", id).order("created_at", { ascending: false }),
    supabase.from("procurement_events").select("*").eq("procurement_id", id).order("occurred_at", { ascending: false }).limit(50),
  ]);

  if (!procurement) {
    return (
      <main style={{ padding: 32 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>
          Процедурата не е намерена
        </h1>
        <a href="/procurements" style={{ color: "var(--color-burgundy-deep)" }}>← Назад към Pipeline</a>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 8,
          borderBottom: "1px solid var(--color-rule-faint)",
        }}
      >
        <a
          href="/procurements"
          style={{
            fontSize: 12,
            color: "var(--color-ink-muted)",
            textDecoration: "none",
            padding: "6px 12px",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
          }}
        >
          ← Pipeline
        </a>
        <a
          href="/"
          style={{
            fontSize: 12,
            color: "var(--color-ink-muted)",
            textDecoration: "none",
            padding: "6px 12px",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
          }}
        >
          Главна
        </a>
      </header>
      <ProcurementDetail
        initial={procurement as Procurement}
        initialNotes={(notes ?? []) as ProcurementNote[]}
        initialEvents={(events ?? []) as ProcurementEvent[]}
      />
    </main>
  );
}
