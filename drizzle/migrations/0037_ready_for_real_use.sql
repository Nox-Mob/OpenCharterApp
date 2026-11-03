-- Sprint 4, "ready for real use" (docs/plans/wave-a-mvp.md §8). Tests: db/tests/9P_ready_for_real_use.sql.
--   U7 (D-195): has_permission / is_org_member are no longer callable without signing in.
--   U2 (D-190): "Remove from roster" and "Restore"; is_org_member now ignores records that left
--               (a removed person, or a member who moved to another home chapter, is no longer a member).
--   U3 (D-191): a readable audit log: audit_log() returns each event with who did it and names for
--               the records it points at; events now carry the transaction they belong to (tx_id), so
--               one save shows as one entry. Setup drafts are left out.
--   U1 (D-189): import_members() checks (and, when asked, applies) a file of members in one transaction.
-- Function bodies replaced here are copied in full from their latest versions.

-- ----- U2 + U7: membership check -----
create or replace function public.is_org_member(_user uuid, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_member_profiles
    where user_id = _user and org_id = _org and left_at is null)
$$;

revoke execute on function public.has_permission(uuid, text, uuid), public.is_org_member(uuid, uuid)
  from public, anon;
grant execute on function public.has_permission(uuid, text, uuid), public.is_org_member(uuid, uuid)
  to authenticated, service_role;

-- ----- U2: remove from roster / restore -----
create or replace function public.remove_member_record(_profile uuid, _reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _p public.org_member_profiles; _m public.memberships; _cp public.org_member_profiles;
begin
  select * into _p from public.org_member_profiles where id = _profile for update;
  if _p.id is null or _uid is null or not public.has_permission(_uid, 'members.manage', _p.org_id) then
    raise exception 'not allowed'; end if;
  if _p.left_at is not null then raise exception 'already removed from the roster'; end if;
  if _p.home_of is not null then
    raise exception 'members choose their own chapter; move them from the national''s Members page';
  end if;
  if _p.user_id is not null and _p.user_id = _uid then raise exception 'you can''t remove yourself'; end if;
  if _p.user_id is not null and exists (select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id
      where ra.user_id = _p.user_id and ra.org_id = _p.org_id and ra.source <> 'seat'
        and not (r.key = 'member' and r.org_id is null)) then
    raise exception 'they hold a role here; remove it on Settings → Roles first';
  end if;
  if char_length(coalesce(_reason, '')) > 300 then raise exception 'keep the reason under 300 characters'; end if;

  -- Their membership here ends (a pending application is declined); the history stays.
  select * into _m from public.memberships where org_id = _p.org_id and profile_id = _p.id for update;
  if _m.id is not null and _m.status in ('active', 'pending') then
    update public.memberships set status = case when _m.status = 'pending' then 'declined' else 'cancelled' end::public.membership_status,
      updated_at = now() where id = _m.id;
    insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, note, actor_id)
      values (_m.org_id, _m.id, case when _m.status = 'pending' then 'declined' else 'cancelled' end::public.membership_event_kind,
        _m.tier_id, _m.term_id, trim('Removed from the roster. ' || coalesce(_reason, '')), _uid);
  end if;

  -- This record, and in the home-chapter model the chapter record that stands for it: seats end
  -- (removing only the roles those seats gave) and the record leaves.
  for _cp in select * from public.org_member_profiles
      where left_at is null and (id = _p.id or (_m.id is not null and home_of = _m.id)) loop
    delete from public.role_assignments where id in (select a.role_assignment_id from public.appointments a
      where a.profile_id = _cp.id and a.ended_on is null and a.role_assignment_id is not null);
    update public.appointments set ended_on = greatest(current_date, starts_on), end_reason = 'removed from roster',
        ended_by = _uid
      where profile_id = _cp.id and ended_on is null;
    update public.org_member_profiles set left_at = now() where id = _cp.id;
  end loop;
  if _m.id is not null and _m.home_org_id is not null then
    insert into public.affiliation_history (org_id, membership_id, from_org_id, to_org_id, changed_by)
      values (_m.org_id, _m.id, _m.home_org_id, null, _uid);
    update public.memberships set home_org_id = null where id = _m.id;
  end if;
  if _p.user_id is not null then
    delete from public.role_assignments ra using public.roles r
      where r.id = ra.role_id and r.key = 'member' and r.org_id is null
        and ra.user_id = _p.user_id and ra.org_id = _p.org_id;
  end if;
  perform public.write_audit(_p.org_id, 'remove', 'org_member_profiles', _p.id::text, null,
    jsonb_build_object('display_name', _p.display_name, 'email', _p.email, 'reason', coalesce(_reason, '')));
