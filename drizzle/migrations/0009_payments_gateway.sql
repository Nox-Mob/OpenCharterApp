-- ===== E-12 Per-org payment gateway connections (D-105, D-127, D-129) =====
-- Each org connects its own Stripe account, or (demo orgs only) the test gateway.
-- Credentials are sealed with AES-GCM by the server (GATEWAY_ENCRYPTION_KEY) and stored only as
-- ciphertext in the private schema, which the API doesn't expose. Lovable conventions apply to
-- public tables (D-125): full grants, RLS with has_permission, no DROP.

-- ----- payments: what checkout and refunds need -----
alter table public.payments
  add column checkout_ref text,
  add column failure_reason text check (char_length(failure_reason) <= 300),
  add column refunded_amount_minor int not null default 0 check (refunded_amount_minor >= 0);
create index on public.payments (gateway, gateway_ref);
create index on public.payments (gateway, checkout_ref);

-- ----- connection status (no secrets here) -----
create type public.gateway_status as enum ('verified', 'disabled');
create table public.gateway_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade unique,
  gateway public.payment_gateway not null check (gateway in ('stripe', 'test')),
  status public.gateway_status not null default 'verified',
  account_label text not null default '' check (char_length(account_label) <= 120),
  livemode boolean not null default false,
  connected_by uuid,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.gateway_connections to authenticated;
grant all on public.gateway_connections to service_role;
alter table public.gateway_connections enable row level security;
comment on table public.gateway_connections is
  'Which payment gateway an org uses (E-12). Written only by connect / disconnect RPCs; secrets live in private.gateway_secrets.';
create policy "payment admins read connections" on public.gateway_connections for select to authenticated
  using (public.has_permission(auth.uid(), 'payments.view', org_id)
    or public.has_permission(auth.uid(), 'payments.manage', org_id));
create trigger audit_gateway_connections after insert or update or delete on public.gateway_connections
  for each row execute function public.audit_row_change();

-- ----- webhook events: one row per gateway event, so handling is idempotent -----
create table public.webhook_events (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  gateway public.payment_gateway not null,
  event_id text not null check (char_length(event_id) between 1 and 255),
  type text not null check (char_length(type) <= 120),
  payment_id uuid references public.payments(id),
  received_at timestamptz not null default now(),
  unique (gateway, event_id)
);
grant select, insert, update, delete on public.webhook_events to authenticated;
grant all on public.webhook_events to service_role;
alter table public.webhook_events enable row level security;
comment on table public.webhook_events is
  'Gateway events already handled (E-12); written only by definer functions. Never deleted.';
create policy "payment admins read webhook events" on public.webhook_events for select to authenticated
  using (public.has_permission(auth.uid(), 'payments.view', org_id));

