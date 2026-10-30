-- Tighten column-level writes so hierarchy/identity columns can't be changed from the client
revoke update on public.organizations from authenticated;
alter table public.organizations add column logo_path text;
grant update (name, timezone, logo_path) on public.organizations to authenticated;
revoke update on public.org_member_profiles from authenticated;
grant update (display_name) on public.org_member_profiles to authenticated;

insert into public.permissions (key, description) values ('members.invite','Invite people to the organization')
  on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
  select id, 'members.invite' from public.roles where key = 'org_admin' and org_id is null on conflict do nothing;

-- E-03 Invitations
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id),
  token_hash text not null unique,
  invited_by uuid not null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invitations (org_id);
grant select on public.invitations to authenticated;
grant all on public.invitations to service_role;
alter table public.invitations enable row level security;
create policy "inviters read invitations" on public.invitations for select to authenticated
  using (public.has_permission(auth.uid(), 'members.invite', org_id));
create trigger audit_invitations after insert or update or delete on public.invitations
  for each row execute function public.audit_row_change();

create or replace function public.create_invitation(_org uuid, _email text, _role_key text default 'member')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare _uid uuid := auth.uid(); _token text; _role uuid;
begin
  if _uid is null or not public.has_permission(_uid, 'members.invite', _org) then raise exception 'not allowed'; end if;
  if _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if _role_key <> 'member' and not public.has_permission(_uid, 'roles.manage', _org) then raise exception 'not allowed'; end if;
  select id into _role from public.roles where key = _role_key and (org_id is null or org_id = _org) limit 1;
  if _role is null then raise exception 'unknown role'; end if;
  _token := encode(gen_random_bytes(24), 'hex');
  insert into public.invitations (org_id, email, role_id, token_hash, invited_by)
    values (_org, lower(trim(_email)), _role, encode(digest(_token, 'sha256'), 'hex'), _uid);
  return _token;
end $$;

