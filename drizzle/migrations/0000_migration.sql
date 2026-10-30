-- OpenCharterApp Phase 0 foundation: org hierarchy, per-org profiles, RBAC, audit
create type public.org_type as enum ('platform','national','region','chapter','standalone');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.organizations(id) on delete restrict,
  type public.org_type not null,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  ancestor_ids uuid[] not null default '{}',
  timezone text not null default 'America/Chicago',
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.organizations using gin (ancestor_ids);
create index on public.organizations (parent_id);
grant select, update on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

create table public.org_member_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
grant select, update on public.org_member_profiles to authenticated;
grant all on public.org_member_profiles to service_role;
alter table public.org_member_profiles enable row level security;

create table public.permissions (
  key text primary key,
  description text not null
);
grant select on public.permissions to authenticated;
grant all on public.permissions to service_role;
alter table public.permissions enable row level security;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  unique nulls not distinct (org_id, key)
);
grant select on public.roles to authenticated;
grant all on public.roles to service_role;
alter table public.roles enable row level security;

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);
grant select on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;
alter table public.role_permissions enable row level security;

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_id uuid not null references public.roles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (user_id, role_id, org_id)
);
create index on public.role_assignments (user_id);
grant select on public.role_assignments to authenticated;
grant all on public.role_assignments to service_role;
alter table public.role_assignments enable row level security;

create table public.audit_events (
  id bigserial primary key,
  org_id uuid,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_events (org_id, created_at desc);
grant select on public.audit_events to authenticated;
grant select, insert on public.audit_events to service_role;
alter table public.audit_events enable row level security;

-- Ancestor path maintenance
create or replace function public.set_org_ancestors()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is null then
    new.ancestor_ids := '{}';
  else
    select o.ancestor_ids || o.id into new.ancestor_ids from public.organizations o where o.id = new.parent_id;
    if new.id = any(new.ancestor_ids) then raise exception 'cycle in org hierarchy'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger organizations_ancestors before insert or update of parent_id on public.organizations
for each row execute function public.set_org_ancestors();

-- Policy helpers (downward-only inheritance, D-032)
create or replace function public.has_permission(_user uuid, _perm text, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organizations o
    join public.role_assignments ra on ra.org_id = o.id or ra.org_id = any(o.ancestor_ids)
    join public.role_permissions rp on rp.role_id = ra.role_id
    where o.id = _org and ra.user_id = _user and rp.permission_key = _perm
  )
$$;

create or replace function public.is_org_member(_user uuid, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_member_profiles where user_id = _user and org_id = _org)
$$;

-- Audit (append-only; written only by definer functions/triggers)
create or replace function public.write_audit(_org uuid, _action text, _target_type text, _target_id text, _before jsonb, _after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, before, after)
  values (_org, auth.uid(), _action, _target_type, _target_id, _before, _after)
$$;
revoke execute on function public.write_audit(uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare _org uuid; _id text;
begin
  if tg_table_name = 'organizations' then _org := coalesce(new.id, old.id);
  else _org := coalesce(new.org_id, old.org_id); end if;
  _id := coalesce(new.id, old.id)::text;
  perform public.write_audit(_org, lower(tg_op), tg_table_name, _id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_organizations after insert or update or delete on public.organizations for each row execute function public.audit_row_change();
create trigger audit_role_assignments after insert or update or delete on public.role_assignments for each row execute function public.audit_row_change();
create trigger audit_profiles after insert or update or delete on public.org_member_profiles for each row execute function public.audit_row_change();

-- RLS policies
create policy "members and viewers read orgs" on public.organizations for select to authenticated
  using (public.is_org_member(auth.uid(), id) or public.has_permission(auth.uid(), 'org.view', id));
create policy "managers update orgs" on public.organizations for update to authenticated
  using (public.has_permission(auth.uid(), 'org.manage', id))
  with check (public.has_permission(auth.uid(), 'org.manage', id));

create policy "read own or permitted profiles" on public.org_member_profiles for select to authenticated
  using (user_id = auth.uid() or public.has_permission(auth.uid(), 'members.view', org_id));
create policy "update own profile" on public.org_member_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read permissions" on public.permissions for select to authenticated using (true);
create policy "read roles" on public.roles for select to authenticated
  using (org_id is null or public.is_org_member(auth.uid(), org_id) or public.has_permission(auth.uid(), 'roles.manage', org_id));
create policy "read role permissions" on public.role_permissions for select to authenticated using (true);
create policy "read own or managed assignments" on public.role_assignments for select to authenticated
  using (user_id = auth.uid() or public.has_permission(auth.uid(), 'roles.manage', org_id));
create policy "auditors read audit" on public.audit_events for select to authenticated
  using (org_id is not null and public.has_permission(auth.uid(), 'audit.view', org_id));

-- Seed permissions and platform-defined roles
insert into public.permissions (key, description) values
  ('org.view','View organization and its sub-orgs'),
  ('org.manage','Edit organization settings'),
  ('org.create_child','Create chapters/regions under this organization'),
  ('members.view','View member profiles'),
  ('members.manage','Manage members'),
  ('roles.manage','Assign roles'),
  ('audit.view','View the audit log');

insert into public.roles (org_id, key, name) values (null,'org_admin','Organization admin'), (null,'member','Member');
insert into public.role_permissions (role_id, permission_key)
  select r.id, p.key from public.roles r cross join public.permissions p where r.key = 'org_admin' and r.org_id is null;

-- Create organization (only write path for orgs)
create or replace function public.create_organization(_name text, _slug text, _type public.org_type, _parent uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _id uuid; _email text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if _type = 'platform' then raise exception 'cannot create platform org'; end if;
  if _parent is null and _type not in ('national','standalone') then
    raise exception 'chapters and regions need a parent organization';
  end if;
  if _parent is not null then
    if _type in ('national','standalone') then raise exception 'this type cannot have a parent'; end if;
    if not public.has_permission(_uid, 'org.create_child', _parent) then raise exception 'not allowed'; end if;
  end if;
  insert into public.organizations (name, slug, type, parent_id, created_by)
    values (_name, lower(_slug), _type, _parent, _uid) returning id into _id;
  select email into _email from auth.users where id = _uid;
  insert into public.org_member_profiles (org_id, user_id, email) values (_id, _uid, coalesce(_email,''));
  if _parent is null then
    insert into public.role_assignments (user_id, role_id, org_id)
      select _uid, id, _id from public.roles where key = 'org_admin' and org_id is null;
  end if;
  return _id;
end $$;
revoke execute on function public.create_organization(text,text,public.org_type,uuid) from public, anon;
grant execute on function public.create_organization(text,text,public.org_type,uuid) to authenticated;