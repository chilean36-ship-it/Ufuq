-- The "one Arabic class group per account" rule of join_group() no longer exempts free (test) accounts:
-- the accounts used for testing ("Student") are real students too. Patches the live function in place.
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.join_group(text)'::regprocedure);
  d2 := replace(d, 'if v_role = ''student'' and not v_free and v_group.type = ''class''' || E'\n' || '     and exists', 'if v_role = ''student'' and v_group.type = ''class''' || E'\n' || '     and exists');
  if d2 = d then raise exception 'join_group patch did not match (already applied?)'; end if;
  execute d2;
end $$;
