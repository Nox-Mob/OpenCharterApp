-- Board setup through apply_setup (D-143): seats, each org's own terms, parent rules, idempotent
begin;
select tests.fixture();
select tests.eq('seats' = any(public.apply_setup_sections()), true, 'apply_setup knows the board sections');

-- the national defines chapter seats and its rules
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'board', '{}', $${
  "seats": [
    {"key": "president", "title": "President", "description": "Leads", "required": true, "seat_count": 1,
     "term_count": 2, "term_unit": "year", "scope": "chapters", "sort_order": 10},
    {"key": "treasurer", "title": "Treasurer", "description": "", "required": true, "seat_count": 1,
     "term_count": 1, "term_unit": "year", "scope": "self", "sort_order": 20}
  ],
  "seat_terms": [
    {"owner_org_id": "22222222-0000-4000-8000-000000000001", "key": "treasurer", "length_count": 3,
     "length_unit": "year", "effective_from": "2026-01-01", "bylaw_reference": "Art. II"}
  ],
  "settings": [
    {"key": "governance.officers_good_standing", "value": true, "mode": "locked"},
    {"key": "governance.chapter_extra_seats_allowed", "value": false, "mode": "locked"}
  ]
}$$);
select tests.eq((select count(*) from public.seat_templates where org_id = '22222222-0000-4000-8000-000000000001'), 2::bigint, 'seats created');
select tests.eq((select role_id from public.seat_templates where key = 'president'), null::uuid, 'setup never links a role');
select tests.eq((select length_count from public.seat_terms where bylaw_reference = 'Art. II'), 3, 'national''s own term');
select tests.eq((select status::text from public.setup_states where flow_id = 'board'), 'applied', 'state applied');

-- applying again changes nothing (no duplicate seats or term rules)
select public.apply_setup('22222222-0000-4000-8000-000000000001', 'board', '{}', $${
  "seats": [
    {"key": "president", "title": "Chapter President", "description": "Leads", "required": true, "seat_count": 1,
     "term_count": 2, "term_unit": "year", "scope": "chapters", "sort_order": 10}
  ],
  "seat_terms": [
    {"owner_org_id": "22222222-0000-4000-8000-000000000001", "key": "treasurer", "length_count": 3,
     "length_unit": "year", "effective_from": "2026-01-01", "bylaw_reference": "Art. II"}
  ]
}$$);
select tests.eq((select count(*) from public.seat_templates), 2::bigint, 'no duplicates; left-out seats not retired');
select tests.eq((select title from public.seat_templates where key = 'president'), 'Chapter President', 'updated in place');
select tests.eq((select count(*) from public.seat_terms), 1::bigint, 'same rule not added twice');
-- scope can't change
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000001', 'board', '{}',
  '{"seats": [{"key": "president", "title": "P", "seat_count": 1, "scope": "self"}]}')$$, 'can''t be changed');
select tests.reset_role();

-- the chapter: can't add seats (parent rule), but sets its own term for the national's seat
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'board', '{}',
  '{"seats": [{"key": "chaplain", "title": "Chaplain", "seat_count": 1, "scope": "self"}]}')$$, 'parent organization manages board seats');
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'board', '{}',
  '{"seats": [{"key": "x", "title": "X", "seat_count": 1, "scope": "chapters"}]}')$$, 'manages board seats');
select public.apply_setup('22222222-0000-4000-8000-000000000002', 'board', '{}', $${
  "seat_terms": [
    {"owner_org_id": "22222222-0000-4000-8000-000000000001", "key": "president", "length_count": 1,
     "length_unit": "year", "effective_from": "2025-06-01", "bylaw_reference": "Chapter Bylaws §4"}
  ]
}$$);
select tests.eq((select term_count || ' ' || term_source from public.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'),
  '1 org', 'chapter''s own term in force');
-- a by-law change through setup adds a rule and keeps the old one
select public.apply_setup('22222222-0000-4000-8000-000000000002', 'board', '{}', $${
  "seat_terms": [
    {"owner_org_id": "22222222-0000-4000-8000-000000000001", "key": "president", "length_count": 2,
     "length_unit": "year", "effective_from": "2026-01-01", "bylaw_reference": "Chapter Bylaws §4, amended"}
  ]
}$$);
select tests.eq((select count(*) from public.seat_terms where org_id = '22222222-0000-4000-8000-000000000002'), 2::bigint, 'history kept');
-- seats that don't apply here are refused (the national's own Treasurer)
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'board', '{}',
  '{"seat_terms": [{"owner_org_id": "22222222-0000-4000-8000-000000000001", "key": "treasurer", "length_count": 1,
   "length_unit": "year", "effective_from": "2026-01-01"}]}')$$, 'isn''t used here');
-- a parent's locked rule can't be changed by the chapter
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'board', '{}',
  '{"settings": [{"key": "governance.officers_good_standing", "value": false, "mode": "override"}]}')$$, 'locked');
select tests.reset_role();

-- a sibling admin can't set Chapter A's terms; a member can't run board setup
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.apply_setup('22222222-0000-4000-8000-000000000002', 'board', '{}', '{}')$$, 'not allowed');
select tests.reset_role();
rollback;
