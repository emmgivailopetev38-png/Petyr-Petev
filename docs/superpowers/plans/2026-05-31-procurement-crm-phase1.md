# Procurement CRM Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a procurement pipeline CRM to ZOPEXPERT with manual procurement entry, Kanban view, detail page with notes, and a 🛰️ Мониторинг button on every chat panel that opens a modal for creating/listing procurements for that workspace.

**Architecture:** New `procurements` table is the central entity (anchored by `aop_id` if from ЦАИС, but for now everything is manual). Three supporting tables: `procurement_notes`, `procurement_tasks`, `procurement_events`. Manual entry only (no ЦАИС scraping yet). Each workspace has a new "Monitor" modal launched from the chat header — paste/fill procurement details → creates row → appears in pipeline. `/procurements` shows a Kanban grouped by status. Status changes write to `procurement_events`.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + RLS, React 19, `lucide-react` for icons, Vitest 4. No new dependencies.

---

## File Map

```
ZOPEXPERT/
├── supabase/migrations/
│   └── 009_procurements.sql                    # CREATE: procurements + notes + tasks + events + subscription tables
├── lib/
│   └── procurements/
│       ├── types.ts                            # CREATE: Procurement, ProcurementNote, etc.
│       └── status.ts                           # CREATE: status enum, transitions, labels
├── app/
│   ├── api/
│   │   ├── procurements/
│   │   │   ├── route.ts                        # CREATE: GET (list with filters), POST (manual create)
│   │   │   └── [id]/
│   │   │       ├── route.ts                    # CREATE: GET, PATCH
│   │   │       └── notes/
│   │   │           └── route.ts                # CREATE: POST (append note)
│   │   └── workspaces/
│   │       └── [id]/
│   │           └── subscription/
│   │               └── route.ts                # CREATE: GET, PUT
│   ├── procurements/
│   │   ├── page.tsx                            # CREATE: server-rendered list, ProcurementsBoard client wrapper
│   │   ├── ProcurementsBoard.tsx               # CREATE: Kanban board with filters
│   │   ├── ProcurementCard.tsx                 # CREATE: single card
│   │   └── [id]/
│   │       ├── page.tsx                        # CREATE: server fetch + ProcurementDetail client wrapper
│   │       └── ProcurementDetail.tsx           # CREATE: tab layout (Overview, Notes)
│   └── page.tsx                                # MODIFY: add 📋 link
└── components/
    ├── MonitorMenu.tsx                         # CREATE: 🛰️ button + modal with 3 tabs
    └── ChatPanel.tsx                           # MODIFY: add MonitorMenu to header
```

---

## Task 1: DB migration

**Files:**
- Create: `ZOPEXPERT/supabase/migrations/009_procurements.sql`

The migration applies via Supabase MCP — no manual paste needed.

- [ ] **Step 1: Create `ZOPEXPERT/supabase/migrations/009_procurements.sql`**

```sql
-- Main procurement entity
create table if not exists procurements (
  id                  uuid primary key default gen_random_uuid(),
  aop_id              text unique,
  source              text not null default 'manual'
                      check (source in ('cais', 'manual', 'open-data')),
  source_url          text,

  title               text not null,
  publisher           text,
  publisher_meta      jsonb default '{}'::jsonb,
  procedure_type      text,
  estimated_value     numeric,
  currency            text default 'BGN',
  publication_date    timestamptz,
  submission_deadline timestamptz,
  description         text,

  workspace_id        uuid references chats(id) on delete set null,
  status              text not null default 'new'
                      check (status in ('new','qualifying','go','no_go','preparing','submitted','won','lost','withdrawn')),
  priority            int default 3 check (priority between 1 and 5),
  owner_email         text,
  go_no_go_notes      text,
  linked_chat_id      uuid references chats(id) on delete set null,

  risk_level          int check (risk_level between 0 and 10),
  risk_notes          text,
  draft_appeal        text,
  vertical            text,

  fetched_at          timestamptz not null default now(),
  analysed_at         timestamptz,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index if not exists procurements_workspace_idx     on procurements(workspace_id);
create index if not exists procurements_status_idx        on procurements(status);
create index if not exists procurements_vertical_idx      on procurements(vertical);
create index if not exists procurements_deadline_idx      on procurements(submission_deadline);
create index if not exists procurements_aop_idx           on procurements(aop_id);

-- Notes
create table if not exists procurement_notes (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  author_email    text,
  content         text not null,
  created_at      timestamptz default now()
);
create index if not exists procurement_notes_proc_idx on procurement_notes(procurement_id, created_at desc);

-- Tasks
create table if not exists procurement_tasks (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  title           text not null,
  description     text,
  due_date        timestamptz,
  owner_email     text,
  done            boolean default false,
  created_at      timestamptz default now()
);
create index if not exists procurement_tasks_proc_idx on procurement_tasks(procurement_id, due_date);

-- Audit trail
create table if not exists procurement_events (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  event_type      text not null,
  payload         jsonb default '{}'::jsonb,
  actor_email     text,
  occurred_at     timestamptz default now()
);
create index if not exists procurement_events_proc_idx on procurement_events(procurement_id, occurred_at desc);

-- Workspace monitor subscription
create table if not exists workspace_monitor_subscriptions (
  workspace_id    uuid primary key references chats(id) on delete cascade,
  enabled         boolean not null default true,
  vertical_filter text,
  min_value       numeric,
  max_value       numeric,
  updated_at      timestamptz default now()
);

-- RLS
alter table procurements                       enable row level security;
alter table procurement_notes                  enable row level security;
alter table procurement_tasks                  enable row level security;
alter table procurement_events                 enable row level security;
alter table workspace_monitor_subscriptions    enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='procurements' and policyname='anon read procurements') then
    create policy "anon read procurements" on procurements for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='procurement_notes' and policyname='anon read procurement_notes') then
    create policy "anon read procurement_notes" on procurement_notes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='procurement_tasks' and policyname='anon read procurement_tasks') then
    create policy "anon read procurement_tasks" on procurement_tasks for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='procurement_events' and policyname='anon read procurement_events') then
    create policy "anon read procurement_events" on procurement_events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workspace_monitor_subscriptions' and policyname='anon read workspace_monitor_subscriptions') then
    create policy "anon read workspace_monitor_subscriptions" on workspace_monitor_subscriptions for select using (true);
  end if;
end $$;

-- Auto-update procurements.updated_at on row change
create or replace function bump_procurement_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end
$$ language plpgsql;

drop trigger if exists trg_procurements_updated on procurements;
create trigger trg_procurements_updated
  before update on procurements
  for each row execute function bump_procurement_updated_at();
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Call `mcp__afb5a06c-9a73-45ba-a63e-b8717e1c7685__apply_migration` with `name = "009_procurements"`, `project_id = "ggqaypkdovquuqisglip"`, and the SQL above as `query`.

Expected: `{"success": true}`.

- [ ] **Step 3: Verify**

Call `mcp__afb5a06c-9a73-45ba-a63e-b8717e1c7685__execute_sql` with:

```sql
select table_name from information_schema.tables 
where table_schema = 'public' 
  and table_name in ('procurements','procurement_notes','procurement_tasks','procurement_events','workspace_monitor_subscriptions')
