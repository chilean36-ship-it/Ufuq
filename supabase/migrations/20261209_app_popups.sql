-- "What's new" pop-ups for the Ufuq app.
-- The super admin writes one on Admin > Messages > App pop-up (picture, title, text, one button, everyone or one group);
-- each student sees it once when the app opens. app_popup_seen remembers who has seen what.
-- Idempotent. NOT applied to the live project until someone runs it in the SQL editor (see DEPLOY.md).
-- Pictures go to the existing public bucket "landing-media" (folder popups/), which only super admins can write to.

create table if not exists public.app_popups (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 140),
  body        text check (body is null or char_length(body) <= 1200),
  image_url   text,
  cta_label   text check (cta_label is null or char_length(cta_label) <= 40),
  cta_link    text check (cta_link is null or char_length(cta_link) <= 400),  -- an app view key (library, tasks, exam, progress, attendance, certificates, myGroup, billing, me) or an https:// address
  group_code  text,                                                            -- null = every student, otherwise members of that group only
  is_active   boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.app_popup_seen (
  popup_id uuid not null references public.app_popups(id) on delete cascade,
  user_id  uuid not null default auth.uid(),
  seen_at  timestamptz not null default now(),
  primary key (popup_id, user_id)
);

alter table public.app_popups enable row level security;
alter table public.app_popup_seen enable row level security;

drop policy if exists app_popups_read on public.app_popups;
create policy app_popups_read on public.app_popups for select to authenticated
  using (
    public.is_super_admin()
    or (is_active and (group_code is null
        or exists (select 1 from public.group_members gm where gm.group_code = app_popups.group_code and gm.user_id = auth.uid())))
  );

drop policy if exists app_popups_write on public.app_popups;
create policy app_popups_write on public.app_popups for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists app_popup_seen_own on public.app_popup_seen;
create policy app_popup_seen_own on public.app_popup_seen for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists app_popup_seen_ins on public.app_popup_seen;
create policy app_popup_seen_ins on public.app_popup_seen for insert to authenticated
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.app_popups to authenticated;
grant select, insert on public.app_popup_seen to authenticated;
