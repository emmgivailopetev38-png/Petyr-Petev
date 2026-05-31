export type PlaybookStep = {
  id: string;
  name: string;
  prompt: string;
};

export type Playbook = {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  steps: PlaybookStep[];
};

export type PlaybookRunState =
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type PlaybookRun = {
  id: string;
  playbook_id: string;
  chat_id: string;
  state: PlaybookRunState;
  current_step: number;
  outputs: Record<string, string>;
  error_message: string | null;
  initial_input: string | null;
  started_at: string;
  completed_at: string | null;
};
