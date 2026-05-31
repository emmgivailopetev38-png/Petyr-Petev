"use client";

import { useEffect, useState } from "react";
import type { Chat } from "@/lib/types";
import type { KnowledgeSource, KnowledgeSourceType } from "@/lib/knowledge/types";

const SOURCE_TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  document: "Документ",
  note: "Бележка",
  kzk_decision: "Решение на КЗК",
  vas_decision: "Решение на ВАС",
  expert_note: "Експертна бележка",
  past_offer: "Стара оферта",
};

type Props = {
  workspaces: Chat[];
};

export function KnowledgeManager({ workspaces }: Props) {
  const [activeWs, setActiveWs] = useState<string>(workspaces[0]?.id ?? "");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("document");
  const [error, setError] = useState<string | null>(null);

  async function loadSources() {
    if (!activeWs) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/knowledge/sources?workspaceId=${activeWs}`);
      const j = (await r.json()) as { sources: KnowledgeSource[] };
      setSources(j.sources);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWs]);

  async function handleUpload() {
    if (!activeWs || !title) {
      setError("Заглавието и работното място са задължителни");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("workspaceId", activeWs);
      fd.append("title", title);
      fd.append("sourceType", sourceType);
      if (file) fd.append("file", file);
      else if (text) fd.append("text", text);
      else {
        setError("Качи файл или въведи текст");
        setUploading(false);
        return;
      }

      const r = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: fd,
      });
      const j = (await r.json()) as { ok?: boolean; chunkCount?: number; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Грешка");
      setTitle("");
      setText("");
      setFile(null);
      await loadSources();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Сигурен ли си че искаш да изтриеш този източник?")) return;
    await fetch(`/api/knowledge/sources/${id}`, { method: "DELETE" });
    await loadSources();
  }

  return (
    <div style={{ display: "flex", flex: 1, gap: 12, minHeight: 0 }}>
      <aside
        style={{
          width: 240,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
          Работни места
        </span>
        {workspaces.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveWs(c.id)}
            style={{
              ...sideBtn,
              background: activeWs === c.id ? "var(--color-accent-violet)" : "var(--color-bg-deep)",
            }}
          >
            <span style={{ fontSize: 14 }}>{c.icon ?? "💬"}</span>
            <span style={{ fontWeight: 600 }}>{c.title}</span>
          </button>
        ))}
      </aside>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <section
          style={{
            background: "var(--color-bg-deep)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
            Добави източник
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Заглавие"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as KnowledgeSourceType)}
              style={{ ...inputStyle, width: 180 }}
            >
              {Object.entries(SOURCE_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Поставете текст тук (или качете файл по-долу)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            style={inputStyle}
          />
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
          />
          {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleUpload} disabled={uploading} style={primaryBtn}>
              {uploading ? "Качване..." : "Добави"}
            </button>
          </div>
        </section>
        <section
          style={{
            background: "var(--color-bg-deep)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 16,
            flex: 1,
            overflowY: "auto",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
            Източници ({sources.length})
          </span>
          {loading && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Зареждане...</div>}
          {!loading && sources.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 8 }}>
              Все още няма източници за това работно място.
            </div>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {sources.map((s) => (
              <li
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: "var(--color-bg-glass)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {SOURCE_TYPE_LABELS[s.source_type as KnowledgeSourceType] ?? s.source_type} ·{" "}
                    {new Date(s.created_at).toLocaleString("bg-BG")}
                  </div>
                </div>
                <button onClick={() => handleDelete(s.id)} style={deleteBtn}>
                  Изтрий
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const sideBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  color: "var(--color-text-primary)",
  cursor: "pointer",
  fontSize: 13,
  textAlign: "left" as const,
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-input)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  color: "var(--color-text-primary)",
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--color-accent-violet)",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const deleteBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  color: "var(--color-text-tertiary)",
  fontSize: 11,
  padding: "4px 8px",
  cursor: "pointer",
};
