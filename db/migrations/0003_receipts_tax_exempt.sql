-- Receipts: a tax-exempt setting (owner request, 2026-11-12). `receipts.tax_exempt` (Settings →
-- General, default on) decides whether receipts may call a payment tax-deductible. Off: every new
-- receipt says it's not tax-deductible, whatever its membership level's tax treatment.
-- Issued receipts never change (their snapshot is frozen); this applies to receipts issued from
-- now on. The function below is the baseline's receipt_snapshot with only that rule added.

create or replace function charter.receipt_snapshot(_payment uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _p charter.payments; _o charter.units; _tax charter.tax_profiles; _pr charter.member_profiles;
  _t charter.tier_terms; _tier charter.membership_tiers; _payer_email text;
  _treatment charter.tax_treatment;
begin
  select * into _p from charter.payments where id = _payment;
  select * into _o from charter.units where id = _p.unit_id;
  select * into _tax from charter.tax_profiles where unit_id = _p.unit_id;
  select * into _pr from charter.member_profiles where id = _p.profile_id;
  select * into _t from charter.tier_terms
    where id = coalesce(_p.term_id, (select term_id from charter.memberships where id = _p.membership_id));
  select * into _tier from charter.membership_tiers where id = _t.tier_id;
  -- An organization that isn't tax-exempt never calls a payment tax-deductible (receipts.tax_exempt,
  -- inherited down the tree like every setting; default on, so the level's treatment applies).
  _treatment := case
    when coalesce((charter.effective_setting(_p.unit_id, 'receipts.tax_exempt') #>> '{}')::boolean, true)
      then coalesce(_tier.tax_treatment, 'non_deductible')
    else 'non_deductible'
  end;
  if _pr.id is null and _p.payer_user_id is not null then
    select email into _payer_email from auth.users where id = _p.payer_user_id;
  end if;
  return jsonb_build_object(
    'issuer', jsonb_build_object('unit_id', _o.id, 'name', _o.name,
      'legal_name', coalesce(nullif(_tax.legal_name, ''), _o.name), 'ein', coalesce(_tax.ein, ''),
      'tax_status', coalesce(_tax.tax_status, ''), 'logo', charter.receipt_logo(_o.id)),
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
    'tax_treatment', _treatment::text,
    'tax_wording', charter.receipt_tax_wording(_treatment),
    'footer', coalesce(charter.effective_setting(_p.unit_id, 'receipts.footer') #>> '{}', ''),
    'note', _p.note
  );
end $$;
