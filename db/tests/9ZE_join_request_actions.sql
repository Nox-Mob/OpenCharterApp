-- C-08: a join request is told to its reviewers, saying what's pending; with Approve and Decline
-- buttons in the email only when the organization allows it (0013, core 0013/0014).
begin;
select tests.fixture();
insert into charter.membership_tiers (id, unit_id, key, name, tax_treatment) values
  ('55555555-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000001', 'regular', 'Regular', 'non_deductible');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('55555555-0000-4000-8000-000000000022', '55555555-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
update charter.member_profiles set display_name = 'Max Applicant' where id = '33333333-0000-4000-8000-000000000003';

-- Not allowed yet: the reviewers hear what's pending, with no buttons.
insert into charter.memberships (id, unit_id, profile_id, tier_id, term_id, status) values
  ('66666666-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003',
   '55555555-0000-4000-8000-000000000021', '55555555-0000-4000-8000-000000000022', 'pending');
select tests.eq((select title from public.notifications where user_id = '11111111-0000-4000-8000-000000000001' and kind = 'charter.join_requested'),
  'Max Applicant has asked to join Chapter A', 'the reviewer is told who asked to join where');
select tests.eq((select body from public.notifications where user_id = '11111111-0000-4000-8000-000000000001' and kind = 'charter.join_requested'),
  'This is pending your approval.', 'and that it waits for them');
select tests.eq((select data -> 'actions' from public.email_outbox where to_user_id = '11111111-0000-4000-8000-000000000001'
                 and data ->> 'title' = 'Max Applicant has asked to join Chapter A'), '[]'::jsonb, 'no buttons until allowed');
select tests.eq((select count(*)::int from public.notifications where user_id = '11111111-0000-4000-8000-000000000004' and kind = 'charter.join_requested'),
  0, 'someone outside the organization isn''t told');

-- Allowed: Approve and Decline, and Approve works as the reviewer.
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.set_email_action_allowed('22222222-0000-4000-8000-000000000001', 'charter_join_requests', true);
select tests.reset_role();
insert into charter.memberships (id, unit_id, profile_id, tier_id, term_id, status) values
  ('66666666-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000003',
   '55555555-0000-4000-8000-000000000021', '55555555-0000-4000-8000-000000000022', 'pending');
select tests.eq((select string_agg(a ->> 'label', ',') from public.email_outbox o, jsonb_array_elements(o.data -> 'actions') a
                 where o.to_user_id = '11111111-0000-4000-8000-000000000001' and o.data ->> 'title' = 'Max Applicant has asked to join Chapter B'),
  'Approve,Decline', 'Approve and Decline in the email');
select o.data #>> '{actions,0,token}' as approve_token from public.email_outbox o
where o.to_user_id = '11111111-0000-4000-8000-000000000001' and o.data ->> 'title' = 'Max Applicant has asked to join Chapter B' \gset
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((public.action_link(:'approve_token')) #>> '{rpc,fn}',
  'approve_membership', 'the link approves through the app''s own function');
select charter.decline_membership('66666666-0000-4000-8000-000000000002', 'Not in Chapter B''s area');
select tests.eq((select status::text from charter.memberships where id = '66666666-0000-4000-8000-000000000002'), 'declined', 'the reviewer''s answer');
rollback;
