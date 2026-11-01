-- Receipts (E-15): automatic issue, numbering per org and year, immutability, void / reissue, refunds
begin;
select tests.fixture();
insert into public.tax_profiles (org_id, legal_name, ein, tax_status) values
  ('22222222-0000-4000-8000-000000000002', 'Chapter A Inc.', '12-3456789', '501(c)(3)');
insert into public.membership_tiers (id, org_id, key, name, tax_treatment) values
  ('55555555-0000-4000-8000-000000000041', '22222222-0000-4000-8000-000000000002', 'regular', 'Regular', 'deductible'),
  ('55555555-0000-4000-8000-000000000042', '22222222-0000-4000-8000-000000000003', 'b', 'B level', 'non_deductible');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000041', '55555555-0000-4000-8000-000000000041', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500),
  ('66666666-0000-4000-8000-000000000042', '55555555-0000-4000-8000-000000000042', '22222222-0000-4000-8000-000000000003', '1_year', '1 year', 1, 'year', 1000);
update public.org_member_profiles set display_name = 'Morgan' where id = '33333333-0000-4000-8000-000000000003';
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000002', 'receipts.footer', '"Thank you for your support."', 'override');

-- ----- recording a paid membership issues a receipt -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.record_membership('33333333-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000041', current_date, 2500, 'check', 'Check #1') as m1 \gset
select public.admin_create_member('22222222-0000-4000-8000-000000000002', 'Pat', '') as pat \gset
select public.record_membership(:'pat', '66666666-0000-4000-8000-000000000041', current_date, 2500, 'cash');
-- no amount, no payment, no receipt
select public.admin_create_member('22222222-0000-4000-8000-000000000002', 'Comp', '') as comp \gset
select public.record_membership(:'comp', '66666666-0000-4000-8000-000000000041');
select tests.reset_role();
select tests.eq((select count(*) from public.receipts), 2::bigint, 'one receipt per paid payment');
select tests.eq((select number from public.receipts r join public.payments p on p.id = r.payment_id where p.membership_id = :'m1'),
  extract(year from now())::int || '-00001', 'first number of the year');
select tests.eq((select max(number) from public.receipts), extract(year from now())::int || '-00002', 'numbers follow on');
select tests.eq((select snapshot -> 'issuer' ->> 'legal_name' from public.receipts where seq = 1), 'Chapter A Inc.', 'issuer frozen');
select tests.eq((select snapshot -> 'issuer' ->> 'ein' from public.receipts where seq = 1), '12-3456789', 'EIN frozen');
select tests.eq((select snapshot -> 'payer' ->> 'name' from public.receipts where seq = 1), 'Morgan', 'payer frozen');
select tests.eq((select (snapshot ->> 'net_minor')::int from public.receipts where seq = 1), 2500, 'amount');
select tests.eq((select snapshot ->> 'method' from public.receipts where seq = 1), 'check', 'method');
select tests.eq((select snapshot ->> 'tax_treatment' from public.receipts where seq = 1), 'deductible', 'tax treatment from the level');
select tests.eq((select snapshot ->> 'footer' from public.receipts where seq = 1), 'Thank you for your support.', 'footer setting');
select tests.eq((select snapshot -> 'items' -> 0 ->> 'description' from public.receipts where seq = 1), 'Regular membership · 1 year', 'item');

-- numbering is per organization
insert into public.org_member_profiles (id, org_id, user_id, email, display_name) values
  ('33333333-0000-4000-8000-000000000041', '22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000004', 'x@test.org', 'Xavi');
insert into public.role_assignments (user_id, role_id, org_id)
  select '11111111-0000-4000-8000-000000000004', id, '22222222-0000-4000-8000-000000000003' from public.roles where key = 'org_admin' and org_id is null;
select tests.as_user('11111111-0000-4000-8000-000000000004');
select public.record_membership('33333333-0000-4000-8000-000000000041', '66666666-0000-4000-8000-000000000042', current_date, 1000, 'cash');
select tests.reset_role();
select tests.eq((select number from public.receipts where org_id = '22222222-0000-4000-8000-000000000003'), extract(year from now())::int || '-00001', 'own sequence per org');
delete from public.role_assignments where user_id = '11111111-0000-4000-8000-000000000004';