-- ----- private schema: never exposed through the API -----
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.gateway_secrets (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  sealed text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.gateway_secrets from public, anon, authenticated;
grant select, insert, update, delete on private.gateway_secrets to service_role;

-- Platform switches set by the operator (not by orgs), e.g. allowing the test gateway everywhere
-- on a preview install. Key 'test_gateway_everywhere' = true.
create table private.platform_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
revoke all on private.platform_flags from public, anon, authenticated;
grant select on private.platform_flags to service_role;

-- ----- rules -----
-- The test gateway is for demo orgs (docs/demo-data.md, id prefix d1000000-) unless the platform
-- turns it on everywhere. Real orgs can never fall back to fake payments.
create or replace function public.test_gateway_allowed(_org uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from public.organizations o where o.id = _org
      and (o.id::text like 'd1000000-%' or exists (select 1 from unnest(o.ancestor_ids) a where a::text like 'd1000000-%')))
    or coalesce((select (value #>> '{}')::boolean from private.platform_flags where key = 'test_gateway_everywhere'), false)
$$;

create or replace function public.gateway_connection_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.gateway = 'test' and not public.test_gateway_allowed(new.org_id) then
    raise exception 'test payments are only available to demo organizations';
  end if;
  if new.gateway = 'test' then new.livemode := false; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger gateway_connections_check before insert or update on public.gateway_connections
  for each row execute function public.gateway_connection_check();

-- ----- RPCs -----
create or replace function public.connect_test_gateway(_org uuid)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'payments.manage', _org) then raise exception 'not allowed'; end if;
  insert into public.gateway_connections (org_id, gateway, status, account_label, livemode, connected_by)
    values (_org, 'test', 'verified', 'Test payments', false, auth.uid())
    on conflict (org_id) do update set gateway = 'test', status = 'verified', account_label = 'Test payments',
      livemode = false, connected_by = auth.uid(), connected_at = now();
  delete from private.gateway_secrets where org_id = _org;
end $$;

-- Called by the connectStripe server function after it verified the key with Stripe and sealed
-- the credentials; the caller's own permission is checked here, not trusted from the server.
create or replace function public.save_stripe_connection(_org uuid, _sealed text, _account_label text, _livemode boolean)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'payments.manage', _org) then raise exception 'not allowed'; end if;
  if _sealed !~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then raise exception 'credentials must be sealed'; end if;
  insert into private.gateway_secrets (org_id, sealed) values (_org, _sealed)
    on conflict (org_id) do update set sealed = excluded.sealed, updated_at = now();
  insert into public.gateway_connections (org_id, gateway, status, account_label, livemode, connected_by)
    values (_org, 'stripe', 'verified', left(coalesce(_account_label, 'Stripe'), 120), coalesce(_livemode, false), auth.uid())
    on conflict (org_id) do update set gateway = 'stripe', status = 'verified', account_label = excluded.account_label,
      livemode = excluded.livemode, connected_by = auth.uid(), connected_at = now();
end $$;

-- Turns payments off; the sealed credentials are removed so a disconnect really disconnects.
create or replace function public.disconnect_gateway(_org uuid)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'payments.manage', _org) then raise exception 'not allowed'; end if;
  update public.gateway_connections set status = 'disabled' where org_id = _org;
  delete from private.gateway_secrets where org_id = _org;
end $$;

-- Server-only (webhooks, checkout, refunds): the sealed credentials for an org's verified Stripe connection.
create or replace function public.gateway_sealed_credentials(_org uuid)
returns text language sql stable security definer set search_path = public, private as $$
  select s.sealed from private.gateway_secrets s join public.gateway_connections c on c.org_id = s.org_id
  where s.org_id = _org and c.gateway = 'stripe' and c.status = 'verified'
$$;

-- Server-only: record a gateway event once. Returns false if it was already handled.
create or replace function public.claim_webhook_event(_org uuid, _gateway public.payment_gateway, _event_id text,
  _type text, _payment uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare _id bigint;
begin
  insert into public.webhook_events (org_id, gateway, event_id, type, payment_id)
    values (_org, _gateway, _event_id, _type, _payment)
    on conflict (gateway, event_id) do nothing returning id into _id;
  return _id is not null;
end $$;

revoke execute on function public.connect_test_gateway(uuid), public.save_stripe_connection(uuid, text, text, boolean),
  public.disconnect_gateway(uuid), public.gateway_sealed_credentials(uuid),
  public.claim_webhook_event(uuid, public.payment_gateway, text, text, uuid), public.test_gateway_allowed(uuid)
  from public, anon;
grant execute on function public.connect_test_gateway(uuid), public.save_stripe_connection(uuid, text, text, boolean),
  public.disconnect_gateway(uuid), public.test_gateway_allowed(uuid) to authenticated;
revoke execute on function public.gateway_sealed_credentials(uuid),
  public.claim_webhook_event(uuid, public.payment_gateway, text, text, uuid) from authenticated;
grant execute on function public.gateway_sealed_credentials(uuid),
  public.claim_webhook_event(uuid, public.payment_gateway, text, text, uuid) to service_role;
