-- Online joining and renewal (E-13b): join info, starting, completing, failing, refunds, approval
begin;
select tests.fixture();
insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-000000000011', 'y@test.org'),
  ('11111111-0000-4000-8000-000000000012', 'z@test.org');
-- chapter A sells "Local": 1 year $25 and a 6-month term; members answer a required phone field
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000002', 'local', 'Local');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000021', '55555555-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500),
  ('66666666-0000-4000-8000-000000000022', '55555555-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000002', '6_month', '6 months', 6, 'month', 1500);
insert into public.attribute_definitions (id, org_id, key, label, data_type, required, member_editable) values
  ('44444444-0000-4000-8000-000000000031', '22222222-0000-4000-8000-000000000002', 'phone', 'Phone', 'text', true, true),
  ('44444444-0000-4000-8000-000000000032', '22222222-0000-4000-8000-000000000002', 'notes', 'Admin notes', 'text', false, false);

-- ----- nothing opens until the org has a payment connection -----
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": "555"}')$$, 'aren''t open yet');
select tests.reset_role();
insert into public.gateway_connections (org_id, gateway, account_label, livemode) values ('22222222-0000-4000-8000-000000000002', 'stripe', 'Stripe', true);

-- ----- public join info, readable without signing in -----
set local role anon;
select tests.eq((public.public_join_info('CH-A') -> 'org' ->> 'name'), 'Chapter A', 'join info by slug');
select tests.eq((public.public_join_info('ch-a') ->> 'payments_enabled')::boolean, true, 'payments open');
select tests.eq(jsonb_array_length(public.public_join_info('ch-a') -> 'levels' -> 0 -> 'terms'), 2, 'terms listed');
select tests.eq(jsonb_array_length(public.public_join_info('ch-a') -> 'fields'), 1, 'only fields members answer');
select tests.eq(public.public_join_info('nope'), null::jsonb, 'unknown slug');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021')$$, 'permission denied');
select tests.reset_role();

-- ----- starting to join validates everything and writes only a pending payment -----
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{}')$$, 'Phone is required');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": "555", "44444444-0000-4000-8000-000000000032": "sneaky"}')$$, 'unknown field');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": 42}')$$, 'invalid value');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000021', '{}')$$, 'isn''t offered here');
select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": "555-0100"}') as pay_x \gset
select public.set_checkout_ref(:'pay_x', 'cs_test_1');
-- the payer can follow their own payment before they're a member
select tests.eq((select status::text || '/' || amount_minor from public.payments where id = :'pay_x'), 'pending/2500', 'payer sees pending payment at the term price');
select tests.reset_role();
select tests.eq((select count(*) from public.org_member_profiles where user_id = '11111111-0000-4000-8000-000000000004' and org_id = '22222222-0000-4000-8000-000000000002'), 0::bigint, 'abandoned checkout creates no member');
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws(format($$select public.set_checkout_ref(%L, 'cs_hijack')$$, :'pay_x'), 'not allowed');
select tests.eq((select count(*) from public.payments where id = :'pay_x'), 0::bigint, 'others can''t see the payment');
select tests.reset_role();

-- ----- only the server role completes payments -----
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws(format($$select public.complete_gateway_payment('evt_x', %L, 'pi_1', 2500, 'usd', true)$$, :'pay_x'), 'permission denied');
select tests.throws(format($$select public.payment_succeeded('evt_x', %L, 'pi_1', 2500, 'usd', true)$$, :'pay_x'), 'permission denied');
select tests.reset_role();

