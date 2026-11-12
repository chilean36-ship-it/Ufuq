-- Student support bot (support-bot Edge Function): storage layer. Idempotent, safe to re-run.
-- Students write to the bot; every student gets their own topic in the staff forum group; staff reply inside the topic.
-- Everything lives in a private schema `support` that PostgREST does not expose. The function connects as
-- `support_bot`, which has no table privileges: it can only EXECUTE the support.rpc_* functions below.
-- Stores only what the bot needs: Telegram id, name, username, topic id, and message id pairs (never message text).
-- After applying, set the role password yourself in the SQL editor (never in a file):
--   alter role support_bot with password '<long random>';

create schema if not exists support;
revoke all on schema support from public, anon, authenticated;
alter default privileges in schema support revoke execute on functions from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'support_bot') then
    create role support_bot login noinherit nocreatedb nocreaterole nobypassrls connection limit 5;
  end if;
end $$;
alter role support_bot set statement_timeout = '5s';
alter role support_bot set search_path = '';
grant usage on schema support to support_bot;

-- One row per student who wrote to the bot.
create table if not exists support.users (
  user_id bigint primary key,
  first_name text,
  username text,
  lang text,
  topic_id int unique,
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  last_msg_at timestamptz,
  -- per-student flood limit
  win_start timestamptz not null default now(),
  win_count int not null default 0
);
alter table support.users enable row level security;
revoke all on support.users from public, anon, authenticated;

-- Message id pairs, used for edits and replies in both directions.
-- user_msg_id = id in the student's private chat; group_msg_id = id in the staff group.
create table if not exists support.msg_map (
  user_id bigint not null references support.users(user_id) on delete cascade,
  user_msg_id int not null,
  group_msg_id int not null unique,
  created_at timestamptz not null default now(),
  primary key (user_id, user_msg_id)
);
create index if not exists msg_map_created_idx on support.msg_map (created_at);
alter table support.msg_map enable row level security;
revoke all on support.msg_map from public, anon, authenticated;

-- Key/value settings: 'group_id' (set by /setup) and 'setup_nonce' (one-time webhook registration).
create table if not exists support.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table support.settings enable row level security;
revoke all on support.settings from public, anon, authenticated;

create or replace function support.rpc_get_group()
returns bigint language sql stable security definer set search_path = '' as $$
  select value::bigint from support.settings where key = 'group_id';
$$;

create or replace function support.rpc_set_group(p_group bigint)
returns void language sql security definer set search_path = '' as $$
  insert into support.settings (key, value) values ('group_id', p_group::text)
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;

-- True once for a matching nonce younger than 15 minutes; the nonce is deleted either way it matched.
create or replace function support.rpc_take_nonce(p_nonce text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare hit boolean;
begin
  delete from support.settings
  where key = 'setup_nonce' and value = p_nonce and updated_at > now() - interval '15 minutes'
  returning true into hit;
  return coalesce(hit, false);
end $$;

-- Called on every student message. Upserts the profile and returns what the bot needs to route it.
-- new_conv = first message ever or the first after 12 h of silence (bot then sends the auto-reply).
-- flood = more than 30 messages in the current minute.
create or replace function support.rpc_touch(p_user bigint, p_first text, p_username text, p_lang text)
returns table (topic_id int, banned boolean, new_conv boolean, flood boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r support.users;
declare prev timestamptz;
begin
  select u.last_msg_at into prev from support.users u where u.user_id = p_user;
  insert into support.users as u (user_id, first_name, username, lang, last_msg_at, win_start, win_count)
  values (p_user, left(p_first, 128), left(p_username, 64), left(p_lang, 8), now(), now(), 1)
  on conflict (user_id) do update set
    first_name = excluded.first_name,
    username = excluded.username,
    lang = excluded.lang,
    last_msg_at = now(),
    win_start = case when u.win_start < now() - interval '1 minute' then now() else u.win_start end,
    win_count = case when u.win_start < now() - interval '1 minute' then 1 else u.win_count + 1 end
  returning * into r;
  return query select r.topic_id, r.banned, (prev is null or prev < now() - interval '12 hours'), r.win_count > 30;
end $$;

-- Saves the topic only if none is stored yet; returns the topic that won (handles two messages arriving at once).
create or replace function support.rpc_set_topic(p_user bigint, p_topic int)
returns int language sql security definer set search_path = '' as $$
  update support.users set topic_id = coalesce(topic_id, p_topic) where user_id = p_user returning topic_id;
$$;

-- The staff deleted the topic: forget it so a new one is created.
create or replace function support.rpc_reset_topic(p_user bigint, p_old int)
returns void language sql security definer set search_path = '' as $$
  update support.users set topic_id = null where user_id = p_user and topic_id = p_old;
$$;

create or replace function support.rpc_user_by_topic(p_topic int)
returns table (user_id bigint, first_name text, username text, lang text, banned boolean, created_at timestamptz, msgs bigint)
language sql stable security definer set search_path = '' as $$
  select u.user_id, u.first_name, u.username, u.lang, u.banned, u.created_at,
         (select count(*) from support.msg_map m where m.user_id = u.user_id)
  from support.users u where u.topic_id = p_topic;
$$;

create or replace function support.rpc_set_ban(p_topic int, p_banned boolean)
returns bigint language sql security definer set search_path = '' as $$
  update support.users set banned = p_banned where topic_id = p_topic returning user_id;
$$;

create or replace function support.rpc_map_add(p_user bigint, p_user_msg int, p_group_msg int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into support.msg_map (user_id, user_msg_id, group_msg_id) values (p_user, p_user_msg, p_group_msg)
  on conflict do nothing;
  -- housekeeping: about 1 call in 200 drops pairs older than 90 days
  if random() < 0.005 then
    delete from support.msg_map where created_at < now() - interval '90 days';
  end if;
end $$;

create or replace function support.rpc_map_to_group(p_user bigint, p_user_msg int)
returns int language sql stable security definer set search_path = '' as $$
  select group_msg_id from support.msg_map where user_id = p_user and user_msg_id = p_user_msg;
$$;

create or replace function support.rpc_map_to_user(p_group_msg int)
returns table (user_id bigint, user_msg_id int)
language sql stable security definer set search_path = '' as $$
  select user_id, user_msg_id from support.msg_map where group_msg_id = p_group_msg;
$$;

create or replace function support.rpc_stats()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'jami', (select count(*) from support.users),
    'bugun', (select count(*) from support.users where last_msg_at > now() - interval '24 hours'),
    'hafta', (select count(*) from support.users where last_msg_at > now() - interval '7 days'),
    'yangi_hafta', (select count(*) from support.users where created_at > now() - interval '7 days'),
    'bloklangan', (select count(*) from support.users where banned)
  );
$$;

revoke all on all functions in schema support from public, anon, authenticated;
grant execute on function
  support.rpc_touch(bigint, text, text, text),
  support.rpc_set_topic(bigint, int),
  support.rpc_reset_topic(bigint, int),
  support.rpc_user_by_topic(int),
  support.rpc_set_ban(int, boolean),
  support.rpc_map_add(bigint, int, int),
  support.rpc_map_to_group(bigint, int),
  support.rpc_map_to_user(int),
  support.rpc_stats(),
  support.rpc_get_group(),
  support.rpc_set_group(bigint),
  support.rpc_take_nonce(text)
to support_bot;