order by table_name;
```

Expected: 5 rows.

- [ ] **Step 4: Commit**

```bash
cd ZOPEXPERT
git add supabase/migrations/009_procurements.sql
git commit -m "feat(crm): procurements + notes + tasks + events + subscription schema"
```

---

## Task 2: Shared types + status helpers

**Files:**
- Create: `ZOPEXPERT/lib/procurements/types.ts`
- Create: `ZOPEXPERT/lib/procurements/status.ts`

- [ ] **Step 1: Create `ZOPEXPERT/lib/procurements/types.ts`**

```typescript
export type ProcurementStatus =
  | "new"
  | "qualifying"
  | "go"
  | "no_go"
  | "preparing"
  | "submitted"
  | "won"
  | "lost"
  | "withdrawn";

export type Procurement = {
  id: string;
  aop_id: string | null;
  source: "cais" | "manual" | "open-data";
  source_url: string | null;

  title: string;
  publisher: string | null;
  publisher_meta: Record<string, unknown>;
  procedure_type: string | null;
  estimated_value: number | null;
  currency: string;
  publication_date: string | null;
  submission_deadline: string | null;
  description: string | null;

  workspace_id: string | null;
  status: ProcurementStatus;
  priority: number;
  owner_email: string | null;
  go_no_go_notes: string | null;
  linked_chat_id: string | null;

  risk_level: number | null;
  risk_notes: string | null;
  draft_appeal: string | null;
  vertical: string | null;

  fetched_at: string;
  analysed_at: string | null;
  updated_at: string;
  created_at: string;
};

export type ProcurementNote = {
  id: string;
  procurement_id: string;
  author_email: string | null;
  content: string;
  created_at: string;
};

export type ProcurementTask = {
  id: string;
  procurement_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  owner_email: string | null;
  done: boolean;
  created_at: string;
};

export type ProcurementEvent = {
  id: string;
  procurement_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_email: string | null;
  occurred_at: string;
};

export type WorkspaceMonitorSubscription = {
  workspace_id: string;
  enabled: boolean;
  vertical_filter: string | null;
  min_value: number | null;
  max_value: number | null;
  updated_at: string;
};
```

- [ ] **Step 2: Create `ZOPEXPERT/lib/procurements/status.ts`**

```typescript
import type { ProcurementStatus } from "@/lib/procurements/types";

export const STATUS_LABELS: Record<ProcurementStatus, string> = {
  new:        "Нови",
  qualifying: "Квалификация",
  go:         "Go",
  no_go:      "No-Go",
  preparing:  "Подготовка",
  submitted:  "Подадена",
  won:        "Спечелена",
  lost:       "Загубена",
  withdrawn:  "Оттеглена",
};

export const STATUS_COLORS: Record<ProcurementStatus, string> = {
  new:        "var(--color-ink-muted)",
  qualifying: "var(--color-gold-warm)",
  go:         "var(--color-success)",
  no_go:      "var(--color-ink-faint)",
  preparing:  "var(--color-burgundy-deep)",
  submitted:  "var(--color-burgundy-bright)",
  won:        "var(--color-success)",
  lost:       "var(--color-error)",
  withdrawn:  "var(--color-ink-faint)",
};

export const ACTIVE_STATUSES: ProcurementStatus[] = [
  "new", "qualifying", "go", "preparing", "submitted",
];

export const CLOSED_STATUSES: ProcurementStatus[] = [
  "no_go", "won", "lost", "withdrawn",
];

