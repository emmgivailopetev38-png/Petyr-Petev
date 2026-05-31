"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/files";
import type { Attachment } from "@/lib/types";

export function DownloadChip({ attachment }: { attachment: Attachment }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const resp = await fetch(
        `/api/files/download?path=${encodeURIComponent(attachment.path)}`
      );
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        background: "var(--color-paper-cream)",
        border: "1px solid var(--color-rule-soft)",
        borderLeft: "2px solid var(--color-gold-warm)",
        borderRadius: 3,
        marginTop: 8,
        fontSize: 12,
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--color-ink-near-black)",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {attachment.filename}
        </div>
        <div style={{ color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em" }}>
          {formatBytes(attachment.size)}
        </div>
      </div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          background: "var(--color-burgundy-deep)",
          border: "none",
          borderRadius: 3,
          color: "var(--color-paper-cream)",
          fontSize: 10,
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          padding: "6px 10px",
          cursor: loading ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        Свали
      </button>
    </div>
  );
}
