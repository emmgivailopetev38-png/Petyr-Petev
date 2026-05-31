"use client";

import { useState, useEffect } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import type { Chat } from "@/lib/types";

export function ChatGrid({ chats }: { chats: Chat[] }) {
  const [fullscreenChatId, setFullscreenChatId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullscreenChatId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreenChatId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenChatId]);

  if (fullscreenChatId) {
    const chat = chats.find((c) => c.id === fullscreenChatId);
    if (chat) {
      return (
        <ChatPanel
          chat={chat}
          isFullscreen
          onToggleFullscreen={() => setFullscreenChatId(null)}
        />
      );
    }
  }

  // Dynamic 2-column grid; rows scale with chat count
  const count = chats.length;
  const cols = count <= 8 ? 2 : 3;
  const rows = Math.ceil(count / cols);

  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 12,
        minHeight: 0,
      }}
    >
      {chats.map((chat) => (
        <ChatPanel
          key={chat.id}
          chat={chat}
          isFullscreen={false}
          onToggleFullscreen={() => setFullscreenChatId(chat.id)}
        />
      ))}
    </div>
  );
}
