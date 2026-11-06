-- ===== E-13a Memberships, standing and admin-recorded payments (D-116, D-131..D-134) =====
-- A membership is a member profile's relationship with an org through one of the org's levels.
-- Standing (good / grace / lapsed) is derived on read from paid_through and the grace period
-- (D-111). Admins record joins, renewals and cash/check payments here; online payments come
-- with E-12/E-13b and reuse the same tables. Lovable conventions apply (D-125): full grants,
-- RLS with has_permission / is_org_member, no DROP. History and money are never deleted:
-- there are no DELETE policies, and events can't be changed at all.

insert into public.permissions (key, description) values
  ('payments.view', 'See payments'),
  ('payments.manage', 'Record and refund payments')
  on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
  select id, p from public.roles, unnest(array['payments.view', 'payments.manage']) p
  where key = 'org_admin' and org_id is null
  on conflict do nothing;

-- ----- Member records without a login (D-116) -----
-- New self-signups always have an account. Admins may add historical members with no email
-- or login; an invitation to the same email later links ("claims") the record.
alter table public.org_member_profiles alter column user_id drop not null;
alter table public.org_member_profiles
  add column source text not null default 'signup' check (source in ('signup', 'invite', 'admin', 'import')),
  add column claimed_at timestamptz;
alter table public.org_member_profiles add constraint org_member_profiles_login_or_record
  check (user_id is not null or source in ('admin', 'import'));
create index on public.org_member_profiles (org_id, lower(email));

-- ----- Types -----
create type public.membership_status as enum ('pending', 'active', 'cancelled', 'declined');
create type public.membership_event_kind as enum ('joined', 'renewed', 'approved', 'declined', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'refunded', 'failed');
create type public.payment_purpose as enum ('join', 'renew');
create type public.payment_gateway as enum ('manual', 'stripe', 'test');
create type public.payment_method as enum ('cash', 'check', 'card', 'bank_transfer', 'other');

-- ----- Memberships: one per member per org, kept current; history lives in events -----
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.org_member_profiles(id) on delete cascade,
  tier_id uuid not null references public.membership_tiers(id),
  term_id uuid not null references public.tier_terms(id),
  status public.membership_status not null,
  joined_on date,
  paid_through date,
  lifetime boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, profile_id),
  check (not lifetime or paid_through is null),
  check (status <> 'active' or joined_on is not null),
  check (status <> 'active' or lifetime or paid_through is not null)
);
create index on public.memberships (org_id, status);
grant select, insert, update, delete on public.memberships to authenticated;
grant all on public.memberships to service_role;
alter table public.memberships enable row level security;
comment on table public.memberships is
  'Current membership per member and org (E-13a). Written only by membership RPCs; no client write policies.';
create policy "members and managers read memberships" on public.memberships for select to authenticated
  using (public.has_permission(auth.uid(), 'members.view', org_id)
    or (public.is_org_member(auth.uid(), org_id) and exists (
      select 1 from public.org_member_profiles p where p.id = profile_id and p.user_id = auth.uid())));
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function public.audit_row_change();

-- ----- Payments: all money, whichever way it arrived -----
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid references public.memberships(id),
  profile_id uuid references public.org_member_profiles(id),
  payer_user_id uuid,
  purpose public.payment_purpose not null,
  amount_minor int not null check (amount_minor between 0 and 100000000),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status public.payment_status not null,
  gateway public.payment_gateway not null default 'manual',
  method public.payment_method,
  gateway_ref text,
  livemode boolean not null default true,
  received_on date,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.payments (org_id, created_at desc);
create index on public.payments (membership_id);
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
comment on table public.payments is
  'Payments received by an org (E-13a, E-12). Written only by definer functions; never deleted.';
create policy "payers and viewers read payments" on public.payments for select to authenticated
  using (public.has_permission(auth.uid(), 'payments.view', org_id)
    or (public.is_org_member(auth.uid(), org_id) and exists (
      select 1 from public.org_member_profiles p where p.id = profile_id and p.user_id = auth.uid())));
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.audit_row_change();