export const ALL_STATUSES: ProcurementStatus[] = [
  ...ACTIVE_STATUSES, ...CLOSED_STATUSES,
];
```

- [ ] **Step 3: Run typecheck**

```bash
cd ZOPEXPERT && export PATH="/c/Program Files/nodejs:$PATH" && npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ZOPEXPERT
git add lib/procurements/
git commit -m "feat(crm): procurement types + status enum/labels/colors"
```

---

## Task 3: API — list + create

**Files:**
- Create: `ZOPEXPERT/app/api/procurements/route.ts`

- [ ] **Step 1: Create `ZOPEXPERT/app/api/procurements/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ALL_STATUSES } from "@/lib/procurements/status";
import type { ProcurementStatus } from "@/lib/procurements/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const workspaceId = sp.get("workspaceId");
  const status = sp.get("status");
  const vertical = sp.get("vertical");
  const limit = Math.min(
    Number.parseInt(sp.get("limit") ?? "200", 10) || 200,
    500,
  );

  const supabase = createServiceClient();
  let q = supabase
    .from("procurements")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (status && ALL_STATUSES.includes(status as ProcurementStatus)) {
    q = q.eq("status", status);
  }
  if (vertical) q = q.eq("vertical", vertical);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ procurements: data ?? [] });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const row = {
    title,
    aop_id:              typeof body.aop_id === "string" && body.aop_id ? body.aop_id : null,
    source:              typeof body.source === "string" && ["cais","manual","open-data"].includes(body.source) ? body.source : "manual",
    source_url:          typeof body.source_url === "string" ? body.source_url : null,
    publisher:           typeof body.publisher === "string" ? body.publisher : null,
    procedure_type:      typeof body.procedure_type === "string" ? body.procedure_type : null,
    estimated_value:     typeof body.estimated_value === "number" ? body.estimated_value : null,
    currency:            typeof body.currency === "string" ? body.currency : "BGN",
    publication_date:    typeof body.publication_date === "string" ? body.publication_date : null,
    submission_deadline: typeof body.submission_deadline === "string" ? body.submission_deadline : null,
    description:         typeof body.description === "string" ? body.description : null,
    workspace_id:        typeof body.workspace_id === "string" ? body.workspace_id : null,
    status:              typeof body.status === "string" && ALL_STATUSES.includes(body.status as ProcurementStatus) ? body.status : "new",
    priority:            typeof body.priority === "number" ? body.priority : 3,
    owner_email:         typeof body.owner_email === "string" ? body.owner_email : null,
    vertical:            typeof body.vertical === "string" ? body.vertical : null,
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("procurements")
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Could not create procurement", detail: error?.message },
      { status: 500 },
    );
  }

  await supabase.from("procurement_events").insert({
    procurement_id: (data as { id: string }).id,
    event_type: "created",
    payload: { source: row.source, workspace_id: row.workspace_id },
  });

  return NextResponse.json({ procurement: data });
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd ZOPEXPERT && npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ZOPEXPERT
git add app/api/procurements/route.ts
git commit -m "feat(crm): GET (list) + POST (manual create) procurements API"
```

---

## Task 4: API — detail + patch + notes

**Files:**
- Create: `ZOPEXPERT/app/api/procurements/[id]/route.ts`
- Create: `ZOPEXPERT/app/api/procurements/[id]/notes/route.ts`

- [ ] **Step 1: Create `ZOPEXPERT/app/api/procurements/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ALL_STATUSES } from "@/lib/procurements/status";
import type { ProcurementStatus } from "@/lib/procurements/types";

const ALLOWED_PATCH_FIELDS = [
  "title",
  "publisher",
  "procedure_type",
  "estimated_value",
  "currency",
  "publication_date",
  "submission_deadline",
  "description",
  "workspace_id",
  "status",
  "priority",
  "owner_email",
  "go_no_go_notes",
  "risk_level",
  "risk_notes",
  "draft_appeal",
  "vertical",
  "linked_chat_id",
] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: procurement }, { data: notes }, { data: tasks }, { data: events }] = await Promise.all([
    supabase.from("procurements").select("*").eq("id", id).single(),
    supabase.from("procurement_notes").select("*").eq("procurement_id", id).order("created_at", { ascending: false }),
    supabase.from("procurement_tasks").select("*").eq("procurement_id", id).order("due_date", { ascending: true }),
    supabase.from("procurement_events").select("*").eq("procurement_id", id).order("occurred_at", { ascending: false }).limit(50),
  ]);

  if (!procurement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    procurement,
    notes: notes ?? [],
    tasks: tasks ?? [],
    events: events ?? [],
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_PATCH_FIELDS) {
    if (key in body) {
      const value = body[key];
      if (key === "status" && typeof value === "string") {
        if (!ALL_STATUSES.includes(value as ProcurementStatus)) {
          return NextResponse.json({ error: `Invalid status: ${value}` }, { status: 400 });
        }
      }
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch previous status for event log
  const { data: prev } = await supabase
    .from("procurements")
    .select("status")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("procurements")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  if (updates.status && prev && (prev as { status: string }).status !== updates.status) {
    await supabase.from("procurement_events").insert({
      procurement_id: id,
      event_type: "status_change",
      payload: { from: (prev as { status: string }).status, to: updates.status },
    });
  }

  return NextResponse.json({ procurement: data });
}
```

- [ ] **Step 2: Create `ZOPEXPERT/app/api/procurements/[id]/notes/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const authorEmail = typeof body.author_email === "string" ? body.author_email : null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("procurement_notes")
    .insert({ procurement_id: id, content, author_email: authorEmail })
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  await supabase.from("procurement_events").insert({
    procurement_id: id,
    event_type: "note_added",
    payload: { note_id: (data as { id: string }).id },
    actor_email: authorEmail,
  });

  return NextResponse.json({ note: data });
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd ZOPEXPERT && npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ZOPEXPERT
git add app/api/procurements/
git commit -m "feat(crm): procurement detail GET/PATCH + note POST APIs"
```

---

## Task 5: API — workspace subscription

**Files:**
- Create: `ZOPEXPERT/app/api/workspaces/[id]/subscription/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("workspace_monitor_subscriptions")
    .select("*")
    .eq("workspace_id", id)
    .maybeSingle();
  return NextResponse.json({ subscription: data ?? null });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const row = {
    workspace_id: id,
    enabled: typeof body.enabled === "boolean" ? body.enabled : true,
    vertical_filter: typeof body.vertical_filter === "string" ? body.vertical_filter : null,
    min_value: typeof body.min_value === "number" ? body.min_value : null,
    max_value: typeof body.max_value === "number" ? body.max_value : null,
    updated_at: new Date().toISOString(),
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("workspace_monitor_subscriptions")
    .upsert(row, { onConflict: "workspace_id" })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ subscription: data });
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd ZOPEXPERT && npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ZOPEXPERT
git add app/api/workspaces/
git commit -m "feat(crm): workspace monitor subscription GET/PUT"
```

---

## Task 6: `MonitorMenu` component (button + modal with 3 tabs)

**Files:**
- Create: `ZOPEXPERT/components/MonitorMenu.tsx`

- [ ] **Step 1: Create `ZOPEXPERT/components/MonitorMenu.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Satellite } from "lucide-react";
import type { Procurement, WorkspaceMonitorSubscription } from "@/lib/procurements/types";

