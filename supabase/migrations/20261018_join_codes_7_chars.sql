-- STATUS: APPLIED to live (verified 2026-11-01; the level check on join_group() was added in 20261111_exam_level_hardening.sql).
-- Join codes: 7 chars, letters + digits mixed, no look-alikes; every old code is replaced; join_group() rate-limited.

create table if not exists public.join_attempts (
  id bigserial primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists join_attempts_user_time on public.join_attempts (user_id, created_at desc);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;
revoke all on sequence public.join_attempts_id_seq from anon, authenticated;

create or replace function public._new_join_code()
returns text language plpgsql set search_path to 'public' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v text; b bytea; i int;
begin
  loop
    b := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 1 for 1);
    v := '';
    for i in 0..6 loop
      v := v || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
    end loop;
    exit when v ~ '[A-Z]' and v ~ '[2-9]';
  end loop;
  return v;
end $$;

-- the BEFORE INSERT/UPDATE trigger also enforced the old 6-char format -> switch it to 7 BEFORE replacing the codes
create or replace function public.trg_check_access_code()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.code := upper(trim(new.code));
  if new.code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$' or new.code !~ '[A-Z]' or new.code !~ '[2-9]' then
    raise exception 'Join code must be 7 characters: letters A-Z (except I, L, O) mixed with digits 2-9';
  end if;
  if exists (select 1 from public.groups g where g.code = new.code and g.code <> new.group_code) then
    raise exception 'Bu kod boshqa guruhga tegishli';
  end if;
  return new;
end $$;

alter table public.group_access_codes drop constraint if exists group_access_codes_code_format;

do $$
declare r record; c text;
begin
  for r in select group_code from public.group_access_codes loop
    loop
      c := public._new_join_code();
      exit when not exists (select 1 from public.group_access_codes a where a.code = c);
    end loop;
    update public.group_access_codes set code = c where group_code = r.group_code;
  end loop;
end $$;

alter table public.group_access_codes add constraint group_access_codes_code_format
  check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$' and code ~ '[A-Z]' and code ~ '[2-9]');

create or replace function public.join_group(p_code text)
returns table(group_code text, group_name text, group_schedule text, group_zoom_link text, group_schedule_days jsonb)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  v_group public.groups%rowtype;
  v_user_name text;
  v_group_code text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_fails int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select count(*) into v_fails from public.join_attempts
   where user_id = auth.uid() and created_at > now() - interval '15 minutes';
  if v_fails >= 8 then raise exception 'TOO_MANY_ATTEMPTS'; end if;

  if v_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$' then
    select gac.group_code into v_group_code from public.group_access_codes gac where gac.code = v_code;
    if v_group_code is not null then
      select * into v_group from public.groups g where g.code = v_group_code and g.is_active = true limit 1;
    end if;
  end if;

  if v_group.code is null then
    -- log the failure and return no row (raising would roll the log back); the client shows "wrong code"
    insert into public.join_attempts (user_id) values (auth.uid());
    delete from public.join_attempts where created_at < now() - interval '2 days';
    return;
  end if;

  select coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Student')
    into v_user_name from auth.users u where u.id = auth.uid();

  insert into public.group_members (user_id, group_code, name, joined_at)
  values (auth.uid(), v_group.code, coalesce(v_user_name, 'Student'), now())
  on conflict (user_id, group_code) do nothing;

  update public.profiles p set status = 'active', updated_at = now() where p.id = auth.uid();

  return query select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end $$;

revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;
