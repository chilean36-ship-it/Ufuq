-- ============================================================================
-- Ufuq — payments (prepaid periods, Paymob card payments + manual bank transfers, invoices, access control)
--
-- Run ONCE in the Supabase SQL editor. Safe to run again (everything is "if not exists" / "create or replace").
-- Nothing changes for students until a main admin switches "payments_enforced" ON in Admin → Payments.
--
-- Design rules
--  * The browser NEVER sends a price: the server computes it from `plans` + `fx_rates` + `payment_settings`.
--  * Card data never touches Ufuq: the card is typed on Paymob's hosted page; Paymob calls our webhook (edge function
--    `paymob-webhook`), which verifies the HMAC and then calls finalize_order_paid() — idempotent, amount-checked.
--  * Financial records are kept when an account is deleted (orders.user_id becomes NULL, the buyer snapshot stays):
--    tax law requires keeping invoices for years. State this in the privacy policy.
-- ============================================================================

-- ---------- settings (one row) ----------
create table if not exists public.payment_settings (
  id int primary key default 1 check (id = 1),
  payments_enforced boolean not null default false,       -- OFF: everybody keeps full access (today's behaviour)
  paymob_enabled boolean not null default false,          -- show "Pay by card" once Paymob keys are in place
  bank_transfer_enabled boolean not null default true,
  charge_currency text not null default 'EGP',            -- the currency Paymob actually charges
  seller_name text not null default '',
  seller_address text not null default '',
  seller_tax_id text not null default '',
  seller_email text not null default '',
  seller_country text not null default 'EG',
  tax_label text not null default 'VAT',
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate < 100),
  prices_include_tax boolean not null default true,
  tax_note text not null default '',                      -- printed on invoices, e.g. "Exported service — 0%"
  bank_instructions text not null default '',             -- shown to students who choose bank transfer
  refund_days int not null default 14 check (refund_days >= 0),
  terms_version text not null default '2026-10',
  updated_at timestamptz not null default now()
);
insert into public.payment_settings (id) values (1) on conflict do nothing;

-- ---------- plans ----------
create table if not exists public.plans (
  id text primary key,
  title text not null,
  months int not null check (months > 0),
  price_usd_cents int not null check (price_usd_cents > 0),
  active boolean not null default true,
  sort int not null default 0
);
insert into public.plans (id, title, months, price_usd_cents, sort) values
  ('monthly', 'Monthly', 1, 3000, 1),
  ('yearly', 'Yearly', 12, 29880, 2)
on conflict (id) do nothing;

-- ---------- exchange rates (units of currency per 1 USD). Seed values are ROUGH — refresh from Admin → Payments ----------
create table if not exists public.fx_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  per_usd numeric(18,6) not null check (per_usd > 0),
  source text not null default 'seed',
  updated_at timestamptz not null default now()
);
insert into public.fx_rates (currency, per_usd) values
  ('USD',1),('EGP',50),('UZS',12800),('EUR',0.92),('GBP',0.78),('RUB',92),('KZT',500),('KGS',87),('TJS',10.9),
  ('TRY',41),('SAR',3.75),('AED',3.6725),('QAR',3.64),('KWD',0.31),('JOD',0.71),('MAD',9.8),('DZD',134),('TND',3.1),
  ('NGN',1550),('PKR',280),('INR',84),('IDR',16000),('MYR',4.4),('CAD',1.38),('AUD',1.55)
on conflict (currency) do nothing;

-- ---------- orders ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,                                  -- assigned when paid (gap-free per year)
  user_id uuid references auth.users(id) on delete set null,
  plan_id text not null references public.plans(id),
  months int not null,
  method text not null check (method in ('paymob','bank_transfer','admin')),
  status text not null default 'pending' check (status in ('pending','awaiting_review','paid','failed','cancelled','rejected','refunded')),
  usd_cents int not null,
  display_currency text not null,
  display_amount numeric(18,2) not null,
  charge_currency text not null,
  charge_cents bigint not null,                            -- gross amount charged, in minor units of charge_currency
  fx_rate numeric(18,6) not null,
  tax_label text not null default '',
  tax_rate numeric(5,2) not null default 0,
  tax_cents bigint not null default 0,
  buyer_name text not null,
  buyer_email text not null,
  buyer_country text not null,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  provider_ref text,                                       -- Paymob intention id
  provider_order_id text,                                  -- Paymob order id
  provider_txn_id text,
  proof_path text,                                         -- storage path of the transfer receipt
  proof_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  paid_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  refunded_at timestamptz,
  refund_cents bigint not null default 0,
  refund_note text,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);