set local role service_role;
select tests.eq(public.complete_gateway_payment('evt_1', :'pay_x', 'pi_1', 2500, 'usd', true), 'active', 'joined');
select tests.eq(public.complete_gateway_payment('evt_1', :'pay_x', 'pi_1', 2500, 'usd', true), 'duplicate', 'same event twice');
select tests.eq(public.complete_gateway_payment('evt_1b', :'pay_x', 'pi_1', 2500, 'usd', true), 'already paid', 'second success event');
select tests.reset_role();
select tests.eq((select source from public.org_member_profiles where user_id = '11111111-0000-4000-8000-000000000004' and org_id = '22222222-0000-4000-8000-000000000002'), 'signup', 'profile created on payment');
select tests.eq((select value #>> '{}' from public.attribute_values where definition_id = '44444444-0000-4000-8000-000000000031'), '555-0100', 'answers saved');
select tests.eq((select paid_through from public.memberships m join public.payments p on p.membership_id = m.id where p.id = :'pay_x'),
  public.term_end(current_date, 1, 'year'), 'term starts today');
select tests.eq((select kind::text from public.membership_events e join public.payments p on p.id = e.payment_id where p.id = :'pay_x'), 'joined', 'join event linked to payment');
select tests.eq((select received_on from public.payments where id = :'pay_x'), current_date, 'payment received');

-- already a member: renew instead
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": "555"}')$$, 'renew instead');
-- online renewal stacks on paid-through
select public.begin_renewal((select membership_id from public.payments where id = :'pay_x'), '66666666-0000-4000-8000-000000000021') as pay_r \gset
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws(format($$select public.begin_renewal((select membership_id from public.payments where id = %L), '66666666-0000-4000-8000-000000000021')$$, :'pay_x'), 'not allowed');
select tests.reset_role();
set local role service_role;
select tests.eq(public.complete_gateway_payment('evt_2', :'pay_r', 'pi_2', 2500, 'usd', true), 'active', 'renewed');
select tests.reset_role();
select tests.eq((select paid_through from public.memberships m join public.payments p on p.membership_id = m.id where p.id = :'pay_x'),
  public.term_end(public.term_end(current_date, 1, 'year') + 1, 1, 'year'), 'online renewal stacks');

-- ----- failures, mismatches and refunds -----
select tests.as_user('11111111-0000-4000-8000-000000000003');
select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000022', '{"44444444-0000-4000-8000-000000000031": "555-0101"}') as pay_m \gset
select tests.reset_role();
set local role service_role;
select tests.eq(public.fail_gateway_payment('evt_3', :'pay_m', 'Checkout expired'), 'failed', 'failed');
select tests.eq(public.complete_gateway_payment('evt_4', :'pay_m', 'pi_3', 999, 'usd', true), 'amount mismatch', 'amount checked');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select failure_reason from public.payments where id = :'pay_m'), 'Amount didn''t match the price', 'payer sees why');
select tests.reset_role();
set local role service_role;
select tests.eq(public.mark_payment_refunded('evt_5', 'stripe', 'pi_1', 1000), 'partly refunded', 'partial refund');
select tests.eq(public.mark_payment_refunded('evt_6', 'stripe', 'pi_1', 2500), 'refunded', 'full refund (running total)');
select tests.eq(public.mark_payment_refunded('evt_6', 'stripe', 'pi_1', 2500), 'duplicate', 'refund event once');
select tests.eq(public.mark_payment_refunded('evt_7', 'stripe', 'pi_nope', 2500), 'unknown payment', 'unknown charge');
select tests.reset_role();
select tests.eq((select status::text || '/' || refunded_amount_minor from public.payments where id = :'pay_x'), 'refunded/2500', 'refund recorded');

-- ----- approval: the chapter's own choice, overridden by a parent rule (D-130) -----
insert into public.org_settings (org_id, key, value, mode) values ('22222222-0000-4000-8000-000000000002', 'membership.approval_required', 'true', 'override');
select tests.eq(public.effective_approval_required('22222222-0000-4000-8000-000000000002'), true, 'chapter requires approval');
insert into public.org_settings (org_id, key, value, mode) values ('22222222-0000-4000-8000-000000000001', 'membership.child_approval', '"auto"', 'locked');
select tests.eq(public.effective_approval_required('22222222-0000-4000-8000-000000000002'), false, 'national auto-accepts for chapters');
update public.org_settings set value = '"chapter"' where key = 'membership.child_approval';
select tests.eq(public.effective_approval_required('22222222-0000-4000-8000-000000000002'), true, 'each chapter decides');
-- a chapter can't decide the rule for itself: blocked while locked, ignored when not
select tests.throws($$insert into public.org_settings (org_id, key, value, mode) values ('22222222-0000-4000-8000-000000000002', 'membership.child_approval', '"auto"', 'override')$$, 'locked by a parent');
update public.org_settings set mode = 'override' where key = 'membership.child_approval';
insert into public.org_settings (org_id, key, value, mode) values ('22222222-0000-4000-8000-000000000002', 'membership.child_approval', '"auto"', 'override');
select tests.eq(public.effective_approval_required('22222222-0000-4000-8000-000000000002'), true, 'own rule ignored');
select tests.eq(public.effective_approval_required('22222222-0000-4000-8000-000000000001'), false, 'national''s own default');

