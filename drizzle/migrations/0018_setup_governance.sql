-- ===== Guided setup for the board (E-17 follow-up, D-143) =====
-- apply_setup gains two sections for the Board setup flow (src/modules/governance/setup-flow.ts):
-- - seats: this org's seat templates, upserted by key (needs governance.define). The same checks
--   as define_seat / update_seat apply; linked roles are never set by setup.
-- - seat_terms: this org's own term per seat with its by-law reference (needs governance.manage),
--   appended only when different from the rule in force on that date (D-142).
-- Everything else is unchanged from 0006. apply_setup_sections() lets the app check that this
-- migration is applied (readiness guard, D-135). Additive only (D-125).

create or replace function public.apply_setup(_org uuid, _flow text, _answers jsonb, _plan jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _a jsonb; _o jsonb; _def uuid; _i int; _j int; _s jsonb; _t jsonb; _tier uuid;
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
      if _seat.id is not null and _seat.scope::text <> coalesce(_a->>'scope', 'self') then
        raise exception 'a seat''s "used by" can''t be changed';
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
          sort_order = excluded.sort_order, active = true;
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

-- The plan sections this database's apply_setup understands.
create or replace function public.apply_setup_sections()
returns text[] language sql immutable set search_path = public as $$
  select array['tax', 'attributes', 'tiers', 'seats', 'seat_terms', 'settings']
$$;
revoke execute on function public.apply_setup_sections() from public, anon;
grant execute on function public.apply_setup_sections() to authenticated;
