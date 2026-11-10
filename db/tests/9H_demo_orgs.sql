-- Demo organizations (D-148): operators only, inherited, fixed, test gateway, no email, deletable
begin;
select tests.fixture();
-- n is a platform operator; a (chapter A admin) is not
insert into charter.platform_operators (user_id) values ('11111111-0000-4000-8000-000000000001');

select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq(charter.is_platform_operator(), false, 'not an operator');
select tests.throws($$select charter.create_demo_organization('QA Demo', 'qa-demo', 'national')$$, 'only platform operators');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq(charter.is_platform_operator(), true, 'operator');
select tests.throws($$select charter.create_demo_organization('QA Chapter', 'qa-ch', 'chapter')$$, 'starts at the top');
select charter.create_demo_organization('QA Demo', 'qa-demo', 'national') as demo \gset
-- its chapters are demo too, created the usual way
select charter.create_organization('QA Austin', 'qa-austin', 'chapter', :'demo') as demo_ch \gset
select tests.reset_role();
select tests.eq((select is_demo from charter.units where id = :'demo'), true, 'demo national');
select tests.eq((select is_demo from charter.units where id = :'demo_ch'), true, 'chapter inherits demo');
select tests.eq((select bool_or(is_demo) from charter.units where slug in ('nat', 'ch-a', 'ch-b')), false, 'production stays production');
select tests.eq((select count(*) from charter.role_assignments where unit_id = :'demo'), 1::bigint, 'creator is its admin');

-- the flag never changes, in either direction: clients can't write it at all, and not even the
-- database owner can flip it
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws(format($$update charter.units set is_demo = false where id = %L$$, :'demo'), 'permission denied');
select tests.reset_role();
select tests.throws(format($$update charter.units set is_demo = false where id = %L$$, :'demo'), 'switch between demo and production');
select tests.throws($$update charter.units set is_demo = true where slug = 'nat'$$, 'switch between demo and production');
-- a sub-org always follows its parent, even when inserted directly
insert into charter.units (parent_id, type, name, slug, is_demo) values
  ('22222222-0000-4000-8000-000000000001', 'chapter', 'Sneaky', 'sneaky', true);
select tests.eq((select is_demo from charter.units where slug = 'sneaky'), false, 'a production parent wins');

-- ----- test gateway and email -----
select tests.eq(charter.test_gateway_allowed(:'demo_ch'), true, 'test payments in a new demo org');
select tests.eq(charter.test_gateway_allowed('22222222-0000-4000-8000-000000000002'), false, 'not in production');
select tests.eq(charter.emails_allowed(:'demo'), false, 'demo orgs never email');
select tests.eq(charter.emails_allowed('22222222-0000-4000-8000-000000000002'), true, 'production may');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws(format($$select charter.emails_allowed(%L)$$, :'demo'), 'permission denied');
select tests.reset_role();

-- ----- data in the demo org -----
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000081', 'qa@test.org');
insert into charter.member_profiles (id, unit_id, user_id, display_name, email) values
  ('33333333-0000-4000-8000-000000000081', :'demo_ch', '11111111-0000-4000-8000-000000000081', 'QA Member', 'qa@test.org');
insert into charter.membership_tiers (id, unit_id, key, name) values ('55555555-0000-4000-8000-000000000081', :'demo_ch', 'qa', 'QA');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000081', '55555555-0000-4000-8000-000000000081', :'demo_ch', '1_year', '1 year', 1, 'year', 2500);
insert into charter.memberships (id, unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('77777777-0000-4000-8000-000000000081', :'demo_ch', '33333333-0000-4000-8000-000000000081',
   '55555555-0000-4000-8000-000000000081', '66666666-0000-4000-8000-000000000081', 'active', current_date, current_date + 300);
insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id)
  values (:'demo_ch', '77777777-0000-4000-8000-000000000081', 'joined', '55555555-0000-4000-8000-000000000081', '66666666-0000-4000-8000-000000000081');
insert into charter.payments (unit_id, membership_id, profile_id, purpose, amount_minor, status, gateway, method, received_on)
  values (:'demo_ch', '77777777-0000-4000-8000-000000000081', '33333333-0000-4000-8000-000000000081', 'join', 2500, 'paid', 'manual', 'check', current_date);
select tests.as_user('11111111-0000-4000-8000-000000000001');
select charter.define_seat(:'demo', 'president', 'President', '', true, 1, 1, 'year', null, 'chapters') as seat \gset
select charter.appoint_officer(:'demo_ch', :'seat', '33333333-0000-4000-8000-000000000081', current_date);
select charter.set_seat_term(:'demo_ch', :'seat', 2, 'year', current_date, 'QA bylaws', '');
select tests.reset_role();
select tests.eq((select count(*) from charter.receipts where unit_id = :'demo_ch'), 1::bigint, 'a receipt exists');

-- ----- deleting -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.delete_demo_organization('22222222-0000-4000-8000-000000000002', 'Chapter A')$$, 'only demo organizations');
select tests.throws(format($$select charter.delete_demo_organization(%L, 'QA Demo')$$, :'demo'), 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws(format($$select charter.delete_demo_organization(%L, 'QA Austin')$$, :'demo_ch'), 'from its top');
select tests.throws(format($$select charter.delete_demo_organization(%L, 'qa demo')$$, :'demo'), 'type the organization''s name');
select tests.eq(array_length(charter.delete_demo_organization(:'demo', 'QA Demo'), 1), 2, 'deleted the org and its chapter');
select tests.reset_role();
select tests.eq((select count(*) from charter.units where id in (:'demo', :'demo_ch')), 0::bigint, 'orgs gone');
select tests.eq((select count(*) from charter.payments where unit_id = :'demo_ch')
  + (select count(*) from charter.receipts where unit_id = :'demo_ch')
  + (select count(*) from charter.memberships where unit_id = :'demo_ch')
  + (select count(*) from charter.membership_events where unit_id = :'demo_ch')
  + (select count(*) from charter.member_profiles where unit_id in (:'demo', :'demo_ch'))
  + (select count(*) from charter.seat_templates where unit_id = :'demo')
  + (select count(*) from charter.appointments where unit_id = :'demo_ch')
  + (select count(*) from charter.seat_terms where unit_id = :'demo_ch')
  + (select count(*) from charter.tier_terms where unit_id = :'demo_ch')
  + (select count(*) from charter.role_assignments where unit_id in (:'demo', :'demo_ch')), 0::bigint, 'all its data gone');
select tests.eq((select count(*) from auth.users where id = '11111111-0000-4000-8000-000000000081'), 1::bigint, 'accounts stay');
select tests.eq((select after ->> 'organizations_deleted' from charter.audit_events
  where action = 'delete' and target_type = 'demo_organization'), '2', 'the deletion is recorded');
select tests.eq((select count(*) from charter.units where slug in ('nat', 'ch-a', 'ch-b')), 3::bigint, 'production untouched');
rollback;
