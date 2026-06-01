import type { Message } from "@/lib/types";
import { FileChip } from "@/components/FileChip";
import { DownloadChip } from "@/components/DownloadChip";
import { TypingIndicator } from "@/components/TypingIndicator";

export function ChatMessage({
  message,
  isFullscreen = false,
}: {
  message: Message;
  isFullscreen?: boolean;
}) {
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
        marginBottom: isFullscreen ? 14 : 10,
      }}
    >
      <div
        style={{
          // In fullscreen we let assistant replies fill the entire
          // content column (the panel already has 40 px side padding so
          // text doesn't slam against the edge). User bubbles stay
          // narrower because they're usually short questions.
          maxWidth: isFullscreen ? (isUser ? "70%" : "100%") : "80%",
          width: isFullscreen && !isUser ? "100%" : undefined,
          padding: isFullscreen ? "14px 20px" : "10px 14px",
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
          fontSize: isFullscreen ? 15.5 : 13.5,
          lineHeight: isFullscreen ? 1.7 : 1.65,
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
          (inputAttachments.length === 0 && !isUser && <TypingIndicator />)}
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
