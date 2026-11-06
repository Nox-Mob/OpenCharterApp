-- ===== E-11 Membership levels and terms (D-122..D-124) =====
-- Each org defines its own levels (tiers) and term options. A term is a count plus a unit
-- (day, month, year) or lifetime, priced in integer minor units. A parent org decides whether
-- its sub-orgs may create their own levels (setting membership.child_levels_allowed).
-- Levels and terms are retired (active = false), never deleted.
--
-- Lovable conventions (D-125): full SELECT/INSERT/UPDATE/DELETE grants, RLS, and policies using
-- has_permission / is_org_member. The rules still hold:
-- - "retire, never delete": there is no DELETE policy, so RLS lets no client delete a row
-- - identity columns (org_id, key, tier_id) can't change: tier_identity_guard rejects it

insert into public.permissions (key, description) values ('tiers.manage', 'Define membership levels and terms')
  on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
  select id, 'tiers.manage' from public.roles where key = 'org_admin' and org_id is null
  on conflict do nothing;

create type public.term_unit as enum ('day', 'month', 'year');
create type public.tax_treatment as enum ('deductible', 'non_deductible', 'partial');

create table public.membership_tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,47}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  tax_treatment public.tax_treatment not null default 'non_deductible',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);
create index on public.membership_tiers (org_id);
grant select, insert, update, delete on public.membership_tiers to authenticated;
comment on table public.membership_tiers is
  'Membership levels (E-11). Retire with active = false; there is no DELETE policy, so rows are never deleted.';
grant all on public.membership_tiers to service_role;
alter table public.membership_tiers enable row level security;
-- Read: members of the org (or of any org below it) and anyone who can view it.
create policy "tree members read tiers" on public.membership_tiers for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create policy "managers insert tiers" on public.membership_tiers for insert to authenticated
  with check (public.has_permission(auth.uid(), 'tiers.manage', org_id));
create policy "managers update tiers" on public.membership_tiers for update to authenticated
  using (public.has_permission(auth.uid(), 'tiers.manage', org_id))
  with check (public.has_permission(auth.uid(), 'tiers.manage', org_id));
create trigger audit_membership_tiers after insert or update or delete on public.membership_tiers
  for each row execute function public.audit_row_change();

create table public.tier_terms (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.membership_tiers(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9_]{0,47}$'),
  label text not null check (char_length(label) between 1 and 80),
  length_count int,
  length_unit public.term_unit,
  price_minor int not null check (price_minor between 0 and 100000000),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tier_id, key),
  -- lifetime: no length at all; otherwise a positive count with a unit
  check ((length_count is null and length_unit is null)
      or (length_count between 1 and 1000 and length_unit is not null))
);
create index on public.tier_terms (org_id);
grant select, insert, update, delete on public.tier_terms to authenticated;
comment on table public.tier_terms is
  'Terms of a membership level (E-11). Retire with active = false; there is no DELETE policy, so rows are never deleted.';
grant all on public.tier_terms to service_role;
alter table public.tier_terms enable row level security;
create policy "tree members read terms" on public.tier_terms for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create policy "managers insert terms" on public.tier_terms for insert to authenticated
  with check (public.has_permission(auth.uid(), 'tiers.manage', org_id));
create policy "managers update terms" on public.tier_terms for update to authenticated
  using (public.has_permission(auth.uid(), 'tiers.manage', org_id))
  with check (public.has_permission(auth.uid(), 'tiers.manage', org_id));
create trigger audit_tier_terms after insert or update or delete on public.tier_terms
  for each row execute function public.audit_row_change();

-- A level keeps its org and key, and a term keeps its level (the UPDATE grant covers every column).
create or replace function public.tier_identity_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.org_id is distinct from old.org_id or new.key is distinct from old.key then
    raise exception 'a level''s organization and key can''t be changed';
  end if;
  if tg_table_name = 'tier_terms' then
    -- nested: plpgsql would read new.tier_id even on membership_tiers in a combined condition
    if (to_jsonb(new)->>'tier_id') is distinct from (to_jsonb(old)->>'tier_id') then
      raise exception 'a term can''t move to another level';
    end if;
  end if;
  return new;
end $$;
create trigger membership_tiers_identity before update on public.membership_tiers
  for each row execute function public.tier_identity_guard();
create trigger tier_terms_identity before update on public.tier_terms
  for each row execute function public.tier_identity_guard();

-- A term always belongs to its level's org.
create or replace function public.tier_term_org_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select org_id into new.org_id from public.membership_tiers where id = new.tier_id;
  return new;
end $$;
create trigger tier_terms_org before insert on public.tier_terms
  for each row execute function public.tier_term_org_check();

