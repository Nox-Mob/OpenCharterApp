-- Sensitive member fields (0019): encrypted at rest (AES-256, salted), readable only by member
-- managers and the member, never in the directory, pricing rules or the audit log.
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into charter.attribute_definitions (id, unit_id, key, label, data_type, visibility, show_in_directory, sensitive) values
  ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'dob', 'Date of birth', 'date', 'public', true, true),
  ('55555555-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001', 'phone', 'Phone', 'text', 'members', false, false);
select tests.reset_role();
-- A sensitive field is for admins only, and never in the directory.
select tests.eq((select visibility::text from charter.attribute_definitions where key = 'dob'), 'admins', 'sensitive forces admins only');
select tests.eq((select show_in_directory from charter.attribute_definitions where key = 'dob'), false, 'and keeps it out of the directory');
update charter.attribute_definitions set visibility = 'members', show_in_directory = true where key = 'dob';
select tests.eq((select visibility::text || show_in_directory::text from charter.attribute_definitions where key = 'dob'), 'adminsfalse', 'and stays that way');

-- The chapter admin saves a value: stored encrypted, the plain value is gone.
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.set_attribute_value('55555555-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"1980-02-03"');
select charter.set_attribute_value('55555555-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"1980-02-04"');
select tests.reset_role();
select tests.eq((select count(*) from charter.attribute_values where definition_id = '55555555-0000-4000-8000-000000000001' and value is null and value_enc is not null), 1::bigint, 'stored encrypted, one row');
select tests.eq((select position('1980' in encode(value_enc, 'escape')) from charter.attribute_values where definition_id = '55555555-0000-4000-8000-000000000001'), 0, 'the plain value is not in the stored bytes');
select tests.eq(charter._unseal((select value_enc from charter.attribute_values where definition_id = '55555555-0000-4000-8000-000000000001')), '"1980-02-04"'::jsonb, 'an update re-encrypts the new value');
-- AES-256 with a fresh salt each time: the same value never encrypts the same way twice.
select tests.eq(charter._seal('"x"') = charter._seal('"x"'), false, 'salted: two encryptions differ');
select tests.eq(position('AES256' in upper(extensions.pgp_armor_headers(extensions.armor(charter._seal('"x"')))::text)) >= 0, true, 'pgp message');

-- Reading: the manager and the member see it; the stored column stays scrambled.
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select charter.shown_value(v) from charter.attribute_values v where definition_id = '55555555-0000-4000-8000-000000000001'), '"1980-02-04"'::jsonb, 'the chapter admin reads it');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select charter.shown_value(v) from charter.attribute_values v where definition_id = '55555555-0000-4000-8000-000000000001'), '"1980-02-04"'::jsonb, 'the member reads their own');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from charter.attribute_values), 0::bigint, 'an outsider sees nothing');
select tests.reset_role();

-- The audit log never shows it.
select tests.eq((select count(*) from charter.audit_events where target_type = 'attribute_values'
  and (coalesce(after, before) ->> 'definition_id') = '55555555-0000-4000-8000-000000000001'
  and (coalesce(after ->> 'value', '') <> '(sensitive)' or after ? 'value_enc')), 0::bigint, 'audit shows (sensitive)');

