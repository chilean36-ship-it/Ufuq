-- ALREADY APPLIED to the Supabase project (ldbthwpikixtykwmvudy) on 2026-10-02. Kept here for the record.
-- The project already had: group_message_reactions, group_chat_reads, teaches_group(), my_group_codes(),
-- sender-or-staff DELETE policy, realtime publication + REPLICA IDENTITY FULL. This migration only adds what was missing.

-- 1. Reactions: one reaction per user per message, any short emoji, with a display name.
alter table public.group_message_reactions add column if not exists user_name text;
alter table public.group_message_reactions drop constraint if exists group_message_reactions_emoji_check;
alter table public.group_message_reactions add constraint group_message_reactions_emoji_check check (char_length(emoji) between 1 and 16);
alter table public.group_message_reactions drop constraint if exists group_message_reactions_message_id_user_id_emoji_key;
alter table public.group_message_reactions drop constraint if exists group_message_reactions_message_user_key;
alter table public.group_message_reactions add constraint group_message_reactions_message_user_key unique (message_id, user_id);

drop policy if exists group_message_reactions_update_own on public.group_message_reactions;
create policy group_message_reactions_update_own on public.group_message_reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (group_code in (select public.my_group_codes()) or public.teaches_group(group_code)));

-- 2. Read receipts reuse group_chat_reads; add a display name for the "seen by" tooltip.
alter table public.group_chat_reads add column if not exists user_name text;

create or replace function public.chat_fill_user_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(nullif(trim(p.full_name), ''), new.user_name) into new.user_name
  from public.profiles p where p.id = new.user_id;
  return new;
end $$;
revoke execute on function public.chat_fill_user_name() from public, anon, authenticated;

drop trigger if exists chat_reactions_fill_name on public.group_message_reactions;
create trigger chat_reactions_fill_name before insert or update on public.group_message_reactions
  for each row execute function public.chat_fill_user_name();
drop trigger if exists chat_reads_fill_name on public.group_chat_reads;
create trigger chat_reads_fill_name before insert or update on public.group_chat_reads
  for each row execute function public.chat_fill_user_name();

-- 3. Pinning is for admins and the group's teachers only.
create or replace function public.group_messages_guard_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is distinct from old.sender_id then
    if new.content is distinct from old.content or new.sender_id is distinct from old.sender_id
       or new.message_type is distinct from old.message_type or new.voice_path is distinct from old.voice_path
       or new.media_path is distinct from old.media_path or new.group_code is distinct from old.group_code then
      raise exception 'Only the sender can edit this message';
    end if;
  end if;
  if auth.uid() is not null
     and (new.is_pinned is distinct from old.is_pinned or new.pinned_by is distinct from old.pinned_by or new.pinned_at is distinct from old.pinned_at)
     and not public.teaches_group(old.group_code) then
    raise exception 'Only admins and teachers can pin messages';
  end if;
  return new;
end $$;
