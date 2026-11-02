-- Attribute-based pricing (E-19, D-147). The cases match src/engines/rules/rules.test.ts.
begin;
select tests.fixture();
-- Chapter A: Rank (ordered E-1..E-5), Veteran (yes/no), State (choice), Years (number), Since (date)
insert into public.attribute_definitions (id, org_id, key, label, data_type, required, member_editable) values
  ('44444444-0000-4000-8000-000000000071', '22222222-0000-4000-8000-000000000002', 'rank', 'Rank', 'ordered', false, true),
  ('44444444-0000-4000-8000-000000000072', '22222222-0000-4000-8000-000000000002', 'veteran', 'Veteran', 'boolean', false, true),
  ('44444444-0000-4000-8000-000000000073', '22222222-0000-4000-8000-000000000002', 'state', 'State', 'choice', false, true),
  ('44444444-0000-4000-8000-000000000074', '22222222-0000-4000-8000-000000000002', 'years', 'Years', 'number', false, true),
  ('44444444-0000-4000-8000-000000000075', '22222222-0000-4000-8000-000000000002', 'since', 'Since', 'date', false, true);
insert into public.attribute_options (definition_id, org_id, value, label, sort_order)
  select '44444444-0000-4000-8000-000000000071', '22222222-0000-4000-8000-000000000002', 'E' || n, 'E-' || n, n * 10 from generate_series(1, 5) n;
insert into public.attribute_options (definition_id, org_id, value, label, sort_order) values
  ('44444444-0000-4000-8000-000000000073', '22222222-0000-4000-8000-000000000002', 'TX', 'Texas', 10),
  ('44444444-0000-4000-8000-000000000073', '22222222-0000-4000-8000-000000000002', 'OK', 'Oklahoma', 20),
  ('44444444-0000-4000-8000-000000000073', '22222222-0000-4000-8000-000000000002', 'NM', 'New Mexico', 30);
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-000000000071', '22222222-0000-4000-8000-000000000002', 'local', 'Local');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000071', '55555555-0000-4000-8000-000000000071', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 5000);
insert into public.gateway_connections (org_id, gateway, account_label, livemode) values
  ('22222222-0000-4000-8000-000000000002', 'stripe', 'Stripe', true);

create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'senior', public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, 'Senior ranks',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000071", "op": "at_least", "value": "E4"}]', 3000, null, 10);
insert into ids select 'veteran', public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, 'Veterans',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000072", "op": "is", "value": true}]', null, 20, 20);
insert into ids select 'region', public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, 'Long-time neighbours',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000073", "op": "in", "values": ["TX", "OK"]},
    {"attribute_id": "44444444-0000-4000-8000-000000000074", "op": "at_least", "value": 10},
    {"attribute_id": "44444444-0000-4000-8000-000000000075", "op": "at_most", "value": "2000-01-01"}]', 1000, null, 30);
insert into ids select 'everyone', public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, 'Old promo', '[]', 100, null, 40);
select public.set_pricing_rule_active((select id from ids where k = 'everyone'), false);
select tests.reset_role();

-- ----- the shared cases -----
create temp table cases (name text, vals jsonb, want int);
insert into cases values
  ('rank E-5 → senior price', '{"44444444-0000-4000-8000-000000000071": "E5"}', 3000),
  ('rank E-4 counts as at least E-4', '{"44444444-0000-4000-8000-000000000071": "E4"}', 3000),
  ('rank E-2 veteran → 20% off', '{"44444444-0000-4000-8000-000000000071": "E2", "44444444-0000-4000-8000-000000000072": true}', 4000),
  ('rank E-4 veteran → first rule wins', '{"44444444-0000-4000-8000-000000000071": "E4", "44444444-0000-4000-8000-000000000072": true}', 3000),
  ('rank E-2 → base price', '{"44444444-0000-4000-8000-000000000071": "E2"}', 5000),
  ('no answers → base price (retired rule ignored)', '{}', 5000),
  ('all conditions hold', '{"44444444-0000-4000-8000-000000000073": "OK", "44444444-0000-4000-8000-000000000074": 12, "44444444-0000-4000-8000-000000000075": "1999-05-01"}', 1000),
  ('one condition fails', '{"44444444-0000-4000-8000-000000000073": "NM", "44444444-0000-4000-8000-000000000074": 12, "44444444-0000-4000-8000-000000000075": "1999-05-01"}', 5000),
  ('unknown rank value', '{"44444444-0000-4000-8000-000000000071": "E9"}', 5000);
