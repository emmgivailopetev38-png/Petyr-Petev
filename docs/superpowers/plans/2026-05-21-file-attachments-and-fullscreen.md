# File Attachments + Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file uploads (any type, up to 50 MB, 20 per message), Hermes round-trip document processing (download → parse → generate → upload-back), per-chat fullscreen mode, and bump history context from 50 to 200 messages — all on the existing ZOPEXPERT codebase deployed at https://zopexpert.vercel.app.

**Architecture:** Browser uploads directly to Supabase Storage via signed URLs (bypasses Vercel 4.5 MB body limit). Server-side `/api/hermes/chat` injects signed download URLs and upload-back instructions into the user message before calling Hermes. Hermes downloads files with its Python toolset, processes them, uploads generated outputs to a bearer-protected `/api/hermes-upload` endpoint, and includes the response URLs in its streamed reply. ZOPEXPERT regex-extracts URLs from assistant responses to surface download chips.

**Tech Stack:** Next.js 16, React 19, `@supabase/supabase-js` v2 (Storage), `lucide-react`, Vitest 4. No new dependencies.

---

## File Map

```
ZOPEXPERT/
├── app/
│   ├── page.tsx                         # MODIFY: fullscreenChatId state
│   └── api/
│       ├── files/
│       │   ├── upload-url/route.ts      # CREATE: signed Supabase upload URL
│       │   └── confirm/route.ts         # CREATE: confirm uploaded files
│       ├── hermes-upload/route.ts       # CREATE: Hermes posts generated files
│       └── hermes/chat/
│           ├── route.ts                 # MODIFY: attachments + 200 history + URL regex
│           └── route.test.ts            # MODIFY: new tests
├── components/
│   ├── ChatPanel.tsx                    # MODIFY: drag-drop, paperclip, fullscreen
│   ├── ChatMessage.tsx                  # MODIFY: render attachments
│   ├── FileChip.tsx                     # CREATE: queued/input file chip
│   └── DownloadChip.tsx                 # CREATE: assistant output download chip
├── hooks/
│   ├── useChat.ts                       # MODIFY: accept attachments
│   └── useFileUpload.ts                 # CREATE: encapsulates upload flow
├── lib/
│   ├── types.ts                         # MODIFY: Attachment type
│   ├── files.ts                         # CREATE: FILE_LIMITS + helpers
│   └── output-urls.ts                   # CREATE: regex + metadata fetch
├── supabase/migrations/
│   └── 002_attachments.sql              # CREATE: DB migration
└── proxy.ts                              # MODIFY: allow /api/hermes-upload through
```

---

## Task 1: Database migration

**Files:**
- Create: `ZOPEXPERT/supabase/migrations/002_attachments.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add attachments JSONB to messages table
alter table messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

-- Storage RLS policies — service role only
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat-files service insert'
  ) then
    create policy "chat-files service insert" on storage.objects
      for insert with check (bucket_id = 'chat-files');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat-files service select'
  ) then
    create policy "chat-files service select" on storage.objects
      for select using (bucket_id = 'chat-files');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat-files service delete'
  ) then
    create policy "chat-files service delete" on storage.objects
      for delete using (bucket_id = 'chat-files');
  end if;
end $$;
```

- [ ] **Step 2: Apply migration via Supabase Dashboard**

Open the Supabase SQL Editor for project `ggqaypkdovquuqisglip` and run the SQL above.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

In Supabase → Storage, confirm bucket `chat-files` exists. In Table Editor → `messages`, confirm `attachments` column with type `jsonb` and default `[]`.

- [ ] **Step 4: Commit**

```bash
git add ZOPEXPERT/supabase/migrations/002_attachments.sql
git commit -m "feat(zopexpert): add attachments column + chat-files bucket"
```

---

## Task 2: Shared types & limits constants

**Files:**
- Modify: `ZOPEXPERT/lib/types.ts`
- Create: `ZOPEXPERT/lib/files.ts`

- [ ] **Step 1: Modify `ZOPEXPERT/lib/types.ts`**

Replace the entire file content with:

```typescript
export type Chat = {
  id: string;
  slot: number;
  title: string;
  created_at: string;
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
```

- [ ] **Step 2: Create `ZOPEXPERT/lib/files.ts`**

