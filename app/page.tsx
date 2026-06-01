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
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingBottom: 14,
          marginBottom: 4,
          borderBottom: "1px solid var(--color-rule-faint)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: "0.015em",
              color: "var(--color-ink-near-black)",
              lineHeight: 1,
            }}
          >
            ZOPEXPERT
          </h1>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.22em",
              color: "var(--color-ink-faint)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            обществени поръчки · асистент
          </span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {[
            { href: "/procurements", icon: "📋", title: "Pipeline" },
            { href: "/admin/monitor", icon: "🛡️", title: "Мониторинг" },
            { href: "/admin/knowledge", icon: "📚", title: "База знания" },
            { href: "/admin/workspaces", icon: "⚙️", title: "Настройки" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              title={item.title}
              style={{
                fontSize: 14,
                color: "var(--color-ink-muted)",
                textDecoration: "none",
                padding: "6px 10px",
                borderRadius: 3,
                lineHeight: 1,
                transition: "background 150ms ease",
              }}
            >
              {item.icon}
            </a>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: -1,
            left: 0,
            width: 96,
            height: 2,
            background:
              "linear-gradient(90deg, var(--color-gold-warm) 0%, var(--color-gold-pale) 100%)",
          }}
        />
      </header>

      <ChatGrid chats={chats} />
    </main>
  );
}
