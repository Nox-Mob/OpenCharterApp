-- ===== Permissions =====
insert into public.permissions (key, description) values
  ('attributes.manage', 'Define custom member and chapter attributes'),
  ('setup.run', 'Run guided setup flows')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
  select r.id, p.key from public.roles r cross join public.permissions p
  where r.key = 'org_admin' and r.org_id is null and p.key in ('attributes.manage','setup.run')
on conflict do nothing;

-- Visible-tree helper: user belongs to the org or any of its descendants, or can view it
create or replace function public.can_see_org_tree(_user uuid, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(_user, 'org.view', _org) or exists (
    select 1 from public.org_member_profiles p join public.organizations o on o.id = p.org_id
    where p.user_id = _user and (o.id = _org or _org = any(o.ancestor_ids)))
$$;

-- ===== E-05 Role assignment =====
create or replace function public.assign_role(_org uuid, _user uuid, _role_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _role uuid; _id uuid;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'roles.manage', _org) then raise exception 'not allowed'; end if;
  if not public.is_org_member(_user, _org) then raise exception 'person is not a member of this organization'; end if;
  select id into _role from public.roles where key = _role_key and (org_id is null or org_id = _org)
    order by org_id nulls last limit 1;
  if _role is null then raise exception 'unknown role'; end if;
  insert into public.role_assignments (user_id, role_id, org_id, source) values (_user, _role, _org, 'manual')
    on conflict (user_id, role_id, org_id) do nothing returning id into _id;
  if _id is null then
    select id into _id from public.role_assignments where user_id = _user and role_id = _role and org_id = _org;
  end if;
  return _id;
end $$;

create or replace function public.remove_role(_assignment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _a public.role_assignments; _key text; _parent uuid; _admins int;
begin
  select * into _a from public.role_assignments where id = _assignment;
  if _a.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'roles.manage', _a.org_id) then
    raise exception 'not allowed';
  end if;
  select key into _key from public.roles where id = _a.role_id;
  select parent_id into _parent from public.organizations where id = _a.org_id;
  if _key = 'org_admin' and _parent is null then
    select count(*) into _admins from public.role_assignments ra join public.roles r on r.id = ra.role_id
      where ra.org_id = _a.org_id and r.key = 'org_admin';
    if _admins <= 1 then raise exception 'an organization must keep at least one admin'; end if;
  end if;
  delete from public.role_assignments where id = _assignment;
end $$;

revoke execute on function public.assign_role(uuid,uuid,text), public.remove_role(uuid), public.can_see_org_tree(uuid,uuid) from public, anon;
grant execute on function public.assign_role(uuid,uuid,text), public.remove_role(uuid), public.can_see_org_tree(uuid,uuid) to authenticated;

-- ===== E-09 Custom attributes =====
create type public.attribute_type as enum ('text','number','date','boolean','choice','multi_choice','ordered');
create type public.attribute_visibility as enum ('admins','members','public');
create type public.attribute_subject as enum ('member','chapter');

create table public.attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  applies_to public.attribute_subject not null default 'member',
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,47}$'),
  label text not null check (char_length(label) between 1 and 80),
  help text not null default '',
  data_type public.attribute_type not null,
  required boolean not null default false,
  visibility public.attribute_visibility not null default 'admins',
  member_editable boolean not null default false,
  show_in_directory boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, applies_to, key)
);
create index on public.attribute_definitions (org_id);
grant select, insert on public.attribute_definitions to authenticated;
grant update (label, help, required, visibility, member_editable, show_in_directory, sort_order, active) on public.attribute_definitions to authenticated;
grant all on public.attribute_definitions to service_role;
alter table public.attribute_definitions enable row level security;
create policy "tree members read attribute defs" on public.attribute_definitions for select to authenticated
  using (public.can_see_org_tree(auth.uid(), org_id));
create policy "managers insert attribute defs" on public.attribute_definitions for insert to authenticated
  with check (public.has_permission(auth.uid(), 'attributes.manage', org_id));
