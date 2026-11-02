-- ===== E-18 Two-level dues: one flow, two payments (D-042, D-055, D-146) =====
-- A national decides, for the orgs below it:
-- - membership.chapter_dues: none (chapters charge no dues of their own; they use the national's
--   levels), optional (chapters may add levels, priced within membership.chapter_dues_min_minor /
--   _max_minor when set; 0 = no limit), or required (chapters should offer at least one level; shown as a
--   to-do, since a new chapter starts without levels)
-- - membership.national_dues_required: joining a chapter also needs a current membership of the
--   national. The member pays the national first, then the chapter: two payments, two receipts,
--   each to its own tax entity (D-042). A chapter membership paid while the national one is
--   still pending waits for approval, and can't be approved until the national one is active.
-- Rules resolve from ancestors only, so a chapter can't decide them itself. Additive (D-125).

-- The top of an org's tree (its national, or itself when it has no parent).
create or replace function public.national_org(_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(ancestor_ids[1], id) from public.organizations where id = _org
$$;

create or replace function public.national_dues_required(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations where id = _org and parent_id is not null)
    and coalesce((public.ancestor_setting(_org, 'membership.national_dues_required') #>> '{}')::boolean, false)
$$;

-- A person's national membership as seen from _org: current (good standing or grace), pending
-- (paid, waiting for approval), or none.
create or replace function public.national_membership_state(_user uuid, _org uuid)
returns text language sql stable security definer set search_path = public as $$
  with n as (select public.national_org(_org) as id)
  select coalesce((
    select case
      when public.membership_standing(m.status, m.paid_through, m.lifetime, public.grace_days(n.id), current_date)
        in ('good', 'grace') then 'current'
      when m.status = 'pending' then 'pending'
      else 'none' end
    from n join public.org_member_profiles p on p.org_id = n.id and p.user_id = _user
    join public.memberships m on m.profile_id = p.id and m.org_id = n.id), 'none')
$$;

-- What joining _org needs from the signed-in person (the join page's two steps).
create or replace function public.join_requirements(_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _n public.organizations;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into _n from public.organizations where id = public.national_org(_org);
  return jsonb_build_object(
    'national_required', public.national_dues_required(_org),
    'national', jsonb_build_object('id', _n.id, 'name', _n.name, 'slug', _n.slug),
    'national_state', public.national_membership_state(auth.uid(), _org));
end $$;

-- Chapter prices stay within the national's range (when it sets one).
create or replace function public.chapter_dues_range_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare _min int; _max int;
begin
  if not new.active or not exists (select 1 from public.organizations where id = new.org_id and parent_id is not null) then
    return new;
  end if;
  -- 0 or unset = no limit
  _min := nullif((public.ancestor_setting(new.org_id, 'membership.chapter_dues_min_minor') #>> '{}')::int, 0);
  _max := nullif((public.ancestor_setting(new.org_id, 'membership.chapter_dues_max_minor') #>> '{}')::int, 0);
  if (_min is not null and new.price_minor < _min) or (_max is not null and new.price_minor > _max) then
    raise exception 'chapter dues must be between % and % (set by your national)',
      coalesce(to_char(_min / 100.0, 'FM999999990.00'), '0.00'), coalesce(to_char(_max / 100.0, 'FM999999990.00'), 'any amount');
  end if;
  return new;
end $$;
create trigger tier_terms_dues_range before insert or update of price_minor, active on public.tier_terms
  for each row execute function public.chapter_dues_range_check();

-- "No chapter dues" also stops chapters from creating levels (alongside child_levels_allowed, 0006).
create or replace function public.tier_parent_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active)
     and (public.ancestor_setting(new.org_id, 'membership.child_levels_allowed') = 'false'::jsonb
       or public.ancestor_setting(new.org_id, 'membership.chapter_dues') #>> '{}' = 'none') then
    raise exception 'your parent organization manages membership levels';
  end if;
  return new;
end $$;

-- ----- joining with two-level dues (0010 functions, changes marked) -----
create or replace function public.public_join_info(_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _o public.organizations; _parent public.organizations; _managed boolean; _conn public.gateway_connections;
  _national public.organizations;
begin
  select * into _o from public.organizations where slug = lower(trim(_slug)) and type <> 'platform';
  if _o.id is null then return null; end if;
  _managed := coalesce((public.ancestor_setting(_o.id, 'membership.child_levels_allowed') #>> '{}')::boolean, true) = false
    or public.ancestor_setting(_o.id, 'membership.chapter_dues') #>> '{}' = 'none';
  select * into _national from public.organizations where id = public.national_org(_o.id) and id <> _o.id;
  if _managed then select * into _parent from public.organizations where id = _o.parent_id; end if;
  select * into _conn from public.gateway_connections where org_id = _o.id and status = 'verified';
  return jsonb_build_object(
    'org', jsonb_build_object('id', _o.id, 'name', _o.name, 'slug', _o.slug, 'type', _o.type),
    'levels_managed_by_parent', _managed,
    'parent', case when _parent.id is null then null else jsonb_build_object('name', _parent.name, 'slug', _parent.slug) end,
    'payments_enabled', _conn.id is not null,
    'gateway', _conn.gateway,
    'livemode', coalesce(_conn.livemode, false),
    'approval_required', public.effective_approval_required(_o.id),
    -- Two-level dues (D-146): joining here also needs a current membership of the national.
    'national_dues', jsonb_build_object('required', public.national_dues_required(_o.id),
      'national', case when _national.id is null then null
        else jsonb_build_object('id', _national.id, 'name', _national.name, 'slug', _national.slug) end),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description,
          'terms', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label,
              'length_count', x.length_count, 'length_unit', x.length_unit, 'price_minor', x.price_minor,
              'currency', x.currency) order by x.sort_order), '[]'::jsonb)
            from public.tier_terms x where x.tier_id = t.id and x.active)) order by t.sort_order)
      from public.membership_tiers t where t.org_id = _o.id and t.active), '[]'::jsonb),
    -- Fields a new member answers: required ones and ones members may edit themselves.
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'help', d.help, 'data_type', d.data_type,
          'required', d.required,
          'options', (select coalesce(jsonb_agg(jsonb_build_object('value', op.value, 'label', op.label) order by op.sort_order), '[]'::jsonb)
            from public.attribute_options op where op.definition_id = d.id and op.active)) order by d.sort_order)
      from public.attribute_definitions d
      where d.applies_to = 'member' and d.active and (d.required or d.member_editable)
        and (d.org_id = _o.id or d.org_id = any(_o.ancestor_ids))), '[]'::jsonb)
  );
