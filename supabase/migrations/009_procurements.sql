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

create index if not exists procurements_workspace_idx on procurements(workspace_id);
create index if not exists procurements_status_idx    on procurements(status);
create index if not exists procurements_vertical_idx  on procurements(vertical);
create index if not exists procurements_deadline_idx  on procurements(submission_deadline);
create index if not exists procurements_aop_idx       on procurements(aop_id);

create table if not exists procurement_notes (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  author_email    text,
  content         text not null,
  created_at      timestamptz default now()
);
create index if not exists procurement_notes_proc_idx on procurement_notes(procurement_id, created_at desc);

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

create table if not exists procurement_events (
  id              uuid primary key default gen_random_uuid(),
  procurement_id  uuid not null references procurements(id) on delete cascade,
  event_type      text not null,
  payload         jsonb default '{}'::jsonb,
  actor_email     text,
  occurred_at     timestamptz default now()
);
create index if not exists procurement_events_proc_idx on procurement_events(procurement_id, occurred_at desc);

create table if not exists workspace_monitor_subscriptions (
  workspace_id    uuid primary key references chats(id) on delete cascade,
  enabled         boolean not null default true,
  vertical_filter text,
  min_value       numeric,
  max_value       numeric,
  updated_at      timestamptz default now()
);

alter table procurements                    enable row level security;
alter table procurement_notes               enable row level security;
alter table procurement_tasks               enable row level security;
alter table procurement_events              enable row level security;
alter table workspace_monitor_subscriptions enable row level security;

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
