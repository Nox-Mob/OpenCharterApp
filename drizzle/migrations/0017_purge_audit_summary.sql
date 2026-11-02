-- ===== Smoke-test cleanup leaves a trace (D-150 follow-up) =====
-- purge_smoke_data (0016) removes a smoke run's rows, including their audit entries. It now
-- writes one summary audit event at Demo National with the counts and the start time, so the
-- audit log shows that a purge happened and what it removed. Same signature, same rules.
-- Also restores the seat_templates comment that 0015 replaced. Additive only (D-125).

create or replace function public.purge_smoke_data(_since timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  demo uuid[] := array[
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000003']::uuid[];
  pays uuid[];
  n jsonb := '{}'::jsonb;
  c int;
begin
  if not public.has_permission(auth.uid(), 'org.manage', demo[1]) then
    raise exception 'only a demo national admin can purge smoke data';
  end if;
  if _since is null then raise exception 'a start time is required'; end if;

  select coalesce(array_agg(id), '{}') into pays from public.payments
    where org_id = any(demo) and created_at >= _since;

  delete from public.webhook_events where payment_id = any(pays);
  get diagnostics c = row_count; n := n || jsonb_build_object('webhook_events', c);

  update public.payments set membership_id = null where id = any(pays);
  delete from public.memberships where org_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('memberships', c);

  delete from public.payments where id = any(pays);
  get diagnostics c = row_count; n := n || jsonb_build_object('payments', c);

  delete from public.receipt_counters rc where rc.org_id = any(demo)
    and not exists (select 1 from public.receipts r where r.org_id = rc.org_id and r.year = rc.year);

  delete from public.seat_templates where org_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('seat_templates', c);

  delete from public.role_assignments where org_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('role_assignments', c);

  delete from public.org_member_profiles where org_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('member_profiles', c);

  delete from public.member_segments where org_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('member_segments', c);

  delete from public.tier_terms where org_id = any(demo) and created_at >= _since;
  delete from public.membership_tiers where org_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('membership_tiers', c);

  delete from public.gateway_connections where org_id = any(demo)
    and gateway = 'test' and connected_at >= _since;

  delete from public.audit_events where org_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('audit_events', c);
  -- The audit log stays append-only in spirit: the purge itself is recorded (with what it removed).
  perform public.write_audit(demo[1], 'purge', 'smoke_data', null, null,
    n || jsonb_build_object('since', _since));
  return n;
end $$;
comment on function public.purge_smoke_data(timestamptz) is
  'Deletes rows a smoke-test run created in the demo organizations since _since and records one summary audit event (D-150).';

comment on table public.seat_templates is
  'Board seats (E-17). Written only by definer RPCs; retired with active = false, never deleted.';