create table if not exists public.invoice_counters (year int primary key, last int not null default 0);

-- ---------- access periods ----------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  source text not null check (source in ('paymob','bank_transfer','admin')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  revoked_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, ends_at desc);

-- ---------- row level security: read your own, write nothing directly ----------
alter table public.payment_settings enable row level security;
alter table public.plans enable row level security;
alter table public.fx_rates enable row level security;
alter table public.orders enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select using (true);
drop policy if exists fx_read on public.fx_rates;
create policy fx_read on public.fx_rates for select using (true);
drop policy if exists orders_read_own on public.orders;
create policy orders_read_own on public.orders for select to authenticated using (user_id = auth.uid());
drop policy if exists subs_read_own on public.subscriptions;
create policy subs_read_own on public.subscriptions for select to authenticated using (user_id = auth.uid());

revoke all on public.payment_settings, public.invoice_counters from anon, authenticated;
revoke insert, update, delete on public.plans, public.fx_rates, public.orders, public.subscriptions from anon, authenticated;

grant select on public.plans, public.fx_rates to anon, authenticated;
grant select on public.orders, public.subscriptions to authenticated;

-- ---------- helpers ----------
create or replace function public._is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Does this user currently have paid access? (staff and "payments not enforced yet" always pass)
create or replace function public.user_has_access(p_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select
    not (select payments_enforced from public.payment_settings where id = 1)
    or exists (select 1 from public.profiles p where p.id = p_uid and p.role in ('admin','teacher'))
    or exists (select 1 from public.subscriptions s where s.user_id = p_uid and s.revoked_at is null and now() between s.starts_at and s.ends_at);
$$;

create or replace function public.my_access() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_enforced boolean;
  v_role text;
  v_ends timestamptz;
begin
  select payments_enforced into v_enforced from public.payment_settings where id = 1;
  if v_uid is null then return jsonb_build_object('enforced', v_enforced, 'active', false, 'exempt', false, 'ends_at', null); end if;
  select role into v_role from public.profiles where id = v_uid;
  select max(s.ends_at) into v_ends from public.subscriptions s where s.user_id = v_uid and s.revoked_at is null and now() between s.starts_at and s.ends_at;
  return jsonb_build_object(
    'enforced', coalesce(v_enforced, false),
    'exempt', coalesce(v_role in ('admin','teacher'), false),
    'active', v_ends is not null,
    'ends_at', v_ends,
    'has_access', public.user_has_access(v_uid)
  );
end $$;

-- Everything the checkout page needs (no secrets). Bank instructions only for signed-in users.
create or replace function public.payments_public_config() returns jsonb language plpgsql stable security definer set search_path = public as $$
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
    'bank_instructions', case when auth.uid() is null then '' else s.bank_instructions end,
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'months', p.months, 'usd_cents', p.price_usd_cents) order by p.sort), '[]'::jsonb) from public.plans p where p.active),
    'fx', (select coalesce(jsonb_object_agg(f.currency, f.per_usd), '{}'::jsonb) from public.fx_rates f)
  );
end $$;

