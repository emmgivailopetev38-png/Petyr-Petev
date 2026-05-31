import type { Message } from "@/lib/types";
import { FileChip } from "@/components/FileChip";
import { DownloadChip } from "@/components/DownloadChip";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const inputAttachments = (message.attachments ?? []).filter(
    (a) => a.kind === "input",
  );
  const outputAttachments = (message.attachments ?? []).filter(
    (a) => a.kind === "output",
  );

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: isUser ? "8px 8px 2px 8px" : "2px 8px 8px 8px",
          background: isUser
            ? "var(--color-burgundy-deep)"
            : "var(--color-paper-warm)",
          border: isUser ? "none" : "1px solid var(--color-rule-soft)",
          borderLeft: isUser ? "none" : "2px solid var(--color-burgundy-deep)",
          color: isUser
            ? "var(--color-paper-cream)"
            : "var(--color-ink-charcoal)",
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          letterSpacing: "0.005em",
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
        {message.content ||
          (inputAttachments.length === 0 && (
            <span
              style={{
                opacity: 0.4,
                fontFamily: "var(--font-mono)",
                fontSize: 13,
              }}
            >
              ▋
            </span>
          ))}
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
