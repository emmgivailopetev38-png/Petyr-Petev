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