end $$;

create or replace function public.restore_member_record(_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _p public.org_member_profiles;
begin
  select * into _p from public.org_member_profiles where id = _profile for update;
  if _p.id is null or _uid is null or not public.has_permission(_uid, 'members.manage', _p.org_id) then
    raise exception 'not allowed'; end if;
  if _p.left_at is null then raise exception 'they''re on the roster'; end if;
  if _p.home_of is not null then
    raise exception 'members choose their own chapter; move them from the national''s Members page';
  end if;
  if exists (select 1 from public.org_member_profiles where org_id = _p.org_id and id <> _p.id and left_at is null
      and ((_p.user_id is not null and user_id = _p.user_id)
        or (_p.email <> '' and lower(email) = lower(_p.email)))) then
    raise exception 'someone with that login or email is already on the roster';
  end if;
  update public.org_member_profiles set left_at = null where id = _p.id;
  if _p.user_id is not null then
    insert into public.role_assignments (user_id, role_id, org_id, source)
      select _p.user_id, r.id, _p.org_id, 'manual' from public.roles r where r.key = 'member' and r.org_id is null
      on conflict do nothing;
  end if;
  perform public.write_audit(_p.org_id, 'restore', 'org_member_profiles', _p.id::text, null,
    jsonb_build_object('display_name', _p.display_name, 'email', _p.email));
end $$;

revoke execute on function public.remove_member_record(uuid, text), public.restore_member_record(uuid) from public, anon;
grant execute on function public.remove_member_record(uuid, text), public.restore_member_record(uuid) to authenticated;

-- ----- U3: readable audit log -----
-- Existing events keep tx_id null (shown one by one); new ones get their transaction's id.
alter table public.audit_events add column tx_id bigint;
alter table public.audit_events alter column tx_id set default txid_current();

create or replace function public.audit_log(_org uuid, _before bigint default null, _limit int default 200)
returns table (id bigint, created_at timestamptz, tx_id bigint, actor_id uuid, actor_name text,
  action text, target_type text, target_id text, before jsonb, after jsonb, refs jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'audit.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    select e.id, e.created_at, e.tx_id, e.actor_id,
      -- who: their name here, else their name anywhere, else their sign-in email
      case when e.actor_id is null then null else coalesce(
        (select nullif(trim(p.display_name), '') from public.org_member_profiles p
          where p.user_id = e.actor_id and p.org_id = _org limit 1),
        (select nullif(trim(p.display_name), '') from public.org_member_profiles p
          where p.user_id = e.actor_id and nullif(trim(p.display_name), '') is not null order by p.created_at limit 1),
        (select u.email::text from auth.users u where u.id = e.actor_id),
        'Someone') end,
      e.action, e.target_type, e.target_id,
      e.before - 'token_hash', e.after - 'token_hash',
      -- names for the records an event points at (null when they no longer exist)
      jsonb_strip_nulls(jsonb_build_object(
        'template_id', (select t.title from public.seat_templates t
          where t.id::text = coalesce(e.after, e.before)->>'template_id'),
        'profile_id', (select coalesce(nullif(trim(p.display_name), ''), p.email) from public.org_member_profiles p
          where p.id::text = coalesce(e.after, e.before)->>'profile_id'),
        'role_id', (select r.name from public.roles r where r.id::text = coalesce(e.after, e.before)->>'role_id'),
        'tier_id', (select t.name from public.membership_tiers t where t.id::text = coalesce(e.after, e.before)->>'tier_id'),
        'term_id', (select t.label from public.tier_terms t where t.id::text = coalesce(e.after, e.before)->>'term_id'),
        'definition_id', (select d.label from public.attribute_definitions d
          where d.id::text = coalesce(e.after, e.before)->>'definition_id'),
        'membership_id', (select coalesce(nullif(trim(p.display_name), ''), p.email) from public.memberships m
          join public.org_member_profiles p on p.id = m.profile_id
          where m.id::text = coalesce(e.after, e.before)->>'membership_id'),
        'user_id', (select coalesce((select nullif(trim(p.display_name), '') from public.org_member_profiles p
            where p.user_id = u.id and nullif(trim(p.display_name), '') is not null order by p.created_at limit 1), u.email::text)
          from auth.users u where u.id::text = coalesce(e.after, e.before)->>'user_id'),
        'entity_id', (select coalesce(nullif(trim(p.display_name), ''), p.email) from public.org_member_profiles p
          where p.id::text = coalesce(e.after, e.before)->>'entity_id'),
        'from_org_id', (select o.name from public.organizations o where o.id::text = coalesce(e.after, e.before)->>'from_org_id'),
        'to_org_id', (select o.name from public.organizations o where o.id::text = coalesce(e.after, e.before)->>'to_org_id'),
        'home_org_id', (select o.name from public.organizations o where o.id::text = coalesce(e.after, e.before)->>'home_org_id'),
        'source_tier_id', (select t.name from public.membership_tiers t
          where t.id::text = coalesce(e.after, e.before)->>'source_tier_id')
      ))
    from public.audit_events e
    where e.org_id = _org
      and (_before is null or e.id < _before)
      -- setup drafts are noise; applying a setup is kept
      and not (e.target_type = 'setup_states' and not (
        coalesce(e.after->>'status', '') = 'applied'
        and (e.before is null or e.before->>'applied_at' is distinct from e.after->>'applied_at')))
    order by e.id desc
    limit greatest(1, least(coalesce(_limit, 200), 500));
end $$;
revoke execute on function public.audit_log(uuid, bigint, int) from public, anon;
grant execute on function public.audit_log(uuid, bigint, int) to authenticated;

-- ----- U1: member import -----
-- _rows: [{row, name, email, level, term, joined_on, paid_through, chapter, fields: {<definition id>: value}}].
-- Checks every row; applies only when _apply and no row has an error. Matches existing records by
-- email (else, for rows without one, by name among records without an email), so running the same
-- file again updates instead of duplicating. A membership is set as of the file (no payment is
-- invented); in the home-chapter model the national imports and may name each member's chapter.
create or replace function public.import_members(_org uuid, _rows jsonb, _apply boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _o public.organizations; _home boolean; _r jsonb; _n int := 0;
  _errors jsonb := '[]'::jsonb; _plan jsonb := '[]'::jsonb; _err text; _row int;
  _name text; _mail text; _p public.org_member_profiles; _tier public.membership_tiers; _term public.tier_terms;
  _joined date; _through date; _chapter uuid; _d public.attribute_definitions; _k text; _v jsonb;
  _seen text[] := '{}'; _key text; _m public.memberships; _created int := 0; _updated int := 0; _x jsonb;
  _pid uuid; _mid uuid; _kind public.membership_event_kind;
begin
  if _uid is null or not public.has_permission(_uid, 'members.manage', _org) then raise exception 'not allowed'; end if;
  select * into _o from public.organizations where id = _org;
  if jsonb_typeof(_rows) <> 'array' then raise exception 'rows must be a list'; end if;
  if jsonb_array_length(_rows) > 1000 then raise exception 'import at most 1000 rows at a time'; end if;
  _home := public.membership_model(_org) = 'home_chapter';
  if _home and _o.parent_id is not null then
    raise exception 'members belong to the national organization; import them there';
  end if;

  -- pass 1: check every row and work out what it would do
  for _r in select * from jsonb_array_elements(_rows) loop
    _n := _n + 1;
    _row := coalesce((_r->>'row')::int, _n);
    _err := null; _p := null; _tier := null; _term := null; _joined := null; _through := null; _chapter := null;
    _name := trim(coalesce(_r->>'name', ''));
    _mail := lower(trim(coalesce(_r->>'email', '')));
    begin
      if _mail <> '' and _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the email "%" isn''t valid', _mail; end if;
      if char_length(_name) > 120 then raise exception 'the name is longer than 120 characters'; end if;
      _key := case when _mail <> '' then 'e:' || _mail else 'n:' || lower(_name) end;
      if _key = 'n:' then raise exception 'give each member a name or an email'; end if;
      if _key = any(_seen) then raise exception 'this member is already in the file'; end if;
      _seen := _seen || _key;
      if _mail <> '' then
        select * into _p from public.org_member_profiles where org_id = _org and lower(email) = _mail and left_at is null limit 1;
      else
        select * into _p from public.org_member_profiles where org_id = _org and email = '' and left_at is null
          and lower(trim(display_name)) = lower(_name) limit 1;
      end if;
      if _p.id is null and _name = '' then raise exception 'a new member needs a name'; end if;
      if coalesce(_r->>'level', '') <> '' or coalesce(_r->>'term', '') <> '' then
        select * into _tier from public.membership_tiers t where t.org_id = _org and t.active
          and (lower(t.name) = lower(trim(_r->>'level')) or t.key = lower(trim(_r->>'level'))) limit 1;
        if _tier.id is null then raise exception 'there''s no active level called "%"', _r->>'level'; end if;
        select * into _term from public.tier_terms x where x.tier_id = _tier.id and x.active
          and (coalesce(_r->>'term', '') = '' or lower(x.label) = lower(trim(_r->>'term')) or x.key = lower(trim(_r->>'term')))
          order by x.sort_order limit 2;
        if _term.id is null then raise exception '% has no active term called "%"', _tier.name, _r->>'term'; end if;
        if coalesce(_r->>'term', '') = '' and (select count(*) from public.tier_terms x where x.tier_id = _tier.id and x.active) > 1 then
          raise exception 'say which term of % (it has more than one)', _tier.name;
        end if;
        if trim(coalesce(_r->>'joined_on', '')) !~ '^(\d{4}-\d{2}-\d{2})?$'
           or trim(coalesce(_r->>'paid_through', '')) !~ '^(\d{4}-\d{2}-\d{2})?$' then
          raise exception 'write dates as YYYY-MM-DD';
        end if;
        begin
          _joined := nullif(trim(coalesce(_r->>'joined_on', '')), '')::date;
          _through := nullif(trim(coalesce(_r->>'paid_through', '')), '')::date;
        exception when others then raise exception 'write dates as YYYY-MM-DD';
        end;
        _joined := coalesce(_joined, current_date);
        if _term.length_unit is not null and _through is null then raise exception 'a % membership needs a paid-through date', _term.label; end if;
        if _through is not null and _through < _joined then raise exception 'paid through is before the join date'; end if;
        if _p.id is not null and exists (select 1 from public.memberships where org_id = _org and profile_id = _p.id and status = 'pending') then
          raise exception 'their application is waiting: approve or decline it first';
        end if;
      elsif coalesce(_r->>'joined_on', '') <> '' or coalesce(_r->>'paid_through', '') <> '' then
        raise exception 'dates need a membership level';
      end if;
      if coalesce(_r->>'chapter', '') <> '' then
        if not _home then raise exception 'chapters are only imported in the home-chapter model'; end if;
        select c.id into _chapter from public.organizations c where c.type = 'chapter' and _org = any(c.ancestor_ids)
          and (lower(c.name) = lower(trim(_r->>'chapter')) or c.slug = lower(trim(_r->>'chapter'))) limit 1;
        if _chapter is null then raise exception 'there''s no chapter called "%"', _r->>'chapter'; end if;
        if _tier.id is null and not exists (select 1 from public.memberships where org_id = _org and profile_id = _p.id
            and status = 'active') then
          raise exception 'a chapter needs a membership level';
        end if;
      end if;
      if jsonb_typeof(_r->'fields') = 'object' then
        for _k, _v in select * from jsonb_each(_r->'fields') loop
          select * into _d from public.attribute_definitions where id::text = _k and active and applies_to = 'member'
            and (org_id = _org or org_id = any(_o.ancestor_ids));
          if _d.id is null then raise exception 'unknown member field'; end if;
          if _v is not null and _v <> 'null'::jsonb and _v <> '""'::jsonb then
            begin
              perform public.validate_attribute_value(_d, _v);
            exception when others then raise exception '%', sqlerrm;
            end;
          end if;
        end loop;
      end if;
    exception when others then
      _err := sqlerrm;
    end;
    if _err is not null then
      _errors := _errors || jsonb_build_object('row', _row, 'message', _err);
    else
      _plan := _plan || jsonb_build_object('row', _row, 'action', case when _p.id is null then 'create' else 'update' end,
        'profile', _p.id, 'name', _name, 'email', _mail, 'term', _term.id, 'joined', _joined, 'through', _through,
        'chapter', _chapter, 'fields', coalesce(_r->'fields', '{}'::jsonb));
      if _p.id is null then _created := _created + 1; else _updated := _updated + 1; end if;
    end if;
  end loop;

  if not _apply or jsonb_array_length(_errors) > 0 then
    return jsonb_build_object('rows', _n, 'create', _created, 'update', _updated, 'errors', _errors, 'applied', false);
  end if;

  -- pass 2: apply (all or nothing: this whole call is one transaction)
  for _x in select * from jsonb_array_elements(_plan) loop
    _pid := nullif(_x->>'profile', '')::uuid;
    if _pid is null then
      insert into public.org_member_profiles (org_id, user_id, display_name, email, source)
        values (_org, null, _x->>'name', _x->>'email', 'import') returning id into _pid;
    else
      select * into _p from public.org_member_profiles where id = _pid;
      if _p.user_id is null and (_x->>'name') <> '' and (_x->>'name') <> _p.display_name then
        update public.org_member_profiles set display_name = _x->>'name' where id = _pid;
      end if;
    end if;
    for _k, _v in select * from jsonb_each(_x->'fields') loop
      if _v is not null and _v <> 'null'::jsonb and _v <> '""'::jsonb then
        perform public.set_attribute_value(_k::uuid, _pid, _v);
      end if;
    end loop;
    if nullif(_x->>'term', '') is not null then
      select * into _term from public.tier_terms where id = (_x->>'term')::uuid;
      select * into _m from public.memberships where org_id = _org and profile_id = _pid for update;
      _kind := case when _m.id is null or _m.status <> 'active' then 'joined' else 'renewed' end;
      _joined := (_x->>'joined')::date;
      _through := case when _term.length_unit is null then null else (_x->>'through')::date end;
      if _m.id is null then
        insert into public.memberships (org_id, profile_id, tier_id, term_id, status, joined_on, paid_through, lifetime)
          values (_org, _pid, _term.tier_id, _term.id, 'active', _joined, _through, _term.length_unit is null)
          returning id into _mid;
      else
        update public.memberships set tier_id = _term.tier_id, term_id = _term.id, status = 'active',
          joined_on = _joined, paid_through = _through, lifetime = _term.length_unit is null, updated_at = now()
          where id = _m.id;
        _mid := _m.id;
      end if;
      insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, period_start, period_end, note, actor_id)
        values (_org, _mid, _kind, _term.tier_id, _term.id, _joined, _through, 'Imported from a file', _uid);
    end if;
    if nullif(_x->>'chapter', '') is not null then
      select id into _mid from public.memberships where org_id = _org and profile_id = _pid;
      perform public.move_home_chapter(_mid, (_x->>'chapter')::uuid);
    end if;
  end loop;
  perform public.write_audit(_org, 'import', 'members', null, null,
    jsonb_build_object('rows', _n, 'created', _created, 'updated', _updated));
  return jsonb_build_object('rows', _n, 'create', _created, 'update', _updated, 'errors', _errors, 'applied', true);
end $$;
revoke execute on function public.import_members(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_members(uuid, jsonb, boolean) to authenticated;
