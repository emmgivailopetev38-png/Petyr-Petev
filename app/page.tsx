import { createServiceClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/components/ChatPanel";
import type { Chat } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createServiceClient();
  const { data } = await supabase.from("chats").select("*").order("slot");
  const chats = (data ?? []) as Chat[];

  return (
    <main
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: 12,
        gap: 12,
      }}
    >
      <header style={{ flexShrink: 0 }}>
        <h1
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: "var(--color-text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          ZOPEXPERT
        </h1>
      </header>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 12,
          minHeight: 0,
        }}
      >
        {chats.map((chat) => (
          <ChatPanel key={chat.id} chat={chat} />
        ))}
      </div>
    </main>
  );
}
