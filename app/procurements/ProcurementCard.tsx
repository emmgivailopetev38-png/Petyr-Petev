"use client";

import type { Procurement } from "@/lib/procurements/types";

const VERTICAL_ICONS: Record<string, string> = {
  food: "🍎",
  construction: "🏗️",
  supervision: "👷",
  deliveries: "📦",
  services: "🛠️",
  framework: "📄",
  zop_expert_test: "🧪",
};

type Props = {
  p: Procurement;
  onClick: () => void;
};

export function ProcurementCard({ p, onClick }: Props) {
  const daysToDeadline = p.submission_deadline
    ? Math.floor(
        (new Date(p.submission_deadline).getTime() - Date.now()) / 86400000,
      )
    : null;

  const deadlineColor =
    daysToDeadline === null
      ? "var(--color-ink-faint)"
      : daysToDeadline < 0
        ? "var(--color-error)"
        : daysToDeadline <= 3
          ? "var(--color-error)"
          : daysToDeadline <= 7
            ? "var(--color-warning)"
            : "var(--color-ink-muted)";

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: "var(--color-paper-cream)",
        border: "1px solid var(--color-rule-soft)",
        borderLeft: "2px solid var(--color-burgundy-deep)",
        borderRadius: 3,
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        color: "var(--color-ink-charcoal)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {p.vertical && VERTICAL_ICONS[p.vertical] && (
          <span style={{ fontSize: 14 }}>{VERTICAL_ICONS[p.vertical]}</span>
        )}
        {p.aop_id && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--color-ink-faint)", letterSpacing: "0.08em" }}>
            {p.aop_id}
          </span>
        )}
        {p.risk_level !== null && p.risk_level !== undefined && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 2,
              background:
                p.risk_level >= 7
                  ? "rgba(139, 26, 26, 0.12)"
                  : p.risk_level >= 4
                    ? "rgba(179, 128, 31, 0.14)"
                    : "rgba(74, 107, 63, 0.14)",
              color:
                p.risk_level >= 7
                  ? "var(--color-error)"
                  : p.risk_level >= 4
                    ? "var(--color-warning)"
                    : "var(--color-success)",
            }}
          >
            {p.risk_level}/10
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.35,
          color: "var(--color-ink-near-black)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}
      >
        {p.title}
      </div>
      {p.publisher && (
        <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
          {p.publisher}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)" }}>
        <span>{p.estimated_value?.toLocaleString("bg-BG") ?? "—"} {p.currency}</span>
        <span style={{ color: deadlineColor, fontWeight: 600 }}>
          {daysToDeadline === null
            ? "няма срок"
            : daysToDeadline < 0
              ? "просрочена"
              : `${daysToDeadline}д`}
        </span>
      </div>
    </button>
  );
}
