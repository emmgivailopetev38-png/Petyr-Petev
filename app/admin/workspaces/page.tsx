import { createServiceClient } from "@/lib/supabase/server";
import { WorkspaceList } from "@/app/admin/workspaces/WorkspaceList";
import type { Chat } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminWorkspacesPage() {
  const supabase = createServiceClient();
  const { data } = await supabase.from("chats").select("*").order("slot");
  const chats = (data ?? []) as Chat[];

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <h1
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "var(--color-text-secondary)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            ZOPEXPERT · Настройки на работни места
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/admin/knowledge"
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              textDecoration: "none",
              padding: "6px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
            }}
          >
            📚 База знания
          </a>
          <a
            href="/"
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              textDecoration: "none",
              padding: "6px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
            }}
          >
            ← Назад
          </a>
        </div>
      </header>
      <WorkspaceList initial={chats} />
    </main>
  );
}
