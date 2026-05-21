import type { Message } from "@/lib/types";
import { FileChip } from "@/components/FileChip";
import { DownloadChip } from "@/components/DownloadChip";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const inputAttachments = (message.attachments ?? []).filter((a) => a.kind === "input");
  const outputAttachments = (message.attachments ?? []).filter((a) => a.kind === "output");

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
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
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
        {inputAttachments.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: message.content ? 8 : 0,
            }}
          >
            {inputAttachments.map((a) => (
              <FileChip
                key={a.id}
                filename={a.filename}
                size={a.size}
                status="done"
              />
            ))}
          </div>
        )}
        {message.content || (
          inputAttachments.length === 0 && (
            <span style={{ opacity: 0.4, fontFamily: "monospace" }}>▋</span>
          )
        )}
        {outputAttachments.length > 0 && (
          <div>
            {outputAttachments.map((a) => (
              <DownloadChip key={a.id} attachment={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
