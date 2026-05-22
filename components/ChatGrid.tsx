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

  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
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
