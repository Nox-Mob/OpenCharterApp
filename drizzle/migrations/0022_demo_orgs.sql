-- ===== Demo organizations (D-148) =====
-- A demo org holds test data, not production data: QA can run setup from scratch in it, delete
-- it with everything in it, and it never sends email. Only platform operators can create one
-- (private.platform_operators, not reachable through the API). Chapters of a demo org are demo
-- too, and the flag never changes after creation, so production data can't become deletable.
-- Replaces the hard-coded "d1000000-" checks for the test gateway (0009). Additive (D-125).

-- ----- platform operators -----
create table if not exists private.platform_operators (
  user_id uuid primary key,
  added_at timestamptz not null default now()
);
revoke all on private.platform_operators from public, anon, authenticated;
grant select on private.platform_operators to service_role;
-- The current demo accounts (docs/demo-data.md) are operators.
insert into private.platform_operators (user_id)
  select id from auth.users
  where lower(email) in ('demo-national@opencharter.test', 'demo-chapter@opencharter.test', 'demo-member@opencharter.test')
on conflict do nothing;

create or replace function public.is_platform_operator()
returns boolean language sql stable security definer set search_path = public, private as $$
  select auth.uid() is not null and exists (select 1 from private.platform_operators where user_id = auth.uid())
$$;

-- ----- the flag -----
alter table public.organizations add column is_demo boolean not null default false;
update public.organizations set is_demo = true
  where id::text like 'd1000000-%' or exists (select 1 from unnest(ancestor_ids) a where a::text like 'd1000000-%');

-- A sub-org is demo exactly when its parent is; the flag never changes afterwards.
create or replace function public.org_demo_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select is_demo into new.is_demo from public.organizations where id = new.parent_id;
    end if;
    return new;
  end if;
  -- create_demo_organization marks the org it just created (a transaction-local flag that API
  -- clients can't set: they only reach tables and exposed functions, never set_config)
  if new.is_demo and not old.is_demo and current_setting('app.creating_demo_org', true) = new.id::text then
    return new;
  end if;
  if new.is_demo is distinct from old.is_demo then
    raise exception 'an organization can''t switch between demo and production';
  end if;
  return new;
end $$;
create trigger organizations_demo_guard before insert or update of is_demo on public.organizations
  for each row execute function public.org_demo_guard();

-- Demo orgs never send email (for the email system, E-08).
create or replace function public.emails_allowed(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not is_demo from public.organizations where id = _org), false)
$$;

-- The test gateway is for demo orgs, unless the platform turns it on everywhere (0009 rule).
create or replace function public.test_gateway_allowed(_org uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select coalesce((select is_demo from public.organizations where id = _org), false)
    or coalesce((select (value #>> '{}')::boolean from private.platform_flags where key = 'test_gateway_everywhere'), false)
$$;

-- ----- creating and deleting -----
-- A new top-level demo org (national or standalone), for platform operators. Uses
-- create_organization's rules, then marks it; its chapters inherit the flag.
create or replace function public.create_demo_organization(_name text, _slug text, _type public.org_type)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not public.is_platform_operator() then raise exception 'only platform operators can create demo organizations'; end if;
  if _type not in ('national', 'standalone') then raise exception 'a demo organization starts at the top: national or standalone'; end if;
  _id := public.create_organization(_name, _slug, _type, null);
  -- the guard allows this one change: the org just created here becoming demo
  perform set_config('app.creating_demo_org', _id::text, true);
  update public.organizations set is_demo = true where id = _id;
  perform set_config('app.creating_demo_org', '', true);
  return _id;
end $$;

-- Deletes a demo org with all its chapters and data. Accounts stay; one audit event remains.
create or replace function public.delete_demo_organization(_org uuid, _confirm_name text)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare _o public.organizations; _ids uuid[]; _id uuid;
begin
  select * into _o from public.organizations where id = _org;
  if _o.id is null or auth.uid() is null
     or not (public.has_permission(auth.uid(), 'org.manage', _org) or public.is_platform_operator()) then
    raise exception 'not allowed';
  end if;
  if not _o.is_demo then raise exception 'only demo organizations can be deleted'; end if;
  if _o.parent_id is not null then raise exception 'delete the whole demo organization from its top'; end if;
  if trim(coalesce(_confirm_name, '')) <> _o.name then raise exception 'type the organization''s name to confirm'; end if;
  select array_agg(id order by coalesce(array_length(ancestor_ids, 1), 0) desc) into _ids
    from public.organizations where id = _org or _org = any(ancestor_ids);
  -- deepest first: a parent can't go while it has children
  foreach _id in array _ids loop
    delete from public.organizations where id = _id;
  end loop;
  perform public.write_audit(_org, 'delete', 'demo_organization', _org::text,
    jsonb_build_object('name', _o.name, 'slug', _o.slug, 'type', _o.type),
    jsonb_build_object('organizations_deleted', array_length(_ids, 1)));
  return _ids;
end $$;

revoke execute on function public.org_demo_guard(), public.emails_allowed(uuid) from public, anon, authenticated;
revoke execute on function public.is_platform_operator(), public.create_demo_organization(text, text, public.org_type),
  public.delete_demo_organization(uuid, text) from public, anon;
grant execute on function public.is_platform_operator(), public.create_demo_organization(text, text, public.org_type),
  public.delete_demo_organization(uuid, text) to authenticated;
