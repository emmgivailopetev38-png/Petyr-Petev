import { createServiceClient } from "@/lib/supabase/server";
import { ChatGrid } from "@/components/ChatGrid";
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
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
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
        <div style={{ display: "flex", gap: 4 }}>
          <a
            href="/admin/knowledge"
            title="База знания"
            style={{
              fontSize: 16,
              color: "var(--color-text-tertiary)",
              textDecoration: "none",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            📚
          </a>
          <a
            href="/admin/workspaces"
            title="Настройки на работни места"
            style={{
              fontSize: 16,
              color: "var(--color-text-tertiary)",
              textDecoration: "none",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            ⚙️
          </a>
        </div>
      </header>

      <ChatGrid chats={chats} />
    </main>
  );
}
