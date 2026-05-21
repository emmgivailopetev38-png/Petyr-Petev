export type Chat = {
  id: string;
  slot: number;
  title: string;
  created_at: string;
};

export type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};
