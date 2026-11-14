-- Sensitive member fields (security review round 3, owner request 2026-11-14).
--
-- An admin can mark a member field "sensitive" (for example a date of birth or a medical note).
-- Its values are then stored encrypted: AES-256 through pgcrypto's OpenPGP format, which uses a
-- fresh random salt and a fresh random session key for every value and checks that the value
-- wasn't changed (pgp_sym_encrypt with cipher-algo=aes256 and s2k-mode=3). The key is kept in
-- Supabase Vault, outside the tables, so a backup, a copy of the tables or a leaked export of
-- them shows only scrambled values.
--
-- Who can read a sensitive value: the people who manage members in that organization, and the
-- member themself. Nobody else, whatever the field's other settings. A sensitive field is never
-- shown in the directory, can't be used in pricing rules, and its value is hidden in the audit
-- log ("(sensitive)"). Join-page answers to it are encrypted the moment they're saved.
--
-- Turning the setting on encrypts the values already saved and hides them in earlier audit
-- entries. Turning it off decrypts them again.

-- The key ---------------------------------------------------------------------------------
-- Kept in Supabase Vault. A database without Vault (the tests' plain Postgres) keeps it in a
-- table nobody can read through the API.
create table if not exists charter.field_keys (
  id int primary key default 1 check (id = 1),
  key text not null
);
alter table charter.field_keys enable row level security;
revoke all on table charter.field_keys from public, anon, authenticated;

do $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'base64');
begin
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null then
    if not exists (select 1 from vault.secrets where name = 'charter_sensitive_fields') then
      perform vault.create_secret(v_key, 'charter_sensitive_fields',
        'OpenCharterApp: the key for sensitive member fields. Never change or delete it: values encrypted with it would be lost.');
    end if;
  elsif not exists (select 1 from charter.field_keys) then
    insert into charter.field_keys (id, key) values (1, v_key);
  end if;
end $$;

create or replace function charter._field_key()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_key text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_key using 'charter_sensitive_fields';
  end if;
  if v_key is null then
    select k.key into v_key from charter.field_keys k where k.id = 1;
  end if;
  if v_key is null then
    raise exception 'The key for sensitive fields is missing.' using errcode = '55000';
  end if;
  return v_key;
end;
$$;

create or replace function charter._seal(p_value jsonb)
returns bytea language sql volatile security definer set search_path = '' as $$
  select extensions.pgp_sym_encrypt(p_value::text, charter._field_key(),
    'cipher-algo=aes256, compress-algo=0, s2k-mode=3, s2k-digest-algo=sha256');
$$;

create or replace function charter._unseal(p_sealed bytea)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_sealed is null then null
              else extensions.pgp_sym_decrypt(p_sealed, charter._field_key())::jsonb end;
$$;

-- The setting -------------------------------------------------------------------------------

