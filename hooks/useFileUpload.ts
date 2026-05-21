"use client";

import { useState, useCallback } from "react";
import type { Attachment } from "@/lib/types";
import { FILE_LIMITS } from "@/lib/files";

type UploadingFile = {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
  attachment?: Attachment;
};

export function useFileUpload(chatId: string) {
  const [files, setFiles] = useState<UploadingFile[]>([]);

  const update = useCallback((id: string, patch: Partial<UploadingFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const uploadOne = useCallback(
    async (uf: UploadingFile) => {
      update(uf.id, { status: "uploading", progress: 0 });

      // 1. Request signed upload URL
      const urlResp = await fetch("/api/files/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          filename: uf.file.name,
          mime: uf.file.type || "application/octet-stream",
          size: uf.file.size,
        }),
      });

      if (!urlResp.ok) {
        const err = await urlResp.json().catch(() => ({}));
        update(uf.id, {
          status: "error",
          errorMessage: (err as { error?: string }).error || `HTTP ${urlResp.status}`,
        });
        return;
      }

      const { id, uploadUrl, path } = (await urlResp.json()) as {
        id: string;
        uploadUrl: string;
        token: string;
        path: string;
      };

      // 2. PUT the file to Supabase via XHR for progress
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader(
            "Content-Type",
            uf.file.type || "application/octet-stream"
          );
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              update(uf.id, { progress: Math.round((e.loaded / e.total) * 100) });
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload HTTP ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(uf.file);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        update(uf.id, { status: "error", errorMessage: message });
        return;
      }

      // 3. Confirm with server
      const confirmResp = await fetch("/api/files/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          files: [
            {
              id,
              path,
              filename: uf.file.name,
              mime: uf.file.type || "application/octet-stream",
              size: uf.file.size,
            },
          ],
        }),
      });
      if (!confirmResp.ok) {
        update(uf.id, { status: "error", errorMessage: "Confirm failed" });
        return;
      }

      const { attachments } = (await confirmResp.json()) as {
        attachments: Attachment[];
      };
      update(uf.id, {
        status: "done",
        progress: 100,
        attachment: attachments[0],
      });
    },
    [chatId, update]
  );

  const enqueue = useCallback(
    (incoming: File[]) => {
      const slotsLeft = FILE_LIMITS.maxFilesPerMessage - files.length;
      const accepted = incoming.slice(0, slotsLeft);
      const newOnes: UploadingFile[] = accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: "pending",
      }));
      setFiles((prev) => [...prev, ...newOnes]);
      for (const uf of newOnes) {
        if (uf.file.size > FILE_LIMITS.maxFileSizeBytes) {
          update(uf.id, {
            status: "error",
            errorMessage: "Файлът надвишава 50 MB",
          });
          continue;
        }
        void uploadOne(uf);
      }
    },
    [files.length, uploadOne, update]
  );

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  const completedAttachments: Attachment[] = files
    .filter((f) => f.status === "done" && f.attachment)
    .map((f) => f.attachment!);

  const isUploading = files.some((f) => f.status === "uploading" || f.status === "pending");

  return {
    files,
    enqueue,
    remove,
    clear,
    completedAttachments,
    isUploading,
  };
}
