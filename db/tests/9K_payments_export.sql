-- Transaction CSV export (0029, D-173): paid / refunded payments in range, the org or its tree,
-- emails only for member viewers, audited, permission and isolation
begin;
select tests.fixture();
update charter.member_profiles set display_name = 'Morgan' where id = '33333333-0000-4000-8000-000000000003';
insert into charter.membership_tiers (id, unit_id, key, name, tax_treatment) values
  ('55555555-0000-4000-8000-0000000000b1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular', 'non_deductible');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000b1', '55555555-0000-4000-8000-0000000000b1', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
insert into charter.payments (unit_id, profile_id, term_id, purpose, amount_minor, status, gateway, method, livemode, received_on, refunded_amount_minor, gateway_ref) values
  -- chapter A: paid with a partial refund; a failed one; one out of range
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '66666666-0000-4000-8000-0000000000b1', 'join', 2500, 'paid', 'manual', 'check', true, '2026-03-01', 500, 'chk-101'),
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', null, 'renew', 2500, 'failed', 'manual', null, true, '2026-03-02', 0, null),
  ('22222222-0000-4000-8000-000000000002', null, null, 'renew', 900, 'paid', 'manual', 'cash', true, '2025-01-01', 0, null),
  -- national: a test payment; chapter B: paid
  ('22222222-0000-4000-8000-000000000001', null, null, 'join', 4000, 'paid', 'test', null, false, '2026-04-01', 0, 'test_pay_1'),
  ('22222222-0000-4000-8000-000000000003', null, null, 'join', 1500, 'paid', 'manual', 'cash', true, '2026-05-01', 0, null);

-- ----- national, own org only, then with every org below -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from charter.export_payments('22222222-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31')),
  1::bigint, 'national only: its own payment');
create temp table x as select * from charter.export_payments('22222222-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', true);
select tests.eq((select string_agg(org_name || ':' || net_minor, ',' order by received_on) from x),
  'Chapter A:2000,Nat:4000,Chapter B:1500', 'tree: in range, paid only, refunds netted, in date order');
select tests.eq((select test_payment from x where org_name = 'Nat'), true, 'test payments flagged');
select tests.eq((select member || '|' || email || '|' || level || '|' || term || '|' || method || '|' || reference || '|' || tax_treatment
  from x where org_name = 'Chapter A'), 'Morgan|m@test.org|Regular|1 year|check|chk-101|non_deductible', 'details');
select tests.eq((select receipt like '2026-%' from x where org_name = 'Chapter A'), true, 'receipt number');
select tests.throws($$select * from charter.export_payments('22222222-0000-4000-8000-000000000001', '2026-02-01', '2026-01-01')$$, 'date range');
select tests.reset_role();
select tests.eq((select after->>'rows' from charter.audit_events where action = 'export' and target_id = 'payments'
  order by id desc limit 1), '3', 'export audited with the row count');
select tests.eq((select count(*) from charter.audit_events where action = 'export' and target_id = 'payments'), 2::bigint,
  'both exports audited; the refused one wrote nothing');

-- ----- a treasurer with payments.view but not members.view sees names, not emails -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'treasurer', charter.create_role('22222222-0000-4000-8000-000000000001', 'treasurer', 'Treasurer', '', array['payments.view']);
select tests.reset_role();
insert into charter.member_profiles (unit_id, user_id, display_name, email, source)
  values ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000004', 'Terry', 'x@test.org', 'signup');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select charter.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000004', 'treasurer');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select member || '|' || email from charter.export_payments('22222222-0000-4000-8000-000000000002', '2026-01-01', '2026-12-31')),
  'Morgan|', 'name without email');
select tests.reset_role();

-- ----- chapter admin: own chapter (and "below" adds nothing); not the national or a sibling -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select count(*) from charter.export_payments('22222222-0000-4000-8000-000000000002', '2026-01-01', '2026-12-31', true)),
  1::bigint, 'chapter A only');
select tests.throws($$select * from charter.export_payments('22222222-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31')$$, 'not allowed');
select tests.throws($$select * from charter.export_payments('22222222-0000-4000-8000-000000000003', '2026-01-01', '2026-12-31')$$, 'not allowed');
select tests.reset_role();
-- members and anon refused
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select * from charter.export_payments('22222222-0000-4000-8000-000000000002', '2026-01-01', '2026-12-31')$$, 'not allowed');
select tests.reset_role();
set local role anon;
select tests.throws($$select * from charter.export_payments('22222222-0000-4000-8000-000000000002', '2026-01-01', '2026-12-31')$$, 'permission denied');
reset role;
rollback;
