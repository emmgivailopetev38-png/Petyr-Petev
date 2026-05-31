"use client";

import { useState } from "react";
import { WorkspaceEditor } from "@/app/admin/workspaces/WorkspaceEditor";
import type { Chat } from "@/lib/types";

export function WorkspaceList({ initial }: { initial: Chat[] }) {
  const [chats, setChats] = useState<Chat[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = chats.find((c) => c.id === editingId);

  function handleSaved(updated: Chat) {
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditingId(null);
  }

  return (
    <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {chats.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => setEditingId(c.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                background:
                  editingId === c.id
                    ? "var(--color-accent-violet)"
                    : "var(--color-bg-deep)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-text-primary)",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>{c.icon ?? "💬"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div
                  style={{
                    fontSize: 11,
                    color:
                      editingId === c.id
                        ? "rgba(255,255,255,0.7)"
                        : "var(--color-text-tertiary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.vertical ?? "—"} · slot {c.slot}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <WorkspaceEditor chat={editing} onSaved={handleSaved} />
        ) : (
          <div
            style={{
              padding: 24,
              border: "1px dashed var(--color-border)",
              borderRadius: 8,
              color: "var(--color-text-tertiary)",
              fontSize: 13,
            }}
          >
            Избери работно място отляво за да го редактираш.
          </div>
        )}
      </div>
    </div>
  );
}