type Props = {
  chatId: string;
  vertical: string | null;
};

type Tab = "create" | "subscribe" | "active";

export function MonitorMenu({ chatId, vertical }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("create");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Мониторинг на процедури"
        style={iconBtn}
      >
        <Satellite size={13} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <header style={modalHeader}>
              <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "var(--font-display)" }}>
                Мониторинг
              </span>
              <button onClick={() => setOpen(false)} style={closeBtn}>✕</button>
            </header>
            <nav style={tabsStyle}>
              {(["create","subscribe","active"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    ...tabBtn,
                    color: tab === t ? "var(--color-burgundy-deep)" : "var(--color-ink-muted)",
                    borderBottom: tab === t ? "2px solid var(--color-burgundy-deep)" : "2px solid transparent",
                  }}
                >
                  {t === "create" ? "Нова процедура" : t === "subscribe" ? "Авт. следене" : "Активни"}
                </button>
              ))}
            </nav>
            <div style={modalBody}>
              {tab === "create" && <CreateTab chatId={chatId} vertical={vertical} onClose={() => setOpen(false)} />}
              {tab === "subscribe" && <SubscribeTab chatId={chatId} vertical={vertical} />}
              {tab === "active" && <ActiveTab chatId={chatId} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CreateTab({ chatId, vertical, onClose }: { chatId: string; vertical: string | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [aopId, setAopId] = useState("");
  const [publisher, setPublisher] = useState("");
  const [value, setValue] = useState("");
  const [deadline, setDeadline] = useState("");
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError("Заглавието е задължително");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/procurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          aop_id: aopId.trim() || null,
          publisher: publisher.trim() || null,
          estimated_value: value ? Number.parseFloat(value) : null,
          submission_deadline: deadline ? new Date(deadline).toISOString() : null,
          procedure_type: type.trim() || null,
          workspace_id: chatId,
          linked_chat_id: chatId,
          vertical,
          source: "manual",
        }),
      });
      const json = (await resp.json()) as { procurement?: { id: string }; error?: string };
      if (!resp.ok || !json.procurement) throw new Error(json.error ?? "Грешка");
      onClose();
      window.location.href = `/procurements/${json.procurement.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Заглавие *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="AOP ID (опц.)">
        <input value={aopId} onChange={(e) => setAopId(e.target.value)} placeholder="XXXXX-YYYY-NNNN" style={inputStyle} />
      </Field>
      <Field label="Възложител">
        <input value={publisher} onChange={(e) => setPublisher(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Прогнозна стойност (лв)">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Краен срок за подаване">
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Тип процедура">
        <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Публично състезание" style={inputStyle} />
      </Field>
      {error && <div style={{ color: "var(--color-error)", fontSize: 11 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleSave} disabled={saving} style={primaryBtn}>
          {saving ? "Запазване..." : "Запази и отвори"}
        </button>
      </div>
    </div>
  );
}

function SubscribeTab({ chatId, vertical }: { chatId: string; vertical: string | null }) {
  const [sub, setSub] = useState<WorkspaceMonitorSubscription | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [minVal, setMinVal] = useState("");
  const [maxVal, setMaxVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${chatId}/subscription`)
      .then((r) => r.json() as Promise<{ subscription: WorkspaceMonitorSubscription | null }>)
      .then((j) => {
        if (j.subscription) {
          setSub(j.subscription);
          setEnabled(j.subscription.enabled);
          setMinVal(j.subscription.min_value?.toString() ?? "");
          setMaxVal(j.subscription.max_value?.toString() ?? "");
        }
      });
  }, [chatId]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const resp = await fetch(`/api/workspaces/${chatId}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          vertical_filter: vertical,
          min_value: minVal ? Number.parseFloat(minVal) : null,
          max_value: maxVal ? Number.parseFloat(maxVal) : null,
        }),
      });
      if (!resp.ok) throw new Error("Грешка");
      const j = (await resp.json()) as { subscription: WorkspaceMonitorSubscription };
      setSub(j.subscription);
      setStatus("Запазено");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Грешка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "var(--color-ink-muted)", lineHeight: 1.6 }}>
        Когато авто-следенето на ЦАИС бъде включено, нови процедури класифицирани като
        <strong> {vertical ?? "този вертикал"} </strong>
        ще се добавят автоматично към този workspace.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Активно
      </label>
      <Field label="Мин. стойност (лв, опц.)">
        <input type="number" value={minVal} onChange={(e) => setMinVal(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Макс. стойност (лв, опц.)">
        <input type="number" value={maxVal} onChange={(e) => setMaxVal(e.target.value)} style={inputStyle} />
      </Field>
      {status && <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{status}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? "Запазване..." : sub ? "Обнови" : "Запази"}
        </button>
      </div>
    </div>
  );
}

function ActiveTab({ chatId }: { chatId: string }) {
  const [list, setList] = useState<Procurement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/procurements?workspaceId=${chatId}&limit=100`)
      .then((r) => r.json() as Promise<{ procurements: Procurement[] }>)
      .then((j) => setList(j.procurements))
      .finally(() => setLoading(false));
  }, [chatId]);

  if (loading) return <div style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>Зареждане...</div>;
  if (list.length === 0) return <div style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>Все още няма следени процедури за този workspace.</div>;

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((p) => (
        <li key={p.id}>
          <a
            href={`/procurements/${p.id}`}
            style={{
              display: "block",
              padding: "10px 12px",
              background: "var(--color-paper-warm)",
              border: "1px solid var(--color-rule-soft)",
              borderRadius: 4,
              color: "var(--color-ink-charcoal)",
              textDecoration: "none",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.title}</div>
            <div style={{ fontSize: 10, color: "var(--color-ink-faint)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
              {p.aop_id ?? "—"} · {p.status} · {p.estimated_value?.toLocaleString("bg-BG") ?? "—"} {p.currency}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--color-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-ink-muted)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 13, 10, 0.55)",
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modal: React.CSSProperties = {
  background: "var(--color-paper-cream)",
  border: "1px solid var(--color-rule-soft)",
  borderTop: "3px solid var(--color-burgundy-deep)",
  borderRadius: 4,
  width: 460,
  maxWidth: "90vw",
  maxHeight: "85vh",
  display: "flex",
  flexDirection: "column",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 14px",
  borderBottom: "1px solid var(--color-rule-faint)",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "0 14px",
  borderBottom: "1px solid var(--color-rule-faint)",
};

const tabBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "10px 8px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const modalBody: React.CSSProperties = {
  padding: 14,
  overflowY: "auto",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-ink-faint)",
  fontSize: 14,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "#FFFAF0",
  border: "1px solid var(--color-rule-soft)",
  borderRadius: 3,
  color: "var(--color-ink-charcoal)",
  fontSize: 12,
  padding: "8px 10px",
  outline: "none",
  fontFamily: "var(--font-body)",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--color-burgundy-deep)",
  border: "none",
  borderRadius: 3,
  color: "var(--color-paper-cream)",
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  cursor: "pointer",
};
```

- [ ] **Step 2: Run typecheck**

```bash
cd ZOPEXPERT && npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ZOPEXPERT
git add components/MonitorMenu.tsx
git commit -m "feat(crm): MonitorMenu component with 3-tab modal"
```

---

## Task 7: Integrate MonitorMenu into `ChatPanel`

**Files:**
- Modify: `ZOPEXPERT/components/ChatPanel.tsx`

Two targeted edits.

- [ ] **Step 1: Add import**

Find this import line at the top of `ChatPanel.tsx`:

```typescript
import { PlaybookMenu } from "@/components/PlaybookMenu";
```

Replace with:

```typescript
import { PlaybookMenu } from "@/components/PlaybookMenu";
import { MonitorMenu } from "@/components/MonitorMenu";
```

- [ ] **Step 2: Add MonitorMenu in the header**

Find the existing block that renders `<PlaybookMenu ... />` (inside the header right-side div). Replace the whole `<PlaybookMenu .../>` invocation block with:

```typescript
          {chat.vertical && (
            <PlaybookMenu
              chatId={chat.id}
              workspaceId={chat.id}
              onRunStarted={(runId, totalSteps, playbookName) =>
                setActiveRun({ runId, totalSteps, playbookName })
              }
            />
          )}
          <MonitorMenu chatId={chat.id} vertical={chat.vertical} />
