export type Chat = {
  id: string;
  slot: number;
  title: string;
  created_at: string;
  system_prompt: string | null;
  welcome_message: string | null;
  icon: string | null;
  vertical: string | null;
};

export type Attachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
  kind: "input" | "output";
};

export type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  attachments: Attachment[];
};