-- ---------- creating an order (price computed here, never trusted from the browser) ----------
create or replace function public.create_order(p_plan text, p_method text, p_country text, p_name text, p_email text, p_display_currency text, p_terms_version text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.payment_settings;
  pl public.plans;
  v_rate_charge numeric;
  v_rate_disp numeric;
  v_disp text := upper(coalesce(nullif(trim(p_display_currency), ''), 'USD'));
  v_gross bigint;
  v_tax bigint := 0;
  v_row public.orders;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_method not in ('paymob','bank_transfer') then raise exception 'BAD_METHOD'; end if;
  select * into s from public.payment_settings where id = 1;
  if p_method = 'paymob' and not s.paymob_enabled then raise exception 'METHOD_UNAVAILABLE'; end if;
  if p_method = 'bank_transfer' and not s.bank_transfer_enabled then raise exception 'METHOD_UNAVAILABLE'; end if;
  select * into pl from public.plans where id = p_plan and active;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or position('@' in coalesce(p_email, '')) < 2 then raise exception 'BAD_BUYER'; end if;
  if coalesce(p_terms_version, '') = '' then raise exception 'TERMS_REQUIRED'; end if;

  select per_usd into v_rate_charge from public.fx_rates where currency = s.charge_currency;
  if v_rate_charge is null then raise exception 'NO_RATE'; end if;
  select per_usd into v_rate_disp from public.fx_rates where currency = v_disp;
  if v_rate_disp is null then v_disp := 'USD'; v_rate_disp := 1; end if;

  v_gross := round(pl.price_usd_cents * v_rate_charge);
  if s.tax_rate > 0 then
    if s.prices_include_tax then v_tax := round(v_gross - v_gross / (1 + s.tax_rate / 100));
    else v_tax := round(v_gross * s.tax_rate / 100); v_gross := v_gross + v_tax; end if;
  end if;

  insert into public.orders (user_id, plan_id, months, method, status, usd_cents, display_currency, display_amount, charge_currency, charge_cents, fx_rate,
                             tax_label, tax_rate, tax_cents, buyer_name, buyer_email, buyer_country, terms_version)
  values (v_uid, pl.id, pl.months, p_method, 'pending', pl.price_usd_cents, v_disp,
          case when v_rate_disp >= 100 then round(pl.price_usd_cents / 100.0 * v_rate_disp) else round(pl.price_usd_cents / 100.0 * v_rate_disp, 2) end,
          s.charge_currency, v_gross, v_rate_charge, s.tax_label, s.tax_rate, v_tax,
          trim(p_name), lower(trim(p_email)), upper(left(coalesce(p_country, ''), 2)), p_terms_version)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.cancel_my_order(p_order uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'cancelled' where id = p_order and user_id = auth.uid() and status = 'pending';
end $$;

-- Student attaches the bank-transfer receipt (file already uploaded to storage 'payment-proofs/<uid>/…').
create or replace function public.submit_transfer_proof(p_order uuid, p_path text, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> v_uid::text then raise exception 'BAD_PATH'; end if;
  update public.orders set proof_path = p_path, proof_note = left(coalesce(p_note, ''), 500), status = 'awaiting_review'
   where id = p_order and user_id = v_uid and method = 'bank_transfer' and status in ('pending','awaiting_review');
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
end $$;

-- ---------- granting access / marking paid ----------
create or replace function public._grant_period(p_user uuid, p_months int, p_source text, p_order uuid, p_note text, out o_start timestamptz, out o_end timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  select greatest(now(), coalesce(max(s.ends_at), now())) into o_start from public.subscriptions s where s.user_id = p_user and s.revoked_at is null;
  o_end := o_start + make_interval(months => p_months);
  insert into public.subscriptions (user_id, order_id, source, starts_at, ends_at, note) values (p_user, p_order, p_source, o_start, o_end, p_note);
end $$;

create or replace function public._next_invoice_no() returns text language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now() at time zone 'Africa/Cairo')::int; v_n int;
begin
  insert into public.invoice_counters (year, last) values (v_year, 1)
    on conflict (year) do update set last = public.invoice_counters.last + 1 returning last into v_n;
  return 'UFQ-' || v_year || '-' || lpad(v_n::text, 6, '0');
end $$;

-- Internal: mark an order paid, give the period, number the invoice, tell the student. Idempotent.
create or replace function public._complete_order(p_order uuid, p_txn text, p_provider_order text) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_start timestamptz; v_end timestamptz;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = 'paid' then return jsonb_build_object('ok', true, 'already', true, 'invoice_no', o.invoice_no); end if;
  if o.status in ('refunded','rejected') then raise exception 'ORDER_CLOSED'; end if;
  if o.user_id is null then raise exception 'USER_GONE'; end if;
  select g.o_start, g.o_end into v_start, v_end from public._grant_period(o.user_id, o.months, o.method, o.id, 'order ' || o.id::text) g;
  update public.orders set status = 'paid', paid_at = now(), starts_at = v_start, ends_at = v_end, invoice_no = public._next_invoice_no(),
         provider_txn_id = coalesce(p_txn, provider_txn_id), provider_order_id = coalesce(p_provider_order, provider_order_id)
   where id = o.id returning * into o;
  insert into public.notifications (user_id, kind, title, body, link)
  values (o.user_id, 'system', 'Payment received', 'Thank you! Your access is active until ' || to_char(v_end at time zone 'UTC', 'YYYY-MM-DD') || '. Invoice ' || o.invoice_no || '.', null);
  return jsonb_build_object('ok', true, 'already', false, 'invoice_no', o.invoice_no, 'ends_at', v_end);
end $$;

-- Called ONLY by the paymob-webhook edge function (service role) after it verified Paymob's HMAC.
create or replace function public.finalize_order_paid(p_order uuid, p_txn text, p_provider_order text, p_amount_cents bigint, p_currency text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.method <> 'paymob' then raise exception 'WRONG_METHOD'; end if;
  if o.charge_cents <> p_amount_cents or upper(o.charge_currency) <> upper(p_currency) then raise exception 'AMOUNT_MISMATCH'; end if;
  return public._complete_order(p_order, p_txn, p_provider_order);
end $$;

create or replace function public.mark_order_failed(p_order uuid, p_txn text) returns void language sql security definer set search_path = public as $$
  update public.orders set status = 'failed', provider_txn_id = coalesce(p_txn, provider_txn_id) where id = p_order and status = 'pending';
$$;

create or replace function public.set_order_provider(p_order uuid, p_ref text) returns void language sql security definer set search_path = public as $$
  update public.orders set provider_ref = p_ref where id = p_order and status = 'pending';
$$;

-- ---------- invoice for the student (own paid orders) ----------
create or replace function public.get_invoice(p_order uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; s public.payment_settings; v_plan text;
begin
  select * into o from public.orders where id = p_order and (user_id = auth.uid() or public._is_admin());
  if not found or o.invoice_no is null then raise exception 'INVOICE_NOT_FOUND'; end if;
  select * into s from public.payment_settings where id = 1;
  select title into v_plan from public.plans where id = o.plan_id;
  return jsonb_build_object(
    'invoice_no', o.invoice_no, 'issued_at', o.paid_at, 'status', o.status,
    'seller', jsonb_build_object('name', s.seller_name, 'address', s.seller_address, 'tax_id', s.seller_tax_id, 'email', s.seller_email, 'country', s.seller_country),
    'buyer', jsonb_build_object('name', o.buyer_name, 'email', o.buyer_email, 'country', o.buyer_country),
    'item', jsonb_build_object('plan', coalesce(v_plan, o.plan_id), 'months', o.months, 'from', o.starts_at, 'to', o.ends_at),
    'currency', o.charge_currency, 'total_cents', o.charge_cents, 'tax_cents', o.tax_cents, 'tax_rate', o.tax_rate, 'tax_label', o.tax_label,
    'tax_note', s.tax_note, 'refund_cents', o.refund_cents,
    'display_currency', o.display_currency, 'display_amount', o.display_amount, 'usd_cents', o.usd_cents, 'fx_rate', o.fx_rate,
    'method', o.method, 'reference', coalesce(o.provider_txn_id, o.id::text)
  );
end $$;

-- ---------- admin ----------
create or replace function public.admin_list_orders(p_status text default null, p_from date default null, p_to date default null, p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) from (
    select o.id, o.invoice_no, o.status, o.method, o.plan_id, o.months, o.usd_cents, o.display_currency, o.display_amount, o.charge_currency, o.charge_cents, o.tax_cents,
           o.buyer_name, o.buyer_email, o.buyer_country, o.user_id, o.proof_path, o.proof_note, o.review_note, o.paid_at, o.starts_at, o.ends_at, o.refund_cents, o.refund_note,
           o.provider_txn_id, o.created_at
    from public.orders o
    where (p_status is null or p_status = '' or o.status = p_status)
      and (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to + 1)
      and (p_q is null or p_q = '' or o.buyer_email ilike '%' || p_q || '%' or o.buyer_name ilike '%' || p_q || '%' or o.invoice_no ilike '%' || p_q || '%')
    order by o.created_at desc limit 1000) r);
end $$;

create or replace function public.admin_review_order(p_order uuid, p_approve boolean, p_note text) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.method <> 'bank_transfer' then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status not in ('awaiting_review','pending') then raise exception 'ORDER_NOT_REVIEWABLE'; end if;
  if p_approve then
    update public.orders set reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(coalesce(p_note,''), 500) where id = p_order;
    return public._complete_order(p_order, 'bank:' || p_order::text, null);
  end if;
  update public.orders set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(coalesce(p_note,''), 500) where id = p_order;
  insert into public.notifications (user_id, kind, title, body) values (o.user_id, 'system', 'Payment not confirmed', 'We could not match your bank transfer. ' || left(coalesce(p_note,''), 300));
  return jsonb_build_object('ok', true, 'rejected', true);
end $$;

-- Give someone access without a payment (scholarship, teacher’s guest, support fix).
create or replace function public.admin_grant_access(p_user uuid, p_months int, p_note text) returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_end timestamptz;
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  if p_months < 1 or p_months > 36 then raise exception 'BAD_MONTHS'; end if;
  select g.o_end into v_end from public._grant_period(p_user, p_months, 'admin', null, left(coalesce(p_note,''), 300)) g;
  insert into public.notifications (user_id, kind, title, body) values (p_user, 'system', 'Access granted', 'Your access is active until ' || to_char(v_end, 'YYYY-MM-DD') || '.');
  return v_end;
end $$;

create or replace function public.admin_revoke_access(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  update public.subscriptions set revoked_at = now() where user_id = p_user and revoked_at is null and ends_at > now();
end $$;

-- Record a refund. The money itself is returned in the Paymob dashboard / bank; this keeps the books and access in step.
create or replace function public.admin_refund_order(p_order uuid, p_cents bigint, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'paid' then raise exception 'ORDER_NOT_REFUNDABLE'; end if;
  if p_cents <= 0 or p_cents > o.charge_cents - o.refund_cents then raise exception 'BAD_AMOUNT'; end if;
  update public.orders set refund_cents = refund_cents + p_cents, refund_note = left(coalesce(p_note,''), 500), refunded_at = now(),
         status = case when refund_cents + p_cents >= charge_cents then 'refunded' else status end where id = p_order;
  if o.refund_cents + p_cents >= o.charge_cents then
    update public.subscriptions set revoked_at = now() where order_id = p_order and revoked_at is null;
  end if;
end $$;

create or replace function public.admin_save_settings(p jsonb) returns void language plpgsql security definer set search_path = public as $$
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
    updated_at = now()
  where id = 1;
end $$;

create or replace function public.admin_get_settings() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  return (select to_jsonb(s) from public.payment_settings s where id = 1);
end $$;

create or replace function public.admin_set_fx(p_currency text, p_rate numeric, p_source text default 'manual') returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  insert into public.fx_rates (currency, per_usd, source, updated_at) values (upper(p_currency), p_rate, p_source, now())
    on conflict (currency) do update set per_usd = excluded.per_usd, source = excluded.source, updated_at = now();
end $$;

create or replace function public.admin_save_plan(p_id text, p_title text, p_months int, p_usd_cents int, p_active boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  insert into public.plans (id, title, months, price_usd_cents, active) values (p_id, p_title, p_months, p_usd_cents, p_active)
    on conflict (id) do update set title = excluded.title, months = excluded.months, price_usd_cents = excluded.price_usd_cents, active = excluded.active;
end $$;

-- Who currently has access (for the admin list) — one row per student with their latest period.
create or replace function public.admin_list_access(p_q text default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'not allowed'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.ends_at desc nulls last), '[]'::jsonb) from (
    select p.id as user_id, p.full_name, u.email::text as email, max(s.ends_at) filter (where s.revoked_at is null) as ends_at
    from public.profiles p join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    where p.role = 'student' and (p_q is null or p_q = '' or u.email ilike '%' || p_q || '%' or p.full_name ilike '%' || p_q || '%')
    group by p.id, p.full_name, u.email order by max(s.ends_at) desc nulls last limit 500) r);
end $$;

-- Renewal reminder, 3 days before the period ends (run daily: see the pg_cron line at the bottom, or from Admin → Payments).
create or replace function public.send_expiry_reminders() returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  if auth.uid() is not null and not public._is_admin() then raise exception 'not allowed'; end if;
  for r in
    select s.id, s.user_id, s.ends_at from public.subscriptions s
    where s.revoked_at is null and s.reminded_at is null and s.ends_at between now() and now() + interval '3 days'
      and not exists (select 1 from public.subscriptions n where n.user_id = s.user_id and n.revoked_at is null and n.ends_at > s.ends_at)
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (r.user_id, 'system', 'Your access ends soon', 'Your access ends on ' || to_char(r.ends_at, 'YYYY-MM-DD') || '. Renew to keep learning without a break.', null);
    update public.subscriptions set reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
-- optional (Database → Extensions → pg_cron):  select cron.schedule('ufuq-expiry-reminders', '0 6 * * *', 'select public.send_expiry_reminders()');

-- ---------- storage: private bucket for bank-transfer receipts ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
drop policy if exists proofs_insert_own on storage.objects;
create policy proofs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proofs_select_own_or_admin on storage.objects;
create policy proofs_select_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public._is_admin()));

-- ---------- server-side gate for starting a NEW exam (resuming an exam in progress is always allowed) ----------
create or replace function public.start_written_exam(p_exam_id uuid)
returns setof public.written_exam_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_sub public.written_exam_submissions;
  v_role text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select role into v_role from public.profiles where id = v_uid;
  select e.id, e.group_code, e.is_published into v_exam from public.written_exams e where e.id = p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;

  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  if found then return next v_sub; return; end if;

  if not v_exam.is_published then raise exception 'EXAM_NOT_PUBLISHED'; end if;
  if not public.user_has_access(v_uid) then raise exception 'PAYMENT_REQUIRED'; end if;
  if coalesce(v_role, '') <> 'admin'
     and not exists (select 1 from public.group_members gm where gm.user_id = v_uid and gm.group_code = v_exam.group_code) then
    raise exception 'NOT_IN_GROUP';
  end if;

  insert into public.written_exam_submissions (exam_id, user_id, status) values (p_exam_id, v_uid, 'draft')
    on conflict (exam_id, user_id) do nothing;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  return next v_sub;
end $$;

-- ---------- grants ----------
revoke execute on function public._grant_period(uuid, int, text, uuid, text), public._next_invoice_no(), public._complete_order(uuid, text, text),
  public.finalize_order_paid(uuid, text, text, bigint, text), public.mark_order_failed(uuid, text), public.set_order_provider(uuid, text),
  public.user_has_access(uuid) from public, anon, authenticated;
grant execute on function public.finalize_order_paid(uuid, text, text, bigint, text), public.mark_order_failed(uuid, text), public.set_order_provider(uuid, text) to service_role;
grant execute on function public.payments_public_config() to anon, authenticated;
grant execute on function public.my_access(), public.create_order(text, text, text, text, text, text, text), public.cancel_my_order(uuid),
  public.submit_transfer_proof(uuid, text, text), public.get_invoice(uuid), public.start_written_exam(uuid),
  public.admin_list_orders(text, date, date, text), public.admin_review_order(uuid, boolean, text), public.admin_grant_access(uuid, int, text),
  public.admin_revoke_access(uuid), public.admin_refund_order(uuid, bigint, text), public.admin_save_settings(jsonb), public.admin_get_settings(),
  public.admin_set_fx(text, numeric, text), public.admin_save_plan(text, text, int, int, boolean), public.admin_list_access(text),
  public.send_expiry_reminders() to authenticated;
