"use client";

import { useEffect, useState } from "react";
import { Satellite } from "lucide-react";
import type { Procurement, WorkspaceMonitorSubscription } from "@/lib/procurements/types";

type Props = {
  chatId: string;
  vertical: string | null;
};

type Tab = "create" | "subscribe" | "active";

export function MonitorMenu({ chatId, vertical }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("create");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Мониторинг на процедури"
        style={{
          ...iconBtn,
          gap: 5,
          padding: "4px 9px",
          fontSize: 11,
          color: "var(--color-burgundy-deep)",
          background: "rgba(107, 30, 45, 0.06)",
          border: "1px solid rgba(107, 30, 45, 0.18)",
          borderRadius: 6,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        <Satellite size={13} />
        <span>Мониторинг</span>
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <header style={modalHeader}>
              <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "var(--font-display)" }}>
                Мониторинг
              </span>
              <button onClick={() => setOpen(false)} style={closeBtn}>✕</button>
            </header>
            <nav style={tabsStyle}>
              {(["create","subscribe","active"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    ...tabBtn,
                    color: tab === t ? "var(--color-burgundy-deep)" : "var(--color-ink-muted)",
                    borderBottom: tab === t ? "2px solid var(--color-burgundy-deep)" : "2px solid transparent",
                  }}
                >
                  {t === "create" ? "Нова процедура" : t === "subscribe" ? "Авт. следене" : "Активни"}
                </button>
              ))}
            </nav>
            <div style={modalBody}>
              {tab === "create" && <CreateTab chatId={chatId} vertical={vertical} onClose={() => setOpen(false)} />}
              {tab === "subscribe" && <SubscribeTab chatId={chatId} vertical={vertical} />}
              {tab === "active" && <ActiveTab chatId={chatId} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CreateTab({ chatId, vertical, onClose }: { chatId: string; vertical: string | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [aopId, setAopId] = useState("");
  const [publisher, setPublisher] = useState("");
  const [value, setValue] = useState("");
  const [deadline, setDeadline] = useState("");
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError("Заглавието е задължително");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/procurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          aop_id: aopId.trim() || null,
          publisher: publisher.trim() || null,
          estimated_value: value ? Number.parseFloat(value) : null,
          submission_deadline: deadline ? new Date(deadline).toISOString() : null,
          procedure_type: type.trim() || null,
          workspace_id: chatId,
          linked_chat_id: chatId,
          vertical,
          source: "manual",
        }),
      });
      const json = (await resp.json()) as { procurement?: { id: string }; error?: string };
      if (!resp.ok || !json.procurement) throw new Error(json.error ?? "Грешка");
      onClose();
      window.location.href = `/procurements/${json.procurement.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Заглавие *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="AOP ID (опц.)">
        <input value={aopId} onChange={(e) => setAopId(e.target.value)} placeholder="XXXXX-YYYY-NNNN" style={inputStyle} />
      </Field>
      <Field label="Възложител">
        <input value={publisher} onChange={(e) => setPublisher(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Прогнозна стойност (лв)">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Краен срок за подаване">
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Тип процедура">
        <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Публично състезание" style={inputStyle} />
      </Field>
      {error && <div style={{ color: "var(--color-error)", fontSize: 11 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleSave} disabled={saving} style={primaryBtn}>
          {saving ? "Запазване..." : "Запази и отвори"}
        </button>
      </div>
    </div>
  );
}

function SubscribeTab({ chatId, vertical }: { chatId: string; vertical: string | null }) {
  const [sub, setSub] = useState<WorkspaceMonitorSubscription | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [minVal, setMinVal] = useState("");
  const [maxVal, setMaxVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${chatId}/subscription`)
      .then((r) => r.json() as Promise<{ subscription: WorkspaceMonitorSubscription | null }>)
      .then((j) => {
        if (j.subscription) {
          setSub(j.subscription);
          setEnabled(j.subscription.enabled);
          setMinVal(j.subscription.min_value?.toString() ?? "");
          setMaxVal(j.subscription.max_value?.toString() ?? "");
        }
      });
  }, [chatId]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const resp = await fetch(`/api/workspaces/${chatId}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          vertical_filter: vertical,
          min_value: minVal ? Number.parseFloat(minVal) : null,
          max_value: maxVal ? Number.parseFloat(maxVal) : null,
        }),
      });
      if (!resp.ok) throw new Error("Грешка");
      const j = (await resp.json()) as { subscription: WorkspaceMonitorSubscription };
      setSub(j.subscription);
      setStatus("Запазено");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Грешка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "var(--color-ink-muted)", lineHeight: 1.6 }}>
        Когато авто-следенето на ЦАИС бъде включено, нови процедури класифицирани като
        <strong> {vertical ?? "този вертикал"} </strong>
        ще се добавят автоматично към този workspace.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Активно
      </label>
      <Field label="Мин. стойност (лв, опц.)">
        <input type="number" value={minVal} onChange={(e) => setMinVal(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Макс. стойност (лв, опц.)">
        <input type="number" value={maxVal} onChange={(e) => setMaxVal(e.target.value)} style={inputStyle} />
      </Field>
      {status && <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{status}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? "Запазване..." : sub ? "Обнови" : "Запази"}
        </button>
      </div>
    </div>
  );
}

function ActiveTab({ chatId }: { chatId: string }) {
  const [list, setList] = useState<Procurement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/procurements?workspaceId=${chatId}&limit=100`)
      .then((r) => r.json() as Promise<{ procurements: Procurement[] }>)
      .then((j) => setList(j.procurements))
      .finally(() => setLoading(false));
  }, [chatId]);

  if (loading) return <div style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>Зареждане...</div>;
  if (list.length === 0) return <div style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>Все още няма следени процедури за този workspace.</div>;

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((p) => (
        <li key={p.id}>
          <a
            href={`/procurements/${p.id}`}
            style={{
              display: "block",
              padding: "10px 12px",
              background: "var(--color-paper-warm)",
              border: "1px solid var(--color-rule-soft)",
              borderRadius: 4,
              color: "var(--color-ink-charcoal)",
              textDecoration: "none",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.title}</div>
            <div style={{ fontSize: 10, color: "var(--color-ink-faint)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
              {p.aop_id ?? "—"} · {p.status} · {p.estimated_value?.toLocaleString("bg-BG") ?? "—"} {p.currency}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--color-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-ink-muted)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 13, 10, 0.55)",
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modal: React.CSSProperties = {
  background: "var(--color-paper-cream)",
  border: "1px solid var(--color-rule-soft)",
  borderTop: "3px solid var(--color-burgundy-deep)",
  borderRadius: 4,
  width: 460,
  maxWidth: "90vw",
  maxHeight: "85vh",
  display: "flex",
  flexDirection: "column",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 14px",
  borderBottom: "1px solid var(--color-rule-faint)",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "0 14px",
  borderBottom: "1px solid var(--color-rule-faint)",
};

const tabBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "10px 8px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const modalBody: React.CSSProperties = {
  padding: 14,
  overflowY: "auto",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-ink-faint)",
  fontSize: 14,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "#FFFAF0",
  border: "1px solid var(--color-rule-soft)",
  borderRadius: 3,
  color: "var(--color-ink-charcoal)",
  fontSize: 12,
  padding: "8px 10px",
  outline: "none",
  fontFamily: "var(--font-body)",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--color-burgundy-deep)",
  border: "none",
  borderRadius: 3,
  color: "var(--color-paper-cream)",
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  cursor: "pointer",
};
