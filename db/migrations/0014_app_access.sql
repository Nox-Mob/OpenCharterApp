-- No access in OpenCharterApp (core 0015, owner decision 2026-11-13). Someone with No access here
-- (set for them, or "none" in their named role) has none of OpenCharterApp's staff permissions:
-- no unit roles count for them except the member role, and their named role's extra permissions
-- don't apply. As a dues-paying member (the member role) they still see and renew their own
-- membership. The owner always has access. Both functions are the 0011 ones with that added.

create or replace function charter.has_permission(_user uuid, _perm text, _unit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when a.role in ('owner', 'admin')
           and exists (select 1 from charter.role_permissions rp join charter.roles r on r.id = rp.role_id
                       where r.key = 'org_admin' and r.unit_id is null and rp.permission_key = _perm)
        then true
      when exists (
        select 1
        from charter.role_assignments ra
        join charter.role_permissions rp on rp.role_id = ra.role_id
        join charter.roles r on r.id = ra.role_id
        where ra.user_id = _user and rp.permission_key = _perm
          and (ra.unit_id = u.id or ra.unit_id = any (u.ancestor_ids))
          and ((r.key = 'member' and r.unit_id is null) or a.role in ('owner', 'admin', 'member')))
        then true
      when a.role = 'none' then false
      else coalesce(a.perms ? _perm, false)
    end
    from charter.units u
    left join lateral (
      select case when m.role = 'owner' then 'owner'
                  when coalesce(o.no_access, false) then 'none'
                  when o.role is not null then o.role::text
                  when nr.app_roles ->> 'charter' = 'none' then 'none'
                  when nr.app_roles ->> 'charter' in ('admin', 'member', 'viewer') then nr.app_roles ->> 'charter'
                  else 'viewer' end as role,
             coalesce(nr.permissions -> 'charter', '[]'::jsonb) as perms
      from public.memberships m
      left join public.app_role_overrides o on o.org_id = m.org_id and o.user_id = m.user_id and o.app = 'charter'
      left join public.org_named_roles nr on nr.id = m.named_role_id
      where m.org_id = u.org_id and m.user_id = _user
    ) a on true
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
                where r.key = 'org_admin' and r.unit_id is null and rp.permission_key = p_perm)
  union
  select u.id from charter.units u
  join public.memberships m on m.org_id = u.org_id and m.user_id = auth.uid()
  join public.org_named_roles nr on nr.id = m.named_role_id
  where coalesce(nr.permissions -> 'charter', '[]'::jsonb) ? p_perm
    and public.can_open_app(u.org_id, 'charter');
$$;
