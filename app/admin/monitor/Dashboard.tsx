"use client";

import { useEffect, useState } from "react";
import type { Procedure, Briefing } from "@/lib/monitor/types";

const VERTICAL_LABELS: Record<string, string> = {
  food: "🍎 Храни",
  construction: "🏗️ Строителство",
  supervision: "👷 Надзор",
  deliveries: "📦 Доставки",
  services: "🛠️ Услуги",
  framework: "📄 Рамкови",
};

export function Dashboard() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [verticalFilter, setVerticalFilter] = useState<string>("");
  const [minRisk, setMinRisk] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Procedure | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (verticalFilter) q.set("vertical", verticalFilter);
      if (minRisk > 0) q.set("minRisk", String(minRisk));
      const [pr, br] = await Promise.all([
        fetch(`/api/monitor/procedures?${q}`).then(
          (r) => r.json() as Promise<{ procedures: Procedure[] }>,
        ),
        fetch(`/api/monitor/briefings`).then(
          (r) => r.json() as Promise<{ briefings: Briefing[] }>,
        ),
      ]);
      setProcedures(pr.procedures);
      setBriefings(br.briefings);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalFilter, minRisk]);

  async function runNow() {
    setRunning(true);
    try {
      await fetch("/api/cron/daily-monitor");
      await loadAll();
    } finally {
      setRunning(false);
    }
  }

  const todaysBriefings = briefings.filter(
    (b) => b.briefing_date === new Date().toISOString().slice(0, 10),
  );

  return (
    <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
      <aside
        style={{
          width: 280,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <section
          style={{
            background: "var(--color-bg-deep)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={labelStyle}>Филтри</span>
          <select
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="">Всички вертикали</option>
            {Object.entries(VERTICAL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            Минимален риск: {minRisk}
          </label>
          <input
            type="range"
            min={0}
            max={10}
            value={minRisk}
            onChange={(e) => setMinRisk(Number.parseInt(e.target.value, 10))}
          />
          <button onClick={runNow} disabled={running} style={primaryBtn}>
            {running ? "Изпълнение..." : "Пусни сега"}
          </button>
        </section>
        <section
          style={{
            background: "var(--color-bg-deep)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={labelStyle}>Днешен брифинг</span>
          {todaysBriefings.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              Все още няма генериран брифинг за днес.
            </div>
          )}
          {todaysBriefings.map((b) => (
            <div
              key={b.id}
              style={{
                background: "var(--color-bg-glass)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: 10,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {VERTICAL_LABELS[b.vertical ?? ""] ?? b.vertical}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                {b.new_count} нови · {b.high_risk_count} рискови
              </div>
              {b.summary && (
                <div
                  style={{
                    marginTop: 6,
                    whiteSpace: "pre-wrap",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {b.summary}
                </div>
              )}
            </div>
          ))}
        </section>
      </aside>
      <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 12 }}>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {loading && (
            <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
              Зареждане...
            </div>
          )}
          {!loading && procedures.length === 0 && (
            <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
              Няма процедури за тези филтри.
            </div>
          )}
          {procedures.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              style={{
                ...cardStyle,
                borderColor:
                  p.risk_level >= 7
                    ? "rgba(239,68,68,0.4)"
                    : p.risk_level >= 4
                      ? "rgba(245,158,11,0.4)"
                      : "var(--color-border)",
                background:
                  selected?.id === p.id
                    ? "var(--color-accent-violet)"
                    : "var(--color-bg-deep)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>
                  {p.vertical ? (VERTICAL_LABELS[p.vertical]?.split(" ")[0] ?? "📋") : "📋"}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background:
                      p.risk_level >= 7
                        ? "rgba(239,68,68,0.2)"
                        : p.risk_level >= 4
                          ? "rgba(245,158,11,0.2)"
                          : "rgba(34,197,94,0.2)",
                    color:
                      p.risk_level >= 7
                        ? "#ef4444"
                        : p.risk_level >= 4
                          ? "#f59e0b"
                          : "#22c55e",
                  }}
                >
                  Риск {p.risk_level}/10
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {p.publisher ?? "?"}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                Стойност: {p.estimated_value?.toLocaleString("bg-BG") ?? "?"} лв. · Срок:{" "}
                {p.deadline ? new Date(p.deadline).toLocaleDateString("bg-BG") : "—"}
              </div>
            </button>
          ))}
        </div>
        {selected && (
          <aside
            style={{
              width: 420,
              background: "var(--color-bg-deep)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: 16,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={labelStyle}>Детайли</span>
              <button onClick={() => setSelected(null)} style={closeBtn}>
                ✕
              </button>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{selected.title}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              {selected.publisher} · {selected.aop_id} ·{" "}
              {selected.estimated_value?.toLocaleString("bg-BG") ?? "?"} лв.
            </div>
            <section>
              <span style={labelStyle}>Бележки за риск</span>
              <p style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                {selected.risk_notes ?? "—"}
              </p>
            </section>
            {selected.draft_appeal && (
              <section>
                <span style={labelStyle}>Чернова на жалба</span>
                <pre
                  style={{
                    fontSize: 11,
                    marginTop: 4,
                    whiteSpace: "pre-wrap",
                    background: "var(--color-bg-glass)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    padding: 10,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {selected.draft_appeal}
                </pre>
              </section>
            )}
            {selected.raw_summary && (
              <section>
                <span style={labelStyle}>Резюме</span>
                <p
                  style={{
                    fontSize: 11,
                    marginTop: 4,
                    lineHeight: 1.5,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {selected.raw_summary}
                </p>
              </section>
            )}
            {selected.source_url && (
              <a
                href={selected.source_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 12,
                  color: "var(--color-accent-cyan)",
                  textDecoration: "underline",
                }}
              >
                Виж в aop.bg →
              </a>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-input)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  color: "var(--color-text-primary)",
  fontSize: 12,
  padding: "6px 10px",
  outline: "none",
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--color-accent-violet)",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-text-tertiary)",
  cursor: "pointer",
  fontSize: 12,
};

const cardStyle: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "12px 14px",
  cursor: "pointer",
  color: "var(--color-text-primary)",
};
