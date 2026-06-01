"use client";

import { useState } from "react";
import { ALL_STATUSES, STATUS_LABELS } from "@/lib/procurements/status";
import type {
  Procurement,
  ProcurementNote,
  ProcurementEvent,
  ProcurementStatus,
} from "@/lib/procurements/types";

type Props = {
  initial: Procurement;
  initialNotes: ProcurementNote[];
  initialEvents: ProcurementEvent[];
};

type Tab = "overview" | "notes";

export function ProcurementDetail({ initial, initialNotes, initialEvents }: Props) {
  const [p, setP] = useState<Procurement>(initial);
  const [notes, setNotes] = useState<ProcurementNote[]>(initialNotes);
  const [events, setEvents] = useState<ProcurementEvent[]>(initialEvents);
  const [tab, setTab] = useState<Tab>("overview");

  async function updateField(updates: Partial<Procurement>) {
    const resp = await fetch(`/api/procurements/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      const j = (await resp.json()) as { procurement: Procurement };
      setP(j.procurement);
      const er = await fetch(`/api/procurements/${p.id}`);
      if (er.ok) {
        const ej = (await er.json()) as { events: ProcurementEvent[] };
        setEvents(ej.events);
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: 16,
          background: "var(--color-paper-cream)",
          border: "1px solid var(--color-rule-soft)",
          borderTop: "3px solid var(--color-burgundy-deep)",
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--color-ink-near-black)", lineHeight: 1.3 }}>
            {p.title}
          </h1>
          <select
            value={p.status}
            onChange={(e) => updateField({ status: e.target.value as ProcurementStatus })}
            style={{
              background: "#FFFAF0",
              border: "1px solid var(--color-rule-soft)",
              borderRadius: 3,
              padding: "6px 10px",
              fontSize: 12,
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              color: "var(--color-ink-charcoal)",
            }}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: "var(--color-ink-muted)" }}>
          <Meta label="AOP ID" value={p.aop_id ?? "—"} mono />
          <Meta label="Възложител" value={p.publisher ?? "—"} />
          <Meta label="Стойност" value={p.estimated_value ? `${p.estimated_value.toLocaleString("bg-BG")} ${p.currency}` : "—"} />
          <Meta label="Срок" value={p.submission_deadline ? new Date(p.submission_deadline).toLocaleString("bg-BG") : "—"} />
        </div>
      </div>

      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-rule-faint)", flexShrink: 0 }}>
        {(["overview","notes"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "transparent",
              border: "none",
              padding: "10px 16px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              color: tab === t ? "var(--color-burgundy-deep)" : "var(--color-ink-muted)",
              borderBottom: tab === t ? "2px solid var(--color-burgundy-deep)" : "2px solid transparent",
              cursor: "pointer",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {t === "overview" ? "Преглед" : "Бележки"}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "overview" && <OverviewTab p={p} events={events} onPatch={updateField} />}
        {tab === "notes" && <NotesTab procurementId={p.id} notes={notes} setNotes={setNotes} />}
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-faint)" }}>
        {label}
      </span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-body)", fontSize: 12, color: "var(--color-ink-charcoal)" }}>
        {value}
      </span>
    </div>
  );
}

function OverviewTab({ p, events, onPatch }: { p: Procurement; events: ProcurementEvent[]; onPatch: (u: Partial<Procurement>) => void | Promise<void> }) {
  const [notes, setNotes] = useState(p.go_no_go_notes ?? "");
  return (
    <div style={{ display: "flex", gap: 16, padding: "12px 0" }}>
      <section style={{ flex: 1 }}>
        <h2 style={sectionTitle}>Описание</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--color-ink-charcoal)", whiteSpace: "pre-wrap" }}>
          {p.description ?? "Няма описание."}
        </p>
        <h2 style={{ ...sectionTitle, marginTop: 24 }}>Go / No-Go бележки</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (p.go_no_go_notes ?? "")) onPatch({ go_no_go_notes: notes });
          }}
          rows={5}
          style={{
            width: "100%",
            background: "#FFFAF0",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
            padding: "10px 12px",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--color-ink-charcoal)",
            resize: "vertical",
            outline: "none",
          }}
        />
        {p.risk_notes && (
          <>
            <h2 style={{ ...sectionTitle, marginTop: 24 }}>Hermes анализ на риска</h2>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--color-ink-charcoal)", whiteSpace: "pre-wrap" }}>
              {p.risk_notes}
            </p>
          </>
        )}
        {p.draft_appeal && (
          <>
            <h2 style={{ ...sectionTitle, marginTop: 24 }}>Чернова на жалба</h2>
            <pre
              style={{
                background: "var(--color-paper-warm)",
                border: "1px solid var(--color-rule-soft)",
                borderRadius: 3,
                padding: 12,
                fontFamily: "var(--font-body)",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                color: "var(--color-ink-charcoal)",
                lineHeight: 1.6,
              }}
            >
              {p.draft_appeal}
            </pre>
          </>
        )}
      </section>
      <aside style={{ width: 280, flexShrink: 0 }}>
        <h2 style={sectionTitle}>История</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {events.length === 0 && (
            <li style={{ fontSize: 11, color: "var(--color-ink-faint)" }}>Няма още събития.</li>
          )}
          {events.map((e) => (
            <li
              key={e.id}
              style={{
                background: "var(--color-paper-warm)",
                border: "1px solid var(--color-rule-faint)",
                borderLeft: "2px solid var(--color-gold-warm)",
                borderRadius: 3,
                padding: "8px 10px",
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--color-ink-charcoal)" }}>{e.event_type}</div>
              <div style={{ color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                {new Date(e.occurred_at).toLocaleString("bg-BG")}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function NotesTab({ procurementId, notes, setNotes }: { procurementId: string; notes: ProcurementNote[]; setNotes: (n: ProcurementNote[]) => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function append() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch(`/api/procurements/${procurementId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (resp.ok) {
        const j = (await resp.json()) as { note: ProcurementNote };
        setNotes([j.note, ...notes]);
        setDraft("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 0" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Добави бележка..."
          rows={3}
          style={{
            flex: 1,
            background: "#FFFAF0",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
            padding: "10px 12px",
            fontSize: 13,
            fontFamily: "var(--font-body)",
            resize: "vertical",
            outline: "none",
          }}
        />
        <button
          onClick={append}
          disabled={saving || !draft.trim()}
          style={{
            background: "var(--color-burgundy-deep)",
            border: "none",
            borderRadius: 3,
            color: "var(--color-paper-cream)",
            padding: "0 16px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: !draft.trim() ? 0.4 : 1,
            alignSelf: "stretch",
          }}
        >
          Добави
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.length === 0 && (
          <li style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>Все още няма бележки.</li>
        )}
        {notes.map((n) => (
          <li
            key={n.id}
            style={{
              background: "var(--color-paper-cream)",
              border: "1px solid var(--color-rule-soft)",
              borderLeft: "2px solid var(--color-burgundy-deep)",
              borderRadius: 3,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              color: "var(--color-ink-charcoal)",
            }}
          >
            <div>{n.content}</div>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)", marginTop: 6 }}>
              {new Date(n.created_at).toLocaleString("bg-BG")}
              {n.author_email ? ` · ${n.author_email}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--color-ink-near-black)",
  marginBottom: 8,
};
