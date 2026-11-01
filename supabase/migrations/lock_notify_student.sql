-- notify_student(): SECURITY DEFINER with no caller check — anyone (even signed-out) could insert
-- notifications for any user via /rest/v1/rpc/notify_student (spam / phishing links).
-- The app never calls it, so close it completely. Triggers/other SQL functions are unaffected.
revoke execute on function public.notify_student(uuid, text, text) from public, anon, authenticated;

-- views_read_only (applied): the *_for_student views are SECURITY DEFINER and auto-updatable, and anon/authenticated
-- had INSERT/UPDATE/DELETE on them — a way around the RLS write policies of group_slots / individual_sessions.
-- The app only reads them.
revoke all on public.group_slots_for_student, public.individual_sessions_for_student from anon, authenticated, public;
grant select on public.group_slots_for_student, public.individual_sessions_for_student to authenticated;
