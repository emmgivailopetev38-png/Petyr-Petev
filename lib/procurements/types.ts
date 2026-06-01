export type ProcurementStatus =
  | "new"
  | "qualifying"
  | "go"
  | "no_go"
  | "preparing"
  | "submitted"
  | "won"
  | "lost"
  | "withdrawn";

export type Procurement = {
  id: string;
  aop_id: string | null;
  source: "cais" | "manual" | "open-data";
  source_url: string | null;

  title: string;
  publisher: string | null;
  publisher_meta: Record<string, unknown>;
  procedure_type: string | null;
  estimated_value: number | null;
  currency: string;
  publication_date: string | null;
  submission_deadline: string | null;
  description: string | null;

  workspace_id: string | null;
  status: ProcurementStatus;
  priority: number;
  owner_email: string | null;
  go_no_go_notes: string | null;
  linked_chat_id: string | null;

  risk_level: number | null;
  risk_notes: string | null;
  draft_appeal: string | null;
  vertical: string | null;

  fetched_at: string;
  analysed_at: string | null;
  updated_at: string;
  created_at: string;
};

export type ProcurementNote = {
  id: string;
  procurement_id: string;
  author_email: string | null;
  content: string;
  created_at: string;
};

export type ProcurementTask = {
  id: string;
  procurement_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  owner_email: string | null;
  done: boolean;
  created_at: string;
};

export type ProcurementEvent = {
  id: string;
  procurement_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_email: string | null;
  occurred_at: string;
};

export type WorkspaceMonitorSubscription = {
  workspace_id: string;
  enabled: boolean;
  vertical_filter: string | null;
  min_value: number | null;
  max_value: number | null;
  updated_at: string;
};
