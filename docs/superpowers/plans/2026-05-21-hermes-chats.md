# ZOPEXPERT Hermes Chat Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Next.js 16 app in `/ZOPEXPERT` with 6 persistent chat panels, each connected to a Hermes Agent (OpenAI-compatible API) via a secure server-side streaming bridge, with conversation history in Supabase.

**Architecture:** Next.js App Router handles both UI and the server-side Hermes bridge. A simple password cookie (checked in middleware) protects all routes. The `/api/hermes/chat` route loads history from Supabase, streams from Hermes back to the client, then saves both messages. Client reads history directly from Supabase via the anon key with read-only RLS.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript 5, Tailwind CSS v4, `@supabase/supabase-js` v2, `openai` v4 (OpenAI-compatible calls), `lucide-react`, Vitest 4

---

## File Map

```
ZOPEXPERT/
├── app/
│   ├── globals.css                         # Tailwind v4 @theme tokens, dark palette
│   ├── layout.tsx                          # Root HTML shell + metadata
│   ├── page.tsx                            # Server component: fetches 6 chats, renders grid
│   ├── login/
│   │   └── page.tsx                        # Password form (client component)
│   └── api/
│       ├── auth/
│       │   └── login/route.ts              # POST: validate password → set cookie
│       └── hermes/
│           ├── chat/
│           │   ├── route.ts               # POST: save user msg, call Hermes, stream, save assistant
│           │   └── route.test.ts          # Vitest: 400 validation + streaming smoke test
│           └── messages/
│               └── route.ts              # DELETE ?chatId=: clear chat history
├── components/
│   ├── ChatPanel.tsx                       # Client: title bar, scroll area, input row
│   └── ChatMessage.tsx                     # Pure: bubble for user/assistant messages
├── hooks/
│   └── useChat.ts                          # Client: load messages, sendMessage (stream), clearChat
├── lib/
│   ├── types.ts                            # Shared Chat + Message types
│   └── supabase/
│       ├── client.ts                       # Browser singleton (anon key)
│       └── server.ts                       # Server createServiceClient (service key)
├── supabase/
│   └── migrations/
│       └── 001_initial.sql                 # chats + messages schema, RLS, seed
├── tests/
│   └── setup.ts                            # Vitest global setup
├── middleware.ts                            # Cookie auth guard for all routes
├── .env.example
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Task 1: Project scaffold

**Files:**
- Create: `ZOPEXPERT/package.json`
- Create: `ZOPEXPERT/next.config.ts`
- Create: `ZOPEXPERT/tsconfig.json`
- Create: `ZOPEXPERT/postcss.config.mjs`
- Create: `ZOPEXPERT/vitest.config.ts`
- Create: `ZOPEXPERT/tests/setup.ts`
- Create: `ZOPEXPERT/.gitignore`

- [ ] **Step 1: Create `ZOPEXPERT/package.json`**

```json
{
  "name": "zopexpert",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "@supabase/supabase-js": "^2.106.0",
    "openai": "^4.100.0",
    "lucide-react": "^1.16.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/node": "^20",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "vitest": "^4.1.7",
    "@vitejs/plugin-react": "^6.0.2"
  }
}
```

- [ ] **Step 2: Create `ZOPEXPERT/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 3: Create `ZOPEXPERT/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `ZOPEXPERT/postcss.config.mjs`**

```javascript
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};
export default config;
```

- [ ] **Step 5: Create `ZOPEXPERT/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 6: Create `ZOPEXPERT/tests/setup.ts`**

```typescript
import { vi } from "vitest";

process.env.HERMES_BASE_URL = "http://localhost:8642/v1";
process.env.HERMES_API_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.ADMIN_PASSWORD = "test-password";
process.env.AUTH_SECRET = "test-secret-32-chars-long-enough";
```

- [ ] **Step 7: Create `ZOPEXPERT/.gitignore`**

```
.next/
node_modules/
.env.local
*.env
```

- [ ] **Step 8: Install dependencies**

