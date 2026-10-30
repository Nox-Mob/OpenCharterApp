-- Custom attributes (E-09): typed validation, inheritance to chapters, edit permissions
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into public.attribute_definitions (id, org_id, key, label, data_type, visibility) values
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'rank', 'Rank', 'ordered', 'members'),
  ('44444444-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001', 'joined', 'Join date', 'date', 'admins'),
  ('44444444-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', 'phone', 'Phone', 'text', 'admins'),
  ('44444444-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000001', 'tags', 'Tags', 'multi_choice', 'admins');
update public.attribute_definitions set member_editable = true, required = true where key = 'phone';
insert into public.attribute_options (definition_id, org_id, value, label, sort_order) values
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000003', 'E1', 'E-1', 1),
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'E2', 'E-2', 2),
  ('44444444-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000001', 'a', 'A', 1),
  ('44444444-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000001', 'b', 'B', 2);
select tests.reset_role();
-- option org_id is forced to the definition's org
select tests.eq((select count(*) from public.attribute_options where org_id <> '22222222-0000-4000-8000-000000000001'), 0::bigint, 'option org forced');
-- options are rejected for non-choice types
select tests.throws($$insert into public.attribute_options (definition_id, org_id, value, label) values ('44444444-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', 'x', 'x')$$, 'no options');

-- chapter admin sees national's definitions but cannot define on the national
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select count(*) from public.attribute_definitions), 4::bigint, 'inherited defs visible');
select tests.throws($$insert into public.attribute_definitions (org_id, key, label, data_type) values ('22222222-0000-4000-8000-000000000001', 'x', 'X', 'text')$$, 'row-level security');
-- chapter admin sets values on a chapter member (national attribute applies down)
select public.set_attribute_value('44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"E2"');
select public.set_attribute_value('44444444-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '"2024-05-01"');
select public.set_attribute_value('44444444-0000-4000-8000-000000000004', '33333333-0000-4000-8000-000000000003', '["a","b"]');
-- type validation
select tests.throws($$select public.set_attribute_value('44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"E9"')$$, 'invalid value');
select tests.throws($$select public.set_attribute_value('44444444-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '"May 1"')$$, 'invalid value');
select tests.throws($$select public.set_attribute_value('44444444-0000-4000-8000-000000000004', '33333333-0000-4000-8000-000000000003', '["a","a"]')$$, 'invalid value');
select tests.throws($$select public.set_attribute_value('44444444-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000003', '42')$$, 'invalid value');
-- required values cannot be cleared
select tests.throws($$select public.set_attribute_value('44444444-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000003', null)$$, 'is required');
-- chapter admin cannot touch members of sibling orgs (the national admin's profile)
select tests.throws($$select public.set_attribute_value('44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001', '"E1"')$$, 'not allowed');
select tests.reset_role();

-- member edits only member-editable attributes on their own profile
select tests.as_user('11111111-0000-4000-8000-000000000003');
select public.set_attribute_value('44444444-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000003', '"555-0100"');
select tests.throws($$select public.set_attribute_value('44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"E1"')$$, 'not allowed');
select tests.throws($$insert into public.attribute_values (org_id, definition_id, entity_id, value) values ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"E1"')$$, 'permission denied');
-- member reads own values
select tests.eq((select count(*) from public.attribute_values), 4::bigint, 'member reads own values');
select tests.reset_role();

-- outsider cannot see definitions or values
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.attribute_definitions), 0::bigint, 'outsider sees no defs');
select tests.eq((select count(*) from public.attribute_values), 0::bigint, 'outsider sees no values');
select tests.reset_role();
rollback;
