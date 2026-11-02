-- Payment policy: pay-by date, grace period, per-student extensions, automatic reminders, order cleanup.
-- Safe by default: with no pay-by date set, nothing changes for students (same rule as before + a grace period after a plan ends).
--
-- Lifecycle of a student's access (only while payments_enforced = true):
--   active      a plan is running                      (reminders 7 / 3 / 1 days before it ends)
--   pre_due     never paid, pay-by date is in future   (access stays open; reminders 7 / 3 / 1 days before the date)
--   grace       plan ended / pay-by date passed        (access stays open for `grace_days`, default 3; daily warning)
--   extended    admin gave this student more time      (access open until the date the admin chose)
--   overdue     grace is over                          (access closed until they pay)

-- ---------------------------------------------------------------- settings
alter table public.payment_settings
  add column if not exists pay_due_at timestamptz,
  add column if not exists grace_days integer not null default 3,
  add column if not exists order_hold_hours integer not null default 24;
do $$ begin
  alter table public.payment_settings add constraint payment_settings_grace_chk check (grace_days between 0 and 30);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.payment_settings add constraint payment_settings_hold_chk check (order_hold_hours between 1 and 720);
exception when duplicate_object then null; end $$;

create or replace function public.admin_save_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  update public.payment_settings set
    payments_enforced = coalesce((p->>'payments_enforced')::boolean, payments_enforced),
    paymob_enabled = coalesce((p->>'paymob_enabled')::boolean, paymob_enabled),
    bank_transfer_enabled = coalesce((p->>'bank_transfer_enabled')::boolean, bank_transfer_enabled),
    charge_currency = coalesce(upper(nullif(p->>'charge_currency','')), charge_currency),
    seller_name = coalesce(p->>'seller_name', seller_name),
    seller_address = coalesce(p->>'seller_address', seller_address),
    seller_tax_id = coalesce(p->>'seller_tax_id', seller_tax_id),
    seller_email = coalesce(p->>'seller_email', seller_email),
    seller_country = coalesce(upper(nullif(p->>'seller_country','')), seller_country),
    tax_label = coalesce(p->>'tax_label', tax_label),
    tax_rate = coalesce((p->>'tax_rate')::numeric, tax_rate),
    prices_include_tax = coalesce((p->>'prices_include_tax')::boolean, prices_include_tax),
    tax_note = coalesce(p->>'tax_note', tax_note),
    bank_instructions = coalesce(p->>'bank_instructions', bank_instructions),
    refund_days = coalesce((p->>'refund_days')::int, refund_days),
    terms_version = coalesce(nullif(p->>'terms_version',''), terms_version),
    pay_due_at = case when p ? 'pay_due_at' then nullif(p->>'pay_due_at','')::timestamptz else pay_due_at end,
    grace_days = coalesce((p->>'grace_days')::int, grace_days),
    order_hold_hours = coalesce((p->>'order_hold_hours')::int, order_hold_hours),
    updated_at = now()
  where id = 1;
end $$;

-- ---------------------------------------------------------------- per-student extensions + notice log
create table if not exists public.payment_extensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  until timestamptz not null,
  reason text,
  granted_by uuid,
  created_at timestamptz not null default now()
);
alter table public.payment_extensions enable row level security;
drop policy if exists payment_extensions_own on public.payment_extensions;
create policy payment_extensions_own on public.payment_extensions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.payment_extensions from anon;
revoke insert, update, delete on public.payment_extensions from authenticated;

create table if not exists public.payment_notice_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.payment_notice_log enable row level security;
revoke all on public.payment_notice_log from anon, authenticated;

-- ---------------------------------------------------------------- orders: when cancelled, when an unpaid order lapses
alter table public.orders add column if not exists cancelled_at timestamptz, add column if not exists expires_at timestamptz;
update public.orders set cancelled_at = coalesce(cancelled_at, created_at) where status = 'cancelled';
update public.orders set expires_at = created_at + case when method = 'bank_transfer' then interval '72 hours' else interval '24 hours' end
 where status = 'pending' and expires_at is null;

create or replace function public.trg_orders_lifecycle()
returns trigger language plpgsql set search_path = public as $$
declare v_hold int;
begin
  if tg_op = 'INSERT' then
    select order_hold_hours into v_hold from public.payment_settings where id = 1;
    v_hold := coalesce(v_hold, 24);
    new.expires_at := now() + make_interval(hours => case when new.method = 'bank_transfer' then v_hold * 3 else v_hold end);
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
  end if;
  return new;
