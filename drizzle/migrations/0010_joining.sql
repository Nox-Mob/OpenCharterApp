-- ===== E-13b Online joining and renewal (D-130, D-136, D-137) =====
-- People join through the public page /join/<slug>: pick a level and term, sign in, answer the
-- org's member fields, pay through the org's own gateway. The membership is created only when
-- the payment succeeds (webhooks are the source of truth), so abandoned checkouts leave nothing
-- behind. If the org (or its parent, D-130) requires approval, the paid membership waits as
-- pending; a decline refunds it. Members renew from "Your membership" the same way.
-- Lovable conventions (D-125): additive only; no new tables.

-- ----- payments: what an online payment carries until it completes -----
alter table public.payments
  add column term_id uuid references public.tier_terms(id),
  add column join_answers jsonb not null default '{}'::jsonb;

-- Payers can follow their own payment (the "done" page polls it before a profile exists).
alter policy "payers and viewers read payments" on public.payments
  using (public.has_permission(auth.uid(), 'payments.view', org_id)
    or payer_user_id = auth.uid()
    or (public.is_org_member(auth.uid(), org_id) and exists (
      select 1 from public.org_member_profiles p where p.id = profile_id and p.user_id = auth.uid())));

-- ----- who must approve new members here (mirrors effectiveApprovalRequired, D-130) -----
create or replace function public.effective_approval_required(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.ancestor_setting(_org, 'membership.child_approval') #>> '{}'
    when 'auto' then false
    when 'review' then true
    else coalesce((public.effective_setting(_org, 'membership.approval_required') #>> '{}')::boolean, false)
  end
$$;

-- ----- the public join page -----
-- Name, levels with prices, the member fields to answer, and whether online payment is open.
-- Readable without signing in; nothing private is returned.
create or replace function public.public_join_info(_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _o public.organizations; _parent public.organizations; _managed boolean; _conn public.gateway_connections;
begin
  select * into _o from public.organizations where slug = lower(trim(_slug)) and type <> 'platform';
  if _o.id is null then return null; end if;
  _managed := coalesce((public.ancestor_setting(_o.id, 'membership.child_levels_allowed') #>> '{}')::boolean, true) = false;
  if _managed then select * into _parent from public.organizations where id = _o.parent_id; end if;
  select * into _conn from public.gateway_connections where org_id = _o.id and status = 'verified';
  return jsonb_build_object(
    'org', jsonb_build_object('id', _o.id, 'name', _o.name, 'slug', _o.slug, 'type', _o.type),
    'levels_managed_by_parent', _managed,
    'parent', case when _parent.id is null then null else jsonb_build_object('name', _parent.name, 'slug', _parent.slug) end,
    'payments_enabled', _conn.id is not null,
    'gateway', _conn.gateway,
    'livemode', coalesce(_conn.livemode, false),
    'approval_required', public.effective_approval_required(_o.id),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description,
          'terms', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label,
              'length_count', x.length_count, 'length_unit', x.length_unit, 'price_minor', x.price_minor,
              'currency', x.currency) order by x.sort_order), '[]'::jsonb)
            from public.tier_terms x where x.tier_id = t.id and x.active)) order by t.sort_order)
      from public.membership_tiers t where t.org_id = _o.id and t.active), '[]'::jsonb),
    -- Fields a new member answers: required ones and ones members may edit themselves.
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'help', d.help, 'data_type', d.data_type,
          'required', d.required,
          'options', (select coalesce(jsonb_agg(jsonb_build_object('value', op.value, 'label', op.label) order by op.sort_order), '[]'::jsonb)
            from public.attribute_options op where op.definition_id = d.id and op.active)) order by d.sort_order)
      from public.attribute_definitions d
      where d.applies_to = 'member' and d.active and (d.required or d.member_editable)
        and (d.org_id = _o.id or d.org_id = any(_o.ancestor_ids))), '[]'::jsonb)
  );
end $$;

