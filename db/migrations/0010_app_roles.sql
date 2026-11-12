-- A different role in each app (core 0010). OpenCharterApp's permissions come from its own role
-- assignments in units, not the OpenAppHub role; so when an owner or admin makes someone an admin
-- of OpenCharterApp in the hub, they get the Organization admin role in the organization's top
-- unit, and lose it again when that's changed (only the assignment the hub made: source 'hub').
-- Finer roles (a chapter's admin, a treasurer in Post 12) stay in OpenCharterApp's Roles page.

create or replace function charter._sync_app_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_role_overrides := coalesce(new, old);
  v_unit uuid;
  v_role uuid;
begin
  if v_row.app <> 'charter' then return null; end if;
  select u.id into v_unit from charter.units u where u.org_id = v_row.org_id and u.parent_id is null order by u.created_at limit 1;
  if v_unit is null then return null; end if;  -- not set up in OpenCharterApp yet
  select r.id into v_role from charter.roles r where r.key = 'org_admin' and r.unit_id is null limit 1;
  if tg_op <> 'DELETE' and new.role = 'admin' then
    insert into charter.role_assignments (user_id, role_id, unit_id, source)
    values (new.user_id, v_role, v_unit, 'hub') on conflict do nothing;
  else
    delete from charter.role_assignments
    where user_id = v_row.user_id and unit_id = v_unit and role_id = v_role and source = 'hub';
  end if;
  return null;
end;
$$;

drop trigger if exists app_role_overrides_charter on public.app_role_overrides;
create trigger app_role_overrides_charter after insert or update or delete on public.app_role_overrides
  for each row execute function charter._sync_app_role();
revoke all on function charter._sync_app_role() from public, anon, authenticated;

-- Charter's permission checks use the person's Charter role (public.app_role(org, 'charter')):
-- an OpenAppHub admin made a member here isn't a Charter admin, and someone made a Charter admin
-- here is one without being an OpenAppHub admin. Same functions as the baseline otherwise.
create or replace function charter.has_permission(_user uuid, _perm text, _unit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when public.app_role(u.org_id, 'charter', _user) in ('owner', 'admin')
           and exists (select 1 from charter.role_permissions rp join charter.roles r on r.id = rp.role_id
                       where r.key = 'org_admin' and r.unit_id is null and rp.permission_key = _perm)
        then true
      else exists (
        select 1
        from charter.role_assignments ra
        join charter.role_permissions rp on rp.role_id = ra.role_id
        join charter.roles r on r.id = ra.role_id
        where ra.user_id = _user and rp.permission_key = _perm
          and (ra.unit_id = u.id or ra.unit_id = any (u.ancestor_ids))
          and ((r.key = 'member' and r.unit_id is null)
               or public.app_role(u.org_id, 'charter', _user) in ('owner', 'admin', 'member')))
    end
    from charter.units u
    where u.id = _unit
  ), false);
$$;

create or replace function charter.permitted_units(p_perm text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from charter.units u
  where exists (
    select 1
    from charter.role_assignments ra
    join charter.role_permissions rp on rp.role_id = ra.role_id
    join charter.roles r on r.id = ra.role_id
    where ra.user_id = auth.uid() and rp.permission_key = p_perm
      and (ra.unit_id = u.id or ra.unit_id = any (u.ancestor_ids))
      and ((r.key = 'member' and r.unit_id is null)
           or exists (select 1 from public.my_app_memberships('charter') m
                      where m.org_id = u.org_id and m.role in ('owner', 'admin', 'member')))
  )
  union
  select u.id from charter.units u
  join public.my_app_memberships('charter') m on m.org_id = u.org_id and m.role in ('owner', 'admin')
  where exists (select 1 from charter.role_permissions rp join charter.roles r on r.id = rp.role_id
                where r.key = 'org_admin' and r.unit_id is null and rp.permission_key = p_perm);
$$;

-- An admin grant that came from the hub (source 'hub') is for OpenCharterApp only: it doesn't
-- raise the person's OpenAppHub role. Assignments made in OpenCharterApp work as before.
create or replace function charter.staff_core_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role charter.roles;
  v_org uuid;
  v_top boolean;
  v_want public.org_role;
  v_has public.org_role;
begin
  if new.source = 'hub' then return new; end if;
  select * into v_role from charter.roles where id = new.role_id;
  if v_role.key = 'member' and v_role.unit_id is null then return new; end if;
  select u.org_id, u.parent_id is null into v_org, v_top from charter.units u where u.id = new.unit_id;
  if v_org is null then return new; end if;
  if not exists (select 1 from public.memberships m where m.org_id = v_org and m.role = 'owner') then
    v_want := 'owner';
  elsif v_role.key = 'org_admin' and v_role.unit_id is null and v_top then
    v_want := 'admin';
  else
    v_want := 'member';
  end if;
  select m.role into v_has from public.memberships m where m.org_id = v_org and m.user_id = new.user_id;
  if v_has is null then
    insert into public.memberships (org_id, user_id, role) values (v_org, new.user_id, v_want);
  elsif v_has = 'viewer' or (v_has = 'member' and v_want = 'admin') then
    update public.memberships set role = v_want where org_id = v_org and user_id = new.user_id;
  end if;
  return new;
end $$;
