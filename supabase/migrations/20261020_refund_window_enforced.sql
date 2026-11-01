-- 20261020 — Refund window is enforced on the server (terms 5.6: full refund within refund_days of payment).
-- Only the main admin can call this (unchanged). Replaces admin_refund_order with the same signature and body,
-- plus the window check. Not applied automatically: review, then run in the Supabase SQL editor.
-- The other two conditions (no more than 2 live lessons attended, no bulk download of materials) cannot be read
-- reliably from the database, so the admin confirms them in the panel before recording the refund.

create or replace function public.admin_refund_order(p_order uuid, p_cents bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_days int;
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  select coalesce(s.refund_days, 14) into v_days from public.payment_settings s where s.id = 1;
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'paid' then raise exception 'ORDER_NOT_REFUNDABLE'; end if;
  if o.paid_at is null or o.paid_at < now() - make_interval(days => coalesce(v_days, 14)) then
    raise exception 'REFUND_WINDOW_CLOSED';
  end if;
  if p_cents <= 0 or p_cents > o.charge_cents - o.refund_cents then raise exception 'BAD_AMOUNT'; end if;
  update public.orders set refund_cents = refund_cents + p_cents, refund_note = left(coalesce(p_note,''), 500), refunded_at = now(),
         status = case when refund_cents + p_cents >= charge_cents then 'refunded' else status end where id = p_order;
  if o.refund_cents + p_cents >= o.charge_cents then
    update public.subscriptions set revoked_at = now() where order_id = p_order and revoked_at is null;
  end if;
end $$;