```bash
cd ZOPEXPERT && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 9: Commit**

```bash
git add ZOPEXPERT/package.json ZOPEXPERT/package-lock.json ZOPEXPERT/next.config.ts ZOPEXPERT/tsconfig.json ZOPEXPERT/postcss.config.mjs ZOPEXPERT/vitest.config.ts ZOPEXPERT/tests/setup.ts ZOPEXPERT/.gitignore
git commit -m "chore(zopexpert): scaffold Next.js 16 project"
```

---

## Task 2: Global styles and layout

**Files:**
- Create: `ZOPEXPERT/app/globals.css`
- Create: `ZOPEXPERT/app/layout.tsx`

- [ ] **Step 1: Create `ZOPEXPERT/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-bg-void: #030308;
  --color-bg-deep: #0a0a1f;
  --color-bg-glass: rgba(255, 255, 255, 0.03);

  --color-accent-violet: #7c3aed;
  --color-accent-violet-hover: #6d28d9;
  --color-accent-cyan: #06b6d4;

  --color-text-primary: #f5f7ff;
  --color-text-secondary: #a0a8c0;
  --color-text-tertiary: #4a5070;

  --color-border: rgba(124, 58, 237, 0.18);
  --color-input: rgba(255, 255, 255, 0.06);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
}

body {
  background: var(--color-bg-void);
  color: var(--color-text-primary);
  font-family: system-ui, -apple-system, sans-serif;
}

::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}

textarea {
  font-family: inherit;
}
```

- [ ] **Step 2: Create `ZOPEXPERT/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZOPEXPERT",
  description: "Hermes Chat Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ZOPEXPERT/app/
git commit -m "feat(zopexpert): add global styles and root layout"
```

---

## Task 3: Environment variables

**Files:**
- Create: `ZOPEXPERT/.env.example`
- Create: `ZOPEXPERT/.env.local` (fill real values, never committed)

- [ ] **Step 1: Create `ZOPEXPERT/.env.example`**

```bash
# Hermes Agent — OpenAI-compatible API base URL (ends with /v1)
# After enabling API server on VPS: http://127.0.0.1:8642/v1
# Through reverse proxy: https://hermes.yourdomain.com/v1
HERMES_BASE_URL=https://placeholder/v1
HERMES_API_KEY=your-hermes-bearer-token

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Auth — simple password for owner access
ADMIN_PASSWORD=choose-a-strong-password
# Random string used as HMAC salt for session cookie (generate: openssl rand -hex 16)
AUTH_SECRET=random-32-char-string
```

- [ ] **Step 2: Copy to `.env.local` and fill values**

```bash
cp ZOPEXPERT/.env.example ZOPEXPERT/.env.local
```

Edit `.env.local` with your real Supabase URL, anon key, service key, and a strong ADMIN_PASSWORD. Leave HERMES_BASE_URL as placeholder until VPS is configured.

- [ ] **Step 3: Commit**

```bash
git add ZOPEXPERT/.env.example
git commit -m "chore(zopexpert): add env vars template"
```

---

## Task 4: Shared types

**Files:**
- Create: `ZOPEXPERT/lib/types.ts`

- [ ] **Step 1: Create `ZOPEXPERT/lib/types.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/lib/types.ts
git commit -m "feat(zopexpert): add shared Chat and Message types"
```

---

## Task 5: Supabase clients

**Files:**
- Create: `ZOPEXPERT/lib/supabase/client.ts`
- Create: `ZOPEXPERT/lib/supabase/server.ts`

- [ ] **Step 1: Create `ZOPEXPERT/lib/supabase/client.ts`**

```typescript
"use client";

import { createClient as _create } from "@supabase/supabase-js";

let _instance: ReturnType<typeof _create> | undefined;

export function createClient() {
  return (_instance ??= _create(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));
}
```

- [ ] **Step 2: Create `ZOPEXPERT/lib/supabase/server.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ZOPEXPERT/lib/
git commit -m "feat(zopexpert): add Supabase browser and server clients"
```

---

## Task 6: Database schema

**Files:**
- Create: `ZOPEXPERT/supabase/migrations/001_initial.sql`

- [ ] **Step 1: Create `ZOPEXPERT/supabase/migrations/001_initial.sql`**

```sql
-- chats: 6 rows (one per panel), seeded below
create table if not exists chats (
  id         uuid        primary key default gen_random_uuid(),
  slot       int         unique not null check (slot between 1 and 6),
  title      text        not null default 'Chat',
  created_at timestamptz not null default now()
);

