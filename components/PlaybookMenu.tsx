"use client";

import { useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import type { Playbook } from "@/lib/playbooks/types";

type Props = {
  chatId: string;
  workspaceId: string;
  onRunStarted: (runId: string, totalSteps: number, playbookName: string) => void;
};

export function PlaybookMenu({ chatId, workspaceId, onRunStarted }: Props) {
  const [open, setOpen] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Playbook | null>(null);
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/playbooks?workspaceId=${workspaceId}`)
      .then((r) => r.json() as Promise<{ playbooks: Playbook[] }>)
      .then((j) => setPlaybooks(j.playbooks))
      .finally(() => setLoading(false));
  }, [open, workspaceId]);

  function reset() {
    setSelected(null);
    setInput("");
    setError(null);
  }

  async function start() {
    if (!selected) return;
    setStarting(true);
    setError(null);
    try {
      const resp = await fetch("/api/playbooks/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbookId: selected.id,
          chatId,
          initialInput: input,
        }),
      });
      const json = (await resp.json()) as {
        runId?: string;
        totalSteps?: number;
        playbookName?: string;
        error?: string;
      };
      if (!resp.ok || !json.runId) throw new Error(json.error ?? "Грешка");
      onRunStarted(json.runId, json.totalSteps ?? selected.steps.length, json.playbookName ?? selected.name);
      setOpen(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Playbooks"
        style={{
          ...iconBtn,
          gap: 5,
          padding: "4px 9px",
          fontSize: 11,
          color: "var(--color-burgundy-deep)",
          background: "rgba(168, 139, 83, 0.10)",
          border: "1px solid rgba(168, 139, 83, 0.30)",
          borderRadius: 6,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        <Workflow size={13} />
        <span>Playbooks</span>
      </button>
      {open && (
        <div
          onClick={() => {
            setOpen(false);
            reset();
          }}
          style={overlay}
        >
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <header style={modalHeader}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Playbooks</span>
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                style={closeBtn}
              >
                ✕
              </button>
            </header>
            {!selected && (
              <div style={modalBody}>
                {loading && (
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
                    Зареждане...
                  </div>
                )}
                {!loading && playbooks.length === 0 && (
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
                    Няма playbooks за това работно място.
                  </div>
                )}
                {playbooks.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    style={pbItem}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    {p.description && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-tertiary)",
                          marginTop: 2,
                        }}
                      >
                        {p.description}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-tertiary)",
                        marginTop: 4,
                      }}
                    >
                      {p.steps.length} стъпки
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div style={modalBody}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{selected.name}</div>
                  {selected.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-tertiary)",
                        marginTop: 2,
                      }}
                    >
                      {selected.description}
                    </div>
                  )}
                </div>
                <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {selected.steps.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                </ol>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    marginTop: 12,
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    Първоначален вход (опционално — може и да оставиш празно, ако chat историята е достатъчна):
                  </span>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={4}
                    style={inputStyle}
                  />
                </label>
                {error && (
                  <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    justifyContent: "flex-end",
                  }}
                >
                  <button onClick={() => setSelected(null)} style={secondaryBtn}>
                    Назад
                  </button>
                  <button onClick={start} disabled={starting} style={primaryBtn}>
                    {starting ? "Стартиране..." : "Стартирай"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(3,3,8,0.6)",
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modal: React.CSSProperties = {
  background: "var(--color-bg-deep)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  width: 480,
  maxWidth: "90vw",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  borderBottom: "1px solid var(--color-border)",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-text-tertiary)",
  fontSize: 14,
  cursor: "pointer",
};

const modalBody: React.CSSProperties = {
  padding: 14,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const pbItem: React.CSSProperties = {
  textAlign: "left",
  background: "var(--color-bg-glass)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "10px 12px",
  cursor: "pointer",
  color: "var(--color-text-primary)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-input)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--color-text-primary)",
  fontSize: 12,
  resize: "vertical",
  outline: "none",
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

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  color: "var(--color-text-secondary)",
  padding: "8px 14px",
  fontSize: 12,
  cursor: "pointer",
};