-- ----- Membership history: append-only -----
create table public.membership_events (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  kind public.membership_event_kind not null,
  tier_id uuid references public.membership_tiers(id),
  term_id uuid references public.tier_terms(id),
  period_start date,
  period_end date,
  payment_id uuid references public.payments(id),
  note text not null default '' check (char_length(note) <= 500),
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index on public.membership_events (membership_id, created_at);
grant select, insert, update, delete on public.membership_events to authenticated;
grant all on public.membership_events to service_role;
alter table public.membership_events enable row level security;
comment on table public.membership_events is
  'Append-only membership history (E-13a). Written only by membership RPCs; never changed or deleted.';
create policy "members and managers read membership events" on public.membership_events for select to authenticated
  using (public.has_permission(auth.uid(), 'members.view', org_id)
    or (public.is_org_member(auth.uid(), org_id) and exists (
      select 1 from public.memberships m join public.org_member_profiles p on p.id = m.profile_id
      where m.id = membership_id and p.user_id = auth.uid())));
-- History can't be edited or deleted directly. Rows only go away with their membership or org
-- (a cascade, which runs one trigger level deeper), e.g. when demo data is cleaned up.
create or replace function public.membership_events_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'membership history can''t be changed';
end $$;
create trigger membership_events_append_only before update or delete on public.membership_events
  for each row execute function public.membership_events_append_only();

-- ----- Date and standing rules (mirrored in src/modules/membership/standing.ts and tiers.ts) -----
-- Last day covered by a term starting on _start: the day before the same date one term later,
-- or that month's last day when the date doesn't exist there (Jan 31 + 1 month -> Feb 28/29).
create or replace function public.term_end(_start date, _count int, _unit public.term_unit)
returns date language plpgsql immutable set search_path = public as $$
declare _months int; _target date; _last int; _day int := extract(day from _start)::int;
begin
  if _count is null or _unit is null then return null; end if;
  if _unit = 'day' then return _start + (_count - 1); end if;
  _months := case when _unit = 'year' then _count * 12 else _count end;
  _target := (date_trunc('month', _start) + make_interval(months => _months))::date;
  _last := extract(day from (_target + interval '1 month' - interval '1 day'))::int;
  if _day > _last then return _target + (_last - 1); end if;
  return _target + (_day - 2);
end $$;

-- A setting as it applies at an org: a locked ancestor wins (root first), else the nearest org
-- (self first) with a value. Mirrors resolveSetting in src/engines/settings.
create or replace function public.effective_setting(_org uuid, _key text)
returns jsonb language sql stable security definer set search_path = public as $$
  with lin as (
    select a.id, array_position(o.ancestor_ids, a.id) as depth, false as self
    from public.organizations o join public.organizations a on a.id = any(o.ancestor_ids) where o.id = _org
    union all select _org, 1000000, true
  )
  select coalesce(
    (select s.value from lin join public.org_settings s on s.org_id = lin.id
       where s.key = _key and s.mode = 'locked' and not lin.self order by lin.depth asc limit 1),
    (select s.value from lin join public.org_settings s on s.org_id = lin.id
       where s.key = _key and s.mode <> 'inherit' order by lin.depth desc limit 1))
$$;

-- Grace period in days (registry default 30, see src/engines/settings).
create or replace function public.grace_days(_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((public.effective_setting(_org, 'membership.grace_days') #>> '{}')::int, 30)
$$;

-- good | grace | lapsed for active memberships; otherwise the status itself.
create or replace function public.membership_standing(_status public.membership_status, _paid_through date,
  _lifetime boolean, _grace int, _today date)
returns text language sql immutable set search_path = public as $$
  select case
    when _status <> 'active' then _status::text
    when _lifetime then 'good'
    when _today <= _paid_through then 'good'
    when _today <= _paid_through + _grace then 'grace'
    else 'lapsed' end
$$;

-- When a new term starts: the day after paid_through while in good standing or grace
-- (renewing early never loses paid days), otherwise the reference day (D-133).
create or replace function public.renewal_start(_status public.membership_status, _paid_through date,
  _lifetime boolean, _grace int, _today date)
returns date language sql immutable set search_path = public as $$
  select case
    when _status = 'active' and not _lifetime and _paid_through is not null
      and public.membership_standing(_status, _paid_through, _lifetime, _grace, _today) in ('good', 'grace')
      then _paid_through + 1
    else _today end
$$;

-- ----- RPCs (the only write path) -----
create or replace function public.admin_create_member(_org uuid, _display_name text, _email text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _id uuid; _mail text := lower(trim(coalesce(_email, '')));
begin
  if _uid is null or not public.has_permission(_uid, 'members.manage', _org) then raise exception 'not allowed'; end if;
  if char_length(trim(coalesce(_display_name, ''))) not between 1 and 120 then raise exception 'give the member a name'; end if;
  if _mail <> '' and _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if _mail <> '' and exists (select 1 from public.org_member_profiles where org_id = _org and lower(email) = _mail) then
    raise exception 'someone with that email is already a member';
  end if;
  insert into public.org_member_profiles (org_id, user_id, display_name, email, source)
    values (_org, null, trim(_display_name), _mail, 'admin') returning id into _id;
  return _id;
end $$;

-- Name and email of a record without a login (members edit their own profile themselves).
create or replace function public.update_member_record(_profile uuid, _display_name text, _email text)
returns void language plpgsql security definer set search_path = public as $$
declare _p public.org_member_profiles; _mail text := lower(trim(coalesce(_email, '')));
begin
  select * into _p from public.org_member_profiles where id = _profile;
  if _p.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'members.manage', _p.org_id) then
    raise exception 'not allowed'; end if;
  if _p.user_id is not null then raise exception 'this member manages their own name and email'; end if;
  if char_length(trim(coalesce(_display_name, ''))) not between 1 and 120 then raise exception 'give the member a name'; end if;
  if _mail <> '' and _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if _mail <> '' and exists (select 1 from public.org_member_profiles
      where org_id = _p.org_id and lower(email) = _mail and id <> _profile) then
    raise exception 'someone with that email is already a member';
  end if;
  update public.org_member_profiles set display_name = trim(_display_name), email = _mail where id = _profile;
end $$;

-- Record a join or renewal paid outside the app (cash, check, ...). An amount needs payments.manage.
-- _starts_on lets admins enter historical members; otherwise the stacking rule picks the start.
create or replace function public.record_membership(_profile uuid, _term uuid, _paid_on date default current_date,
  _amount_minor int default null, _method public.payment_method default null, _note text default '',
  _starts_on date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _p public.org_member_profiles; _t public.tier_terms; _tier public.membership_tiers;
  _m public.memberships; _start date; _end date; _pay uuid; _kind public.membership_event_kind; _grace int;
begin
  select * into _p from public.org_member_profiles where id = _profile;
  if _p.id is null or _uid is null or not public.has_permission(_uid, 'members.manage', _p.org_id) then
    raise exception 'not allowed'; end if;
  if _amount_minor is not null and not public.has_permission(_uid, 'payments.manage', _p.org_id) then
    raise exception 'not allowed to record payments'; end if;
  select * into _t from public.tier_terms where id = _term;
  select * into _tier from public.membership_tiers where id = _t.tier_id;
  -- Levels belong to the org that sells them; selling a parent's levels comes with E-18.
  if _t.id is null or _tier.org_id <> _p.org_id then raise exception 'that membership level isn''t offered here'; end if;
  if not (_t.active and _tier.active) then raise exception 'that membership level is retired'; end if;
  _paid_on := coalesce(_paid_on, current_date);
  _grace := public.grace_days(_p.org_id);
  select * into _m from public.memberships where org_id = _p.org_id and profile_id = _profile for update;
  if _m.id is not null and _m.status = 'pending' then raise exception 'approve or decline the application first'; end if;
  if _m.id is not null and _m.status = 'active' and _m.lifetime then raise exception 'already a lifetime member'; end if;
  -- A new or cancelled/declined member joins; an active one (even lapsed) renews.
  _kind := case when _m.id is null or _m.status <> 'active' then 'joined' else 'renewed' end;
  _start := coalesce(_starts_on,
    case when _m.id is null then _paid_on
         else public.renewal_start(_m.status, _m.paid_through, _m.lifetime, _grace, _paid_on) end);
  _end := public.term_end(_start, _t.length_count, _t.length_unit);
  if _m.id is null then
    insert into public.memberships (org_id, profile_id, tier_id, term_id, status, joined_on, paid_through, lifetime)
      values (_p.org_id, _profile, _tier.id, _t.id, 'active', _start, _end, _t.length_unit is null)
      returning * into _m;
  else
    update public.memberships set tier_id = _tier.id, term_id = _t.id, status = 'active',
      joined_on = case when _kind = 'joined' then _start else joined_on end,
      paid_through = _end, lifetime = _t.length_unit is null, updated_at = now()
      where id = _m.id returning * into _m;
  end if;
  if _amount_minor is not null then
    insert into public.payments (org_id, membership_id, profile_id, payer_user_id, purpose, amount_minor, currency,
        status, gateway, method, received_on, note, created_by)
      values (_p.org_id, _m.id, _profile, _p.user_id, case when _kind = 'joined' then 'join' else 'renew' end::public.payment_purpose,
        _amount_minor, _t.currency, 'paid', 'manual', coalesce(_method, 'other'), _paid_on, coalesce(_note, ''), _uid)
      returning id into _pay;
  end if;
  insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, period_start, period_end, payment_id, note, actor_id)
    values (_p.org_id, _m.id, _kind, _tier.id, _t.id, _start, _end, _pay, coalesce(_note, ''), _uid);
  return _m.id;
end $$;

-- Pending applications (created by online joining in E-13b) are approved or declined here.
-- An approved term starts on the approval day, so applicants don't lose time while waiting.
create or replace function public.approve_membership(_membership uuid, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare _m public.memberships; _t public.tier_terms; _end date;
begin
  select * into _m from public.memberships where id = _membership for update;
  if _m.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'members.manage', _m.org_id) then
    raise exception 'not allowed'; end if;
  if _m.status <> 'pending' then raise exception 'only pending applications can be approved'; end if;
  select * into _t from public.tier_terms where id = _m.term_id;
  _end := public.term_end(current_date, _t.length_count, _t.length_unit);
  update public.memberships set status = 'active', joined_on = current_date, paid_through = _end,
    lifetime = _t.length_unit is null, updated_at = now() where id = _membership;
  insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, period_start, period_end, note, actor_id)
    values (_m.org_id, _m.id, 'approved', _m.tier_id, _m.term_id, current_date, _end, coalesce(_note, ''), auth.uid());
end $$;

create or replace function public.decline_membership(_membership uuid, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare _m public.memberships;
begin
  select * into _m from public.memberships where id = _membership for update;
  if _m.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'members.manage', _m.org_id) then
    raise exception 'not allowed'; end if;
  if _m.status <> 'pending' then raise exception 'only pending applications can be declined'; end if;
  update public.memberships set status = 'declined', updated_at = now() where id = _membership;
  insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, note, actor_id)
    values (_m.org_id, _m.id, 'declined', _m.tier_id, _m.term_id, coalesce(_note, ''), auth.uid());
end $$;

-- Ends a membership now. Paid-through stays as a record; recording a new membership rejoins.
create or replace function public.cancel_membership(_membership uuid, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare _m public.memberships;
begin
  select * into _m from public.memberships where id = _membership for update;
  if _m.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'members.manage', _m.org_id) then
    raise exception 'not allowed'; end if;
  if _m.status <> 'active' then raise exception 'only active memberships can be cancelled'; end if;
  update public.memberships set status = 'cancelled', updated_at = now() where id = _membership;
  insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, note, actor_id)
    values (_m.org_id, _m.id, 'cancelled', _m.tier_id, _m.term_id, coalesce(_note, ''), auth.uid());
end $$;

-- Accepting an invitation claims an admin-created record with the same email (D-116) instead
-- of creating a second profile. Otherwise unchanged from 0001.
create or replace function public.accept_invitation(_token text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare _uid uuid := auth.uid(); _inv public.invitations; _email text; _record uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _inv from public.invitations
    where token_hash = encode(digest(_token, 'sha256'), 'hex') for update;
  if _inv.id is null or _inv.accepted_at is not null or _inv.revoked_at is not null or _inv.expires_at <= now() then
    raise exception 'invitation is not valid';
  end if;
  select lower(email) into _email from auth.users where id = _uid;
  if _email is distinct from _inv.email then raise exception 'invitation is for a different email address'; end if;
  if not exists (select 1 from public.org_member_profiles where org_id = _inv.org_id and user_id = _uid) then
    select id into _record from public.org_member_profiles
      where org_id = _inv.org_id and user_id is null and lower(email) = _email
      order by created_at limit 1 for update;
    if _record is not null then
      update public.org_member_profiles set user_id = _uid, claimed_at = now() where id = _record;
    else
      insert into public.org_member_profiles (org_id, user_id, email, source) values (_inv.org_id, _uid, _email, 'invite');
    end if;
  end if;
  insert into public.role_assignments (user_id, role_id, org_id, source) values (_uid, _inv.role_id, _inv.org_id, 'invitation')
    on conflict do nothing;
  update public.invitations set accepted_at = now(), accepted_by = _uid where id = _inv.id;
  return _inv.org_id;
end $$;

revoke execute on function public.admin_create_member(uuid, text, text), public.update_member_record(uuid, text, text),
  public.record_membership(uuid, uuid, date, int, public.payment_method, text, date),
  public.approve_membership(uuid, text), public.decline_membership(uuid, text), public.cancel_membership(uuid, text),
  public.effective_setting(uuid, text), public.grace_days(uuid) from public, anon;
grant execute on function public.admin_create_member(uuid, text, text), public.update_member_record(uuid, text, text),
  public.record_membership(uuid, uuid, date, int, public.payment_method, text, date),
  public.approve_membership(uuid, text), public.decline_membership(uuid, text), public.cancel_membership(uuid, text),
  public.grace_days(uuid) to authenticated;
revoke execute on function public.effective_setting(uuid, text) from authenticated;
