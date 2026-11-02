-- ===== Transaction CSV export (A3, D-047, D-173) =====
-- export_payments returns the money an org received in a date range, optionally for every org
-- below it too, one row per payment (paid or refunded). It needs payments.view at the org asked
-- for, which inherits downward (D-032), and writes one audit event per export before the rows
-- leave the database: no log, no file (as for member exports, D-138).
-- Member names are included for bookkeeping; emails only where the caller may see members
-- (members.view at the payment's org). Additive only (D-125): no tables.

create or replace function public.export_payments(_org uuid, _from date, _to date,
  _include_below boolean default false)
returns table (org_name text, received_on date, member text, email text, purpose text, level text,
  term text, amount_minor int, refunded_minor int, net_minor int, currency text, status text,
  method text, gateway text, test_payment boolean, reference text, receipt text, tax_treatment text)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _n int;
begin
  if _uid is null or not public.has_permission(_uid, 'payments.view', _org) then
    raise exception 'not allowed';
  end if;
  if _from is null or _to is null or _to < _from then raise exception 'pick a date range'; end if;
  return query
    select o.name, coalesce(p.received_on, p.created_at::date),
      coalesce(nullif(pr.display_name, ''), case when public.has_permission(_uid, 'members.view', p.org_id) then pr.email end, ''),
      case when public.has_permission(_uid, 'members.view', p.org_id) then coalesce(pr.email, '') else '' end,
      p.purpose::text, coalesce(t.name, ''), coalesce(tt.label, ''),
      p.amount_minor, p.refunded_amount_minor, p.amount_minor - p.refunded_amount_minor, p.currency::text,
      p.status::text, coalesce(p.method::text, ''), p.gateway::text, not p.livemode,
      coalesce(p.gateway_ref, ''),
      coalesce((select r.number from public.receipts r where r.payment_id = p.id and r.status = 'issued'
                order by r.seq desc limit 1), ''),
      coalesce(t.tax_treatment::text, '')
    from public.payments p
    join public.organizations o on o.id = p.org_id
    left join public.org_member_profiles pr on pr.id = p.profile_id
    left join public.tier_terms tt on tt.id = p.term_id
    left join public.membership_tiers t on t.id = tt.tier_id
    where (p.org_id = _org or (_include_below and _org = any(o.ancestor_ids)))
      and p.status in ('paid', 'refunded')
      and coalesce(p.received_on, p.created_at::date) between _from and _to
    order by coalesce(p.received_on, p.created_at::date), o.name, p.created_at;
  get diagnostics _n = row_count;
  perform public.write_audit(_org, 'export', 'report', 'payments', null,
    jsonb_build_object('rows', _n, 'filter', jsonb_build_object('from', _from, 'to', _to,
      'include_below', _include_below)));
end $$;

revoke execute on function public.export_payments(uuid, date, date, boolean) from public, anon;
grant execute on function public.export_payments(uuid, date, date, boolean) to authenticated;
