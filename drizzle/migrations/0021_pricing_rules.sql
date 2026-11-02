-- ===== E-19 Rules engine: attribute-based pricing (D-052, D-064, D-147) =====
-- A term can have pricing rules: conditions on member attributes (all must hold, e.g. "Rank is
-- at least E-5") and an outcome (a fixed price or a percentage off). The first active matching
-- rule by sort order sets what the member pays; otherwise the term's own price applies. Rules
-- are evaluated here (term_price) for joining and renewing online, and in TypeScript
-- (src/engines/rules) for previews; both run the same cases. Rules are retired, never deleted.
-- Lovable conventions (D-125): org_id, full grants, RLS, no DROP; writes only via definer RPCs.

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  term_id uuid not null references public.tier_terms(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 80),
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  price_minor int check (price_minor between 0 and 100000000),
  discount_pct int check (discount_pct between 1 and 100),
  sort_order int not null default 0,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((price_minor is null) <> (discount_pct is null))
);
create index on public.pricing_rules (term_id, sort_order);
create index on public.pricing_rules (org_id);
grant select, insert, update, delete on public.pricing_rules to authenticated;
grant all on public.pricing_rules to service_role;
alter table public.pricing_rules enable row level security;
comment on table public.pricing_rules is
  'Attribute-based prices per term (E-19). Written only by save_pricing_rule / set_pricing_rule_active; retired, never deleted.';
create policy "tree members read pricing rules" on public.pricing_rules for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create trigger audit_pricing_rules after insert or update or delete on public.pricing_rules
  for each row execute function public.audit_row_change();