-- messages: conversation history per chat
create table if not exists messages (
  id         uuid        primary key default gen_random_uuid(),
  chat_id    uuid        not null references chats(id) on delete cascade,
  role       text        not null check (role in ('user', 'assistant')),
  content    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_chat_id_created_at
  on messages(chat_id, created_at asc);

-- Seed 6 chat slots
insert into chats (slot, title) values
  (1, 'Chat 1'), (2, 'Chat 2'), (3, 'Chat 3'),
  (4, 'Chat 4'), (5, 'Chat 5'), (6, 'Chat 6')
on conflict (slot) do nothing;

-- RLS: anon key can only read; writes go through service key in API routes
alter table chats    enable row level security;
alter table messages enable row level security;

create policy "anon read chats"
  on chats for select using (true);

create policy "anon read messages"
  on messages for select using (true);

-- Service role bypasses RLS by default — no additional policy needed for writes
```

- [ ] **Step 2: Apply migration**

Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → SQL Editor → paste the SQL above → click **Run**.

Expected output: `Success. No rows returned.`

- [ ] **Step 3: Verify**

In Supabase → Table Editor → `chats`: confirm 6 rows (slots 1–6).

- [ ] **Step 4: Commit**

```bash
git add ZOPEXPERT/supabase/
git commit -m "feat(zopexpert): add chats+messages schema, RLS, seed"
```

---

## Task 7: Auth — middleware + login

**Files:**
- Create: `ZOPEXPERT/middleware.ts`
- Create: `ZOPEXPERT/app/login/page.tsx`
- Create: `ZOPEXPERT/app/api/auth/login/route.ts`

- [ ] **Step 1: Create `ZOPEXPERT/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";

function expectedToken(): string {
  const pw = process.env.ADMIN_PASSWORD!;
  const secret = process.env.AUTH_SECRET!;
  return Buffer.from(`${pw}:${secret}`).toString("base64url");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  const token = request.cookies.get("zop_auth")?.value;
  if (!token || token !== expectedToken()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Create `ZOPEXPERT/app/api/auth/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = (await request.json()) as { password: string };

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = Buffer.from(
    `${process.env.ADMIN_PASSWORD}:${process.env.AUTH_SECRET}`
  ).toString("base64url");

  const response = NextResponse.json({ ok: true });
  response.cookies.set("zop_auth", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
```

- [ ] **Step 3: Create `ZOPEXPERT/app/login/page.tsx`**

```typescript
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
      }}
    >
      <div
        style={{
          background: "var(--color-bg-deep)",
          border: "1px solid var(--color-border)",
          borderRadius: 16,
          padding: 32,
          width: 360,
        }}
      >
        <h1
          style={{
            fontWeight: 700,
            fontSize: 22,
            marginBottom: 24,
            color: "var(--color-text-primary)",
          }}
        >
          ZOPEXPERT
        </h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Парола"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "var(--color-input)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              color: "var(--color-text-primary)",
              fontSize: 14,
              marginBottom: 12,
              outline: "none",
            }}
          />
          {error && (
            <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: "100%",
              padding: 10,
              background: "var(--color-accent-violet)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading || !password ? 0.6 : 1,
            }}
          >
            {loading ? "Влизане..." : "Влез"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Start dev server and verify redirect**

```bash
cd ZOPEXPERT && npm run dev
```

Open `http://localhost:3000` — should redirect to `/login`.  
Enter the password from `.env.local` — should redirect to `/` (which will 404 for now).

- [ ] **Step 5: Commit**

```bash
git add ZOPEXPERT/middleware.ts ZOPEXPERT/app/login/ ZOPEXPERT/app/api/auth/
git commit -m "feat(zopexpert): add password auth, middleware, login page"
```

---

## Task 8: Hermes bridge API route (TDD)

**Files:**
- Create: `ZOPEXPERT/app/api/hermes/chat/route.test.ts`
- Create: `ZOPEXPERT/app/api/hermes/chat/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `ZOPEXPERT/app/api/hermes/chat/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase service client
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
    })),
  })),
}));

