-- ===== Sprint 2 and 3 of the MVP plan (A4, A5, A6) =====
-- A5 (D-178): chapter admins see each member's national standing (separate-memberships model),
--   through a definer function that returns standing only, never the national's records.
-- A4 (D-165, D-177): a national (or region) marks levels as suggested; a chapter starts from one as
--   a Copy (its own level) or Linked (follows the national's level; price the same or a set
--   reduction, kept within the national's chapter price range). Linked levels are kept in step by
--   triggers; only these functions may set or change the link.
-- A6 (D-177): apply_setup learns a pricing_rules section (same as 0027 otherwise).
-- Additive only (D-125); applies inside one transaction.

-- ----- A5: national standing for a chapter's members -----
create or replace function public.chapter_national_standing(_chapter uuid)
returns table (profile_id uuid, national_standing text)
language plpgsql stable security definer set search_path = public as $$
declare _n uuid;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'members.view', _chapter) then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from public.organizations where id = _chapter and parent_id is not null) then return; end if;
  _n := public.national_org(_chapter);
  return query
    select p.id,
      coalesce((select public.membership_standing(m.status, m.paid_through, m.lifetime, public.grace_days(_n), current_date)
        from public.org_member_profiles np join public.memberships m on m.profile_id = np.id and m.org_id = _n
        where np.org_id = _n and np.user_id = p.user_id limit 1), 'none')
    from public.org_member_profiles p
    where p.org_id = _chapter and p.user_id is not null and p.left_at is null;
end $$;
revoke execute on function public.chapter_national_standing(uuid) from public, anon;
grant execute on function public.chapter_national_standing(uuid) to authenticated;

-- ----- A4: suggested levels, copy or linked -----
alter table public.membership_tiers add column suggested boolean not null default false;
alter table public.membership_tiers add column source_tier_id uuid references public.membership_tiers(id) on delete set null;
alter table public.membership_tiers add column link_mode text check (link_mode in ('copy', 'linked'));
alter table public.membership_tiers add column price_rule text check (price_rule in ('same', 'minus_amount', 'minus_percent'));
alter table public.membership_tiers add column price_value int check (price_value between 0 and 100000000);
alter table public.tier_terms add column source_term_id uuid references public.tier_terms(id) on delete set null;
create index on public.membership_tiers (source_tier_id);
create index on public.tier_terms (source_term_id);
comment on column public.membership_tiers.suggested is 'A4: offered to the orgs below as a starting point (D-165).';
comment on column public.membership_tiers.link_mode is 'A4: copy = the chapter''s own level; linked = follows source_tier_id (D-165). Set only by adopt_suggested_level / make_level_own.';

