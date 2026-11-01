-- Memberships, standing and admin-recorded payments (E-13a)
begin;
select tests.fixture();

-- ----- date and standing rules (same cases as src/modules/membership tests) -----
select tests.eq(public.term_end('2026-03-15', 1, 'year'), '2027-03-14'::date, 'one year');
select tests.eq(public.term_end('2026-01-01', 3, 'month'), '2026-03-31'::date, 'three months');
select tests.eq(public.term_end('2026-01-01', 30, 'day'), '2026-01-30'::date, 'thirty days');
select tests.eq(public.term_end('2026-12-20', 20, 'day'), '2027-01-08'::date, 'days across a year');
select tests.eq(public.term_end('2026-01-31', 1, 'month'), '2026-02-28'::date, 'month end');
select tests.eq(public.term_end('2028-01-31', 1, 'month'), '2028-02-29'::date, 'leap month end');
select tests.eq(public.term_end('2028-02-29', 1, 'year'), '2029-02-28'::date, 'from leap day');
select tests.eq(public.term_end('2027-03-01', 1, 'year'), '2028-02-29'::date, 'into leap year');
select tests.eq(public.term_end('2026-01-01', null, null), null::date, 'lifetime');
select tests.eq(public.membership_standing('active', '2026-05-31', false, 30, '2026-05-31'), 'good', 'last paid day');
select tests.eq(public.membership_standing('active', '2026-05-31', false, 30, '2026-06-30'), 'grace', 'last grace day');
select tests.eq(public.membership_standing('active', '2026-05-31', false, 30, '2026-07-01'), 'lapsed', 'after grace');
select tests.eq(public.membership_standing('active', '2026-05-31', false, 0, '2026-06-01'), 'lapsed', 'no grace');
select tests.eq(public.membership_standing('active', null, true, 30, '2099-01-01'), 'good', 'lifetime');
select tests.eq(public.membership_standing('pending', null, false, 30, '2026-01-01'), 'pending', 'pending');
select tests.eq(public.renewal_start('active', '2026-05-31', false, 30, '2026-04-01'), '2026-06-01'::date, 'early renewal stacks');
select tests.eq(public.renewal_start('active', '2026-05-31', false, 30, '2026-06-20'), '2026-06-01'::date, 'grace renewal stacks');
select tests.eq(public.renewal_start('active', '2026-05-31', false, 30, '2026-07-15'), '2026-07-15'::date, 'lapsed restarts today');
select tests.eq(public.renewal_start('cancelled', '2026-05-31', false, 30, '2026-04-01'), '2026-04-01'::date, 'rejoin starts today');

