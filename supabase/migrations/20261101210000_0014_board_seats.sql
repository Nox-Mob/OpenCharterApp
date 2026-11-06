-- ===== E-17 Board seats, terms and appointments (D-070..D-072, D-056, D-141, D-142) =====
-- A seat template describes an officer position (President, Treasurer…). An org defines seats
-- for itself ('self') or, as a national or region, for every org below it ('chapters').
-- Appointing someone to a seat can grant the seat's linked role. Ending the appointment takes
-- away only the role assignment the appointment created (D-072).
-- Term lengths follow each org's own by-laws (D-142). The template's term is only a suggested
-- default. Each org records its own term per seat in seat_terms, with an effective date and a
-- by-law reference. Rows are never edited or deleted, so the history of the rules is kept. A
-- parent can't lock a sub-org's terms.
-- Seats are retired (active = false), never deleted. Appointments are ended, never deleted.
-- Lovable conventions (D-125): full grants, RLS with has_permission / is_org_member, no DROP.
-- Every write goes through the definer RPCs below; there are no client write policies.

insert into public.permissions (key, description) values
  ('governance.manage', 'Appoint officers and set seat terms'),
  ('governance.define', 'Define board seats')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
  select id, p from public.roles cross join unnest(array['governance.manage', 'governance.define']) p
  where key = 'org_admin' and org_id is null
on conflict do nothing;

create type public.seat_scope as enum ('self', 'chapters');

-- ----- seat templates -----
create table public.seat_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,47}$'),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  required boolean not null default false,
  seat_count int not null default 1 check (seat_count between 1 and 50),
  -- suggested term; null/null = no fixed term
  default_term_count int,
  default_term_unit public.term_unit,
  role_id uuid references public.roles(id),
  scope public.seat_scope not null default 'self',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, key),
  check ((default_term_count is null and default_term_unit is null)
      or (default_term_count between 1 and 100 and default_term_unit is not null))
);
create index on public.seat_templates (org_id);
grant select, insert, update, delete on public.seat_templates to authenticated;
grant all on public.seat_templates to service_role;
alter table public.seat_templates enable row level security;
comment on table public.seat_templates is
  'Board seats (E-17). Written only by definer RPCs; retired with active = false, never deleted.';
create policy "tree members read seats" on public.seat_templates for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create trigger audit_seat_templates after insert or update or delete on public.seat_templates
  for each row execute function public.audit_row_change();

-- ----- custom titles for inherited seats (D-071) -----
create table public.seat_title_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.seat_templates(id) on delete cascade,
  title text check (char_length(title) between 1 and 80),
  updated_at timestamptz not null default now(),
  unique (org_id, template_id)
);
grant select, insert, update, delete on public.seat_title_overrides to authenticated;
grant all on public.seat_title_overrides to service_role;
alter table public.seat_title_overrides enable row level security;
comment on table public.seat_title_overrides is
  'An org''s own title for a seat its parent defined (E-17). Written only by set_seat_title; null = the default title.';
create policy "tree members read seat titles" on public.seat_title_overrides for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create trigger audit_seat_title_overrides after insert or update or delete on public.seat_title_overrides
  for each row execute function public.audit_row_change();

-- ----- each org's own term per seat, with its by-law history (D-142) -----
create table public.seat_terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.seat_templates(id) on delete cascade,
  -- null/null = no fixed term
  length_count int,
  length_unit public.term_unit,
  effective_from date not null,
  bylaw_reference text not null default '' check (char_length(bylaw_reference) <= 200),
  note text not null default '' check (char_length(note) <= 500),
  set_by uuid,
  created_at timestamptz not null default now(),
  check ((length_count is null and length_unit is null)
      or (length_count between 1 and 100 and length_unit is not null))
);
create index on public.seat_terms (org_id, template_id, effective_from desc);
grant select, insert, update, delete on public.seat_terms to authenticated;
grant all on public.seat_terms to service_role;
alter table public.seat_terms enable row level security;
comment on table public.seat_terms is
  'Term rules per org and seat (E-17, D-142). Append-only: a by-law change adds a row with its effective date.';
