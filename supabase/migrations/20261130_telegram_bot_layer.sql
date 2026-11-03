-- Owner-only Telegram bot: read-only DB layer (NOT applied yet).
-- Everything lives in a private schema `bot` that PostgREST does not expose. The bot connects as
-- `bot_reader`, which has no table privileges at all: it can only EXECUTE the bot.rpc_* functions below.
-- Those functions return a fixed set of safe columns (no password, payment, phone, email, address, avatar).
-- Nothing in public.* is altered; the only writes are to bot.bot_audit and bot.alert_sent.
-- After applying, set the role password yourself in the SQL editor (never in a file):
--   alter role bot_reader with password '<long random>';

create schema if not exists bot;
revoke all on schema bot from public, anon, authenticated;
alter default privileges in schema bot revoke execute on functions from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bot_reader') then
    -- created without a password, so it cannot log in until the owner sets one
    create role bot_reader login noinherit nocreatedb nocreaterole nobypassrls connection limit 5;
  end if;
end $$;
alter role bot_reader set statement_timeout = '5s';
alter role bot_reader set search_path = '';
grant usage on schema bot to bot_reader;

-- Audit: which function ran and when. Never the arguments or the result.
create table if not exists bot.bot_audit (
  id bigint generated always as identity primary key,
  fn text not null,
  at timestamptz not null default now()
);
create index if not exists bot_audit_at_idx on bot.bot_audit (at desc);
alter table bot.bot_audit enable row level security;
revoke all on bot.bot_audit from public, anon, authenticated;

-- One row per alert already sent, so the daily monitor never repeats itself.
create table if not exists bot.alert_sent (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sabab text not null check (sabab in ('daraja_tushdi', 'kirmagan', 'imtihon_otdi')),
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, sabab, ref)
);
alter table bot.alert_sent enable row level security;
revoke all on bot.alert_sent from public, anon, authenticated;

-- The only student columns the bot may ever see.
create or replace view bot.v_talaba with (security_barrier) as
select p.id, p.student_id, p.full_name, p.status::text as status, p.level, p.created_at, u.last_sign_in_at
from public.profiles p
left join auth.users u on u.id = p.id
where p.role = 'student';
revoke all on bot.v_talaba from public, anon, authenticated;

-- Writes the audit row and enforces the shared limit (p_limit calls per minute).
create or replace function bot._log(p_fn text, p_limit int default 20)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('bot_rate'));
  if (select count(*) from bot.bot_audit
      where at > now() - interval '1 minute' and fn <> 'begona') >= p_limit then
    raise exception 'rate_limited' using errcode = 'UB429';
  end if;
  insert into bot.bot_audit (fn) values (p_fn);
end $$;

-- Risk rules. Each row: who, which rule, a reference that makes the alert unique, a short summary.
create or replace function bot._xavflar(p_kun int default 7)
returns table (user_id uuid, student_id text, full_name text, sabab text, ref text, izoh text)
language sql stable security definer set search_path = '' as $$
  -- 1) dropped a level, or failed the level exam, in the last 14 days
  select t.id, t.student_id, t.full_name, 'daraja_tushdi', lt.id::text,
         case when lt.to_level < lt.from_level then format('daraja %s → %s', lt.from_level, lt.to_level)
              else format('%s-daraja imtihonidan o''tmadi', lt.from_level) end
  from public.level_transitions lt
  join bot.v_talaba t on t.id = lt.user_id and t.status = 'active'
  where (lt.to_level < lt.from_level or lt.outcome = 'failed')
    and lt.created_at > now() - interval '14 days'
  union all
  -- 2) no sign-in for p_kun days; ref = last sign-in date, so it fires again only after a new gap
  select t.id, t.student_id, t.full_name, 'kirmagan', coalesce(t.last_sign_in_at::date::text, 'hech'),
         case when t.last_sign_in_at is null then 'hech kirmagan'
              else format('%s kun kirmagan', current_date - t.last_sign_in_at::date) end
  from bot.v_talaba t
  where t.status = 'active'
    and coalesce(t.last_sign_in_at, t.created_at) < now() - make_interval(days => p_kun)
  union all
  -- 3) published exam of the student's group, deadline (and any extension) passed in the last 30 days, not submitted
  select distinct t.id, t.student_id, t.full_name, 'imtihon_otdi', e.id::text,
         format('"%s" topshirilmagan', left(e.title, 40))
  from public.written_exams e
  join public.group_members gm on gm.group_code = e.group_code
  join bot.v_talaba t on t.id = gm.user_id and t.status = 'active'
  left join public.written_exam_extensions ex on ex.exam_id = e.id and ex.user_id = t.id
  where e.is_published
    and e.deadline_at > now() - interval '30 days'
    and greatest(e.deadline_at, coalesce(ex.until_at, e.deadline_at)) < now()
    and not exists (
      select 1 from public.written_exam_submissions s
      where s.exam_id = e.id and s.user_id = t.id and (s.submitted_at is not null or s.status = 'graded'))
