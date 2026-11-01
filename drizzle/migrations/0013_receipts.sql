-- ===== E-15 Receipts, in the app (D-044, D-045, D-118, D-140) =====
-- Every paid payment gets a receipt from the organization that received it, numbered per org and
-- year without gaps. A receipt is immutable: it freezes everything it shows (issuer, tax details,
-- logo, payer, items, wording) at issue time. Corrections never edit it; it's voided, or replaced
-- by a new version that points back to it. Refunds void it (full) or replace it with the net
-- amount (partial). Receipts are shown and printed in the app; email comes with E-08.
-- Default wording is a placeholder pending review by a CPA or attorney (R-07).
-- Lovable conventions (D-125): full grants, RLS with has_permission, no DROP.

create type public.receipt_status as enum ('issued', 'voided', 'superseded');

create table public.receipt_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  year int not null check (year between 2000 and 2999),
  last_seq int not null default 0,
  primary key (org_id, year)
);
grant select, insert, update, delete on public.receipt_counters to authenticated;
grant all on public.receipt_counters to service_role;
alter table public.receipt_counters enable row level security;
comment on table public.receipt_counters is 'Receipt numbering per org and year (E-15). Written only by definer functions.';
create policy "payment viewers read receipt counters" on public.receipt_counters for select to authenticated
  using (public.has_permission(auth.uid(), 'payments.view', org_id));

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  number text not null,
  year int not null,
  seq int not null,
  status public.receipt_status not null default 'issued',
  supersedes_id uuid references public.receipts(id),
  snapshot jsonb not null,
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 300),
  voided_by uuid,
  unique (org_id, number),
  unique (org_id, year, seq)
);
create index on public.receipts (payment_id);
-- At most one current receipt per payment.
create unique index receipts_one_issued_per_payment on public.receipts (payment_id) where status = 'issued';
grant select, insert, update, delete on public.receipts to authenticated;
grant all on public.receipts to service_role;
alter table public.receipts enable row level security;
comment on table public.receipts is
  'Immutable receipts (E-15, D-044). Written only by definer functions; voided or superseded, never edited or deleted.';
create policy "payment viewers and payers read receipts" on public.receipts for select to authenticated
  using (public.has_permission(auth.uid(), 'payments.view', org_id)
    or exists (select 1 from public.payments p left join public.org_member_profiles pr on pr.id = p.profile_id
      where p.id = payment_id and (p.payer_user_id = auth.uid() or pr.user_id = auth.uid())));
create trigger audit_receipts after insert or update or delete on public.receipts
  for each row execute function public.audit_row_change();

-- Immutable: the only change allowed is issued -> voided / superseded (with the void details).
-- Rows only disappear with their payment or org (a cascade, one trigger level deeper).
create or replace function public.receipts_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'receipts can''t be deleted';
  end if;
  if old.status <> 'issued' or new.status not in ('voided', 'superseded')
     or new.number is distinct from old.number or new.snapshot is distinct from old.snapshot
     or new.payment_id is distinct from old.payment_id or new.org_id is distinct from old.org_id
     or new.seq is distinct from old.seq or new.year is distinct from old.year
     or new.issued_at is distinct from old.issued_at or new.supersedes_id is distinct from old.supersedes_id then
    raise exception 'receipts can''t be changed; void or reissue instead';
  end if;
  return new;
end $$;
create trigger receipts_guard before update or delete on public.receipts
  for each row execute function public.receipts_guard();

-- ----- building a receipt -----
-- Placeholder wording per tax treatment (D-045 wording deferred; to be reviewed, R-07).
create or replace function public.receipt_tax_wording(_treatment public.tax_treatment)
returns text language sql immutable set search_path = public as $$
  select case _treatment
    when 'deductible' then 'No goods or services were provided in exchange for this payment. It may be tax-deductible to the extent allowed by law.'
    when 'partial' then 'Part of this payment may be tax-deductible. Please consult your tax advisor.'
    else 'This payment is not tax-deductible as a charitable contribution.'
  end
$$;

