# Procurement Pipeline + ЦАИС integration

**Date:** 2026-05-31  
**Status:** Approved  
**Client:** СИП 2000 ЕООД  
**Author:** ProMarketing LTD via ZOPEXPERT

---

## Overview

Extend ZOPEXPERT from a 7-workspace chat dashboard into a full **procurement pipeline CRM** anchored around a new top-level entity (`procurements`). Procedures are ingested from ЦАИС ЕОП (the central state e-procurement portal at `app.eop.bg`) via a small Python+Playwright scraper running on the existing Hostinger VPS (the same machine that hosts Hermes). Each procurement is auto-classified into a workspace vertical, scored for risk by Hermes, and surfaces in a Kanban/Calendar pipeline UI. Each chat workspace gets a new **🛰️ Мониторинг** button to subscribe the workspace to relevant procurements or paste a specific AOP ID for one-off monitoring.

Zero new operating cost — the scraper runs on already-paid VPS infrastructure; Vercel cron + Supabase remain on free tier.

This is decomposed into two independent sub-projects:

1. **CAIS-scraper** — standalone Python service on VPS (separate spec/plan)
2. **Procurement-pipeline** — ZOPEXPERT side (this spec)

This document covers both at the architecture level and details the Pipeline side. The CAIS-scraper gets its own minimal spec once we have validation it works end-to-end.

---

## Data Model

### `procurements` (main entity)

```sql
create table procurements (
  id                  uuid primary key default gen_random_uuid(),

  -- Identity & origin
  aop_id              text unique not null,           -- "05719-2026-0001"
  source              text not null default 'cais'    -- 'cais' | 'manual' | 'open-data'
                      check (source in ('cais','manual','open-data')),
  source_url          text,

  -- ЦАИС / АОП metadata
  title               text not null,
  publisher           text,
  publisher_meta      jsonb default '{}'::jsonb,      -- logo URL, BULSTAT, address
  procedure_type      text,                            -- "Публично състезание"...
  estimated_value     numeric,
  currency            text default 'BGN',
  publication_date    timestamptz,
  submission_deadline timestamptz,
  description         text,

  -- СИП 2000 CRM
  workspace_id        uuid references chats(id) on delete set null,
  status              text not null default 'new'
                      check (status in ('new','qualifying','go','no_go','preparing','submitted','won','lost','withdrawn')),
  priority            int default 3 check (priority between 1 and 5),
  owner_email         text,
  go_no_go_notes      text,
  linked_chat_id      uuid references chats(id) on delete set null,

  -- Hermes audit (filled by analyser)
  risk_level          int check (risk_level between 0 and 10),
  risk_notes          text,
  draft_appeal        text,
  vertical            text,                            -- food/construction/...

  -- Timestamps
  fetched_at          timestamptz not null default now(),
  analysed_at         timestamptz,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index procurements_workspace_idx     on procurements(workspace_id);
create index procurements_status_idx        on procurements(status);
create index procurements_vertical_idx      on procurements(vertical);
create index procurements_deadline_idx      on procurements(submission_deadline);
create index procurements_aop_idx           on procurements(aop_id);
```

### Supporting tables

```sql
create table procurement_documents (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  doc_type        text,                                 -- 'tender_spec', 'methodology', 'ksstotal', etc.
  title           text,
  source_url      text,
  local_path      text,                                 -- if downloaded to Supabase Storage
  size_bytes      bigint,
  mime            text,
  extracted_text  text,                                 -- when we extract content
  fetched_at      timestamptz default now()
);

create table procurement_notes (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  author_email    text,
  content         text not null,
  created_at      timestamptz default now()
);

create table procurement_tasks (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  title           text not null,
  description     text,
  due_date        timestamptz,
  owner_email     text,
  done            boolean default false,
  created_at      timestamptz default now()
);

create table procurement_events (   -- audit trail
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  event_type      text not null,                        -- 'status_change', 'note_added', 'analysed'...
  payload         jsonb default '{}'::jsonb,
  actor_email     text,
  occurred_at     timestamptz default now()
);

create table workspace_monitor_subscriptions (
  workspace_id    uuid not null references chats(id) on delete cascade,
  enabled         boolean not null default true,
  vertical_filter text,                                 -- usually equals chats.vertical
  min_value       numeric,                              -- optional lower bound
  max_value       numeric,                              -- optional upper bound
  updated_at      timestamptz default now(),
  primary key (workspace_id)
);
```

RLS: anon can read all (consistent with existing schema), service role writes.

---

## ЦАИС Ingest Pipeline

### Architecture