-- ----- receipts can't be changed or deleted -----
select tests.throws($$update public.receipts set snapshot = '{}' where seq = 1 and org_id = '22222222-0000-4000-8000-000000000002'$$, 'can''t be changed');
select tests.throws($$update public.receipts set number = 'X' where seq = 1$$, 'can''t be changed');
select tests.throws($$delete from public.receipts where seq = 1$$, 'can''t be deleted');

-- ----- who can read receipts -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select count(*) from public.receipts), 2::bigint, 'chapter admin sees its receipts only');
select tests.throws($$insert into public.receipts (org_id, payment_id, number, year, seq, snapshot) select org_id, id, 'Z', 2000, 1, '{}' from public.payments limit 1$$, 'row-level security');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from public.receipts), 1::bigint, 'member sees their own receipt');
select tests.throws($$select public.void_receipt((select id from public.receipts limit 1), 'mine')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.receipts), 1::bigint, 'B member sees only theirs');
select tests.reset_role();

-- ----- void, issue again, reissue -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.void_receipt((select id from public.receipts where seq = 2 and org_id = '22222222-0000-4000-8000-000000000002'), ' ')$$, 'give a reason');
select public.void_receipt((select id from public.receipts where seq = 2 and org_id = '22222222-0000-4000-8000-000000000002'), 'Wrong payer');
select tests.throws($$select public.void_receipt((select id from public.receipts where seq = 2 and org_id = '22222222-0000-4000-8000-000000000002'), 'again')$$, 'only issued');
select public.issue_receipt((select payment_id from public.receipts where seq = 2 and org_id = '22222222-0000-4000-8000-000000000002'));
select tests.throws($$select public.issue_receipt((select payment_id from public.receipts where seq = 2 and org_id = '22222222-0000-4000-8000-000000000002'))$$, 'already has a receipt');
select tests.reset_role();
select tests.eq((select max(seq) from public.receipts where org_id = '22222222-0000-4000-8000-000000000002'), 3, 'new number, no gap');

update public.tax_profiles set legal_name = 'Chapter A Association' where org_id = '22222222-0000-4000-8000-000000000002';
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.reissue_receipt((select id from public.receipts where seq = 1 and org_id = '22222222-0000-4000-8000-000000000002'), 'Legal name corrected') as re \gset
select tests.throws($$select public.reissue_receipt((select id from public.receipts where seq = 1 and org_id = '22222222-0000-4000-8000-000000000002'), 'x')$$, 'only the current');
select tests.reset_role();
select tests.eq((select status::text from public.receipts where seq = 1 and org_id = '22222222-0000-4000-8000-000000000002'), 'superseded', 'old version kept as superseded');
select tests.eq((select snapshot -> 'issuer' ->> 'legal_name' from public.receipts where seq = 1 and org_id = '22222222-0000-4000-8000-000000000002'), 'Chapter A Inc.', 'old version unchanged');
select tests.eq((select snapshot -> 'issuer' ->> 'legal_name' from public.receipts where id = :'re'), 'Chapter A Association', 'new version uses today''s details');
select tests.eq((select s.seq from public.receipts r join public.receipts s on s.id = r.supersedes_id where r.id = :'re'), 1, 'new version points back');

-- ----- refunds: partial replaces with the net amount, full voids -----
update public.payments set refunded_amount_minor = 1000 where membership_id = :'m1';
select tests.eq((select (snapshot ->> 'net_minor')::int from public.receipts r join public.payments p on p.id = r.payment_id
  where p.membership_id = :'m1' and r.status = 'issued'), 1500, 'partial refund: net amount');
select tests.eq((select void_reason from public.receipts where id = :'re'), 'Partly refunded', 'previous version superseded');
update public.payments set refunded_amount_minor = 2500, status = 'refunded' where membership_id = :'m1';
select tests.eq((select count(*) from public.receipts r join public.payments p on p.id = r.payment_id
  where p.membership_id = :'m1' and r.status = 'issued'), 0::bigint, 'full refund: no current receipt');
select tests.eq((select void_reason from public.receipts r join public.payments p on p.id = r.payment_id
  where p.membership_id = :'m1' and r.status = 'voided'), 'Refunded', 'voided as refunded');
select tests.eq((select count(*) from public.receipts r join public.payments p on p.id = r.payment_id where p.membership_id = :'m1'), 3::bigint, 'every version kept');
rollback;