create policy "managers update attribute defs" on public.attribute_definitions for update to authenticated
  using (public.has_permission(auth.uid(), 'attributes.manage', org_id))
  with check (public.has_permission(auth.uid(), 'attributes.manage', org_id));
create trigger audit_attribute_definitions after insert or update or delete on public.attribute_definitions
  for each row execute function public.audit_row_change();

create table public.attribute_options (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.attribute_definitions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  value text not null check (char_length(value) between 1 and 80),
  label text not null check (char_length(label) between 1 and 80),
  sort_order int not null default 0,
  active boolean not null default true,
  unique (definition_id, value)
);
grant select, insert on public.attribute_options to authenticated;
grant update (label, sort_order, active) on public.attribute_options to authenticated;
grant all on public.attribute_options to service_role;
alter table public.attribute_options enable row level security;
create policy "tree members read attribute options" on public.attribute_options for select to authenticated
  using (public.can_see_org_tree(auth.uid(), org_id));
create policy "managers insert attribute options" on public.attribute_options for insert to authenticated
  with check (public.has_permission(auth.uid(), 'attributes.manage', org_id));
create policy "managers update attribute options" on public.attribute_options for update to authenticated
  using (public.has_permission(auth.uid(), 'attributes.manage', org_id))
  with check (public.has_permission(auth.uid(), 'attributes.manage', org_id));

create or replace function public.attribute_option_org_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare _t public.attribute_type;
begin
  select org_id, data_type into new.org_id, _t from public.attribute_definitions where id = new.definition_id;
  if _t not in ('choice','multi_choice','ordered') then raise exception 'this attribute type has no options'; end if;
  return new;
end $$;
create trigger attribute_options_org before insert on public.attribute_options
  for each row execute function public.attribute_option_org_check();
create trigger audit_attribute_options after insert or update or delete on public.attribute_options
  for each row execute function public.audit_row_change();

create table public.attribute_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  definition_id uuid not null references public.attribute_definitions(id) on delete cascade,
  entity_id uuid not null,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (definition_id, entity_id)
);
create index on public.attribute_values (org_id, entity_id);
grant select on public.attribute_values to authenticated;
grant all on public.attribute_values to service_role;
alter table public.attribute_values enable row level security;
create trigger audit_attribute_values after insert or update or delete on public.attribute_values
  for each row execute function public.audit_row_change();