```
Vercel Cron (06:00 daily)
    │
    ▼
POST /api/cron/cais-sync
    │
    ├── calls https://hermes-vps/cais/snapshot
    │   (CAIS-scraper Python service, see separate spec)
    │   returns: { fetched_at, total, procurements: [{...}, ...] }
    │
    ├── for each procurement:
    │     - upsert into procurements by aop_id (skip if already present)
    │     - if new: invoke Hermes analyser
    │         → classify vertical
    │         → score risk 0-10
    │         → draft appeal if risk >= 7
    │     - auto-assign workspace_id from matching subscription
    │     - emit procurement_events row
    │
    └── generate daily briefing per vertical
        (uses existing Phase 4 briefing logic, no change)
```

### CAIS-scraper contract (the VPS service)

```
POST  https://hermes-vps/cais/snapshot
Auth: Bearer <CAIS_SCRAPER_TOKEN>
Body: { limit?: int, since?: ISO-date }
Resp: {
  fetched_at: ISO,
  total: int,
  procurements: [
    {
      aop_id, title, publisher,
      procedure_type, estimated_value, currency,
      publication_date, submission_deadline,
      source_url
    }
  ]
}
```

The scraper service is in its own spec (`2026-05-31-cais-scraper-design.md` — to be written next).

### Detail-page enrichment (Phase 2 of ingest, not Phase 1)

```
POST  https://hermes-vps/cais/detail
Body: { aop_id }
Resp: {
  description, documents: [{type, title, url}], related_chunks
}
```

Phase 1 (this iteration) does NOT call detail. We start with snapshot data only — title, publisher, deadlines, type. Detail extraction comes when we validate the basic loop works.

### Manual one-off fetch

When the user pastes an AOP ID via the "Мониторинг" button → POST `/api/procurements/fetch` with `{aop_id}` → server calls the scraper's `/cais/snapshot` with `filter=aop_id` or hits `/cais/detail` directly → upserts → returns the procurement row.

---

## Workspace "Мониторинг" Button

New button in `ChatPanel` header, placed between fullscreen toggle and "Изчисти":

```
Icon:    🛰️ (Satellite — Lucide: `Satellite` or `Radio`)
Title:   "Мониторинг"
```

Click → modal with three tabs:

### Tab 1 — Следи конкретна процедура

```
Input: AOP ID (формат XXXXX-YYYY-NNNN) или URL към ЦАИС
[Извлечи и започни мониторинг]
```

POST `/api/procurements/fetch` { aop_id, workspace_id }
- Validates format
- Calls scraper
- Creates procurement
- Runs analyser
- Returns ID → modal navigates to `/procurements/{id}`

### Tab 2 — Авт. следене на вертикала

```
[ ] Авт. следене на нови процедури за "Строителство"
    
Допълнителни филтри (опц.):
  Мин. стойност (лв):  [____]
  Макс. стойност (лв): [____]

[Запази]
```

Updates `workspace_monitor_subscriptions` row. From next cron run, all new procurements matching the vertical (Hermes-classified) AND value range are auto-assigned to this workspace.

### Tab 3 — Активни процедури

```
List of procurements where workspace_id = this workspace.
Click any → /procurements/{id}
```

---

## Procurement Pipeline UI

### `/procurements` — main view

Three sub-views toggleable via top tabs:

**A) Kanban (default)**

```
[New 12]  [Qualifying 5]  [Go 3]  [Preparing 2]  [Submitted 1]  [Closed]
   │           │             │          │             │
   ▼           ▼             ▼          ▼             ▼
 [card]      [card]        [card]     [card]        [card]
 [card]      [card]        [card]     [card]
 [card]      [card]        [card]
```

Cards show: title (truncated), publisher, value, deadline (red if ≤7 days), risk indicator (color + N/10), workspace icon.
Drag-and-drop between columns updates status; emits `procurement_events` row.

**B) Calendar**

Month grid. Each procurement is a chip on its `submission_deadline` cell. Click chip → detail. Red border if deadline <3 days.

**C) Hotlist**

Filtered list: `submission_deadline ≤ 7 days OR risk_level ≥ 7`. Sorted by deadline ascending.

### `/procurements/[aop_id]` — detail page

```
┌────────────────────────────────────────────────────┐
│ ◄ Назад        [Овърview] [Анализ] [Чат] [Файлове]│
│                [Задачи]   [Бележки]                │
│────────────────────────────────────────────────────│
│ Заглавие на поръчката                              │
│ Възложител · АОП ID · Стойност · Срок 7 дни ⏰     │
│ Status: [Qualifying ▾]  Owner: [____]              │
└────────────────────────────────────────────────────┘
```

Tabs:

- **Овърview** — основни метаданни + статус-история (от `procurement_events`) + квик действия (Open in ЦАИС, Run playbook)
- **Анализ** — Hermes risk_notes + draft_appeal (ако има) + бутон "Старт playbook: Анализ на ТС"
- **Чат** — embedded ChatPanel scoped to `linked_chat_id`. На първи отворен — създава нов chat с procurement context в системния prompt.
- **Файлове** — `procurement_documents` + drag-drop ъплоуд
- **Задачи** — Kanban-mini за `procurement_tasks`
- **Бележки** — append-only лента, всяка бележка с автор и timestamp