-- The issuing org's logo, as resolveLogo in src/modules/branding: the nearest logo in the lineage,
-- or the top-most one when chapters may not use their own (branding.chapter_logo_allowed).
create or replace function public.receipt_logo(_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with chain as (
    select a.id, a.logo_path, array_position(o.ancestor_ids, a.id) as depth
    from public.organizations o join public.organizations a on a.id = any(o.ancestor_ids) where o.id = _org
    union all select id, logo_path, 1000000 from public.organizations where id = _org
  ), allowed as (
    select coalesce((public.effective_setting(_org, 'branding.chapter_logo_allowed') #>> '{}')::boolean, true) as ok
  )
  select (select jsonb_build_object('path', c.logo_path, 'org_id', c.id) from chain c, allowed
          where c.logo_path is not null
          order by case when allowed.ok then -c.depth else c.depth end limit 1)
$$;

create or replace function public.receipt_snapshot(_payment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _p public.payments; _o public.organizations; _tax public.tax_profiles; _pr public.org_member_profiles;
  _t public.tier_terms; _tier public.membership_tiers; _payer_email text;
begin
  select * into _p from public.payments where id = _payment;
  select * into _o from public.organizations where id = _p.org_id;
  select * into _tax from public.tax_profiles where org_id = _p.org_id;
  select * into _pr from public.org_member_profiles where id = _p.profile_id;
  select * into _t from public.tier_terms
    where id = coalesce(_p.term_id, (select term_id from public.memberships where id = _p.membership_id));
  select * into _tier from public.membership_tiers where id = _t.tier_id;
  if _pr.id is null and _p.payer_user_id is not null then
    select email into _payer_email from auth.users where id = _p.payer_user_id;
  end if;
  return jsonb_build_object(
    'issuer', jsonb_build_object('org_id', _o.id, 'name', _o.name,
      'legal_name', coalesce(nullif(_tax.legal_name, ''), _o.name), 'ein', coalesce(_tax.ein, ''),
      'tax_status', coalesce(_tax.tax_status, ''), 'logo', public.receipt_logo(_o.id)),
    'payer', jsonb_build_object('name', coalesce(_pr.display_name, ''), 'email', coalesce(nullif(_pr.email, ''), _payer_email, '')),
    'items', jsonb_build_array(jsonb_build_object(
      'description', concat_ws(' · ', coalesce(_tier.name, 'Membership') || case when _p.purpose = 'renew' then ' renewal' else ' membership' end, _t.label),
      'amount_minor', _p.amount_minor)),
    'amount_minor', _p.amount_minor,
    'refunded_minor', _p.refunded_amount_minor,
    'net_minor', _p.amount_minor - _p.refunded_amount_minor,
    'currency', _p.currency,
    'received_on', coalesce(_p.received_on, current_date),
    'method', case when _p.gateway = 'manual' then coalesce(_p.method::text, 'other') when _p.gateway = 'stripe' then 'card' else 'test' end,
    'livemode', _p.livemode,
    'tax_treatment', coalesce(_tier.tax_treatment::text, 'non_deductible'),
    'tax_wording', public.receipt_tax_wording(coalesce(_tier.tax_treatment, 'non_deductible')),
    'footer', coalesce(public.effective_setting(_p.org_id, 'receipts.footer') #>> '{}', ''),
    'note', _p.note
  );
end $$;

-- Issue a receipt for a payment (internal). Numbers come from the per-year counter row, which is
-- locked by the update, so they're gap-free even with payments arriving at the same time.
create or replace function public.issue_receipt_internal(_payment uuid, _supersedes uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _p public.payments; _year int := extract(year from now())::int; _seq int; _id uuid;
begin
  select * into _p from public.payments where id = _payment;
  insert into public.receipt_counters (org_id, year, last_seq) values (_p.org_id, _year, 1)
    on conflict (org_id, year) do update set last_seq = public.receipt_counters.last_seq + 1
    returning last_seq into _seq;
  insert into public.receipts (org_id, payment_id, number, year, seq, supersedes_id, snapshot)
    values (_p.org_id, _p.id, _year || '-' || lpad(_seq::text, 5, '0'), _year, _seq, _supersedes,
      public.receipt_snapshot(_p.id))
    returning id into _id;
  return _id;
end $$;

-- Payments drive receipts: paid -> issue; fully refunded -> void; partly refunded -> replace.
create or replace function public.payments_receipts()
returns trigger language plpgsql security definer set search_path = public as $$
declare _current public.receipts;
begin
  select * into _current from public.receipts where payment_id = new.id and status = 'issued';
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status <> 'paid') and _current.id is null then
    perform public.issue_receipt_internal(new.id);
  elsif tg_op = 'UPDATE' and new.status = 'refunded' and old.status <> 'refunded' and _current.id is not null then
    update public.receipts set status = 'voided', voided_at = now(), void_reason = 'Refunded', voided_by = auth.uid()
      where id = _current.id;
  elsif tg_op = 'UPDATE' and new.status = 'paid' and new.refunded_amount_minor > old.refunded_amount_minor
        and _current.id is not null then
    update public.receipts set status = 'superseded', voided_at = now(), void_reason = 'Partly refunded', voided_by = auth.uid()
      where id = _current.id;
    perform public.issue_receipt_internal(new.id, _current.id);
  end if;
  return new;
end $$;
create trigger payments_receipts after insert or update of status, refunded_amount_minor on public.payments
  for each row execute function public.payments_receipts();

-- ----- RPCs for payment managers -----
create or replace function public.void_receipt(_receipt uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare _r public.receipts;
begin
  select * into _r from public.receipts where id = _receipt for update;
  if _r.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'payments.manage', _r.org_id) then
    raise exception 'not allowed'; end if;
  if _r.status <> 'issued' then raise exception 'only issued receipts can be voided'; end if;
  if char_length(trim(coalesce(_reason, ''))) = 0 then raise exception 'give a reason'; end if;
  update public.receipts set status = 'voided', voided_at = now(), void_reason = left(trim(_reason), 300), voided_by = auth.uid()
    where id = _receipt;
end $$;

-- Replace a receipt with a new version built from today's details (e.g. a corrected tax profile).
create or replace function public.reissue_receipt(_receipt uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _r public.receipts; _p public.payments;
begin
  select * into _r from public.receipts where id = _receipt for update;
  if _r.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'payments.manage', _r.org_id) then
    raise exception 'not allowed'; end if;
  if _r.status <> 'issued' then raise exception 'only the current receipt can be reissued'; end if;
  select * into _p from public.payments where id = _r.payment_id;
  if _p.status <> 'paid' then raise exception 'only paid payments get receipts'; end if;
  update public.receipts set status = 'superseded', voided_at = now(), void_reason = left(coalesce(nullif(trim(_reason), ''), 'Reissued'), 300),
    voided_by = auth.uid() where id = _receipt;
  return public.issue_receipt_internal(_r.payment_id, _r.id);
end $$;

-- Issue a receipt for a paid payment that has none (e.g. one voided by mistake).
create or replace function public.issue_receipt(_payment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare _p public.payments;
begin
  select * into _p from public.payments where id = _payment;
  if _p.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'payments.manage', _p.org_id) then
    raise exception 'not allowed'; end if;
  if _p.status <> 'paid' then raise exception 'only paid payments get receipts'; end if;
  if exists (select 1 from public.receipts where payment_id = _payment and status = 'issued') then
    raise exception 'this payment already has a receipt'; end if;
  return public.issue_receipt_internal(_payment);
end $$;

revoke execute on function public.receipt_tax_wording(public.tax_treatment), public.receipt_logo(uuid),
  public.receipt_snapshot(uuid), public.issue_receipt_internal(uuid, uuid), public.void_receipt(uuid, text),
  public.reissue_receipt(uuid, text), public.issue_receipt(uuid) from public, anon, authenticated;
grant execute on function public.void_receipt(uuid, text), public.reissue_receipt(uuid, text), public.issue_receipt(uuid)
  to authenticated;

-- Receipts for payments recorded before this migration.
do $$ declare _id uuid; begin
  for _id in select p.id from public.payments p where p.status = 'paid'
      and not exists (select 1 from public.receipts r where r.payment_id = p.id) order by p.created_at loop
    perform public.issue_receipt_internal(_id);
  end loop;
end $$;