do $$
declare _c record;
begin
  for _c in select * from cases loop
    perform tests.eq(public.term_price('66666666-0000-4000-8000-000000000071', _c.vals), _c.want, _c.name);
  end loop;
end $$;

-- ----- joining and renewing charge the member's price -----
insert into public.attribute_values (org_id, definition_id, entity_id, value) values
  ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000071', '33333333-0000-4000-8000-000000000003', '"E5"');
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq(public.quote_price('66666666-0000-4000-8000-000000000071'), 3000, 'quote from stored values');
select tests.eq(public.quote_price('66666666-0000-4000-8000-000000000071', '{"44444444-0000-4000-8000-000000000071": "E1"}'), 5000, 'answers override stored values');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select public.begin_join('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000071',
  '{"44444444-0000-4000-8000-000000000072": true}') as pay_j \gset
select tests.reset_role();
select tests.eq((select amount_minor from public.payments where id = :'pay_j'), 4000, 'join charged the veteran price');
insert into public.memberships (id, org_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('77777777-0000-4000-8000-000000000071', '22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003',
   '55555555-0000-4000-8000-000000000071', '66666666-0000-4000-8000-000000000071', 'active', current_date, current_date + 100);
select tests.as_user('11111111-0000-4000-8000-000000000003');
select public.begin_renewal('77777777-0000-4000-8000-000000000071', '66666666-0000-4000-8000-000000000071') as pay_r \gset
select tests.reset_role();
select tests.eq((select amount_minor from public.payments where id = :'pay_r'), 3000, 'renewal charged the senior price');

-- ----- rules are checked when saved -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '', '[]', 100, 10, 0)$$, 'either a price or a discount');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '', '[]', null, null, 0)$$, 'either a price or a discount');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000072", "op": "at_least", "value": true}]', 100, null, 0)$$, 'can''t be compared');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000071", "op": "is", "value": "E9"}]', 100, null, 0)$$, 'no such choice');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000074", "op": "at_least", "value": "ten"}]', 100, null, 0)$$, 'needs a number');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000071", "op": "is"}]', 100, null, 0)$$, 'pick a value');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '',
  '[{"attribute_id": "11111111-0000-4000-8000-000000000001", "op": "is", "value": "x"}]', 100, null, 0)$$, 'unknown field');
-- editing a rule in place
select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', (select id from ids where k = 'senior'), 'Senior ranks',
  '[{"attribute_id": "44444444-0000-4000-8000-000000000071", "op": "at_least", "value": "E5"}]', 2500, null, 10);
select tests.reset_role();
select tests.eq(public.term_price('66666666-0000-4000-8000-000000000071', '{"44444444-0000-4000-8000-000000000071": "E4"}'), 5000, 'edited rule applies');

-- the national's range applies to a chapter's rule prices too
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000001', 'membership.chapter_dues_min_minor', '1000', 'locked');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '', '[]', 500, null, 0)$$, 'between 10.00');
select tests.reset_role();

-- ----- permissions and retire-not-delete -----
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.save_pricing_rule('66666666-0000-4000-8000-000000000071', null, '', '[]', 100, null, 0)$$, 'not allowed');
select tests.throws($$select public.set_pricing_rule_active((select id from ids where k = 'senior'), false)$$, 'not allowed');
select tests.throws($$insert into public.pricing_rules (org_id, term_id, price_minor) values ('22222222-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000071', 1)$$, 'row-level security');
select tests.eq((select count(*) from public.pricing_rules), 4::bigint, 'members can read the rules');
delete from public.pricing_rules;
select tests.reset_role();
select tests.eq((select count(*) from public.pricing_rules), 4::bigint, 'deletes remove nothing');
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.pricing_rules), 0::bigint, 'outsiders see none');
select tests.reset_role();
set local role anon;
select tests.eq((public.public_join_info('ch-a') -> 'levels' -> 0 -> 'terms' -> 0 ->> 'has_rules')::boolean, true, 'join page says the price can vary');
select tests.reset_role();
rollback;