create policy "tree members read seat terms" on public.seat_terms for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create trigger audit_seat_terms after insert or update or delete on public.seat_terms
  for each row execute function public.audit_row_change();

create or replace function public.seat_terms_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'term rules can''t be changed; add a new term with its effective date';
end $$;
create trigger seat_terms_append_only before update or delete on public.seat_terms
  for each row execute function public.seat_terms_append_only();

-- ----- appointments -----
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.seat_templates(id) on delete cascade,
  profile_id uuid not null references public.org_member_profiles(id) on delete cascade,
  seat_number int not null check (seat_number between 1 and 50),
  starts_on date not null,
  planned_end date,
  ended_on date,
  end_reason text not null default '' check (char_length(end_reason) <= 300),
  -- only set when this appointment created the role assignment (D-072)
  role_assignment_id uuid references public.role_assignments(id) on delete set null,
  appointed_by uuid,
  ended_by uuid,
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= starts_on),
  check (planned_end is null or planned_end >= starts_on)
);
create index on public.appointments (org_id, template_id);
create index on public.appointments (profile_id);
create unique index appointments_one_holder_per_seat on public.appointments (org_id, template_id, seat_number)
  where ended_on is null;
create unique index appointments_one_seat_per_person on public.appointments (org_id, template_id, profile_id)
  where ended_on is null;
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;
comment on table public.appointments is
  'Who holds which seat, past and present (E-17). Written only by definer RPCs; ended, never deleted.';
create policy "tree members read appointments" on public.appointments for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create trigger audit_appointments after insert or update or delete on public.appointments
  for each row execute function public.audit_row_change();

-- History stays: who, which seat and when it started never change; an ended appointment stays ended.
create or replace function public.appointments_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'appointments can''t be deleted; end them instead';
  end if;
  if new.org_id is distinct from old.org_id or new.template_id is distinct from old.template_id
     or new.profile_id is distinct from old.profile_id or new.seat_number is distinct from old.seat_number
     or new.starts_on is distinct from old.starts_on or new.appointed_by is distinct from old.appointed_by
     or new.created_at is distinct from old.created_at then
    raise exception 'appointments can''t be changed; end it and appoint again';
  end if;
  if old.ended_on is not null and (new.ended_on is distinct from old.ended_on
     or new.end_reason is distinct from old.end_reason or new.planned_end is distinct from old.planned_end) then
    raise exception 'an ended appointment can''t be changed';
  end if;
  return new;
end $$;
create trigger appointments_guard before update or delete on public.appointments
  for each row execute function public.appointments_guard();