-- The price of a linked term: the national's, or less by an amount or a percentage, kept within
-- the national's chapter price range (0 = no limit) and never below zero.
create or replace function public.linked_price(_org uuid, _price int, _rule text, _value int)
returns int language plpgsql stable security definer set search_path = public as $$
declare _p int; _min int; _max int;
begin
  _p := case coalesce(_rule, 'same')
    when 'minus_amount' then greatest(_price - coalesce(_value, 0), 0)
    when 'minus_percent' then greatest(round(_price * (100 - least(coalesce(_value, 0), 100)) / 100.0)::int, 0)
    else _price end;
  if exists (select 1 from public.organizations where id = _org and parent_id is not null) then
    _min := nullif((public.ancestor_setting(_org, 'membership.chapter_dues_min_minor') #>> '{}')::int, 0);
    _max := nullif((public.ancestor_setting(_org, 'membership.chapter_dues_max_minor') #>> '{}')::int, 0);
    if _min is not null and _p < _min then _p := _min; end if;
    if _max is not null and _p > _max then _p := _max; end if;
  end if;
  return _p;
end $$;

-- Only the functions below may set the link, and a linked level's name, terms and prices follow
-- the national's (the chapter may still retire it, or make it its own).
create or replace function public.level_link_guard()
returns trigger language plpgsql set search_path = public as $$
declare _linked boolean;
begin
  if coalesce(current_setting('app.level_link', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'membership_tiers' then
    if tg_op = 'INSERT' then
      if new.source_tier_id is not null or new.link_mode is not null or new.price_rule is not null or new.price_value is not null then
        raise exception 'start from a suggested level to link a level';
      end if;
      return new;
    end if;
    if new.source_tier_id is distinct from old.source_tier_id or new.link_mode is distinct from old.link_mode
       or new.price_rule is distinct from old.price_rule or new.price_value is distinct from old.price_value then
      raise exception 'start from a suggested level to link a level';
    end if;
    if old.link_mode = 'linked' and (new.name is distinct from old.name or new.description is distinct from old.description
       or new.tax_treatment is distinct from old.tax_treatment) then
      raise exception 'this level follows your national''s; make it your own to change it';
    end if;
    return new;
  end if;
  -- tier_terms
  select mt.link_mode = 'linked' into _linked from public.membership_tiers mt where mt.id = new.tier_id;
  if coalesce(_linked, false) then
    raise exception 'this level follows your national''s; make it your own to change it';
  end if;
  if new.source_term_id is not null and (tg_op = 'INSERT' or new.source_term_id is distinct from old.source_term_id) then
    raise exception 'start from a suggested level to link a level';
  end if;
  return new;
end $$;
create or replace trigger membership_tiers_link_guard before insert or update on public.membership_tiers
  for each row execute function public.level_link_guard();
create or replace trigger tier_terms_link_guard before insert or update on public.tier_terms
  for each row execute function public.level_link_guard();

-- Bring one linked level in step with its source: name, description, tax treatment, terms
-- (added, updated, retired) and prices.
create or replace function public.sync_linked_level(_tier uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _c public.membership_tiers; _s public.membership_tiers; _st public.tier_terms; _k text; _n int;
begin
  select * into _c from public.membership_tiers where id = _tier;
  if _c.link_mode is distinct from 'linked' or _c.source_tier_id is null then return; end if;
  select * into _s from public.membership_tiers where id = _c.source_tier_id;
  perform set_config('app.level_link', 'on', true);
  update public.membership_tiers set name = _s.name, description = _s.description, tax_treatment = _s.tax_treatment,
      active = _c.active and _s.active
    where id = _c.id;
  for _st in select * from public.tier_terms where tier_id = _s.id loop
    if exists (select 1 from public.tier_terms where tier_id = _c.id and source_term_id = _st.id) then
      update public.tier_terms set label = _st.label, length_count = _st.length_count, length_unit = _st.length_unit,
          currency = _st.currency, sort_order = _st.sort_order, active = _st.active,
          price_minor = public.linked_price(_c.org_id, _st.price_minor, _c.price_rule, _c.price_value)
        where tier_id = _c.id and source_term_id = _st.id;
    elsif _st.active then
      _k := _st.key; _n := 1;
      while exists (select 1 from public.tier_terms where tier_id = _c.id and key = _k) loop
        _n := _n + 1; _k := left(_st.key, 44) || '_' || _n;
      end loop;
      insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor, currency,
          sort_order, source_term_id)
        values (_c.id, _c.org_id, _k, _st.label, _st.length_count, _st.length_unit,
          public.linked_price(_c.org_id, _st.price_minor, _c.price_rule, _c.price_value), _st.currency, _st.sort_order, _st.id);
    end if;
  end loop;
  perform set_config('app.level_link', _prev, true);
end $$;

-- When a source level or one of its terms changes, linked levels follow.
create or replace function public.sync_linked_levels_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare _src uuid; _c uuid;
begin
  _src := case when tg_table_name = 'membership_tiers' then new.id else (to_jsonb(new)->>'tier_id')::uuid end;
  for _c in select id from public.membership_tiers where source_tier_id = _src and link_mode = 'linked' loop
    perform public.sync_linked_level(_c);
  end loop;
  return null;
end $$;
create or replace trigger membership_tiers_sync_linked after update on public.membership_tiers
  for each row execute function public.sync_linked_levels_trigger();
create or replace trigger tier_terms_sync_linked after insert or update on public.tier_terms
  for each row execute function public.sync_linked_levels_trigger();

-- Start a level from a suggested one (D-165). _mode copy | linked; for linked, _rule same |
-- minus_amount (minor units) | minus_percent.
create or replace function public.adopt_suggested_level(_org uuid, _source uuid, _mode text,
  _rule text default 'same', _value int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _s public.membership_tiers; _o public.organizations; _key text; _n int := 1; _id uuid; _st public.tier_terms;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'tiers.manage', _org) then raise exception 'not allowed'; end if;
  select * into _o from public.organizations where id = _org;
  select * into _s from public.membership_tiers where id = _source;
  if _s.id is null or not _s.active or not _s.suggested or not (_s.org_id = any(_o.ancestor_ids)) then
    raise exception 'that level isn''t suggested to you';
  end if;
  if _mode not in ('copy', 'linked') then raise exception 'choose copy or linked'; end if;
  if _mode = 'linked' and (coalesce(_rule, 'same') not in ('same', 'minus_amount', 'minus_percent')
     or coalesce(_value, 0) < 0 or (_rule = 'minus_percent' and _value > 100)) then
    raise exception 'choose the same price, an amount off or a percentage off';
  end if;
  _key := _s.key;
  while exists (select 1 from public.membership_tiers where org_id = _org and key = _key) loop
    _n := _n + 1; _key := left(_s.key, 44) || '_' || _n;
  end loop;
  perform set_config('app.level_link', 'on', true);
  insert into public.membership_tiers (org_id, key, name, description, tax_treatment, sort_order,
      source_tier_id, link_mode, price_rule, price_value)
    values (_org, _key, _s.name, _s.description, _s.tax_treatment, _s.sort_order, _s.id, _mode,
      case when _mode = 'linked' then coalesce(_rule, 'same') end,
      case when _mode = 'linked' and coalesce(_rule, 'same') <> 'same' then coalesce(_value, 0) end)
    returning id into _id;
  for _st in select * from public.tier_terms where tier_id = _s.id and active order by sort_order loop
    insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor, currency,
        sort_order, source_term_id)
      values (_id, _org, _st.key, _st.label, _st.length_count, _st.length_unit,
        case when _mode = 'linked' then public.linked_price(_org, _st.price_minor, _rule, _value)
          else public.linked_price(_org, _st.price_minor, 'same', 0) end,
        _st.currency, _st.sort_order, _st.id);
  end loop;
  perform set_config('app.level_link', _prev, true);
  return _id;
end $$;

-- Change a linked level's price rule (recalculates its terms).
create or replace function public.set_linked_level_price(_tier uuid, _rule text, _value int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _t public.membership_tiers;
begin
  select * into _t from public.membership_tiers where id = _tier;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'tiers.manage', _t.org_id) then
    raise exception 'not allowed';
  end if;
  if _t.link_mode is distinct from 'linked' then raise exception 'only a linked level has a price rule'; end if;
  if coalesce(_rule, 'same') not in ('same', 'minus_amount', 'minus_percent') or coalesce(_value, 0) < 0
     or (_rule = 'minus_percent' and _value > 100) then
    raise exception 'choose the same price, an amount off or a percentage off';
  end if;
  perform set_config('app.level_link', 'on', true);
  update public.membership_tiers set price_rule = coalesce(_rule, 'same'),
      price_value = case when coalesce(_rule, 'same') <> 'same' then coalesce(_value, 0) end
    where id = _tier;
  perform set_config('app.level_link', _prev, true);
  perform public.sync_linked_level(_tier);
end $$;

-- "Make it our own": a linked level becomes a copy (one way only).
create or replace function public.make_level_own(_tier uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _t public.membership_tiers;
begin
  select * into _t from public.membership_tiers where id = _tier;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'tiers.manage', _t.org_id) then
    raise exception 'not allowed';
  end if;
  if _t.link_mode is distinct from 'linked' then return; end if;
  perform set_config('app.level_link', 'on', true);
  update public.membership_tiers set link_mode = 'copy', price_rule = null, price_value = null where id = _tier;
  perform set_config('app.level_link', _prev, true);
end $$;

revoke execute on function public.linked_price(uuid, int, text, int), public.sync_linked_level(uuid)
  from public, anon, authenticated;
revoke execute on function public.adopt_suggested_level(uuid, uuid, text, text, int),
  public.set_linked_level_price(uuid, text, int), public.make_level_own(uuid) from public, anon;
grant execute on function public.adopt_suggested_level(uuid, uuid, text, text, int),
  public.set_linked_level_price(uuid, text, int), public.make_level_own(uuid) to authenticated;

-- ----- A6: apply_setup with a pricing_rules section (otherwise the same as 0027) -----
create or replace function public.apply_setup(_org uuid, _flow text, _answers jsonb, _plan jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _a jsonb; _o jsonb; _def uuid; _i int; _j int; _s jsonb; _t jsonb; _tier uuid;
  _term uuid; _rule uuid;
  _seat public.seat_templates; _owner uuid; _count int; _unit public.term_unit; _from date; _ref text; _f record;
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

  -- Pricing rules (A6, D-177): per term, by the level's and term's keys; a rule with the same
  -- label on the same term is updated in place, so applying again adds nothing. The checks are
  -- save_pricing_rule's (permission, conditions, the national's price range).
  if jsonb_typeof(_plan->'pricing_rules') = 'array' then
    for _a in select * from jsonb_array_elements(_plan->'pricing_rules') loop
      select tt.id into _term from public.tier_terms tt join public.membership_tiers mt on mt.id = tt.tier_id
        where mt.org_id = _org and mt.key = _a->>'tier_key' and tt.key = _a->>'term_key';
      if _term is null then raise exception 'pricing rule for an unknown level or term'; end if;
      select id into _rule from public.pricing_rules
        where term_id = _term and active and label = coalesce(trim(_a->>'label'), '')
        order by created_at limit 1;
      perform public.save_pricing_rule(_term, _rule, _a->>'label', coalesce(_a->'conditions', '[]'::jsonb),
        (_a->>'price_minor')::int, (_a->>'discount_pct')::int, coalesce((_a->>'sort_order')::int, 0));
    end loop;
  end if;

  -- Board seats (E-17, D-143): upsert by key. Linked roles are never set here (no access is
  -- granted by setup); key and scope can't change; seats left out are not retired.
  if jsonb_typeof(_plan->'seats') = 'array' then
    if not public.has_permission(_uid, 'governance.define', _org) then raise exception 'not allowed'; end if;
    if jsonb_array_length(_plan->'seats') > 0
       and exists (select 1 from public.organizations where id = _org and parent_id is not null)
       and public.ancestor_setting(_org, 'governance.chapter_extra_seats_allowed') = 'false'::jsonb then
      raise exception 'your parent organization manages board seats';
    end if;
    for _a in select * from jsonb_array_elements(_plan->'seats') loop
      _count := (_a->>'term_count')::int;
      _unit := (_a->>'term_unit')::public.term_unit;
      perform public.seat_template_check(_org, _count, _unit, null,
        coalesce(_a->>'scope', 'self')::public.seat_scope);
      select * into _seat from public.seat_templates where org_id = _org and key = _a->>'key';
      -- "Used by" can change (D-157), with the same rule as set_seat_scope (0024): refused while
      -- someone holds the seat at an org the new scope leaves out.
      if _seat.id is not null and _seat.scope::text <> coalesce(_a->>'scope', 'self') then
        _seat.scope := coalesce(_a->>'scope', 'self')::public.seat_scope;
        if exists (select 1 from public.appointments ap where ap.template_id = _seat.id and ap.ended_on is null
                   and not public.seat_applies_at(_seat, ap.org_id)) then
          raise exception 'end the current terms where this seat would no longer be used';
        end if;
      end if;
      if _seat.id is not null and exists (select 1 from public.appointments where template_id = _seat.id
          and ended_on is null and seat_number > (_a->>'seat_count')::int) then
        raise exception 'end the appointments in the seats you''re removing first';
      end if;
      insert into public.seat_templates (org_id, key, title, description, required, seat_count,
          default_term_count, default_term_unit, scope, sort_order)
        values (_org, _a->>'key', trim(_a->>'title'), coalesce(trim(_a->>'description'), ''),
          coalesce((_a->>'required')::boolean, false), coalesce((_a->>'seat_count')::int, 1), _count, _unit,
          coalesce(_a->>'scope', 'self')::public.seat_scope, coalesce((_a->>'sort_order')::int, 0))
        on conflict (org_id, key) do update set title = excluded.title, description = excluded.description,
          required = excluded.required, seat_count = excluded.seat_count,
          default_term_count = excluded.default_term_count, default_term_unit = excluded.default_term_unit,
          scope = excluded.scope, sort_order = excluded.sort_order, active = true;
    end loop;
  end if;

  -- This org's own seat terms (D-142): a rule is added only when it differs from the rule
  -- already in force on its date, so applying setup again adds nothing.
  if jsonb_typeof(_plan->'seat_terms') = 'array' then
    if not public.has_permission(_uid, 'governance.manage', _org) then raise exception 'not allowed'; end if;
    for _a in select * from jsonb_array_elements(_plan->'seat_terms') loop
      _owner := (_a->>'owner_org_id')::uuid;
      select * into _seat from public.seat_templates where org_id = _owner and key = _a->>'key';
      if _seat.id is null or not _seat.active or not public.seat_applies_at(_seat, _org) then
        raise exception 'that seat isn''t used here';
      end if;
      _count := (_a->>'length_count')::int;
      _unit := (_a->>'length_unit')::public.term_unit;
      _from := (_a->>'effective_from')::date;
      _ref := coalesce(trim(_a->>'bylaw_reference'), '');
      if _from is null then raise exception 'give the date the term takes effect'; end if;
      if (_count is null) <> (_unit is null) or (_count is not null and _count not between 1 and 100) then
        raise exception 'give the term as a number and a unit, or leave it open';
      end if;
      select * into _f from public.seat_term_in_force(_org, _seat.id, _from);
      if _f.source = 'org' and _f.length_count is not distinct from _count and _f.length_unit is not distinct from _unit
         and (select bylaw_reference from public.seat_terms where id = _f.term_id) = _ref then
        continue;
      end if;
      insert into public.seat_terms (org_id, template_id, length_count, length_unit, effective_from, bylaw_reference, set_by)
        values (_org, _seat.id, _count, _unit, _from, _ref, _uid);
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

create or replace function public.apply_setup_sections()
returns text[] language sql immutable set search_path = public as $$
  select array['tax', 'attributes', 'tiers', 'pricing_rules', 'seats', 'seat_terms', 'settings']
$$;