-- levels: chapter A sells "Local" (1 year $25, lifetime $300, a retired 6-month term); national sells "Nat"
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000002', 'local', 'Local'),
  ('55555555-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000001', 'nat', 'Nat'),
  ('55555555-0000-4000-8000-000000000013', '22222222-0000-4000-8000-000000000003', 'b_level', 'B level');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor, active) values
  ('66666666-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500, true),
  ('66666666-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000002', 'lifetime', 'Lifetime', null, null, 30000, true),
  ('66666666-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000002', '6_month', '6 months', 6, 'month', 1500, false),
  ('66666666-0000-4000-8000-000000000004', '55555555-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 5000, true),
  ('66666666-0000-4000-8000-000000000005', '55555555-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000002', '1_day', '1 day', 1, 'day', 100, true),
  ('66666666-0000-4000-8000-000000000006', '55555555-0000-4000-8000-000000000013', '22222222-0000-4000-8000-000000000003', '1_year', '1 year', 1, 'year', 100, true);

-- only admin-created records may lack a login
select tests.throws($$insert into public.org_member_profiles (org_id, user_id, source) values ('22222222-0000-4000-8000-000000000002', null, 'signup')$$, 'login_or_record');

-- ----- member records without a login -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.admin_create_member('22222222-0000-4000-8000-000000000002', 'Pat Historic', '') as pat \gset
select public.admin_create_member('22222222-0000-4000-8000-000000000002', 'Casey Claim', 'Claim@Test.org') as casey \gset
select tests.throws($$select public.admin_create_member('22222222-0000-4000-8000-000000000002', 'Dup', 'claim@test.org')$$, 'already a member');
select tests.throws($$select public.admin_create_member('22222222-0000-4000-8000-000000000002', '', '')$$, 'give the member a name');
select tests.throws($$select public.admin_create_member('22222222-0000-4000-8000-000000000002', 'X', 'not-an-email')$$, 'invalid email');
-- chapter admin can't add members to a sibling chapter or the national
select tests.throws($$select public.admin_create_member('22222222-0000-4000-8000-000000000003', 'X', '')$$, 'not allowed');
select tests.throws($$select public.admin_create_member('22222222-0000-4000-8000-000000000001', 'X', '')$$, 'not allowed');
-- the record's contact details can be fixed later
select public.update_member_record(:'pat', 'Pat Historic Jr.', 'pat@test.org');
select tests.throws($$select public.update_member_record('33333333-0000-4000-8000-000000000003', 'Morgan', 'm@test.org')$$, 'manages their own');
select tests.reset_role();
select tests.eq((select email from public.org_member_profiles where id = :'pat'), 'pat@test.org', 'record email updated');
select tests.eq((select source from public.org_member_profiles where id = :'casey'), 'admin', 'record source');
select tests.eq((select email from public.org_member_profiles where id = :'casey'), 'claim@test.org', 'email lowercased');

-- members and outsiders can't create records
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.admin_create_member('22222222-0000-4000-8000-000000000002', 'X', '')$$, 'not allowed');
select tests.reset_role();

-- ----- recording joins and renewals -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
-- a historical member who joined in 2020 for one year (long lapsed)
select public.record_membership(:'pat', '66666666-0000-4000-8000-000000000001', '2020-01-01', 2500, 'check', 'Check #1001', '2020-01-01') as pat_m \gset
select tests.reset_role();
select tests.eq((select paid_through from public.memberships where id = :'pat_m'), '2020-12-31'::date, 'historical term');
select tests.eq((select status::text from public.memberships where id = :'pat_m'), 'active', 'active');
select tests.eq((select amount_minor from public.payments where membership_id = :'pat_m'), 2500, 'payment recorded');
select tests.eq((select method::text || '/' || gateway::text || '/' || status::text from public.payments where membership_id = :'pat_m'), 'check/manual/paid', 'manual check payment');
select tests.eq((select kind::text from public.membership_events where membership_id = :'pat_m'), 'joined', 'join event');

-- lapsed renewal restarts today
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.record_membership(:'pat', '66666666-0000-4000-8000-000000000001', current_date, 2500, 'cash');
select tests.reset_role();
select tests.eq((select joined_on from public.memberships where id = :'pat_m'), '2020-01-01'::date, 'renewal keeps join date');
select tests.eq((select period_start from public.membership_events where membership_id = :'pat_m' and kind = 'renewed'), current_date, 'lapsed renewal starts today');

-- early renewal stacks on paid_through
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.record_membership(:'pat', '66666666-0000-4000-8000-000000000001', current_date, 2500, 'cash');
select tests.reset_role();
select tests.eq((select paid_through from public.memberships where id = :'pat_m'),
  public.term_end(public.term_end(current_date, 1, 'year') + 1, 1, 'year'), 'early renewal stacks');
select tests.eq((select count(*) from public.payments where membership_id = :'pat_m'), 3::bigint, 'three payments');

-- a renewal in grace stacks too: a 1-day term that ended 10 days ago
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.record_membership('33333333-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000005', current_date - 10, null, null, '', current_date - 10) as morgan_m \gset
select public.record_membership('33333333-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000001', current_date);
select tests.reset_role();
select tests.eq((select period_start from public.membership_events where membership_id = :'morgan_m' and kind = 'renewed'), current_date - 9, 'grace renewal stacks');
select tests.eq((select count(*) from public.payments where membership_id = :'morgan_m'), 0::bigint, 'no amount, no payment');

-- lifetime: no end date, and no renewing it
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.record_membership(:'casey', '66666666-0000-4000-8000-000000000002', current_date, 30000, 'card') as casey_m \gset
select tests.throws(format($$select public.record_membership(%L, '66666666-0000-4000-8000-000000000001', current_date)$$, :'casey'), 'lifetime member');
-- only this org's active levels
select tests.throws(format($$select public.record_membership(%L, '66666666-0000-4000-8000-000000000004')$$, :'pat'), 'isn''t offered here');
select tests.throws(format($$select public.record_membership(%L, '66666666-0000-4000-8000-000000000003')$$, :'pat'), 'retired');
select tests.reset_role();
select tests.eq((select lifetime and paid_through is null from public.memberships where id = :'casey_m'), true, 'lifetime');

-- an amount needs payments.manage: a registrar can record memberships but not money
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.create_role('22222222-0000-4000-8000-000000000002', 'registrar', 'Registrar', '', array['members.view', 'members.manage']);
select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'registrar');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws(format($$select public.record_membership(%L, '66666666-0000-4000-8000-000000000001', current_date, 2500, 'cash')$$, :'pat'), 'not allowed to record payments');
select public.record_membership(:'pat', '66666666-0000-4000-8000-000000000001', current_date);
select tests.reset_role();

