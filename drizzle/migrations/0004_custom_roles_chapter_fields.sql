-- ===== E-05 Org-defined custom roles =====
-- Platform roles (org_id is null) stay fixed. An org with roles.manage may define its own
-- roles, which also apply to its descendants (D-032). Roles are retired, never deleted.
-- Nobody can grant a permission they don't hold themselves at that org (no escalation).

alter table public.roles
  add column description text not null default '' check (char_length(description) <= 300),
  add column active boolean not null default true,
  add column created_at timestamptz not null default now();
alter table public.roles add constraint roles_name_length check (char_length(name) between 1 and 60);
alter table public.roles add constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]{0,39}$');

create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function public.audit_row_change();

-- Visibility: platform roles, plus roles of any org in the reader's visible tree
-- (a chapter member sees national's roles; a national admin sees chapter roles).
drop policy "read roles" on public.roles;
create policy "read roles" on public.roles for select to authenticated
  using (org_id is null or public.can_see_org_tree(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'roles.manage', org_id));
drop policy "read role permissions" on public.role_permissions;
create policy "read role permissions" on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id));

-- Roles that apply at an org: platform roles, its own, and its ancestors'.
create or replace function public.role_applies_at(_role public.roles, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _role.org_id is null or _role.org_id = _org
    or exists (select 1 from public.organizations o where o.id = _org and _role.org_id = any(o.ancestor_ids))
$$;

-- True when every permission of the role is held by _user at _org.
create or replace function public.holds_all_role_permissions(_user uuid, _role uuid, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.role_permissions rp
    where rp.role_id = _role and not public.has_permission(_user, rp.permission_key, _org))
$$;

-- Resolve an active role by key at an org (nearest org wins; keys are unique per tree anyway).
create or replace function public.resolve_role(_org uuid, _key text)
returns uuid language sql stable security definer set search_path = public as $$
  select r.id from public.roles r
  where r.key = _key and r.active and public.role_applies_at(r, _org)
  order by r.org_id is null, r.created_at desc limit 1
$$;

create or replace function public.check_role_permissions(_uid uuid, _org uuid, _perms text[])
returns void language plpgsql stable security definer set search_path = public as $$
declare _p text;
begin
  foreach _p in array coalesce(_perms, '{}') loop
    if not exists (select 1 from public.permissions where key = _p) then raise exception 'unknown permission %', _p; end if;
    if not public.has_permission(_uid, _p, _org) then raise exception 'you can only grant permissions you hold'; end if;
  end loop;
end $$;

create or replace function public.create_role(_org uuid, _key text, _name text, _description text, _perms text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _root uuid; _id uuid;
begin
  if _uid is null or not public.has_permission(_uid, 'roles.manage', _org) then raise exception 'not allowed'; end if;
  if _key in ('org_admin', 'member') then raise exception 'that role name is reserved'; end if;
  select coalesce(ancestor_ids[1], id) into _root from public.organizations where id = _org;
  -- Keys are unique across the whole tree, so assigning by key is never ambiguous.
  if exists (select 1 from public.roles r join public.organizations o on o.id = r.org_id
             where r.key = _key and (o.id = _root or _root = any(o.ancestor_ids))) then
    raise exception 'a role with that name already exists';
  end if;
  perform public.check_role_permissions(_uid, _org, _perms);
  insert into public.roles (org_id, key, name, description)
    values (_org, _key, trim(_name), coalesce(trim(_description), '')) returning id into _id;
  insert into public.role_permissions (role_id, permission_key)
    select _id, p from unnest(coalesce(_perms, '{}')) p on conflict do nothing;
  perform public.write_audit(_org, 'insert', 'role_permissions', _id::text, null, to_jsonb(coalesce(_perms, '{}')));
  return _id;
end $$;

create or replace function public.update_role(_role uuid, _name text, _description text, _perms text[])
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _r public.roles; _before text[]; _added text[];
begin
  select * into _r from public.roles where id = _role;
  if _r.id is null or _r.org_id is null or _uid is null
     or not public.has_permission(_uid, 'roles.manage', _r.org_id) then raise exception 'not allowed'; end if;
  select coalesce(array_agg(permission_key order by permission_key), '{}') into _before
    from public.role_permissions where role_id = _role;
  select coalesce(array_agg(p), '{}') into _added from unnest(coalesce(_perms, '{}')) p where p <> all(_before);
  perform public.check_role_permissions(_uid, _r.org_id, _added);
  update public.roles set name = trim(_name), description = coalesce(trim(_description), '') where id = _role;
  delete from public.role_permissions where role_id = _role and permission_key <> all(coalesce(_perms, '{}'));
  insert into public.role_permissions (role_id, permission_key)
    select _role, p from unnest(_added) p on conflict do nothing;
  perform public.write_audit(_r.org_id, 'update', 'role_permissions', _role::text, to_jsonb(_before), to_jsonb(coalesce(_perms, '{}')));
end $$;

create or replace function public.set_role_active(_role uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _r public.roles;
begin
  select * into _r from public.roles where id = _role;
  if _r.id is null or _r.org_id is null or auth.uid() is null
     or not public.has_permission(auth.uid(), 'roles.manage', _r.org_id) then raise exception 'not allowed'; end if;
  if not _active and exists (select 1 from public.role_assignments where role_id = _role) then
    raise exception 'remove this role from everyone before retiring it';
  end if;
  if not _active and exists (select 1 from public.invitations where role_id = _role
      and accepted_at is null and revoked_at is null and expires_at > now()) then
    raise exception 'revoke pending invitations for this role before retiring it';
  end if;
  update public.roles set active = _active where id = _role;
end $$;

-- Assignment: role must apply at this org, be active, and hold nothing the assigner lacks.
create or replace function public.assign_role(_org uuid, _user uuid, _role_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _role uuid; _id uuid;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'roles.manage', _org) then raise exception 'not allowed'; end if;
  if not public.is_org_member(_user, _org) then raise exception 'person is not a member of this organization'; end if;
  _role := public.resolve_role(_org, _role_key);
  if _role is null then raise exception 'unknown role'; end if;
  if not public.holds_all_role_permissions(auth.uid(), _role, _org) then
    raise exception 'you can only grant permissions you hold';
  end if;
  insert into public.role_assignments (user_id, role_id, org_id, source) values (_user, _role, _org, 'manual')
    on conflict (user_id, role_id, org_id) do nothing returning id into _id;
  if _id is null then
    select id into _id from public.role_assignments where user_id = _user and role_id = _role and org_id = _org;
  end if;
  return _id;
end $$;

create or replace function public.create_invitation(_org uuid, _email text, _role_key text default 'member')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare _uid uuid := auth.uid(); _token text; _role uuid;
begin
  if _uid is null or not public.has_permission(_uid, 'members.invite', _org) then raise exception 'not allowed'; end if;
  if _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if _role_key <> 'member' and not public.has_permission(_uid, 'roles.manage', _org) then raise exception 'not allowed'; end if;
  _role := public.resolve_role(_org, _role_key);
  if _role is null then raise exception 'unknown role'; end if;
  if not public.holds_all_role_permissions(_uid, _role, _org) then raise exception 'not allowed'; end if;
  _token := encode(gen_random_bytes(24), 'hex');
  insert into public.invitations (org_id, email, role_id, token_hash, invited_by)
    values (_org, lower(trim(_email)), _role, encode(digest(_token, 'sha256'), 'hex'), _uid);
  return _token;
end $$;

revoke execute on function public.role_applies_at(public.roles, uuid), public.holds_all_role_permissions(uuid, uuid, uuid),
  public.resolve_role(uuid, text), public.check_role_permissions(uuid, uuid, text[]) from public, anon, authenticated;
revoke execute on function public.create_role(uuid, text, text, text, text[]), public.update_role(uuid, text, text, text[]),
  public.set_role_active(uuid, boolean) from public, anon;
grant execute on function public.create_role(uuid, text, text, text, text[]), public.update_role(uuid, text, text, text[]),
  public.set_role_active(uuid, boolean) to authenticated;

-- ===== E-09 Chapter fields =====
-- Chapter fields describe chapters, so only orgs that have chapters (national, region) define them.
create or replace function public.attribute_definition_subject_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.applies_to = 'chapter' and not exists (select 1 from public.organizations
      where id = new.org_id and type in ('national', 'region')) then
    raise exception 'only national or regional organizations define chapter fields';
  end if;
  if new.applies_to = 'chapter' then
    new.member_editable := false;
    new.show_in_directory := false;
  end if;
  return new;
end $$;
create trigger attribute_definitions_subject before insert on public.attribute_definitions
  for each row execute function public.attribute_definition_subject_check();