-- ----- helpers -----
-- A seat applies at its own org ('self') or at every org below it ('chapters').
create or replace function public.seat_applies_at(_t public.seat_templates, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case _t.scope
    when 'self' then _t.org_id = _org
    else exists (select 1 from public.organizations o where o.id = _org and _t.org_id = any(o.ancestor_ids)) end
$$;

-- The term in force at an org for a seat on a day: the org's latest rule effective by then,
-- else the template's suggested default. source is 'org' or 'default'.
create or replace function public.seat_term_in_force(_org uuid, _template uuid, _on date)
returns table (length_count int, length_unit public.term_unit, source text, term_id uuid)
language sql stable security definer set search_path = public as $$
  select x.length_count, x.length_unit, x.source, x.term_id from (
    (select st.length_count, st.length_unit, 'org'::text as source, st.id as term_id, 0 as prio
      from public.seat_terms st
      where st.org_id = _org and st.template_id = _template and st.effective_from <= _on
      order by st.effective_from desc, st.created_at desc limit 1)
    union all
    select t.default_term_count, t.default_term_unit, 'default'::text, null::uuid, 1
      from public.seat_templates t where t.id = _template
  ) x order by x.prio limit 1
$$;

create or replace function public.seat_planned_end(_org uuid, _template uuid, _starts_on date, _rule_on date)
returns date language sql stable security definer set search_path = public as $$
  select public.term_end(_starts_on, f.length_count, f.length_unit)
  from public.seat_term_in_force(_org, _template, _rule_on) f
$$;

create or replace function public.seat_template_check(_org uuid, _term_count int, _term_unit public.term_unit,
  _role uuid, _scope public.seat_scope)
returns void language plpgsql stable security definer set search_path = public as $$
declare _o public.organizations; _r public.roles;
begin
  select * into _o from public.organizations where id = _org;
  if _scope = 'chapters' and _o.type not in ('national', 'region') then
    raise exception 'only a national or region can define seats for its chapters';
  end if;
  if (_term_count is null) <> (_term_unit is null) or (_term_count is not null and _term_count not between 1 and 100) then
    raise exception 'give the term as a number and a unit, or leave it open';
  end if;
  if _role is not null then
    select * into _r from public.roles where id = _role;
    if _r.id is null or not _r.active or not public.role_applies_at(_r, _org) then raise exception 'unknown role'; end if;
    if not public.holds_all_role_permissions(auth.uid(), _role, _org) then
      raise exception 'you can only grant permissions you hold';
    end if;
  end if;
end $$;

-- ----- seat definitions (governance.define) -----
create or replace function public.define_seat(_org uuid, _key text, _title text, _description text default '',
  _required boolean default false, _seat_count int default 1, _term_count int default null,
  _term_unit public.term_unit default null, _role uuid default null, _scope public.seat_scope default 'self',
  _sort_order int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _parent uuid;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'governance.define', _org) then raise exception 'not allowed'; end if;
  select parent_id into _parent from public.organizations where id = _org;
  if _parent is not null and public.ancestor_setting(_org, 'governance.chapter_extra_seats_allowed') = 'false'::jsonb then
    raise exception 'your parent organization manages board seats';
  end if;
  perform public.seat_template_check(_org, _term_count, _term_unit, _role, _scope);
  if exists (select 1 from public.seat_templates where org_id = _org and key = _key) then
    raise exception 'a seat with that name already exists';
  end if;
  insert into public.seat_templates (org_id, key, title, description, required, seat_count,
      default_term_count, default_term_unit, role_id, scope, sort_order)
    values (_org, _key, trim(_title), coalesce(trim(_description), ''), _required, _seat_count,
      _term_count, _term_unit, _role, _scope, _sort_order)
    returning id into _id;
  return _id;
end $$;

-- Key and scope stay fixed; a lower seat count can't push out current officers.
create or replace function public.update_seat(_template uuid, _title text, _description text, _required boolean,
  _seat_count int, _term_count int, _term_unit public.term_unit, _role uuid, _sort_order int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare _t public.seat_templates;
begin
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'governance.define', _t.org_id) then
    raise exception 'not allowed';
  end if;
  perform public.seat_template_check(_t.org_id, _term_count, _term_unit,
    case when _role is distinct from _t.role_id then _role end, _t.scope);
  if exists (select 1 from public.appointments where template_id = _template and ended_on is null and seat_number > _seat_count) then
    raise exception 'end the appointments in the seats you''re removing first';
  end if;
  update public.seat_templates set title = trim(_title), description = coalesce(trim(_description), ''),
    required = _required, seat_count = _seat_count, default_term_count = _term_count,
    default_term_unit = _term_unit, role_id = _role, sort_order = _sort_order
    where id = _template;
end $$;

create or replace function public.set_seat_active(_template uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _t public.seat_templates;
begin
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'governance.define', _t.org_id) then
    raise exception 'not allowed';
  end if;
  if not _active and exists (select 1 from public.appointments where template_id = _template and ended_on is null) then
    raise exception 'end the current appointments before retiring this seat';
  end if;
  update public.seat_templates set active = _active where id = _template;
end $$;

-- ----- an org's own titles and terms (governance.manage) -----
create or replace function public.set_seat_title(_org uuid, _template uuid, _title text)
returns void language plpgsql security definer set search_path = public as $$
declare _t public.seat_templates; _clean text := nullif(trim(coalesce(_title, '')), '');
begin
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'governance.manage', _org)
     or not public.seat_applies_at(_t, _org) then raise exception 'not allowed'; end if;
  if _t.org_id = _org then raise exception 'rename your own seats in the seat editor'; end if;
  if _clean is not null and public.ancestor_setting(_org, 'governance.custom_titles_allowed') = 'false'::jsonb then
    raise exception 'your parent organization sets the seat titles';
  end if;
  insert into public.seat_title_overrides (org_id, template_id, title) values (_org, _template, _clean)
    on conflict (org_id, template_id) do update set title = excluded.title, updated_at = now();
