-- AI chat history that follows the account across devices (the browser keeps a local copy too).
create table if not exists public.ai_chats (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  chat_id    text        not null,
  mode       text        not null default 'student' check (mode in ('student','teacher')),
  title      text        not null default '',
  messages   jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);
alter table public.ai_chats enable row level security;
create policy ai_chats_own_select on public.ai_chats for select to authenticated using (user_id = auth.uid());
create policy ai_chats_own_insert on public.ai_chats for insert to authenticated with check (user_id = auth.uid());
create policy ai_chats_own_update on public.ai_chats for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_chats_own_delete on public.ai_chats for delete to authenticated using (user_id = auth.uid());
create index if not exists ai_chats_user_updated on public.ai_chats (user_id, mode, updated_at desc);
