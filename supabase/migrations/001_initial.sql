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
