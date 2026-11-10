-- Payment gateway connections (E-12): who can connect, test gateway limits, secrets stay private
begin;
select tests.fixture();
-- a demo national (is_demo, D-148) run by the national admin
insert into charter.units (id, type, name, slug, is_demo) values ('d1000000-0000-4000-8000-0000000000aa', 'national', 'Demo', 'demo-x', true);
insert into charter.role_assignments (user_id, role_id, unit_id)
  select '11111111-0000-4000-8000-000000000001', id, 'd1000000-0000-4000-8000-0000000000aa' from charter.roles where key = 'org_admin' and unit_id is null;

-- ----- test gateway: demo orgs only -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.connect_test_gateway('22222222-0000-4000-8000-000000000002')$$, 'only available to demo');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select charter.connect_test_gateway('d1000000-0000-4000-8000-0000000000aa');
select tests.reset_role();
select tests.eq((select gateway::text || '/' || status::text || '/' || livemode::text from charter.gateway_connections where unit_id = 'd1000000-0000-4000-8000-0000000000aa'),
  'test/verified/false', 'demo test connection');
-- the operator can allow it everywhere (e.g. a preview install)
insert into charter.platform_flags (key, value) values ('test_gateway_everywhere', 'true');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.connect_test_gateway('22222222-0000-4000-8000-000000000002');
select tests.reset_role();
delete from charter.platform_flags;
-- with the flag gone, a real org can't (re)enable test payments
select tests.throws($$update charter.gateway_connections set status = 'verified' where unit_id = '22222222-0000-4000-8000-000000000002'$$, 'only available to demo');
-- test connections are never live
update charter.gateway_connections set livemode = true where unit_id = 'd1000000-0000-4000-8000-0000000000aa';
select tests.eq((select livemode from charter.gateway_connections where unit_id = 'd1000000-0000-4000-8000-0000000000aa'), false, 'test never live');

-- ----- Stripe connection: only sealed credentials, only by payment managers -----
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select charter.save_stripe_connection('22222222-0000-4000-8000-000000000002', 'v1:aaaa:bbbb', 'Stripe', false)$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.save_stripe_connection('22222222-0000-4000-8000-000000000002', 'sk_test_plaintext', 'Stripe', false)$$, 'must be sealed');
select charter.save_stripe_connection('22222222-0000-4000-8000-000000000002', 'v1:aXY=:Y2lwaGVy', 'Stripe (test mode)', false);
-- clients can't read the secrets, call the server-only functions or write connections directly
select tests.throws($$select * from charter.gateway_secrets$$, 'permission denied');
select tests.throws($$select charter.gateway_sealed_credentials('22222222-0000-4000-8000-000000000002')$$, 'permission denied');
select tests.throws($$select charter.claim_webhook_event('22222222-0000-4000-8000-000000000002', 'stripe', 'evt_1', 'x')$$, 'permission denied');
select tests.throws($$insert into charter.gateway_connections (unit_id, gateway) values ('22222222-0000-4000-8000-000000000003', 'stripe')$$, 'row-level security');
update charter.gateway_connections set account_label = 'hacked';
select tests.reset_role();
select tests.eq((select gateway::text || '/' || account_label from charter.gateway_connections where unit_id = '22222222-0000-4000-8000-000000000002'),
  'stripe/Stripe (test mode)', 'stripe connection saved, client update ignored');

-- ----- who sees connections -----
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from charter.gateway_connections), 0::bigint, 'member sees no connections');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from charter.gateway_connections), 0::bigint, 'outsider sees no connections');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from charter.gateway_connections), 2::bigint, 'national sees its own and its chapter''s');
select tests.reset_role();

-- ----- the server role reads credentials and claims events once -----
set local role service_role;
select tests.eq(charter.gateway_sealed_credentials('22222222-0000-4000-8000-000000000002'), 'v1:aXY=:Y2lwaGVy', 'server reads sealed credentials');
select tests.eq(charter.claim_webhook_event('22222222-0000-4000-8000-000000000002', 'stripe', 'evt_1', 'checkout.session.completed'), true, 'first delivery');
select tests.eq(charter.claim_webhook_event('22222222-0000-4000-8000-000000000002', 'stripe', 'evt_1', 'checkout.session.completed'), false, 'duplicate delivery');
select tests.reset_role();

-- ----- disconnecting removes the credentials -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.disconnect_gateway('22222222-0000-4000-8000-000000000002');
select tests.reset_role();
select tests.eq((select status::text from charter.gateway_connections where unit_id = '22222222-0000-4000-8000-000000000002'), 'disabled', 'disconnected');
select tests.eq((select count(*) from charter.gateway_secrets), 0::bigint, 'credentials removed');
set local role service_role;
select tests.eq(charter.gateway_sealed_credentials('22222222-0000-4000-8000-000000000002'), null::text, 'nothing to read after disconnect');
select tests.reset_role();
rollback;
