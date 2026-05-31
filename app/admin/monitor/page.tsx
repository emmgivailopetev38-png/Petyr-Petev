import { Dashboard } from "@/app/admin/monitor/Dashboard";

export const dynamic = "force-dynamic";

export default function AdminMonitorPage() {
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
        <h1
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: "var(--color-text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          ZOPEXPERT · Мониторинг на обществени поръчки
        </h1>
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
      </header>
      <Dashboard />
    </main>
  );
}
