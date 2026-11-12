-- Named roles and each app's role decided on its own (core 0011, H-09).
--
-- * An OpenAppHub admin isn't an OpenCharterApp admin by itself, and an admin here isn't an
--   OpenAppHub admin either. A role given in OpenCharterApp no longer raises the OpenAppHub role:
--   someone new gets an OpenAppHub membership as a member (owner decision 2026-11-12) and the
--   OpenCharterApp role their assignment needs (admin for the organization admin role, member
--   for any other staff role).
-- * Named roles can grant OpenCharterApp's permissions across the whole organization, on top of
--   roles held in units (a chapter's president): both count.
-- * Setting up OpenCharterApp and the chapter emails follow the OpenCharterApp role.

-- Every Charter permission, for named roles (public.app_permission_types).
do $$
declare p record;
begin
  for p in select key, description from charter.permissions order by key loop
    perform public.register_app_permission('charter', p.key, p.description, '', 100);
  end loop;
end $$;

create or replace function charter.staff_core_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role charter.roles;
  v_org uuid;
  v_top boolean;
  v_app public.org_role;
begin
  if new.source = 'hub' then return new; end if;
  select * into v_role from charter.roles where id = new.role_id;
  if v_role.key = 'member' and v_role.unit_id is null then return new; end if;
  select u.org_id, u.parent_id is null into v_org, v_top from charter.units u where u.id = new.unit_id;
  if v_org is null then return new; end if;
  if not exists (select 1 from public.memberships m where m.org_id = v_org and m.role = 'owner') then
    insert into public.memberships (org_id, user_id, role) values (v_org, new.user_id, 'owner')
    on conflict (org_id, user_id) do update set role = 'owner';
    return new;
  end if;
  insert into public.memberships (org_id, user_id, role) values (v_org, new.user_id, 'member')
  on conflict (org_id, user_id) do nothing;
  v_app := public.app_role(v_org, 'charter', new.user_id);
  if v_app = 'owner' then return new; end if;
  if v_role.key = 'org_admin' and v_role.unit_id is null and v_top then
    if v_app <> 'admin' then
      insert into public.app_role_overrides (org_id, user_id, app, role) values (v_org, new.user_id, 'charter', 'admin')
      on conflict on constraint app_role_overrides_pkey do update set role = 'admin', set_at = now();
    end if;
  elsif v_app = 'viewer' then
    insert into public.app_role_overrides (org_id, user_id, app, role) values (v_org, new.user_id, 'charter', 'member')
    on conflict on constraint app_role_overrides_pkey do update set role = 'member', set_at = now();
  end if;
  return new;
end $$;

-- A unit's roles, or a permission the person's named role grants in the whole organization.
-- Row rules call this once per row, so the Charter role (public.app_role's rule: owner; set for
-- them in Charter; their named role; else viewer) and the named role's permissions come from one
-- lookup, inlined here, and named roles are looked at last.
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
      else coalesce(a.perms ? _perm, false)
    end
    from charter.units u
    left join lateral (
      select case when m.role = 'owner' then 'owner'
                  when o.role is not null then o.role::text
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
  where coalesce(nr.permissions -> 'charter', '[]'::jsonb) ? p_perm;
$$;

create or replace function charter.ensure_top_unit(p_org uuid, p_type charter.org_type default 'standalone', p_slug text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
  v_email text;
begin
  if exists (select 1 from charter.units u where u.id = p_org) then return p_org; end if;
  if not public.has_app_role(p_org, 'charter', '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an OpenCharterApp admin can set up OpenCharterApp for this organization.' using errcode = '42501';
  end if;
  if p_type not in ('national', 'standalone') then raise exception 'choose national or standalone'; end if;
  select * into v_org from public.organizations where id = p_org;
  insert into charter.units (id, name, slug, type, parent_id, created_by)
  values (p_org, v_org.name, lower(coalesce(nullif(btrim(p_slug), ''), v_org.slug, p_org::text)), p_type, null, v_uid);
  select email into v_email from auth.users where id = v_uid;
  insert into charter.member_profiles (unit_id, user_id, email) values (p_org, v_uid, coalesce(v_email, ''));
  insert into charter.role_assignments (user_id, role_id, unit_id)
  select v_uid, r.id, p_org from charter.roles r where r.key = 'org_admin' and r.unit_id is null;
  return p_org;
end $$;

create or replace function charter._chapter_board_email(p_request uuid, p_template text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r charter.chapter_board_requests;
  v_chapter text;
  v_by text;
  m record;
begin
  if to_regprocedure('public.enqueue_email(text,text,uuid,uuid,text,jsonb,text,text,timestamptz)') is null then
    return;
  end if;
  select * into r from charter.chapter_board_requests where id = p_request;
  select name into v_chapter from charter.units where id = r.unit_id;
  select coalesce(nullif(p.display_name, ''), 'A chapter admin') into v_by from public.profiles p where p.id = r.requested_by;
  if p_template = 'charter.chapter_board_request' then
    for m in select mm.user_id from public.memberships mm where mm.org_id = r.org_id and public.app_role(r.org_id, 'charter', mm.user_id) in ('owner', 'admin') loop
      perform public.enqueue_email('charter', p_template, r.org_id, m.user_id, null,
        jsonb_build_object('chapter', v_chapter, 'requested_by', v_by,
          'link', format('/orgs/%s?tab=chapters', r.org_id)),
        'org_activity', format('charter.chapter_board:%s:request:%s', r.id, m.user_id));
    end loop;
  elsif r.requested_by is not null then
    perform public.enqueue_email('charter', p_template, r.org_id, r.requested_by, null,
      jsonb_build_object('chapter', v_chapter, 'approved', r.status = 'approved', 'note', r.note,
        'link', case when r.board_org_id is not null then format('/board?org=%s', r.board_org_id) end),
      'essential', format('charter.chapter_board:%s:decided', r.id));
  end if;
end $$;