```

- [ ] **Step 3: Run typecheck + build**

```bash
cd ZOPEXPERT && npm run typecheck && npm run build 2>&1 | tail -10
```

Expected: typecheck clean, build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ZOPEXPERT
git add components/ChatPanel.tsx
git commit -m "feat(crm): MonitorMenu integrated into ChatPanel header"
```

---

## Task 8: `/procurements` Kanban page

**Files:**
- Create: `ZOPEXPERT/app/procurements/page.tsx`
- Create: `ZOPEXPERT/app/procurements/ProcurementsBoard.tsx`
- Create: `ZOPEXPERT/app/procurements/ProcurementCard.tsx`

- [ ] **Step 1: Create `ZOPEXPERT/app/procurements/ProcurementCard.tsx`**

```typescript
"use client";

import type { Procurement } from "@/lib/procurements/types";

const VERTICAL_ICONS: Record<string, string> = {
  food: "🍎",
  construction: "🏗️",
  supervision: "👷",
  deliveries: "📦",
  services: "🛠️",
  framework: "📄",
  zop_expert_test: "🧪",
};

type Props = {
  p: Procurement;
  onClick: () => void;
};

export function ProcurementCard({ p, onClick }: Props) {
  const daysToDeadline = p.submission_deadline
    ? Math.floor(
        (new Date(p.submission_deadline).getTime() - Date.now()) / 86400000,
      )
    : null;

  const deadlineColor =
    daysToDeadline === null
      ? "var(--color-ink-faint)"
      : daysToDeadline < 0
        ? "var(--color-error)"
        : daysToDeadline <= 3
          ? "var(--color-error)"
          : daysToDeadline <= 7
            ? "var(--color-warning)"
            : "var(--color-ink-muted)";

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: "var(--color-paper-cream)",
        border: "1px solid var(--color-rule-soft)",
        borderLeft: "2px solid var(--color-burgundy-deep)",
        borderRadius: 3,
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        color: "var(--color-ink-charcoal)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {p.vertical && VERTICAL_ICONS[p.vertical] && (
          <span style={{ fontSize: 14 }}>{VERTICAL_ICONS[p.vertical]}</span>
        )}
        {p.aop_id && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--color-ink-faint)", letterSpacing: "0.08em" }}>
            {p.aop_id}
          </span>
        )}
        {p.risk_level !== null && p.risk_level !== undefined && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 2,
              background:
                p.risk_level >= 7
                  ? "rgba(139, 26, 26, 0.12)"
                  : p.risk_level >= 4
                    ? "rgba(179, 128, 31, 0.14)"
                    : "rgba(74, 107, 63, 0.14)",
              color:
                p.risk_level >= 7
                  ? "var(--color-error)"
                  : p.risk_level >= 4
                    ? "var(--color-warning)"
                    : "var(--color-success)",
            }}
          >
            {p.risk_level}/10
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.35,
          color: "var(--color-ink-near-black)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}
      >
        {p.title}
      </div>
      {p.publisher && (
        <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
          {p.publisher}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)" }}>
        <span>{p.estimated_value?.toLocaleString("bg-BG") ?? "—"} {p.currency}</span>
        <span style={{ color: deadlineColor, fontWeight: 600 }}>
          {daysToDeadline === null
            ? "няма срок"
            : daysToDeadline < 0
              ? "просрочена"
              : `${daysToDeadline}д`}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create `ZOPEXPERT/app/procurements/ProcurementsBoard.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProcurementCard } from "@/app/procurements/ProcurementCard";