```typescript
export const FILE_LIMITS = {
  maxFileSizeBytes: 50 * 1024 * 1024,
  maxFilesPerMessage: 20,
  maxTotalStorageGb: 1,
} as const;

export const HISTORY_LIMIT = 200;

export const STORAGE_BUCKET = "chat-files";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export function makeStoragePath(filename: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  return `${date}/${id}-${sanitizeFilename(filename)}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add ZOPEXPERT/lib/types.ts ZOPEXPERT/lib/files.ts
git commit -m "feat(zopexpert): add Attachment type and file limits"
```

---

## Task 3: `/api/files/upload-url` route (TDD)

**Files:**
- Create: `ZOPEXPERT/app/api/files/upload-url/route.ts`
- Create: `ZOPEXPERT/app/api/files/upload-url/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `ZOPEXPERT/app/api/files/upload-url/route.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: vi.fn().mockResolvedValue({
          data: {
            signedUrl: "https://test.supabase.co/storage/v1/upload/signed/abc",
            token: "test-token",
            path: "2026-05-21/uuid-report.pdf",
          },
          error: null,
        }),
      })),
    },
  })),
}));

import { POST } from "@/app/api/files/upload-url/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/files/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/files/upload-url", () => {
  it("returns 400 when chatId missing", async () => {
    const res = await POST(makeRequest({ filename: "a.pdf", mime: "application/pdf", size: 100 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when filename missing", async () => {
    const res = await POST(makeRequest({ chatId: "c1", mime: "application/pdf", size: 100 }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds 50 MB", async () => {
    const res = await POST(makeRequest({
      chatId: "c1",
      filename: "huge.bin",
      mime: "application/octet-stream",
      size: 60 * 1024 * 1024,
    }));
    expect(res.status).toBe(413);
  });

  it("returns signed upload URL on success", async () => {
    const res = await POST(makeRequest({
      chatId: "c1",
      filename: "report.pdf",
      mime: "application/pdf",
      size: 1024,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploadUrl).toContain("supabase.co");
    expect(body.token).toBe("test-token");
    expect(body.path).toContain("report.pdf");
    expect(body.id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ZOPEXPERT && npm test -- upload-url
```

Expected: 4 tests fail with "Cannot find module".

- [ ] **Step 3: Create `ZOPEXPERT/app/api/files/upload-url/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { FILE_LIMITS, STORAGE_BUCKET, makeStoragePath } from "@/lib/files";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    filename?: string;
    mime?: string;
    size?: number;
  };

  if (!body.chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }
  if (!body.filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (typeof body.size !== "number" || body.size <= 0) {
    return NextResponse.json({ error: "size is required" }, { status: 400 });
  }
  if (body.size > FILE_LIMITS.maxFileSizeBytes) {
    return NextResponse.json(
      {
        error: "File too large",
        detail: `Max ${FILE_LIMITS.maxFileSizeBytes / 1024 / 1024} MB per file`,
      },
      { status: 413 }
    );
  }

  const path = makeStoragePath(body.filename);
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to create upload URL", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: crypto.randomUUID(),
    uploadUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ZOPEXPERT && npm test -- upload-url
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add ZOPEXPERT/app/api/files/upload-url/
git commit -m "feat(zopexpert): add POST /api/files/upload-url (signed Supabase upload)"
```

---

## Task 4: `/api/files/confirm` route

**Files:**
- Create: `ZOPEXPERT/app/api/files/confirm/route.ts`

This is a thin endpoint that just validates and echoes back attachment metadata. No DB write — the actual `messages.attachments` write happens in `/api/hermes/chat`. This route exists so the browser can confirm the upload landed before sending the message.

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/files";
import type { Attachment } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    files?: Array<{
      id: string;
      path: string;
      filename: string;
      mime: string;
      size: number;
    }>;
  };

  if (!body.chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "files is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify each file exists in storage
  const attachments: Attachment[] = [];
  for (const f of body.files) {
    const { data } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(f.path.split("/").slice(0, -1).join("/"), {
        search: f.path.split("/").pop(),
      });
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: `File not found in storage: ${f.filename}` },
        { status: 404 }
      );
    }
    attachments.push({
      id: f.id,
      filename: f.filename,
      mime: f.mime,
      size: f.size,
      path: f.path,
      kind: "input",
    });
  }

  return NextResponse.json({ attachments });
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/app/api/files/confirm/
git commit -m "feat(zopexpert): add POST /api/files/confirm to verify uploads"
```

---

## Task 5: `/api/hermes-upload` route (TDD)

**Files:**
- Create: `ZOPEXPERT/app/api/hermes-upload/route.ts`
- Create: `ZOPEXPERT/app/api/hermes-upload/route.test.ts`

- [ ] **Step 1: Add `HERMES_UPLOAD_TOKEN` to test setup**

Modify `ZOPEXPERT/tests/setup.ts` — append:

```typescript
process.env.HERMES_UPLOAD_TOKEN = "test-upload-token";
```

- [ ] **Step 2: Write failing tests**

Create `ZOPEXPERT/app/api/hermes-upload/route.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({
          data: { path: "2026-05-21/uuid-report.docx" },
          error: null,
        }),
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz" },
          error: null,
        }),
      })),
    },
  })),
}));

import { POST } from "@/app/api/hermes-upload/route";

function makeRequest(token: string | null, formData: FormData) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/hermes-upload", {
    method: "POST",
    body: formData,
    headers,
  });
}