-- A setting resolved from an org's ancestors only (its own row is ignored): a locked ancestor
-- wins (root first), else the nearest ancestor with a value. Used for rules a parent sets for
-- its sub-orgs, so a sub-org can't grant itself the right.
create or replace function public.ancestor_setting(_org uuid, _key text)
returns jsonb language sql stable security definer set search_path = public as $$
  with anc as (
    select a.id, array_position(o.ancestor_ids, a.id) as depth
    from public.organizations o join public.organizations a on a.id = any(o.ancestor_ids)
    where o.id = _org
  )
  select coalesce(
    (select s.value from anc join public.org_settings s on s.org_id = anc.id
       where s.key = _key and s.mode = 'locked' order by anc.depth asc limit 1),
    (select s.value from anc join public.org_settings s on s.org_id = anc.id
       where s.key = _key and s.mode <> 'inherit' order by anc.depth desc limit 1))
$$;
revoke execute on function public.ancestor_setting(uuid, text) from public, anon, authenticated;

-- Sub-orgs may only create (or restore) levels when their parent allows it (D-123).
create or replace function public.tier_parent_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active)
     and public.ancestor_setting(new.org_id, 'membership.child_levels_allowed') = 'false'::jsonb then
    raise exception 'your parent organization manages membership levels';
  end if;
  return new;
end $$;
create trigger membership_tiers_parent before insert or update of active on public.membership_tiers
  for each row execute function public.tier_parent_check();

-- apply_setup gains a tiers section (otherwise the same as 0005)
create or replace function public.apply_setup(_org uuid, _flow text, _answers jsonb, _plan jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _a jsonb; _o jsonb; _def uuid; _i int; _j int; _s jsonb; _t jsonb; _tier uuid;
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
          member_editable, show_in_directory, sort_order, locked)
        values (_org, coalesce(_a->>'applies_to','member')::public.attribute_subject, _a->>'key', _a->>'label',
          (_a->>'data_type')::public.attribute_type, coalesce((_a->>'required')::boolean, false),
          coalesce(_a->>'visibility','admins')::public.attribute_visibility, coalesce((_a->>'member_editable')::boolean, false),
          coalesce((_a->>'show_in_directory')::boolean, false), _i * 10, coalesce((_a->>'locked')::boolean, false))
        on conflict (org_id, applies_to, key) do update set label = excluded.label, required = excluded.required,
          visibility = excluded.visibility, member_editable = excluded.member_editable,
          show_in_directory = excluded.show_in_directory, locked = excluded.locked, active = true
        returning id into _def;
      if jsonb_typeof(_a->'options') = 'array' then
        _j := 0;
        for _o in select * from jsonb_array_elements(_a->'options') loop
          _j := _j + 1;
          insert into public.attribute_options (definition_id, org_id, value, label, sort_order)
            values (_def, _org, _o->>'value', coalesce(_o->>'label', _o->>'value'), _j * 10)
            on conflict (definition_id, value) do update set label = excluded.label, sort_order = excluded.sort_order, active = true;
        end loop;
      end if;
    end loop;
  end if;

  -- Membership levels: upsert by key, terms by (level, key). Terms left out are not deleted.
  if jsonb_typeof(_plan->'tiers') = 'array' then
    if not public.has_permission(_uid, 'tiers.manage', _org) then raise exception 'not allowed'; end if;
    _i := 0;
    for _a in select * from jsonb_array_elements(_plan->'tiers') loop
      _i := _i + 1;
      insert into public.membership_tiers (org_id, key, name, description, tax_treatment, sort_order)
        values (_org, _a->>'key', _a->>'name', coalesce(_a->>'description', ''),
          coalesce(_a->>'tax_treatment', 'non_deductible')::public.tax_treatment, _i * 10)
        on conflict (org_id, key) do update set name = excluded.name, description = excluded.description,
          tax_treatment = excluded.tax_treatment, sort_order = excluded.sort_order, active = true
        returning id into _tier;
      _j := 0;
      for _t in select * from jsonb_array_elements(coalesce(_a->'terms', '[]')) loop
        _j := _j + 1;
        insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor, currency, sort_order)
          values (_tier, _org, _t->>'key', _t->>'label', (_t->>'length_count')::int,
            (_t->>'length_unit')::public.term_unit, (_t->>'price_minor')::int,
            coalesce(_t->>'currency', 'USD'), _j * 10)
          on conflict (tier_id, key) do update set label = excluded.label, length_count = excluded.length_count,
            length_unit = excluded.length_unit, price_minor = excluded.price_minor, currency = excluded.currency,
            sort_order = excluded.sort_order, active = true;
      end loop;
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
