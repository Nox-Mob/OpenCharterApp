-- Receipts: the tax-exempt setting (receipts.tax_exempt). On (the default) the level's tax
-- treatment shows; off, every new receipt says the payment is not tax-deductible.
begin;
select tests.fixture();
insert into charter.membership_tiers (id, unit_id, key, name, tax_treatment) values
  ('55555555-0000-4000-8000-000000000071', '22222222-0000-4000-8000-000000000002', 'giving', 'Giving', 'deductible'),
  ('55555555-0000-4000-8000-000000000072', '22222222-0000-4000-8000-000000000003', 'giving', 'Giving', 'deductible');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000071', '55555555-0000-4000-8000-000000000071', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500),
  ('66666666-0000-4000-8000-000000000072', '55555555-0000-4000-8000-000000000072', '22222222-0000-4000-8000-000000000003', '1_year', '1 year', 1, 'year', 2500);
-- Chapter B is not tax-exempt.
insert into charter.org_settings (unit_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000003', 'receipts.tax_exempt', 'false', 'override');
-- A Chapter B admin, to record the payment there.
insert into charter.role_assignments (user_id, role_id, unit_id)
  select '11111111-0000-4000-8000-000000000002', id, '22222222-0000-4000-8000-000000000003' from charter.roles where key = 'org_admin' and unit_id is null;

select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.record_membership('33333333-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000071', current_date, 2500, 'check');
select charter.admin_create_member('22222222-0000-4000-8000-000000000003', 'Blake', '') as blake \gset
select charter.record_membership(:'blake', '66666666-0000-4000-8000-000000000072', current_date, 2500, 'check');
select tests.reset_role();

select tests.eq((select r.snapshot ->> 'tax_treatment' from charter.receipts r where r.unit_id = '22222222-0000-4000-8000-000000000002'),
  'deductible', 'tax-exempt (the default): the level''s treatment');
select tests.eq((select r.snapshot ->> 'tax_treatment' from charter.receipts r where r.unit_id = '22222222-0000-4000-8000-000000000003'),
  'non_deductible', 'not tax-exempt: never tax-deductible');
select tests.eq((select r.snapshot ->> 'tax_wording' from charter.receipts r where r.unit_id = '22222222-0000-4000-8000-000000000003'),
  'This payment is not tax-deductible as a charitable contribution.', 'and the receipt says so');
rollback;