$$;

-- /talaba <ism>: up to 10 matches by name or student ID.
create or replace function bot.rpc_talaba_qidir(p_q text)
returns table (id uuid, student_id text, full_name text, level int, guruhlar text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v text := btrim(coalesce(p_q, ''));
begin
  perform bot._log('talaba_qidir');
  if char_length(v) < 2 or char_length(v) > 64 then
    return;
  end if;
  v := replace(replace(replace(v, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select t.id, t.student_id, t.full_name, t.level,
           (select string_agg(distinct g.name, ', ')
              from public.group_members gm join public.groups g on g.code = gm.group_code
             where gm.user_id = t.id)
    from bot.v_talaba t
    where t.full_name ilike '%' || v || '%' or t.student_id ilike v || '%'
    order by t.full_name
    limit 10;
end $$;

-- Card shown when a search result button is tapped.
create or replace function bot.rpc_talaba_karta(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
begin
  perform bot._log('talaba_karta');
  select jsonb_build_object(
    'student_id', t.student_id,
    'ism', t.full_name,
    'holat', t.status,
    'daraja', t.level,
    'oxirgi_kirish', t.last_sign_in_at,
    'guruhlar', (select coalesce(jsonb_agg(distinct g.name), '[]'::jsonb)
                   from public.group_members gm join public.groups g on g.code = gm.group_code
                  where gm.user_id = t.id),
    'oxirgi_otish', (select jsonb_build_object('dan', lt.from_level, 'ga', lt.to_level,
                                               'natija', lt.outcome, 'sana', lt.created_at)
                       from public.level_transitions lt
                      where lt.user_id = t.id
                      order by lt.created_at desc limit 1),
    'davomat_30k', (select jsonb_build_object('bor', count(*) filter (where ar.present), 'jami', count(*))
                      from public.attendance_records ar
                      join public.attendance_sessions s on s.id = ar.session_id
                     where ar.user_id = t.id and s.session_date >= current_date - 30),
    'imtihonlar', (select coalesce(jsonb_agg(to_jsonb(x) order by x.muddat desc nulls last), '[]'::jsonb)
                     from (select left(e.title, 60) as nomi, e.deadline_at as muddat,
                                  case when sub.status = 'graded' then 'baholangan'
                                       when sub.submitted_at is not null then 'topshirilgan'
                                       when greatest(e.deadline_at, coalesce(ex.until_at, e.deadline_at)) < now() then 'muddati_otgan'
                                       else 'kutilmoqda' end as holat,
                                  case when sub.status = 'graded' then sub.total_score end as ball
                             from public.written_exams e
                             join public.group_members gm on gm.group_code = e.group_code and gm.user_id = t.id
                             left join public.written_exam_extensions ex on ex.exam_id = e.id and ex.user_id = t.id
                             left join lateral (select s.status, s.submitted_at, s.total_score
                                                  from public.written_exam_submissions s
                                                 where s.exam_id = e.id and s.user_id = t.id
                                                 order by s.submitted_at desc nulls last limit 1) sub on true
                            where e.is_published
                            order by e.deadline_at desc nulls last
                            limit 5) x))
  into r
  from bot.v_talaba t
  where t.id = p_id;
  return r;
end $$;

-- /xavf: everyone matching a risk rule right now.
create or replace function bot.rpc_xavf_royxati()
returns table (id uuid, student_id text, full_name text, sabab text, izoh text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform bot._log('xavf_royxati');
  return query
    select x.user_id, x.student_id, x.full_name, x.sabab, x.izoh
    from bot._xavflar(7) x
    order by x.sabab, x.full_name
    limit 50;
end $$;

-- /bugun and the 08:00 report: counts only.
create or replace function bot.rpc_kunlik_hisobot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
begin
  perform bot._log('kunlik_hisobot');
  select jsonb_build_object(
    'sana', (now() at time zone 'Asia/Tashkent')::date,
    'faol', count(*) filter (where t.status = 'active'),
    'tolanmagan', count(*) filter (where t.status = 'unpaid'),
    'bloklangan', count(*) filter (where t.status = 'blocked'),
    'yangi_24s', count(*) filter (where t.created_at > now() - interval '24 hours'),
    'kirgan_24s', count(*) filter (where t.last_sign_in_at > now() - interval '24 hours'),
    'kirmagan_7k', count(*) filter (where t.status = 'active'
                                     and coalesce(t.last_sign_in_at, t.created_at) < now() - interval '7 days'))
  || jsonb_build_object(
    'topshirilgan_24s', (select count(*) from public.written_exam_submissions s
                          where s.submitted_at > now() - interval '24 hours'),
    'otdi_24s', (select count(*) from public.level_transitions lt
                  where lt.created_at > now() - interval '24 hours' and lt.outcome = 'passed'),
    'otmadi_24s', (select count(*) from public.level_transitions lt
                    where lt.created_at > now() - interval '24 hours' and lt.outcome = 'failed'),
    'xavfdagi', (select count(distinct x.user_id) from bot._xavflar(7) x))
  into r
  from bot.v_talaba t;
  return r;
end $$;

-- Daily monitor: risks not alerted before. Records them in alert_sent in the same transaction.
create or replace function bot.rpc_yangi_xavflar()
returns table (student_id text, sabab text, izoh text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform bot._log('yangi_xavflar');
  return query
    with x as (select distinct * from bot._xavflar(7)),
    ins as (
      insert into bot.alert_sent (user_id, sabab, ref)
      select x.user_id, x.sabab, x.ref from x
      on conflict do nothing
      returning alert_sent.user_id, alert_sent.sabab, alert_sent.ref)
    select x.student_id, x.sabab, x.izoh
    from ins join x on x.user_id = ins.user_id and x.sabab = ins.sabab and x.ref = ins.ref
    order by x.sabab, x.student_id;
end $$;

-- A stranger wrote to the bot. Logged without any identity; true = notify the owner
-- (at most 3 notices per 10 minutes, so a stranger cannot flood the owner's chat).
create or replace function bot.rpc_begona_urinish()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('bot_begona'));
  select count(*) into n from bot.bot_audit where fn = 'begona' and at > now() - interval '10 minutes';
  insert into bot.bot_audit (fn) values ('begona');
  return n < 3;
end $$;

revoke all on all functions in schema bot from public, anon, authenticated;
grant execute on function
  bot.rpc_talaba_qidir(text),
  bot.rpc_talaba_karta(uuid),
  bot.rpc_xavf_royxati(),
  bot.rpc_kunlik_hisobot(),
  bot.rpc_yangi_xavflar(),
  bot.rpc_begona_urinish()
to bot_reader;