-- Turning it on for a field with values: encrypted, and earlier audit entries hidden.
select tests.as_user('11111111-0000-4000-8000-000000000001');
update charter.attribute_definitions set member_editable = true where key = 'phone';
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select charter.set_attribute_value('55555555-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '"555-0100"');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
update charter.attribute_definitions set sensitive = true where key = 'phone';
select tests.reset_role();
select tests.eq((select value is null and value_enc is not null from charter.attribute_values where definition_id = '55555555-0000-4000-8000-000000000002'), true, 'turning it on encrypts saved values');
select tests.eq((select count(*) from charter.audit_events where target_type = 'attribute_values'
  and (coalesce(after, before)::text like '%555-0100%')), 0::bigint, 'and hides them in earlier audit entries');
-- Turning it off decrypts them.
select tests.as_user('11111111-0000-4000-8000-000000000001');
update charter.attribute_definitions set sensitive = false where key = 'phone';
select tests.reset_role();
select tests.eq((select value from charter.attribute_values where definition_id = '55555555-0000-4000-8000-000000000002'), '"555-0100"'::jsonb, 'turning it off decrypts');

-- Pricing rules can't use a sensitive field, and a field a pricing rule uses can't become sensitive.
select tests.throws($$select charter.validate_pricing_conditions('22222222-0000-4000-8000-000000000001',
  '[{"attribute_id":"55555555-0000-4000-8000-000000000001","op":"is","value":"1980-02-04"}]')$$, 'sensitive field');
-- Only member fields can be sensitive.
select tests.throws($$insert into charter.attribute_definitions (unit_id, applies_to, key, label, data_type, sensitive) values ('22222222-0000-4000-8000-000000000001', 'chapter', 'ein2', 'EIN', 'text', true)$$, 'attribute_definitions_sensitive_member');
-- Join-page answers are sealed, and open again for checking.
select tests.eq(charter._answer_plain(jsonb_build_object('sealed', encode(charter._seal('"1980-02-04"'), 'base64'))), '"1980-02-04"'::jsonb, 'sealed answers open');
select tests.eq(charter._answer_plain('"plain"'), '"plain"'::jsonb, 'plain answers pass through');
-- A made-up row can't unlock a value: the stored row and its organization decide.
create temp table forged (r charter.attribute_values) on commit drop;
insert into forged select a from charter.attribute_values a where definition_id = '55555555-0000-4000-8000-000000000001';
grant select on forged to authenticated;
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select charter.shown_value(f.r) from forged f), null::jsonb, 'an outsider''s made-up row gets nothing');
select tests.reset_role();
-- A sealed join answer saved after the field stopped being sensitive is stored opened.
update charter.attribute_definitions set sensitive = false where key = 'dob';
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.set_attribute_value('55555555-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"1980-02-05"');
select tests.reset_role();
insert into charter.attribute_values (unit_id, definition_id, entity_id, value)
values ('22222222-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001',
  jsonb_build_object('sealed', encode(charter._seal('"1990-01-01"'), 'base64')));
select tests.eq((select value from charter.attribute_values where entity_id = '33333333-0000-4000-8000-000000000001' and definition_id = '55555555-0000-4000-8000-000000000001'), '"1990-01-01"'::jsonb, 'opened, not stored sealed');
-- Changing the key: a new key re-encrypts every value; old keys can then be forgotten.
update charter.attribute_definitions set sensitive = true where key = 'dob';
create temp table before_rotation on commit drop as
  select id, value_enc from charter.attribute_values where value_enc is not null;
select tests.eq((charter.rotate_field_key() ->> 'version')::int, 2, 'a new key, version 2');
select tests.eq((select count(*) from charter.attribute_values a join before_rotation b using (id) where a.value_enc = b.value_enc), 0::bigint,
  'every value was re-encrypted');
select tests.eq((select charter._opens_with(value_enc, 2) from charter.attribute_values where value_enc is not null limit 1), true,
  'with the new key');
select tests.eq((select charter._opens_with(value_enc, 1) from charter.attribute_values where value_enc is not null limit 1), false,
  'and not the old one');
-- A value still on the old key (an old backup restored, say) still opens, and blocks forgetting.
insert into charter.attribute_values (unit_id, definition_id, entity_id, value_enc)
select '22222222-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002',
  extensions.pgp_sym_encrypt('"2001-01-01"', charter._field_key(1), 'cipher-algo=aes256');
select tests.eq(charter._unseal((select value_enc from charter.attribute_values where entity_id = '33333333-0000-4000-8000-000000000002' and definition_id = '55555555-0000-4000-8000-000000000001')),
  '"2001-01-01"'::jsonb, 'an old-key value still opens');
select tests.throws($$select charter.forget_old_field_keys()$$, 'still need an older key');
select charter.rotate_field_key();
select tests.eq(charter.forget_old_field_keys(), 2, 'after another rotation, the two old keys are forgotten');
select tests.eq(charter._unseal((select value_enc from charter.attribute_values where entity_id = '33333333-0000-4000-8000-000000000002' and definition_id = '55555555-0000-4000-8000-000000000001')),
  '"2001-01-01"'::jsonb, 'values still open with the newest key');
select tests.eq(has_function_privilege('authenticated', 'charter.rotate_field_key()', 'EXECUTE'), false, 'only the operator changes the key');
-- Nobody signed in can call the encryption functions.
select tests.eq(has_function_privilege('authenticated', 'charter._unseal(bytea)', 'EXECUTE'), false, 'no direct decryption');
select tests.eq(has_table_privilege('authenticated', 'charter.field_keys', 'SELECT'), false, 'nobody reads the key table');
rollback;