end $$;
drop trigger if exists orders_lifecycle on public.orders;
create trigger orders_lifecycle before insert or update of status on public.orders for each row execute function public.trg_orders_lifecycle();

-- Cancelled / failed orders disappear after one day; an unpaid order disappears when its payment window is over.
-- Orders that are waiting for review or already paid are never touched.
create or replace function public.ufuq_cleanup_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.orders o
   where (o.status = 'cancelled' and coalesce(o.cancelled_at, o.created_at) < now() - interval '1 day')
      or (o.status = 'failed' and o.created_at < now() - interval '1 day')
      or (o.status = 'pending' and o.expires_at is not null and o.expires_at < now());
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.ufuq_cleanup_orders() from public, anon, authenticated;

-- ---------------------------------------------------------------- the access rule
create or replace function public.user_has_access(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.profiles p where p.id = p_uid
                 and (p.role = 'teacher' or (p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super'))) then true
    when not coalesce((select s.payments_enforced from public.payment_settings s where s.id = 1), true) then true
    when exists (select 1 from public.profiles p where p.id = p_uid and p.status = 'blocked') then false
    when exists (select 1 from public.subscriptions s where s.user_id = p_uid and s.revoked_at is null and now() between s.starts_at and s.ends_at) then true
    when exists (select 1 from public.payment_extensions x where x.user_id = p_uid and x.until > now()) then true
    -- grace after the last plan ended
    when exists (select 1 from public.subscriptions s where s.user_id = p_uid and s.revoked_at is null
                 and s.ends_at + make_interval(days => coalesce((select grace_days from public.payment_settings where id = 1), 0)) > now()) then true
    -- never paid: open until the pay-by date (+ grace) when the admin set one
    when not exists (select 1 from public.subscriptions s where s.user_id = p_uid and s.revoked_at is null)
         and (select pay_due_at + make_interval(days => grace_days) from public.payment_settings where id = 1) > now() then true
    else false
  end;
$$;

create or replace function public.my_access()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.payment_settings;
  v_exempt boolean;
  v_ends timestamptz;       -- end of the running plan
  v_last timestamptz;       -- end of the latest plan (running or not)
  v_ext timestamptz;
  v_state text;
  v_due timestamptz;
  v_grace_end timestamptz;
begin
  select * into s from public.payment_settings where id = 1;
  if v_uid is null then return jsonb_build_object('enforced', coalesce(s.payments_enforced, false), 'active', false, 'exempt', false, 'ends_at', null, 'has_access', false, 'state', 'none'); end if;
  select (p.role = 'teacher' or (p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super')) into v_exempt from public.profiles p where p.id = v_uid;
  select max(x.ends_at) filter (where now() between x.starts_at and x.ends_at), max(x.ends_at)
    into v_ends, v_last from public.subscriptions x where x.user_id = v_uid and x.revoked_at is null;
  select until into v_ext from public.payment_extensions where user_id = v_uid and until > now();

  if coalesce(v_exempt, false) then v_state := 'exempt';
  elsif not coalesce(s.payments_enforced, false) then v_state := 'free';
  elsif v_ends is not null then
    v_state := case when v_ends <= now() + interval '7 days' then 'expiring' else 'active' end; v_due := v_ends;
  elsif v_ext is not null then v_state := 'extended'; v_due := v_ext;
  elsif v_last is not null then
    v_due := v_last; v_grace_end := v_last + make_interval(days => s.grace_days);
    v_state := case when v_grace_end > now() then 'grace' else 'overdue' end;
  elsif s.pay_due_at is not null then
    v_due := s.pay_due_at; v_grace_end := s.pay_due_at + make_interval(days => s.grace_days);
    v_state := case when s.pay_due_at > now() then 'pre_due' when v_grace_end > now() then 'grace' else 'overdue' end;
  else v_state := 'overdue';
  end if;

  return jsonb_build_object(
    'enforced', coalesce(s.payments_enforced, false),
    'exempt', coalesce(v_exempt, false),
    'active', v_ends is not null,
    'ends_at', v_ends,
    'has_access', public.user_has_access(v_uid),
    'state', v_state,
    'due_at', v_due,
    'grace_ends_at', v_grace_end,
    'extension_until', v_ext,
    'grace_days', s.grace_days
  );
end $$;

create or replace function public.payments_public_config()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.payment_settings;
begin
  select * into s from public.payment_settings where id = 1;
  return jsonb_build_object(
    'enforced', s.payments_enforced,
    'paymob_enabled', s.paymob_enabled,
    'bank_transfer_enabled', s.bank_transfer_enabled,
    'charge_currency', s.charge_currency,
    'tax_label', s.tax_label, 'tax_rate', s.tax_rate, 'prices_include_tax', s.prices_include_tax,
    'refund_days', s.refund_days, 'terms_version', s.terms_version,
    'seller_name', s.seller_name,
    'grace_days', s.grace_days, 'order_hold_hours', s.order_hold_hours,
    'bank_instructions', case when auth.uid() is null then '' else s.bank_instructions end,
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'months', p.months, 'usd_cents', p.price_usd_cents) order by p.sort), '[]'::jsonb) from public.plans p where p.active),
    'fx', (select coalesce(jsonb_object_agg(f.currency, f.per_usd), '{}'::jsonb) from public.fx_rates f)
  );
end $$;

-- ---------------------------------------------------------------- admin: overview, extensions, reminders
create or replace function public.admin_payment_overview(p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.payment_settings;
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  select * into s from public.payment_settings where id = 1;
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.rank, r.due_at nulls last), '[]'::jsonb) from (
    select q.*, case q.state when 'overdue' then 0 when 'grace' then 1 when 'expiring' then 2 when 'pre_due' then 3 when 'extended' then 4 when 'active' then 5 else 6 end as rank
    from (
      select p.id as user_id, p.full_name, u.email::text as email, p.status,
             sub.ends_at as active_until, sub.last_end, x.until as extension_until,
             case
               when not s.payments_enforced then 'free'
               when sub.ends_at is not null then case when sub.ends_at <= now() + interval '7 days' then 'expiring' else 'active' end
               when x.until is not null then 'extended'
               when sub.last_end is not null then case when sub.last_end + make_interval(days => s.grace_days) > now() then 'grace' else 'overdue' end
               when s.pay_due_at is not null then case when s.pay_due_at > now() then 'pre_due' when s.pay_due_at + make_interval(days => s.grace_days) > now() then 'grace' else 'overdue' end
               else 'overdue' end as state,
             coalesce(sub.ends_at, x.until, sub.last_end, s.pay_due_at) as due_at,
             case when sub.ends_at is null and sub.last_end is not null then sub.last_end + make_interval(days => s.grace_days)
                  when sub.ends_at is null and sub.last_end is null and s.pay_due_at is not null then s.pay_due_at + make_interval(days => s.grace_days) end as grace_ends_at
      from public.profiles p join auth.users u on u.id = p.id
      left join lateral (select max(z.ends_at) filter (where now() between z.starts_at and z.ends_at) as ends_at, max(z.ends_at) as last_end
                         from public.subscriptions z where z.user_id = p.id and z.revoked_at is null) sub on true
      left join public.payment_extensions x on x.user_id = p.id and x.until > now()
      where p.role = 'student' and coalesce(p.status, '') <> 'blocked'
        and (p_q is null or p_q = '' or u.email ilike '%' || p_q || '%' or p.full_name ilike '%' || p_q || '%')
    ) q
  ) r);
