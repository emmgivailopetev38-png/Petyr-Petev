"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProcurementCard } from "@/app/procurements/ProcurementCard";
import {
  STATUS_LABELS,
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
} from "@/lib/procurements/status";
import type { Procurement, ProcurementStatus } from "@/lib/procurements/types";

type Props = {
  initial: Procurement[];
};

export function ProcurementsBoard({ initial }: Props) {
  const [list] = useState<Procurement[]>(initial);
  const [showClosed, setShowClosed] = useState(false);
  const router = useRouter();

  const statuses = showClosed
    ? [...ACTIVE_STATUSES, ...CLOSED_STATUSES]
    : ACTIVE_STATUSES;

  const grouped = new Map<ProcurementStatus, Procurement[]>();
  for (const s of statuses) grouped.set(s, []);
  for (const p of list) {
    if (grouped.has(p.status)) grouped.get(p.status)!.push(p);
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          marginBottom: 12,
          gap: 12,
          flexShrink: 0,
        }}
      >
        <label style={{ fontSize: 11, color: "var(--color-ink-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Покажи приключени
        </label>
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${statuses.length}, minmax(220px, 1fr))`,
          gap: 12,
          overflowX: "auto",
          minHeight: 0,
        }}
      >
        {statuses.map((s) => {
          const items = grouped.get(s) ?? [];
          return (
            <section
              key={s}
              style={{
                background: "var(--color-paper-warm)",
                border: "1px solid var(--color-rule-faint)",
                borderRadius: 4,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ink-charcoal)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {STATUS_LABELS[s]}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-ink-faint)" }}>
                  {items.length}
                </span>
              </header>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {items.map((p) => (
                  <ProcurementCard key={p.id} p={p} onClick={() => router.push(`/procurements/${p.id}`)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
