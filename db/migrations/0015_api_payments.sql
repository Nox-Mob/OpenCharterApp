-- S-18: payments for OpenLedgerApp (and any integration). One row per payment that took money
-- (paid, or paid and later refunded), with what Ledger needs to book it: the day, the channel
-- (card through Stripe, or everything else recorded by hand), the gross, what was refunded, and the
-- chapter it was for. Security invoker: a reader sees only what charter.payments lets them see.
-- OpenLedgerApp reads it inside its own security-definer functions, after its own checks.
create or replace view charter.api_payments with (security_invoker = true) as
select
  p.id,
  p.org_id,
  p.unit_id,
  (p.unit_id = p.org_id) as is_national,
  u.name as unit_name,
  p.purpose::text as purpose,
  p.amount_minor,
  p.refunded_amount_minor,
  p.currency::text as currency,
  p.status::text as status,
  p.gateway::text as gateway,
  p.method::text as method,
  case when p.gateway = 'stripe' or p.method = 'card' then 'card' else 'other' end as channel,
  coalesce(p.received_on, (p.created_at at time zone u.timezone)::date) as received_on,
  p.created_at
from charter.payments p
join charter.units u on u.id = p.unit_id
where p.status in ('paid', 'refunded');

comment on view charter.api_payments is
  'Charter payments that took money, for OpenLedgerApp (S-18). docs/INTEGRATION.md';
grant select on charter.api_payments to authenticated;

create index if not exists payments_org_received_idx on charter.payments (org_id, received_on);