-- Validate join answers ({definition_id: value}) without writing anything.
create or replace function public.validate_join_answers(_org uuid, _answers jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare _d public.attribute_definitions; _o public.organizations; _k text; _v jsonb;
begin
  select * into _o from public.organizations where id = _org;
  if jsonb_typeof(coalesce(_answers, '{}'::jsonb)) <> 'object' then raise exception 'invalid answers'; end if;
  for _k, _v in select * from jsonb_each(coalesce(_answers, '{}'::jsonb)) loop
    select * into _d from public.attribute_definitions where id::text = _k and active and applies_to = 'member'
      and (org_id = _org or org_id = any(_o.ancestor_ids)) and (required or member_editable);
    if _d.id is null then raise exception 'unknown field'; end if;
    if _v is not null and _v <> 'null'::jsonb then perform public.validate_attribute_value(_d, _v); end if;
  end loop;
  for _d in select * from public.attribute_definitions where active and applies_to = 'member' and required
      and (org_id = _org or org_id = any(_o.ancestor_ids)) loop
    if not (coalesce(_answers, '{}'::jsonb) ? _d.id::text) or _answers -> _d.id::text = 'null'::jsonb then
      raise exception '% is required', _d.label;
    end if;
  end loop;
end $$;

-- Start joining: checks everything, then creates a pending payment holding the answers.
create or replace function public.begin_join(_org uuid, _term uuid, _answers jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _t public.tier_terms; _tier public.membership_tiers; _conn public.gateway_connections;
  _p public.org_member_profiles; _m public.memberships; _id uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _t from public.tier_terms where id = _term;
  select * into _tier from public.membership_tiers where id = _t.tier_id;
  if _t.id is null or _tier.org_id <> _org or not (_t.active and _tier.active) then
    raise exception 'that membership level isn''t offered here'; end if;
  select * into _conn from public.gateway_connections where org_id = _org and status = 'verified';
  if _conn.id is null then raise exception 'online payments aren''t open yet'; end if;
  select * into _p from public.org_member_profiles where org_id = _org and user_id = _uid;
  if _p.id is not null then
    select * into _m from public.memberships where org_id = _org and profile_id = _p.id;
    if _m.status = 'pending' then raise exception 'your application is already waiting for approval'; end if;
    if _m.status = 'active' then raise exception 'you''re already a member; renew instead'; end if;
  end if;
  perform public.validate_join_answers(_org, _answers);
  insert into public.payments (org_id, profile_id, payer_user_id, purpose, amount_minor, currency, status, gateway,
      livemode, term_id, join_answers, created_by)
    values (_org, _p.id, _uid, 'join', _t.price_minor, _t.currency, 'pending', _conn.gateway, _conn.livemode,
      _t.id, coalesce(_answers, '{}'::jsonb), _uid)
    returning id into _id;
  return _id;
end $$;

-- Start a renewal of the caller's own active membership (stacking applies when it completes).
create or replace function public.begin_renewal(_membership uuid, _term uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.memberships; _p public.org_member_profiles; _t public.tier_terms;
  _tier public.membership_tiers; _conn public.gateway_connections; _id uuid;
begin
  select * into _m from public.memberships where id = _membership;
  select * into _p from public.org_member_profiles where id = _m.profile_id;
  if _uid is null or _p.user_id is distinct from _uid then raise exception 'not allowed'; end if;
  if _m.status <> 'active' then raise exception 'only active memberships can be renewed'; end if;
  if _m.lifetime then raise exception 'already a lifetime member'; end if;
  select * into _t from public.tier_terms where id = _term;
  select * into _tier from public.membership_tiers where id = _t.tier_id;
  if _t.id is null or _tier.org_id <> _m.org_id or not (_t.active and _tier.active) then
    raise exception 'that membership level isn''t offered here'; end if;
  select * into _conn from public.gateway_connections where org_id = _m.org_id and status = 'verified';
  if _conn.id is null then raise exception 'online payments aren''t open yet'; end if;
  insert into public.payments (org_id, membership_id, profile_id, payer_user_id, purpose, amount_minor, currency,
      status, gateway, livemode, term_id, created_by)
    values (_m.org_id, _m.id, _p.id, _uid, 'renew', _t.price_minor, _t.currency, 'pending', _conn.gateway,
      _conn.livemode, _t.id, _uid)
    returning id into _id;
  return _id;
end $$;

-- The payer records the gateway's checkout id (Stripe Checkout Session) on their pending payment.
create or replace function public.set_checkout_ref(_payment uuid, _ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments set checkout_ref = left(_ref, 255)
    where id = _payment and payer_user_id = auth.uid() and status in ('pending', 'failed');
  if not found then raise exception 'not allowed'; end if;
end $$;

-- ----- completing payments (internal; reached through the wrappers below) -----
-- Gives a member a term (join or renewal) and records the history event. Shared by online
-- payment completion. Stacking rules as in record_membership (D-133).
create or replace function public.grant_membership_term(_profile uuid, _term uuid, _paid_on date, _payment uuid,
  _actor uuid, _pending boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare _p public.org_member_profiles; _t public.tier_terms; _m public.memberships; _start date; _end date;
  _kind public.membership_event_kind; _grace int;
begin
  select * into _p from public.org_member_profiles where id = _profile;
  select * into _t from public.tier_terms where id = _term;
  _grace := public.grace_days(_p.org_id);
  select * into _m from public.memberships where org_id = _p.org_id and profile_id = _profile for update;
  if _pending then
    -- Waits for an admin; the term starts on the approval day (approve_membership).
    if _m.id is null then
      insert into public.memberships (org_id, profile_id, tier_id, term_id, status)
        values (_p.org_id, _profile, _t.tier_id, _t.id, 'pending') returning * into _m;
    else
      update public.memberships set tier_id = _t.tier_id, term_id = _t.id, status = 'pending',
        joined_on = null, paid_through = null, lifetime = false, updated_at = now()
        where id = _m.id returning * into _m;
    end if;
    return _m.id;
  end if;
  _kind := case when _m.id is null or _m.status <> 'active' then 'joined' else 'renewed' end;
  _start := case when _m.id is null then _paid_on
    else public.renewal_start(_m.status, _m.paid_through, _m.lifetime, _grace, _paid_on) end;
  _end := public.term_end(_start, _t.length_count, _t.length_unit);
  if _m.id is null then
    insert into public.memberships (org_id, profile_id, tier_id, term_id, status, joined_on, paid_through, lifetime)
      values (_p.org_id, _profile, _t.tier_id, _t.id, 'active', _start, _end, _t.length_unit is null)
      returning * into _m;
  else
    update public.memberships set tier_id = _t.tier_id, term_id = _t.id, status = 'active',
      joined_on = case when _kind = 'joined' then _start else joined_on end,
      paid_through = _end, lifetime = _t.length_unit is null, updated_at = now()
      where id = _m.id returning * into _m;
  end if;
  insert into public.membership_events (org_id, membership_id, kind, tier_id, term_id, period_start, period_end, payment_id, actor_id)
    values (_p.org_id, _m.id, _kind, _t.tier_id, _t.id, _start, _end, _payment, _actor);
  return _m.id;
end $$;

-- A payment succeeded. Idempotent per gateway event; returns what happened.
create or replace function public.payment_succeeded(_event_id text, _payment uuid, _gateway_ref text,
  _amount_minor int, _currency text, _livemode boolean)
returns text language plpgsql security definer set search_path = public as $$
declare _pay public.payments; _p public.org_member_profiles; _email text; _membership uuid; _pending boolean;
  _k text; _v jsonb; _d public.attribute_definitions;
begin
  select * into _pay from public.payments where id = _payment for update;
  if _pay.id is null then return 'unknown payment'; end if;
  if not public.claim_webhook_event(_pay.org_id, _pay.gateway, _event_id, 'payment.succeeded', _pay.id) then
    return 'duplicate';
  end if;
  if _pay.status not in ('pending', 'failed') then return 'already ' || _pay.status; end if;
  if _amount_minor <> _pay.amount_minor or upper(_currency) <> _pay.currency then
    update public.payments set status = 'failed', failure_reason = 'Amount didn''t match the price' where id = _pay.id;
    return 'amount mismatch';
  end if;
  update public.payments set status = 'paid', gateway_ref = _gateway_ref, livemode = _livemode,
    received_on = current_date, failure_reason = null where id = _pay.id;

  if _pay.purpose = 'join' then
    -- The member's profile: their existing one, an admin-created record with their email (D-134), or a new one.
    select * into _p from public.org_member_profiles where org_id = _pay.org_id and user_id = _pay.payer_user_id;
    if _p.id is null then
      select lower(email) into _email from auth.users where id = _pay.payer_user_id;
      select * into _p from public.org_member_profiles
        where org_id = _pay.org_id and user_id is null and lower(email) = _email order by created_at limit 1 for update;
      if _p.id is not null then
        update public.org_member_profiles set user_id = _pay.payer_user_id, claimed_at = now() where id = _p.id;
      else
        insert into public.org_member_profiles (org_id, user_id, email, source)
          values (_pay.org_id, _pay.payer_user_id, coalesce(_email, ''), 'signup') returning * into _p;
      end if;
    end if;
    -- The answers given on the join page (validated when joining started; re-checked here).
    for _k, _v in select * from jsonb_each(_pay.join_answers) loop
      select * into _d from public.attribute_definitions where id::text = _k and active;
      if _d.id is not null and _v is not null and _v <> 'null'::jsonb then
        begin
          perform public.validate_attribute_value(_d, _v);
          insert into public.attribute_values (org_id, definition_id, entity_id, value, updated_by)
            values (_pay.org_id, _d.id, _p.id, _v, _pay.payer_user_id)
            on conflict (definition_id, entity_id) do update set value = excluded.value, updated_at = now();
        exception when others then null; -- a field changed since; the member can fix it later
        end;
      end if;
    end loop;
    _pending := public.effective_approval_required(_pay.org_id);
  else
    select * into _p from public.org_member_profiles where id = _pay.profile_id;
    _pending := false;
  end if;
  _membership := public.grant_membership_term(_p.id, _pay.term_id, current_date, _pay.id, _pay.payer_user_id, _pending);
  update public.payments set profile_id = _p.id, membership_id = _membership where id = _pay.id;
  return case when _pending then 'pending approval' else 'active' end;
end $$;

create or replace function public.payment_failed(_event_id text, _payment uuid, _reason text)
returns text language plpgsql security definer set search_path = public as $$
declare _pay public.payments;
begin
  select * into _pay from public.payments where id = _payment for update;
  if _pay.id is null then return 'unknown payment'; end if;
  if not public.claim_webhook_event(_pay.org_id, _pay.gateway, _event_id, 'payment.failed', _pay.id) then return 'duplicate'; end if;
  if _pay.status <> 'pending' then return 'already ' || _pay.status; end if;
  update public.payments set status = 'failed', failure_reason = left(coalesce(_reason, 'Payment failed'), 300) where id = _pay.id;
  return 'failed';
end $$;

create or replace function public.payment_refunded(_event_id text, _gateway public.payment_gateway, _gateway_ref text,
  _amount_minor int)
returns text language plpgsql security definer set search_path = public as $$
declare _pay public.payments; _total int;
begin
  select * into _pay from public.payments where gateway = _gateway and gateway_ref = _gateway_ref for update;
  if _pay.id is null then return 'unknown payment'; end if;
  if not public.claim_webhook_event(_pay.org_id, _pay.gateway, _event_id, 'payment.refunded', _pay.id) then return 'duplicate'; end if;
  if _pay.status not in ('paid', 'refunded') then return 'not paid'; end if;
  -- Stripe sends the running total refunded on the charge, so take the larger value.
  _total := least(_pay.amount_minor, greatest(_pay.refunded_amount_minor, _amount_minor));
  update public.payments set refunded_amount_minor = _total,
    status = case when _total >= _pay.amount_minor then 'refunded' else status end where id = _pay.id;
  return case when _total >= _pay.amount_minor then 'refunded' else 'partly refunded' end;
end $$;

-- ----- entry points -----
-- Stripe webhooks (server role only).
create or replace function public.complete_gateway_payment(_event_id text, _payment uuid, _gateway_ref text,
  _amount_minor int, _currency text, _livemode boolean)
returns text language sql security definer set search_path = public as $$
  select public.payment_succeeded(_event_id, _payment, _gateway_ref, _amount_minor, _currency, _livemode)
$$;
create or replace function public.fail_gateway_payment(_event_id text, _payment uuid, _reason text)
returns text language sql security definer set search_path = public as $$
  select public.payment_failed(_event_id, _payment, _reason)
$$;
create or replace function public.mark_payment_refunded(_event_id text, _gateway public.payment_gateway,
  _gateway_ref text, _amount_minor int)
returns text language sql security definer set search_path = public as $$
  select public.payment_refunded(_event_id, _gateway, _gateway_ref, _amount_minor)
$$;

-- The test gateway's checkout page (D-129): the payer picks an outcome for their own payment.
create or replace function public.complete_test_payment(_payment uuid, _outcome text)
returns text language plpgsql security definer set search_path = public as $$
declare _pay public.payments; _event text := 'test_evt_' || gen_random_uuid();
begin
  select * into _pay from public.payments where id = _payment;
  if _pay.id is null or auth.uid() is null or _pay.payer_user_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if _pay.gateway <> 'test' then raise exception 'not a test payment'; end if;
  if _pay.status = 'failed' then update public.payments set status = 'pending' where id = _payment; end if;
  return case _outcome
    when 'accepted' then public.payment_succeeded(_event, _payment, 'test_pay_' || _payment, _pay.amount_minor, _pay.currency, false)
    when 'declined' then public.payment_failed(_event, _payment, 'Your card was declined.')
    when 'insufficient_funds' then public.payment_failed(_event, _payment, 'Your card has insufficient funds.')
    else 'unknown outcome' end;
end $$;

-- Decline a paid application and refund it. A test payment is refunded here; for Stripe the
-- server issues the refund with the returned reference and the charge.refunded webhook records it.
create or replace function public.decline_application(_membership uuid, _note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare _pay public.payments;
begin
  perform public.decline_membership(_membership, _note);
  select * into _pay from public.payments where membership_id = _membership and status = 'paid'
    order by created_at desc limit 1;
  if _pay.id is null then return jsonb_build_object('refund', null); end if;
  if _pay.gateway = 'test' then
    perform public.payment_refunded('test_refund_' || gen_random_uuid(), 'test', _pay.gateway_ref, _pay.amount_minor);
    return jsonb_build_object('refund', 'done');
  end if;
  if _pay.gateway = 'stripe' then
    return jsonb_build_object('refund', 'stripe', 'gateway_ref', _pay.gateway_ref, 'amount_minor', _pay.amount_minor,
      'currency', _pay.currency, 'org_id', _pay.org_id);
  end if;
  return jsonb_build_object('refund', null);
end $$;

revoke execute on function public.effective_approval_required(uuid), public.public_join_info(text),
  public.validate_join_answers(uuid, jsonb), public.begin_join(uuid, uuid, jsonb), public.begin_renewal(uuid, uuid),
  public.set_checkout_ref(uuid, text), public.grant_membership_term(uuid, uuid, date, uuid, uuid, boolean),
  public.payment_succeeded(text, uuid, text, int, text, boolean), public.payment_failed(text, uuid, text),
  public.payment_refunded(text, public.payment_gateway, text, int),
  public.complete_gateway_payment(text, uuid, text, int, text, boolean), public.fail_gateway_payment(text, uuid, text),
  public.mark_payment_refunded(text, public.payment_gateway, text, int), public.complete_test_payment(uuid, text),
  public.decline_application(uuid, text)
  from public, anon, authenticated;
grant execute on function public.public_join_info(text) to anon, authenticated;
grant execute on function public.begin_join(uuid, uuid, jsonb), public.begin_renewal(uuid, uuid),
  public.set_checkout_ref(uuid, text), public.complete_test_payment(uuid, text), public.decline_application(uuid, text),
  public.effective_approval_required(uuid) to authenticated;
grant execute on function public.complete_gateway_payment(text, uuid, text, int, text, boolean),
  public.fail_gateway_payment(text, uuid, text), public.mark_payment_refunded(text, public.payment_gateway, text, int)
  to service_role;
