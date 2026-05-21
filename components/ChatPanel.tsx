"use client";

import { useRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { ChatMessage } from "@/components/ChatMessage";
import type { Chat } from "@/lib/types";

export function ChatPanel({ chat }: { chat: Chat }) {
  const { messages, isLoading, sendMessage, clearChat } = useChat(chat.id);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--color-bg-deep)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--color-text-primary)",
          }}
        >
          {chat.title}
        </span>
        <button
          onClick={clearChat}
          title="Изчисти историята"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Изчисти
        </button>
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          minHeight: 0,
        }}
      >
        {messages.length === 0 && !isLoading && (
          <p
            style={{
              color: "var(--color-text-tertiary)",
              fontSize: 12,
              textAlign: "center",
              marginTop: 24,
            }}
          >
            Напишете нещо...
          </p>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Съобщение... (Enter за изпращане)"
          rows={1}
          style={{
            flex: 1,
            background: "var(--color-input)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            color: "var(--color-text-primary)",
            fontSize: 13,
            padding: "8px 12px",
            resize: "none",
            outline: "none",
            maxHeight: 80,
            overflowY: "auto",
          }}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          style={{
            background: "var(--color-accent-violet)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            padding: "8px 12px",
            cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
            opacity: isLoading || !input.trim() ? 0.45 : 1,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