alter table charter.attribute_definitions add column if not exists sensitive boolean not null default false;
alter table charter.attribute_values add column if not exists value_enc bytea;
alter table charter.attribute_values alter column value drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attribute_values_one_value') then
    alter table charter.attribute_values add constraint attribute_values_one_value
      check ((value is null) <> (value_enc is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attribute_definitions_sensitive_member') then
    alter table charter.attribute_definitions add constraint attribute_definitions_sensitive_member
      check (not sensitive or applies_to = 'member');
  end if;
end $$;

comment on column charter.attribute_definitions.sensitive is
  'Values are stored encrypted (AES-256) and only member managers and the member can read them.';
comment on column charter.attribute_values.value_enc is
  'A sensitive field''s value, encrypted (pgp_sym_encrypt, AES-256, salted). value is null then.';

-- A sensitive field is for admins only and never in the directory; it can't be turned on while
-- a pricing rule uses the field.
create or replace function charter._sensitive_definition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.sensitive then
    new.visibility := 'admins';
    new.show_in_directory := false;
    if (tg_op = 'INSERT' or not old.sensitive) and exists (
        select 1 from charter.pricing_rules r, jsonb_array_elements(r.conditions) c
        where c ->> 'attribute_id' = new.id::text) then
      raise exception 'A pricing rule uses %. Remove it from the pricing rule first.', new.label
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists attribute_definitions_sensitive on charter.attribute_definitions;
create trigger attribute_definitions_sensitive before insert or update of sensitive, visibility, show_in_directory
  on charter.attribute_definitions for each row execute function charter._sensitive_definition();

-- Every write: a sensitive field's value is encrypted on the way in; turning the setting off
-- decrypts on the next write of that row.
create or replace function charter._seal_attribute_value()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_sensitive boolean;
begin
  select d.sensitive into v_sensitive from charter.attribute_definitions d where d.id = new.definition_id;
  if coalesce(v_sensitive, false) then
    if new.value is not null then
      -- A join-page answer that was already sealed (below) is moved as it is.
      if jsonb_typeof(new.value) = 'object' and new.value ? 'sealed' then
        new.value_enc := decode(new.value ->> 'sealed', 'base64');
      else
        new.value_enc := charter._seal(new.value);
      end if;
      new.value := null;
    end if;
  elsif new.value is null and new.value_enc is not null then
    new.value := charter._unseal(new.value_enc);
    new.value_enc := null;
  elsif jsonb_typeof(new.value) = 'object' and new.value ? 'sealed' then
    -- A join answer sealed while the field was sensitive, saved after it stopped being so.
    new.value := charter._unseal(decode(new.value ->> 'sealed', 'base64'));
  end if;
  return new;
end;
$$;
drop trigger if exists attribute_values_seal on charter.attribute_values;
create trigger attribute_values_seal before insert or update on charter.attribute_values
  for each row execute function charter._seal_attribute_value();

-- Turning the setting on or off re-writes the values already saved (the trigger above does the
-- work), and hides them in earlier audit entries.
create or replace function charter._sensitive_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sensitive and not old.sensitive then
    update charter.attribute_values set value = value where definition_id = new.id and value is not null;
    update charter.audit_events e
    set before = case when e.before ? 'value' then e.before || '{"value": "(sensitive)"}'::jsonb else e.before end,
        after = case when e.after ? 'value' then e.after || '{"value": "(sensitive)"}'::jsonb else e.after end
    where e.target_type = 'attribute_values'
      and coalesce(e.after, e.before) ->> 'definition_id' = new.id::text;
  elsif old.sensitive and not new.sensitive then
    update charter.attribute_values set value = charter._unseal(value_enc), value_enc = null
    where definition_id = new.id and value_enc is not null;
  end if;
  return new;
end;
$$;
drop trigger if exists attribute_definitions_sensitive_changed on charter.attribute_definitions;
create trigger attribute_definitions_sensitive_changed after update of sensitive on charter.attribute_definitions
  for each row execute function charter._sensitive_changed();

-- The audit log never shows a sensitive value (nor its encrypted form).
create or replace function charter.audit_attribute_value_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row charter.attribute_values := coalesce(new, old);
  v_sensitive boolean;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  select d.sensitive into v_sensitive from charter.attribute_definitions d where d.id = v_row.definition_id;
  if coalesce(v_sensitive, false) or old.value_enc is not null or new.value_enc is not null then
    v_old := case when v_old is null then null else (v_old - 'value_enc') || '{"value": "(sensitive)"}'::jsonb end;
    v_new := case when v_new is null then null else (v_new - 'value_enc') || '{"value": "(sensitive)"}'::jsonb end;
  end if;
  perform charter.write_audit(v_row.unit_id, lower(tg_op), 'attribute_values', v_row.id::text, v_old, v_new);
  return coalesce(new, old);
end;
$$;
drop trigger if exists audit_attribute_values on charter.attribute_values;
create trigger audit_attribute_values after insert or delete or update on charter.attribute_values
  for each row execute function charter.audit_attribute_value_change();

-- Reading: `shown_value` (a computed column the apps select) is the value, or for a sensitive
-- field the decrypted value when the reader manages members there or it's their own record.
create or replace function charter.shown_value(r charter.attribute_values)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v charter.attribute_values;
begin
  if r.value_enc is null then
    return r.value;
  end if;
  -- Use the stored row, never the one passed in: a caller could make up a row that pairs a
  -- scrambled value they can see with an organization they manage.
  select * into v from charter.attribute_values a where a.id = r.id;
  if v.id is null or v.value_enc is null then
    return null;
  end if;
  if charter.has_permission(auth.uid(), 'members.manage', v.unit_id)
     or exists (select 1 from charter.member_profiles p where p.id = v.entity_id and p.user_id = auth.uid()) then
    return charter._unseal(v.value_enc);
  end if;
  return null;
end;
$$;

-- Join-page answers to a sensitive field are sealed as soon as they're saved on the payment.
create or replace function charter._seal_join_answers()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_val jsonb;
  v_out jsonb := '{}'::jsonb;
begin
  if new.join_answers is null or new.join_answers = '{}'::jsonb then
    return new;
  end if;
  for v_key, v_val in select * from jsonb_each(new.join_answers) loop
    if exists (select 1 from charter.attribute_definitions d where d.id::text = v_key and d.sensitive)
       and v_val is not null and v_val <> 'null'::jsonb
       and not (jsonb_typeof(v_val) = 'object' and v_val ? 'sealed') then
      v_val := jsonb_build_object('sealed', encode(charter._seal(v_val), 'base64'));
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_val);
  end loop;
  new.join_answers := v_out;
  return new;
end;
$$;
drop trigger if exists payments_seal_join_answers on charter.payments;
create trigger payments_seal_join_answers before insert or update of join_answers on charter.payments
  for each row execute function charter._seal_join_answers();

-- A sealed join answer, opened to be checked before it's saved on the member.
create or replace function charter._answer_plain(p_value jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'object' and p_value ? 'sealed'
              then charter._unseal(decode(p_value ->> 'sealed', 'base64')) else p_value end;
$$;

-- Two existing functions learn about it, changed in place:
--   payment_succeeded opens a sealed join answer before checking it, and keeps the encrypted
--     value when the member already had one;
--   validate_pricing_conditions refuses a sensitive field.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('charter.payment_succeeded(text, uuid, text, integer, text, boolean)'::regprocedure);
  if position('_answer_plain' in v_def) = 0 then
    v_def := replace(v_def,
      'perform charter.validate_attribute_value(_d, _v);',
      'perform charter.validate_attribute_value(_d, charter._answer_plain(_v));');
    v_def := replace(v_def,
      'on conflict (definition_id, entity_id) do update set value = excluded.value, updated_at = now();',
      'on conflict (definition_id, entity_id) do update set value = excluded.value, value_enc = excluded.value_enc, updated_at = now();');
    if position('_answer_plain' in v_def) = 0 or position('value_enc = excluded.value_enc' in v_def) = 0 then
      raise exception 'payment_succeeded changed: update 0019_sensitive_fields.sql';
    end if;
    execute v_def;
  end if;

  v_def := pg_get_functiondef('charter.validate_pricing_conditions(uuid, jsonb)'::regprocedure);
  if position('sensitive' in v_def) = 0 then
    v_def := replace(v_def,
      'if _d.id is null then raise exception ''unknown field''; end if;',
      'if _d.id is null then raise exception ''unknown field''; end if;
    if _d.sensitive then raise exception ''% is a sensitive field and can''''t be used in a pricing rule'', _d.label; end if;');
    if position('sensitive' in v_def) = 0 then
      raise exception 'validate_pricing_conditions changed: update 0019_sensitive_fields.sql';
    end if;
    execute v_def;
  end if;
end $$;

-- set_attribute_value keeps the encrypted value on an update too.
create or replace function charter.set_attribute_value(_def uuid, _entity uuid, _value jsonb) returns void
    language plpgsql security definer
    set search_path to 'charter'
    as $$
declare _d charter.attribute_definitions; _org uuid; _owner uuid; _uid uuid := auth.uid(); _anc uuid[];
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _d from charter.attribute_definitions where id = _def and active;
  if _d.id is null then raise exception 'unknown attribute'; end if;
  if _d.applies_to = 'member' then
    select p.unit_id, p.user_id into _org, _owner from charter.member_profiles p where p.id = _entity;
    if _org is null then raise exception 'unknown member'; end if;
    select ancestor_ids into _anc from charter.units where id = _org;
    if not (_org = _d.unit_id or _d.unit_id = any(_anc)) then raise exception 'attribute does not apply here'; end if;
    if not (charter.has_permission(_uid, 'members.manage', _org) or (_owner = _uid and _d.member_editable)) then
      raise exception 'not allowed'; end if;
  else
    _org := _entity;
    select ancestor_ids into _anc from charter.units where id = _org;
    if _anc is null or not (_d.unit_id = any(_anc)) then raise exception 'attribute does not apply here'; end if;
    if not charter.has_permission(_uid, 'org.manage', _org) then raise exception 'not allowed'; end if;
    if _d.locked and not charter.has_permission(_uid, 'org.manage', _d.unit_id) then
      raise exception 'this field is locked by your national organization';
    end if;
  end if;
  if _value is null or _value = 'null'::jsonb then
    if _d.required then raise exception '% is required', _d.label; end if;
    delete from charter.attribute_values where definition_id = _def and entity_id = _entity;
    return;
  end if;
  perform charter.validate_attribute_value(_d, _value);
  insert into charter.attribute_values (unit_id, definition_id, entity_id, value, updated_by)
    values (_org, _def, _entity, _value, _uid)
    on conflict (definition_id, entity_id) do update set value = excluded.value, value_enc = excluded.value_enc,
      updated_by = excluded.updated_by, updated_at = now();
end $$;

-- Access ------------------------------------------------------------------------------------
revoke all on function charter._field_key(), charter._seal(jsonb), charter._unseal(bytea),
  charter._answer_plain(jsonb), charter._sensitive_definition(), charter._seal_attribute_value(),
  charter._sensitive_changed(), charter.audit_attribute_value_change(), charter._seal_join_answers()
from public, anon, authenticated;
revoke all on function charter.shown_value(charter.attribute_values) from public, anon;
grant execute on function charter.shown_value(charter.attribute_values) to authenticated, service_role;
grant update (sensitive) on charter.attribute_definitions to authenticated;
-- value_enc stays readable as a column (PostgreSQL needs that to pass the row to shown_value);
-- it's only ever the encrypted form.

select public._tune_schema('charter');