create or replace function public.can_read_attribute_value(_user uuid, _value_org uuid, _def uuid, _entity uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(_user, 'members.view', _value_org)
    or exists (select 1 from public.org_member_profiles p where p.id = _entity and p.user_id = _user)
    or exists (select 1 from public.attribute_definitions d where d.id = _def and d.visibility in ('members','public')
               and public.is_org_member(_user, _value_org))
$$;
create policy "permitted read attribute values" on public.attribute_values for select to authenticated
  using (public.can_read_attribute_value(auth.uid(), org_id, definition_id, entity_id));

create or replace function public.validate_attribute_value(_def public.attribute_definitions, _v jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare _el jsonb;
begin
  case _def.data_type
    when 'text' then
      if jsonb_typeof(_v) <> 'string' or char_length(_v #>> '{}') > 2000 then raise exception 'invalid value for %', _def.label; end if;
    when 'number' then
      if jsonb_typeof(_v) <> 'number' then raise exception 'invalid value for %', _def.label; end if;
    when 'boolean' then
      if jsonb_typeof(_v) <> 'boolean' then raise exception 'invalid value for %', _def.label; end if;
    when 'date' then
      if jsonb_typeof(_v) <> 'string' or (_v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid value for %', _def.label; end if;
      perform (_v #>> '{}')::date;
    when 'choice', 'ordered' then
      if jsonb_typeof(_v) <> 'string' or not exists (select 1 from public.attribute_options o
          where o.definition_id = _def.id and o.value = _v #>> '{}' and o.active) then
        raise exception 'invalid value for %', _def.label; end if;
    when 'multi_choice' then
      if jsonb_typeof(_v) <> 'array' then raise exception 'invalid value for %', _def.label; end if;
      if (select count(*) from jsonb_array_elements(_v)) <> (select count(distinct e) from jsonb_array_elements(_v) e) then
        raise exception 'invalid value for %', _def.label; end if;
      for _el in select * from jsonb_array_elements(_v) loop
        if jsonb_typeof(_el) <> 'string' or not exists (select 1 from public.attribute_options o
            where o.definition_id = _def.id and o.value = _el #>> '{}' and o.active) then
          raise exception 'invalid value for %', _def.label; end if;
      end loop;
  end case;
end $$;

create or replace function public.set_attribute_value(_def uuid, _entity uuid, _value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _d public.attribute_definitions; _org uuid; _owner uuid; _uid uuid := auth.uid(); _anc uuid[];
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _d from public.attribute_definitions where id = _def and active;
  if _d.id is null then raise exception 'unknown attribute'; end if;
  if _d.applies_to = 'member' then
    select p.org_id, p.user_id into _org, _owner from public.org_member_profiles p where p.id = _entity;
    if _org is null then raise exception 'unknown member'; end if;
    select ancestor_ids into _anc from public.organizations where id = _org;
    if not (_org = _d.org_id or _d.org_id = any(_anc)) then raise exception 'attribute does not apply here'; end if;
    if not (public.has_permission(_uid, 'members.manage', _org) or (_owner = _uid and _d.member_editable)) then
      raise exception 'not allowed'; end if;
  else
    _org := _entity;
    select ancestor_ids into _anc from public.organizations where id = _org;
    if _anc is null or not (_d.org_id = any(_anc)) then raise exception 'attribute does not apply here'; end if;
    if not public.has_permission(_uid, 'org.manage', _org) then raise exception 'not allowed'; end if;
  end if;
  if _value is null or _value = 'null'::jsonb then
    if _d.required then raise exception '% is required', _d.label; end if;
    delete from public.attribute_values where definition_id = _def and entity_id = _entity;
    return;
  end if;
  perform public.validate_attribute_value(_d, _value);
  insert into public.attribute_values (org_id, definition_id, entity_id, value, updated_by)
    values (_org, _def, _entity, _value, _uid)
    on conflict (definition_id, entity_id) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end $$;
revoke execute on function public.set_attribute_value(uuid,uuid,jsonb), public.validate_attribute_value(public.attribute_definitions, jsonb),
  public.can_read_attribute_value(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.set_attribute_value(uuid,uuid,jsonb), public.can_read_attribute_value(uuid,uuid,uuid,uuid) to authenticated;

-- ===== E-10 Setup engine =====
create type public.setup_status as enum ('in_progress','applied','needs_review');
create table public.setup_states (
  org_id uuid not null references public.organizations(id) on delete cascade,
  flow_id text not null check (flow_id ~ '^[a-z][a-z0-9_]{1,40}$'),
  answers jsonb not null default '{}',
  status public.setup_status not null default 'in_progress',
  applied_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, flow_id)
);
grant select, insert on public.setup_states to authenticated;
grant update (answers, updated_by, updated_at) on public.setup_states to authenticated;
grant all on public.setup_states to service_role;
alter table public.setup_states enable row level security;
create policy "setup runners read" on public.setup_states for select to authenticated
  using (public.has_permission(auth.uid(), 'setup.run', org_id));
create policy "setup runners insert draft" on public.setup_states for insert to authenticated
  with check (public.has_permission(auth.uid(), 'setup.run', org_id) and status = 'in_progress');
create policy "setup runners update draft" on public.setup_states for update to authenticated
  using (public.has_permission(auth.uid(), 'setup.run', org_id))
  with check (public.has_permission(auth.uid(), 'setup.run', org_id));

-- Apply a flow's plan in one transaction. Plan shape:
-- { tax?: {...}, attributes?: [{key,label,data_type,required,visibility,member_editable,show_in_directory,applies_to,options:[{value,label}]}],
--   settings?: [{key,value,mode}] }
create or replace function public.apply_setup(_org uuid, _flow text, _answers jsonb, _plan jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _a jsonb; _o jsonb; _def uuid; _i int; _s jsonb;
begin
  if _uid is null or not public.has_permission(_uid, 'setup.run', _org) then raise exception 'not allowed'; end if;

  if _plan ? 'tax' and jsonb_typeof(_plan->'tax') = 'object' then
    if not public.has_permission(_uid, 'org.manage', _org) then raise exception 'not allowed'; end if;
    insert into public.tax_profiles (org_id, legal_name, ein, tax_status)
      values (_org, coalesce(_plan->'tax'->>'legal_name',''), coalesce(_plan->'tax'->>'ein',''), coalesce(_plan->'tax'->>'tax_status',''))
      on conflict (org_id) do update set legal_name = excluded.legal_name, ein = excluded.ein,
        tax_status = excluded.tax_status, updated_at = now();
  end if;

  if jsonb_typeof(_plan->'attributes') = 'array' then
    if not public.has_permission(_uid, 'attributes.manage', _org) then raise exception 'not allowed'; end if;
    _i := 0;
    for _a in select * from jsonb_array_elements(_plan->'attributes') loop
      _i := _i + 1;
      insert into public.attribute_definitions (org_id, applies_to, key, label, data_type, required, visibility,
          member_editable, show_in_directory, sort_order)
        values (_org, coalesce(_a->>'applies_to','member')::public.attribute_subject, _a->>'key', _a->>'label',
          (_a->>'data_type')::public.attribute_type, coalesce((_a->>'required')::boolean, false),
          coalesce(_a->>'visibility','admins')::public.attribute_visibility, coalesce((_a->>'member_editable')::boolean, false),
          coalesce((_a->>'show_in_directory')::boolean, false), _i * 10)
        on conflict (org_id, applies_to, key) do update set label = excluded.label, required = excluded.required,
          visibility = excluded.visibility, member_editable = excluded.member_editable,
          show_in_directory = excluded.show_in_directory, active = true
        returning id into _def;
      if jsonb_typeof(_a->'options') = 'array' then
        _i := 0;
        for _o in select * from jsonb_array_elements(_a->'options') loop
          _i := _i + 1;
          insert into public.attribute_options (definition_id, org_id, value, label, sort_order)
            values (_def, _org, _o->>'value', coalesce(_o->>'label', _o->>'value'), _i * 10)
            on conflict (definition_id, value) do update set label = excluded.label, sort_order = excluded.sort_order, active = true;
        end loop;
      end if;
    end loop;
  end if;

  if jsonb_typeof(_plan->'settings') = 'array' then
    if not public.has_permission(_uid, 'org.manage', _org) then raise exception 'not allowed'; end if;
    for _s in select * from jsonb_array_elements(_plan->'settings') loop
      insert into public.org_settings (org_id, key, value, mode)
        values (_org, _s->>'key', _s->'value', coalesce(_s->>'mode','override')::public.setting_mode)
        on conflict (org_id, key) do update set value = excluded.value, mode = excluded.mode;
    end loop;
  end if;

  insert into public.setup_states (org_id, flow_id, answers, status, applied_at, updated_by)
    values (_org, _flow, coalesce(_answers,'{}'), 'applied', now(), _uid)
    on conflict (org_id, flow_id) do update set answers = excluded.answers, status = 'applied',
      applied_at = now(), updated_by = _uid, updated_at = now();
end $$;
revoke execute on function public.apply_setup(uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.apply_setup(uuid,text,jsonb,jsonb) to authenticated;
create trigger audit_setup_states after insert or update or delete on public.setup_states
  for each row execute function public.audit_row_change();