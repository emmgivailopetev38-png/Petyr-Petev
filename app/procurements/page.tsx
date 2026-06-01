import { createServiceClient } from "@/lib/supabase/server";
import { ProcurementsBoard } from "@/app/procurements/ProcurementsBoard";
import type { Procurement } from "@/lib/procurements/types";

export const dynamic = "force-dynamic";

export default async function ProcurementsPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("procurements")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  const procurements = (data ?? []) as Procurement[];

  return (
    <main
      style={{
        height: "100vh",
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
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingBottom: 14,
          borderBottom: "1px solid var(--color-rule-faint)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: "0.015em",
              color: "var(--color-ink-near-black)",
              lineHeight: 1,
            }}
          >
            Pipeline
          </h1>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.22em",
              color: "var(--color-ink-faint)",
              textTransform: "uppercase",
            }}
          >
            процедури · {procurements.length}
          </span>
        </div>
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
          ← Назад
        </a>
        <div
          style={{
            position: "absolute",
            bottom: -1,
            left: 0,
            width: 84,
            height: 2,
            background: "linear-gradient(90deg, var(--color-gold-warm) 0%, var(--color-gold-pale) 100%)",
          }}
        />
      </header>
      <ProcurementsBoard initial={procurements} />
    </main>
  );
}
