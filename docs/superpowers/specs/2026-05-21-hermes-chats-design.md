# ZOPEXPERT — Hermes Chat Dashboard Design

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Standalone Next.js application (`/ZOPEXPERT`) with 6 independent chat panels on the main page, each connected to a Hermes Agent (OpenAI-compatible API on Hostinger VPS). Conversation history is persisted in Supabase. Built for owner use initially, extensible to teams later.

---

## Architecture

```
ZOPEXPERT (Next.js app)
│
├── / (main page)
│   └── 6 chat panels in 2×3 grid
│
├── /api/hermes/chat          ← server-side bridge to Hermes
│   └── validates auth, loads history from Supabase,
│       sends to Hermes, streams response back, saves messages
│
├── Supabase
│   ├── chats                 ← 6 rows (slot 1..6)
│   └── messages              ← all messages with chat_id, role, content
│
└── .env
    ├── HERMES_API_URL         ← https://placeholder/v1/chat/completions
    ├── HERMES_API_KEY         ← bearer token (server-only)
    ├── NEXT_PUBLIC_SUPABASE_URL
    ├── NEXT_PUBLIC_SUPABASE_ANON_KEY
    ├── SUPABASE_SERVICE_KEY   ← server-only
    └── ADMIN_PASSWORD         ← simple access password
```

### Message Flow

1. User types in Chat N
2. Frontend sends `POST /api/hermes/chat` with `{ chatId, message }`
3. API route loads last 50 messages from Supabase for that chat
4. Sends full history + new message to Hermes `POST /v1/chat/completions`
5. Streams response back to UI via ReadableStream
6. Saves both messages (user + assistant) to Supabase

---

## UI Layout

2×3 grid on desktop, single column on mobile.

```
┌─────────────────┬─────────────────┐
│   Chat 1        │   Chat 2        │
│  [title]        │  [title]        │
│  history...     │  history...     │
│  [input box]    │  [input box]    │
├─────────────────┼─────────────────┤
│   Chat 3        │   Chat 4        │
├─────────────────┼─────────────────┤
│   Chat 5        │   Chat 6        │
└─────────────────┴─────────────────┘
```

### Each Chat Panel

- Editable title (default: "Chat 1"…"Chat 6")
- Scrollable message history (auto-scroll to bottom)
- Streaming indicator (blinking cursor while Hermes responds)
- Text input + Send button (Enter or click)
- Clear button — deletes history for that chat only
- Dark theme, minimal design

---

## Database Schema

```sql
-- chats: 6 rows, one per panel
create table chats (
  id         uuid primary key default gen_random_uuid(),
  slot       int unique not null check (slot between 1 and 6),
  title      text not null default 'Chat',
  created_at timestamptz not null default now()
);

-- messages: conversation history
create table messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references chats(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index messages_chat_id_created_at on messages(chat_id, created_at);
```

Supabase RLS:
- `messages`: anon key can SELECT (frontend reads history directly)
- All writes go through service key on the server

---

## Authentication

**MVP (owner-only):**
- Single password stored in `ADMIN_PASSWORD` env var
- Password stored in `sessionStorage` after first entry
- Login form shown if session has no valid password
- No JWT, no Supabase Auth

**Future (teams):**
- Replace with Supabase Auth (email/password or magic link)
- Add `owner_id` to `chats` table
- Each user sees only their own chats

---

## Security

- `HERMES_API_KEY` and `SUPABASE_SERVICE_KEY` are server-only (never sent to client)
- All Hermes calls go through `/api/hermes/chat` API route
- API route adds `Authorization: Bearer <key>` to Hermes requests
- Frontend uses anon key with read-only RLS for history display
- No rate limiting for MVP (owner-only usage)

---

## Hermes Integration

**Endpoint:** `POST /v1/chat/completions` (OpenAI-compatible)  
**VPS:** srv1690086, IPv6: `2a02:4780:c:bd90::1`  
**Current status:** API server not yet enabled — needs `API_SERVER_ENABLED=true` in `/root/.hermes/.env` + `hermes gateway restart`  
**Reverse proxy:** Nginx/Caddy in front of `127.0.0.1:8642` → public HTTPS endpoint  
**Context window:** Last 50 messages per chat sent with each request

**Request shape:**
```json
{
  "model": "hermes",
  "stream": true,
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." },
    { "role": "user", "content": "<new message>" }
  ]
}
```

---

## Out of Scope (MVP)

- Per-chat system prompts / roles (added later)
- Multi-user / team access (added later)
- Chat export
- File attachments
- Mobile app