---

## Navigation & Header

Add 📋 икона в главния header (between 🛡️ и 📚) пойнтваща към `/procurements`.

Admin страниците получават нов tab в горната им навигация:

```
🛰️ Мониторинг | 📚 База знания | ⚙️ Настройки | 📋 Pipeline | ← Назад
```

---

## Hermes Integration

Reuses Phase 4's `analyseProcedure()` from `lib/monitor/analyser.ts`. No changes to Hermes itself.

When a procurement is created from CAIS sync OR manual fetch:

```typescript
const analysis = await analyseProcedure({
  aop_id, title, publisher, estimated_value, deadline, raw_text: description
});
// Returns { vertical, risk_level, risk_notes, draft_appeal }

await supabase.from('procurements').update({
  vertical: analysis.vertical,
  risk_level: analysis.risk_level,
  risk_notes: analysis.risk_notes,
  draft_appeal: analysis.draft_appeal,
  analysed_at: now,
}).eq('id', proc.id);
```

Then auto-route by checking active `workspace_monitor_subscriptions` and setting `workspace_id` on the procurement.

---

## API Routes (new)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/procurements` | list with filters (status, vertical, workspace_id, deadline) |
| GET | `/api/procurements/[id]` | full detail |
| POST | `/api/procurements/fetch` | manual fetch by aop_id (calls scraper) |
| PATCH | `/api/procurements/[id]` | update status/priority/owner/notes |
| GET | `/api/procurements/[id]/documents` | list documents |
| POST | `/api/procurements/[id]/notes` | append note |
| POST | `/api/procurements/[id]/tasks` | create task |
| PATCH | `/api/procurements/[id]/tasks/[taskId]` | update task |
| GET | `/api/workspaces/[id]/subscription` | get monitor subscription |
| PUT | `/api/workspaces/[id]/subscription` | update monitor subscription |
| GET | `/api/cron/cais-sync` | Vercel cron: pull from VPS scraper, upsert, analyse |

---

## Vercel Cron

Append to existing `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/daily-monitor", "schedule": "0 4 * * *" },
    { "path": "/api/cron/cais-sync",     "schedule": "0 6 * * *" }
  ]
}
```

Note: Vercel hobby allows multiple cron entries.

---

## Out of Scope (this iteration)

- Document downloading and text extraction from ЦАИС (Phase 2 of CAIS-scraper)
- Multi-user permissions / per-row ACL (assume internal owner-only access)
- Email briefing delivery (Resend or similar — TBD, can plug into existing `daily_briefings` row state)
- Mobile-optimised UI for pipeline (responsive web only)
- Full-text search inside procurement descriptions (FTS index can be added later as cheap follow-up)
- Drag-to-drop reordering of tasks/notes (basic edit only)

---

## Environment Variables (new)

```
CAIS_SCRAPER_URL=https://hermes-domain/cais
CAIS_SCRAPER_TOKEN=<bearer secret shared with VPS service>
```

Set on Vercel for production + preview + development.

---

## Acceptance Criteria

- [ ] DB migration applied with all new tables
- [ ] `/api/cron/cais-sync` successfully fetches from scraper, upserts procurements, runs analyser
- [ ] Manual fetch by AOP ID works from "Мониторинг" modal Tab 1
- [ ] Auto-feed subscription set from Tab 2 results in new matching procurements being auto-assigned to the workspace at next cron run
- [ ] `/procurements` Kanban shows all procurements grouped by status
- [ ] Drag-drop between columns persists status and writes an event row
- [ ] `/procurements/[id]` detail page renders all 6 tabs
- [ ] Hermes-suggested draft_appeal is visible in Анализ tab when risk_level ≥ 7
- [ ] Header navigation includes 📋 link
- [ ] Existing 7 workspaces, 4 phases, knowledge base unchanged and unaffected

---

## Rollout

1. Apply DB migration via Supabase MCP
2. Implement scraper service spec separately
3. Build pipeline backend (API routes + cron handler)
4. Build pipeline UI (`/procurements` Kanban + detail page)
5. Add "Мониторинг" button + modal to ChatPanel
6. Add 📋 nav link in header
7. Set env vars on Vercel
8. Deploy
9. Smoke test full loop: AOP ID paste → fetch → analyse → appears in Kanban

---

## Companion Spec to Write Next

`docs/superpowers/specs/2026-05-31-cais-scraper-design.md` — standalone Python+Playwright service on VPS exposing `POST /cais/snapshot` returning the procurement list. Minimal scope: list page only (no detail enrichment). Spec to be written once we confirm the design above.