describe("POST /api/hermes-upload", () => {
  it("returns 401 without bearer token", async () => {
    const fd = new FormData();
    fd.append("filename", "x.docx");
    fd.append("file", new Blob(["x"]), "x.docx");
    const res = await POST(makeRequest(null, fd));
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong bearer token", async () => {
    const fd = new FormData();
    fd.append("filename", "x.docx");
    fd.append("file", new Blob(["x"]), "x.docx");
    const res = await POST(makeRequest("wrong-token", fd));
    expect(res.status).toBe(401);
  });

  it("returns 400 when file missing", async () => {
    const fd = new FormData();
    fd.append("filename", "x.docx");
    const res = await POST(makeRequest("test-upload-token", fd));
    expect(res.status).toBe(400);
  });

  it("returns signed URL on successful upload", async () => {
    const fd = new FormData();
    fd.append("filename", "report.docx");
    fd.append("file", new Blob(["content"]), "report.docx");
    const res = await POST(makeRequest("test-upload-token", fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("supabase.co");
    expect(body.path).toContain("report.docx");
    expect(body.id).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd ZOPEXPERT && npm test -- hermes-upload
```

Expected: 4 tests fail.

- [ ] **Step 4: Create `ZOPEXPERT/app/api/hermes-upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET, makeStoragePath } from "@/lib/files";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.HERMES_UPLOAD_TOKEN}`;
  if (!process.env.HERMES_UPLOAD_TOKEN || !constantTimeEqual(auth, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  const file = form.get("file");
  const filenameRaw = form.get("filename");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (typeof filenameRaw !== "string" || !filenameRaw) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const path = makeStoragePath(filenameRaw);
  const supabase = createServiceClient();

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Upload failed", detail: uploadError.message },
      { status: 500 }
    );
  }

  // Generate a 24h signed URL so the browser can download
  const { data: signed, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 24 * 60 * 60);

  if (signError || !signed) {
    return NextResponse.json(
      { error: "Could not sign URL", detail: signError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: crypto.randomUUID(),
    path,
    url: signed.signedUrl,
    filename: filenameRaw,
    size: file.size,
    mime: file.type || "application/octet-stream",
  });
}
```

- [ ] **Step 5: Run tests**

```bash
cd ZOPEXPERT && npm test -- hermes-upload
```

Expected: `4 passed`.

- [ ] **Step 6: Allow the route through the auth proxy**

Modify `ZOPEXPERT/proxy.ts` — change the `isPublic` block to add hermes-upload:

```typescript
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/hermes-upload") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";
```

- [ ] **Step 7: Commit**

```bash
git add ZOPEXPERT/app/api/hermes-upload/ ZOPEXPERT/tests/setup.ts ZOPEXPERT/proxy.ts
git commit -m "feat(zopexpert): add POST /api/hermes-upload (bearer-protected) for Hermes outputs"
```

---

## Task 6: Output URL parser

**Files:**
- Create: `ZOPEXPERT/lib/output-urls.ts`
- Create: `ZOPEXPERT/lib/output-urls.test.ts`

This module extracts Supabase Storage URLs from Hermes' assistant replies and resolves them to `Attachment` records.

- [ ] **Step 1: Write failing tests**

Create `ZOPEXPERT/lib/output-urls.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        list: vi.fn().mockResolvedValue({
          data: [{
            name: "uuid-report.docx",
            metadata: { size: 1234, mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          }],
          error: null,
        }),
      })),
    },
  })),
}));

import { extractOutputUrls, urlsToAttachments } from "@/lib/output-urls";

describe("extractOutputUrls", () => {
  it("extracts a single signed Supabase URL", () => {
    const text = "Done. Download here: https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz";
    expect(extractOutputUrls(text)).toEqual([
      "https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz",
    ]);
  });

  it("extracts multiple URLs", () => {
    const text = "Files: https://x.supabase.co/storage/v1/object/sign/chat-files/a.pdf?t=1 and https://x.supabase.co/storage/v1/object/sign/chat-files/b.xlsx?t=2";
    expect(extractOutputUrls(text)).toHaveLength(2);
  });

  it("returns empty array when no URLs", () => {
    expect(extractOutputUrls("nothing here")).toEqual([]);
  });

  it("does not match non-chat-files buckets", () => {
    expect(extractOutputUrls("https://x.supabase.co/storage/v1/object/sign/other-bucket/foo.pdf?t=1")).toEqual([]);
  });
});

describe("urlsToAttachments", () => {
  it("converts URLs to Attachment objects with output kind", async () => {
    const urls = ["https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz"];
    const result = await urlsToAttachments(urls);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("uuid-report.docx");
    expect(result[0].kind).toBe("output");
    expect(result[0].size).toBe(1234);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ZOPEXPERT && npm test -- output-urls
```

Expected: 5 tests fail.

- [ ] **Step 3: Create `ZOPEXPERT/lib/output-urls.ts`**

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/files";
import type { Attachment } from "@/lib/types";

const URL_PATTERN =
  /https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:sign|public)\/chat-files\/[^\s"'`)\]]+/gi;

export function extractOutputUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN);
  return matches ?? [];
}

function pathFromUrl(url: string): string {
  // ".../object/sign/chat-files/<path>?token=..." → "<path>"
  const match = url.match(/\/storage\/v1\/object\/(?:sign|public)\/chat-files\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse storage path from URL: ${url}`);
  return decodeURIComponent(match[1]);
}

export async function urlsToAttachments(urls: string[]): Promise<Attachment[]> {
  if (urls.length === 0) return [];
  const supabase = createServiceClient();
  const attachments: Attachment[] = [];

  for (const url of urls) {
    const path = pathFromUrl(url);
    const dir = path.split("/").slice(0, -1).join("/");
    const file = path.split("/").pop()!;
    const { data } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(dir, { search: file });
    const entry = data?.[0];
    attachments.push({
      id: crypto.randomUUID(),
      filename: file.replace(/^[a-f0-9-]+-/, ""),
      mime: (entry?.metadata?.mimetype as string) ?? "application/octet-stream",
      size: (entry?.metadata?.size as number) ?? 0,
      path,
      kind: "output",
    });
  }

  return attachments;
}
```

- [ ] **Step 4: Run tests**

```bash
cd ZOPEXPERT && npm test -- output-urls
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add ZOPEXPERT/lib/output-urls.ts ZOPEXPERT/lib/output-urls.test.ts
git commit -m "feat(zopexpert): add output-urls module (regex + metadata fetch)"
```

---

## Task 7: Modify `/api/hermes/chat`

**Files:**
- Modify: `ZOPEXPERT/app/api/hermes/chat/route.ts`
- Modify: `ZOPEXPERT/app/api/hermes/chat/route.test.ts`

- [ ] **Step 1: Update tests first**

Replace `ZOPEXPERT/app/api/hermes/chat/route.test.ts` with:

```typescript
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const insertCalls: Array<{ chat_id: string; role: string; content: string; attachments?: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn((row: { chat_id: string; role: string; content: string; attachments?: unknown }) => {
        insertCalls.push(row);
        return Promise.resolve({ error: null });
      }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/chat-files/abc.pdf?token=xyz" },
          error: null,
        }),
        list: vi.fn().mockResolvedValue({ data: [{ metadata: { size: 100, mimetype: "application/pdf" } }] }),
      })),
    },
  })),
}));

class MockOpenAI {
  chat = {
    completions: {
      create: vi.fn().mockResolvedValue(
        (async function* () {
          yield { choices: [{ delta: { content: "Hello" } }] };
          yield { choices: [{ delta: { content: " world" } }] };
        })()
      ),
    },
  };
  constructor(_opts: unknown) {}
}
vi.mock("openai", () => ({ default: MockOpenAI }));

import { POST } from "@/app/api/hermes/chat/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/hermes/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/hermes/chat", () => {
  it("returns 400 when chatId missing", async () => {
    const res = await POST(makeRequest({ message: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message missing", async () => {
    const res = await POST(makeRequest({ chatId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("streams text from Hermes when no attachments", async () => {
    insertCalls.length = 0;
    const res = await POST(makeRequest({ chatId: "c1", message: "hi" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Hello world");
  });

  it("accepts attachments and persists them on user message", async () => {
    insertCalls.length = 0;
    const attachments = [
      { id: "a1", filename: "report.pdf", mime: "application/pdf", size: 100, path: "2026-05-21/abc-report.pdf", kind: "input" },
    ];
    const res = await POST(makeRequest({ chatId: "c1", message: "analyze", attachments }));
    expect(res.status).toBe(200);
    await res.text(); // drain stream so assistant insert runs
    const userInsert = insertCalls.find((c) => c.role === "user");
    expect(userInsert?.attachments).toEqual(attachments);
  });
});
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd ZOPEXPERT && npm test -- hermes/chat
```

Expected: at least 1 new test fails (the attachments test).

- [ ] **Step 3: Replace `ZOPEXPERT/app/api/hermes/chat/route.ts` with:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { HISTORY_LIMIT, STORAGE_BUCKET } from "@/lib/files";
import { extractOutputUrls, urlsToAttachments } from "@/lib/output-urls";
import type { Attachment } from "@/lib/types";

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_URL ??
  "https://zopexpert.vercel.app";

function normaliseAppUrl(): string {
  const v = PUBLIC_BASE_URL.startsWith("http")
    ? PUBLIC_BASE_URL
    : `https://${PUBLIC_BASE_URL}`;
  return v.replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    message?: string;
    attachments?: Attachment[];
  };

  if (!body.chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }
  if (!body.message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const { chatId, message } = body;
  const attachments = body.attachments ?? [];
  const supabase = createServiceClient();

  // Persist user message with attachments
  await supabase.from("messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
    attachments,
  });

  // Build signed download URLs for any attachments
  let attachmentBlock = "";
  if (attachments.length > 0) {
    const signedLines: string[] = [];
    for (const a of attachments) {
      const { data } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(a.path, 60 * 60);
      if (data?.signedUrl) {
        signedLines.push(`- ${a.filename} (${a.mime}, ${a.size} bytes) → ${data.signedUrl}`);
      }
    }
    attachmentBlock = signedLines.length
      ? `[ZOPEXPERT context]\nYou have file tools (terminal, Python). The user attached the following files. Download with curl:\n${signedLines.join(
          "\n"
        )}\n\nTools available: pdfplumber, python-docx, openpyxl, pandas, Pillow+tesseract, reportlab, weasyprint.\n\nIf you generate output files, upload them with:\ncurl -X POST ${normaliseAppUrl()}/api/hermes-upload -H "Authorization: Bearer $HERMES_UPLOAD_TOKEN" -F "file=@/tmp/output" -F "filename=<name>"\nThe response JSON contains a "url" field — include that URL verbatim in your reply so the UI renders a download button.\n\n---\n\nUser message: ${message}`
      : "";
  }

  const outboundContent = attachmentBlock || message;

  // Load up to 200 messages for context
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  const contextMessages = ((history ?? []) as Array<{ role: "user" | "assistant"; content: string }>).slice(
    0,
    -1 // drop the just-inserted user row; we replace it with the augmented version below
  );
  contextMessages.push({ role: "user", content: outboundContent });

  const openai = new OpenAI({
    baseURL: process.env.HERMES_BASE_URL,
    apiKey: process.env.HERMES_API_KEY!,
  });

  let stream;
  try {
    stream = await openai.chat.completions.create({
      model: "hermes-agent",
      stream: true,
      messages: contextMessages,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Hermes call failed";
    return NextResponse.json(
      { error: "Hermes unavailable", detail },
      { status: 502 }
    );
  }

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
        const outputUrls = extractOutputUrls(fullContent);
        const outputAttachments = await urlsToAttachments(outputUrls);
        await supabase.from("messages").insert({
          chat_id: chatId,
          role: "assistant",
          content: fullContent,
          attachments: outputAttachments,
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

- [ ] **Step 4: Run all tests**

```bash
cd ZOPEXPERT && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add ZOPEXPERT/app/api/hermes/chat/
git commit -m "feat(zopexpert): chat route handles attachments, 200-msg history, output URLs"
```

---

## Task 8: `useFileUpload` hook

**Files:**
- Create: `ZOPEXPERT/hooks/useFileUpload.ts`

Encapsulates the 3-step upload flow: get signed URL → PUT to Supabase → confirm.

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState, useCallback } from "react";
import type { Attachment } from "@/lib/types";
import { FILE_LIMITS } from "@/lib/files";

type UploadingFile = {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
  attachment?: Attachment;
};

export function useFileUpload(chatId: string) {
  const [files, setFiles] = useState<UploadingFile[]>([]);

  const update = useCallback((id: string, patch: Partial<UploadingFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const uploadOne = useCallback(
    async (uf: UploadingFile) => {
      update(uf.id, { status: "uploading", progress: 0 });

      // 1. Request signed upload URL
      const urlResp = await fetch("/api/files/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          filename: uf.file.name,
          mime: uf.file.type || "application/octet-stream",
          size: uf.file.size,
        }),
      });

      if (!urlResp.ok) {
        const err = await urlResp.json().catch(() => ({}));
        update(uf.id, {
          status: "error",
          errorMessage: err.error || `HTTP ${urlResp.status}`,
        });
        return;
      }

      const { id, uploadUrl, path } = (await urlResp.json()) as {
        id: string;
        uploadUrl: string;
        token: string;
        path: string;
      };

      // 2. PUT the file to Supabase Storage via XHR (gives us progress)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader(
          "Content-Type",
          uf.file.type || "application/octet-stream"
        );
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            update(uf.id, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(uf.file);
      }).catch((err: Error) => {
        update(uf.id, { status: "error", errorMessage: err.message });
        throw err;
      });

      // 3. Confirm with server
      const confirmResp = await fetch("/api/files/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          files: [
            {
              id,
              path,
              filename: uf.file.name,
              mime: uf.file.type || "application/octet-stream",
              size: uf.file.size,
            },
          ],
        }),
      });
      if (!confirmResp.ok) {
        update(uf.id, { status: "error", errorMessage: "Confirm failed" });
        return;
      }

      const { attachments } = (await confirmResp.json()) as {
        attachments: Attachment[];
      };
      update(uf.id, {
        status: "done",
        progress: 100,
        attachment: attachments[0],
      });
    },
    [chatId, update]
  );

  const enqueue = useCallback(
    (incoming: File[]) => {
      const slotsLeft = FILE_LIMITS.maxFilesPerMessage - files.length;
      const accepted = incoming.slice(0, slotsLeft);
      const newOnes: UploadingFile[] = accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: "pending",
      }));
      setFiles((prev) => [...prev, ...newOnes]);
      for (const uf of newOnes) {
        if (uf.file.size > FILE_LIMITS.maxFileSizeBytes) {
          update(uf.id, {
            status: "error",
            errorMessage: "Файлът надвишава 50 MB",
          });
          continue;
        }
        void uploadOne(uf);
      }
    },
    [files.length, uploadOne, update]
  );

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  const completedAttachments: Attachment[] = files
    .filter((f) => f.status === "done" && f.attachment)
    .map((f) => f.attachment!);

  const isUploading = files.some((f) => f.status === "uploading" || f.status === "pending");

  return {
    files,
    enqueue,
    remove,
    clear,
    completedAttachments,
    isUploading,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/hooks/useFileUpload.ts
git commit -m "feat(zopexpert): add useFileUpload hook (signed URL → PUT → confirm)"
```

---

## Task 9: `FileChip` component

**Files:**
- Create: `ZOPEXPERT/components/FileChip.tsx`

Used both in the pre-send queue (with progress + remove) and inside user message bubbles (compact, no progress).

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { X, FileText } from "lucide-react";
import { formatBytes } from "@/lib/files";

type FileChipProps = {
  filename: string;
  size: number;
  progress?: number; // 0..100 when uploading
  status?: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
  onRemove?: () => void;
};

export function FileChip({
  filename,
  size,
  progress,
  status = "done",
  errorMessage,
  onRemove,
}: FileChipProps) {
  const isError = status === "error";
  const isUploading = status === "uploading" || status === "pending";

  return (
    <div
      title={isError ? errorMessage : filename}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px 4px 8px",
        background: isError
          ? "rgba(239, 68, 68, 0.12)"
          : "var(--color-bg-glass)",
        border: `1px solid ${
          isError ? "rgba(239, 68, 68, 0.5)" : "var(--color-border)"
        }`,
        borderRadius: 6,
        fontSize: 11,
        color: "var(--color-text-primary)",
        overflow: "hidden",
        maxWidth: 180,
      }}
    >
      <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {filename}
      </span>
      <span style={{ opacity: 0.6, flexShrink: 0 }}>{formatBytes(size)}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Премахни файл"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <X size={12} />
        </button>
      )}
      {isUploading && typeof progress === "number" && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: 2,
            width: `${progress}%`,
            background: "var(--color-accent-violet)",
            transition: "width 100ms linear",
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/components/FileChip.tsx
git commit -m "feat(zopexpert): add FileChip component"
```

---

## Task 10: `DownloadChip` component

**Files:**
- Create: `ZOPEXPERT/components/DownloadChip.tsx`

Used in assistant bubbles to show generated output files with a Download button.

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/files";
import type { Attachment } from "@/lib/types";

export function DownloadChip({ attachment }: { attachment: Attachment }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const resp = await fetch(
        `/api/files/download?path=${encodeURIComponent(attachment.path)}`
      );
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: "var(--color-bg-deep)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        marginTop: 8,
        fontSize: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--color-text-primary)",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {attachment.filename}
        </div>
        <div style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>
          {formatBytes(attachment.size)}
        </div>
      </div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          background: "var(--color-accent-violet)",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontSize: 11,
          padding: "6px 10px",
          cursor: loading ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        Свали
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create the download API route**

The DownloadChip references `/api/files/download` — create it.

Create `ZOPEXPERT/app/api/files/download/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/files";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (error || !data) {
    return NextResponse.json(
      { error: "File not found", detail: error?.message },
      { status: 404 }
    );
  }

  const filename = path.split("/").pop() ?? "download";
  return new Response(data, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename.replace(/^[a-f0-9-]+-/, "")}"`,
      "Content-Type": data.type || "application/octet-stream",
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add ZOPEXPERT/components/DownloadChip.tsx ZOPEXPERT/app/api/files/download/
git commit -m "feat(zopexpert): add DownloadChip + /api/files/download route"
```

---

## Task 11: Update `useChat` hook

**Files:**
- Modify: `ZOPEXPERT/hooks/useChat.ts`

- [ ] **Step 1: Replace the file with:**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, Attachment } from "@/lib/types";

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setMessages(
            (data as Array<Message & { attachments?: Attachment[] | null }>).map((m) => ({
              ...m,
              attachments: m.attachments ?? [],
            }))
          );
        }
      });
  }, [chatId]);

  const sendMessage = useCallback(
    async (content: string, attachments: Attachment[] = []) => {
      if (isLoading) return;
      if (!content.trim() && attachments.length === 0) return;
      setIsLoading(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
        attachments,
      };
      setMessages((prev) => [...prev, userMsg]);

      const streamingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: streamingId,
          chat_id: chatId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          attachments: [],
        },
      ]);

      try {
        const response = await fetch("/api/hermes/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            message: content.trim(),
            attachments,
          }),
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

        // Reload the just-saved assistant message to pull any output attachments
        const supabase = createClient();
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const saved = data[0] as Message & { attachments?: Attachment[] | null };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId
                ? { ...m, attachments: saved.attachments ?? [] }
                : m
            )
          );
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, isLoading]
  );

  const clearChat = useCallback(async () => {
    await fetch(`/api/hermes/messages?chatId=${chatId}`, { method: "DELETE" });
    setMessages([]);
  }, [chatId]);

  return { messages, isLoading, sendMessage, clearChat };
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/hooks/useChat.ts
git commit -m "feat(zopexpert): useChat accepts attachments and pulls output files after stream"
```

---

## Task 12: Update `ChatMessage` component

**Files:**
- Modify: `ZOPEXPERT/components/ChatMessage.tsx`

- [ ] **Step 1: Replace the file with:**

```typescript
import type { Message } from "@/lib/types";
import { FileChip } from "@/components/FileChip";
import { DownloadChip } from "@/components/DownloadChip";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const inputAttachments = (message.attachments ?? []).filter((a) => a.kind === "input");
  const outputAttachments = (message.attachments ?? []).filter((a) => a.kind === "output");

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
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
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
        {inputAttachments.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: message.content ? 8 : 0,
            }}
          >
            {inputAttachments.map((a) => (
              <FileChip
                key={a.id}
                filename={a.filename}
                size={a.size}
                status="done"
              />
            ))}
          </div>
        )}
        {message.content || (
          inputAttachments.length === 0 && (
            <span style={{ opacity: 0.4, fontFamily: "monospace" }}>▋</span>
          )
        )}
        {outputAttachments.length > 0 && (
          <div>
            {outputAttachments.map((a) => (
              <DownloadChip key={a.id} attachment={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/components/ChatMessage.tsx
git commit -m "feat(zopexpert): ChatMessage renders input + output attachments"
```

---

## Task 13: Update `ChatPanel` with drag-drop, paperclip, fullscreen

**Files:**
- Modify: `ZOPEXPERT/components/ChatPanel.tsx`

- [ ] **Step 1: Replace the file with:**

```typescript
"use client";

import { useRef, useEffect, useState } from "react";
import { Send, Paperclip, Maximize2, Minimize2 } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useFileUpload } from "@/hooks/useFileUpload";
import { ChatMessage } from "@/components/ChatMessage";
import { FileChip } from "@/components/FileChip";
import { FILE_LIMITS } from "@/lib/files";
import type { Chat } from "@/lib/types";

type Props = {
  chat: Chat;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
};

export function ChatPanel({ chat, isFullscreen, onToggleFullscreen }: Props) {
  const { messages, isLoading, sendMessage, clearChat } = useChat(chat.id);
  const { files, enqueue, remove, clear, completedAttachments, isUploading } =
    useFileUpload(chat.id);
  const [input, setInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (isUploading) return;
    if (!text && completedAttachments.length === 0) return;
    setInput("");
    const attachmentsCopy = [...completedAttachments];
    clear();
    await sendMessage(text, attachmentsCopy);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragOver(false);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) enqueue(dropped);
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) enqueue(Array.from(e.target.files));
    e.target.value = "";
  }

  const containerStyle: React.CSSProperties = isFullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-deep)",
        border: "none",
        borderRadius: 0,
        overflow: "hidden",
      }
    : {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--color-bg-deep)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
      };

  const messageContainerStyle: React.CSSProperties = isFullscreen
    ? { maxWidth: 800, margin: "0 auto", width: "100%" }
    : {};

  const messageFontSize = isFullscreen ? 15 : 13;

  return (
    <div
      style={containerStyle}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "rgba(124, 58, 237, 0.08)",
            border: "2px dashed var(--color-accent-violet)",
            borderRadius: isFullscreen ? 0 : 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--color-accent-violet)",
          }}
        >
          Пусни файла тук
        </div>
      )}

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Минимизирай" : "На цял екран"}
            style={iconBtnStyle}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
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
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          minHeight: 0,
        }}
      >
        <div style={messageContainerStyle}>
          {messages.length === 0 && !isLoading && (
            <p
              style={{
                color: "var(--color-text-tertiary)",
                fontSize: 12,
                textAlign: "center",
                marginTop: 24,
              }}
            >
              Напишете нещо или плъзнете файл тук...
            </p>
          )}
          <div style={{ fontSize: messageFontSize }}>
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* File chips queue */}
      {files.length > 0 && (
        <div
          style={{
            padding: "8px 14px 0",
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            flexShrink: 0,
          }}
        >
          {files.map((f) => (
            <FileChip
              key={f.id}
              filename={f.file.name}
              size={f.file.size}
              progress={f.progress}
              status={f.status}
              errorMessage={f.errorMessage}
              onRemove={() => remove(f.id)}
            />
          ))}
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              alignSelf: "center",
              marginLeft: 4,
            }}
          >
            {files.length}/{FILE_LIMITS.maxFilesPerMessage}
          </span>
        </div>
      )}

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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onPickFiles}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Прикрепи файл"
          disabled={files.length >= FILE_LIMITS.maxFilesPerMessage}
          style={{
            ...iconBtnStyle,
            opacity:
              files.length >= FILE_LIMITS.maxFilesPerMessage ? 0.4 : 0.8,
          }}
        >
          <Paperclip size={15} />
        </button>
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
          disabled={
            isLoading ||
            isUploading ||
            (!input.trim() && completedAttachments.length === 0)
          }
          style={{
            background: "var(--color-accent-violet)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            padding: "8px 12px",
            cursor:
              isLoading || isUploading ? "not-allowed" : "pointer",
            opacity:
              isLoading ||
              isUploading ||
              (!input.trim() && completedAttachments.length === 0)
                ? 0.45
                : 1,
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

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
};
```

- [ ] **Step 2: Commit**

```bash
git add ZOPEXPERT/components/ChatPanel.tsx
git commit -m "feat(zopexpert): ChatPanel drag-drop, paperclip, fullscreen toggle"
```

---

## Task 14: Page-level fullscreen state + ESC handler

**Files:**
- Modify: `ZOPEXPERT/app/page.tsx`

The main page becomes a thin client wrapper around a server-fetched list of chats.

- [ ] **Step 1: Split into server fetch + client render**

Modify `ZOPEXPERT/app/page.tsx` to:

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import type { Chat } from "@/lib/types";
import { ChatGrid } from "@/components/ChatGrid";

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
      <ChatGrid chats={chats} />
    </main>
  );
}
```

- [ ] **Step 2: Create the client wrapper `ZOPEXPERT/components/ChatGrid.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import type { Chat } from "@/lib/types";

