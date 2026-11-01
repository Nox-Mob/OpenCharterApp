-- Setup engine apply (E-10): permission-checked, transactional, re-runnable
begin;
select tests.fixture();

-- a member cannot run setup
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'membership', '{}', '{}')$$, 'not allowed');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{"q":1}', $${
  "tax": {"legal_name": "Nat Inc", "ein": "12-3456789", "tax_status": "501(c)(19)"},
  "attributes": [
    {"key": "rank", "label": "Rank", "data_type": "ordered", "visibility": "members",
     "options": [{"value": "E1", "label": "E-1"}, {"value": "E2", "label": "E-2"}]},
    {"key": "joined", "label": "Join date", "data_type": "date"}
  ],
  "settings": [{"key": "membership.grace_days", "value": 30, "mode": "locked"}]
}$$);
select tests.eq((select legal_name from public.tax_profiles where org_id = '22222222-0000-4000-8000-000000000001'), 'Nat Inc', 'tax applied');
select tests.eq((select count(*) from public.attribute_definitions where org_id = '22222222-0000-4000-8000-000000000001'), 2::bigint, 'attributes applied');
select tests.eq((select count(*) from public.attribute_options), 2::bigint, 'options applied');
select tests.eq((select status::text from public.setup_states where flow_id = 'membership'), 'applied', 'state applied');

-- re-running updates in place and never duplicates
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', $${
  "attributes": [{"key": "rank", "label": "Pay grade", "data_type": "ordered",
     "options": [{"value": "E1", "label": "E-1"}, {"value": "E2", "label": "E-2"}, {"value": "E3", "label": "E-3"}]}]
}$$);
select tests.eq((select label from public.attribute_definitions where key = 'rank'), 'Pay grade', 'relabelled');
select tests.eq((select count(*) from public.attribute_definitions where org_id = '22222222-0000-4000-8000-000000000001'), 2::bigint, 'no duplicates');
select tests.eq((select count(*) from public.attribute_options), 3::bigint, 'option added');

-- a bad plan applies nothing (transactional)
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', '{
  "tax": {"legal_name": "SHOULD NOT STICK"},
  "attributes": [{"key": "Bad Key", "label": "x", "data_type": "text"}]}')$$, 'check constraint');
select tests.eq((select legal_name from public.tax_profiles where org_id = '22222222-0000-4000-8000-000000000001'), 'Nat Inc', 'rolled back');
select tests.reset_role();

-- chapter setup cannot override a national lock
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'membership', '{}',
  '{"settings": [{"key": "membership.grace_days", "value": 5}]}')$$, 'locked');
-- drafts: chapter admin can save its own draft but not mark it applied directly
insert into public.setup_states (org_id, flow_id, answers) values ('22222222-0000-4000-8000-000000000002', 'membership', '{"a":1}');
select tests.throws($$update public.setup_states set status = 'applied' where org_id = '22222222-0000-4000-8000-000000000002'$$, 'permission denied');
select tests.reset_role();
rollback;

-- Chapter fields through setup (E-09): nationals may plan them, chapters may not
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', $${
  "attributes": [
    {"key": "charter_date", "label": "Charter date", "data_type": "date", "applies_to": "chapter", "member_editable": true},
    {"key": "charter_date", "label": "Charter date", "data_type": "date", "applies_to": "member"}
  ]}$$);
select tests.eq((select count(*) from public.attribute_definitions where applies_to = 'chapter'), 1::bigint, 'chapter field applied');
select tests.eq((select member_editable from public.attribute_definitions where applies_to = 'chapter'), false, 'member switch cleared');
-- re-running keeps one chapter field (updates by key)
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', $${
  "attributes": [{"key": "charter_date", "label": "Chartered on", "data_type": "date", "applies_to": "chapter"}]}$$);
select tests.eq((select label from public.attribute_definitions where applies_to = 'chapter'), 'Chartered on', 'chapter field relabelled');
select tests.eq((select count(*) from public.attribute_definitions where applies_to = 'chapter'), 1::bigint, 'no duplicate chapter field');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'membership', '{}',
  '{"attributes": [{"key": "x", "label": "X", "data_type": "text", "applies_to": "chapter"}]}')$$, 'only national or regional');
select tests.reset_role();
rollback;

-- Setup carries chapter field locks, and fields keep their order after one with choices
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', $${
  "attributes": [
    {"key": "rank", "label": "Rank", "data_type": "ordered",
     "options": [{"value": "a"}, {"value": "b"}, {"value": "c"}]},
    {"key": "phone", "label": "Phone", "data_type": "text"},
    {"key": "charter_date", "label": "Charter date", "data_type": "date", "applies_to": "chapter", "locked": true}
  ]}$$);
select tests.eq((select locked from public.attribute_definitions where key = 'charter_date'), true, 'lock applied');
select tests.eq((select sort_order from public.attribute_definitions where key = 'phone'), 20, 'second field keeps its order');
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', $${
  "attributes": [{"key": "charter_date", "label": "Charter date", "data_type": "date", "applies_to": "chapter", "locked": false}]}$$);
select tests.eq((select locked from public.attribute_definitions where key = 'charter_date'), false, 'lock removed on re-run');
select tests.reset_role();
rollback;
