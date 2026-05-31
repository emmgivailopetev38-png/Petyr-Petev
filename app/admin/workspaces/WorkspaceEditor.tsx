"use client";

import { useState, useEffect } from "react";
import type { Chat } from "@/lib/types";

type Props = {
  chat: Chat;
  onSaved: (updated: Chat) => void;
};

export function WorkspaceEditor({ chat, onSaved }: Props) {
  const [title, setTitle] = useState(chat.title);
  const [icon, setIcon] = useState(chat.icon ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(chat.welcome_message ?? "");
  const [systemPrompt, setSystemPrompt] = useState(chat.system_prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(chat.title);
    setIcon(chat.icon ?? "");
    setWelcomeMessage(chat.welcome_message ?? "");
    setSystemPrompt(chat.system_prompt ?? "");
    setDirty(false);
    setError(null);
  }, [chat.id, chat.title, chat.icon, chat.welcome_message, chat.system_prompt]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`/api/workspaces/${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          icon,
          welcome_message: welcomeMessage,
          system_prompt: systemPrompt,
        }),
      });
      const json = (await resp.json()) as { ok?: boolean; chat?: Chat; error?: string };
      if (!resp.ok || !json.ok || !json.chat) {
        throw new Error(json.error ?? `HTTP ${resp.status}`);
      }
      onSaved(json.chat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при запис");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "var(--color-bg-deep)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        height: "calc(100vh - 120px)",
        overflowY: "auto",
      }}
    >
      <Field label="Заглавие">
        <input
          value={title}
          onChange={(e) => markDirty(setTitle)(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Икона (emoji)">
        <input
          value={icon}
          onChange={(e) => markDirty(setIcon)(e.target.value)}
          maxLength={4}
          style={{ ...inputStyle, width: 80, fontSize: 18 }}
        />
      </Field>
      <Field label="Приветствие (показва се при празен чат)">
        <textarea
          value={welcomeMessage}
          onChange={(e) => markDirty(setWelcomeMessage)(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
        />
      </Field>
      <Field label="Системен prompt (роля и контекст за Hermes)">
        <textarea
          value={systemPrompt}
          onChange={(e) => markDirty(setSystemPrompt)(e.target.value)}
          rows={20}
          style={{
            ...inputStyle,
            resize: "vertical",
            minHeight: 300,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
      </Field>
      {error && (
        <div
          style={{
            color: "#ef4444",
            fontSize: 12,
            padding: "8px 12px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          paddingTop: 8,
          borderTop: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            background: "var(--color-accent-violet)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: !dirty || saving ? "not-allowed" : "pointer",
            opacity: !dirty || saving ? 0.5 : 1,
          }}
        >
          {saving ? "Запазване..." : "Запази"}
        </button>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          Промените влизат в сила веднага — без redeploy.
        </span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--color-text-secondary)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-input)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  color: "var(--color-text-primary)",
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
  fontFamily: "inherit",
};