export function ChatGrid({ chats }: { chats: Chat[] }) {
  const [fullscreenChatId, setFullscreenChatId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullscreenChatId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreenChatId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenChatId]);

  if (fullscreenChatId) {
    const chat = chats.find((c) => c.id === fullscreenChatId);
    if (chat) {
      return (
        <ChatPanel
          chat={chat}
          isFullscreen
          onToggleFullscreen={() => setFullscreenChatId(null)}
        />
      );
    }
  }

  return (
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
        <ChatPanel
          key={chat.id}
          chat={chat}
          isFullscreen={false}
          onToggleFullscreen={() => setFullscreenChatId(chat.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck and tests**

```bash
cd ZOPEXPERT && npm run typecheck && npm test
```

Expected: no type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add ZOPEXPERT/app/page.tsx ZOPEXPERT/components/ChatGrid.tsx
git commit -m "feat(zopexpert): page-level fullscreen state + ESC handler"
```

---

## Task 15: Generate HERMES_UPLOAD_TOKEN and update env

**Files:** none (env config only)

- [ ] **Step 1: Generate a random token**

```bash
openssl rand -hex 32
```

Or in PowerShell:

```powershell
[System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()
```

Copy the resulting hex string — call it `<TOKEN>`.

- [ ] **Step 2: Add to Vercel env vars**

```bash
cd ZOPEXPERT
export PATH="/c/Users/User/AppData/Roaming/npm:/c/Program Files/nodejs:$PATH"
for env in production preview development; do
  echo "<TOKEN>" | vercel env add HERMES_UPLOAD_TOKEN $env
done
```

Replace `<TOKEN>` with the value from Step 1.

- [ ] **Step 3: Add to local `.env.local`**

Append to `ZOPEXPERT/.env.local`:

```
HERMES_UPLOAD_TOKEN=<TOKEN>
```

- [ ] **Step 4: Tell the Hermes operator**

Send this message to the Hermes operator (Telegram bot):

```
Добави в /root/.hermes/.env:

HERMES_UPLOAD_TOKEN=<TOKEN>

Този token е shared secret между Hermes и ZOPEXPERT. Когато генерираш файлове за upload обратно в ZOPEXPERT, използвай:

curl -X POST https://zopexpert.vercel.app/api/hermes-upload \
  -H "Authorization: Bearer $HERMES_UPLOAD_TOKEN" \
  -F "file=@/tmp/your-output.docx" \
  -F "filename=output.docx"

Отговорът е JSON с поле "url" — върни този URL в чат отговора си verbatim.

После рестартирай: hermes gateway restart
```

---

## Task 16: Deploy and smoke test

**Files:** none (deployment + verification)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\User\Documents\Бизнес\ZOPEXPERT"
git push "https://emmgivailopetev38-png:<GITHUB_PAT>@github.com/emmgivailopetev38-png/Petyr-Petev.git" main:main
```

Replace `<GITHUB_PAT>` with the personal access token.

- [ ] **Step 2: Deploy to Vercel production**

```bash
cd "C:\Users\User\Documents\Бизнес\ZOPEXPERT"
export PATH="/c/Users/User/AppData/Roaming/npm:/c/Program Files/nodejs:$PATH"
vercel --prod
```

Wait for "READY" state and a `https://zopexpert.vercel.app` deployment.

- [ ] **Step 3: Manual smoke test in browser**

1. Open https://zopexpert.vercel.app
2. Log in with `ZopExpert2026!Secure`
3. Click maximize icon on Chat 1 → enters fullscreen, click minimize or press ESC → exits
4. In Chat 1, drag a small PDF onto the panel → chip appears with progress
5. Type "Каква е първата таблица в този документ?" + Send
6. Watch streamed response. If Hermes generates an output file, a download chip appears under the assistant bubble
7. Click "Свали" → file downloads with original filename

- [ ] **Step 4: Final commit (no code changes — just marker)**

```bash
cd "C:\Users\User\Documents\Бизнес\ZOPEXPERT"
git commit --allow-empty -m "release: file attachments + fullscreen live"
git push
```

---

## Post-Deploy Notes

- The Hermes Cloudflare quick-tunnel URL (`asked-pupils-midlands-airport.trycloudflare.com`) is volatile. When it changes, update `HERMES_BASE_URL` env on Vercel and redeploy.
- Watch Supabase Storage usage — 1 GB free tier limit. View at https://supabase.com/dashboard/project/ggqaypkdovquuqisglip/storage/usage.
- Output files older than X days can be auto-cleaned later via a Supabase scheduled function (not part of this iteration).
