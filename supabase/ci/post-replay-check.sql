-- Post-replay check (replay job, .github/workflows/supabase-db.yml): every table in public has
-- row-level security on and a SELECT, INSERT, UPDATE or DELETE grant to authenticated or
-- service_role. Reads the catalog, not the migration text, so tables secured inside
-- `foreach ... execute format(...)` loops are checked too. Names each failing table.
\set ON_ERROR_STOP 1
do $$
declare
  _t record;
  _bad text[] := '{}';
  _n int := 0;
begin
  for _t in
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    _n := _n + 1;
    if not _t.relrowsecurity then
      _bad := _bad || format('public.%I: row-level security is off', _t.relname);
    end if;
    if not exists (
      select 1
      from unnest(array['authenticated', 'service_role']) r(role),
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(priv)
      where has_table_privilege(r.role, _t.oid, p.priv)
    ) then
      _bad := _bad || format('public.%I: no SELECT/INSERT/UPDATE/DELETE grant to authenticated or service_role', _t.relname);
    end if;
  end loop;
  if _n = 0 then
    raise exception 'post-replay check: no tables in public (did the migrations run?)';
  end if;
  if array_length(_bad, 1) > 0 then
    raise exception E'post-replay check failed for % of % public tables:\n  %',
      array_length(_bad, 1), _n, array_to_string(_bad, E'\n  ');
  end if;
  raise notice 'post-replay check ok: % public tables, all with RLS and grants', _n;
end $$;
