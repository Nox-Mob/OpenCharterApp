-- Two-level dues (E-18, D-146): national first, then chapter; chapter dues none / optional with range
begin;
select tests.fixture();
-- x (outsider) joins; national sells $50, chapter A $25
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-000000000061', '22222222-0000-4000-8000-000000000001', 'nat', 'National'),
  ('55555555-0000-4000-8000-000000000062', '22222222-0000-4000-8000-000000000002', 'local', 'Local');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000061', '55555555-0000-4000-8000-000000000061', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 5000),
  ('66666666-0000-4000-8000-000000000062', '55555555-0000-4000-8000-000000000062', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500);
insert into public.gateway_connections (org_id, gateway, account_label, livemode) values
  ('22222222-0000-4000-8000-000000000001', 'stripe', 'Stripe', true),
  ('22222222-0000-4000-8000-000000000002', 'stripe', 'Stripe', true);

-- ----- without the rule, a chapter join is on its own -----
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((public.join_requirements('22222222-0000-4000-8000-000000000002') ->> 'national_required')::boolean, false, 'no rule yet');
select tests.reset_role();

-- ----- the national requires its own dues -----
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000001', 'membership.national_dues_required', 'true', 'locked'),
  ('22222222-0000-4000-8000-000000000001', 'membership.approval_required', 'true', 'override');
set local role anon;
select tests.eq((public.public_join_info('ch-a') -> 'national_dues' ->> 'required')::boolean, true, 'join page shows two steps');
select tests.eq((public.public_join_info('ch-a') -> 'national_dues' -> 'national' ->> 'slug'), 'nat', 'national named');
select tests.eq((public.public_join_info('nat') -> 'national_dues' ->> 'required')::boolean, false, 'not at the national itself');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq(public.join_requirements('22222222-0000-4000-8000-000000000002') ->> 'national_state', 'none', 'not a national member');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000062')$$, 'national membership required: join Nat first');
-- step 1: national dues
select public.begin_join('22222222-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000061') as pay_n \gset
select tests.reset_role();
set local role service_role;
select tests.eq(public.complete_gateway_payment('evt_n', :'pay_n', 'pi_n', 5000, 'usd', true), 'pending approval', 'national waits for its own approval');
select tests.reset_role();

-- step 2 can start while the national application is pending, but the chapter waits for it
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq(public.join_requirements('22222222-0000-4000-8000-000000000002') ->> 'national_state', 'pending', 'pending national');
select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000062') as pay_c \gset
select tests.reset_role();
set local role service_role;
select tests.eq(public.complete_gateway_payment('evt_c', :'pay_c', 'pi_c', 2500, 'usd', true), 'pending approval', 'chapter waits for the national');
select tests.reset_role();
select tests.eq((select count(*) from public.payments where payer_user_id = '11111111-0000-4000-8000-000000000004' and status = 'paid'), 2::bigint, 'two payments');
select tests.eq((select count(distinct r.org_id) from public.receipts r join public.payments p on p.id = r.payment_id
  where p.payer_user_id = '11111111-0000-4000-8000-000000000004'), 2::bigint, 'two receipts, one from each org');

-- the chapter admin can't approve before the national does
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.approve_membership((select membership_id from public.payments where gateway_ref = 'pi_c'))$$, 'national membership isn''t active yet');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.approve_membership((select membership_id from public.payments where gateway_ref = 'pi_n'));
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.approve_membership((select membership_id from public.payments where gateway_ref = 'pi_c'));
select tests.reset_role();
select tests.eq((select string_agg(m.status::text, ',' order by m.org_id) from public.memberships m
  join public.org_member_profiles p on p.id = m.profile_id where p.user_id = '11111111-0000-4000-8000-000000000004'),
  'active,active', 'both active');

-- once the national membership is current, a chapter payment activates at once (no approval rule at A)
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000002', 'membership.approval_required', 'false', 'override');
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000061', 'q@test.org');
insert into public.org_member_profiles (id, org_id, user_id, email) values
  ('33333333-0000-4000-8000-000000000061', '22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000061', 'q@test.org');
insert into public.memberships (org_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000061', '55555555-0000-4000-8000-000000000061',
   '66666666-0000-4000-8000-000000000061', 'active', current_date, current_date + 300);
select tests.as_user('11111111-0000-4000-8000-000000000061');
select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000062') as pay_q \gset
select tests.reset_role();
set local role service_role;
select tests.eq(public.complete_gateway_payment('evt_q', :'pay_q', 'pi_q', 2500, 'usd', true), 'active', 'national current: active');
select tests.reset_role();

-- ----- chapter dues: a range, and "none" -----
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000001', 'membership.chapter_dues', '"optional"', 'locked'),
  ('22222222-0000-4000-8000-000000000001', 'membership.chapter_dues_min_minor', '1000', 'locked'),
  ('22222222-0000-4000-8000-000000000001', 'membership.chapter_dues_max_minor', '3000', 'locked');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor)
  values ('55555555-0000-4000-8000-000000000062', '22222222-0000-4000-8000-000000000002', '2_year', '2 years', 2, 'year', 5000)$$,
  'between 10.00 and 30.00');
insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor)
  values ('55555555-0000-4000-8000-000000000062', '22222222-0000-4000-8000-000000000002', '6_month', '6 months', 6, 'month', 1500);
select tests.throws($$update public.tier_terms set price_minor = 500 where key = '6_month'$$, 'between 10.00 and 30.00');
select tests.reset_role();
-- the national's own prices aren't limited
update public.tier_terms set price_minor = 9000 where id = '66666666-0000-4000-8000-000000000061';

update public.org_settings set value = '"none"' where key = 'membership.chapter_dues';
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into public.membership_tiers (org_id, key, name) values ('22222222-0000-4000-8000-000000000002', 'extra', 'Extra')$$,
  'parent organization manages membership levels');
select tests.reset_role();
set local role anon;
select tests.eq((public.public_join_info('ch-a') ->> 'levels_managed_by_parent')::boolean, true, 'join at the national instead');
select tests.reset_role();
rollback;
