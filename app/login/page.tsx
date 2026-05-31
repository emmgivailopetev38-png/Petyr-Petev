"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Грешна парола");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "100%",
          background: "var(--color-paper-cream)",
          border: "1px solid var(--color-rule-soft)",
          borderTop: "3px solid var(--color-burgundy-deep)",
          borderRadius: 6,
          padding: "36px 32px 28px",
          boxShadow:
            "0 1px 2px rgba(31, 27, 22, 0.04), 0 24px 60px -20px rgba(31, 27, 22, 0.08)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            marginBottom: 28,
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 34,
              letterSpacing: "0.02em",
              color: "var(--color-ink-near-black)",
              lineHeight: 1,
            }}
          >
            ZOPEXPERT
          </h1>
          <div
            style={{
              width: 56,
              height: 2,
              background:
                "linear-gradient(90deg, var(--color-gold-warm) 0%, var(--color-gold-pale) 100%)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.22em",
              color: "var(--color-ink-faint)",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            обществени поръчки · вход
          </span>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Парола"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "11px 14px",
              background: "#FFFAF0",
              border: "1px solid var(--color-rule-soft)",
              borderRadius: 4,
              color: "var(--color-ink-charcoal)",
              fontSize: 14,
              fontFamily: "var(--font-body)",
              marginBottom: 14,
              outline: "none",
              transition: "border-color 150ms ease",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor =
                "var(--color-burgundy-deep)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-rule-soft)")
            }
          />
          {error && (
            <p
              style={{
                color: "var(--color-error)",
                fontSize: 12,
                marginBottom: 12,
                fontFamily: "var(--font-body)",
              }}
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: "100%",
              padding: "11px",
              background: "var(--color-burgundy-deep)",
              border: "none",
              borderRadius: 4,
              color: "var(--color-paper-cream)",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontFamily: "var(--font-body)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading || !password ? 0.5 : 1,
              transition: "background 150ms ease",
            }}
          >
            {loading ? "Влизане..." : "Влез"}
          </button>
        </form>
      </div>
    </div>
  );
}