// Mock OpenAI
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(
          (async function* () {
            yield { choices: [{ delta: { content: "Hello" } }] };
            yield { choices: [{ delta: { content: " world" } }] };
          })()
        ),
      },
    },
  })),
}));

import { POST } from "@/app/api/hermes/chat/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/hermes/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/hermes/chat", () => {
  it("returns 400 when chatId is missing", async () => {
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/chatId/);
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeRequest({ chatId: "abc-123" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/message/);
  });

  it("streams concatenated text from Hermes", async () => {
    const res = await POST(
      makeRequest({ chatId: "abc-123", message: "hello" })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toBe("Hello world");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ZOPEXPERT && npm test
```

Expected: 3 tests fail with `Cannot find module '@/app/api/hermes/chat/route'`.

- [ ] **Step 3: Create `ZOPEXPERT/app/api/hermes/chat/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    message?: string;
  };

  if (!body.chatId) {
    return NextResponse.json(
      { error: "chatId is required" },
      { status: 400 }
    );
  }
  if (!body.message) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  const { chatId, message } = body;
  const supabase = createServiceClient();

  // Persist user message
  await supabase.from("messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
  });

  // Load last 50 messages as context
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(50);

  const contextMessages = (history ?? []) as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  const openai = new OpenAI({
    baseURL: process.env.HERMES_BASE_URL,
    apiKey: process.env.HERMES_API_KEY!,
  });

  const stream = await openai.chat.completions.create({
    model: "hermes",
    stream: true,
    messages: contextMessages,
  });

  const encoder = new TextEncoder();
  let fullContent = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            fullContent += text;
            controller.enqueue(encoder.encode(text));
          }
        }
        // Persist assistant reply
        await supabase.from("messages").insert({
          chat_id: chatId,
          role: "assistant",
          content: fullContent,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ZOPEXPERT && npm test
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add ZOPEXPERT/app/api/hermes/chat/
git commit -m "feat(zopexpert): add Hermes streaming bridge with tests"
```

---

## Task 9: Clear messages API route

**Files:**
- Create: `ZOPEXPERT/app/api/hermes/messages/route.ts`

- [ ] **Step 1: Create `ZOPEXPERT/app/api/hermes/messages/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function DELETE(request: NextRequest) {
  const chatId = request.nextUrl.searchParams.get("chatId");

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("chat_id", chatId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/app/api/hermes/messages/
git commit -m "feat(zopexpert): add DELETE /api/hermes/messages to clear chat"
```

---

## Task 10: `useChat` hook

**Files:**
- Create: `ZOPEXPERT/hooks/useChat.ts`

- [ ] **Step 1: Create `ZOPEXPERT/hooks/useChat.ts`**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load message history from Supabase on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });
  }, [chatId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading || !content.trim()) return;
      setIsLoading(true);

      // Optimistically add user bubble
      const userMsg: Message = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add empty assistant bubble for streaming
      const streamingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: streamingId,
          chat_id: chatId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
        },
      ]);

      try {
        const response = await fetch("/api/hermes/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: content.trim() }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          accumulated += text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId ? { ...m, content: accumulated } : m
            )
          );
        }
      } catch {
        // Remove failed streaming bubble; user bubble stays visible
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, isLoading]
  );

  const clearChat = useCallback(async () => {
    await fetch(`/api/hermes/messages?chatId=${chatId}`, {
      method: "DELETE",
    });
    setMessages([]);
  }, [chatId]);

  return { messages, isLoading, sendMessage, clearChat };
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/hooks/useChat.ts
git commit -m "feat(zopexpert): add useChat hook with streaming and clear"
```

---

## Task 11: ChatMessage component

**Files:**
- Create: `ZOPEXPERT/components/ChatMessage.tsx`

- [ ] **Step 1: Create `ZOPEXPERT/components/ChatMessage.tsx`**

```typescript
import type { Message } from "@/lib/types";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "8px 12px",
          borderRadius: isUser
            ? "12px 12px 4px 12px"
            : "12px 12px 12px 4px",
          background: isUser
            ? "var(--color-accent-violet)"
            : "var(--color-bg-glass)",
          border: isUser ? "none" : "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.content || (
          <span style={{ opacity: 0.4, fontFamily: "monospace" }}>▋</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/components/ChatMessage.tsx
git commit -m "feat(zopexpert): add ChatMessage bubble component"
```

---

## Task 12: ChatPanel component

**Files:**
- Create: `ZOPEXPERT/components/ChatPanel.tsx`

- [ ] **Step 1: Create `ZOPEXPERT/components/ChatPanel.tsx`**

```typescript
"use client";

import { useRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { ChatMessage } from "@/components/ChatMessage";
import type { Chat } from "@/lib/types";

export function ChatPanel({ chat }: { chat: Chat }) {
  const { messages, isLoading, sendMessage, clearChat } = useChat(chat.id);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--color-bg-deep)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--color-text-primary)",
          }}
        >
          {chat.title}
        </span>
        <button
          onClick={clearChat}
          title="Изчисти историята"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Изчисти
        </button>
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          minHeight: 0,
        }}
      >
        {messages.length === 0 && !isLoading && (
          <p
            style={{
              color: "var(--color-text-tertiary)",
              fontSize: 12,
              textAlign: "center",
              marginTop: 24,
            }}
          >
            Напишете нещо...
          </p>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Съобщение... (Enter за изпращане)"
          rows={1}
          style={{
            flex: 1,
            background: "var(--color-input)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            color: "var(--color-text-primary)",
            fontSize: 13,
            padding: "8px 12px",
            resize: "none",
            outline: "none",
            maxHeight: 80,
            overflowY: "auto",
          }}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          style={{
            background: "var(--color-accent-violet)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            padding: "8px 12px",
            cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
            opacity: isLoading || !input.trim() ? 0.45 : 1,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/components/ChatPanel.tsx
git commit -m "feat(zopexpert): add ChatPanel with input, streaming, clear"
```

---

## Task 13: Main page — 6-chat grid

**Files:**
- Create: `ZOPEXPERT/app/page.tsx`

- [ ] **Step 1: Create `ZOPEXPERT/app/page.tsx`**

```typescript
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
```

- [ ] **Step 2: Start dev server and verify**

```bash
cd ZOPEXPERT && npm run dev
```

Open `http://localhost:3000`. After login you should see 6 panels in a 2×3 grid. Type a message in any panel — it should appear immediately (optimistic). Hermes will respond once the VPS endpoint is live (until then the stream will fail silently and the empty assistant bubble disappears).

- [ ] **Step 3: Run typecheck**

```bash
cd ZOPEXPERT && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
cd ZOPEXPERT && npm test
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add ZOPEXPERT/app/page.tsx
git commit -m "feat(zopexpert): add main page with 6-chat 2x3 grid"
```

---

## After completion — VPS setup checklist

Before Hermes will respond, the owner must:

1. **Enable Hermes API server** on VPS — add to `/root/.hermes/.env`:
   ```
   API_SERVER_ENABLED=true
   API_SERVER_HOST=127.0.0.1
   API_SERVER_PORT=8642
   API_SERVER_KEY=<strong-random-secret>
   ```
   Then: `hermes gateway restart`

2. **Set up Nginx reverse proxy** so the API is reachable over HTTPS:
   ```nginx
   location /v1/ {
     proxy_pass http://127.0.0.1:8642/v1/;
     proxy_set_header Authorization $http_authorization;
   }
   ```

3. **Update `.env.local`** in ZOPEXPERT:
   ```
   HERMES_BASE_URL=https://your-vps-domain.com/v1
   HERMES_API_KEY=<the API_SERVER_KEY from above>
   ```

4. **Restart Next.js** to pick up new env vars.
