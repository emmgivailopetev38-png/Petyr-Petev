"use client";

import { X, FileText } from "lucide-react";
import { formatBytes } from "@/lib/files";

type FileChipProps = {
  filename: string;
  size: number;
  progress?: number; // 0..100 when uploading
  status?: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
  onRemove?: () => void;
};

export function FileChip({
  filename,
  size,
  progress,
  status = "done",
  errorMessage,
  onRemove,
}: FileChipProps) {
  const isError = status === "error";
  const isUploading = status === "uploading" || status === "pending";

  return (
    <div
      title={isError ? errorMessage : filename}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px 4px 8px",
        background: isError
          ? "rgba(239, 68, 68, 0.12)"
          : "var(--color-bg-glass)",
        border: `1px solid ${
          isError ? "rgba(239, 68, 68, 0.5)" : "var(--color-border)"
        }`,
        borderRadius: 6,
        fontSize: 11,
        color: "var(--color-text-primary)",
        overflow: "hidden",
        maxWidth: 180,
      }}
    >
      <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {filename}
      </span>
      <span style={{ opacity: 0.6, flexShrink: 0 }}>{formatBytes(size)}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Премахни файл"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <X size={12} />
        </button>
      )}
      {isUploading && typeof progress === "number" && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: 2,
            width: `${progress}%`,
            background: "var(--color-accent-violet)",
            transition: "width 100ms linear",
          }}
        />
      )}
    </div>
  );
}