-- y has an admin-created record; joining claims it and waits for approval
insert into public.org_member_profiles (id, org_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000002', null, 'Y Historic', 'y@test.org', 'admin');
select tests.as_user('11111111-0000-4000-8000-000000000011');
select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": "555-0102"}') as pay_y \gset
select tests.reset_role();
set local role service_role;
select tests.eq(public.complete_gateway_payment('evt_8', :'pay_y', 'pi_8', 2500, 'usd', true), 'pending approval', 'waits for approval');
select tests.reset_role();
select tests.eq((select user_id from public.org_member_profiles where id = '33333333-0000-4000-8000-000000000021'), '11111111-0000-4000-8000-000000000011'::uuid, 'record claimed by paying');
select tests.eq((select count(*) from public.org_member_profiles where lower(email) = 'y@test.org'), 1::bigint, 'no second profile');
select tests.eq((select status::text from public.memberships where profile_id = '33333333-0000-4000-8000-000000000021'), 'pending', 'pending membership');
select tests.as_user('11111111-0000-4000-8000-000000000011');
select tests.throws($$select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": "555"}')$$, 'already waiting');
select tests.reset_role();
-- declining a Stripe-paid application hands back what the server needs to refund
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((public.decline_application((select id from public.memberships where profile_id = '33333333-0000-4000-8000-000000000021'), 'Not eligible') ->> 'gateway_ref'),
  'pi_8', 'refund reference for Stripe');
select tests.reset_role();
select tests.eq((select status::text from public.memberships where profile_id = '33333333-0000-4000-8000-000000000021'), 'declined', 'declined');

-- ----- test gateway: the payer picks the outcome (D-129) -----
insert into private.platform_flags (key, value) values ('test_gateway_everywhere', 'true');
update public.gateway_connections set gateway = 'test' where org_id = '22222222-0000-4000-8000-000000000002';
select tests.as_user('11111111-0000-4000-8000-000000000012');
select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000021', '{"44444444-0000-4000-8000-000000000031": "555-0103"}') as pay_z \gset
select tests.eq(public.complete_test_payment(:'pay_z', 'declined'), 'failed', 'test decline');
select tests.eq((select failure_reason from public.payments where id = :'pay_z'), 'Your card was declined.', 'decline reason');
select tests.eq(public.complete_test_payment(:'pay_z', 'insufficient_funds'), 'failed', 'test insufficient funds');
select tests.eq(public.complete_test_payment(:'pay_z', 'accepted'), 'pending approval', 'try again, accepted');
select tests.eq((select livemode from public.payments where id = :'pay_z'), false, 'test payments are never live');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws(format($$select public.complete_test_payment(%L, 'accepted')$$, :'pay_z'), 'not allowed');
select tests.reset_role();
-- declining a test-paid application refunds it right away
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((public.decline_application((select membership_id from public.payments where id = :'pay_z')) ->> 'refund'), 'done', 'test refund');
select tests.reset_role();
select tests.eq((select status::text from public.payments where id = :'pay_z'), 'refunded', 'test payment refunded');
-- members can't decline anyone
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws(format($$select public.decline_application((select membership_id from public.payments where id = %L))$$, :'pay_z'), 'not allowed');
select tests.reset_role();
rollback;