-- chapter admin can't record for a sibling chapter's member
insert into public.org_member_profiles (id, org_id, user_id, email) values
  ('33333333-0000-4000-8000-000000000009', '22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000004', 'x@test.org');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.record_membership('33333333-0000-4000-8000-000000000009', '66666666-0000-4000-8000-000000000006')$$, 'not allowed');
select tests.reset_role();

-- ----- who can read what -----
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.memberships), 0::bigint, 'outsider sees no memberships');
select tests.eq((select count(*) from public.payments), 0::bigint, 'outsider sees no payments');
select tests.eq((select count(*) from public.membership_events), 0::bigint, 'outsider sees no events');
select tests.reset_role();
-- a plain member sees only their own membership (remove the registrar role first)
delete from public.role_assignments ra using public.roles r where r.id = ra.role_id and r.key = 'registrar';
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from public.memberships), 1::bigint, 'member sees own membership');
select tests.eq((select count(*) from public.membership_events), 2::bigint, 'member sees own history');
select tests.eq((select count(*) from public.payments), 0::bigint, 'member has no payments');
select tests.reset_role();
-- national admin sees the chapter's memberships (downward)
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from public.memberships), 3::bigint, 'national sees chapter memberships');
select tests.reset_role();

-- ----- clients can't write membership tables directly -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into public.memberships (org_id, profile_id, tier_id, term_id, status) values ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000011', '66666666-0000-4000-8000-000000000001', 'pending')$$, 'row-level security');
select tests.throws($$insert into public.payments (org_id, purpose, amount_minor, status) values ('22222222-0000-4000-8000-000000000002', 'join', 1, 'paid')$$, 'row-level security');
update public.memberships set status = 'cancelled';
delete from public.payments;
delete from public.memberships;
select tests.reset_role();
select tests.eq((select count(*) from public.memberships where status = 'active'), 3::bigint, 'client update changed nothing');
select tests.eq((select count(*) from public.payments), 4::bigint, 'client delete removed nothing');
select tests.throws($$update public.membership_events set note = 'edited'$$, 'can''t be changed');
select tests.throws($$delete from public.membership_events$$, 'can''t be changed');
-- ...but history goes with its membership (cascade), e.g. demo cleanup
savepoint cascade_check;
delete from public.memberships where id = :'morgan_m';
select tests.eq((select count(*) from public.membership_events where membership_id = :'morgan_m'), 0::bigint, 'cascade removes history');
-- payments are never removed with a membership
select tests.throws(format($$delete from public.memberships where id = %L$$, :'casey_m'), 'payments_membership_id_fkey');
rollback to savepoint cascade_check;

