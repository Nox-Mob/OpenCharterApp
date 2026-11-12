-- S-25 part 2: OpenCharterApp's triggers for organizations' workflows (0008, core 0009):
-- a payment routed by rank to the member's chapter president, a new member, a lapsed membership.
begin;
select tests.fixture();
-- Rank (an ordered member field), Chapter A's president, a level and term.
insert into charter.attribute_definitions (id, unit_id, applies_to, key, label, data_type, visibility)
values ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'member', 'rank', 'Rank', 'ordered', 'admins');
insert into charter.attribute_options (definition_id, unit_id, value, label, sort_order) values
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'PVT', 'PVT', 10),
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'PFC', 'PFC', 20),
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'SPC', 'SPC', 30),
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'SFC', 'SFC', 40);
insert into charter.attribute_values (unit_id, definition_id, entity_id, value)
values ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '"PFC"');
insert into charter.seat_templates (id, unit_id, key, title, seat_count) values
  ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'president', 'President', 1);
insert into charter.appointments (unit_id, template_id, profile_id, seat_number, starts_on)
values ('22222222-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002', 1, current_date - 10);

select tests.eq((select count(*) from public.automation_trigger_types where app = 'charter'), 3::bigint, 'Charter offers three triggers');
select tests.eq((charter.wf_member_fields('22222222-0000-4000-8000-000000000001')->0->>'key'), 'member.fields.rank', 'member fields for the builder');
select tests.eq((charter.wf_member_fields('22222222-0000-4000-8000-000000000001')->0->'options')::text, '["PVT", "PFC", "SPC", "SFC"]', 'in order');

-- The national's owner builds: payments by members ranked PFC or lower → the chapter president.
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.save_workflow('22222222-0000-4000-8000-000000000001', null, 'Route by rank', '', true, '{
  "trigger": {"type": "charter.payment_received"},
  "branches": [{"conditions": [{"field": "member.fields.rank", "op": "lte", "value": "PFC", "order": 20}],
    "actions": [{"type": "task", "to": {"type": "charter.seat", "seat": "president", "level": "unit"}, "title": "Review {{member.name}} ({{member.fields.rank}}), {{payment.amount}} {{payment.currency}}"}]}],
  "otherwise": [{"type": "task", "to": {"type": "role", "roles": ["owner"]}, "title": "Senior: {{member.email}}"}]}');
select public.save_workflow('22222222-0000-4000-8000-000000000001', null, 'Welcome', '', true, '{
  "trigger": {"type": "charter.member_joined"},
  "always": [{"type": "email", "to": {"type": "subject"}, "subject": "Welcome to {{member.chapter}}", "message": "Glad you joined."}]}');
select public.save_workflow('22222222-0000-4000-8000-000000000001', null, 'Lapsed', '', true, '{
  "trigger": {"type": "charter.membership_lapsed"},
  "always": [{"type": "task", "to": {"type": "charter.seat", "seat": "president", "level": "unit"}, "title": "Call {{member.email}}: lapsed"}]}');
select tests.reset_role();

-- A member joins and pays.
insert into charter.membership_tiers (id, unit_id, key, name) values ('66666666-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'regular', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor, currency)
values ('77777777-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'y1', '1 year', 1, 'year', 4000, 'USD');
insert into charter.memberships (id, unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through)
values ('88888888-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003',
        '66666666-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000001', 'active', current_date, current_date + 365);
insert into charter.payments (unit_id, membership_id, profile_id, amount_minor, currency, status, gateway, method, purpose, received_on)
values ('22222222-0000-4000-8000-000000000002', '88888888-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003',
        4000, 'USD', 'paid', 'manual', 'cash', 'join', current_date);
-- An old membership whose grace period just ended.
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through)
values ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000002',
        '66666666-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000001', 'active', current_date - 500, current_date - 40);

select tests.eq(public.run_workflows(), 4, 'four runs: the payment, two new memberships, the lapse');
select tests.eq((select title from public.automation_tasks where assignee_id = '11111111-0000-4000-8000-000000000002' and title like 'Review%'),
  'Review  (PFC), 40.00 USD', 'PFC routes to the member''s chapter president, with the payment');
select tests.eq((select ctx #>> '{member,chapter}' from public.automation_runs where trigger_type = 'charter.payment_received'), 'Chapter A', 'the run knows the chapter');
select tests.eq((select count(*) from public.email_outbox where template = 'automation.message' and to_user_id = '11111111-0000-4000-8000-000000000003'
  and data->>'subject' = 'Welcome to Chapter A'), 1::bigint, 'the new member is welcomed');
select tests.eq((select count(*) from public.automation_tasks where title = 'Call a@test.org: lapsed'), 1::bigint, 'a lapsed membership makes a task');
select tests.eq(public.run_workflows(), 0, 'nothing twice');
rollback;
