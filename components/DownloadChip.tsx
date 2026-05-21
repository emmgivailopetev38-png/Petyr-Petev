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
        padding: "8px 12px",
        background: "var(--color-bg-deep)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        marginTop: 8,
        fontSize: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--color-text-primary)",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {attachment.filename}
        </div>
        <div style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>
          {formatBytes(attachment.size)}
        </div>
      </div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          background: "var(--color-accent-violet)",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontSize: 11,
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
