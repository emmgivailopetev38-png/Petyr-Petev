import type { Message } from "@/lib/types";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "8px 12px",
          borderRadius: isUser
            ? "12px 12px 4px 12px"
            : "12px 12px 12px 4px",
          background: isUser
            ? "var(--color-accent-violet)"
            : "var(--color-bg-glass)",
          border: isUser ? "none" : "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.content || (
          <span style={{ opacity: 0.4, fontFamily: "monospace" }}>▋</span>
        )}
      </div>
    </div>
  );
}