import {
  STATUS_LABELS,
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
} from "@/lib/procurements/status";
import type { Procurement, ProcurementStatus } from "@/lib/procurements/types";

type Props = {
  initial: Procurement[];
};

export function ProcurementsBoard({ initial }: Props) {
  const [list] = useState<Procurement[]>(initial);
  const [showClosed, setShowClosed] = useState(false);
  const router = useRouter();

  const statuses = showClosed
    ? [...ACTIVE_STATUSES, ...CLOSED_STATUSES]
    : ACTIVE_STATUSES;

  const grouped = new Map<ProcurementStatus, Procurement[]>();
  for (const s of statuses) grouped.set(s, []);
  for (const p of list) {
    if (grouped.has(p.status)) grouped.get(p.status)!.push(p);
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          marginBottom: 12,
          gap: 12,
          flexShrink: 0,
        }}
      >
        <label style={{ fontSize: 11, color: "var(--color-ink-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Покажи приключени
        </label>
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${statuses.length}, minmax(220px, 1fr))`,
          gap: 12,
          overflowX: "auto",
          minHeight: 0,
        }}
      >
        {statuses.map((s) => {
          const items = grouped.get(s) ?? [];
          return (
            <section
              key={s}
              style={{
                background: "var(--color-paper-warm)",
                border: "1px solid var(--color-rule-faint)",
                borderRadius: 4,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ink-charcoal)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {STATUS_LABELS[s]}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-ink-faint)" }}>
                  {items.length}
                </span>
              </header>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {items.map((p) => (
                  <ProcurementCard key={p.id} p={p} onClick={() => router.push(`/procurements/${p.id}`)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create `ZOPEXPERT/app/procurements/page.tsx`**

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import { ProcurementsBoard } from "@/app/procurements/ProcurementsBoard";
import type { Procurement } from "@/lib/procurements/types";

export const dynamic = "force-dynamic";

export default async function ProcurementsPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("procurements")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  const procurements = (data ?? []) as Procurement[];

  return (
    <main
      style={{
        height: "100vh",
        padding: 16,
        display: "flex",
        flexDirection: "column",
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
          borderBottom: "1px solid var(--color-rule-faint)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: "0.015em",
              color: "var(--color-ink-near-black)",
              lineHeight: 1,
            }}
          >
            Pipeline
          </h1>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.22em",
              color: "var(--color-ink-faint)",
              textTransform: "uppercase",
            }}
          >
            процедури · {procurements.length}
          </span>
        </div>
        <a
          href="/"
          style={{
            fontSize: 12,
            color: "var(--color-ink-muted)",
            textDecoration: "none",
            padding: "6px 12px",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
          }}
        >
          ← Назад
        </a>
        <div
          style={{
            position: "absolute",
            bottom: -1,
            left: 0,
            width: 84,
            height: 2,
            background: "linear-gradient(90deg, var(--color-gold-warm) 0%, var(--color-gold-pale) 100%)",
          }}
        />
      </header>
      <ProcurementsBoard initial={procurements} />
    </main>
  );
}
```

- [ ] **Step 4: Run typecheck + build**

```bash
cd ZOPEXPERT && npm run typecheck && npm run build 2>&1 | tail -10
```

Expected: typecheck clean, build succeeds.

- [ ] **Step 5: Commit**

```bash
cd ZOPEXPERT
git add app/procurements/
git commit -m "feat(crm): /procurements Kanban board page"
```

---

## Task 9: Procurement detail page (Overview + Notes)

**Files:**
- Create: `ZOPEXPERT/app/procurements/[id]/page.tsx`
- Create: `ZOPEXPERT/app/procurements/[id]/ProcurementDetail.tsx`

- [ ] **Step 1: Create `ZOPEXPERT/app/procurements/[id]/ProcurementDetail.tsx`**

```typescript
"use client";

import { useState } from "react";
import { ALL_STATUSES, STATUS_LABELS } from "@/lib/procurements/status";
import type {
  Procurement,
  ProcurementNote,
  ProcurementEvent,
  ProcurementStatus,
} from "@/lib/procurements/types";

type Props = {
  initial: Procurement;
  initialNotes: ProcurementNote[];
  initialEvents: ProcurementEvent[];
};

type Tab = "overview" | "notes";

export function ProcurementDetail({ initial, initialNotes, initialEvents }: Props) {
  const [p, setP] = useState<Procurement>(initial);
  const [notes, setNotes] = useState<ProcurementNote[]>(initialNotes);
  const [events, setEvents] = useState<ProcurementEvent[]>(initialEvents);
  const [tab, setTab] = useState<Tab>("overview");

  async function updateField(updates: Partial<Procurement>) {
    const resp = await fetch(`/api/procurements/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      const j = (await resp.json()) as { procurement: Procurement };
      setP(j.procurement);
      // Refetch events so status_change appears
      const er = await fetch(`/api/procurements/${p.id}`);
      if (er.ok) {
        const ej = (await er.json()) as { events: ProcurementEvent[] };
        setEvents(ej.events);
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: 16,
          background: "var(--color-paper-cream)",
          border: "1px solid var(--color-rule-soft)",
          borderTop: "3px solid var(--color-burgundy-deep)",
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--color-ink-near-black)", lineHeight: 1.3 }}>
            {p.title}
          </h1>
          <select
            value={p.status}
            onChange={(e) => updateField({ status: e.target.value as ProcurementStatus })}
            style={{
              background: "#FFFAF0",
              border: "1px solid var(--color-rule-soft)",
              borderRadius: 3,
              padding: "6px 10px",
              fontSize: 12,
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              color: "var(--color-ink-charcoal)",
            }}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: "var(--color-ink-muted)" }}>
          <Meta label="AOP ID" value={p.aop_id ?? "—"} mono />
          <Meta label="Възложител" value={p.publisher ?? "—"} />
          <Meta label="Стойност" value={p.estimated_value ? `${p.estimated_value.toLocaleString("bg-BG")} ${p.currency}` : "—"} />
          <Meta label="Срок" value={p.submission_deadline ? new Date(p.submission_deadline).toLocaleString("bg-BG") : "—"} />
        </div>
      </div>

      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-rule-faint)", flexShrink: 0 }}>
        {(["overview","notes"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "transparent",
              border: "none",
              padding: "10px 16px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              color: tab === t ? "var(--color-burgundy-deep)" : "var(--color-ink-muted)",
              borderBottom: tab === t ? "2px solid var(--color-burgundy-deep)" : "2px solid transparent",
              cursor: "pointer",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {t === "overview" ? "Преглед" : "Бележки"}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "overview" && <OverviewTab p={p} events={events} onPatch={updateField} />}
        {tab === "notes" && <NotesTab procurementId={p.id} notes={notes} setNotes={setNotes} />}
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-faint)" }}>
        {label}
      </span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-body)", fontSize: 12, color: "var(--color-ink-charcoal)" }}>
        {value}
      </span>
    </div>
  );
}

