import { createServiceClient } from "@/lib/supabase/server";
import type { KnowledgeChunk } from "@/lib/knowledge/types";

const TOP_K = 3;

// Convert a free-form query into a tsquery: replace whitespace with ' | ', remove special characters
function toTsQuery(query: string): string {
  const cleaned = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 20); // cap
  return cleaned.join(" | "); // OR — more recall for short queries
}

export async function searchKnowledge(
  workspaceId: string,
  query: string,
  limit: number = TOP_K,
): Promise<KnowledgeChunk[]> {
  const tsQuery = toTsQuery(query);
  if (!tsQuery) return [];

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("search_knowledge_chunks", {
    p_workspace_id: workspaceId,
    p_query: tsQuery,
    p_limit: limit,
  });

  if (error) {
    // Fallback: simple LIKE-based search if RPC missing
    const { data: fallback } = await supabase
      .from("knowledge_chunks")
      .select("id, source_id, workspace_id, chunk_index, content")
      .eq("workspace_id", workspaceId)
      .ilike("content", `%${query.split(/\s+/)[0] ?? ""}%`)
      .limit(limit);
    return (fallback ?? []) as KnowledgeChunk[];
  }

  return (data ?? []) as KnowledgeChunk[];
}