end $$;

create or replace function public.set_seat_term(_org uuid, _template uuid, _count int, _unit public.term_unit,
  _effective_from date, _bylaw_reference text default '', _note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare _t public.seat_templates; _id uuid;
begin
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'governance.manage', _org)
     or not public.seat_applies_at(_t, _org) then raise exception 'not allowed'; end if;
  if _effective_from is null then raise exception 'give the date the term takes effect'; end if;
  if (_count is null) <> (_unit is null) or (_count is not null and _count not between 1 and 100) then
    raise exception 'give the term as a number and a unit, or leave it open';
  end if;
  insert into public.seat_terms (org_id, template_id, length_count, length_unit, effective_from,
      bylaw_reference, note, set_by)
    values (_org, _template, _count, _unit, _effective_from, coalesce(trim(_bylaw_reference), ''),
      coalesce(trim(_note), ''), auth.uid())
    returning id into _id;
  return _id;
end $$;

-- "Apply to current officers": recompute current officers' planned ends from the term in force
-- today (otherwise a term change only affects appointments starting on or after its date).
create or replace function public.recalculate_planned_ends(_org uuid, _template uuid)
returns int language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'governance.manage', _org) then raise exception 'not allowed'; end if;
  update public.appointments a set planned_end = public.seat_planned_end(_org, _template, a.starts_on, current_date)
    where a.org_id = _org and a.template_id = _template and a.ended_on is null
      and a.planned_end is distinct from public.seat_planned_end(_org, _template, a.starts_on, current_date);
  get diagnostics _n = row_count;
  perform public.write_audit(_org, 'recalculate', 'appointments', _template::text, null,
    jsonb_build_object('updated', _n));
  return _n;
end $$;

