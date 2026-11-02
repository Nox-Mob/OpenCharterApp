-- National roll-ups (E-23, D-145): aggregates only, correct totals, permission and isolation
begin;
select tests.fixture();
insert into public.org_member_profiles (id, org_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-000000000031', '22222222-0000-4000-8000-000000000002', null, 'Old', '', 'admin'),
  ('33333333-0000-4000-8000-000000000032', '22222222-0000-4000-8000-000000000003', null, 'Bea', '', 'admin');
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-000000000051', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000051', '55555555-0000-4000-8000-000000000051', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
insert into public.memberships (id, org_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('77777777-0000-4000-8000-000000000051', '22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003',
   '55555555-0000-4000-8000-000000000051', '66666666-0000-4000-8000-000000000051', 'active', current_date - 10, current_date + 20),
  ('77777777-0000-4000-8000-000000000052', '22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000031',
   '55555555-0000-4000-8000-000000000051', '66666666-0000-4000-8000-000000000051', 'active', '2019-01-01', '2019-12-31'),
  ('77777777-0000-4000-8000-000000000053', '22222222-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000032',
   '55555555-0000-4000-8000-000000000051', '66666666-0000-4000-8000-000000000051', 'pending', null, null);
insert into public.payments (org_id, membership_id, profile_id, purpose, amount_minor, status, gateway, method, livemode, received_on, refunded_amount_minor) values
  ('22222222-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000051', '33333333-0000-4000-8000-000000000003', 'join', 2500, 'paid', 'manual', 'check', true, current_date - 10, 500),
  ('22222222-0000-4000-8000-000000000002', null, null, 'renew', 4000, 'paid', 'test', null, false, current_date - 5, 0),
  ('22222222-0000-4000-8000-000000000003', null, null, 'join', 1000, 'failed', 'manual', null, true, current_date - 5, 0),
  ('22222222-0000-4000-8000-000000000003', null, null, 'join', 1500, 'paid', 'manual', 'cash', true, '2020-01-01', 0);

-- ----- members -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
create temp table r as select * from public.org_rollup_members('22222222-0000-4000-8000-000000000001');
select tests.eq((select string_agg(name || ':' || depth, ',' order by depth, name) from r), 'Nat:0,Chapter A:1,Chapter B:1', 'org and its chapters');
select tests.eq((select good || '/' || lapsed || '/' || no_membership || '/' || profiles from r where name = 'Chapter A'), '1/1/1/3', 'A by standing (admin a has no membership)');
select tests.eq((select pending from r where name = 'Chapter B'), 1, 'B pending');
select tests.eq((select expiring_30 || '/' || joined_30d from r where name = 'Chapter A'), '1/1', 'expiring and new');
select tests.eq((select sum(profiles) from r)::int, (select count(*) from public.org_member_profiles)::int, 'totals match the detail rows');
select tests.eq((select count(*) from information_schema.routines where routine_name = 'org_rollup_members'
  and data_type = 'record'), 1::bigint, 'returns aggregates only');

-- ----- revenue: paid and refunded live payments in range; test payments left out -----
create temp table v as select * from public.org_rollup_revenue('22222222-0000-4000-8000-000000000001', current_date - 30, current_date);
select tests.eq((select gross_minor || '/' || refunded_minor || '/' || net_minor || '/' || payments from v where name = 'Chapter A'),
  '2500/500/2000/1', 'A: test payment excluded, refund netted');
select tests.eq((select count(*) from v where name = 'Chapter B'), 0::bigint, 'B: failed and out-of-range payments excluded');
select tests.throws($$select * from public.org_rollup_revenue('22222222-0000-4000-8000-000000000001', current_date, current_date - 1)$$, 'date range');

-- ----- governance: required seats vacant per chapter -----
select public.define_seat('22222222-0000-4000-8000-000000000001', 'president', 'President', '', true, 1, 1, 'year', null, 'chapters');
select tests.reset_role();
insert into public.appointments (org_id, template_id, profile_id, seat_number, starts_on, planned_end)
  select '22222222-0000-4000-8000-000000000002', id, '33333333-0000-4000-8000-000000000003', 1, current_date - 400, current_date - 35
  from public.seat_templates where key = 'president';
select tests.as_user('11111111-0000-4000-8000-000000000001');
create temp table g as select * from public.org_rollup_governance('22222222-0000-4000-8000-000000000001');
select tests.eq((select vacant_required || '/' || terms_past_end from g where name = 'Chapter A'), '0/1', 'A filled, term past its end');
select tests.eq((select vacant_titles from g where name = 'Chapter B'), array['President'], 'B vacant');
select tests.eq((select required_seats from g where name = 'Nat'), 0, 'chapter seats don''t apply at the national');

-- ----- exports are audited -----
select public.log_report_export('22222222-0000-4000-8000-000000000001', 'members', 3);
select tests.throws($$select public.log_report_export('22222222-0000-4000-8000-000000000001', 'secrets', 1)$$, 'unknown report');
select tests.reset_role();
select tests.eq((select after ->> 'rows' from public.audit_events where target_type = 'report'), '3', 'export recorded');

-- ----- a chapter admin sees only their chapter; never the national or a sibling -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select * from public.org_rollup_members('22222222-0000-4000-8000-000000000001')$$, 'not allowed');
select tests.throws($$select * from public.org_rollup_members('22222222-0000-4000-8000-000000000003')$$, 'not allowed');
select tests.throws($$select * from public.org_rollup_revenue('22222222-0000-4000-8000-000000000003', current_date - 1, current_date)$$, 'not allowed');
select tests.eq((select count(*) from public.org_rollup_members('22222222-0000-4000-8000-000000000002')), 1::bigint, 'own chapter only');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select * from public.org_rollup_members('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.reset_role();
rollback;
