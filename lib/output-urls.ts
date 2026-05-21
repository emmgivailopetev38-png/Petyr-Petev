import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/files";
import type { Attachment } from "@/lib/types";

const URL_PATTERN =
  /https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:sign|public)\/chat-files\/[^\s"'`)\]]+/gi;

export function extractOutputUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN);
  return matches ?? [];
}

function pathFromUrl(url: string): string {
  const match = url.match(/\/storage\/v1\/object\/(?:sign|public)\/chat-files\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse storage path from URL: ${url}`);
  return decodeURIComponent(match[1]);
}

export async function urlsToAttachments(urls: string[]): Promise<Attachment[]> {
  if (urls.length === 0) return [];
  const supabase = createServiceClient();
  const attachments: Attachment[] = [];

  for (const url of urls) {
    const path = pathFromUrl(url);
    const dir = path.split("/").slice(0, -1).join("/");
    const file = path.split("/").pop()!;
    const { data } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(dir, { search: file });
    const entry = data?.[0];
    attachments.push({
      id: crypto.randomUUID(),
      filename: file.replace(/^[a-f0-9-]+-/, ""),
      mime: (entry?.metadata?.mimetype as string) ?? "application/octet-stream",
      size: (entry?.metadata?.size as number) ?? 0,
      path,
      kind: "output",
    });
  }

  return attachments;
}
