-- ===== E-09 Locked chapter fields (D-121) =====
-- A national (or region) can lock a chapter field, e.g. Charter date. Then only admins of
-- the org that defined the field can set its value; chapter admins see it read-only.

alter table public.attribute_definitions add column locked boolean not null default false;
grant update (locked) on public.attribute_definitions to authenticated;

-- Member fields can't be locked; chapter fields drop member-only switches.
create or replace function public.attribute_definition_subject_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.applies_to = 'chapter' and not exists (select 1 from public.organizations
      where id = new.org_id and type in ('national', 'region')) then
    raise exception 'only national or regional organizations define chapter fields';
  end if;
  if new.applies_to = 'chapter' then
    new.member_editable := false;
    new.show_in_directory := false;
  else
    new.locked := false;
  end if;
  return new;
end $$;
create or replace trigger attribute_definitions_subject before insert or update on public.attribute_definitions
  for each row execute function public.attribute_definition_subject_check();

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
    if _d.locked and not public.has_permission(_uid, 'org.manage', _d.org_id) then
      raise exception 'this field is locked by your national organization';
    end if;
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

-- apply_setup carries the lock for chapter fields. Also fixes field ordering: the option loop
-- reused the field counter, so fields after one with choices got the wrong sort_order.
create or replace function public.apply_setup(_org uuid, _flow text, _answers jsonb, _plan jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _a jsonb; _o jsonb; _def uuid; _i int; _j int; _s jsonb;
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