-- ----- appointing and ending (governance.manage) -----
create or replace function public.appoint_officer(_org uuid, _template uuid, _profile uuid,
  _starts_on date default current_date, _seat_number int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _t public.seat_templates; _p public.org_member_profiles;
  _seat int; _ra uuid; _id uuid; _m public.memberships; _role public.roles;
begin
  if _uid is null or not public.has_permission(_uid, 'governance.manage', _org) then raise exception 'not allowed'; end if;
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or not _t.active or not public.seat_applies_at(_t, _org) then raise exception 'that seat isn''t used here'; end if;
  select * into _p from public.org_member_profiles where id = _profile and org_id = _org;
  if _p.id is null then raise exception 'person is not a member of this organization'; end if;
  if coalesce((public.effective_setting(_org, 'governance.officers_good_standing') #>> '{}')::boolean, true) then
    select * into _m from public.memberships where profile_id = _profile and org_id = _org;
    if _m.id is null or public.membership_standing(_m.status, _m.paid_through, _m.lifetime,
         public.grace_days(_org), coalesce(_starts_on, current_date)) <> 'good' then
      raise exception 'officers must be members in good standing';
    end if;
  end if;
  if exists (select 1 from public.appointments where org_id = _org and template_id = _template
             and profile_id = _profile and ended_on is null) then
    raise exception 'this person already holds that seat';
  end if;
  -- a free seat: the one asked for, else the lowest free number
  perform 1 from public.seat_templates where id = _template for update;
  select n into _seat from generate_series(1, _t.seat_count) n
    where (_seat_number is null or n = _seat_number)
      and not exists (select 1 from public.appointments a where a.org_id = _org and a.template_id = _template
                      and a.seat_number = n and a.ended_on is null)
    order by n limit 1;
  if _seat is null then raise exception 'all seats are filled'; end if;
  -- the linked role (no escalation; only people with a login can hold a role)
  if _t.role_id is not null and _p.user_id is not null then
    select * into _role from public.roles where id = _t.role_id;
    if not _role.active then raise exception 'the seat''s role is retired'; end if;
    if not public.holds_all_role_permissions(_uid, _t.role_id, _org) then
      raise exception 'you can only grant permissions you hold';
    end if;
    insert into public.role_assignments (user_id, role_id, org_id, source) values (_p.user_id, _t.role_id, _org, 'seat')
      on conflict (user_id, role_id, org_id) do nothing returning id into _ra;
  end if;
  insert into public.appointments (org_id, template_id, profile_id, seat_number, starts_on, planned_end,
      role_assignment_id, appointed_by)
    values (_org, _template, _profile, _seat, coalesce(_starts_on, current_date),
      public.seat_planned_end(_org, _template, coalesce(_starts_on, current_date), coalesce(_starts_on, current_date)),
      _ra, _uid)
    returning id into _id;
  return _id;
end $$;

-- Takes away only the role assignment this appointment created. If the person holds another
-- seat with the same role, that seat keeps the role.
create or replace function public.end_appointment(_appointment uuid, _reason text default '',
  _ended_on date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare _a public.appointments; _role uuid; _other uuid; _key text; _parent uuid; _admins int;
begin
  select * into _a from public.appointments where id = _appointment;
  if _a.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'governance.manage', _a.org_id) then
    raise exception 'not allowed';
  end if;
  if _a.ended_on is not null then raise exception 'this appointment has already ended'; end if;
  if coalesce(_ended_on, current_date) < _a.starts_on then raise exception 'the end can''t be before the start'; end if;
  if _a.role_assignment_id is not null then
    select ra.role_id into _role from public.role_assignments ra where ra.id = _a.role_assignment_id;
    select a.id into _other from public.appointments a join public.seat_templates t on t.id = a.template_id
      where a.org_id = _a.org_id and a.profile_id = _a.profile_id and a.id <> _a.id and a.ended_on is null
        and t.role_id = _role and a.role_assignment_id is null
      limit 1;
    if _other is null then
      select r.key into _key from public.roles r where r.id = _role;
      select parent_id into _parent from public.organizations where id = _a.org_id;
      if _key = 'org_admin' and _parent is null then
        select count(*) into _admins from public.role_assignments ra join public.roles r on r.id = ra.role_id
          where ra.org_id = _a.org_id and r.key = 'org_admin';
        if _admins <= 1 then raise exception 'an organization must keep at least one admin'; end if;
      end if;
    end if;
  end if;
  update public.appointments set ended_on = coalesce(_ended_on, current_date), end_reason = coalesce(trim(_reason), ''),
    ended_by = auth.uid(), role_assignment_id = null
    where id = _appointment;
  if _a.role_assignment_id is not null then
    if _other is not null then
      update public.appointments set role_assignment_id = _a.role_assignment_id where id = _other;
    else
      delete from public.role_assignments where id = _a.role_assignment_id;
    end if;
  end if;
end $$;

-- ----- reading the board -----
-- Seats that apply at an org with their title, the term in force today and current holders.
create or replace function public.org_board(_org uuid)
returns table (template_id uuid, owner_org_id uuid, key text, title text, default_title text,
  description text, required boolean, seat_count int, scope public.seat_scope, role_id uuid,
  term_count int, term_unit public.term_unit, term_source text, term_since date, bylaw_reference text,
  holders jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_org_member(auth.uid(), _org) or public.can_see_org_tree(auth.uid(), _org)) then
    raise exception 'not allowed';
  end if;
  return query
    select t.id, t.org_id, t.key, coalesce(o.title, t.title), t.title, t.description, t.required, t.seat_count,
      t.scope, t.role_id, f.length_count, f.length_unit, f.source, st.effective_from, coalesce(st.bylaw_reference, ''),
      coalesce((select jsonb_agg(jsonb_build_object('appointment_id', a.id, 'profile_id', a.profile_id,
          'display_name', p.display_name, 'seat_number', a.seat_number, 'starts_on', a.starts_on,
          'planned_end', a.planned_end) order by a.seat_number)
        from public.appointments a join public.org_member_profiles p on p.id = a.profile_id
        where a.org_id = _org and a.template_id = t.id and a.ended_on is null), '[]'::jsonb)
    from public.seat_templates t
    left join public.seat_title_overrides o on o.org_id = _org and o.template_id = t.id
    cross join lateral public.seat_term_in_force(_org, t.id, current_date) f
    left join public.seat_terms st on st.id = f.term_id
    where t.active and public.seat_applies_at(t, _org)
    order by (t.org_id <> _org), t.sort_order, t.title;
end $$;

-- Past officers of an org, newest first.
create or replace function public.board_history(_org uuid)
returns table (appointment_id uuid, template_id uuid, display_name text, seat_number int, starts_on date,
  planned_end date, ended_on date, end_reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_org_member(auth.uid(), _org) or public.can_see_org_tree(auth.uid(), _org)) then
    raise exception 'not allowed';
  end if;
  return query
    select a.id, a.template_id, p.display_name, a.seat_number, a.starts_on, a.planned_end, a.ended_on, a.end_reason
    from public.appointments a join public.org_member_profiles p on p.id = a.profile_id
    where a.org_id = _org and a.ended_on is not null
    order by a.ended_on desc, a.starts_on desc;
end $$;

revoke execute on function public.seat_applies_at(public.seat_templates, uuid),
  public.seat_term_in_force(uuid, uuid, date), public.seat_planned_end(uuid, uuid, date, date),
  public.seat_template_check(uuid, int, public.term_unit, uuid, public.seat_scope)
  from public, anon, authenticated;
revoke execute on function
  public.define_seat(uuid, text, text, text, boolean, int, int, public.term_unit, uuid, public.seat_scope, int),
  public.update_seat(uuid, text, text, boolean, int, int, public.term_unit, uuid, int),
  public.set_seat_active(uuid, boolean), public.set_seat_title(uuid, uuid, text),
  public.set_seat_term(uuid, uuid, int, public.term_unit, date, text, text),
  public.recalculate_planned_ends(uuid, uuid), public.appoint_officer(uuid, uuid, uuid, date, int),
  public.end_appointment(uuid, text, date), public.org_board(uuid), public.board_history(uuid)
  from public, anon;
grant execute on function
  public.define_seat(uuid, text, text, text, boolean, int, int, public.term_unit, uuid, public.seat_scope, int),
  public.update_seat(uuid, text, text, boolean, int, int, public.term_unit, uuid, int),
  public.set_seat_active(uuid, boolean), public.set_seat_title(uuid, uuid, text),
  public.set_seat_term(uuid, uuid, int, public.term_unit, date, text, text),
  public.recalculate_planned_ends(uuid, uuid), public.appoint_officer(uuid, uuid, uuid, date, int),
  public.end_appointment(uuid, text, date), public.org_board(uuid), public.board_history(uuid)
  to authenticated;