-- ----- evaluation -----
-- One condition against a member's values ({definition_id: value}). Mirrors conditionMatches.
create or replace function public.pricing_condition_matches(_c jsonb, _values jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare _d public.attribute_definitions; _v jsonb := _values -> (_c ->> 'attribute_id');
  _op text := _c ->> 'op'; _cv text := _c ->> 'value'; _a int; _b int;
begin
  select * into _d from public.attribute_definitions where id::text = _c ->> 'attribute_id';
  if _d.id is null or _v is null or _v in ('null'::jsonb, '""'::jsonb, '[]'::jsonb) then return false; end if;
  if jsonb_typeof(_v) = 'array' then
    if _op = 'is' then return _v ? _cv; end if;
    if _op = 'in' then
      return exists (select 1 from jsonb_array_elements_text(_v) x
        where x in (select jsonb_array_elements_text(coalesce(_c -> 'values', '[]'::jsonb))));
    end if;
    return false;
  end if;
  if _op = 'is' then
    if _d.data_type = 'number' then return (_v #>> '{}')::numeric = _cv::numeric; end if;
    return (_v #>> '{}') = _cv;
  elsif _op = 'in' then
    return (_v #>> '{}') in (select jsonb_array_elements_text(coalesce(_c -> 'values', '[]'::jsonb)));
  elsif _op in ('at_least', 'at_most') then
    if _d.data_type = 'ordered' then
      select sort_order into _a from public.attribute_options where definition_id = _d.id and value = _v #>> '{}';
      select sort_order into _b from public.attribute_options where definition_id = _d.id and value = _cv;
      if _a is null or _b is null then return false; end if;
      return case when _op = 'at_least' then _a >= _b else _a <= _b end;
    elsif _d.data_type = 'number' then
      return case when _op = 'at_least' then (_v #>> '{}')::numeric >= _cv::numeric
        else (_v #>> '{}')::numeric <= _cv::numeric end;
    elsif _d.data_type = 'date' then
      return case when _op = 'at_least' then (_v #>> '{}') >= _cv else (_v #>> '{}') <= _cv end;
    end if;
  end if;
  return false;
end $$;

-- What a member pays for a term: the first active matching rule (by sort order), else the price.
create or replace function public.term_price(_term uuid, _values jsonb)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when r.price_minor is not null then r.price_minor
      else round(t.price_minor * (100 - r.discount_pct) / 100.0)::int end
    from public.pricing_rules r
    where r.term_id = t.id and r.active
      and not exists (select 1 from jsonb_array_elements(r.conditions) c
        where not public.pricing_condition_matches(c, coalesce(_values, '{}'::jsonb)))
    order by r.sort_order, r.created_at limit 1), t.price_minor)
  from public.tier_terms t where t.id = _term
$$;

-- A member profile's stored field values, keyed by field id.
create or replace function public.profile_values(_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(v.definition_id::text, v.value), '{}'::jsonb)
  from public.attribute_values v where _profile is not null and v.entity_id = _profile
$$;

-- The signed-in person's price for a term, from their stored values plus any join answers.
create or replace function public.quote_price(_term uuid, _answers jsonb default '{}'::jsonb)
returns int language plpgsql stable security definer set search_path = public as $$
declare _t public.tier_terms; _p uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into _t from public.tier_terms where id = _term and active;
  if _t.id is null then raise exception 'that membership level isn''t offered here'; end if;
  select id into _p from public.org_member_profiles where org_id = _t.org_id and user_id = auth.uid();
  return public.term_price(_t.id, public.profile_values(_p) || coalesce(_answers, '{}'::jsonb));
end $$;

-- ----- writing rules (tiers.manage) -----
create or replace function public.validate_pricing_conditions(_org uuid, _conditions jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare _c jsonb; _d public.attribute_definitions; _o public.organizations; _op text; _vals text[];
begin
  select * into _o from public.organizations where id = _org;
  if jsonb_typeof(_conditions) <> 'array' or jsonb_array_length(_conditions) > 10 then raise exception 'invalid conditions'; end if;
  for _c in select * from jsonb_array_elements(_conditions) loop
    select * into _d from public.attribute_definitions where id::text = _c ->> 'attribute_id' and active
      and applies_to = 'member' and (org_id = _org or org_id = any(_o.ancestor_ids));
    if _d.id is null then raise exception 'unknown field'; end if;
    _op := _c ->> 'op';
    if not (_op = 'is' or (_op = 'in' and _d.data_type in ('choice', 'multi_choice', 'ordered'))
        or (_op in ('at_least', 'at_most') and _d.data_type in ('ordered', 'number', 'date'))) then
      raise exception '% can''t be compared that way', _d.label;
    end if;
    _vals := case when _op = 'in' then array(select jsonb_array_elements_text(coalesce(_c -> 'values', '[]'::jsonb)))
      else array[_c ->> 'value'] end;
    if coalesce(array_length(_vals, 1), 0) = 0 or exists (select 1 from unnest(_vals) x where x is null or x = '') then
      raise exception 'pick a value for each condition';
    end if;
    if _d.data_type in ('choice', 'multi_choice', 'ordered') and exists (select 1 from unnest(_vals) x
        where not exists (select 1 from public.attribute_options op where op.definition_id = _d.id and op.value = x and op.active)) then
      raise exception '% has no such choice', _d.label;
    end if;
    if _d.data_type = 'number' and exists (select 1 from unnest(_vals) x where x !~ '^-?\d+(\.\d+)?$') then
      raise exception '% needs a number', _d.label;
    end if;
    if _d.data_type = 'date' and exists (select 1 from unnest(_vals) x where x !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception '% needs a date', _d.label;
    end if;
    if _d.data_type = 'boolean' and exists (select 1 from unnest(_vals) x where x not in ('true', 'false')) then
      raise exception '% needs yes or no', _d.label;
    end if;
  end loop;
end $$;

-- Create (_rule null) or update a rule. Every argument is required (no defaults), so callers
-- always send all of them (D-125 note on PostgREST argument matching).
create or replace function public.save_pricing_rule(_term uuid, _rule uuid, _label text, _conditions jsonb,
  _price_minor int, _discount_pct int, _sort_order int)
returns uuid language plpgsql security definer set search_path = public as $$
declare _t public.tier_terms; _r public.pricing_rules; _id uuid; _min int; _max int;
begin
  select * into _t from public.tier_terms where id = _term;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'tiers.manage', _t.org_id) then
    raise exception 'not allowed';
  end if;
  if (_price_minor is null) = (_discount_pct is null) then raise exception 'give either a price or a discount'; end if;
  perform public.validate_pricing_conditions(_t.org_id, coalesce(_conditions, '[]'::jsonb));
  -- a chapter's rule prices stay within its national's range too (D-146)
  if _price_minor is not null and exists (select 1 from public.organizations where id = _t.org_id and parent_id is not null) then
    _min := nullif((public.ancestor_setting(_t.org_id, 'membership.chapter_dues_min_minor') #>> '{}')::int, 0);
    _max := nullif((public.ancestor_setting(_t.org_id, 'membership.chapter_dues_max_minor') #>> '{}')::int, 0);
    if (_min is not null and _price_minor < _min) or (_max is not null and _price_minor > _max) then
      raise exception 'chapter dues must be between % and % (set by your national)',
        coalesce(to_char(_min / 100.0, 'FM999999990.00'), '0.00'), coalesce(to_char(_max / 100.0, 'FM999999990.00'), 'any amount');
    end if;
  end if;
  if _rule is null then
    insert into public.pricing_rules (org_id, term_id, label, conditions, price_minor, discount_pct, sort_order, created_by)
      values (_t.org_id, _t.id, coalesce(trim(_label), ''), coalesce(_conditions, '[]'::jsonb), _price_minor, _discount_pct,
        coalesce(_sort_order, 0), auth.uid())
      returning id into _id;
    return _id;
  end if;
  select * into _r from public.pricing_rules where id = _rule and term_id = _term;
  if _r.id is null then raise exception 'not allowed'; end if;
  update public.pricing_rules set label = coalesce(trim(_label), ''), conditions = coalesce(_conditions, '[]'::jsonb),
    price_minor = _price_minor, discount_pct = _discount_pct, sort_order = coalesce(_sort_order, 0)
    where id = _rule;
  return _rule;
end $$;

create or replace function public.set_pricing_rule_active(_rule uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _r public.pricing_rules;
begin
  select * into _r from public.pricing_rules where id = _rule;
  if _r.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'tiers.manage', _r.org_id) then
    raise exception 'not allowed';
  end if;
  update public.pricing_rules set active = _active where id = _rule;
end $$;

-- ----- joining and renewing charge the member's price (0010 / 0020 functions, changes marked) -----
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
              'currency', x.currency,
              -- the price can depend on the member's answers (pricing rules, D-147)
              'has_rules', exists (select 1 from public.pricing_rules r where r.term_id = x.id and r.active))
              order by x.sort_order), '[]'::jsonb)
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
    -- the price for this member: the first matching pricing rule, else the term's price (D-147)
    values (_org, _p.id, _uid, 'join',
      public.term_price(_t.id, public.profile_values(_p.id) || coalesce(_answers, '{}'::jsonb)),
      _t.currency, 'pending', _conn.gateway, _conn.livemode,
      _t.id, coalesce(_answers, '{}'::jsonb), _uid)
    returning id into _id;
  return _id;
end $$;

create or replace function public.begin_renewal(_membership uuid, _term uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.memberships; _p public.org_member_profiles; _t public.tier_terms;
  _tier public.membership_tiers; _conn public.gateway_connections; _id uuid;
begin
  select * into _m from public.memberships where id = _membership;
  select * into _p from public.org_member_profiles where id = _m.profile_id;
  if _uid is null or _p.user_id is distinct from _uid then raise exception 'not allowed'; end if;
  if _m.status <> 'active' then raise exception 'only active memberships can be renewed'; end if;
  if _m.lifetime then raise exception 'already a lifetime member'; end if;
  select * into _t from public.tier_terms where id = _term;
  select * into _tier from public.membership_tiers where id = _t.tier_id;
  if _t.id is null or _tier.org_id <> _m.org_id or not (_t.active and _tier.active) then
    raise exception 'that membership level isn''t offered here'; end if;
  select * into _conn from public.gateway_connections where org_id = _m.org_id and status = 'verified';
  if _conn.id is null then raise exception 'online payments aren''t open yet'; end if;
  insert into public.payments (org_id, membership_id, profile_id, payer_user_id, purpose, amount_minor, currency,
      status, gateway, livemode, term_id, created_by)
    values (_m.org_id, _m.id, _p.id, _uid, 'renew', public.term_price(_t.id, public.profile_values(_p.id)),
      _t.currency, 'pending', _conn.gateway,
      _conn.livemode, _t.id, _uid)
    returning id into _id;
  return _id;
end $$;

revoke execute on function public.pricing_condition_matches(jsonb, jsonb), public.term_price(uuid, jsonb),
  public.profile_values(uuid), public.validate_pricing_conditions(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.quote_price(uuid, jsonb), public.save_pricing_rule(uuid, uuid, text, jsonb, int, int, int),
  public.set_pricing_rule_active(uuid, boolean) from public, anon;
grant execute on function public.quote_price(uuid, jsonb), public.save_pricing_rule(uuid, uuid, text, jsonb, int, int, int),
  public.set_pricing_rule_active(uuid, boolean) to authenticated;
