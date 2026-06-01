"use client";

/**
 * Animated three-dot indicator shown while Hermes is preparing a reply.
 * Displayed in the assistant bubble before any tokens arrive (or after a
 * stream that hasn't produced text yet — e.g. while the server retries).
 */
export function TypingIndicator() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 0",
      }}
      aria-label="Hermes пише..."
    >
      <Dot delayMs={0} />
      <Dot delayMs={180} />
      <Dot delayMs={360} />
      <style jsx>{`
        @keyframes hermes-thinking-dot {
          0%, 80%, 100% {
            transform: translateY(0);
            opacity: 0.35;
          }
          40% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function Dot({ delayMs }: { delayMs: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "var(--color-burgundy-deep)",
        animation: "hermes-thinking-dot 1.2s ease-in-out infinite",
        animationDelay: `${delayMs}ms`,
      }}
    />
  );
}
