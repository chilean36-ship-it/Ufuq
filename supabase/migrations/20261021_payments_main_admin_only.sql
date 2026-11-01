-- 20261021 — Payments belong to MAIN (super) admins only.
-- Before this, _is_admin() returned true for ANY admin, including standard admins. That let a standard admin
-- read every order (buyer names, emails), approve or reject transfers, grant access, read payment settings and
-- open payment proofs through the admin_* functions and the payment-proofs storage policy.
-- _is_admin() is used only by the payments functions and policies (checked in the repo), so changing it here
-- closes all of them at once. Safe to run more than once.

create or replace function public._is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin();
$$;
comment on function public._is_admin() is 'Payments helper: true only for MAIN (super) admins. Name kept so existing policies and RPCs keep working.';

-- Everything below is already in place from 20261018; restated so the rule is explicit and re-applied.
-- Direct table access: students read only their own orders and subscriptions; nobody writes these tables directly.
revoke insert, update, delete on public.orders, public.subscriptions, public.plans, public.fx_rates from anon, authenticated;
revoke all on public.payment_settings, public.invoice_counters from anon, authenticated;
-- Anonymous visitors must not call admin functions at all.
revoke execute on function public.admin_list_orders(text, date, date, text), public.admin_review_order(uuid, boolean, text),
  public.admin_grant_access(uuid, int, text), public.admin_refund_order(uuid, bigint, text), public.admin_save_settings(jsonb),
  public.admin_get_settings(), public.admin_set_fx(text, numeric, text), public.admin_save_plan(text, text, int, int, boolean),
  public.admin_list_access(text), public.admin_revoke_access(uuid), public.send_expiry_reminders() from public, anon;
