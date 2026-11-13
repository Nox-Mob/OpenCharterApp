-- charter.api_payments (0015, S-18): payments that took money, with channel and chapter, for OpenLedgerApp.
begin;
select tests.fixture();
insert into charter.payments (unit_id, purpose, amount_minor, status, gateway, method, received_on) values
  ('22222222-0000-4000-8000-000000000001', 'join', 5000, 'paid', 'stripe', 'card', current_date),
  ('22222222-0000-4000-8000-000000000001', 'renew', 3000, 'paid', 'manual', 'check', current_date),
  ('22222222-0000-4000-8000-000000000002', 'renew', 2500, 'refunded', 'manual', 'cash', current_date),
  ('22222222-0000-4000-8000-000000000001', 'renew', 9900, 'failed', 'stripe', 'card', current_date),
  ('22222222-0000-4000-8000-000000000001', 'renew', 9900, 'pending', 'stripe', 'card', null);
select tests.eq((select count(*)::int from charter.api_payments where org_id = '22222222-0000-4000-8000-000000000001'),
  3, 'only payments that took money (paid or refunded)');
select tests.eq((select channel from charter.api_payments where amount_minor = 5000), 'card', 'Stripe is the card channel');
select tests.eq((select channel from charter.api_payments where amount_minor = 3000), 'other', 'a check is other');
select tests.eq((select is_national from charter.api_payments where amount_minor = 3000), true, 'paid to the organization itself');
select tests.eq((select is_national from charter.api_payments where amount_minor = 2500), false, 'paid to a chapter');
rollback;
