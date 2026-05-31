export type KnowledgeSourceType =
  | "document"
  | "note"
  | "kzk_decision"
  | "vas_decision"
  | "expert_note"
  | "past_offer";

export type KnowledgeSource = {
  id: string;
  workspace_id: string | null;
  source_type: KnowledgeSourceType;
  title: string;
  metadata: Record<string, unknown>;
  created_at: string;
  chunk_count?: number;
};

export type KnowledgeChunk = {
  id: string;
  source_id: string;
  workspace_id: string | null;
  chunk_index: number;
  content: string;
  rank?: number;
};