create or replace function public.revoke_invitation(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _org uuid;
begin
  select org_id into _org from public.invitations where id = _id;
  if _org is null or not public.has_permission(auth.uid(), 'members.invite', _org) then raise exception 'not allowed'; end if;
  update public.invitations set revoked_at = now() where id = _id and accepted_at is null;
end $$;

-- Preview for the accept page: only the org name and validity, nothing else
create or replace function public.get_invitation(_token text)
returns table (org_name text, usable boolean) language sql stable security definer set search_path = public, extensions as $$
  select o.name, (i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
  from public.invitations i join public.organizations o on o.id = i.org_id
  where i.token_hash = encode(digest(_token, 'sha256'), 'hex')
$$;

create or replace function public.accept_invitation(_token text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare _uid uuid := auth.uid(); _inv public.invitations; _email text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _inv from public.invitations
    where token_hash = encode(digest(_token, 'sha256'), 'hex') for update;
  if _inv.id is null or _inv.accepted_at is not null or _inv.revoked_at is not null or _inv.expires_at <= now() then
    raise exception 'invitation is not valid';
  end if;
  select lower(email) into _email from auth.users where id = _uid;
  if _email is distinct from _inv.email then raise exception 'invitation is for a different email address'; end if;
  insert into public.org_member_profiles (org_id, user_id, email) values (_inv.org_id, _uid, _email)
    on conflict (org_id, user_id) do nothing;
  insert into public.role_assignments (user_id, role_id, org_id, source) values (_uid, _inv.role_id, _inv.org_id, 'invitation')
    on conflict do nothing;
  update public.invitations set accepted_at = now(), accepted_by = _uid where id = _inv.id;
  return _inv.org_id;
end $$;

revoke execute on function public.create_invitation(uuid,text,text) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.get_invitation(text) from public, anon;
grant execute on function public.create_invitation(uuid,text,text), public.revoke_invitation(uuid),
  public.accept_invitation(text), public.get_invitation(text) to authenticated;

-- E-04 Tax profile
create table public.tax_profiles (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  legal_name text not null default '',
  ein text not null default '' check (ein = '' or ein ~ '^\d{2}-\d{7}$'),
  tax_status text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  region text not null default '',
  postal_code text not null default '',
  country text not null default 'US',
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.tax_profiles to authenticated;
grant all on public.tax_profiles to service_role;
alter table public.tax_profiles enable row level security;
create policy "managers read tax" on public.tax_profiles for select to authenticated
  using (public.has_permission(auth.uid(), 'org.manage', org_id));
create policy "managers insert tax" on public.tax_profiles for insert to authenticated
  with check (public.has_permission(auth.uid(), 'org.manage', org_id));
create policy "managers update tax" on public.tax_profiles for update to authenticated
  using (public.has_permission(auth.uid(), 'org.manage', org_id))
  with check (public.has_permission(auth.uid(), 'org.manage', org_id));
create trigger audit_tax_profiles after insert or update or delete on public.tax_profiles
  for each row execute function public.audit_row_change();

-- E-04 Org settings with inherit / override / locked
create type public.setting_mode as enum ('inherit','override','locked');
create table public.org_settings (
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  value jsonb,
  mode public.setting_mode not null default 'override',
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);
grant select, insert, update, delete on public.org_settings to authenticated;
grant all on public.org_settings to service_role;
alter table public.org_settings enable row level security;
create policy "members read settings" on public.org_settings for select to authenticated
  using (public.is_org_member(auth.uid(), org_id) or public.has_permission(auth.uid(), 'org.view', org_id));
create policy "managers write settings" on public.org_settings for all to authenticated
  using (public.has_permission(auth.uid(), 'org.manage', org_id))
  with check (public.has_permission(auth.uid(), 'org.manage', org_id));
-- A child cannot set a key that an ancestor has locked
create or replace function public.enforce_setting_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.org_settings s join public.organizations o on s.org_id = any(o.ancestor_ids)
    where o.id = new.org_id and s.key = new.key and s.mode = 'locked'
  ) then raise exception 'setting % is locked by a parent organization', new.key; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger org_settings_lock before insert or update on public.org_settings
  for each row execute function public.enforce_setting_lock();
create trigger audit_org_settings after insert or update or delete on public.org_settings
  for each row execute function public.audit_row_change();

-- Ancestors need to be readable for setting/logo fallback: members may read their org's ancestors' settings via this function
create or replace function public.org_lineage(_org uuid)
returns table (id uuid, name text, type public.org_type, logo_path text, depth int)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.type, a.logo_path, array_position(o.ancestor_ids, a.id)
  from public.organizations o join public.organizations a on a.id = any(o.ancestor_ids)
  where o.id = _org and (public.is_org_member(auth.uid(), _org) or public.has_permission(auth.uid(), 'org.view', _org))
$$;
create or replace function public.lineage_settings(_org uuid)
returns table (org_id uuid, key text, value jsonb, mode public.setting_mode)
language sql stable security definer set search_path = public as $$
  select s.org_id, s.key, s.value, s.mode
  from public.organizations o join public.org_settings s on s.org_id = o.id or s.org_id = any(o.ancestor_ids)
  where o.id = _org and (public.is_org_member(auth.uid(), _org) or public.has_permission(auth.uid(), 'org.view', _org))
$$;
revoke execute on function public.org_lineage(uuid), public.lineage_settings(uuid) from public, anon;
grant execute on function public.org_lineage(uuid), public.lineage_settings(uuid) to authenticated;

-- Branding storage policies (bucket "branding", path <org_id>/...)
create policy "branding public read" on storage.objects for select using (bucket_id = 'branding');
create policy "branding managers insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.has_permission(auth.uid(), 'org.manage', ((storage.foldername(name))[1])::uuid));
create policy "branding managers update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.has_permission(auth.uid(), 'org.manage', ((storage.foldername(name))[1])::uuid));
create policy "branding managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.has_permission(auth.uid(), 'org.manage', ((storage.foldername(name))[1])::uuid));