end $$;

create or replace function public.admin_grant_extension(p_user uuid, p_until timestamptz, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '180 days' then raise exception 'BAD_DATE'; end if;
  insert into public.payment_extensions (user_id, until, reason, granted_by) values (p_user, p_until, left(coalesce(p_reason, ''), 300), auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, granted_by = excluded.granted_by, created_at = now();
  insert into public.notifications (user_id, kind, title, body)
  values (p_user, 'system', 'More time to pay', 'Your payment deadline was extended until ' || to_char(p_until, 'YYYY-MM-DD') || '. Your access stays open until then.');
end $$;

create or replace function public.admin_revoke_extension(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  delete from public.payment_extensions where user_id = p_user;
end $$;

create or replace function public.admin_remind_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  insert into public.notifications (user_id, kind, title, body)
  values (p_user, 'system', 'Payment reminder', 'Please renew your plan to keep your lessons, tasks and exams open. You can do it in Billing.');
end $$;

-- Daily reminders (idempotent: one notice per student, kind and date). Also callable from the admin panel.
create or replace function public.send_payment_notices()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s public.payment_settings;
  r record; v_n int := 0; v_kind text; v_title text; v_body text; v_ref text; v_days int; v_grace_end timestamptz;
begin
  if auth.uid() is not null and not public._is_admin() then raise exception 'not allowed'; end if;
  select * into s from public.payment_settings where id = 1;
  if not s.payments_enforced then return 0; end if;
  for r in
    select p.id as uid,
           (select max(z.ends_at) filter (where now() between z.starts_at and z.ends_at) from public.subscriptions z where z.user_id = p.id and z.revoked_at is null) as ends_at,
           (select max(z.ends_at) from public.subscriptions z where z.user_id = p.id and z.revoked_at is null) as last_end,
           exists (select 1 from public.payment_extensions x where x.user_id = p.id and x.until > now()) as extended
    from public.profiles p
    where p.role = 'student' and coalesce(p.status, '') <> 'blocked'
  loop
    continue when r.extended;
    v_kind := null;
    if r.ends_at is not null then
      v_days := ceil(extract(epoch from (r.ends_at - now())) / 86400)::int;
      if v_days in (7, 3, 1) then
        v_kind := 'exp' || v_days; v_ref := to_char(r.ends_at, 'YYYY-MM-DD');
        v_title := 'Your plan ends in ' || v_days || ' day' || case when v_days > 1 then 's' else '' end;
        v_body := 'Your access ends on ' || v_ref || '. Renew in Billing to keep learning without a break.';
      end if;
    elsif r.last_end is not null or s.pay_due_at is not null then
      if r.last_end is null then
        v_days := ceil(extract(epoch from (s.pay_due_at - now())) / 86400)::int;
        v_ref := to_char(s.pay_due_at, 'YYYY-MM-DD'); v_grace_end := s.pay_due_at + make_interval(days => s.grace_days);
        if v_days in (7, 3, 1) then
          v_kind := 'due' || v_days; v_title := 'Payment is required in ' || v_days || ' day' || case when v_days > 1 then 's' else '' end;
          v_body := 'Please choose a plan before ' || v_ref || ' to keep your access to lessons, tasks and exams.';
        end if;
      else
        v_ref := to_char(r.last_end, 'YYYY-MM-DD'); v_grace_end := r.last_end + make_interval(days => s.grace_days);
      end if;
      if v_kind is null and v_grace_end is not null then
        if v_grace_end > now() and (r.last_end is not null and r.last_end < now() or r.last_end is null and s.pay_due_at <= now()) then
          v_days := ceil(extract(epoch from (v_grace_end - now())) / 86400)::int;
          v_kind := 'grace' || v_days; v_title := 'Payment overdue – ' || v_days || ' day' || case when v_days > 1 then 's' else '' end || ' left';
          v_body := 'Your access will be closed on ' || to_char(v_grace_end, 'YYYY-MM-DD') || ' unless you pay. Open Billing to choose a plan.';
        elsif v_grace_end <= now() and v_grace_end > now() - interval '1 day' then
          v_kind := 'closed'; v_title := 'Access closed'; v_body := 'Your access is closed because payment was not received. Choose a plan in Billing to reopen it.';
        end if;
      end if;
    end if;
    if v_kind is not null then
      insert into public.payment_notice_log (user_id, kind, ref) values (r.uid, v_kind, coalesce(v_ref, '')) on conflict do nothing;
      if found then
        insert into public.notifications (user_id, kind, title, body) values (r.uid, 'system', v_title, v_body);
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end $$;

revoke all on function public.admin_payment_overview(text), public.admin_grant_extension(uuid, timestamptz, text), public.admin_revoke_extension(uuid),
  public.admin_remind_user(uuid), public.send_payment_notices() from public, anon;
grant execute on function public.admin_payment_overview(text), public.admin_grant_extension(uuid, timestamptz, text), public.admin_revoke_extension(uuid),
  public.admin_remind_user(uuid), public.send_payment_notices() to authenticated;

-- ---------------------------------------------------------------- schedules
do $$ begin
  perform cron.unschedule('ufuq-cleanup-orders');
exception when others then null; end $$;
select cron.schedule('ufuq-cleanup-orders', '17 * * * *', 'select public.ufuq_cleanup_orders()');
do $$ begin
  perform cron.unschedule('ufuq-payment-notices');
exception when others then null; end $$;
select cron.schedule('ufuq-payment-notices', '0 6 * * *', 'select public.send_payment_notices()');
