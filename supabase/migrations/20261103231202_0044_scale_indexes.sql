-- 0044 (D-209): indexes for large rosters. The 10,000 and 20,000-member performance checks
-- showed the Members "everyone" view slowing down faster than the roster grew: memberships had
-- no index on profile_id (only (org_id, profile_id)), so finding a member's membership read the
-- whole index, once per member. These index the foreign keys of the tables that grow with the
-- roster and its payments.
-- At 20,000 members the planner's cost estimate for the Overview numbers crossed Postgres's JIT
-- thresholds, and compiling took about 700 ms of a 1 second read. These reports are short
-- queries that JIT can't speed up, so it's turned off for them (the function bodies don't change).
create index if not exists memberships_profile_id_idx on public.memberships (profile_id);
create index if not exists memberships_home_org_id_idx on public.memberships (home_org_id);
create index if not exists memberships_tier_id_idx on public.memberships (tier_id);
create index if not exists memberships_term_id_idx on public.memberships (term_id);
create index if not exists org_member_profiles_user_id_idx on public.org_member_profiles (user_id);
create index if not exists payments_profile_id_idx on public.payments (profile_id);
create index if not exists payments_term_id_idx on public.payments (term_id);
create index if not exists membership_events_org_id_idx on public.membership_events (org_id);
create index if not exists membership_events_payment_id_idx on public.membership_events (payment_id);
create index if not exists membership_events_tier_id_idx on public.membership_events (tier_id);
create index if not exists membership_events_term_id_idx on public.membership_events (term_id);
create index if not exists affiliation_history_membership_id_idx on public.affiliation_history (membership_id);
create index if not exists affiliation_history_from_org_id_idx on public.affiliation_history (from_org_id);
create index if not exists affiliation_history_to_org_id_idx on public.affiliation_history (to_org_id);
create index if not exists webhook_events_org_id_idx on public.webhook_events (org_id);
create index if not exists webhook_events_payment_id_idx on public.webhook_events (payment_id);
create index if not exists receipts_supersedes_id_idx on public.receipts (supersedes_id);
create index if not exists role_assignments_org_id_idx on public.role_assignments (org_id);
create index if not exists role_assignments_role_id_idx on public.role_assignments (role_id);
create index if not exists appointments_role_assignment_id_idx on public.appointments (role_assignment_id);
create index if not exists appointments_template_id_idx on public.appointments (template_id);

alter function public.org_overview_stats(uuid) set jit = off;
alter function public.org_rollup_members(uuid) set jit = off;
alter function public.org_rollup_revenue(uuid, date, date) set jit = off;
alter function public.export_payments(uuid, date, date, boolean) set jit = off;
alter function public.member_directory(uuid) set jit = off;
alter function public.audit_log(uuid, bigint, integer) set jit = off;
