-- The founder account (chilean36@gmail.com) can never lose its rights, and only the founder can remove or lower another main admin.
-- Applied by hand in the SQL editor (see DEPLOY.md). Safe to run twice.
create or replace function public.ufuq_guard_owner_account()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_owner uuid;
  v_caller uuid := auth.uid();
  v_old_super boolean;
  v_new_super boolean;
begin
  select id into v_owner from auth.users where lower(email) = 'chilean36@gmail.com' limit 1;
  v_old_super := old.role = 'admin' and coalesce(old.admin_tier, 'super') <> 'standard';
  v_new_super := new.role = 'admin' and coalesce(new.admin_tier, 'super') <> 'standard';
  if v_caller is null then return new; end if;                       -- SQL editor / service role
  if old.id = v_owner and not v_new_super then
    raise exception 'OWNER_PROTECTED' using errcode = 'P0001';
  end if;
  if v_old_super and not v_new_super and old.id <> v_caller and v_caller is distinct from v_owner then
    raise exception 'OWNER_ONLY' using errcode = 'P0001';           -- only the founder lowers / removes a main admin
  end if;
  return new;
end $$;

drop trigger if exists ufuq_guard_owner_account on public.profiles;
create trigger ufuq_guard_owner_account before update of role, admin_tier on public.profiles
  for each row execute function public.ufuq_guard_owner_account();
