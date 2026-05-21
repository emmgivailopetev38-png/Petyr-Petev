export const FILE_LIMITS = {
  maxFileSizeBytes: 50 * 1024 * 1024,
  maxFilesPerMessage: 20,
  maxTotalStorageGb: 1,
} as const;

export const HISTORY_LIMIT = 200;

export const STORAGE_BUCKET = "chat-files";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export function makeStoragePath(filename: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  return `${date}/${id}-${sanitizeFilename(filename)}`;
}
