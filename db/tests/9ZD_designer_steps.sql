-- S-28: OpenCharterApp's lookup for the workflow designer (0012, core 0012): find members, and a
-- designer workflow that goes through them.
begin;
select tests.fixture();
-- A level and term, and memberships: Ann (Chapter A, current), Max (Chapter A, lapsed).
insert into charter.membership_tiers (id, unit_id, key, name, tax_treatment) values
  ('55555555-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000001', 'regular', 'Regular', 'non_deductible');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('55555555-0000-4000-8000-000000000012', '55555555-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000011',
   '55555555-0000-4000-8000-000000000012', 'active', current_date - 200, current_date + 20),
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000011',
   '55555555-0000-4000-8000-000000000012', 'active', current_date - 400, current_date - 5);

select tests.eq((select kind from public.automation_action_types where type = 'charter.find_members'), 'query', 'find members is a lookup');
-- Members of the national's organization, in every unit; each row as the member triggers carry it.
select tests.eq((charter.wf_find_members('22222222-0000-4000-8000-000000000001', '{"standing": "any"}') ->> 'count')::int > 0, true, 'finds members');
select tests.eq((select bool_and(r ? 'email' and r ? 'standing' and r ? 'chapter')
                 from jsonb_array_elements(charter.wf_find_members('22222222-0000-4000-8000-000000000001', '{"standing": "any"}') -> 'rows') r),
  true, 'rows carry email, standing and chapter');
select tests.eq((charter.wf_find_members('22222222-0000-4000-8000-000000000001', '{"standing": "any", "level": "No such level"}') ->> 'count')::int,
  0, 'filters by level');
select tests.eq((charter.wf_find_members('22222222-0000-4000-8000-000000000001', '{"standing": "current"}') -> 'rows' -> 0 ->> 'email'),
  'a@test.org', 'current members only');
select tests.eq((charter.wf_find_members('22222222-0000-4000-8000-000000000001', '{"standing": "lapsed"}') -> 'rows' -> 0 ->> 'email'),
  'm@test.org', 'lapsed members only');
select tests.eq((charter.wf_find_members('22222222-0000-4000-8000-000000000001', '{"expires_within_days": 30}') ->> 'count')::int,
  1, 'memberships ending within 30 days');
select tests.eq((charter.wf_find_members('22222222-0000-4000-8000-000000000001', '{"standing": "any", "limit": 1}') ->> 'count')::int,
  1, 'at most the limit');
select tests.eq((charter.wf_find_members('00000000-0000-4000-8000-00000000dead', '{"standing": "any"}') ->> 'count')::int,
  0, 'nothing from another organization');

-- The national's owner tests a designer workflow: find members, then a step for each.
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq(public.test_workflow('22222222-0000-4000-8000-000000000001', '{"version": 2,
  "trigger": {"type": "charter.payment_received"},
  "steps": [
    {"id": "find", "type": "charter.find_members", "params": {"standing": "any"}},
    {"id": "names", "type": "init_variable", "params": {"name": "names", "kind": "list"}},
    {"id": "each", "type": "foreach", "params": {"items": "{{steps.find.rows}}"}, "steps": [
      {"id": "keep", "type": "append_variable", "params": {"name": "names", "value": "{{items.each.name}}"}},
      {"id": "mail", "type": "email", "params": {"to": {"type": "address", "email": "{{item.email}}"}, "subject": "Hello {{item.name}}", "message": "m"}}]}
  ]}') ->> 'status', 'succeeded', 'the test run goes through every member');
select tests.reset_role();
select tests.eq((select count(*) from public.email_outbox where template = 'automation.message'), 0::bigint, 'a test run emails nobody');
rollback;