function OverviewTab({ p, events, onPatch }: { p: Procurement; events: ProcurementEvent[]; onPatch: (u: Partial<Procurement>) => void | Promise<void> }) {
  const [notes, setNotes] = useState(p.go_no_go_notes ?? "");
  return (
    <div style={{ display: "flex", gap: 16, padding: "12px 0" }}>
      <section style={{ flex: 1 }}>
        <h2 style={sectionTitle}>Описание</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--color-ink-charcoal)", whiteSpace: "pre-wrap" }}>
          {p.description ?? "Няма описание."}
        </p>
        <h2 style={{ ...sectionTitle, marginTop: 24 }}>Go / No-Go бележки</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (p.go_no_go_notes ?? "")) onPatch({ go_no_go_notes: notes });
          }}
          rows={5}
          style={{
            width: "100%",
            background: "#FFFAF0",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
            padding: "10px 12px",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--color-ink-charcoal)",
            resize: "vertical",
            outline: "none",
          }}
        />
        {p.risk_notes && (
          <>
            <h2 style={{ ...sectionTitle, marginTop: 24 }}>Hermes анализ на риска</h2>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--color-ink-charcoal)", whiteSpace: "pre-wrap" }}>
              {p.risk_notes}
            </p>
          </>
        )}
        {p.draft_appeal && (
          <>
            <h2 style={{ ...sectionTitle, marginTop: 24 }}>Чернова на жалба</h2>
            <pre
              style={{
                background: "var(--color-paper-warm)",
                border: "1px solid var(--color-rule-soft)",
                borderRadius: 3,
                padding: 12,
                fontFamily: "var(--font-body)",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                color: "var(--color-ink-charcoal)",
                lineHeight: 1.6,
              }}
            >
              {p.draft_appeal}
            </pre>
          </>
        )}
      </section>
      <aside style={{ width: 280, flexShrink: 0 }}>
        <h2 style={sectionTitle}>История</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {events.length === 0 && (
            <li style={{ fontSize: 11, color: "var(--color-ink-faint)" }}>Няма още събития.</li>
          )}
          {events.map((e) => (
            <li
              key={e.id}
              style={{
                background: "var(--color-paper-warm)",
                border: "1px solid var(--color-rule-faint)",
                borderLeft: "2px solid var(--color-gold-warm)",
                borderRadius: 3,
                padding: "8px 10px",
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--color-ink-charcoal)" }}>{e.event_type}</div>
              <div style={{ color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                {new Date(e.occurred_at).toLocaleString("bg-BG")}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function NotesTab({ procurementId, notes, setNotes }: { procurementId: string; notes: ProcurementNote[]; setNotes: (n: ProcurementNote[]) => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function append() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch(`/api/procurements/${procurementId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (resp.ok) {
        const j = (await resp.json()) as { note: ProcurementNote };
        setNotes([j.note, ...notes]);
        setDraft("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 0" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Добави бележка..."
          rows={3}
          style={{
            flex: 1,
            background: "#FFFAF0",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
            padding: "10px 12px",
            fontSize: 13,
            fontFamily: "var(--font-body)",
            resize: "vertical",
            outline: "none",
          }}
        />
        <button
          onClick={append}
          disabled={saving || !draft.trim()}
          style={{
            background: "var(--color-burgundy-deep)",
            border: "none",
            borderRadius: 3,
            color: "var(--color-paper-cream)",
            padding: "0 16px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: !draft.trim() ? 0.4 : 1,
            alignSelf: "stretch",
          }}
        >
          Добави
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.length === 0 && (
          <li style={{ fontSize: 12, color: "var(--color-ink-faint)" }}>Все още няма бележки.</li>
        )}
        {notes.map((n) => (
          <li
            key={n.id}
            style={{
              background: "var(--color-paper-cream)",
              border: "1px solid var(--color-rule-soft)",
              borderLeft: "2px solid var(--color-burgundy-deep)",
              borderRadius: 3,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              color: "var(--color-ink-charcoal)",
            }}
          >
            <div>{n.content}</div>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)", marginTop: 6 }}>
              {new Date(n.created_at).toLocaleString("bg-BG")}
              {n.author_email ? ` · ${n.author_email}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--color-ink-near-black)",
  marginBottom: 8,
};
```

- [ ] **Step 2: Create `ZOPEXPERT/app/procurements/[id]/page.tsx`**

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import { ProcurementDetail } from "@/app/procurements/[id]/ProcurementDetail";
import type { Procurement, ProcurementNote, ProcurementEvent } from "@/lib/procurements/types";

export const dynamic = "force-dynamic";

export default async function ProcurementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: procurement }, { data: notes }, { data: events }] = await Promise.all([
    supabase.from("procurements").select("*").eq("id", id).single(),
    supabase.from("procurement_notes").select("*").eq("procurement_id", id).order("created_at", { ascending: false }),
    supabase.from("procurement_events").select("*").eq("procurement_id", id).order("occurred_at", { ascending: false }).limit(50),
  ]);

  if (!procurement) {
    return (
      <main style={{ padding: 32 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>
          Процедурата не е намерена
        </h1>
        <a href="/procurements" style={{ color: "var(--color-burgundy-deep)" }}>← Назад към Pipeline</a>
      </main>
    );
  }

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
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 8,
          borderBottom: "1px solid var(--color-rule-faint)",
        }}
      >
        <a
          href="/procurements"
          style={{
            fontSize: 12,
            color: "var(--color-ink-muted)",
            textDecoration: "none",
            padding: "6px 12px",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
          }}
        >
          ← Pipeline
        </a>
        <a
          href="/"
          style={{
            fontSize: 12,
            color: "var(--color-ink-muted)",
            textDecoration: "none",
            padding: "6px 12px",
            border: "1px solid var(--color-rule-soft)",
            borderRadius: 3,
          }}
        >
          Главна
        </a>
      </header>
      <ProcurementDetail
        initial={procurement as Procurement}
        initialNotes={(notes ?? []) as ProcurementNote[]}
        initialEvents={(events ?? []) as ProcurementEvent[]}
      />
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck + build**

```bash
cd ZOPEXPERT && npm run typecheck && npm run build 2>&1 | tail -10
```

Expected: typecheck clean, build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ZOPEXPERT
git add app/procurements/
git commit -m "feat(crm): procurement detail page with Overview + Notes tabs"
```

---

## Task 10: Add 📋 navigation link to main page header

**Files:**
- Modify: `ZOPEXPERT/app/page.tsx`

- [ ] **Step 1: Find and modify the header nav block**

In `app/page.tsx`, find the existing block:

```typescript
        <div style={{ display: "flex", gap: 2 }}>
          {[
            { href: "/admin/monitor", icon: "🛡️", title: "Мониторинг" },
            { href: "/admin/knowledge", icon: "📚", title: "База знания" },
            { href: "/admin/workspaces", icon: "⚙️", title: "Настройки" },
          ].map((item) => (
```

Replace the array contents (the 3 existing entries) with these 4:

```typescript
        <div style={{ display: "flex", gap: 2 }}>
          {[
            { href: "/procurements", icon: "📋", title: "Pipeline" },
            { href: "/admin/monitor", icon: "🛡️", title: "Мониторинг" },
            { href: "/admin/knowledge", icon: "📚", title: "База знания" },
            { href: "/admin/workspaces", icon: "⚙️", title: "Настройки" },
          ].map((item) => (
```

- [ ] **Step 2: Run typecheck + build**

```bash
cd ZOPEXPERT && npm run typecheck && npm run build 2>&1 | tail -10
```

Expected: typecheck clean, build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ZOPEXPERT
git add app/page.tsx
git commit -m "feat(crm): 📋 Pipeline nav link in main header"
```

---

## Task 11: Deploy + smoke test

**Files:** none (deploy + verification)

- [ ] **Step 1: Push to GitHub**

```bash
cd ZOPEXPERT
git push "https://emmgivailopetev38-png:<GITHUB_PAT>@github.com/emmgivailopetev38-png/Petyr-Petev.git" main:main
```

- [ ] **Step 2: Deploy to Vercel production**

```bash
cd ZOPEXPERT
export PATH="/c/Users/User/AppData/Roaming/npm:/c/Program Files/nodejs:$PATH"
vercel --prod 2>&1 | grep -E "(Production|READY|Error)"
```

Expected: deployment READY.

- [ ] **Step 3: Manual smoke test**

1. Open https://zopexpert.vercel.app
2. Log in with `ZopExpert2026!Secure`
3. Verify 📋 icon appears in header nav
4. Click 🛰️ Мониторинг on Workspace 2 (Строителство) → modal opens with 3 tabs
5. On "Нова процедура" tab fill: title="Тест: реконструкция на детска градина", aop_id="00000-2026-9999", publisher="Тест община", value=500000, deadline=any future date, type="Публично състезание"
6. Click "Запази и отвори" → redirects to `/procurements/<id>`
7. Verify detail page loads with title, AOP ID, value, deadline visible
8. Change status from "Нови" to "Квалификация" → side panel shows status_change event
9. Switch to "Бележки" tab, add a note → appears at top
10. Click "← Pipeline" → back at `/procurements`, the card is in "Квалификация" column

- [ ] **Step 4: Final release commit**

```bash
cd ZOPEXPERT
git commit --allow-empty -m "release(crm): Phase 1 procurement pipeline live"
git push "https://emmgivailopetev38-png:<GITHUB_PAT>@github.com/emmgivailopetev38-png/Petyr-Petev.git" main:main
```

---

## Post-Phase Notes

- **CAIS ingest** lives in a future plan. The `source='cais'` enum value + `aop_id` unique constraint are already in place — when scraping comes online, it just upserts into the existing schema.
- **Detail tabs deferred:** Files/Tasks/Chat/Analysis tabs are out of scope for Phase 1 but the API already supports notes and events. Future iterations can add tabs without DB changes.
- **Subscription auto-routing** is also deferred (needs CAIS to actually create new procurements). The subscription row + UI are in place so users can configure preferences ahead of time.
- **Drag-and-drop on Kanban** is not implemented; status changes via the status dropdown on the detail page.