-- ----- applications: approve, decline, cancel, rejoin -----
insert into public.org_member_profiles (id, org_id, user_id, email) values
  ('33333333-0000-4000-8000-000000000010', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000004', 'x@test.org');
insert into public.memberships (id, org_id, profile_id, tier_id, term_id, status) values
  ('77777777-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000010',
   '55555555-0000-4000-8000-000000000011', '66666666-0000-4000-8000-000000000001', 'pending');
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.approve_membership('77777777-0000-4000-8000-000000000001')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.record_membership('33333333-0000-4000-8000-000000000010', '66666666-0000-4000-8000-000000000001')$$, 'approve or decline');
select public.approve_membership('77777777-0000-4000-8000-000000000001', 'Welcome');
select tests.throws($$select public.approve_membership('77777777-0000-4000-8000-000000000001')$$, 'only pending');
select tests.throws($$select public.decline_membership('77777777-0000-4000-8000-000000000001')$$, 'only pending');
select tests.reset_role();
select tests.eq((select joined_on from public.memberships where id = '77777777-0000-4000-8000-000000000001'), current_date, 'approved today');
select tests.eq((select paid_through from public.memberships where id = '77777777-0000-4000-8000-000000000001'), public.term_end(current_date, 1, 'year'), 'term starts at approval');

select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.cancel_membership('77777777-0000-4000-8000-000000000001', 'Moved away');
select tests.throws($$select public.cancel_membership('77777777-0000-4000-8000-000000000001')$$, 'only active');
-- recording again rejoins
select public.record_membership('33333333-0000-4000-8000-000000000010', '66666666-0000-4000-8000-000000000001');
select tests.reset_role();
select tests.eq((select string_agg(kind::text, ',' order by id) from public.membership_events where membership_id = '77777777-0000-4000-8000-000000000001'),
  'approved,cancelled,joined', 'history kept');

update public.memberships set status = 'pending', joined_on = null, paid_through = null where id = '77777777-0000-4000-8000-000000000001';
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.decline_membership('77777777-0000-4000-8000-000000000001', 'Not eligible');
select tests.reset_role();
select tests.eq((select status::text from public.memberships where id = '77777777-0000-4000-8000-000000000001'), 'declined', 'declined');

-- ----- grace period comes from settings, a locked national value wins -----
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000002', 'membership.grace_days', '10', 'override');
select tests.eq(public.grace_days('22222222-0000-4000-8000-000000000002'), 10, 'chapter grace');
select tests.eq(public.grace_days('22222222-0000-4000-8000-000000000003'), 30, 'default grace');
delete from public.org_settings where org_id = '22222222-0000-4000-8000-000000000002';
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000001', 'membership.grace_days', '45', 'locked');
select tests.eq(public.grace_days('22222222-0000-4000-8000-000000000002'), 45, 'locked national grace');

-- ----- an invitation claims the record with the same email -----
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000009', 'claim@test.org');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.create_invitation('22222222-0000-4000-8000-000000000002', 'claim@test.org', 'member') as tok \gset
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000009');
select public.accept_invitation(:'tok');
select tests.eq((select count(*) from public.memberships), 1::bigint, 'claimed member sees the lifetime membership');
select tests.reset_role();
select tests.eq((select user_id from public.org_member_profiles where id = :'casey'), '11111111-0000-4000-8000-000000000009'::uuid, 'record claimed');
select tests.eq((select claimed_at is not null from public.org_member_profiles where id = :'casey'), true, 'claimed_at set');
select tests.eq((select count(*) from public.org_member_profiles where lower(email) = 'claim@test.org'), 1::bigint, 'no second profile');
rollback;
