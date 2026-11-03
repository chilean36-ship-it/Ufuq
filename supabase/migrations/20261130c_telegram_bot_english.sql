-- Owner-only Telegram bot, v2: English summaries, and the daily report carries the key numbers
-- (risk count per rule, exam deadlines in the next 48 hours). Only bot.* functions are replaced; grants are kept.

create or replace function bot._xavflar(p_kun int default 7)
returns table (user_id uuid, student_id text, full_name text, sabab text, ref text, izoh text)
language sql stable security definer set search_path = '' as $$
  -- 1) dropped a level, or failed the level exam, in the last 14 days
  select t.id, t.student_id, t.full_name, 'daraja_tushdi', lt.id::text,
         case when lt.to_level < lt.from_level then format('level %s → %s', lt.from_level, lt.to_level)
              else format('failed level %s exam', lt.from_level) end
  from public.level_transitions lt
  join bot.v_talaba t on t.id = lt.user_id and t.status = 'active'
  where (lt.to_level < lt.from_level or lt.outcome = 'failed')
    and lt.created_at > now() - interval '14 days'
  union all
  -- 2) no sign-in for p_kun days; ref = last sign-in date, so it fires again only after a new gap
  select t.id, t.student_id, t.full_name, 'kirmagan', coalesce(t.last_sign_in_at::date::text, 'hech'),
         case when t.last_sign_in_at is null then 'never signed in'
              else format('inactive %s days', current_date - t.last_sign_in_at::date) end
  from bot.v_talaba t
  where t.status = 'active'
    and coalesce(t.last_sign_in_at, t.created_at) < now() - make_interval(days => p_kun)
  union all
  -- 3) published exam of the student's group, deadline (and any extension) passed in the last 30 days, not submitted
  select distinct t.id, t.student_id, t.full_name, 'imtihon_otdi', e.id::text,
         format('missed "%s"', left(e.title, 40))
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
    'muddat_48s', (select count(*) from public.written_exams e
                    where e.is_published and e.deadline_at between now() and now() + interval '48 hours'),
    'xavfdagi', (select count(distinct x.user_id) from bot._xavflar(7) x))
  || (select jsonb_build_object(
        'xavf_daraja', count(distinct x.user_id) filter (where x.sabab = 'daraja_tushdi'),
        'xavf_kirmagan', count(distinct x.user_id) filter (where x.sabab = 'kirmagan'),
        'xavf_imtihon', count(distinct x.user_id) filter (where x.sabab = 'imtihon_otdi'))
      from bot._xavflar(7) x)
  into r
  from bot.v_talaba t;
  return r;
end $$;