end $$;

create or replace function public.begin_join(_org uuid, _term uuid, _answers jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _t public.tier_terms; _tier public.membership_tiers; _conn public.gateway_connections;
  _p public.org_member_profiles; _m public.memberships; _id uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _t from public.tier_terms where id = _term;
  select * into _tier from public.membership_tiers where id = _t.tier_id;
  if _t.id is null or _tier.org_id <> _org or not (_t.active and _tier.active) then
    raise exception 'that membership level isn''t offered here'; end if;
  select * into _conn from public.gateway_connections where org_id = _org and status = 'verified';
  if _conn.id is null then raise exception 'online payments aren''t open yet'; end if;
  select * into _p from public.org_member_profiles where org_id = _org and user_id = _uid;
  if _p.id is not null then
    select * into _m from public.memberships where org_id = _org and profile_id = _p.id;
    if _m.status = 'pending' then raise exception 'your application is already waiting for approval'; end if;
    if _m.status = 'active' then raise exception 'you''re already a member; renew instead'; end if;
  end if;
  if public.national_dues_required(_org) and public.national_membership_state(_uid, _org) = 'none' then
    raise exception 'national membership required: join % first',
      (select name from public.organizations where id = public.national_org(_org));
  end if;
  perform public.validate_join_answers(_org, _answers);
  insert into public.payments (org_id, profile_id, payer_user_id, purpose, amount_minor, currency, status, gateway,
      livemode, term_id, join_answers, created_by)
    values (_org, _p.id, _uid, 'join', _t.price_minor, _t.currency, 'pending', _conn.gateway, _conn.livemode,
      _t.id, coalesce(_answers, '{}'::jsonb), _uid)
    returning id into _id;
  return _id;
end $$;

create or replace function public.payment_succeeded(_event_id text, _payment uuid, _gateway_ref text,
  _amount_minor int, _currency text, _livemode boolean)
returns text language plpgsql security definer set search_path = public as $$
declare _pay public.payments; _p public.org_member_profiles; _email text; _membership uuid; _pending boolean;
  _k text; _v jsonb; _d public.attribute_definitions;
begin
  select * into _pay from public.payments where id = _payment for update;
  if _pay.id is null then return 'unknown payment'; end if;
  if not public.claim_webhook_event(_pay.org_id, _pay.gateway, _event_id, 'payment.succeeded', _pay.id) then
    return 'duplicate';
  end if;
  if _pay.status not in ('pending', 'failed') then return 'already ' || _pay.status; end if;
  if _amount_minor <> _pay.amount_minor or upper(_currency) <> _pay.currency then
    update public.payments set status = 'failed', failure_reason = 'Amount didn''t match the price' where id = _pay.id;
    return 'amount mismatch';
  end if;
  update public.payments set status = 'paid', gateway_ref = _gateway_ref, livemode = _livemode,
    received_on = current_date, failure_reason = null where id = _pay.id;

  if _pay.purpose = 'join' then
    -- The member's profile: their existing one, an admin-created record with their email (D-134), or a new one.
    select * into _p from public.org_member_profiles where org_id = _pay.org_id and user_id = _pay.payer_user_id;
    if _p.id is null then
      select lower(email) into _email from auth.users where id = _pay.payer_user_id;
      select * into _p from public.org_member_profiles
        where org_id = _pay.org_id and user_id is null and lower(email) = _email order by created_at limit 1 for update;
      if _p.id is not null then
        update public.org_member_profiles set user_id = _pay.payer_user_id, claimed_at = now() where id = _p.id;
      else
        insert into public.org_member_profiles (org_id, user_id, email, source)
          values (_pay.org_id, _pay.payer_user_id, coalesce(_email, ''), 'signup') returning * into _p;
      end if;
    end if;
    -- The answers given on the join page (validated when joining started; re-checked here).
    for _k, _v in select * from jsonb_each(_pay.join_answers) loop
      select * into _d from public.attribute_definitions where id::text = _k and active;
      if _d.id is not null and _v is not null and _v <> 'null'::jsonb then
        begin
          perform public.validate_attribute_value(_d, _v);
          insert into public.attribute_values (org_id, definition_id, entity_id, value, updated_by)
            values (_pay.org_id, _d.id, _p.id, _v, _pay.payer_user_id)
            on conflict (definition_id, entity_id) do update set value = excluded.value, updated_at = now();
        exception when others then null; -- a field changed since; the member can fix it later
        end;
      end if;
    end loop;
    -- With two-level dues, the chapter membership waits until the national one is active (D-146).
    _pending := public.effective_approval_required(_pay.org_id)
      or (public.national_dues_required(_pay.org_id)
        and public.national_membership_state(_pay.payer_user_id, _pay.org_id) <> 'current');
  else
    select * into _p from public.org_member_profiles where id = _pay.profile_id;
    _pending := false;
  end if;
  _membership := public.grant_membership_term(_p.id, _pay.term_id, current_date, _pay.id, _pay.payer_user_id, _pending);
  update public.payments set profile_id = _p.id, membership_id = _membership where id = _pay.id;
  return case when _pending then 'pending approval' else 'active' end;
end $$;

-- Approving a chapter application also needs the national membership to be active (D-146).
create or replace function public.approve_membership(_membership uuid, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare _m public.memberships; _t public.tier_terms; _end date;
begin
  select * into _m from public.memberships where id = _membership for update;
  if _m.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'members.manage', _m.org_id) then
    raise exception 'not allowed'; end if;
  if _m.status <> 'pending' then raise exception 'only pending applications can be approved'; end if;
  if public.national_dues_required(_m.org_id) and public.national_membership_state(
       (select user_id from public.org_member_profiles where id = _m.profile_id), _m.org_id) <> 'current' then
    raise exception 'their national membership isn''t active yet';
  end if;
  select * into _t from public.tier_terms where id = _m.term_id;
  _end := public.term_end(current_date, _t.length_count, _t.length_unit);
  update public.memberships set status = 'active', joined_on = current_date, paid_through = _end,
    lifetime = _t.length_unit is null, updated_at = now() where id = _membership;
  insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, period_start, period_end, note, actor_id)
    values (_m.org_id, _m.id, 'approved', _m.tier_id, _m.term_id, current_date, _end, coalesce(_note, ''), auth.uid());
end $$;

revoke execute on function public.national_org(uuid), public.national_dues_required(uuid),
  public.national_membership_state(uuid, uuid), public.chapter_dues_range_check() from public, anon, authenticated;
revoke execute on function public.join_requirements(uuid) from public, anon;
grant execute on function public.join_requirements(uuid) to authenticated;
