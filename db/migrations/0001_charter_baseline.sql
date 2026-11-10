-- OpenCharterApp baseline: Charter's tables in schema `charter`, on top of the
-- OpenAppHub core (db/core). Spec: docs/SHARED-SPEC.md §3.4, §3.5, §3.9, §4.5, §6.3;
-- mapping: docs/MIGRATION-NOTES.md §1–2 and §9.
--
-- Runs on the shared OpenAppHub database (hosted) and on a self-hosted Charter
-- database (core + this file). Applied once by scripts/migrate.mjs.
--
-- Built from the final state of the old migrations (replayed, then ported), so
-- every rule keeps its behaviour. The mapping onto core (spec §3.9):
--   * The top of an organization's tree (a national or a standalone association)
--     is one public.organizations row: the customer, and the org Board and Ledger
--     share. Its regions and chapters are charter.units under it. The top unit has
--     the same id as the organization.
--   * Every old org_id was a node of that tree, so it's now unit_id. Every table
--     also gets org_id, the customer, set from its unit by a trigger.
--   * Charter's roles, permissions and inheritance down the tree stay. Staff
--     permissions count only while the person is a core owner, admin or member of
--     the organization; core owners and admins hold every org_admin permission in
--     their tree (spec §4.5). Charter's built-in Member role (dues members) needs no
--     core membership: those are portal members.
--   * Every write needs the organization's plan to include Charter
--     (public.has_app_access(org, 'charter')), except recording payments members
--     already made, refunds and receipts (spec §6.3).
--   * Invitations are core (public.invitations); charter.on_invitation_accepted
--     applies what an invitation made in Charter carries (unit and Charter role).
-- Platform operators and demo organizations stay here for self-hosted Charter;
-- hosted, the hub has its own (to be retired here in step 11).

-- Functions below are in alphabetical order (as pg_dump writes them) and some SQL
-- functions call ones defined later, so their bodies are checked when first run,
-- not when created. This setting lasts only for this migration's transaction.
set local check_function_bodies = false;

create schema if not exists charter;
create schema if not exists extensions;
revoke all on schema charter from public, anon;
grant usage on schema charter to authenticated, service_role;

-- Types -------------------------------------------------------------------------------

CREATE TYPE charter.attribute_subject AS ENUM (
    'member',
    'chapter'
);

CREATE TYPE charter.attribute_type AS ENUM (
    'text',
    'number',
    'date',
    'boolean',
    'choice',
    'multi_choice',
    'ordered'
);

CREATE TYPE charter.attribute_visibility AS ENUM (
    'admins',
    'members',
    'public'
);

CREATE TYPE charter.gateway_status AS ENUM (
    'verified',
    'disabled'
);

CREATE TYPE charter.membership_event_kind AS ENUM (
    'joined',
    'renewed',
    'approved',
    'declined',
    'cancelled'
);

CREATE TYPE charter.membership_status AS ENUM (
    'pending',
    'active',
    'cancelled',
    'declined'
);

CREATE TYPE charter.org_type AS ENUM (
    'platform',
    'national',
    'region',
    'chapter',
    'standalone'
);

CREATE TYPE charter.payment_gateway AS ENUM (
    'manual',
    'stripe',
    'test'
);

CREATE TYPE charter.payment_method AS ENUM (
    'cash',
    'check',
    'card',
    'bank_transfer',
    'other'
);

CREATE TYPE charter.payment_purpose AS ENUM (
    'join',
    'renew'
);

CREATE TYPE charter.payment_status AS ENUM (
    'pending',
    'paid',
    'refunded',
    'failed'
);

CREATE TYPE charter.receipt_status AS ENUM (
    'issued',
    'voided',
    'superseded'
);

CREATE TYPE charter.seat_scope AS ENUM (
    'self',
    'chapters',
    'self_and_chapters'
);

CREATE TYPE charter.setting_mode AS ENUM (
    'inherit',
    'override',
    'locked'
);

CREATE TYPE charter.setup_status AS ENUM (
    'in_progress',
    'applied',
    'needs_review'
);

CREATE TYPE charter.tax_treatment AS ENUM (
    'deductible',
    'non_deductible',
    'partial'
);

CREATE TYPE charter.term_unit AS ENUM (
    'day',
    'month',
    'year'
);

-- Tables (from the old schema) -------------------------------------------------------

CREATE SEQUENCE charter.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE charter.membership_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE charter.webhook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE charter.member_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    user_id uuid,
    display_name text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'signup'::text NOT NULL,
    claimed_at timestamp with time zone,
    directory_listed boolean,
    home_of uuid,
    left_at timestamp with time zone,
    CONSTRAINT member_profiles_login_or_record CHECK (((user_id IS NOT NULL) OR (source = ANY (ARRAY['admin'::text, 'import'::text])))),
    CONSTRAINT member_profiles_source_check CHECK ((source = ANY (ARRAY['signup'::text, 'invite'::text, 'admin'::text, 'import'::text])))
);

CREATE TABLE charter.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    key text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roles_description_check CHECK ((char_length(description) <= 300)),
    CONSTRAINT roles_key_format CHECK ((key ~ '^[a-z][a-z0-9_]{0,39}$'::text)),
    CONSTRAINT roles_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60)))
);

CREATE TABLE charter.seat_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    key text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    seat_count integer DEFAULT 1 NOT NULL,
    default_term_count integer,
    default_term_unit charter.term_unit,
    role_id uuid,
    scope charter.seat_scope DEFAULT 'self'::charter.seat_scope NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seat_templates_check CHECK ((((default_term_count IS NULL) AND (default_term_unit IS NULL)) OR (((default_term_count >= 1) AND (default_term_count <= 100)) AND (default_term_unit IS NOT NULL)))),
    CONSTRAINT seat_templates_description_check CHECK ((char_length(description) <= 500)),
    CONSTRAINT seat_templates_key_check CHECK ((key ~ '^[a-z][a-z0-9_]{0,47}$'::text)),
    CONSTRAINT seat_templates_seat_count_check CHECK (((seat_count >= 1) AND (seat_count <= 50))),
    CONSTRAINT seat_templates_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 80)))
);

CREATE TABLE charter.attribute_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    applies_to charter.attribute_subject DEFAULT 'member'::charter.attribute_subject NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    help text DEFAULT ''::text NOT NULL,
    data_type charter.attribute_type NOT NULL,
    required boolean DEFAULT false NOT NULL,
    visibility charter.attribute_visibility DEFAULT 'admins'::charter.attribute_visibility NOT NULL,
    member_editable boolean DEFAULT false NOT NULL,
    show_in_directory boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    CONSTRAINT attribute_definitions_key_check CHECK ((key ~ '^[a-z][a-z0-9_]{0,47}$'::text)),
    CONSTRAINT attribute_definitions_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 80)))
);

CREATE TABLE charter.gateway_secrets (
    unit_id uuid NOT NULL,
    sealed text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE charter.platform_flags (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE charter.platform_operators (
    user_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE charter.affiliation_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    from_org_id uuid,
    to_org_id uuid,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE charter.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    template_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    seat_number integer NOT NULL,
    starts_on date NOT NULL,
    planned_end date,
    ended_on date,
    end_reason text DEFAULT ''::text NOT NULL,
    role_assignment_id uuid,
    appointed_by uuid,
    ended_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_check CHECK (((ended_on IS NULL) OR (ended_on >= starts_on))),
    CONSTRAINT appointments_check1 CHECK (((planned_end IS NULL) OR (planned_end >= starts_on))),
    CONSTRAINT appointments_end_reason_check CHECK ((char_length(end_reason) <= 300)),
    CONSTRAINT appointments_seat_number_check CHECK (((seat_number >= 1) AND (seat_number <= 50)))
);

CREATE TABLE charter.attribute_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    definition_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    value text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT attribute_options_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 80))),
    CONSTRAINT attribute_options_value_check CHECK (((char_length(value) >= 1) AND (char_length(value) <= 80)))
);

CREATE TABLE charter.attribute_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    definition_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    value jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE charter.audit_events (
    id bigint NOT NULL,
    unit_id uuid,
    actor_id uuid,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    before jsonb,
    after jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tx_id bigint DEFAULT txid_current()
);

CREATE TABLE charter.gateway_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    gateway charter.payment_gateway NOT NULL,
    status charter.gateway_status DEFAULT 'verified'::charter.gateway_status NOT NULL,
    account_label text DEFAULT ''::text NOT NULL,
    livemode boolean DEFAULT false NOT NULL,
    connected_by uuid,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gateway_connections_account_label_check CHECK ((char_length(account_label) <= 120)),
    CONSTRAINT gateway_connections_gateway_check CHECK ((gateway = ANY (ARRAY['stripe'::charter.payment_gateway, 'test'::charter.payment_gateway])))
);

CREATE TABLE charter.member_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    name text NOT NULL,
    filter jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_segments_filter_check CHECK ((jsonb_typeof(filter) = 'object'::text)),
    CONSTRAINT member_segments_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))
);

CREATE TABLE charter.membership_events (
    id bigint NOT NULL,
    unit_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    kind charter.membership_event_kind NOT NULL,
    tier_id uuid,
    term_id uuid,
    period_start date,
    period_end date,
    payment_id uuid,
    note text DEFAULT ''::text NOT NULL,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT membership_events_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE charter.membership_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    tax_treatment charter.tax_treatment DEFAULT 'non_deductible'::charter.tax_treatment NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    suggested boolean DEFAULT false NOT NULL,
    source_tier_id uuid,
    link_mode text,
    price_rule text,
    price_value integer,
    CONSTRAINT membership_tiers_description_check CHECK ((char_length(description) <= 500)),
    CONSTRAINT membership_tiers_key_check CHECK ((key ~ '^[a-z][a-z0-9_]{0,47}$'::text)),
    CONSTRAINT membership_tiers_link_mode_check CHECK ((link_mode = ANY (ARRAY['copy'::text, 'linked'::text]))),
    CONSTRAINT membership_tiers_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT membership_tiers_price_rule_check CHECK ((price_rule = ANY (ARRAY['same'::text, 'minus_amount'::text, 'minus_percent'::text]))),
    CONSTRAINT membership_tiers_price_value_check CHECK (((price_value >= 0) AND (price_value <= 100000000)))
);

CREATE TABLE charter.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    tier_id uuid NOT NULL,
    term_id uuid NOT NULL,
    status charter.membership_status NOT NULL,
    joined_on date,
    paid_through date,
    lifetime boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    home_org_id uuid,
    CONSTRAINT memberships_check CHECK (((NOT lifetime) OR (paid_through IS NULL))),
    CONSTRAINT memberships_check1 CHECK (((status <> 'active'::charter.membership_status) OR (joined_on IS NOT NULL))),
    CONSTRAINT memberships_check2 CHECK (((status <> 'active'::charter.membership_status) OR lifetime OR (paid_through IS NOT NULL)))
);

CREATE TABLE charter.org_settings (
    unit_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb,
    mode charter.setting_mode DEFAULT 'override'::charter.setting_mode NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_settings_key_check CHECK ((key ~ '^[a-z][a-z0-9_.]{1,63}$'::text))
);

CREATE TABLE charter.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    type charter.org_type NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    ancestor_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    timezone text DEFAULT 'America/Chicago'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_path text,
    is_demo boolean DEFAULT false NOT NULL,
    CONSTRAINT units_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120))),
    CONSTRAINT units_slug_check CHECK ((slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'::text))
);

CREATE TABLE charter.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    membership_id uuid,
    profile_id uuid,
    payer_user_id uuid,
    purpose charter.payment_purpose NOT NULL,
    amount_minor integer NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    status charter.payment_status NOT NULL,
    gateway charter.payment_gateway DEFAULT 'manual'::charter.payment_gateway NOT NULL,
    method charter.payment_method,
    gateway_ref text,
    livemode boolean DEFAULT true NOT NULL,
    received_on date,
    note text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    checkout_ref text,
    failure_reason text,
    refunded_amount_minor integer DEFAULT 0 NOT NULL,
    term_id uuid,
    join_answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT payments_amount_minor_check CHECK (((amount_minor >= 0) AND (amount_minor <= 100000000))),
    CONSTRAINT payments_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT payments_failure_reason_check CHECK ((char_length(failure_reason) <= 300)),
    CONSTRAINT payments_note_check CHECK ((char_length(note) <= 500)),
    CONSTRAINT payments_refunded_amount_minor_check CHECK ((refunded_amount_minor >= 0))
);

CREATE TABLE charter.permissions (
    key text NOT NULL,
    description text NOT NULL
);

CREATE TABLE charter.pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    term_id uuid NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    price_minor integer,
    discount_pct integer,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_rules_check CHECK (((price_minor IS NULL) <> (discount_pct IS NULL))),
    CONSTRAINT pricing_rules_conditions_check CHECK ((jsonb_typeof(conditions) = 'array'::text)),
    CONSTRAINT pricing_rules_discount_pct_check CHECK (((discount_pct >= 1) AND (discount_pct <= 100))),
    CONSTRAINT pricing_rules_label_check CHECK ((char_length(label) <= 80)),
    CONSTRAINT pricing_rules_price_minor_check CHECK (((price_minor >= 0) AND (price_minor <= 100000000)))
);

CREATE TABLE charter.receipt_counters (
    unit_id uuid NOT NULL,
    year integer NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL,
    CONSTRAINT receipt_counters_year_check CHECK (((year >= 2000) AND (year <= 2999)))
);

CREATE TABLE charter.receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    number text NOT NULL,
    year integer NOT NULL,
    seq integer NOT NULL,
    status charter.receipt_status DEFAULT 'issued'::charter.receipt_status NOT NULL,
    supersedes_id uuid,
    snapshot jsonb NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    voided_at timestamp with time zone,
    void_reason text,
    voided_by uuid,
    CONSTRAINT receipts_void_reason_check CHECK ((char_length(void_reason) <= 300))
);

CREATE TABLE charter.role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE charter.role_permissions (
    role_id uuid NOT NULL,
    permission_key text NOT NULL
);

CREATE TABLE charter.seat_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    template_id uuid NOT NULL,
    role_email text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seat_contacts_role_email_check CHECK (((role_email IS NULL) OR ((char_length(role_email) <= 254) AND (role_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))))
);

CREATE TABLE charter.seat_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    template_id uuid NOT NULL,
    length_count integer,
    length_unit charter.term_unit,
    effective_from date NOT NULL,
    bylaw_reference text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    set_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seat_terms_bylaw_reference_check CHECK ((char_length(bylaw_reference) <= 200)),
    CONSTRAINT seat_terms_check CHECK ((((length_count IS NULL) AND (length_unit IS NULL)) OR (((length_count >= 1) AND (length_count <= 100)) AND (length_unit IS NOT NULL)))),
    CONSTRAINT seat_terms_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE charter.seat_title_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    template_id uuid NOT NULL,
    title text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seat_title_overrides_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 80)))
);

CREATE TABLE charter.setup_states (
    unit_id uuid NOT NULL,
    flow_id text NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    status charter.setup_status DEFAULT 'in_progress'::charter.setup_status NOT NULL,
    applied_at timestamp with time zone,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT setup_states_flow_id_check CHECK ((flow_id ~ '^[a-z][a-z0-9_]{1,40}$'::text))
);

CREATE TABLE charter.tax_profiles (
    unit_id uuid NOT NULL,
    legal_name text DEFAULT ''::text NOT NULL,
    ein text DEFAULT ''::text NOT NULL,
    tax_status text DEFAULT ''::text NOT NULL,
    address_line1 text DEFAULT ''::text NOT NULL,
    address_line2 text DEFAULT ''::text NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    region text DEFAULT ''::text NOT NULL,
    postal_code text DEFAULT ''::text NOT NULL,
    country text DEFAULT 'US'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_profiles_ein_check CHECK (((ein = ''::text) OR (ein ~ '^\d{2}-\d{7}$'::text)))
);

CREATE TABLE charter.tier_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tier_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    length_count integer,
    length_unit charter.term_unit,
    price_minor integer NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_term_id uuid,
    CONSTRAINT tier_terms_check CHECK ((((length_count IS NULL) AND (length_unit IS NULL)) OR (((length_count >= 1) AND (length_count <= 1000)) AND (length_unit IS NOT NULL)))),
    CONSTRAINT tier_terms_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT tier_terms_key_check CHECK ((key ~ '^[a-z0-9][a-z0-9_]{0,47}$'::text)),
    CONSTRAINT tier_terms_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 80))),
    CONSTRAINT tier_terms_price_minor_check CHECK (((price_minor >= 0) AND (price_minor <= 100000000)))
);

CREATE TABLE charter.webhook_events (
    id bigint NOT NULL,
    unit_id uuid NOT NULL,
    gateway charter.payment_gateway NOT NULL,
    event_id text NOT NULL,
    type text NOT NULL,
    payment_id uuid,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_events_event_id_check CHECK (((char_length(event_id) >= 1) AND (char_length(event_id) <= 255))),
    CONSTRAINT webhook_events_type_check CHECK ((char_length(type) <= 120))
);

ALTER SEQUENCE charter.audit_events_id_seq OWNED BY charter.audit_events.id;

ALTER SEQUENCE charter.membership_events_id_seq OWNED BY charter.membership_events.id;

ALTER SEQUENCE charter.webhook_events_id_seq OWNED BY charter.webhook_events.id;

ALTER TABLE ONLY charter.audit_events ALTER COLUMN id SET DEFAULT nextval('charter.audit_events_id_seq'::regclass);

ALTER TABLE ONLY charter.membership_events ALTER COLUMN id SET DEFAULT nextval('charter.membership_events_id_seq'::regclass);

ALTER TABLE ONLY charter.webhook_events ALTER COLUMN id SET DEFAULT nextval('charter.webhook_events_id_seq'::regclass);

-- The customer on every row (spec §3.9) ------------------------------------------------

alter table charter.units add column org_id uuid;
do $$
declare
  r record;
begin
  for r in
    select c.table_name, c.is_nullable from information_schema.columns c
    where c.table_schema = 'charter' and c.column_name = 'unit_id' and c.table_name <> 'units'
  loop
    execute format('alter table charter.%I add column org_id uuid', r.table_name);
  end loop;
end $$;

ALTER TABLE ONLY charter.gateway_secrets
    ADD CONSTRAINT gateway_secrets_pkey PRIMARY KEY (unit_id);

ALTER TABLE ONLY charter.platform_flags
    ADD CONSTRAINT platform_flags_pkey PRIMARY KEY (key);

ALTER TABLE ONLY charter.platform_operators
    ADD CONSTRAINT platform_operators_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY charter.affiliation_history
    ADD CONSTRAINT affiliation_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.attribute_definitions
    ADD CONSTRAINT attribute_definitions_org_id_applies_to_key_key UNIQUE (unit_id, applies_to, key);

ALTER TABLE ONLY charter.attribute_definitions
    ADD CONSTRAINT attribute_definitions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.attribute_options
    ADD CONSTRAINT attribute_options_definition_id_value_key UNIQUE (definition_id, value);

ALTER TABLE ONLY charter.attribute_options
    ADD CONSTRAINT attribute_options_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.attribute_values
    ADD CONSTRAINT attribute_values_definition_id_entity_id_key UNIQUE (definition_id, entity_id);

ALTER TABLE ONLY charter.attribute_values
    ADD CONSTRAINT attribute_values_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.gateway_connections
    ADD CONSTRAINT gateway_connections_org_id_key UNIQUE (unit_id);

ALTER TABLE ONLY charter.gateway_connections
    ADD CONSTRAINT gateway_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.member_segments
    ADD CONSTRAINT member_segments_org_id_name_key UNIQUE (unit_id, name);

ALTER TABLE ONLY charter.member_segments
    ADD CONSTRAINT member_segments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.membership_events
    ADD CONSTRAINT membership_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.membership_tiers
    ADD CONSTRAINT membership_tiers_org_id_key_key UNIQUE (unit_id, key);

ALTER TABLE ONLY charter.membership_tiers
    ADD CONSTRAINT membership_tiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.memberships
    ADD CONSTRAINT memberships_org_id_profile_id_key UNIQUE (unit_id, profile_id);

ALTER TABLE ONLY charter.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.member_profiles
    ADD CONSTRAINT member_profiles_org_id_user_id_key UNIQUE (unit_id, user_id);

ALTER TABLE ONLY charter.member_profiles
    ADD CONSTRAINT member_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.org_settings
    ADD CONSTRAINT org_settings_pkey PRIMARY KEY (unit_id, key);

ALTER TABLE ONLY charter.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.units
    ADD CONSTRAINT units_slug_key UNIQUE (slug);

ALTER TABLE ONLY charter.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (key);

ALTER TABLE ONLY charter.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.receipt_counters
    ADD CONSTRAINT receipt_counters_pkey PRIMARY KEY (unit_id, year);

ALTER TABLE ONLY charter.receipts
    ADD CONSTRAINT receipts_org_id_number_key UNIQUE (unit_id, number);

ALTER TABLE ONLY charter.receipts
    ADD CONSTRAINT receipts_org_id_year_seq_key UNIQUE (unit_id, year, seq);

ALTER TABLE ONLY charter.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.role_assignments
    ADD CONSTRAINT role_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.role_assignments
    ADD CONSTRAINT role_assignments_user_id_role_id_org_id_key UNIQUE (user_id, role_id, unit_id);

ALTER TABLE ONLY charter.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_key);

ALTER TABLE ONLY charter.roles
    ADD CONSTRAINT roles_org_id_key_key UNIQUE NULLS NOT DISTINCT (unit_id, key);

ALTER TABLE ONLY charter.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.seat_contacts
    ADD CONSTRAINT seat_contacts_org_id_template_id_key UNIQUE (unit_id, template_id);

ALTER TABLE ONLY charter.seat_contacts
    ADD CONSTRAINT seat_contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.seat_templates
    ADD CONSTRAINT seat_templates_org_id_key_key UNIQUE (unit_id, key);

ALTER TABLE ONLY charter.seat_templates
    ADD CONSTRAINT seat_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.seat_terms
    ADD CONSTRAINT seat_terms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.seat_title_overrides
    ADD CONSTRAINT seat_title_overrides_org_id_template_id_key UNIQUE (unit_id, template_id);

ALTER TABLE ONLY charter.seat_title_overrides
    ADD CONSTRAINT seat_title_overrides_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.setup_states
    ADD CONSTRAINT setup_states_pkey PRIMARY KEY (unit_id, flow_id);

ALTER TABLE ONLY charter.tax_profiles
    ADD CONSTRAINT tax_profiles_pkey PRIMARY KEY (unit_id);

ALTER TABLE ONLY charter.tier_terms
    ADD CONSTRAINT tier_terms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.tier_terms
    ADD CONSTRAINT tier_terms_tier_id_key_key UNIQUE (tier_id, key);

ALTER TABLE ONLY charter.webhook_events
    ADD CONSTRAINT webhook_events_gateway_event_id_key UNIQUE (gateway, event_id);

ALTER TABLE ONLY charter.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY charter.gateway_secrets
    ADD CONSTRAINT gateway_secrets_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.affiliation_history
    ADD CONSTRAINT affiliation_history_from_org_id_fkey FOREIGN KEY (from_org_id) REFERENCES charter.units(id) ON DELETE SET NULL;

ALTER TABLE ONLY charter.affiliation_history
    ADD CONSTRAINT affiliation_history_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES charter.memberships(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.affiliation_history
    ADD CONSTRAINT affiliation_history_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.affiliation_history
    ADD CONSTRAINT affiliation_history_to_org_id_fkey FOREIGN KEY (to_org_id) REFERENCES charter.units(id) ON DELETE SET NULL;

ALTER TABLE ONLY charter.appointments
    ADD CONSTRAINT appointments_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.appointments
    ADD CONSTRAINT appointments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES charter.member_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.appointments
    ADD CONSTRAINT appointments_role_assignment_id_fkey FOREIGN KEY (role_assignment_id) REFERENCES charter.role_assignments(id) ON DELETE SET NULL;

ALTER TABLE ONLY charter.appointments
    ADD CONSTRAINT appointments_template_id_fkey FOREIGN KEY (template_id) REFERENCES charter.seat_templates(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.attribute_definitions
    ADD CONSTRAINT attribute_definitions_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.attribute_options
    ADD CONSTRAINT attribute_options_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES charter.attribute_definitions(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.attribute_options
    ADD CONSTRAINT attribute_options_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.attribute_values
    ADD CONSTRAINT attribute_values_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES charter.attribute_definitions(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.attribute_values
    ADD CONSTRAINT attribute_values_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.gateway_connections
    ADD CONSTRAINT gateway_connections_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.member_segments
    ADD CONSTRAINT member_segments_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.membership_events
    ADD CONSTRAINT membership_events_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES charter.memberships(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.membership_events
    ADD CONSTRAINT membership_events_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.membership_events
    ADD CONSTRAINT membership_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES charter.payments(id);

ALTER TABLE ONLY charter.membership_events
    ADD CONSTRAINT membership_events_term_id_fkey FOREIGN KEY (term_id) REFERENCES charter.tier_terms(id);

ALTER TABLE ONLY charter.membership_events
    ADD CONSTRAINT membership_events_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES charter.membership_tiers(id);

ALTER TABLE ONLY charter.membership_tiers
    ADD CONSTRAINT membership_tiers_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.membership_tiers
    ADD CONSTRAINT membership_tiers_source_tier_id_fkey FOREIGN KEY (source_tier_id) REFERENCES charter.membership_tiers(id) ON DELETE SET NULL;

ALTER TABLE ONLY charter.memberships
    ADD CONSTRAINT memberships_home_org_id_fkey FOREIGN KEY (home_org_id) REFERENCES charter.units(id) ON DELETE SET NULL;

ALTER TABLE ONLY charter.memberships
    ADD CONSTRAINT memberships_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.memberships
    ADD CONSTRAINT memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES charter.member_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.memberships
    ADD CONSTRAINT memberships_term_id_fkey FOREIGN KEY (term_id) REFERENCES charter.tier_terms(id);

ALTER TABLE ONLY charter.memberships
    ADD CONSTRAINT memberships_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES charter.membership_tiers(id);

ALTER TABLE ONLY charter.member_profiles
    ADD CONSTRAINT member_profiles_home_of_fkey FOREIGN KEY (home_of) REFERENCES charter.memberships(id) ON DELETE SET NULL;

ALTER TABLE ONLY charter.member_profiles
    ADD CONSTRAINT member_profiles_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.org_settings
    ADD CONSTRAINT org_settings_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.units
    ADD CONSTRAINT units_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES charter.units(id) ON DELETE RESTRICT;

ALTER TABLE ONLY charter.payments
    ADD CONSTRAINT payments_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES charter.memberships(id);

ALTER TABLE ONLY charter.payments
    ADD CONSTRAINT payments_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.payments
    ADD CONSTRAINT payments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES charter.member_profiles(id);

ALTER TABLE ONLY charter.payments
    ADD CONSTRAINT payments_term_id_fkey FOREIGN KEY (term_id) REFERENCES charter.tier_terms(id);

ALTER TABLE ONLY charter.pricing_rules
    ADD CONSTRAINT pricing_rules_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.pricing_rules
    ADD CONSTRAINT pricing_rules_term_id_fkey FOREIGN KEY (term_id) REFERENCES charter.tier_terms(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.receipt_counters
    ADD CONSTRAINT receipt_counters_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.receipts
    ADD CONSTRAINT receipts_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.receipts
    ADD CONSTRAINT receipts_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES charter.payments(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.receipts
    ADD CONSTRAINT receipts_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES charter.receipts(id);

ALTER TABLE ONLY charter.role_assignments
    ADD CONSTRAINT role_assignments_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.role_assignments
    ADD CONSTRAINT role_assignments_role_id_fkey FOREIGN KEY (role_id) REFERENCES charter.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.role_permissions
    ADD CONSTRAINT role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES charter.permissions(key) ON DELETE CASCADE;

ALTER TABLE ONLY charter.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES charter.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.roles
    ADD CONSTRAINT roles_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.seat_contacts
    ADD CONSTRAINT seat_contacts_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.seat_contacts
    ADD CONSTRAINT seat_contacts_template_id_fkey FOREIGN KEY (template_id) REFERENCES charter.seat_templates(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.seat_templates
    ADD CONSTRAINT seat_templates_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.seat_templates
    ADD CONSTRAINT seat_templates_role_id_fkey FOREIGN KEY (role_id) REFERENCES charter.roles(id);

ALTER TABLE ONLY charter.seat_terms
    ADD CONSTRAINT seat_terms_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.seat_terms
    ADD CONSTRAINT seat_terms_template_id_fkey FOREIGN KEY (template_id) REFERENCES charter.seat_templates(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.seat_title_overrides
    ADD CONSTRAINT seat_title_overrides_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.seat_title_overrides
    ADD CONSTRAINT seat_title_overrides_template_id_fkey FOREIGN KEY (template_id) REFERENCES charter.seat_templates(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.setup_states
    ADD CONSTRAINT setup_states_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.tax_profiles
    ADD CONSTRAINT tax_profiles_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.tier_terms
    ADD CONSTRAINT tier_terms_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.tier_terms
    ADD CONSTRAINT tier_terms_source_term_id_fkey FOREIGN KEY (source_term_id) REFERENCES charter.tier_terms(id) ON DELETE SET NULL;

ALTER TABLE ONLY charter.tier_terms
    ADD CONSTRAINT tier_terms_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES charter.membership_tiers(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.webhook_events
    ADD CONSTRAINT webhook_events_org_id_fkey FOREIGN KEY (unit_id) REFERENCES charter.units(id) ON DELETE CASCADE;

ALTER TABLE ONLY charter.webhook_events
    ADD CONSTRAINT webhook_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES charter.payments(id);

do $$
declare
  r record;
begin
  for r in
    select c.table_name, c.is_nullable from information_schema.columns c
    where c.table_schema = 'charter' and c.column_name = 'unit_id' and c.table_name <> 'units'
  loop
    execute format('alter table charter.%I add constraint %I foreign key (org_id) references public.organizations (id) on delete cascade',
      r.table_name, r.table_name || '_org_fkey');
    execute format('create index %I on charter.%I (org_id)', r.table_name || '_customer_idx', r.table_name);
  end loop;
end $$;
alter table charter.units add constraint units_org_fkey foreign key (org_id) references public.organizations (id) on delete cascade;
create index units_customer_idx on charter.units (org_id);

CREATE INDEX affiliation_history_from_org_id_idx ON charter.affiliation_history USING btree (from_org_id);

CREATE INDEX affiliation_history_membership_id_idx ON charter.affiliation_history USING btree (membership_id);

CREATE INDEX affiliation_history_org_id_membership_id_created_at_idx ON charter.affiliation_history USING btree (unit_id, membership_id, created_at DESC);

CREATE INDEX affiliation_history_to_org_id_idx ON charter.affiliation_history USING btree (to_org_id);

CREATE UNIQUE INDEX appointments_one_holder_per_seat ON charter.appointments USING btree (unit_id, template_id, seat_number) WHERE (ended_on IS NULL);

CREATE UNIQUE INDEX appointments_one_seat_per_person ON charter.appointments USING btree (unit_id, template_id, profile_id) WHERE (ended_on IS NULL);

CREATE INDEX appointments_org_id_template_id_idx ON charter.appointments USING btree (unit_id, template_id);

CREATE INDEX appointments_profile_id_idx ON charter.appointments USING btree (profile_id);

CREATE INDEX appointments_role_assignment_id_idx ON charter.appointments USING btree (role_assignment_id);

CREATE INDEX appointments_template_id_idx ON charter.appointments USING btree (template_id);

CREATE INDEX attribute_definitions_org_id_idx ON charter.attribute_definitions USING btree (unit_id);

CREATE INDEX attribute_values_org_id_entity_id_idx ON charter.attribute_values USING btree (unit_id, entity_id);

CREATE INDEX audit_events_org_id_created_at_idx ON charter.audit_events USING btree (unit_id, created_at DESC);

CREATE INDEX membership_events_membership_id_created_at_idx ON charter.membership_events USING btree (membership_id, created_at);

CREATE INDEX membership_events_org_id_idx ON charter.membership_events USING btree (unit_id);

CREATE INDEX membership_events_payment_id_idx ON charter.membership_events USING btree (payment_id);

CREATE INDEX membership_events_term_id_idx ON charter.membership_events USING btree (term_id);

CREATE INDEX membership_events_tier_id_idx ON charter.membership_events USING btree (tier_id);

CREATE INDEX membership_tiers_org_id_idx ON charter.membership_tiers USING btree (unit_id);

CREATE INDEX membership_tiers_source_tier_id_idx ON charter.membership_tiers USING btree (source_tier_id);

CREATE INDEX memberships_home_org_id_idx ON charter.memberships USING btree (home_org_id);

CREATE INDEX memberships_org_id_status_idx ON charter.memberships USING btree (unit_id, status);

CREATE INDEX memberships_profile_id_idx ON charter.memberships USING btree (profile_id);

CREATE INDEX memberships_term_id_idx ON charter.memberships USING btree (term_id);

CREATE INDEX memberships_tier_id_idx ON charter.memberships USING btree (tier_id);

CREATE INDEX member_profiles_home_of_idx ON charter.member_profiles USING btree (home_of);

CREATE INDEX member_profiles_org_id_lower_idx ON charter.member_profiles USING btree (unit_id, lower(email));

CREATE INDEX member_profiles_user_id_idx ON charter.member_profiles USING btree (user_id);

CREATE INDEX units_ancestor_ids_idx ON charter.units USING gin (ancestor_ids);

CREATE INDEX units_parent_id_idx ON charter.units USING btree (parent_id);

CREATE INDEX payments_gateway_checkout_ref_idx ON charter.payments USING btree (gateway, checkout_ref);

CREATE INDEX payments_gateway_gateway_ref_idx ON charter.payments USING btree (gateway, gateway_ref);

CREATE INDEX payments_membership_id_idx ON charter.payments USING btree (membership_id);

CREATE INDEX payments_org_id_created_at_idx ON charter.payments USING btree (unit_id, created_at DESC);

CREATE INDEX payments_profile_id_idx ON charter.payments USING btree (profile_id);

CREATE INDEX payments_term_id_idx ON charter.payments USING btree (term_id);

CREATE INDEX pricing_rules_org_id_idx ON charter.pricing_rules USING btree (unit_id);

CREATE INDEX pricing_rules_term_id_sort_order_idx ON charter.pricing_rules USING btree (term_id, sort_order);

CREATE UNIQUE INDEX receipts_one_issued_per_payment ON charter.receipts USING btree (payment_id) WHERE (status = 'issued'::charter.receipt_status);

CREATE INDEX receipts_payment_id_idx ON charter.receipts USING btree (payment_id);

CREATE INDEX receipts_supersedes_id_idx ON charter.receipts USING btree (supersedes_id);

CREATE INDEX role_assignments_org_id_idx ON charter.role_assignments USING btree (unit_id);

CREATE INDEX role_assignments_role_id_idx ON charter.role_assignments USING btree (role_id);

CREATE INDEX role_assignments_user_id_idx ON charter.role_assignments USING btree (user_id);

CREATE INDEX seat_templates_org_id_idx ON charter.seat_templates USING btree (unit_id);

CREATE INDEX seat_terms_org_id_template_id_effective_from_idx ON charter.seat_terms USING btree (unit_id, template_id, effective_from DESC);

CREATE INDEX tier_terms_org_id_idx ON charter.tier_terms USING btree (unit_id);

CREATE INDEX tier_terms_source_term_id_idx ON charter.tier_terms USING btree (source_term_id);

CREATE INDEX webhook_events_org_id_idx ON charter.webhook_events USING btree (unit_id);

CREATE INDEX webhook_events_payment_id_idx ON charter.webhook_events USING btree (payment_id);

-- Catalogue rows the old migrations inserted: permission keys and the two built-in
-- roles (org_admin, member) with their permissions.
INSERT INTO charter.permissions (key, description) VALUES ('org.view', 'View organization and its sub-orgs');
INSERT INTO charter.permissions (key, description) VALUES ('org.manage', 'Edit organization settings');
INSERT INTO charter.permissions (key, description) VALUES ('org.create_child', 'Create chapters/regions under this organization');
INSERT INTO charter.permissions (key, description) VALUES ('members.view', 'View member profiles');
INSERT INTO charter.permissions (key, description) VALUES ('members.manage', 'Manage members');
INSERT INTO charter.permissions (key, description) VALUES ('roles.manage', 'Assign roles');
INSERT INTO charter.permissions (key, description) VALUES ('audit.view', 'View the audit log');
INSERT INTO charter.permissions (key, description) VALUES ('members.invite', 'Invite people to the organization');
INSERT INTO charter.permissions (key, description) VALUES ('attributes.manage', 'Define custom member and chapter attributes');
INSERT INTO charter.permissions (key, description) VALUES ('setup.run', 'Run guided setup flows');
INSERT INTO charter.permissions (key, description) VALUES ('tiers.manage', 'Define membership levels and terms');
INSERT INTO charter.permissions (key, description) VALUES ('payments.view', 'See payments');
INSERT INTO charter.permissions (key, description) VALUES ('payments.manage', 'Record and refund payments');
INSERT INTO charter.permissions (key, description) VALUES ('members.export', 'Export member lists');
INSERT INTO charter.permissions (key, description) VALUES ('governance.manage', 'Appoint officers and set seat terms');
INSERT INTO charter.permissions (key, description) VALUES ('governance.define', 'Define board seats');
INSERT INTO charter.roles (id, unit_id, key, name, description, active, created_at) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', NULL, 'org_admin', 'Organization admin', '', true, '2026-11-10 00:51:48.650429+00');
INSERT INTO charter.roles (id, unit_id, key, name, description, active, created_at) VALUES ('5be4af83-a295-47ae-b18a-fd531e8ccc71', NULL, 'member', 'Member', '', true, '2026-11-10 00:51:48.650429+00');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'org.view');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'org.manage');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'org.create_child');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'members.view');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'members.manage');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'roles.manage');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'audit.view');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'members.invite');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'attributes.manage');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'setup.run');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'tiers.manage');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'payments.view');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'payments.manage');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'members.export');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'governance.manage');
INSERT INTO charter.role_permissions (role_id, permission_key) VALUES ('03ec050b-954d-41c2-89dc-e50e4bf67992', 'governance.define');

-- Helpers for the core mapping -------------------------------------------------------

-- The organization (customer) a unit belongs to.
create or replace function charter.unit_org(p_unit uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.org_id from charter.units u where u.id = p_unit;
$$;

-- Fills org_id from the unit (every table with unit_id).
create or replace function charter.set_org_from_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.unit_id is null then
    new.org_id := null;
    return new;
  end if;
  -- An unknown unit is caught by the unit_id foreign key; history rows written for a
  -- unit that's being deleted (audit) just have no org_id.
  select u.org_id into new.org_id from charter.units u where u.id = new.unit_id;
  return new;
end $$;

-- A top unit is its organization (same id); other units inherit their parent's.
-- Creating a top unit directly (self-hosted demo organizations, the server) also
-- creates its core organization if there isn't one yet.
create or replace function charter.units_set_org()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if new.parent_id is null then
    if not exists (select 1 from public.organizations o where o.id = new.id) then
      v_owner := coalesce(new.created_by, auth.uid());
      insert into public.organizations (id, name, created_by)
      values (new.id, left(btrim(new.name), 120), v_owner);
      if v_owner is not null and exists (select 1 from auth.users u where u.id = v_owner) then
        insert into public.memberships (org_id, user_id, role) values (new.id, v_owner, 'owner');
      end if;
    end if;
    new.org_id := new.id;
  else
    select u.org_id into new.org_id from charter.units u where u.id = new.parent_id;
    if new.org_id is null then raise exception 'parent unit not found'; end if;
  end if;
  return new;
end $$;

-- Charter staff get a core membership (spec §4.5): any role other than the built-in
-- Member role. org_admin at the top unit is a core admin; other staff are core
-- members. An existing core role is never lowered, and the owner is never touched;
-- an organization without an owner (created directly) gets this person as owner.
create or replace function charter.staff_core_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role charter.roles;
  v_org uuid;
  v_top boolean;
  v_want public.org_role;
  v_has public.org_role;
begin
  select * into v_role from charter.roles where id = new.role_id;
  if v_role.key = 'member' and v_role.unit_id is null then return new; end if;
  select u.org_id, u.parent_id is null into v_org, v_top from charter.units u where u.id = new.unit_id;
  if v_org is null then return new; end if;
  if not exists (select 1 from public.memberships m where m.org_id = v_org and m.role = 'owner') then
    v_want := 'owner';
  elsif v_role.key = 'org_admin' and v_role.unit_id is null and v_top then
    v_want := 'admin';
  else
    v_want := 'member';
  end if;
  select m.role into v_has from public.memberships m where m.org_id = v_org and m.user_id = new.user_id;
  if v_has is null then
    insert into public.memberships (org_id, user_id, role) values (v_org, new.user_id, v_want);
  elsif v_has = 'viewer' or (v_has = 'member' and v_want = 'admin') then
    update public.memberships set role = v_want where org_id = v_org and user_id = new.user_id;
  end if;
  return new;
end $$;

-- Read-only when the plan lapses (spec §3.4, §6.3). Payment paths that record
-- what members already paid set charter.payment_recording for their transaction.
create or replace function charter.guard_writable()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if tg_op = 'DELETE' then
    v_org := old.org_id;
    -- An organization being deleted takes its rows with it.
    if pg_trigger_depth() > 1 and not exists (select 1 from public.organizations o where o.id = v_org) then
      return old;
    end if;
  else
    v_org := new.org_id;
  end if;
  if v_org is null or public.has_app_access(v_org, 'charter')
     or coalesce(current_setting('charter.payment_recording', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'This organization''s plan doesn''t include OpenCharterApp right now, so it is read-only. Everything can still be viewed and exported.'
    using errcode = '42501';
end $$;

-- Charter permission at a unit, inherited down the tree (D-032), inside the core
-- gate (spec §3.5, §4.5).
create or replace function charter.has_permission(_user uuid, _perm text, _unit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin')
           and exists (select 1 from charter.role_permissions rp join charter.roles r on r.id = rp.role_id
                       where r.key = 'org_admin' and r.unit_id is null and rp.permission_key = _perm)
        then true
      else exists (
        select 1
        from charter.role_assignments ra
        join charter.role_permissions rp on rp.role_id = ra.role_id
        join charter.roles r on r.id = ra.role_id
        where ra.user_id = _user and rp.permission_key = _perm
          and (ra.unit_id = u.id or ra.unit_id = any (u.ancestor_ids))
          and ((r.key = 'member' and r.unit_id is null) or m.role in ('owner', 'admin', 'member')))
    end
    from charter.units u
    left join public.memberships m on m.org_id = u.org_id and m.user_id = _user
    where u.id = _unit
  ), false);
$$;

-- The units where the caller holds a permission (directly or inherited from above),
-- for row level security: `unit_id in (select charter.permitted_units('members.view'))`
-- runs once per query, where has_permission(auth.uid(), …, unit_id) runs per row.
-- Same answer as has_permission for auth.uid().
create or replace function charter.permitted_units(p_perm text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from charter.units u
  where exists (
    select 1
    from charter.role_assignments ra
    join charter.role_permissions rp on rp.role_id = ra.role_id
    join charter.roles r on r.id = ra.role_id
    where ra.user_id = auth.uid() and rp.permission_key = p_perm
      and (ra.unit_id = u.id or ra.unit_id = any (u.ancestor_ids))
      and ((r.key = 'member' and r.unit_id is null)
           or exists (select 1 from public.memberships m
                      where m.org_id = u.org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'member')))
  )
  union
  select u.id from charter.units u
  join public.memberships m on m.org_id = u.org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  where exists (select 1 from charter.role_permissions rp join charter.roles r on r.id = rp.role_id
                where r.key = 'org_admin' and r.unit_id is null and rp.permission_key = p_perm);
$$;

-- A dues member with portal access (spec §4.5), used by the hub's get_org_billing.
create or replace function charter.is_portal_member(p_org uuid, p_unit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from charter.member_profiles p
    where p.user_id = auth.uid() and p.org_id = p_org and p.left_at is null
      and (p_unit is null or p.unit_id = p_unit)
  );
$$;

-- Self-hosted: creates an organization (top unit = core organization) or a unit
-- under one. Hosted: organizations come from the hub (charter.ensure_top_unit).
create or replace function charter.create_organization(_name text, _slug text, _type charter.org_type, _parent uuid default null)
returns uuid language plpgsql security definer set search_path = 'charter' as $$
declare
  _uid uuid := auth.uid();
  _id uuid;
  _email text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if _type = 'platform' then raise exception 'cannot create platform org'; end if;
  if _parent is null and _type not in ('national', 'standalone') then
    raise exception 'chapters and regions need a parent organization';
  end if;
  if _parent is not null then
    if _type in ('national', 'standalone') then raise exception 'this type cannot have a parent'; end if;
    if not charter.has_permission(_uid, 'org.create_child', _parent) then raise exception 'not allowed'; end if;
    insert into charter.units (name, slug, type, parent_id, created_by)
    values (_name, lower(_slug), _type, _parent, _uid) returning id into _id;
    return _id;
  end if;
  _id := public.create_organization(_name);
  insert into charter.units (id, name, slug, type, parent_id, created_by)
  values (_id, _name, lower(_slug), _type, null, _uid);
  select email into _email from auth.users where id = _uid;
  insert into charter.member_profiles (unit_id, user_id, email) values (_id, _uid, coalesce(_email, ''));
  insert into charter.role_assignments (user_id, role_id, unit_id)
  select _uid, id, _id from charter.roles where key = 'org_admin' and unit_id is null;
  return _id;
end $$;

-- An organization created in the hub opens in Charter: its owner or an admin sets
-- up the top unit once (the app calls this on first visit).
create or replace function charter.ensure_top_unit(p_org uuid, p_type charter.org_type default 'standalone', p_slug text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
  v_email text;
begin
  if exists (select 1 from charter.units u where u.id = p_org) then return p_org; end if;
  if not public.has_role(p_org, '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an admin can set up OpenCharterApp for this organization.' using errcode = '42501';
  end if;
  if p_type not in ('national', 'standalone') then raise exception 'choose national or standalone'; end if;
  select * into v_org from public.organizations where id = p_org;
  insert into charter.units (id, name, slug, type, parent_id, created_by)
  values (p_org, v_org.name, lower(coalesce(nullif(btrim(p_slug), ''), v_org.slug, p_org::text)), p_type, null, v_uid);
  select email into v_email from auth.users where id = v_uid;
  insert into charter.member_profiles (unit_id, user_id, email) values (p_org, v_uid, coalesce(v_email, ''));
  insert into charter.role_assignments (user_id, role_id, unit_id)
  select v_uid, r.id, p_org from charter.roles r where r.key = 'org_admin' and r.unit_id is null;
  return p_org;
end $$;

-- Invitations (spec §4.3): after public.accept_invitation, an invitation made in
-- Charter (app = 'charter') carries {"unit_id": …, "role_key": …}. Links an
-- existing roster record with the same email, or adds one, and assigns the role.
create or replace function charter.on_invitation_accepted(p_invitation_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations;
  v_unit uuid;
  v_role uuid;
  v_role_key text;
  v_email text;
  v_record uuid;
begin
  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.id is null or v_inv.accepted_by is distinct from v_uid then
    raise exception 'Invitation not found' using errcode = '42501';
  end if;
  if v_inv.app is distinct from 'charter' then return null; end if;
  v_unit := coalesce(nullif(v_inv.app_payload ->> 'unit_id', '')::uuid, v_inv.org_id);
  if charter.unit_org(v_unit) is distinct from v_inv.org_id then
    raise exception 'That chapter isn''t part of this organization' using errcode = '22023';
  end if;
  v_role_key := coalesce(nullif(v_inv.app_payload ->> 'role_key', ''), 'member');
  v_role := charter.resolve_role(v_unit, v_role_key);
  if v_role is null then raise exception 'unknown role'; end if;
  if v_role_key <> 'member' and v_inv.role is null then
    raise exception 'A staff role needs an organization role on the invitation' using errcode = '22023';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if not exists (select 1 from charter.member_profiles where unit_id = v_unit and user_id = v_uid) then
    select id into v_record from charter.member_profiles
    where unit_id = v_unit and user_id is null and lower(email) = v_email
    order by created_at limit 1 for update;
    if v_record is not null then
      update charter.member_profiles set user_id = v_uid, claimed_at = now() where id = v_record;
    else
      insert into charter.member_profiles (unit_id, user_id, email, source) values (v_unit, v_uid, coalesce(v_email, ''), 'invite');
    end if;
  end if;
  insert into charter.role_assignments (user_id, role_id, unit_id, source)
  values (v_uid, v_role, v_unit, 'invitation') on conflict do nothing;
  return v_unit;
end $$;

-- Inviting from Charter (self-hosted, and chapter admins hosted): Charter's own
-- rules decide who may invite into which unit and role (members.invite; roles.manage
-- and holding every permission of the role for staff roles), and the invitation is a
-- core one (public.invitations, app = 'charter'), accepted with public.accept_invitation
-- and finished by charter.on_invitation_accepted. A dues member gets no core role
-- (portal access only); staff get core member.
create or replace function charter.create_invitation(_org uuid, _email text, _role_key text default 'member')
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role uuid;
  v_token text;
  v_mail text := lower(btrim(coalesce(_email, '')));
begin
  if v_uid is null or not charter.has_permission(v_uid, 'members.invite', _org) then raise exception 'not allowed'; end if;
  if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if _role_key <> 'member' and not charter.has_permission(v_uid, 'roles.manage', _org) then raise exception 'not allowed'; end if;
  v_role := charter.resolve_role(_org, _role_key);
  if v_role is null then raise exception 'unknown role'; end if;
  if not charter.holds_all_role_permissions(v_uid, v_role, _org) then raise exception 'not allowed'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.invitations (org_id, email, role, app, app_payload, token_hash, expires_at, invited_by)
  values (charter.unit_org(_org), v_mail, case when _role_key = 'member' then null else 'member'::public.org_role end,
    'charter', jsonb_build_object('unit_id', _org, 'role_key', _role_key, 'role_id', v_role),
    public._token_hash(v_token), now() + interval '14 days', v_uid);
  return v_token;
end $$;

create or replace function charter.accept_invitation(_token text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select a.id into v_id from public.accept_invitation(_token) a;
  return charter.on_invitation_accepted(v_id);
end $$;

-- Cancels an invitation made in Charter (members.invite at its unit).
create or replace function charter.revoke_invitation(_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = _id;
  if v_inv.id is null or v_inv.app is distinct from 'charter' or auth.uid() is null
     or not charter.has_permission(auth.uid(), 'members.invite', (v_inv.app_payload ->> 'unit_id')::uuid) then
    raise exception 'not allowed';
  end if;
  update public.invitations set revoked_at = now() where id = _id and accepted_at is null and revoked_at is null;
end $$;

-- Functions (from the old schema, ported) --------------------------------------------

CREATE FUNCTION charter.admin_create_member(_org uuid, _display_name text, _email text DEFAULT ''::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $_$
declare _uid uuid := auth.uid(); _id uuid; _mail text := lower(trim(coalesce(_email, '')));
begin
  if _uid is null or not charter.has_permission(_uid, 'members.manage', _org) then raise exception 'not allowed'; end if;
  if char_length(trim(coalesce(_display_name, ''))) not between 1 and 120 then raise exception 'give the member a name'; end if;
  if _mail <> '' and _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if _mail <> '' and exists (select 1 from charter.member_profiles where unit_id = _org and lower(email) = _mail) then
    raise exception 'someone with that email is already a member';
  end if;
  insert into charter.member_profiles (unit_id, user_id, display_name, email, source)
    values (_org, null, trim(_display_name), _mail, 'admin') returning id into _id;
  return _id;
end $_$;

CREATE FUNCTION charter.adopt_suggested_level(_org uuid, _source uuid, _mode text, _rule text DEFAULT 'same'::text, _value integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _s charter.membership_tiers; _o charter.units; _key text; _n int := 1; _id uuid; _st charter.tier_terms;
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'tiers.manage', _org) then raise exception 'not allowed'; end if;
  select * into _o from charter.units where id = _org;
  select * into _s from charter.membership_tiers where id = _source;
  if _s.id is null or not _s.active or not _s.suggested or not (_s.unit_id = any(_o.ancestor_ids)) then
    raise exception 'that level isn''t suggested to you';
  end if;
  if _mode not in ('copy', 'linked') then raise exception 'choose copy or linked'; end if;
  if _mode = 'linked' and (coalesce(_rule, 'same') not in ('same', 'minus_amount', 'minus_percent')
     or coalesce(_value, 0) < 0 or (_rule = 'minus_percent' and _value > 100)) then
    raise exception 'choose the same price, an amount off or a percentage off';
  end if;
  _key := _s.key;
  while exists (select 1 from charter.membership_tiers where unit_id = _org and key = _key) loop
    _n := _n + 1; _key := left(_s.key, 44) || '_' || _n;
  end loop;
  perform set_config('app.level_link', 'on', true);
  insert into charter.membership_tiers (unit_id, key, name, description, tax_treatment, sort_order,
      source_tier_id, link_mode, price_rule, price_value)
    values (_org, _key, _s.name, _s.description, _s.tax_treatment, _s.sort_order, _s.id, _mode,
      case when _mode = 'linked' then coalesce(_rule, 'same') end,
      case when _mode = 'linked' and coalesce(_rule, 'same') <> 'same' then coalesce(_value, 0) end)
    returning id into _id;
  for _st in select * from charter.tier_terms where tier_id = _s.id and active order by sort_order loop
    insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, currency,
        sort_order, source_term_id)
      values (_id, _org, _st.key, _st.label, _st.length_count, _st.length_unit,
        case when _mode = 'linked' then charter.linked_price(_org, _st.price_minor, _rule, _value)
          else charter.linked_price(_org, _st.price_minor, 'same', 0) end,
        _st.currency, _st.sort_order, _st.id);
  end loop;
  perform set_config('app.level_link', _prev, true);
  return _id;
end $$;

CREATE FUNCTION charter.affiliation_history_append_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
begin
  -- a cascade from deleting an organization or a membership (delete, or set null)
  if pg_trigger_depth() > 1 then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception 'chapter history can''t be changed';
end $$;

CREATE FUNCTION charter.ancestor_setting(_org uuid, _key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  with anc as (
    select a.id, array_position(o.ancestor_ids, a.id) as depth
    from charter.units o join charter.units a on a.id = any(o.ancestor_ids)
    where o.id = _org
  )
  select coalesce(
    (select s.value from anc join charter.org_settings s on s.unit_id = anc.id
       where s.key = _key and s.mode = 'locked' order by anc.depth asc limit 1),
    (select s.value from anc join charter.org_settings s on s.unit_id = anc.id
       where s.key = _key and s.mode <> 'inherit' order by anc.depth desc limit 1))
$$;

CREATE FUNCTION charter.apply_setup(_org uuid, _flow text, _answers jsonb, _plan jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _a jsonb; _o jsonb; _def uuid; _i int; _j int; _s jsonb; _t jsonb; _tier uuid;
  _term uuid; _rule uuid;
  _seat charter.seat_templates; _owner uuid; _count int; _unit charter.term_unit; _from date; _ref text; _f record;
begin
  if _uid is null or not charter.has_permission(_uid, 'setup.run', _org) then raise exception 'not allowed'; end if;

  if _plan ? 'tax' and jsonb_typeof(_plan->'tax') = 'object' then
    if not charter.has_permission(_uid, 'org.manage', _org) then raise exception 'not allowed'; end if;
    insert into charter.tax_profiles (unit_id, legal_name, ein, tax_status)
      values (_org, coalesce(_plan->'tax'->>'legal_name',''), coalesce(_plan->'tax'->>'ein',''), coalesce(_plan->'tax'->>'tax_status',''))
      on conflict (unit_id) do update set legal_name = excluded.legal_name, ein = excluded.ein,
        tax_status = excluded.tax_status, updated_at = now();
  end if;

  if jsonb_typeof(_plan->'attributes') = 'array' then
    if not charter.has_permission(_uid, 'attributes.manage', _org) then raise exception 'not allowed'; end if;
    _i := 0;
    for _a in select * from jsonb_array_elements(_plan->'attributes') loop
      _i := _i + 1;
      insert into charter.attribute_definitions (unit_id, applies_to, key, label, data_type, required, visibility,
          member_editable, show_in_directory, sort_order, locked)
        values (_org, coalesce(_a->>'applies_to','member')::charter.attribute_subject, _a->>'key', _a->>'label',
          (_a->>'data_type')::charter.attribute_type, coalesce((_a->>'required')::boolean, false),
          coalesce(_a->>'visibility','admins')::charter.attribute_visibility, coalesce((_a->>'member_editable')::boolean, false),
          coalesce((_a->>'show_in_directory')::boolean, false), _i * 10, coalesce((_a->>'locked')::boolean, false))
        on conflict (unit_id, applies_to, key) do update set label = excluded.label, required = excluded.required,
          visibility = excluded.visibility, member_editable = excluded.member_editable,
          show_in_directory = excluded.show_in_directory, locked = excluded.locked, active = true
        returning id into _def;
      if jsonb_typeof(_a->'options') = 'array' then
        _j := 0;
        for _o in select * from jsonb_array_elements(_a->'options') loop
          _j := _j + 1;
          insert into charter.attribute_options (definition_id, unit_id, value, label, sort_order)
            values (_def, _org, _o->>'value', coalesce(_o->>'label', _o->>'value'), _j * 10)
            on conflict (definition_id, value) do update set label = excluded.label, sort_order = excluded.sort_order, active = true;
        end loop;
      end if;
    end loop;
  end if;

  -- Membership levels: upsert by key, terms by (level, key). Terms left out are not deleted.
  if jsonb_typeof(_plan->'tiers') = 'array' then
    if not charter.has_permission(_uid, 'tiers.manage', _org) then raise exception 'not allowed'; end if;
    _i := 0;
    for _a in select * from jsonb_array_elements(_plan->'tiers') loop
      _i := _i + 1;
      insert into charter.membership_tiers (unit_id, key, name, description, tax_treatment, sort_order)
        values (_org, _a->>'key', _a->>'name', coalesce(_a->>'description', ''),
          coalesce(_a->>'tax_treatment', 'non_deductible')::charter.tax_treatment, _i * 10)
        on conflict (unit_id, key) do update set name = excluded.name, description = excluded.description,
          tax_treatment = excluded.tax_treatment, sort_order = excluded.sort_order, active = true
        returning id into _tier;
      _j := 0;
      for _t in select * from jsonb_array_elements(coalesce(_a->'terms', '[]')) loop
        _j := _j + 1;
        insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, currency, sort_order)
          values (_tier, _org, _t->>'key', _t->>'label', (_t->>'length_count')::int,
            (_t->>'length_unit')::charter.term_unit, (_t->>'price_minor')::int,
            coalesce(_t->>'currency', 'USD'), _j * 10)
          on conflict (tier_id, key) do update set label = excluded.label, length_count = excluded.length_count,
            length_unit = excluded.length_unit, price_minor = excluded.price_minor, currency = excluded.currency,
            sort_order = excluded.sort_order, active = true;
      end loop;
    end loop;
  end if;

  -- Pricing rules (A6, D-177): per term, by the level's and term's keys; a rule with the same
  -- label on the same term is updated in place, so applying again adds nothing. The checks are
  -- save_pricing_rule's (permission, conditions, the national's price range).
  if jsonb_typeof(_plan->'pricing_rules') = 'array' then
    for _a in select * from jsonb_array_elements(_plan->'pricing_rules') loop
      select tt.id into _term from charter.tier_terms tt join charter.membership_tiers mt on mt.id = tt.tier_id
        where mt.unit_id = _org and mt.key = _a->>'tier_key' and tt.key = _a->>'term_key';
      if _term is null then raise exception 'pricing rule for an unknown level or term'; end if;
      select id into _rule from charter.pricing_rules
        where term_id = _term and active and label = coalesce(trim(_a->>'label'), '')
        order by created_at limit 1;
      perform charter.save_pricing_rule(_term, _rule, _a->>'label', coalesce(_a->'conditions', '[]'::jsonb),
        (_a->>'price_minor')::int, (_a->>'discount_pct')::int, coalesce((_a->>'sort_order')::int, 0));
    end loop;
  end if;

  -- Board seats (E-17, D-143): upsert by key. Linked roles are never set here (no access is
  -- granted by setup); key and scope can't change; seats left out are not retired.
  if jsonb_typeof(_plan->'seats') = 'array' then
    if not charter.has_permission(_uid, 'governance.define', _org) then raise exception 'not allowed'; end if;
    if jsonb_array_length(_plan->'seats') > 0
       and exists (select 1 from charter.units where id = _org and parent_id is not null)
       and charter.ancestor_setting(_org, 'governance.chapter_extra_seats_allowed') = 'false'::jsonb then
      raise exception 'your parent organization manages board seats';
    end if;
    for _a in select * from jsonb_array_elements(_plan->'seats') loop
      _count := (_a->>'term_count')::int;
      _unit := (_a->>'term_unit')::charter.term_unit;
      perform charter.seat_template_check(_org, _count, _unit, null,
        coalesce(_a->>'scope', 'self')::charter.seat_scope);
      select * into _seat from charter.seat_templates where unit_id = _org and key = _a->>'key';
      -- "Used by" can change (D-157), with the same rule as set_seat_scope (0024): refused while
      -- someone holds the seat at an org the new scope leaves out.
      if _seat.id is not null and _seat.scope::text <> coalesce(_a->>'scope', 'self') then
        _seat.scope := coalesce(_a->>'scope', 'self')::charter.seat_scope;
        if exists (select 1 from charter.appointments ap where ap.template_id = _seat.id and ap.ended_on is null
                   and not charter.seat_applies_at(_seat, ap.unit_id)) then
          raise exception 'end the current terms where this seat would no longer be used';
        end if;
      end if;
      if _seat.id is not null and exists (select 1 from charter.appointments where template_id = _seat.id
          and ended_on is null and seat_number > (_a->>'seat_count')::int) then
        raise exception 'end the appointments in the seats you''re removing first';
      end if;
      insert into charter.seat_templates (unit_id, key, title, description, required, seat_count,
          default_term_count, default_term_unit, scope, sort_order)
        values (_org, _a->>'key', trim(_a->>'title'), coalesce(trim(_a->>'description'), ''),
          coalesce((_a->>'required')::boolean, false), coalesce((_a->>'seat_count')::int, 1), _count, _unit,
          coalesce(_a->>'scope', 'self')::charter.seat_scope, coalesce((_a->>'sort_order')::int, 0))
        on conflict (unit_id, key) do update set title = excluded.title, description = excluded.description,
          required = excluded.required, seat_count = excluded.seat_count,
          default_term_count = excluded.default_term_count, default_term_unit = excluded.default_term_unit,
          scope = excluded.scope, sort_order = excluded.sort_order, active = true;
    end loop;
  end if;

  -- This org's own seat terms (D-142): a rule is added only when it differs from the rule
  -- already in force on its date, so applying setup again adds nothing.
  if jsonb_typeof(_plan->'seat_terms') = 'array' then
    if not charter.has_permission(_uid, 'governance.manage', _org) then raise exception 'not allowed'; end if;
    for _a in select * from jsonb_array_elements(_plan->'seat_terms') loop
      _owner := (_a->>'owner_org_id')::uuid;
      select * into _seat from charter.seat_templates where unit_id = _owner and key = _a->>'key';
      if _seat.id is null or not _seat.active or not charter.seat_applies_at(_seat, _org) then
        raise exception 'that seat isn''t used here';
      end if;
      _count := (_a->>'length_count')::int;
      _unit := (_a->>'length_unit')::charter.term_unit;
      _from := (_a->>'effective_from')::date;
      _ref := coalesce(trim(_a->>'bylaw_reference'), '');
      if _from is null then raise exception 'give the date the term takes effect'; end if;
      if (_count is null) <> (_unit is null) or (_count is not null and _count not between 1 and 100) then
        raise exception 'give the term as a number and a unit, or leave it open';
      end if;
      select * into _f from charter.seat_term_in_force(_org, _seat.id, _from);
      if _f.source = 'org' and _f.length_count is not distinct from _count and _f.length_unit is not distinct from _unit
         and (select bylaw_reference from charter.seat_terms where id = _f.term_id) = _ref then
        continue;
      end if;
      insert into charter.seat_terms (unit_id, template_id, length_count, length_unit, effective_from, bylaw_reference, set_by)
        values (_org, _seat.id, _count, _unit, _from, _ref, _uid);
    end loop;
  end if;

  if jsonb_typeof(_plan->'settings') = 'array' then
    if not charter.has_permission(_uid, 'org.manage', _org) then raise exception 'not allowed'; end if;
    for _s in select * from jsonb_array_elements(_plan->'settings') loop
      insert into charter.org_settings (unit_id, key, value, mode)
        values (_org, _s->>'key', _s->'value', coalesce(_s->>'mode','override')::charter.setting_mode)
        on conflict (unit_id, key) do update set value = excluded.value, mode = excluded.mode;
    end loop;
  end if;

  insert into charter.setup_states (unit_id, flow_id, answers, status, applied_at, updated_by)
    values (_org, _flow, coalesce(_answers,'{}'), 'applied', now(), _uid)
    on conflict (unit_id, flow_id) do update set answers = excluded.answers, status = 'applied',
      applied_at = now(), updated_by = _uid, updated_at = now();
end $$;

CREATE FUNCTION charter.apply_setup_sections() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'charter'
    AS $$
  select array['tax', 'attributes', 'tiers', 'pricing_rules', 'seats', 'seat_terms', 'settings']
$$;

CREATE FUNCTION charter.appoint_officer(_org uuid, _template uuid, _profile uuid, _starts_on date DEFAULT CURRENT_DATE, _seat_number integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _t charter.seat_templates; _p charter.member_profiles;
  _seat int; _ra uuid; _id uuid; _m charter.memberships; _role charter.roles;
begin
  if _uid is null or not charter.has_permission(_uid, 'governance.manage', _org) then raise exception 'not allowed'; end if;
  select * into _t from charter.seat_templates where id = _template;
  if _t.id is null or not _t.active or not charter.seat_applies_at(_t, _org) then raise exception 'that seat isn''t used here'; end if;
  select * into _p from charter.member_profiles where id = _profile and unit_id = _org;
  -- home-chapter model (0030): someone who moved to another chapter isn't a member here any more
  if _p.id is null or _p.left_at is not null then raise exception 'person is not a member of this organization'; end if;
  if coalesce((charter.effective_setting(_org, 'governance.officers_good_standing') #>> '{}')::boolean, true) then
    -- the member's own membership here, or (home-chapter model, 0030) their national membership
    select * into _m from charter.memberships where id = charter.profile_membership_id(_p);
    if _m.id is null or charter.membership_standing(_m.status, _m.paid_through, _m.lifetime,
         charter.grace_days(_m.unit_id), coalesce(_starts_on, current_date)) <> 'good' then
      raise exception 'officers must be members in good standing';
    end if;
  end if;
  if exists (select 1 from charter.appointments where unit_id = _org and template_id = _template
             and profile_id = _profile and ended_on is null) then
    raise exception 'this person already holds that seat';
  end if;
  -- a free seat: the one asked for, else the lowest free number
  perform 1 from charter.seat_templates where id = _template for update;
  select n into _seat from generate_series(1, _t.seat_count) n
    where (_seat_number is null or n = _seat_number)
      and not exists (select 1 from charter.appointments a where a.unit_id = _org and a.template_id = _template
                      and a.seat_number = n and a.ended_on is null)
    order by n limit 1;
  if _seat is null then raise exception 'all seats are filled'; end if;
  -- the linked role (no escalation; only people with a login can hold a role)
  if _t.role_id is not null and _p.user_id is not null then
    select * into _role from charter.roles where id = _t.role_id;
    if not _role.active then raise exception 'the seat''s role is retired'; end if;
    if not charter.holds_all_role_permissions(_uid, _t.role_id, _org) then
      raise exception 'you can only grant permissions you hold';
    end if;
    insert into charter.role_assignments (user_id, role_id, unit_id, source) values (_p.user_id, _t.role_id, _org, 'seat')
      on conflict (user_id, role_id, unit_id) do nothing returning id into _ra;
  end if;
  insert into charter.appointments (unit_id, template_id, profile_id, seat_number, starts_on, planned_end,
      role_assignment_id, appointed_by)
    values (_org, _template, _profile, _seat, coalesce(_starts_on, current_date),
      charter.seat_planned_end(_org, _template, coalesce(_starts_on, current_date), coalesce(_starts_on, current_date)),
      _ra, _uid)
    returning id into _id;
  return _id;
end $$;

CREATE FUNCTION charter.appointments_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'appointments can''t be deleted; end them instead';
  end if;
  if new.unit_id is distinct from old.unit_id or new.template_id is distinct from old.template_id
     or new.profile_id is distinct from old.profile_id or new.seat_number is distinct from old.seat_number
     or new.starts_on is distinct from old.starts_on or new.appointed_by is distinct from old.appointed_by
     or new.created_at is distinct from old.created_at then
    raise exception 'appointments can''t be changed; end it and appoint again';
  end if;
  if old.ended_on is not null and (new.ended_on is distinct from old.ended_on
     or new.end_reason is distinct from old.end_reason or new.planned_end is distinct from old.planned_end) then
    raise exception 'an ended appointment can''t be changed';
  end if;
  return new;
end $$;

CREATE FUNCTION charter.approve_membership(_membership uuid, _note text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _m charter.memberships; _t charter.tier_terms; _end date;
begin
  select * into _m from charter.memberships where id = _membership for update;
  if _m.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'members.manage', _m.unit_id) then
    raise exception 'not allowed'; end if;
  if _m.status <> 'pending' then raise exception 'only pending applications can be approved'; end if;
  if charter.national_dues_required(_m.unit_id) and charter.national_membership_state(
       (select user_id from charter.member_profiles where id = _m.profile_id), _m.unit_id) <> 'current' then
    raise exception 'their national membership isn''t active yet';
  end if;
  select * into _t from charter.tier_terms where id = _m.term_id;
  _end := charter.term_end(current_date, _t.length_count, _t.length_unit);
  update charter.memberships set status = 'active', joined_on = current_date, paid_through = _end,
    lifetime = _t.length_unit is null, updated_at = now() where id = _membership;
  insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id, period_start, period_end, note, actor_id)
    values (_m.unit_id, _m.id, 'approved', _m.tier_id, _m.term_id, current_date, _end, coalesce(_note, ''), auth.uid());
end $$;

CREATE FUNCTION charter.assign_role(_org uuid, _user uuid, _role_key text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _role uuid; _id uuid;
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'roles.manage', _org) then raise exception 'not allowed'; end if;
  if not charter.is_org_member(_user, _org) then raise exception 'person is not a member of this organization'; end if;
  _role := charter.resolve_role(_org, _role_key);
  if _role is null then raise exception 'unknown role'; end if;
  if not charter.holds_all_role_permissions(auth.uid(), _role, _org) then
    raise exception 'you can only grant permissions you hold';
  end if;
  insert into charter.role_assignments (user_id, role_id, unit_id, source) values (_user, _role, _org, 'manual')
    on conflict (user_id, role_id, unit_id) do nothing returning id into _id;
  if _id is null then
    select id into _id from charter.role_assignments where user_id = _user and role_id = _role and unit_id = _org;
  end if;
  return _id;
end $$;

CREATE FUNCTION charter.attribute_definition_subject_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if tg_op = 'INSERT' and new.applies_to = 'chapter' and not exists (select 1 from charter.units
      where id = new.unit_id and type in ('national', 'region')) then
    raise exception 'only national or regional organizations define chapter fields';
  end if;
  if new.applies_to = 'chapter' then
    new.member_editable := false;
    new.show_in_directory := false;
  else
    new.locked := false;
  end if;
  return new;
end $$;

CREATE FUNCTION charter.attribute_option_org_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.attribute_type;
begin
  select unit_id, data_type into new.unit_id, _t from charter.attribute_definitions where id = new.definition_id;
  if _t not in ('choice','multi_choice','ordered') then raise exception 'this attribute type has no options'; end if;
  return new;
end $$;

CREATE FUNCTION charter.audit_log(_org uuid, _before bigint DEFAULT NULL::bigint, _limit integer DEFAULT 200) RETURNS TABLE(id bigint, created_at timestamp with time zone, tx_id bigint, actor_id uuid, actor_name text, action text, target_type text, target_id text, before jsonb, after jsonb, refs jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    SET jit TO 'off'
    AS $$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'audit.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    select e.id, e.created_at, e.tx_id, e.actor_id,
      -- who: their name here, else their name anywhere, else their sign-in email
      case when e.actor_id is null then null else coalesce(
        (select nullif(trim(p.display_name), '') from charter.member_profiles p
          where p.user_id = e.actor_id and p.unit_id = _org limit 1),
        (select nullif(trim(p.display_name), '') from charter.member_profiles p
          where p.user_id = e.actor_id and nullif(trim(p.display_name), '') is not null order by p.created_at limit 1),
        (select u.email::text from auth.users u where u.id = e.actor_id),
        'Someone') end,
      e.action, e.target_type, e.target_id,
      e.before - 'token_hash', e.after - 'token_hash',
      -- names for the records an event points at (null when they no longer exist)
      jsonb_strip_nulls(jsonb_build_object(
        'template_id', (select t.title from charter.seat_templates t
          where t.id::text = coalesce(e.after, e.before)->>'template_id'),
        'profile_id', (select coalesce(nullif(trim(p.display_name), ''), p.email) from charter.member_profiles p
          where p.id::text = coalesce(e.after, e.before)->>'profile_id'),
        'role_id', (select r.name from charter.roles r where r.id::text = coalesce(e.after, e.before)->>'role_id'),
        'tier_id', (select t.name from charter.membership_tiers t where t.id::text = coalesce(e.after, e.before)->>'tier_id'),
        'term_id', (select t.label from charter.tier_terms t where t.id::text = coalesce(e.after, e.before)->>'term_id'),
        'definition_id', (select d.label from charter.attribute_definitions d
          where d.id::text = coalesce(e.after, e.before)->>'definition_id'),
        'membership_id', (select coalesce(nullif(trim(p.display_name), ''), p.email) from charter.memberships m
          join charter.member_profiles p on p.id = m.profile_id
          where m.id::text = coalesce(e.after, e.before)->>'membership_id'),
        'user_id', (select coalesce((select nullif(trim(p.display_name), '') from charter.member_profiles p
            where p.user_id = u.id and nullif(trim(p.display_name), '') is not null order by p.created_at limit 1), u.email::text)
          from auth.users u where u.id::text = coalesce(e.after, e.before)->>'user_id'),
        'entity_id', (select coalesce(nullif(trim(p.display_name), ''), p.email) from charter.member_profiles p
          where p.id::text = coalesce(e.after, e.before)->>'entity_id'),
        'from_org_id', (select o.name from charter.units o where o.id::text = coalesce(e.after, e.before)->>'from_org_id'),
        'to_org_id', (select o.name from charter.units o where o.id::text = coalesce(e.after, e.before)->>'to_org_id'),
        'home_org_id', (select o.name from charter.units o where o.id::text = coalesce(e.after, e.before)->>'home_org_id'),
        'source_tier_id', (select t.name from charter.membership_tiers t
          where t.id::text = coalesce(e.after, e.before)->>'source_tier_id')
      ))
    from charter.audit_events e
    where e.unit_id = _org
      and (_before is null or e.id < _before)
      -- setup drafts are noise; applying a setup is kept
      and not (e.target_type = 'setup_states' and not (
        coalesce(e.after->>'status', '') = 'applied'
        and (e.before is null or e.before->>'applied_at' is distinct from e.after->>'applied_at')))
    order by e.id desc
    limit greatest(1, least(coalesce(_limit, 200), 500));
end $$;

CREATE FUNCTION charter.audit_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _row jsonb; _org uuid; _id text;
begin
  _row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name = 'organizations' then _org := (_row->>'id')::uuid;
  else _org := (_row->>'unit_id')::uuid; end if;
  _id := coalesce(_row->>'id', _row->>'key', _row->>'unit_id');
  perform charter.write_audit(_org, lower(tg_op), tg_table_name, _id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

CREATE FUNCTION charter.begin_join(_org uuid, _term uuid, _answers jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _t charter.tier_terms; _tier charter.membership_tiers; _conn charter.gateway_connections;
  _p charter.member_profiles; _m charter.memberships; _id uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _t from charter.tier_terms where id = _term;
  select * into _tier from charter.membership_tiers where id = _t.tier_id;
  if _t.id is null or _tier.unit_id <> _org or not (_t.active and _tier.active) then
    raise exception 'that membership level isn''t offered here'; end if;
  select * into _conn from charter.gateway_connections where unit_id = _org and status = 'verified';
  if _conn.id is null then raise exception 'online payments aren''t open yet'; end if;
  select * into _p from charter.member_profiles where unit_id = _org and user_id = _uid;
  if _p.id is not null then
    select * into _m from charter.memberships where unit_id = _org and profile_id = _p.id;
    if _m.status = 'pending' then raise exception 'your application is already waiting for approval'; end if;
    if _m.status = 'active' then raise exception 'you''re already a member; renew instead'; end if;
  end if;
  if charter.national_dues_required(_org) and charter.national_membership_state(_uid, _org) = 'none' then
    raise exception 'national membership required: join % first',
      (select name from charter.units where id = charter.national_org(_org));
  end if;
  perform charter.validate_join_answers(_org, _answers);
  insert into charter.payments (unit_id, profile_id, payer_user_id, purpose, amount_minor, currency, status, gateway,
      livemode, term_id, join_answers, created_by)
    -- the price for this member: the first matching pricing rule, else the term's price (D-147)
    values (_org, _p.id, _uid, 'join',
      charter.term_price(_t.id, charter.profile_values(_p.id) || coalesce(_answers, '{}'::jsonb)),
      _t.currency, 'pending', _conn.gateway, _conn.livemode,
      _t.id, coalesce(_answers, '{}'::jsonb), _uid)
    returning id into _id;
  return _id;
end $$;

CREATE FUNCTION charter.begin_renewal(_membership uuid, _term uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _m charter.memberships; _p charter.member_profiles; _t charter.tier_terms;
  _tier charter.membership_tiers; _conn charter.gateway_connections; _id uuid;
begin
  select * into _m from charter.memberships where id = _membership;
  select * into _p from charter.member_profiles where id = _m.profile_id;
  if _uid is null or _p.user_id is distinct from _uid then raise exception 'not allowed'; end if;
  if _m.status <> 'active' then raise exception 'only active memberships can be renewed'; end if;
  if _m.lifetime then raise exception 'already a lifetime member'; end if;
  select * into _t from charter.tier_terms where id = _term;
  select * into _tier from charter.membership_tiers where id = _t.tier_id;
  if _t.id is null or _tier.unit_id <> _m.unit_id or not (_t.active and _tier.active) then
    raise exception 'that membership level isn''t offered here'; end if;
  select * into _conn from charter.gateway_connections where unit_id = _m.unit_id and status = 'verified';
  if _conn.id is null then raise exception 'online payments aren''t open yet'; end if;
  insert into charter.payments (unit_id, membership_id, profile_id, payer_user_id, purpose, amount_minor, currency,
      status, gateway, livemode, term_id, created_by)
    values (_m.unit_id, _m.id, _p.id, _uid, 'renew', charter.term_price(_t.id, charter.profile_values(_p.id)),
      _t.currency, 'pending', _conn.gateway,
      _conn.livemode, _t.id, _uid)
    returning id into _id;
  return _id;
end $$;

CREATE FUNCTION charter.board_history(_org uuid) RETURNS TABLE(appointment_id uuid, template_id uuid, display_name text, seat_number integer, starts_on date, planned_end date, ended_on date, end_reason text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if auth.uid() is null or not (charter.is_org_member(auth.uid(), _org) or charter.can_see_org_tree(auth.uid(), _org)) then
    raise exception 'not allowed';
  end if;
  return query
    select a.id, a.template_id, p.display_name, a.seat_number, a.starts_on, a.planned_end, a.ended_on, a.end_reason
    from charter.appointments a join charter.member_profiles p on p.id = a.profile_id
    where a.unit_id = _org and a.ended_on is not null
    order by a.ended_on desc, a.starts_on desc;
end $$;

CREATE FUNCTION charter.can_read_attribute_value(_user uuid, _value_org uuid, _def uuid, _entity uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select charter.has_permission(_user, 'members.view', _value_org)
    or exists (select 1 from charter.member_profiles p where p.id = _entity and p.user_id = _user)
    or exists (select 1 from charter.attribute_definitions d where d.id = _def and d.visibility in ('members','public')
               and charter.is_org_member(_user, _value_org))
$$;

CREATE FUNCTION charter.can_see_org_tree(_user uuid, _org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select charter.has_permission(_user, 'org.view', _org) or exists (
    select 1 from charter.member_profiles p join charter.units o on o.id = p.unit_id
    where p.user_id = _user and (o.id = _org or _org = any(o.ancestor_ids)))
$$;

CREATE FUNCTION charter.cancel_membership(_membership uuid, _note text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _m charter.memberships;
begin
  select * into _m from charter.memberships where id = _membership for update;
  if _m.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'members.manage', _m.unit_id) then
    raise exception 'not allowed'; end if;
  if _m.status <> 'active' then raise exception 'only active memberships can be cancelled'; end if;
  update charter.memberships set status = 'cancelled', updated_at = now() where id = _membership;
  insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id, note, actor_id)
    values (_m.unit_id, _m.id, 'cancelled', _m.tier_id, _m.term_id, coalesce(_note, ''), auth.uid());
end $$;

CREATE FUNCTION charter.chapter_dues_range_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _min int; _max int;
begin
  if not new.active or not exists (select 1 from charter.units where id = new.unit_id and parent_id is not null) then
    return new;
  end if;
  -- 0 or unset = no limit
  _min := nullif((charter.ancestor_setting(new.unit_id, 'membership.chapter_dues_min_minor') #>> '{}')::int, 0);
  _max := nullif((charter.ancestor_setting(new.unit_id, 'membership.chapter_dues_max_minor') #>> '{}')::int, 0);
  if (_min is not null and new.price_minor < _min) or (_max is not null and new.price_minor > _max) then
    raise exception 'chapter dues must be between % and % (set by your national)',
      coalesce(to_char(_min / 100.0, 'FM999999990.00'), '0.00'), coalesce(to_char(_max / 100.0, 'FM999999990.00'), 'any amount');
  end if;
  return new;
end $$;

CREATE FUNCTION charter.chapter_national_standing(_chapter uuid) RETURNS TABLE(profile_id uuid, national_standing text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _n uuid;
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'members.view', _chapter) then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from charter.units where id = _chapter and parent_id is not null) then return; end if;
  _n := charter.national_org(_chapter);
  return query
    select p.id,
      coalesce((select charter.membership_standing(m.status, m.paid_through, m.lifetime, charter.grace_days(_n), current_date)
        from charter.member_profiles np join charter.memberships m on m.profile_id = np.id and m.unit_id = _n
        where np.unit_id = _n and np.user_id = p.user_id limit 1), 'none')
    from charter.member_profiles p
    where p.unit_id = _chapter and p.user_id is not null and p.left_at is null;
end $$;

CREATE FUNCTION charter.check_role_permissions(_uid uuid, _org uuid, _perms text[]) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _p text;
begin
  foreach _p in array coalesce(_perms, '{}') loop
    if not exists (select 1 from charter.permissions where key = _p) then raise exception 'unknown permission %', _p; end if;
    if not charter.has_permission(_uid, _p, _org) then raise exception 'you can only grant permissions you hold'; end if;
  end loop;
end $$;

CREATE FUNCTION charter.claim_webhook_event(_org uuid, _gateway charter.payment_gateway, _event_id text, _type text, _payment uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _id bigint;
begin
  perform set_config('charter.payment_recording', 'on', true);
  insert into charter.webhook_events (unit_id, gateway, event_id, type, payment_id)
    values (_org, _gateway, _event_id, _type, _payment)
    on conflict (gateway, event_id) do nothing returning id into _id;
  return _id is not null;
end $$;

CREATE FUNCTION charter.complete_gateway_payment(_event_id text, _payment uuid, _gateway_ref text, _amount_minor integer, _currency text, _livemode boolean) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select charter.payment_succeeded(_event_id, _payment, _gateway_ref, _amount_minor, _currency, _livemode)
$$;

CREATE FUNCTION charter.complete_test_payment(_payment uuid, _outcome text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _pay charter.payments; _event text := 'test_evt_' || gen_random_uuid();
begin
  perform set_config('charter.payment_recording', 'on', true);
  perform set_config('charter.payment_recording', 'on', true);
  select * into _pay from charter.payments where id = _payment;
  if _pay.id is null or auth.uid() is null or _pay.payer_user_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if _pay.gateway <> 'test' then raise exception 'not a test payment'; end if;
  if _pay.status = 'failed' then update charter.payments set status = 'pending' where id = _payment; end if;
  return case _outcome
    when 'accepted' then charter.payment_succeeded(_event, _payment, 'test_pay_' || _payment, _pay.amount_minor, _pay.currency, false)
    when 'declined' then charter.payment_failed(_event, _payment, 'Your card was declined.')
    when 'insufficient_funds' then charter.payment_failed(_event, _payment, 'Your card has insufficient funds.')
    else 'unknown outcome' end;
end $$;

CREATE FUNCTION charter.connect_test_gateway(_org uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'payments.manage', _org) then raise exception 'not allowed'; end if;
  insert into charter.gateway_connections (unit_id, gateway, status, account_label, livemode, connected_by)
    values (_org, 'test', 'verified', 'Test payments', false, auth.uid())
    on conflict (unit_id) do update set gateway = 'test', status = 'verified', account_label = 'Test payments',
      livemode = false, connected_by = auth.uid(), connected_at = now();
  delete from charter.gateway_secrets where unit_id = _org;
end $$;

CREATE FUNCTION charter.create_demo_organization(_name text, _slug text, _type charter.org_type) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _id uuid;
begin
  if not charter.is_platform_operator() then raise exception 'only platform operators can create demo organizations'; end if;
  if _type not in ('national', 'standalone') then raise exception 'a demo organization starts at the top: national or standalone'; end if;
  _id := charter.create_organization(_name, _slug, _type, null);
  -- the guard allows this one change: the org just created here becoming demo
  perform set_config('app.creating_demo_org', _id::text, true);
  update charter.units set is_demo = true where id = _id;
  perform set_config('app.creating_demo_org', '', true);
  return _id;
end $$;

CREATE FUNCTION charter.create_role(_org uuid, _key text, _name text, _description text, _perms text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _root uuid; _id uuid;
begin
  if _uid is null or not charter.has_permission(_uid, 'roles.manage', _org) then raise exception 'not allowed'; end if;
  if _key in ('org_admin', 'member') then raise exception 'that role name is reserved'; end if;
  select coalesce(ancestor_ids[1], id) into _root from charter.units where id = _org;
  -- Keys are unique across the whole tree, so assigning by key is never ambiguous.
  if exists (select 1 from charter.roles r join charter.units o on o.id = r.unit_id
             where r.key = _key and (o.id = _root or _root = any(o.ancestor_ids))) then
    raise exception 'a role with that name already exists';
  end if;
  perform charter.check_role_permissions(_uid, _org, _perms);
  insert into charter.roles (unit_id, key, name, description)
    values (_org, _key, trim(_name), coalesce(trim(_description), '')) returning id into _id;
  insert into charter.role_permissions (role_id, permission_key)
    select _id, p from unnest(coalesce(_perms, '{}')) p on conflict do nothing;
  perform charter.write_audit(_org, 'insert', 'role_permissions', _id::text, null, to_jsonb(coalesce(_perms, '{}')));
  return _id;
end $$;

CREATE FUNCTION charter.decline_application(_membership uuid, _note text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _pay charter.payments;
begin
  perform charter.decline_membership(_membership, _note);
  select * into _pay from charter.payments where membership_id = _membership and status = 'paid'
    order by created_at desc limit 1;
  if _pay.id is null then return jsonb_build_object('refund', null); end if;
  if _pay.gateway = 'test' then
    perform charter.payment_refunded('test_refund_' || gen_random_uuid(), 'test', _pay.gateway_ref, _pay.amount_minor);
    return jsonb_build_object('refund', 'done');
  end if;
  if _pay.gateway = 'stripe' then
    return jsonb_build_object('refund', 'stripe', 'gateway_ref', _pay.gateway_ref, 'amount_minor', _pay.amount_minor,
      'currency', _pay.currency, 'unit_id', _pay.unit_id);
  end if;
  return jsonb_build_object('refund', null);
end $$;

CREATE FUNCTION charter.decline_membership(_membership uuid, _note text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _m charter.memberships;
begin
  select * into _m from charter.memberships where id = _membership for update;
  if _m.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'members.manage', _m.unit_id) then
    raise exception 'not allowed'; end if;
  if _m.status <> 'pending' then raise exception 'only pending applications can be declined'; end if;
  update charter.memberships set status = 'declined', updated_at = now() where id = _membership;
  insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id, note, actor_id)
    values (_m.unit_id, _m.id, 'declined', _m.tier_id, _m.term_id, coalesce(_note, ''), auth.uid());
end $$;

CREATE FUNCTION charter.define_seat(_org uuid, _key text, _title text, _description text DEFAULT ''::text, _required boolean DEFAULT false, _seat_count integer DEFAULT 1, _term_count integer DEFAULT NULL::integer, _term_unit charter.term_unit DEFAULT NULL::charter.term_unit, _role uuid DEFAULT NULL::uuid, _scope charter.seat_scope DEFAULT 'self'::charter.seat_scope, _sort_order integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _id uuid; _parent uuid;
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.define', _org) then raise exception 'not allowed'; end if;
  select parent_id into _parent from charter.units where id = _org;
  if _parent is not null and charter.ancestor_setting(_org, 'governance.chapter_extra_seats_allowed') = 'false'::jsonb then
    raise exception 'your parent organization manages board seats';
  end if;
  perform charter.seat_template_check(_org, _term_count, _term_unit, _role, _scope);
  if exists (select 1 from charter.seat_templates where unit_id = _org and key = _key) then
    raise exception 'a seat with that name already exists';
  end if;
  insert into charter.seat_templates (unit_id, key, title, description, required, seat_count,
      default_term_count, default_term_unit, role_id, scope, sort_order)
    values (_org, _key, trim(_title), coalesce(trim(_description), ''), _required, _seat_count,
      _term_count, _term_unit, _role, _scope, _sort_order)
    returning id into _id;
  return _id;
end $$;

CREATE FUNCTION charter.delete_demo_organization(_org uuid, _confirm_name text) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _o charter.units; _ids uuid[]; _id uuid;
begin
  select * into _o from charter.units where id = _org;
  if _o.id is null or auth.uid() is null
     or not (charter.has_permission(auth.uid(), 'org.manage', _org) or charter.is_platform_operator()) then
    raise exception 'not allowed';
  end if;
  if not _o.is_demo then raise exception 'only demo organizations can be deleted'; end if;
  if _o.parent_id is not null then raise exception 'delete the whole demo organization from its top'; end if;
  if trim(coalesce(_confirm_name, '')) <> _o.name then raise exception 'type the organization''s name to confirm'; end if;
  select array_agg(id order by coalesce(array_length(ancestor_ids, 1), 0) desc) into _ids
    from charter.units where id = _org or _org = any(ancestor_ids);
  -- deepest first: a parent can't go while it has children
  foreach _id in array _ids loop
    delete from charter.units where id = _id;
  end loop;
  delete from public.organizations where id = _org;
  perform charter.write_audit(_org, 'delete', 'demo_organization', _org::text,
    jsonb_build_object('name', _o.name, 'slug', _o.slug, 'type', _o.type),
    jsonb_build_object('organizations_deleted', array_length(_ids, 1)));
  return _ids;
end $$;

CREATE FUNCTION charter.disconnect_gateway(_org uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'payments.manage', _org) then raise exception 'not allowed'; end if;
  update charter.gateway_connections set status = 'disabled' where unit_id = _org;
  delete from charter.gateway_secrets where unit_id = _org;
end $$;

CREATE FUNCTION charter.effective_approval_required(_org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select case charter.ancestor_setting(_org, 'membership.child_approval') #>> '{}'
    when 'auto' then false
    when 'review' then true
    else coalesce((charter.effective_setting(_org, 'membership.approval_required') #>> '{}')::boolean, false)
  end
$$;

CREATE FUNCTION charter.effective_setting(_org uuid, _key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  with lin as (
    select a.id, array_position(o.ancestor_ids, a.id) as depth, false as self
    from charter.units o join charter.units a on a.id = any(o.ancestor_ids) where o.id = _org
    union all select _org, 1000000, true
  )
  select coalesce(
    (select s.value from lin join charter.org_settings s on s.unit_id = lin.id
       where s.key = _key and s.mode = 'locked' and not lin.self order by lin.depth asc limit 1),
    (select s.value from lin join charter.org_settings s on s.unit_id = lin.id
       where s.key = _key and s.mode <> 'inherit' order by lin.depth desc limit 1))
$$;

CREATE FUNCTION charter.emails_allowed(_org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce((select not is_demo from charter.units where id = _org), false)
$$;

CREATE FUNCTION charter.end_appointment(_appointment uuid, _reason text DEFAULT ''::text, _ended_on date DEFAULT CURRENT_DATE) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _a charter.appointments; _role uuid; _other uuid; _key text; _parent uuid; _admins int;
begin
  select * into _a from charter.appointments where id = _appointment;
  if _a.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.manage', _a.unit_id) then
    raise exception 'not allowed';
  end if;
  if _a.ended_on is not null then raise exception 'this appointment has already ended'; end if;
  if coalesce(_ended_on, current_date) < _a.starts_on then raise exception 'the end can''t be before the start'; end if;
  if _a.role_assignment_id is not null then
    select ra.role_id into _role from charter.role_assignments ra where ra.id = _a.role_assignment_id;
    select a.id into _other from charter.appointments a join charter.seat_templates t on t.id = a.template_id
      where a.unit_id = _a.unit_id and a.profile_id = _a.profile_id and a.id <> _a.id and a.ended_on is null
        and t.role_id = _role and a.role_assignment_id is null
      limit 1;
    if _other is null then
      select r.key into _key from charter.roles r where r.id = _role;
      select parent_id into _parent from charter.units where id = _a.unit_id;
      if _key = 'org_admin' and _parent is null then
        select count(*) into _admins from charter.role_assignments ra join charter.roles r on r.id = ra.role_id
          where ra.unit_id = _a.unit_id and r.key = 'org_admin';
        if _admins <= 1 then raise exception 'an organization must keep at least one admin'; end if;
      end if;
    end if;
  end if;
  update charter.appointments set ended_on = coalesce(_ended_on, current_date), end_reason = coalesce(trim(_reason), ''),
    ended_by = auth.uid(), role_assignment_id = null
    where id = _appointment;
  if _a.role_assignment_id is not null then
    if _other is not null then
      update charter.appointments set role_assignment_id = _a.role_assignment_id where id = _other;
    else
      delete from charter.role_assignments where id = _a.role_assignment_id;
    end if;
  end if;
end $$;

CREATE FUNCTION charter.enforce_setting_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if exists (
    select 1 from charter.org_settings s join charter.units o on s.unit_id = any(o.ancestor_ids)
    where o.id = new.unit_id and s.key = new.key and s.mode = 'locked'
  ) then raise exception 'setting % is locked by a parent organization', new.key; end if;
  new.updated_at := now();
  return new;
end $$;

CREATE FUNCTION charter.export_payments(_org uuid, _from date, _to date, _include_below boolean DEFAULT false) RETURNS TABLE(org_name text, received_on date, member text, email text, purpose text, level text, term text, amount_minor integer, refunded_minor integer, net_minor integer, currency text, status text, method text, gateway text, test_payment boolean, reference text, receipt text, tax_treatment text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    SET jit TO 'off'
    AS $$
declare _uid uuid := auth.uid(); _n int;
begin
  if _uid is null or not charter.has_permission(_uid, 'payments.view', _org) then
    raise exception 'not allowed';
  end if;
  if _from is null or _to is null or _to < _from then raise exception 'pick a date range'; end if;
  return query
    select o.name, coalesce(p.received_on, p.created_at::date),
      coalesce(nullif(pr.display_name, ''), case when charter.has_permission(_uid, 'members.view', p.unit_id) then pr.email end, ''),
      case when charter.has_permission(_uid, 'members.view', p.unit_id) then coalesce(pr.email, '') else '' end,
      p.purpose::text, coalesce(t.name, ''), coalesce(tt.label, ''),
      p.amount_minor, p.refunded_amount_minor, p.amount_minor - p.refunded_amount_minor, p.currency::text,
      p.status::text, coalesce(p.method::text, ''), p.gateway::text, not p.livemode,
      coalesce(p.gateway_ref, ''),
      coalesce((select r.number from charter.receipts r where r.payment_id = p.id and r.status = 'issued'
                order by r.seq desc limit 1), ''),
      coalesce(t.tax_treatment::text, '')
    from charter.payments p
    join charter.units o on o.id = p.unit_id
    left join charter.member_profiles pr on pr.id = p.profile_id
    left join charter.tier_terms tt on tt.id = p.term_id
    left join charter.membership_tiers t on t.id = tt.tier_id
    where (p.unit_id = _org or (_include_below and _org = any(o.ancestor_ids)))
      and p.status in ('paid', 'refunded')
      and coalesce(p.received_on, p.created_at::date) between _from and _to
    order by coalesce(p.received_on, p.created_at::date), o.name, p.created_at;
  get diagnostics _n = row_count;
  perform charter.write_audit(_org, 'export', 'report', 'payments', null,
    jsonb_build_object('rows', _n, 'filter', jsonb_build_object('from', _from, 'to', _to,
      'include_below', _include_below)));
end $$;

CREATE FUNCTION charter.fail_gateway_payment(_event_id text, _payment uuid, _reason text) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select charter.payment_failed(_event_id, _payment, _reason)
$$;

CREATE FUNCTION charter.gateway_connection_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  perform set_config('charter.payment_recording', 'on', true);
  if new.gateway = 'test' and not charter.test_gateway_allowed(new.unit_id) then
    raise exception 'test payments are only available to demo organizations';
  end if;
  if new.gateway = 'test' then new.livemode := false; end if;
  new.updated_at := now();
  return new;
end $$;

CREATE FUNCTION charter.gateway_sealed_credentials(_org uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select s.sealed from charter.gateway_secrets s join charter.gateway_connections c on c.unit_id = s.unit_id
  where s.unit_id = _org and c.gateway = 'stripe' and c.status = 'verified'
$$;

CREATE FUNCTION charter.grace_days(_org uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce((charter.effective_setting(_org, 'membership.grace_days') #>> '{}')::int, 30)
$$;

CREATE FUNCTION charter.grant_membership_term(_profile uuid, _term uuid, _paid_on date, _payment uuid, _actor uuid, _pending boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _p charter.member_profiles; _t charter.tier_terms; _m charter.memberships; _start date; _end date;
  _kind charter.membership_event_kind; _grace int;
begin
  select * into _p from charter.member_profiles where id = _profile;
  select * into _t from charter.tier_terms where id = _term;
  _grace := charter.grace_days(_p.unit_id);
  select * into _m from charter.memberships where unit_id = _p.unit_id and profile_id = _profile for update;
  if _pending then
    -- Waits for an admin; the term starts on the approval day (approve_membership).
    if _m.id is null then
      insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status)
        values (_p.unit_id, _profile, _t.tier_id, _t.id, 'pending') returning * into _m;
    else
      update charter.memberships set tier_id = _t.tier_id, term_id = _t.id, status = 'pending',
        joined_on = null, paid_through = null, lifetime = false, updated_at = now()
        where id = _m.id returning * into _m;
    end if;
    return _m.id;
  end if;
  _kind := case when _m.id is null or _m.status <> 'active' then 'joined' else 'renewed' end;
  _start := case when _m.id is null then _paid_on
    else charter.renewal_start(_m.status, _m.paid_through, _m.lifetime, _grace, _paid_on) end;
  _end := charter.term_end(_start, _t.length_count, _t.length_unit);
  if _m.id is null then
    insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through, lifetime)
      values (_p.unit_id, _profile, _t.tier_id, _t.id, 'active', _start, _end, _t.length_unit is null)
      returning * into _m;
  else
    update charter.memberships set tier_id = _t.tier_id, term_id = _t.id, status = 'active',
      joined_on = case when _kind = 'joined' then _start else joined_on end,
      paid_through = _end, lifetime = _t.length_unit is null, updated_at = now()
      where id = _m.id returning * into _m;
  end if;
  insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id, period_start, period_end, payment_id, actor_id)
    values (_p.unit_id, _m.id, _kind, _t.tier_id, _t.id, _start, _end, _payment, _actor);
  return _m.id;
end $$;

CREATE FUNCTION charter.holds_all_role_permissions(_user uuid, _role uuid, _org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select not exists (select 1 from charter.role_permissions rp
    where rp.role_id = _role and not charter.has_permission(_user, rp.permission_key, _org))
$$;

CREATE FUNCTION charter.import_members(_org uuid, _rows jsonb, _apply boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $_$
declare _uid uuid := auth.uid(); _o charter.units; _home boolean; _r jsonb; _n int := 0;
  _errors jsonb := '[]'::jsonb; _plan jsonb := '[]'::jsonb; _err text; _row int;
  _name text; _mail text; _p charter.member_profiles; _tier charter.membership_tiers; _term charter.tier_terms;
  _joined date; _through date; _chapter uuid; _d charter.attribute_definitions; _k text; _v jsonb;
  _seen text[] := '{}'; _key text; _m charter.memberships; _created int := 0; _updated int := 0; _x jsonb;
  _pid uuid; _mid uuid; _kind charter.membership_event_kind;
begin
  if _uid is null or not charter.has_permission(_uid, 'members.manage', _org) then raise exception 'not allowed'; end if;
  select * into _o from charter.units where id = _org;
  if jsonb_typeof(_rows) <> 'array' then raise exception 'rows must be a list'; end if;
  if jsonb_array_length(_rows) > 1000 then raise exception 'import at most 1000 rows at a time'; end if;
  _home := charter.membership_model(_org) = 'home_chapter';
  if _home and _o.parent_id is not null then
    raise exception 'members belong to the national organization; import them there';
  end if;

  -- pass 1: check every row and work out what it would do
  for _r in select * from jsonb_array_elements(_rows) loop
    _n := _n + 1;
    _row := coalesce((_r->>'row')::int, _n);
    _err := null; _p := null; _tier := null; _term := null; _joined := null; _through := null; _chapter := null;
    _name := trim(coalesce(_r->>'name', ''));
    _mail := lower(trim(coalesce(_r->>'email', '')));
    begin
      if _mail <> '' and _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the email "%" isn''t valid', _mail; end if;
      if char_length(_name) > 120 then raise exception 'the name is longer than 120 characters'; end if;
      _key := case when _mail <> '' then 'e:' || _mail else 'n:' || lower(_name) end;
      if _key = 'n:' then raise exception 'give each member a name or an email'; end if;
      if _key = any(_seen) then raise exception 'this member is already in the file'; end if;
      _seen := _seen || _key;
      if _mail <> '' then
        select * into _p from charter.member_profiles where unit_id = _org and lower(email) = _mail and left_at is null limit 1;
      else
        select * into _p from charter.member_profiles where unit_id = _org and email = '' and left_at is null
          and lower(trim(display_name)) = lower(_name) limit 1;
      end if;
      if _p.id is null and _name = '' then raise exception 'a new member needs a name'; end if;
      if coalesce(_r->>'level', '') <> '' or coalesce(_r->>'term', '') <> '' then
        select * into _tier from charter.membership_tiers t where t.unit_id = _org and t.active
          and (lower(t.name) = lower(trim(_r->>'level')) or t.key = lower(trim(_r->>'level'))) limit 1;
        if _tier.id is null then raise exception 'there''s no active level called "%"', _r->>'level'; end if;
        select * into _term from charter.tier_terms x where x.tier_id = _tier.id and x.active
          and (coalesce(_r->>'term', '') = '' or lower(x.label) = lower(trim(_r->>'term')) or x.key = lower(trim(_r->>'term')))
          order by x.sort_order limit 2;
        if _term.id is null then raise exception '% has no active term called "%"', _tier.name, _r->>'term'; end if;
        if coalesce(_r->>'term', '') = '' and (select count(*) from charter.tier_terms x where x.tier_id = _tier.id and x.active) > 1 then
          raise exception 'say which term of % (it has more than one)', _tier.name;
        end if;
        if trim(coalesce(_r->>'joined_on', '')) !~ '^(\d{4}-\d{2}-\d{2})?$'
           or trim(coalesce(_r->>'paid_through', '')) !~ '^(\d{4}-\d{2}-\d{2})?$' then
          raise exception 'write dates as YYYY-MM-DD';
        end if;
        begin
          _joined := nullif(trim(coalesce(_r->>'joined_on', '')), '')::date;
          _through := nullif(trim(coalesce(_r->>'paid_through', '')), '')::date;
        exception when others then raise exception 'write dates as YYYY-MM-DD';
        end;
        _joined := coalesce(_joined, current_date);
        if _term.length_unit is not null and _through is null then raise exception 'a % membership needs a paid-through date', _term.label; end if;
        if _through is not null and _through < _joined then raise exception 'paid through is before the join date'; end if;
        if _p.id is not null and exists (select 1 from charter.memberships where unit_id = _org and profile_id = _p.id and status = 'pending') then
          raise exception 'their application is waiting: approve or decline it first';
        end if;
      elsif coalesce(_r->>'joined_on', '') <> '' or coalesce(_r->>'paid_through', '') <> '' then
        raise exception 'dates need a membership level';
      end if;
      if coalesce(_r->>'chapter', '') <> '' then
        if not _home then raise exception 'chapters are only imported in the home-chapter model'; end if;
        select c.id into _chapter from charter.units c where c.type = 'chapter' and _org = any(c.ancestor_ids)
          and (lower(c.name) = lower(trim(_r->>'chapter')) or c.slug = lower(trim(_r->>'chapter'))) limit 1;
        if _chapter is null then raise exception 'there''s no chapter called "%"', _r->>'chapter'; end if;
        if _tier.id is null and not exists (select 1 from charter.memberships where unit_id = _org and profile_id = _p.id
            and status = 'active') then
          raise exception 'a chapter needs a membership level';
        end if;
      end if;
      if jsonb_typeof(_r->'fields') = 'object' then
        for _k, _v in select * from jsonb_each(_r->'fields') loop
          select * into _d from charter.attribute_definitions where id::text = _k and active and applies_to = 'member'
            and (unit_id = _org or unit_id = any(_o.ancestor_ids));
          if _d.id is null then raise exception 'unknown member field'; end if;
          if _v is not null and _v <> 'null'::jsonb and _v <> '""'::jsonb then
            begin
              perform charter.validate_attribute_value(_d, _v);
            exception when others then raise exception '%', sqlerrm;
            end;
          end if;
        end loop;
      end if;
    exception when others then
      _err := sqlerrm;
    end;
    if _err is not null then
      _errors := _errors || jsonb_build_object('row', _row, 'message', _err);
    else
      _plan := _plan || jsonb_build_object('row', _row, 'action', case when _p.id is null then 'create' else 'update' end,
        'profile', _p.id, 'name', _name, 'email', _mail, 'term', _term.id, 'joined', _joined, 'through', _through,
        'chapter', _chapter, 'fields', coalesce(_r->'fields', '{}'::jsonb));
      if _p.id is null then _created := _created + 1; else _updated := _updated + 1; end if;
    end if;
  end loop;

  if not _apply or jsonb_array_length(_errors) > 0 then
    return jsonb_build_object('rows', _n, 'create', _created, 'update', _updated, 'errors', _errors, 'applied', false);
  end if;

  -- pass 2: apply (all or nothing: this whole call is one transaction)
  for _x in select * from jsonb_array_elements(_plan) loop
    _pid := nullif(_x->>'profile', '')::uuid;
    if _pid is null then
      insert into charter.member_profiles (unit_id, user_id, display_name, email, source)
        values (_org, null, _x->>'name', _x->>'email', 'import') returning id into _pid;
    else
      select * into _p from charter.member_profiles where id = _pid;
      if _p.user_id is null and (_x->>'name') <> '' and (_x->>'name') <> _p.display_name then
        update charter.member_profiles set display_name = _x->>'name' where id = _pid;
      end if;
    end if;
    for _k, _v in select * from jsonb_each(_x->'fields') loop
      if _v is not null and _v <> 'null'::jsonb and _v <> '""'::jsonb then
        perform charter.set_attribute_value(_k::uuid, _pid, _v);
      end if;
    end loop;
    if nullif(_x->>'term', '') is not null then
      select * into _term from charter.tier_terms where id = (_x->>'term')::uuid;
      select * into _m from charter.memberships where unit_id = _org and profile_id = _pid for update;
      _kind := case when _m.id is null or _m.status <> 'active' then 'joined' else 'renewed' end;
      _joined := (_x->>'joined')::date;
      _through := case when _term.length_unit is null then null else (_x->>'through')::date end;
      if _m.id is null then
        insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through, lifetime)
          values (_org, _pid, _term.tier_id, _term.id, 'active', _joined, _through, _term.length_unit is null)
          returning id into _mid;
      else
        update charter.memberships set tier_id = _term.tier_id, term_id = _term.id, status = 'active',
          joined_on = _joined, paid_through = _through, lifetime = _term.length_unit is null, updated_at = now()
          where id = _m.id;
        _mid := _m.id;
      end if;
      insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id, period_start, period_end, note, actor_id)
        values (_org, _mid, _kind, _term.tier_id, _term.id, _joined, _through, 'Imported from a file', _uid);
    end if;
    if nullif(_x->>'chapter', '') is not null then
      select id into _mid from charter.memberships where unit_id = _org and profile_id = _pid;
      perform charter.move_home_chapter(_mid, (_x->>'chapter')::uuid);
    end if;
  end loop;
  perform charter.write_audit(_org, 'import', 'members', null, null,
    jsonb_build_object('rows', _n, 'created', _created, 'updated', _updated));
  return jsonb_build_object('rows', _n, 'create', _created, 'update', _updated, 'errors', _errors, 'applied', true);
end $_$;

CREATE FUNCTION charter.is_org_member(_user uuid, _org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select exists (select 1 from charter.member_profiles
    where user_id = _user and unit_id = _org and left_at is null)
$$;

CREATE FUNCTION charter.is_platform_operator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select auth.uid() is not null and exists (select 1 from charter.platform_operators where user_id = auth.uid())
$$;

CREATE FUNCTION charter.issue_receipt(_payment uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _p charter.payments;
begin
  select * into _p from charter.payments where id = _payment;
  if _p.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'payments.manage', _p.unit_id) then
    raise exception 'not allowed'; end if;
  if _p.status <> 'paid' then raise exception 'only paid payments get receipts'; end if;
  if exists (select 1 from charter.receipts where payment_id = _payment and status = 'issued') then
    raise exception 'this payment already has a receipt'; end if;
  return charter.issue_receipt_internal(_payment);
end $$;

CREATE FUNCTION charter.issue_receipt_internal(_payment uuid, _supersedes uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _p charter.payments; _year int := extract(year from now())::int; _seq int; _id uuid;
begin
  perform set_config('charter.payment_recording', 'on', true);
  select * into _p from charter.payments where id = _payment;
  insert into charter.receipt_counters (unit_id, year, last_seq) values (_p.unit_id, _year, 1)
    on conflict (unit_id, year) do update set last_seq = charter.receipt_counters.last_seq + 1
    returning last_seq into _seq;
  insert into charter.receipts (unit_id, payment_id, number, year, seq, supersedes_id, snapshot)
    values (_p.unit_id, _p.id, _year || '-' || lpad(_seq::text, 5, '0'), _year, _seq, _supersedes,
      charter.receipt_snapshot(_p.id))
    returning id into _id;
  return _id;
end $$;

CREATE FUNCTION charter.join_requirements(_org uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _n charter.units;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into _n from charter.units where id = charter.national_org(_org);
  return jsonb_build_object(
    'national_required', charter.national_dues_required(_org),
    'national', jsonb_build_object('id', _n.id, 'name', _n.name, 'slug', _n.slug),
    'national_state', charter.national_membership_state(auth.uid(), _org));
end $$;

CREATE FUNCTION charter.level_link_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
declare _linked boolean;
begin
  if coalesce(current_setting('app.level_link', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'membership_tiers' then
    if tg_op = 'INSERT' then
      if new.source_tier_id is not null or new.link_mode is not null or new.price_rule is not null or new.price_value is not null then
        raise exception 'start from a suggested level to link a level';
      end if;
      return new;
    end if;
    if new.source_tier_id is distinct from old.source_tier_id or new.link_mode is distinct from old.link_mode
       or new.price_rule is distinct from old.price_rule or new.price_value is distinct from old.price_value then
      raise exception 'start from a suggested level to link a level';
    end if;
    if old.link_mode = 'linked' and (new.name is distinct from old.name or new.description is distinct from old.description
       or new.tax_treatment is distinct from old.tax_treatment) then
      raise exception 'this level follows your national''s; make it your own to change it';
    end if;
    return new;
  end if;
  -- tier_terms
  select mt.link_mode = 'linked' into _linked from charter.membership_tiers mt where mt.id = new.tier_id;
  if coalesce(_linked, false) then
    raise exception 'this level follows your national''s; make it your own to change it';
  end if;
  if new.source_term_id is not null and (tg_op = 'INSERT' or new.source_term_id is distinct from old.source_term_id) then
    raise exception 'start from a suggested level to link a level';
  end if;
  return new;
end $$;

CREATE FUNCTION charter.lineage_settings(_org uuid) RETURNS TABLE(unit_id uuid, key text, value jsonb, mode charter.setting_mode)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select s.unit_id, s.key, s.value, s.mode
  from charter.units o join charter.org_settings s on s.unit_id = o.id or s.unit_id = any(o.ancestor_ids)
  where o.id = _org and (charter.is_org_member(auth.uid(), _org) or charter.has_permission(auth.uid(), 'org.view', _org))
$$;

CREATE FUNCTION charter.linked_price(_org uuid, _price integer, _rule text, _value integer) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _p int; _min int; _max int;
begin
  _p := case coalesce(_rule, 'same')
    when 'minus_amount' then greatest(_price - coalesce(_value, 0), 0)
    when 'minus_percent' then greatest(round(_price * (100 - least(coalesce(_value, 0), 100)) / 100.0)::int, 0)
    else _price end;
  if exists (select 1 from charter.units where id = _org and parent_id is not null) then
    _min := nullif((charter.ancestor_setting(_org, 'membership.chapter_dues_min_minor') #>> '{}')::int, 0);
    _max := nullif((charter.ancestor_setting(_org, 'membership.chapter_dues_max_minor') #>> '{}')::int, 0);
    if _min is not null and _p < _min then _p := _min; end if;
    if _max is not null and _p > _max then _p := _max; end if;
  end if;
  return _p;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE FUNCTION charter.listed_in_directory(_profile charter.member_profiles) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce(_profile.directory_listed,
    coalesce((charter.effective_setting(_profile.unit_id, 'directory.listed_by_default') #>> '{}')::boolean, true))
$$;

CREATE FUNCTION charter.log_member_export(_org uuid, _row_count integer, _columns text[], _filter jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _include boolean := coalesce((_filter ->> 'include_opted_out')::boolean, false);
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'members.export', _org) then raise exception 'not allowed'; end if;
  if _row_count < 0 or coalesce(array_length(_columns, 1), 0) = 0 then raise exception 'nothing to export'; end if;
  if _include and not charter.privacy_admin_override_allowed(_org) then
    raise exception 'members who opted out can''t be exported here';
  end if;
  perform charter.write_audit(_org, 'export', 'members', null, null,
    jsonb_build_object('rows', _row_count, 'columns', to_jsonb(_columns), 'filter', coalesce(_filter, '{}'::jsonb),
      'included_opted_out', _include));
end $$;

CREATE FUNCTION charter.log_report_export(_org uuid, _report text, _row_count integer, _filter jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if _report not in ('members', 'revenue', 'governance') then raise exception 'unknown report'; end if;
  if auth.uid() is null or not charter.has_permission(auth.uid(),
       case _report when 'members' then 'members.view' when 'revenue' then 'payments.view' else 'org.view' end, _org) then
    raise exception 'not allowed';
  end if;
  perform charter.write_audit(_org, 'export', 'report', _report, null,
    jsonb_build_object('rows', greatest(_row_count, 0), 'filter', coalesce(_filter, '{}'::jsonb)));
end $$;

CREATE FUNCTION charter.make_level_own(_tier uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _t charter.membership_tiers;
begin
  select * into _t from charter.membership_tiers where id = _tier;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'tiers.manage', _t.unit_id) then
    raise exception 'not allowed';
  end if;
  if _t.link_mode is distinct from 'linked' then return; end if;
  perform set_config('app.level_link', 'on', true);
  update charter.membership_tiers set link_mode = 'copy', price_rule = null, price_value = null where id = _tier;
  perform set_config('app.level_link', _prev, true);
end $$;

CREATE FUNCTION charter.mark_payment_refunded(_event_id text, _gateway charter.payment_gateway, _gateway_ref text, _amount_minor integer) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select charter.payment_refunded(_event_id, _gateway, _gateway_ref, _amount_minor)
$$;

CREATE FUNCTION charter.member_directory(_org uuid) RETURNS TABLE(profile_id uuid, display_name text, fields jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    SET jit TO 'off'
    AS $$
declare
  _listed_default boolean;
begin
  perform set_config('charter.payment_recording', 'on', true);
  if auth.uid() is null or not (charter.is_org_member(auth.uid(), _org) or charter.has_permission(auth.uid(), 'members.view', _org)) then
    raise exception 'not allowed';
  end if;
  -- same rule as listed_in_directory(p), resolved once: every row here belongs to _org
  _listed_default := coalesce((charter.effective_setting(_org, 'directory.listed_by_default') #>> '{}')::boolean, true);
  return query
    with s as materialized (
      select p.id as pid, p.display_name as pname, m.status, m.paid_through, m.lifetime, m.unit_id as morg
      from charter.member_profiles p
      join charter.memberships m on m.id = charter.profile_membership_id(p)
      where p.unit_id = _org and p.left_at is null and coalesce(p.directory_listed, _listed_default)
    ),
    g as materialized (
      select o.morg, charter.grace_days(o.morg) as gd from (select distinct s.morg from s) o
    )
    select s.pid, s.pname,
      coalesce((select jsonb_object_agg(d.label, v.value order by d.sort_order)
        from charter.attribute_values v join charter.attribute_definitions d on d.id = v.definition_id
        where v.entity_id = s.pid and d.active and d.applies_to = 'member' and d.show_in_directory
          and d.visibility in ('members', 'public')), '{}'::jsonb)
    from s join g on g.morg = s.morg
    where charter.membership_standing(s.status, s.paid_through, s.lifetime, g.gd, current_date) in ('good', 'grace')
    order by lower(s.pname);
end $$;

CREATE FUNCTION charter.membership_events_append_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'membership history can''t be changed';
end $$;

CREATE FUNCTION charter.membership_model(_org uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce((select s.value #>> '{}' from charter.org_settings s
    join charter.units o on o.id = _org
    where s.key = 'membership.model' and s.unit_id = coalesce(o.ancestor_ids[1], o.id)), 'separate')
$$;

CREATE FUNCTION charter.membership_model_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
declare _o charter.units;
begin
  if tg_op = 'DELETE' then
    -- removing the whole organization (a cascade, e.g. deleting a demo org) takes it along
    if pg_trigger_depth() > 1 then return old; end if;
    if old.key in ('membership.model') then raise exception 'the membership model can''t be changed once chosen'; end if;
    return old;
  end if;
  if new.key not in ('membership.model', 'membership.at_large_chapter') then return new; end if;
  select * into _o from charter.units where id = new.unit_id;
  if _o.parent_id is not null or _o.type <> 'national' then
    raise exception 'only a national chooses the membership model';
  end if;
  new.mode := 'locked';
  if new.key = 'membership.model' then
    if (new.value #>> '{}') not in ('separate', 'home_chapter') then raise exception 'unknown membership model'; end if;
    if tg_op = 'UPDATE' and (old.value #>> '{}') is distinct from (new.value #>> '{}') then
      raise exception 'the membership model can''t be changed once chosen';
    end if;
  else
    if coalesce(new.value #>> '{}', '') <> '' and not exists (select 1 from charter.units c
        where c.id::text = new.value #>> '{}' and c.type = 'chapter' and _o.id = any(c.ancestor_ids)) then
      raise exception 'the at-large chapter must be one of your chapters';
    end if;
  end if;
  return new;
end $$;

CREATE FUNCTION charter.membership_standing(_status charter.membership_status, _paid_through date, _lifetime boolean, _grace integer, _today date) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'charter'
    AS $$
  select case
    when _status <> 'active' then _status::text
    when _lifetime then 'good'
    when _today <= _paid_through then 'good'
    when _today <= _paid_through + _grace then 'grace'
    else 'lapsed' end
$$;

CREATE FUNCTION charter.move_home_chapter(_membership uuid, _chapter uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _m charter.memberships; _np charter.member_profiles; _old uuid; _cp charter.member_profiles;
begin
  select * into _m from charter.memberships where id = _membership for update;
  if _m.id is null then raise exception 'join first'; end if;
  if charter.membership_model(_m.unit_id) <> 'home_chapter'
     or exists (select 1 from charter.units where id = _m.unit_id and parent_id is not null) then
    raise exception 'members don''t choose a chapter here';
  end if;
  if _m.status not in ('active', 'pending') then raise exception 'join first'; end if;
  if _chapter is not null and not exists (select 1 from charter.units c
      where c.id = _chapter and c.type = 'chapter' and _m.unit_id = any(c.ancestor_ids)) then
    raise exception 'that isn''t one of this organization''s chapters';
  end if;
  _old := _m.home_org_id;
  if _old is not distinct from _chapter then return; end if;
  select * into _np from charter.member_profiles where id = _m.profile_id;
  if _old is not null then
    for _cp in select * from charter.member_profiles where unit_id = _old and home_of = _m.id and left_at is null loop
      delete from charter.role_assignments where id in (select a.role_assignment_id from charter.appointments a
        where a.profile_id = _cp.id and a.ended_on is null and a.role_assignment_id is not null);
      update charter.appointments set ended_on = greatest(current_date, starts_on), end_reason = 'changed chapter',
          ended_by = auth.uid()
        where profile_id = _cp.id and ended_on is null;
      update charter.member_profiles set left_at = now() where id = _cp.id;
    end loop;
  end if;
  if _chapter is not null then
    select * into _cp from charter.member_profiles where unit_id = _chapter
      and ((_np.user_id is not null and user_id = _np.user_id) or home_of = _m.id)
      order by (home_of = _m.id) desc nulls last limit 1;
    if _cp.id is not null then
      update charter.member_profiles set home_of = _m.id, left_at = null where id = _cp.id;
    else
      insert into charter.member_profiles (unit_id, user_id, display_name, email, source, home_of)
        values (_chapter, _np.user_id, _np.display_name, _np.email,
          case when _np.user_id is null then 'admin' else 'signup' end, _m.id);
    end if;
  end if;
  update charter.memberships set home_org_id = _chapter where id = _m.id;
  insert into charter.affiliation_history (unit_id, membership_id, from_org_id, to_org_id, changed_by)
    values (_m.unit_id, _m.id, _old, _chapter, auth.uid());
end $$;

CREATE FUNCTION charter.national_dues_required(_org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select exists (select 1 from charter.units where id = _org and parent_id is not null)
    and coalesce((charter.ancestor_setting(_org, 'membership.national_dues_required') #>> '{}')::boolean, false)
$$;

CREATE FUNCTION charter.national_membership_state(_user uuid, _org uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  with n as (select charter.national_org(_org) as id)
  select coalesce((
    select case
      when charter.membership_standing(m.status, m.paid_through, m.lifetime, charter.grace_days(n.id), current_date)
        in ('good', 'grace') then 'current'
      when m.status = 'pending' then 'pending'
      else 'none' end
    from n join charter.member_profiles p on p.unit_id = n.id and p.user_id = _user
    join charter.memberships m on m.profile_id = p.id and m.unit_id = n.id), 'none')
$$;

CREATE FUNCTION charter.national_org(_org uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce(ancestor_ids[1], id) from charter.units where id = _org
$$;

CREATE FUNCTION charter.org_board(_org uuid) RETURNS TABLE(template_id uuid, owner_org_id uuid, key text, title text, default_title text, description text, required boolean, seat_count integer, scope charter.seat_scope, role_id uuid, term_count integer, term_unit charter.term_unit, term_source text, term_since date, bylaw_reference text, holders jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if auth.uid() is null or not (charter.is_org_member(auth.uid(), _org) or charter.can_see_org_tree(auth.uid(), _org)) then
    raise exception 'not allowed';
  end if;
  return query
    select t.id, t.unit_id, t.key, coalesce(o.title, t.title), t.title, t.description, t.required, t.seat_count,
      t.scope, t.role_id, f.length_count, f.length_unit, f.source, st.effective_from, coalesce(st.bylaw_reference, ''),
      coalesce((select jsonb_agg(jsonb_build_object('appointment_id', a.id, 'profile_id', a.profile_id,
          'display_name', p.display_name, 'seat_number', a.seat_number, 'starts_on', a.starts_on,
          'planned_end', a.planned_end) order by a.seat_number)
        from charter.appointments a join charter.member_profiles p on p.id = a.profile_id
        where a.unit_id = _org and a.template_id = t.id and a.ended_on is null), '[]'::jsonb)
    from charter.seat_templates t
    left join charter.seat_title_overrides o on o.unit_id = _org and o.template_id = t.id
    cross join lateral charter.seat_term_in_force(_org, t.id, current_date) f
    left join charter.seat_terms st on st.id = f.term_id
    where t.active and charter.seat_applies_at(t, _org)
    order by (t.unit_id <> _org), t.sort_order, t.title;
end $$;

CREATE FUNCTION charter.org_board_contacts(_org uuid) RETURNS TABLE(template_id uuid, title text, sort_order integer, seat_number integer, display_name text, email text, email_source text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if auth.uid() is null or not (charter.is_org_member(auth.uid(), _org) or charter.can_see_org_tree(auth.uid(), _org)) then
    raise exception 'not allowed';
  end if;
  return query
    with seats as (
      select t.id, coalesce(o.title, t.title) as title, t.sort_order, (t.unit_id <> _org) as inherited,
        c.role_email
      from charter.seat_templates t
      left join charter.seat_title_overrides o on o.unit_id = _org and o.template_id = t.id
      left join charter.seat_contacts c on c.unit_id = _org and c.template_id = t.id
      where t.active and charter.seat_applies_at(t, _org)
    )
    select x.id, x.title, x.sort_order, x.seat_number, x.display_name, x.email, x.email_source from (
      select s.id, s.title, s.sort_order, s.inherited, a.seat_number, p.display_name,
        coalesce(s.role_email, nullif(p.email, '')) as email,
        case when s.role_email is not null then 'role'
          when nullif(p.email, '') is not null then 'officer' else 'none' end as email_source
      from seats s
      join charter.appointments a on a.unit_id = _org and a.template_id = s.id and a.ended_on is null
      join charter.member_profiles p on p.id = a.profile_id
      union all
      select s.id, s.title, s.sort_order, s.inherited, null::int, null::text, s.role_email, 'role'
      from seats s
      where s.role_email is not null
        and not exists (select 1 from charter.appointments a where a.unit_id = _org and a.template_id = s.id
                        and a.ended_on is null)
    ) x
    order by x.inherited, x.sort_order, x.title, x.seat_number nulls last;
end $$;

CREATE FUNCTION charter.org_demo_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select is_demo into new.is_demo from charter.units where id = new.parent_id;
    end if;
    return new;
  end if;
  -- create_demo_organization marks the org it just created (a transaction-local flag that API
  -- clients can't set: they only reach tables and exposed functions, never set_config)
  if new.is_demo and not old.is_demo and current_setting('app.creating_demo_org', true) = new.id::text then
    return new;
  end if;
  if new.is_demo is distinct from old.is_demo then
    raise exception 'an organization can''t switch between demo and production';
  end if;
  return new;
end $$;

CREATE FUNCTION charter.org_lineage(_org uuid) RETURNS TABLE(id uuid, name text, type charter.org_type, logo_path text, depth integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select a.id, a.name, a.type, a.logo_path, array_position(o.ancestor_ids, a.id)
  from charter.units o join charter.units a on a.id = any(o.ancestor_ids)
  where o.id = _org and (charter.is_org_member(auth.uid(), _org) or charter.has_permission(auth.uid(), 'org.view', _org))
$$;

CREATE FUNCTION charter.org_overview_stats(_org uuid) RETURNS TABLE(chapters integer, orgs_below integer, roster integer, current_members integer, lifetime_members integer, chapter_memberships integer, pending_members integer, joined_30d integer, expiring_30 integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    SET jit TO 'off'
    AS $$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'members.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    with t as (select * from charter.org_subtree(_org)),
    s0 as materialized (
      -- a person once: by login, else (home-chapter model) by their national record, else the record
      select coalesce(p.user_id::text, (select hm.profile_id::text from charter.memberships hm where hm.id = p.home_of), p.id::text) as person,
        t.type as org_type, t.depth as org_depth,
        m.id as mid, m.unit_id as morg, m.status, m.joined_on, m.paid_through, m.lifetime
      from charter.member_profiles p
      join t on t.unit_id = p.unit_id
      left join charter.memberships m on m.id = charter.profile_membership_id(p)
      where p.left_at is null
    ),
    g as materialized (
      select o.morg, charter.grace_days(o.morg) as gd
      from (select distinct s0.morg from s0 where s0.morg is not null) o
    ),
    s as materialized (
      select s0.person, s0.org_type, s0.org_depth,
        s0.joined_on as joined, s0.paid_through as through, coalesce(s0.lifetime, false) as is_lifetime,
        case when s0.mid is null then 'none'
          else charter.membership_standing(s0.status, s0.paid_through, s0.lifetime, g.gd, current_date) end as standing
      from s0 left join g on g.morg = s0.morg
    )
    select
      (select count(*) from t where t.depth > 0 and t.type = 'chapter')::int,
      (select count(*) from t where t.depth > 0)::int,
      (select count(distinct s.person) from s)::int,
      (select count(distinct s.person) from s where s.standing in ('good', 'grace'))::int,
      (select count(distinct s.person) from s where s.standing in ('good', 'grace') and s.is_lifetime)::int,
      (select count(*) from s where s.standing in ('good', 'grace') and s.org_depth > 0 and s.org_type = 'chapter')::int,
      (select count(distinct s.person) from s where s.standing = 'pending')::int,
      (select count(distinct s.person) from s where s.joined >= current_date - 30)::int,
      (select count(distinct s.person) from s where s.standing = 'good' and not s.is_lifetime and s.through < current_date + 30)::int;
end $$;

CREATE FUNCTION charter.org_rollup_governance(_org uuid) RETURNS TABLE(unit_id uuid, name text, depth integer, required_seats integer, vacant_required integer, vacant_titles text[], terms_past_end integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'org.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    with t as (select * from charter.org_subtree(_org)),
    seats as (
      select t.unit_id, st.id as template_id, coalesce(o.title, st.title) as title, st.required,
        exists (select 1 from charter.appointments a where a.unit_id = t.unit_id and a.template_id = st.id
                and a.ended_on is null) as filled
      from t join charter.seat_templates st on st.active and charter.seat_applies_at(st, t.unit_id)
      left join charter.seat_title_overrides o on o.unit_id = t.unit_id and o.template_id = st.id
    )
    select t.unit_id, t.name, t.depth,
      (select count(*) from seats where seats.unit_id = t.unit_id and seats.required)::int,
      (select count(*) from seats where seats.unit_id = t.unit_id and seats.required and not seats.filled)::int,
      coalesce((select array_agg(seats.title order by seats.title) from seats
        where seats.unit_id = t.unit_id and seats.required and not seats.filled), '{}'),
      (select count(*) from charter.appointments a where a.unit_id = t.unit_id and a.ended_on is null
        and a.planned_end < current_date)::int
    from t
    order by t.depth, t.name;
end $$;

CREATE FUNCTION charter.org_rollup_members(_org uuid) RETURNS TABLE(unit_id uuid, name text, type charter.org_type, parent_id uuid, depth integer, profiles integer, good integer, grace integer, lapsed integer, pending integer, ended integer, no_membership integer, joined_30d integer, expiring_30 integer, expiring_60 integer, expiring_90 integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    SET jit TO 'off'
    AS $$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'members.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    with t as (select * from charter.org_subtree(_org)),
    s0 as materialized (
      select p.unit_id as porg, m.id as mid, m.unit_id as morg, m.status, m.joined_on, m.paid_through, m.lifetime
      from charter.member_profiles p
      join t on t.unit_id = p.unit_id
      left join charter.memberships m on m.id = charter.profile_membership_id(p)
      where p.left_at is null
    ),
    g as materialized (
      select o.morg, charter.grace_days(o.morg) as gd
      from (select distinct s0.morg from s0 where s0.morg is not null) o
    ),
    s as (
      select s0.porg as unit_id, s0.joined_on, s0.paid_through, s0.lifetime,
        case when s0.mid is null then 'none'
          else charter.membership_standing(s0.status, s0.paid_through, s0.lifetime, g.gd, current_date) end as standing
      from s0 left join g on g.morg = s0.morg
    )
    select t.unit_id, t.name, t.type, t.parent_id, t.depth,
      count(s.unit_id)::int,
      count(*) filter (where s.standing = 'good')::int,
      count(*) filter (where s.standing = 'grace')::int,
      count(*) filter (where s.standing = 'lapsed')::int,
      count(*) filter (where s.standing = 'pending')::int,
      count(*) filter (where s.standing in ('cancelled', 'declined'))::int,
      count(*) filter (where s.standing = 'none')::int,
      count(*) filter (where s.joined_on >= current_date - 30)::int,
      count(*) filter (where s.standing = 'good' and not s.lifetime and s.paid_through < current_date + 30)::int,
      count(*) filter (where s.standing = 'good' and not s.lifetime and s.paid_through < current_date + 60)::int,
      count(*) filter (where s.standing = 'good' and not s.lifetime and s.paid_through < current_date + 90)::int
    from t left join s on s.unit_id = t.unit_id
    group by t.unit_id, t.name, t.type, t.parent_id, t.depth
    order by t.depth, t.name;
end $$;

CREATE FUNCTION charter.org_rollup_revenue(_org uuid, _from date, _to date) RETURNS TABLE(unit_id uuid, name text, depth integer, currency text, payments integer, gross_minor bigint, refunded_minor bigint, net_minor bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    SET jit TO 'off'
    AS $$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'payments.view', _org) then
    raise exception 'not allowed';
  end if;
  if _from is null or _to is null or _to < _from then raise exception 'pick a date range'; end if;
  return query
    select t.unit_id, t.name, t.depth, p.currency::text, count(*)::int,
      sum(p.amount_minor)::bigint, sum(p.refunded_amount_minor)::bigint,
      sum(p.amount_minor - p.refunded_amount_minor)::bigint
    from charter.org_subtree(_org) t
    join charter.payments p on p.unit_id = t.unit_id
    where p.status in ('paid', 'refunded') and p.livemode
      and coalesce(p.received_on, p.created_at::date) between _from and _to
    group by t.unit_id, t.name, t.depth, p.currency
    order by t.depth, t.name, p.currency;
end $$;

CREATE FUNCTION charter.org_subtree(_org uuid) RETURNS TABLE(unit_id uuid, name text, type charter.org_type, parent_id uuid, depth integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select o.id, o.name, o.type, o.parent_id,
    coalesce(array_length(o.ancestor_ids, 1), 0) - coalesce((select array_length(r.ancestor_ids, 1) from charter.units r where r.id = _org), 0)
  from charter.units o
  where o.id = _org or _org = any(o.ancestor_ids)
$$;

CREATE FUNCTION charter.payment_failed(_event_id text, _payment uuid, _reason text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _pay charter.payments;
begin
  perform set_config('charter.payment_recording', 'on', true);
  select * into _pay from charter.payments where id = _payment for update;
  if _pay.id is null then return 'unknown payment'; end if;
  if not charter.claim_webhook_event(_pay.unit_id, _pay.gateway, _event_id, 'payment.failed', _pay.id) then return 'duplicate'; end if;
  if _pay.status <> 'pending' then return 'already ' || _pay.status; end if;
  update charter.payments set status = 'failed', failure_reason = left(coalesce(_reason, 'Payment failed'), 300) where id = _pay.id;
  return 'failed';
end $$;

CREATE FUNCTION charter.payment_refunded(_event_id text, _gateway charter.payment_gateway, _gateway_ref text, _amount_minor integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _pay charter.payments; _total int;
begin
  perform set_config('charter.payment_recording', 'on', true);
  select * into _pay from charter.payments where gateway = _gateway and gateway_ref = _gateway_ref for update;
  if _pay.id is null then return 'unknown payment'; end if;
  if not charter.claim_webhook_event(_pay.unit_id, _pay.gateway, _event_id, 'payment.refunded', _pay.id) then return 'duplicate'; end if;
  if _pay.status not in ('paid', 'refunded') then return 'not paid'; end if;
  -- Stripe sends the running total refunded on the charge, so take the larger value.
  _total := least(_pay.amount_minor, greatest(_pay.refunded_amount_minor, _amount_minor));
  update charter.payments set refunded_amount_minor = _total,
    status = case when _total >= _pay.amount_minor then 'refunded' else status end where id = _pay.id;
  return case when _total >= _pay.amount_minor then 'refunded' else 'partly refunded' end;
end $$;

CREATE FUNCTION charter.payment_succeeded(_event_id text, _payment uuid, _gateway_ref text, _amount_minor integer, _currency text, _livemode boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _pay charter.payments; _p charter.member_profiles; _email text; _membership uuid; _pending boolean;
  _k text; _v jsonb; _d charter.attribute_definitions;
begin
  perform set_config('charter.payment_recording', 'on', true);
  select * into _pay from charter.payments where id = _payment for update;
  if _pay.id is null then return 'unknown payment'; end if;
  if not charter.claim_webhook_event(_pay.unit_id, _pay.gateway, _event_id, 'payment.succeeded', _pay.id) then
    return 'duplicate';
  end if;
  if _pay.status not in ('pending', 'failed') then return 'already ' || _pay.status; end if;
  if _amount_minor <> _pay.amount_minor or upper(_currency) <> _pay.currency then
    update charter.payments set status = 'failed', failure_reason = 'Amount didn''t match the price' where id = _pay.id;
    return 'amount mismatch';
  end if;
  update charter.payments set status = 'paid', gateway_ref = _gateway_ref, livemode = _livemode,
    received_on = current_date, failure_reason = null where id = _pay.id;

  if _pay.purpose = 'join' then
    -- The member's profile: their existing one, an admin-created record with their email (D-134), or a new one.
    select * into _p from charter.member_profiles where unit_id = _pay.unit_id and user_id = _pay.payer_user_id;
    if _p.id is null then
      select lower(email) into _email from auth.users where id = _pay.payer_user_id;
      select * into _p from charter.member_profiles
        where unit_id = _pay.unit_id and user_id is null and lower(email) = _email order by created_at limit 1 for update;
      if _p.id is not null then
        update charter.member_profiles set user_id = _pay.payer_user_id, claimed_at = now() where id = _p.id;
      else
        insert into charter.member_profiles (unit_id, user_id, email, source)
          values (_pay.unit_id, _pay.payer_user_id, coalesce(_email, ''), 'signup') returning * into _p;
      end if;
    end if;
    -- The answers given on the join page (validated when joining started; re-checked here).
    for _k, _v in select * from jsonb_each(_pay.join_answers) loop
      select * into _d from charter.attribute_definitions where id::text = _k and active;
      if _d.id is not null and _v is not null and _v <> 'null'::jsonb then
        begin
          perform charter.validate_attribute_value(_d, _v);
          insert into charter.attribute_values (unit_id, definition_id, entity_id, value, updated_by)
            values (_pay.unit_id, _d.id, _p.id, _v, _pay.payer_user_id)
            on conflict (definition_id, entity_id) do update set value = excluded.value, updated_at = now();
        exception when others then null; -- a field changed since; the member can fix it later
        end;
      end if;
    end loop;
    -- With two-level dues, the chapter membership waits until the national one is active (D-146).
    _pending := charter.effective_approval_required(_pay.unit_id)
      or (charter.national_dues_required(_pay.unit_id)
        and charter.national_membership_state(_pay.payer_user_id, _pay.unit_id) <> 'current');
  else
    select * into _p from charter.member_profiles where id = _pay.profile_id;
    _pending := false;
  end if;
  _membership := charter.grant_membership_term(_p.id, _pay.term_id, current_date, _pay.id, _pay.payer_user_id, _pending);
  update charter.payments set profile_id = _p.id, membership_id = _membership where id = _pay.id;
  return case when _pending then 'pending approval' else 'active' end;
end $$;

CREATE FUNCTION charter.payments_receipts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _current charter.receipts;
begin
  select * into _current from charter.receipts where payment_id = new.id and status = 'issued';
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status <> 'paid') and _current.id is null then
    perform charter.issue_receipt_internal(new.id);
  elsif tg_op = 'UPDATE' and new.status = 'refunded' and old.status <> 'refunded' and _current.id is not null then
    update charter.receipts set status = 'voided', voided_at = now(), void_reason = 'Refunded', voided_by = auth.uid()
      where id = _current.id;
  elsif tg_op = 'UPDATE' and new.status = 'paid' and new.refunded_amount_minor > old.refunded_amount_minor
        and _current.id is not null then
    update charter.receipts set status = 'superseded', voided_at = now(), void_reason = 'Partly refunded', voided_by = auth.uid()
      where id = _current.id;
    perform charter.issue_receipt_internal(new.id, _current.id);
  end if;
  return new;
end $$;

CREATE FUNCTION charter.pricing_condition_matches(_c jsonb, _values jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _d charter.attribute_definitions; _v jsonb := _values -> (_c ->> 'attribute_id');
  _op text := _c ->> 'op'; _cv text := _c ->> 'value'; _a int; _b int;
begin
  select * into _d from charter.attribute_definitions where id::text = _c ->> 'attribute_id';
  if _d.id is null or _v is null or _v in ('null'::jsonb, '""'::jsonb, '[]'::jsonb) then return false; end if;
  if jsonb_typeof(_v) = 'array' then
    if _op = 'is' then return _v ? _cv; end if;
    if _op = 'in' then
      return exists (select 1 from jsonb_array_elements_text(_v) x
        where x in (select jsonb_array_elements_text(coalesce(_c -> 'values', '[]'::jsonb))));
    end if;
    return false;
  end if;
  if _op = 'is' then
    if _d.data_type = 'number' then return (_v #>> '{}')::numeric = _cv::numeric; end if;
    return (_v #>> '{}') = _cv;
  elsif _op = 'in' then
    return (_v #>> '{}') in (select jsonb_array_elements_text(coalesce(_c -> 'values', '[]'::jsonb)));
  elsif _op in ('at_least', 'at_most') then
    if _d.data_type = 'ordered' then
      select sort_order into _a from charter.attribute_options where definition_id = _d.id and value = _v #>> '{}';
      select sort_order into _b from charter.attribute_options where definition_id = _d.id and value = _cv;
      if _a is null or _b is null then return false; end if;
      return case when _op = 'at_least' then _a >= _b else _a <= _b end;
    elsif _d.data_type = 'number' then
      return case when _op = 'at_least' then (_v #>> '{}')::numeric >= _cv::numeric
        else (_v #>> '{}')::numeric <= _cv::numeric end;
    elsif _d.data_type = 'date' then
      return case when _op = 'at_least' then (_v #>> '{}') >= _cv else (_v #>> '{}') <= _cv end;
    end if;
  end if;
  return false;
end $$;

CREATE FUNCTION charter.privacy_admin_override_allowed(_org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce((charter.ancestor_setting(_org, 'privacy.admin_override_allowed') #>> '{}')::boolean, true)
$$;

CREATE FUNCTION charter.profile_membership_id(_p charter.member_profiles) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce(
    (select m.id from charter.memberships m where m.profile_id = _p.id and m.unit_id = _p.unit_id),
    case when _p.left_at is null then _p.home_of end)
$$;

CREATE FUNCTION charter.profile_values(_profile uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce(jsonb_object_agg(v.definition_id::text, v.value), '{}'::jsonb)
  from charter.attribute_values v where _profile is not null and v.entity_id = _profile
$$;

CREATE FUNCTION charter.public_home_chapter_info(_slug text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  with o as (select * from charter.units where slug = _slug),
  r as (select n.* from charter.units n, o where n.id = coalesce(o.ancestor_ids[1], o.id))
  select case when (select id from o) is null then null else jsonb_build_object(
    'model', charter.membership_model((select id from o)),
    'org', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'type', type) from o),
    'national', (select jsonb_build_object('id', id, 'name', name, 'slug', slug) from r),
    'at_large_chapter', (select nullif(s.value #>> '{}', '') from charter.org_settings s, r
      where s.unit_id = r.id and s.key = 'membership.at_large_chapter'),
    'chapters', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) order by c.name)
      from charter.units c, r where c.type = 'chapter' and r.id = any(c.ancestor_ids)), '[]'::jsonb)
  ) end
$$;

CREATE FUNCTION charter.public_join_info(_slug text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _o charter.units; _parent charter.units; _managed boolean; _conn charter.gateway_connections;
  _national charter.units;
begin
  select * into _o from charter.units where slug = lower(trim(_slug)) and type <> 'platform';
  if _o.id is null then return null; end if;
  _managed := coalesce((charter.ancestor_setting(_o.id, 'membership.child_levels_allowed') #>> '{}')::boolean, true) = false
    or charter.ancestor_setting(_o.id, 'membership.chapter_dues') #>> '{}' = 'none';
  select * into _national from charter.units where id = charter.national_org(_o.id) and id <> _o.id;
  if _managed then select * into _parent from charter.units where id = _o.parent_id; end if;
  select * into _conn from charter.gateway_connections where unit_id = _o.id and status = 'verified';
  return jsonb_build_object(
    'org', jsonb_build_object('id', _o.id, 'name', _o.name, 'slug', _o.slug, 'type', _o.type),
    'levels_managed_by_parent', _managed,
    'parent', case when _parent.id is null then null else jsonb_build_object('name', _parent.name, 'slug', _parent.slug) end,
    'payments_enabled', _conn.id is not null,
    'gateway', _conn.gateway,
    'livemode', coalesce(_conn.livemode, false),
    'approval_required', charter.effective_approval_required(_o.id),
    -- Two-level dues (D-146): joining here also needs a current membership of the national.
    'national_dues', jsonb_build_object('required', charter.national_dues_required(_o.id),
      'national', case when _national.id is null then null
        else jsonb_build_object('id', _national.id, 'name', _national.name, 'slug', _national.slug) end),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description,
          'terms', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label,
              'length_count', x.length_count, 'length_unit', x.length_unit, 'price_minor', x.price_minor,
              'currency', x.currency,
              -- the price can depend on the member's answers (pricing rules, D-147)
              'has_rules', exists (select 1 from charter.pricing_rules r where r.term_id = x.id and r.active))
              order by x.sort_order), '[]'::jsonb)
            from charter.tier_terms x where x.tier_id = t.id and x.active)) order by t.sort_order)
      from charter.membership_tiers t where t.unit_id = _o.id and t.active), '[]'::jsonb),
    -- Fields a new member answers: required ones and ones members may edit themselves.
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'help', d.help, 'data_type', d.data_type,
          'required', d.required,
          'options', (select coalesce(jsonb_agg(jsonb_build_object('value', op.value, 'label', op.label) order by op.sort_order), '[]'::jsonb)
            from charter.attribute_options op where op.definition_id = d.id and op.active)) order by d.sort_order)
      from charter.attribute_definitions d
      where d.applies_to = 'member' and d.active and (d.required or d.member_editable)
        and (d.unit_id = _o.id or d.unit_id = any(_o.ancestor_ids))), '[]'::jsonb)
  );
end $$;

CREATE FUNCTION charter.purge_smoke_data(_since timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare
  demo uuid[] := array[
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000003']::uuid[];
  pays uuid[];
  n jsonb := '{}'::jsonb;
  c int;
begin
  if not charter.has_permission(auth.uid(), 'org.manage', demo[1]) then
    raise exception 'only a demo national admin can purge smoke data';
  end if;
  if _since is null then raise exception 'a start time is required'; end if;

  select coalesce(array_agg(id), '{}') into pays from charter.payments
    where unit_id = any(demo) and created_at >= _since;

  delete from charter.webhook_events where payment_id = any(pays);
  get diagnostics c = row_count; n := n || jsonb_build_object('webhook_events', c);

  update charter.payments set membership_id = null where id = any(pays);
  delete from charter.memberships where unit_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('memberships', c);

  delete from charter.payments where id = any(pays);
  get diagnostics c = row_count; n := n || jsonb_build_object('payments', c);

  delete from charter.receipt_counters rc where rc.unit_id = any(demo)
    and not exists (select 1 from charter.receipts r where r.unit_id = rc.unit_id and r.year = rc.year);

  delete from charter.seat_templates where unit_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('seat_templates', c);

  delete from charter.role_assignments where unit_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('role_assignments', c);

  delete from charter.member_profiles where unit_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('member_profiles', c);

  delete from charter.member_segments where unit_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('member_segments', c);

  delete from charter.tier_terms where unit_id = any(demo) and created_at >= _since;
  delete from charter.membership_tiers where unit_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('membership_tiers', c);

  delete from charter.gateway_connections where unit_id = any(demo)
    and gateway = 'test' and connected_at >= _since;

  delete from charter.audit_events where unit_id = any(demo) and created_at >= _since;
  get diagnostics c = row_count; n := n || jsonb_build_object('audit_events', c);
  -- The audit log stays append-only in spirit: the purge itself is recorded (with what it removed).
  perform charter.write_audit(demo[1], 'purge', 'smoke_data', null, null,
    n || jsonb_build_object('since', _since));
  return n;
end $$;

CREATE FUNCTION charter.quote_price(_term uuid, _answers jsonb DEFAULT '{}'::jsonb) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.tier_terms; _p uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into _t from charter.tier_terms where id = _term and active;
  if _t.id is null then raise exception 'that membership level isn''t offered here'; end if;
  select id into _p from charter.member_profiles where unit_id = _t.unit_id and user_id = auth.uid();
  return charter.term_price(_t.id, charter.profile_values(_p) || coalesce(_answers, '{}'::jsonb));
end $$;

CREATE FUNCTION charter.recalculate_planned_ends(_org uuid, _template uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _n int;
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.manage', _org) then raise exception 'not allowed'; end if;
  update charter.appointments a set planned_end = charter.seat_planned_end(_org, _template, a.starts_on, current_date)
    where a.unit_id = _org and a.template_id = _template and a.ended_on is null
      and a.planned_end is distinct from charter.seat_planned_end(_org, _template, a.starts_on, current_date);
  get diagnostics _n = row_count;
  perform charter.write_audit(_org, 'recalculate', 'appointments', _template::text, null,
    jsonb_build_object('updated', _n));
  return _n;
end $$;

CREATE FUNCTION charter.receipt_logo(_org uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  with chain as (
    select a.id, a.logo_path, array_position(o.ancestor_ids, a.id) as depth
    from charter.units o join charter.units a on a.id = any(o.ancestor_ids) where o.id = _org
    union all select id, logo_path, 1000000 from charter.units where id = _org
  ), allowed as (
    select coalesce((charter.effective_setting(_org, 'branding.chapter_logo_allowed') #>> '{}')::boolean, true) as ok
  )
  select (select jsonb_build_object('path', c.logo_path, 'unit_id', c.id) from chain c, allowed
          where c.logo_path is not null
          order by case when allowed.ok then -c.depth else c.depth end limit 1)
$$;

CREATE FUNCTION charter.receipt_snapshot(_payment uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _p charter.payments; _o charter.units; _tax charter.tax_profiles; _pr charter.member_profiles;
  _t charter.tier_terms; _tier charter.membership_tiers; _payer_email text;
begin
  select * into _p from charter.payments where id = _payment;
  select * into _o from charter.units where id = _p.unit_id;
  select * into _tax from charter.tax_profiles where unit_id = _p.unit_id;
  select * into _pr from charter.member_profiles where id = _p.profile_id;
  select * into _t from charter.tier_terms
    where id = coalesce(_p.term_id, (select term_id from charter.memberships where id = _p.membership_id));
  select * into _tier from charter.membership_tiers where id = _t.tier_id;
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
    'tax_treatment', coalesce(_tier.tax_treatment::text, 'non_deductible'),
    'tax_wording', charter.receipt_tax_wording(coalesce(_tier.tax_treatment, 'non_deductible')),
    'footer', coalesce(charter.effective_setting(_p.unit_id, 'receipts.footer') #>> '{}', ''),
    'note', _p.note
  );
end $$;

CREATE FUNCTION charter.receipt_tax_wording(_treatment charter.tax_treatment) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'charter'
    AS $$
  select case _treatment
    when 'deductible' then 'No goods or services were provided in exchange for this payment. It may be tax-deductible to the extent allowed by law.'
    when 'partial' then 'Part of this payment may be tax-deductible. Please consult your tax advisor.'
    else 'This payment is not tax-deductible as a charitable contribution.'
  end
$$;

CREATE FUNCTION charter.receipts_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'receipts can''t be deleted';
  end if;
  if old.status <> 'issued' or new.status not in ('voided', 'superseded')
     or new.number is distinct from old.number or new.snapshot is distinct from old.snapshot
     or new.payment_id is distinct from old.payment_id or new.unit_id is distinct from old.unit_id
     or new.seq is distinct from old.seq or new.year is distinct from old.year
     or new.issued_at is distinct from old.issued_at or new.supersedes_id is distinct from old.supersedes_id then
    raise exception 'receipts can''t be changed; void or reissue instead';
  end if;
  return new;
end $$;

CREATE FUNCTION charter.record_membership(_profile uuid, _term uuid, _paid_on date DEFAULT CURRENT_DATE, _amount_minor integer DEFAULT NULL::integer, _method charter.payment_method DEFAULT NULL::charter.payment_method, _note text DEFAULT ''::text, _starts_on date DEFAULT NULL::date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _p charter.member_profiles; _t charter.tier_terms; _tier charter.membership_tiers;
  _m charter.memberships; _start date; _end date; _pay uuid; _kind charter.membership_event_kind; _grace int;
begin
  select * into _p from charter.member_profiles where id = _profile;
  if _p.id is null or _uid is null or not charter.has_permission(_uid, 'members.manage', _p.unit_id) then
    raise exception 'not allowed'; end if;
  if _amount_minor is not null and not charter.has_permission(_uid, 'payments.manage', _p.unit_id) then
    raise exception 'not allowed to record payments'; end if;
  select * into _t from charter.tier_terms where id = _term;
  select * into _tier from charter.membership_tiers where id = _t.tier_id;
  -- Levels belong to the org that sells them; selling a parent's levels comes with E-18.
  if _t.id is null or _tier.unit_id <> _p.unit_id then raise exception 'that membership level isn''t offered here'; end if;
  if not (_t.active and _tier.active) then raise exception 'that membership level is retired'; end if;
  _paid_on := coalesce(_paid_on, current_date);
  _grace := charter.grace_days(_p.unit_id);
  select * into _m from charter.memberships where unit_id = _p.unit_id and profile_id = _profile for update;
  if _m.id is not null and _m.status = 'pending' then raise exception 'approve or decline the application first'; end if;
  if _m.id is not null and _m.status = 'active' and _m.lifetime then raise exception 'already a lifetime member'; end if;
  -- A new or cancelled/declined member joins; an active one (even lapsed) renews.
  _kind := case when _m.id is null or _m.status <> 'active' then 'joined' else 'renewed' end;
  _start := coalesce(_starts_on,
    case when _m.id is null then _paid_on
         else charter.renewal_start(_m.status, _m.paid_through, _m.lifetime, _grace, _paid_on) end);
  _end := charter.term_end(_start, _t.length_count, _t.length_unit);
  if _m.id is null then
    insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through, lifetime)
      values (_p.unit_id, _profile, _tier.id, _t.id, 'active', _start, _end, _t.length_unit is null)
      returning * into _m;
  else
    update charter.memberships set tier_id = _tier.id, term_id = _t.id, status = 'active',
      joined_on = case when _kind = 'joined' then _start else joined_on end,
      paid_through = _end, lifetime = _t.length_unit is null, updated_at = now()
      where id = _m.id returning * into _m;
  end if;
  if _amount_minor is not null then
    insert into charter.payments (unit_id, membership_id, profile_id, payer_user_id, purpose, amount_minor, currency,
        status, gateway, method, received_on, note, created_by)
      values (_p.unit_id, _m.id, _profile, _p.user_id, case when _kind = 'joined' then 'join' else 'renew' end::charter.payment_purpose,
        _amount_minor, _t.currency, 'paid', 'manual', coalesce(_method, 'other'), _paid_on, coalesce(_note, ''), _uid)
      returning id into _pay;
  end if;
  insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id, period_start, period_end, payment_id, note, actor_id)
    values (_p.unit_id, _m.id, _kind, _tier.id, _t.id, _start, _end, _pay, coalesce(_note, ''), _uid);
  return _m.id;
end $$;

CREATE FUNCTION charter.reissue_receipt(_receipt uuid, _reason text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _r charter.receipts; _p charter.payments;
begin
  select * into _r from charter.receipts where id = _receipt for update;
  if _r.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'payments.manage', _r.unit_id) then
    raise exception 'not allowed'; end if;
  if _r.status <> 'issued' then raise exception 'only the current receipt can be reissued'; end if;
  select * into _p from charter.payments where id = _r.payment_id;
  if _p.status <> 'paid' then raise exception 'only paid payments get receipts'; end if;
  update charter.receipts set status = 'superseded', voided_at = now(), void_reason = left(coalesce(nullif(trim(_reason), ''), 'Reissued'), 300),
    voided_by = auth.uid() where id = _receipt;
  return charter.issue_receipt_internal(_r.payment_id, _r.id);
end $$;

CREATE FUNCTION charter.remove_member_record(_profile uuid, _reason text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _p charter.member_profiles; _m charter.memberships; _cp charter.member_profiles;
begin
  select * into _p from charter.member_profiles where id = _profile for update;
  if _p.id is null or _uid is null or not charter.has_permission(_uid, 'members.manage', _p.unit_id) then
    raise exception 'not allowed'; end if;
  if _p.left_at is not null then raise exception 'already removed from the roster'; end if;
  if _p.home_of is not null then
    raise exception 'members choose their own chapter; move them from the national''s Members page';
  end if;
  if _p.user_id is not null and _p.user_id = _uid then raise exception 'you can''t remove yourself'; end if;
  if _p.user_id is not null and exists (select 1 from charter.role_assignments ra join charter.roles r on r.id = ra.role_id
      where ra.user_id = _p.user_id and ra.unit_id = _p.unit_id and ra.source <> 'seat'
        and not (r.key = 'member' and r.unit_id is null)) then
    raise exception 'they hold a role here; remove it on Settings → Roles first';
  end if;
  if char_length(coalesce(_reason, '')) > 300 then raise exception 'keep the reason under 300 characters'; end if;

  -- Their membership here ends (a pending application is declined); the history stays.
  select * into _m from charter.memberships where unit_id = _p.unit_id and profile_id = _p.id for update;
  if _m.id is not null and _m.status in ('active', 'pending') then
    update charter.memberships set status = case when _m.status = 'pending' then 'declined' else 'cancelled' end::charter.membership_status,
      updated_at = now() where id = _m.id;
    insert into charter.membership_events (unit_id, membership_id, kind, tier_id, term_id, note, actor_id)
      values (_m.unit_id, _m.id, case when _m.status = 'pending' then 'declined' else 'cancelled' end::charter.membership_event_kind,
        _m.tier_id, _m.term_id, trim('Removed from the roster. ' || coalesce(_reason, '')), _uid);
  end if;

  -- This record, and in the home-chapter model the chapter record that stands for it: seats end
  -- (removing only the roles those seats gave) and the record leaves.
  for _cp in select * from charter.member_profiles
      where left_at is null and (id = _p.id or (_m.id is not null and home_of = _m.id)) loop
    delete from charter.role_assignments where id in (select a.role_assignment_id from charter.appointments a
      where a.profile_id = _cp.id and a.ended_on is null and a.role_assignment_id is not null);
    update charter.appointments set ended_on = greatest(current_date, starts_on), end_reason = 'removed from roster',
        ended_by = _uid
      where profile_id = _cp.id and ended_on is null;
    update charter.member_profiles set left_at = now() where id = _cp.id;
  end loop;
  if _m.id is not null and _m.home_org_id is not null then
    insert into charter.affiliation_history (unit_id, membership_id, from_org_id, to_org_id, changed_by)
      values (_m.unit_id, _m.id, _m.home_org_id, null, _uid);
    update charter.memberships set home_org_id = null where id = _m.id;
  end if;
  if _p.user_id is not null then
    delete from charter.role_assignments ra using charter.roles r
      where r.id = ra.role_id and r.key = 'member' and r.unit_id is null
        and ra.user_id = _p.user_id and ra.unit_id = _p.unit_id;
  end if;
  perform charter.write_audit(_p.unit_id, 'remove', 'org_member_profiles', _p.id::text, null,
    jsonb_build_object('display_name', _p.display_name, 'email', _p.email, 'reason', coalesce(_reason, '')));
end $$;

CREATE FUNCTION charter.remove_role(_assignment uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _a charter.role_assignments; _key text; _parent uuid; _admins int;
begin
  select * into _a from charter.role_assignments where id = _assignment;
  if _a.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'roles.manage', _a.unit_id) then
    raise exception 'not allowed';
  end if;
  select key into _key from charter.roles where id = _a.role_id;
  select parent_id into _parent from charter.units where id = _a.unit_id;
  if _key = 'org_admin' and _parent is null then
    select count(*) into _admins from charter.role_assignments ra join charter.roles r on r.id = ra.role_id
      where ra.unit_id = _a.unit_id and r.key = 'org_admin';
    if _admins <= 1 then raise exception 'an organization must keep at least one admin'; end if;
  end if;
  delete from charter.role_assignments where id = _assignment;
end $$;

CREATE FUNCTION charter.renewal_start(_status charter.membership_status, _paid_through date, _lifetime boolean, _grace integer, _today date) RETURNS date
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'charter'
    AS $$
  select case
    when _status = 'active' and not _lifetime and _paid_through is not null
      and charter.membership_standing(_status, _paid_through, _lifetime, _grace, _today) in ('good', 'grace')
      then _paid_through + 1
    else _today end
$$;

CREATE FUNCTION charter.resolve_role(_org uuid, _key text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select r.id from charter.roles r
  where r.key = _key and r.active and charter.role_applies_at(r, _org)
  order by r.unit_id is null, r.created_at desc limit 1
$$;

CREATE FUNCTION charter.restore_member_record(_profile uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _p charter.member_profiles;
begin
  select * into _p from charter.member_profiles where id = _profile for update;
  if _p.id is null or _uid is null or not charter.has_permission(_uid, 'members.manage', _p.unit_id) then
    raise exception 'not allowed'; end if;
  if _p.left_at is null then raise exception 'they''re on the roster'; end if;
  if _p.home_of is not null then
    raise exception 'members choose their own chapter; move them from the national''s Members page';
  end if;
  if exists (select 1 from charter.member_profiles where unit_id = _p.unit_id and id <> _p.id and left_at is null
      and ((_p.user_id is not null and user_id = _p.user_id)
        or (_p.email <> '' and lower(email) = lower(_p.email)))) then
    raise exception 'someone with that login or email is already on the roster';
  end if;
  update charter.member_profiles set left_at = null where id = _p.id;
  if _p.user_id is not null then
    insert into charter.role_assignments (user_id, role_id, unit_id, source)
      select _p.user_id, r.id, _p.unit_id, 'manual' from charter.roles r where r.key = 'member' and r.unit_id is null
      on conflict do nothing;
  end if;
  perform charter.write_audit(_p.unit_id, 'restore', 'org_member_profiles', _p.id::text, null,
    jsonb_build_object('display_name', _p.display_name, 'email', _p.email));
end $$;

CREATE FUNCTION charter.role_applies_at(_role charter.roles, _org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select _role.unit_id is null or _role.unit_id = _org
    or exists (select 1 from charter.units o where o.id = _org and _role.unit_id = any(o.ancestor_ids))
$$;

CREATE FUNCTION charter.save_pricing_rule(_term uuid, _rule uuid, _label text, _conditions jsonb, _price_minor integer, _discount_pct integer, _sort_order integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.tier_terms; _r charter.pricing_rules; _id uuid; _min int; _max int;
begin
  select * into _t from charter.tier_terms where id = _term;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'tiers.manage', _t.unit_id) then
    raise exception 'not allowed';
  end if;
  if (_price_minor is null) = (_discount_pct is null) then raise exception 'give either a price or a discount'; end if;
  perform charter.validate_pricing_conditions(_t.unit_id, coalesce(_conditions, '[]'::jsonb));
  -- a chapter's rule prices stay within its national's range too (D-146)
  if _price_minor is not null and exists (select 1 from charter.units where id = _t.unit_id and parent_id is not null) then
    _min := nullif((charter.ancestor_setting(_t.unit_id, 'membership.chapter_dues_min_minor') #>> '{}')::int, 0);
    _max := nullif((charter.ancestor_setting(_t.unit_id, 'membership.chapter_dues_max_minor') #>> '{}')::int, 0);
    if (_min is not null and _price_minor < _min) or (_max is not null and _price_minor > _max) then
      raise exception 'chapter dues must be between % and % (set by your national)',
        coalesce(to_char(_min / 100.0, 'FM999999990.00'), '0.00'), coalesce(to_char(_max / 100.0, 'FM999999990.00'), 'any amount');
    end if;
  end if;
  if _rule is null then
    insert into charter.pricing_rules (unit_id, term_id, label, conditions, price_minor, discount_pct, sort_order, created_by)
      values (_t.unit_id, _t.id, coalesce(trim(_label), ''), coalesce(_conditions, '[]'::jsonb), _price_minor, _discount_pct,
        coalesce(_sort_order, 0), auth.uid())
      returning id into _id;
    return _id;
  end if;
  select * into _r from charter.pricing_rules where id = _rule and term_id = _term;
  if _r.id is null then raise exception 'not allowed'; end if;
  update charter.pricing_rules set label = coalesce(trim(_label), ''), conditions = coalesce(_conditions, '[]'::jsonb),
    price_minor = _price_minor, discount_pct = _discount_pct, sort_order = coalesce(_sort_order, 0)
    where id = _rule;
  return _rule;
end $$;

CREATE FUNCTION charter.save_stripe_connection(_org uuid, _sealed text, _account_label text, _livemode boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $_$
begin
  if auth.uid() is null or not charter.has_permission(auth.uid(), 'payments.manage', _org) then raise exception 'not allowed'; end if;
  if _sealed !~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then raise exception 'credentials must be sealed'; end if;
  insert into charter.gateway_secrets (unit_id, sealed) values (_org, _sealed)
    on conflict (unit_id) do update set sealed = excluded.sealed, updated_at = now();
  insert into charter.gateway_connections (unit_id, gateway, status, account_label, livemode, connected_by)
    values (_org, 'stripe', 'verified', left(coalesce(_account_label, 'Stripe'), 120), coalesce(_livemode, false), auth.uid())
    on conflict (unit_id) do update set gateway = 'stripe', status = 'verified', account_label = excluded.account_label,
      livemode = excluded.livemode, connected_by = auth.uid(), connected_at = now();
end $_$;

CREATE FUNCTION charter.seat_applies_at(_t charter.seat_templates, _org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select case _t.scope::text
    when 'self' then _t.unit_id = _org
    when 'self_and_chapters' then _t.unit_id = _org
      or exists (select 1 from charter.units o where o.id = _org and _t.unit_id = any(o.ancestor_ids))
    else exists (select 1 from charter.units o where o.id = _org and _t.unit_id = any(o.ancestor_ids)) end
$$;

CREATE FUNCTION charter.seat_planned_end(_org uuid, _template uuid, _starts_on date, _rule_on date) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select charter.term_end(_starts_on, f.length_count, f.length_unit)
  from charter.seat_term_in_force(_org, _template, _rule_on) f
$$;

CREATE FUNCTION charter.seat_template_check(_org uuid, _term_count integer, _term_unit charter.term_unit, _role uuid, _scope charter.seat_scope) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _o charter.units; _r charter.roles;
begin
  select * into _o from charter.units where id = _org;
  if _scope::text in ('chapters', 'self_and_chapters') and _o.type not in ('national', 'region') then
    raise exception 'only a national or region can define seats for its chapters';
  end if;
  if (_term_count is null) <> (_term_unit is null) or (_term_count is not null and _term_count not between 1 and 100) then
    raise exception 'give the term as a number and a unit, or leave it open';
  end if;
  if _role is not null then
    select * into _r from charter.roles where id = _role;
    if _r.id is null or not _r.active or not charter.role_applies_at(_r, _org) then raise exception 'unknown role'; end if;
    if not charter.holds_all_role_permissions(auth.uid(), _role, _org) then
      raise exception 'you can only grant permissions you hold';
    end if;
  end if;
end $$;

CREATE FUNCTION charter.seat_term_in_force(_org uuid, _template uuid, _on date) RETURNS TABLE(length_count integer, length_unit charter.term_unit, source text, term_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select x.length_count, x.length_unit, x.source, x.term_id from (
    (select st.length_count, st.length_unit, 'org'::text as source, st.id as term_id, 0 as prio
      from charter.seat_terms st
      where st.unit_id = _org and st.template_id = _template and st.effective_from <= _on
      order by st.effective_from desc, st.created_at desc limit 1)
    union all
    select t.default_term_count, t.default_term_unit, 'default'::text, null::uuid, 1
      from charter.seat_templates t where t.id = _template
  ) x order by x.prio limit 1
$$;

CREATE FUNCTION charter.seat_terms_append_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'term rules can''t be changed; add a new term with its effective date';
end $$;

CREATE FUNCTION charter.set_attribute_value(_def uuid, _entity uuid, _value jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _d charter.attribute_definitions; _org uuid; _owner uuid; _uid uuid := auth.uid(); _anc uuid[];
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select * into _d from charter.attribute_definitions where id = _def and active;
  if _d.id is null then raise exception 'unknown attribute'; end if;
  if _d.applies_to = 'member' then
    select p.unit_id, p.user_id into _org, _owner from charter.member_profiles p where p.id = _entity;
    if _org is null then raise exception 'unknown member'; end if;
    select ancestor_ids into _anc from charter.units where id = _org;
    if not (_org = _d.unit_id or _d.unit_id = any(_anc)) then raise exception 'attribute does not apply here'; end if;
    if not (charter.has_permission(_uid, 'members.manage', _org) or (_owner = _uid and _d.member_editable)) then
      raise exception 'not allowed'; end if;
  else
    _org := _entity;
    select ancestor_ids into _anc from charter.units where id = _org;
    if _anc is null or not (_d.unit_id = any(_anc)) then raise exception 'attribute does not apply here'; end if;
    if not charter.has_permission(_uid, 'org.manage', _org) then raise exception 'not allowed'; end if;
    if _d.locked and not charter.has_permission(_uid, 'org.manage', _d.unit_id) then
      raise exception 'this field is locked by your national organization';
    end if;
  end if;
  if _value is null or _value = 'null'::jsonb then
    if _d.required then raise exception '% is required', _d.label; end if;
    delete from charter.attribute_values where definition_id = _def and entity_id = _entity;
    return;
  end if;
  perform charter.validate_attribute_value(_d, _value);
  insert into charter.attribute_values (unit_id, definition_id, entity_id, value, updated_by)
    values (_org, _def, _entity, _value, _uid)
    on conflict (definition_id, entity_id) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end $$;

CREATE FUNCTION charter.set_checkout_ref(_payment uuid, _ref text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  update charter.payments set checkout_ref = left(_ref, 255)
    where id = _payment and payer_user_id = auth.uid() and status in ('pending', 'failed');
  if not found then raise exception 'not allowed'; end if;
end $$;

CREATE FUNCTION charter.set_home_chapter(_national uuid, _chapter uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _m uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.id into _m from charter.memberships m join charter.member_profiles p on p.id = m.profile_id
    where m.unit_id = _national and p.user_id = auth.uid();
  if _m is null then raise exception 'join first'; end if;
  perform charter.move_home_chapter(_m, _chapter);
end $$;

CREATE FUNCTION charter.set_linked_level_price(_tier uuid, _rule text, _value integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _t charter.membership_tiers;
begin
  select * into _t from charter.membership_tiers where id = _tier;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'tiers.manage', _t.unit_id) then
    raise exception 'not allowed';
  end if;
  if _t.link_mode is distinct from 'linked' then raise exception 'only a linked level has a price rule'; end if;
  if coalesce(_rule, 'same') not in ('same', 'minus_amount', 'minus_percent') or coalesce(_value, 0) < 0
     or (_rule = 'minus_percent' and _value > 100) then
    raise exception 'choose the same price, an amount off or a percentage off';
  end if;
  perform set_config('app.level_link', 'on', true);
  update charter.membership_tiers set price_rule = coalesce(_rule, 'same'),
      price_value = case when coalesce(_rule, 'same') <> 'same' then coalesce(_value, 0) end
    where id = _tier;
  perform set_config('app.level_link', _prev, true);
  perform charter.sync_linked_level(_tier);
end $$;

CREATE FUNCTION charter.set_member_home_chapter(_membership uuid, _chapter uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _org uuid;
begin
  select unit_id into _org from charter.memberships where id = _membership;
  if _org is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'members.manage', _org) then
    raise exception 'not allowed';
  end if;
  perform charter.move_home_chapter(_membership, _chapter);
end $$;

CREATE FUNCTION charter.set_my_directory_listing(_org uuid, _listed boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  update charter.member_profiles set directory_listed = _listed
    where unit_id = _org and user_id = auth.uid();
  if not found then raise exception 'not a member'; end if;
end $$;

CREATE FUNCTION charter.set_org_ancestors() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if new.parent_id is null then
    new.ancestor_ids := '{}';
  else
    select o.ancestor_ids || o.id into new.ancestor_ids from charter.units o where o.id = new.parent_id;
    if new.id = any(new.ancestor_ids) then raise exception 'cycle in org hierarchy'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

CREATE FUNCTION charter.set_pricing_rule_active(_rule uuid, _active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _r charter.pricing_rules;
begin
  select * into _r from charter.pricing_rules where id = _rule;
  if _r.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'tiers.manage', _r.unit_id) then
    raise exception 'not allowed';
  end if;
  update charter.pricing_rules set active = _active where id = _rule;
end $$;

CREATE FUNCTION charter.set_role_active(_role uuid, _active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _r charter.roles;
begin
  select * into _r from charter.roles where id = _role;
  if _r.id is null or _r.unit_id is null or auth.uid() is null
     or not charter.has_permission(auth.uid(), 'roles.manage', _r.unit_id) then raise exception 'not allowed'; end if;
  if not _active and exists (select 1 from charter.role_assignments where role_id = _role) then
    raise exception 'remove this role from everyone before retiring it';
  end if;
  if not _active and exists (select 1 from public.invitations where app = 'charter'
      and app_payload ->> 'role_id' = _role::text
      and accepted_at is null and revoked_at is null and expires_at > now()) then
    raise exception 'revoke pending invitations for this role before retiring it';
  end if;
  update charter.roles set active = _active where id = _role;
end $$;

CREATE FUNCTION charter.set_seat_active(_template uuid, _active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.seat_templates;
begin
  select * into _t from charter.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.define', _t.unit_id) then
    raise exception 'not allowed';
  end if;
  if not _active and exists (select 1 from charter.appointments where template_id = _template and ended_on is null) then
    raise exception 'end the current appointments before retiring this seat';
  end if;
  update charter.seat_templates set active = _active where id = _template;
end $$;

CREATE FUNCTION charter.set_seat_contact(_org uuid, _template uuid, _role_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $_$
declare _t charter.seat_templates; _clean text := nullif(lower(trim(coalesce(_role_email, ''))), '');
begin
  select * into _t from charter.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.manage', _org)
     or not charter.seat_applies_at(_t, _org) then raise exception 'not allowed'; end if;
  if _clean is not null and (char_length(_clean) > 254 or _clean !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'enter a valid email address';
  end if;
  insert into charter.seat_contacts (unit_id, template_id, role_email, updated_by)
    values (_org, _template, _clean, auth.uid())
    on conflict (unit_id, template_id) do update
      set role_email = excluded.role_email, updated_by = excluded.updated_by, updated_at = now();
end $_$;

CREATE FUNCTION charter.set_seat_scope(_template uuid, _scope charter.seat_scope) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.seat_templates;
begin
  select * into _t from charter.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.define', _t.unit_id) then
    raise exception 'not allowed';
  end if;
  if _scope is null then raise exception 'pick who uses this seat'; end if;
  perform charter.seat_template_check(_t.unit_id, null, null, null, _scope);
  _t.scope := _scope;
  if exists (select 1 from charter.appointments a where a.template_id = _template and a.ended_on is null
             and not charter.seat_applies_at(_t, a.unit_id)) then
    raise exception 'end the current terms where this seat would no longer be used';
  end if;
  update charter.seat_templates set scope = _scope where id = _template;
end $$;

CREATE FUNCTION charter.set_seat_term(_org uuid, _template uuid, _count integer, _unit charter.term_unit, _effective_from date, _bylaw_reference text DEFAULT ''::text, _note text DEFAULT ''::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.seat_templates; _id uuid;
begin
  select * into _t from charter.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.manage', _org)
     or not charter.seat_applies_at(_t, _org) then raise exception 'not allowed'; end if;
  if _effective_from is null then raise exception 'give the date the term takes effect'; end if;
  if (_count is null) <> (_unit is null) or (_count is not null and _count not between 1 and 100) then
    raise exception 'give the term as a number and a unit, or leave it open';
  end if;
  insert into charter.seat_terms (unit_id, template_id, length_count, length_unit, effective_from,
      bylaw_reference, note, set_by)
    values (_org, _template, _count, _unit, _effective_from, coalesce(trim(_bylaw_reference), ''),
      coalesce(trim(_note), ''), auth.uid())
    returning id into _id;
  return _id;
end $$;

CREATE FUNCTION charter.set_seat_title(_org uuid, _template uuid, _title text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.seat_templates; _clean text := nullif(trim(coalesce(_title, '')), '');
begin
  select * into _t from charter.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.manage', _org)
     or not charter.seat_applies_at(_t, _org) then raise exception 'not allowed'; end if;
  if _t.unit_id = _org then raise exception 'rename your own seats in the seat editor'; end if;
  if _clean is not null and charter.ancestor_setting(_org, 'governance.custom_titles_allowed') = 'false'::jsonb then
    raise exception 'your parent organization sets the seat titles';
  end if;
  insert into charter.seat_title_overrides (unit_id, template_id, title) values (_org, _template, _clean)
    on conflict (unit_id, template_id) do update set title = excluded.title, updated_at = now();
end $$;

CREATE FUNCTION charter.sync_linked_level(_tier uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _prev text := coalesce(current_setting('app.level_link', true), ''); _c charter.membership_tiers; _s charter.membership_tiers; _st charter.tier_terms; _k text; _n int;
begin
  select * into _c from charter.membership_tiers where id = _tier;
  if _c.link_mode is distinct from 'linked' or _c.source_tier_id is null then return; end if;
  select * into _s from charter.membership_tiers where id = _c.source_tier_id;
  perform set_config('app.level_link', 'on', true);
  update charter.membership_tiers set name = _s.name, description = _s.description, tax_treatment = _s.tax_treatment,
      active = _c.active and _s.active
    where id = _c.id;
  for _st in select * from charter.tier_terms where tier_id = _s.id loop
    if exists (select 1 from charter.tier_terms where tier_id = _c.id and source_term_id = _st.id) then
      update charter.tier_terms set label = _st.label, length_count = _st.length_count, length_unit = _st.length_unit,
          currency = _st.currency, sort_order = _st.sort_order, active = _st.active,
          price_minor = charter.linked_price(_c.unit_id, _st.price_minor, _c.price_rule, _c.price_value)
        where tier_id = _c.id and source_term_id = _st.id;
    elsif _st.active then
      _k := _st.key; _n := 1;
      while exists (select 1 from charter.tier_terms where tier_id = _c.id and key = _k) loop
        _n := _n + 1; _k := left(_st.key, 44) || '_' || _n;
      end loop;
      insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, currency,
          sort_order, source_term_id)
        values (_c.id, _c.unit_id, _k, _st.label, _st.length_count, _st.length_unit,
          charter.linked_price(_c.unit_id, _st.price_minor, _c.price_rule, _c.price_value), _st.currency, _st.sort_order, _st.id);
    end if;
  end loop;
  perform set_config('app.level_link', _prev, true);
end $$;

CREATE FUNCTION charter.sync_linked_levels_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _src uuid; _c uuid;
begin
  _src := case when tg_table_name = 'membership_tiers' then new.id else (to_jsonb(new)->>'tier_id')::uuid end;
  for _c in select id from charter.membership_tiers where source_tier_id = _src and link_mode = 'linked' loop
    perform charter.sync_linked_level(_c);
  end loop;
  return null;
end $$;

CREATE FUNCTION charter.sync_my_email() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _email text; _n int;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select lower(email) into _email from auth.users where id = _uid;
  if coalesce(_email, '') = '' then return 0; end if;
  update charter.member_profiles set email = _email
    where user_id = _uid and email is distinct from _email;
  get diagnostics _n = row_count;
  return _n;
end $$;

CREATE FUNCTION charter.term_end(_start date, _count integer, _unit charter.term_unit) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'charter'
    AS $$
declare _months int; _target date; _last int; _day int := extract(day from _start)::int;
begin
  if _count is null or _unit is null then return null; end if;
  if _unit = 'day' then return _start + (_count - 1); end if;
  _months := case when _unit = 'year' then _count * 12 else _count end;
  _target := (date_trunc('month', _start) + make_interval(months => _months))::date;
  _last := extract(day from (_target + interval '1 month' - interval '1 day'))::int;
  if _day > _last then return _target + (_last - 1); end if;
  return _target + (_day - 2);
end $$;

CREATE FUNCTION charter.term_price(_term uuid, _values jsonb) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce((
    select case when r.price_minor is not null then r.price_minor
      else round(t.price_minor * (100 - r.discount_pct) / 100.0)::int end
    from charter.pricing_rules r
    where r.term_id = t.id and r.active
      and not exists (select 1 from jsonb_array_elements(r.conditions) c
        where not charter.pricing_condition_matches(c, coalesce(_values, '{}'::jsonb)))
    order by r.sort_order, r.created_at limit 1), t.price_minor)
  from charter.tier_terms t where t.id = _term
$$;

CREATE FUNCTION charter.test_gateway_allowed(_org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  select coalesce((select is_demo from charter.units where id = _org), false)
    or coalesce((select (value #>> '{}')::boolean from charter.platform_flags where key = 'test_gateway_everywhere'), false)
$$;

CREATE FUNCTION charter.tier_identity_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'charter'
    AS $$
begin
  if new.unit_id is distinct from old.unit_id or new.key is distinct from old.key then
    raise exception 'a level''s organization and key can''t be changed';
  end if;
  if tg_table_name = 'tier_terms' then
    -- nested: plpgsql would read new.tier_id even on membership_tiers in a combined condition
    if (to_jsonb(new)->>'tier_id') is distinct from (to_jsonb(old)->>'tier_id') then
      raise exception 'a term can''t move to another level';
    end if;
  end if;
  return new;
end $$;

CREATE FUNCTION charter.tier_parent_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    if charter.membership_model(new.unit_id) = 'home_chapter'
       and (select parent_id from charter.units where id = new.unit_id) is not null then
      raise exception 'members belong to the national organization; chapters don''t have their own membership levels';
    end if;
    if charter.ancestor_setting(new.unit_id, 'membership.child_levels_allowed') = 'false'::jsonb
       or charter.ancestor_setting(new.unit_id, 'membership.chapter_dues') #>> '{}' = 'none' then
      raise exception 'your parent organization manages membership levels';
    end if;
  end if;
  return new;
end $$;

CREATE FUNCTION charter.tier_term_org_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
begin
  select unit_id into new.unit_id from charter.membership_tiers where id = new.tier_id;
  return new;
end $$;

CREATE FUNCTION charter.update_member_record(_profile uuid, _display_name text, _email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $_$
declare _p charter.member_profiles; _mail text := lower(trim(coalesce(_email, '')));
begin
  select * into _p from charter.member_profiles where id = _profile;
  if _p.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'members.manage', _p.unit_id) then
    raise exception 'not allowed'; end if;
  if _p.user_id is not null then raise exception 'this member manages their own name and email'; end if;
  if char_length(trim(coalesce(_display_name, ''))) not between 1 and 120 then raise exception 'give the member a name'; end if;
  if _mail <> '' and _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if _mail <> '' and exists (select 1 from charter.member_profiles
      where unit_id = _p.unit_id and lower(email) = _mail and id <> _profile) then
    raise exception 'someone with that email is already a member';
  end if;
  update charter.member_profiles set display_name = trim(_display_name), email = _mail where id = _profile;
end $_$;

CREATE FUNCTION charter.update_role(_role uuid, _name text, _description text, _perms text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _uid uuid := auth.uid(); _r charter.roles; _before text[]; _added text[];
begin
  select * into _r from charter.roles where id = _role;
  if _r.id is null or _r.unit_id is null or _uid is null
     or not charter.has_permission(_uid, 'roles.manage', _r.unit_id) then raise exception 'not allowed'; end if;
  select coalesce(array_agg(permission_key order by permission_key), '{}') into _before
    from charter.role_permissions where role_id = _role;
  select coalesce(array_agg(p), '{}') into _added from unnest(coalesce(_perms, '{}')) p where p <> all(_before);
  perform charter.check_role_permissions(_uid, _r.unit_id, _added);
  update charter.roles set name = trim(_name), description = coalesce(trim(_description), '') where id = _role;
  delete from charter.role_permissions where role_id = _role and permission_key <> all(coalesce(_perms, '{}'));
  insert into charter.role_permissions (role_id, permission_key)
    select _role, p from unnest(_added) p on conflict do nothing;
  perform charter.write_audit(_r.unit_id, 'update', 'role_permissions', _role::text, to_jsonb(_before), to_jsonb(coalesce(_perms, '{}')));
end $$;

CREATE FUNCTION charter.update_seat(_template uuid, _title text, _description text, _required boolean, _seat_count integer, _term_count integer, _term_unit charter.term_unit, _role uuid, _sort_order integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _t charter.seat_templates;
begin
  select * into _t from charter.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'governance.define', _t.unit_id) then
    raise exception 'not allowed';
  end if;
  perform charter.seat_template_check(_t.unit_id, _term_count, _term_unit,
    case when _role is distinct from _t.role_id then _role end, _t.scope);
  if exists (select 1 from charter.appointments where template_id = _template and ended_on is null and seat_number > _seat_count) then
    raise exception 'end the appointments in the seats you''re removing first';
  end if;
  update charter.seat_templates set title = trim(_title), description = coalesce(trim(_description), ''),
    required = _required, seat_count = _seat_count, default_term_count = _term_count,
    default_term_unit = _term_unit, role_id = _role, sort_order = _sort_order
    where id = _template;
end $$;

CREATE FUNCTION charter.validate_attribute_value(_def charter.attribute_definitions, _v jsonb) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $_$
declare _el jsonb;
begin
  case _def.data_type
    when 'text' then
      if jsonb_typeof(_v) <> 'string' or char_length(_v #>> '{}') > 2000 then raise exception 'invalid value for %', _def.label; end if;
    when 'number' then
      if jsonb_typeof(_v) <> 'number' then raise exception 'invalid value for %', _def.label; end if;
    when 'boolean' then
      if jsonb_typeof(_v) <> 'boolean' then raise exception 'invalid value for %', _def.label; end if;
    when 'date' then
      if jsonb_typeof(_v) <> 'string' or (_v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid value for %', _def.label; end if;
      perform (_v #>> '{}')::date;
    when 'choice', 'ordered' then
      if jsonb_typeof(_v) <> 'string' or not exists (select 1 from charter.attribute_options o
          where o.definition_id = _def.id and o.value = _v #>> '{}' and o.active) then
        raise exception 'invalid value for %', _def.label; end if;
    when 'multi_choice' then
      if jsonb_typeof(_v) <> 'array' then raise exception 'invalid value for %', _def.label; end if;
      if (select count(*) from jsonb_array_elements(_v)) <> (select count(distinct e) from jsonb_array_elements(_v) e) then
        raise exception 'invalid value for %', _def.label; end if;
      for _el in select * from jsonb_array_elements(_v) loop
        if jsonb_typeof(_el) <> 'string' or not exists (select 1 from charter.attribute_options o
            where o.definition_id = _def.id and o.value = _el #>> '{}' and o.active) then
          raise exception 'invalid value for %', _def.label; end if;
      end loop;
  end case;
end $_$;

CREATE FUNCTION charter.validate_join_answers(_org uuid, _answers jsonb) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _d charter.attribute_definitions; _o charter.units; _k text; _v jsonb;
begin
  select * into _o from charter.units where id = _org;
  if jsonb_typeof(coalesce(_answers, '{}'::jsonb)) <> 'object' then raise exception 'invalid answers'; end if;
  for _k, _v in select * from jsonb_each(coalesce(_answers, '{}'::jsonb)) loop
    select * into _d from charter.attribute_definitions where id::text = _k and active and applies_to = 'member'
      and (unit_id = _org or unit_id = any(_o.ancestor_ids)) and (required or member_editable);
    if _d.id is null then raise exception 'unknown field'; end if;
    if _v is not null and _v <> 'null'::jsonb then perform charter.validate_attribute_value(_d, _v); end if;
  end loop;
  for _d in select * from charter.attribute_definitions where active and applies_to = 'member' and required
      and (unit_id = _org or unit_id = any(_o.ancestor_ids)) loop
    if not (coalesce(_answers, '{}'::jsonb) ? _d.id::text) or _answers -> _d.id::text = 'null'::jsonb then
      raise exception '% is required', _d.label;
    end if;
  end loop;
end $$;

CREATE FUNCTION charter.validate_pricing_conditions(_org uuid, _conditions jsonb) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'charter'
    AS $_$
declare _c jsonb; _d charter.attribute_definitions; _o charter.units; _op text; _vals text[];
begin
  select * into _o from charter.units where id = _org;
  if jsonb_typeof(_conditions) <> 'array' or jsonb_array_length(_conditions) > 10 then raise exception 'invalid conditions'; end if;
  for _c in select * from jsonb_array_elements(_conditions) loop
    select * into _d from charter.attribute_definitions where id::text = _c ->> 'attribute_id' and active
      and applies_to = 'member' and (unit_id = _org or unit_id = any(_o.ancestor_ids));
    if _d.id is null then raise exception 'unknown field'; end if;
    _op := _c ->> 'op';
    if not (_op = 'is' or (_op = 'in' and _d.data_type in ('choice', 'multi_choice', 'ordered'))
        or (_op in ('at_least', 'at_most') and _d.data_type in ('ordered', 'number', 'date'))) then
      raise exception '% can''t be compared that way', _d.label;
    end if;
    _vals := case when _op = 'in' then array(select jsonb_array_elements_text(coalesce(_c -> 'values', '[]'::jsonb)))
      else array[_c ->> 'value'] end;
    if coalesce(array_length(_vals, 1), 0) = 0 or exists (select 1 from unnest(_vals) x where x is null or x = '') then
      raise exception 'pick a value for each condition';
    end if;
    if _d.data_type in ('choice', 'multi_choice', 'ordered') and exists (select 1 from unnest(_vals) x
        where not exists (select 1 from charter.attribute_options op where op.definition_id = _d.id and op.value = x and op.active)) then
      raise exception '% has no such choice', _d.label;
    end if;
    if _d.data_type = 'number' and exists (select 1 from unnest(_vals) x where x !~ '^-?\d+(\.\d+)?$') then
      raise exception '% needs a number', _d.label;
    end if;
    if _d.data_type = 'date' and exists (select 1 from unnest(_vals) x where x !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception '% needs a date', _d.label;
    end if;
    if _d.data_type = 'boolean' and exists (select 1 from unnest(_vals) x where x not in ('true', 'false')) then
      raise exception '% needs yes or no', _d.label;
    end if;
  end loop;
end $_$;

CREATE FUNCTION charter.void_receipt(_receipt uuid, _reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
declare _r charter.receipts;
begin
  select * into _r from charter.receipts where id = _receipt for update;
  if _r.id is null or auth.uid() is null or not charter.has_permission(auth.uid(), 'payments.manage', _r.unit_id) then
    raise exception 'not allowed'; end if;
  if _r.status <> 'issued' then raise exception 'only issued receipts can be voided'; end if;
  if char_length(trim(coalesce(_reason, ''))) = 0 then raise exception 'give a reason'; end if;
  update charter.receipts set status = 'voided', voided_at = now(), void_reason = left(trim(_reason), 300), voided_by = auth.uid()
    where id = _receipt;
end $$;

CREATE FUNCTION charter.write_audit(_org uuid, _action text, _target_type text, _target_id text, _before jsonb, _after jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'charter'
    AS $$
  insert into charter.audit_events (unit_id, actor_id, action, target_type, target_id, before, after)
  values (_org, auth.uid(), _action, _target_type, _target_id, _before, _after)
$$;

-- Triggers ------------------------------------------------------------------------------

CREATE TRIGGER affiliation_history_append_only BEFORE DELETE OR UPDATE ON charter.affiliation_history FOR EACH ROW EXECUTE FUNCTION charter.affiliation_history_append_only();

CREATE TRIGGER appointments_guard BEFORE DELETE OR UPDATE ON charter.appointments FOR EACH ROW EXECUTE FUNCTION charter.appointments_guard();

CREATE TRIGGER attribute_definitions_subject BEFORE INSERT OR UPDATE ON charter.attribute_definitions FOR EACH ROW EXECUTE FUNCTION charter.attribute_definition_subject_check();

CREATE TRIGGER attribute_options_org BEFORE INSERT ON charter.attribute_options FOR EACH ROW EXECUTE FUNCTION charter.attribute_option_org_check();

CREATE TRIGGER audit_affiliation_history AFTER INSERT OR DELETE OR UPDATE ON charter.affiliation_history FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_appointments AFTER INSERT OR DELETE OR UPDATE ON charter.appointments FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_attribute_definitions AFTER INSERT OR DELETE OR UPDATE ON charter.attribute_definitions FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_attribute_options AFTER INSERT OR DELETE OR UPDATE ON charter.attribute_options FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_attribute_values AFTER INSERT OR DELETE OR UPDATE ON charter.attribute_values FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_gateway_connections AFTER INSERT OR DELETE OR UPDATE ON charter.gateway_connections FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_member_segments AFTER INSERT OR DELETE OR UPDATE ON charter.member_segments FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_membership_tiers AFTER INSERT OR DELETE OR UPDATE ON charter.membership_tiers FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_memberships AFTER INSERT OR DELETE OR UPDATE ON charter.memberships FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_org_settings AFTER INSERT OR DELETE OR UPDATE ON charter.org_settings FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_organizations AFTER INSERT OR DELETE OR UPDATE ON charter.units FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_payments AFTER INSERT OR DELETE OR UPDATE ON charter.payments FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_pricing_rules AFTER INSERT OR DELETE OR UPDATE ON charter.pricing_rules FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_profiles AFTER INSERT OR DELETE OR UPDATE ON charter.member_profiles FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_receipts AFTER INSERT OR DELETE OR UPDATE ON charter.receipts FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_role_assignments AFTER INSERT OR DELETE OR UPDATE ON charter.role_assignments FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_roles AFTER INSERT OR DELETE OR UPDATE ON charter.roles FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_seat_contacts AFTER INSERT OR DELETE OR UPDATE ON charter.seat_contacts FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_seat_templates AFTER INSERT OR DELETE OR UPDATE ON charter.seat_templates FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_seat_terms AFTER INSERT OR DELETE OR UPDATE ON charter.seat_terms FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_seat_title_overrides AFTER INSERT OR DELETE OR UPDATE ON charter.seat_title_overrides FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_setup_states AFTER INSERT OR DELETE OR UPDATE ON charter.setup_states FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_tax_profiles AFTER INSERT OR DELETE OR UPDATE ON charter.tax_profiles FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER audit_tier_terms AFTER INSERT OR DELETE OR UPDATE ON charter.tier_terms FOR EACH ROW EXECUTE FUNCTION charter.audit_row_change();

CREATE TRIGGER gateway_connections_check BEFORE INSERT OR UPDATE ON charter.gateway_connections FOR EACH ROW EXECUTE FUNCTION charter.gateway_connection_check();

CREATE TRIGGER membership_events_append_only BEFORE DELETE OR UPDATE ON charter.membership_events FOR EACH ROW EXECUTE FUNCTION charter.membership_events_append_only();

CREATE TRIGGER membership_model_guard BEFORE INSERT OR DELETE OR UPDATE ON charter.org_settings FOR EACH ROW EXECUTE FUNCTION charter.membership_model_guard();

CREATE TRIGGER membership_tiers_identity BEFORE UPDATE ON charter.membership_tiers FOR EACH ROW EXECUTE FUNCTION charter.tier_identity_guard();

CREATE TRIGGER membership_tiers_link_guard BEFORE INSERT OR UPDATE ON charter.membership_tiers FOR EACH ROW EXECUTE FUNCTION charter.level_link_guard();

CREATE TRIGGER membership_tiers_parent BEFORE INSERT OR UPDATE OF active ON charter.membership_tiers FOR EACH ROW EXECUTE FUNCTION charter.tier_parent_check();

CREATE TRIGGER membership_tiers_sync_linked AFTER UPDATE ON charter.membership_tiers FOR EACH ROW EXECUTE FUNCTION charter.sync_linked_levels_trigger();

CREATE TRIGGER org_settings_lock BEFORE INSERT OR UPDATE ON charter.org_settings FOR EACH ROW EXECUTE FUNCTION charter.enforce_setting_lock();

CREATE TRIGGER units_ancestors BEFORE INSERT OR UPDATE OF parent_id ON charter.units FOR EACH ROW EXECUTE FUNCTION charter.set_org_ancestors();

CREATE TRIGGER units_demo_guard BEFORE INSERT OR UPDATE OF is_demo ON charter.units FOR EACH ROW EXECUTE FUNCTION charter.org_demo_guard();

CREATE TRIGGER payments_receipts AFTER INSERT OR UPDATE OF status, refunded_amount_minor ON charter.payments FOR EACH ROW EXECUTE FUNCTION charter.payments_receipts();

CREATE TRIGGER receipts_guard BEFORE DELETE OR UPDATE ON charter.receipts FOR EACH ROW EXECUTE FUNCTION charter.receipts_guard();

CREATE TRIGGER seat_terms_append_only BEFORE DELETE OR UPDATE ON charter.seat_terms FOR EACH ROW EXECUTE FUNCTION charter.seat_terms_append_only();

CREATE TRIGGER tier_terms_dues_range BEFORE INSERT OR UPDATE OF price_minor, active ON charter.tier_terms FOR EACH ROW EXECUTE FUNCTION charter.chapter_dues_range_check();

CREATE TRIGGER tier_terms_identity BEFORE UPDATE ON charter.tier_terms FOR EACH ROW EXECUTE FUNCTION charter.tier_identity_guard();

CREATE TRIGGER tier_terms_link_guard BEFORE INSERT OR UPDATE ON charter.tier_terms FOR EACH ROW EXECUTE FUNCTION charter.level_link_guard();

CREATE TRIGGER tier_terms_org BEFORE INSERT ON charter.tier_terms FOR EACH ROW EXECUTE FUNCTION charter.tier_term_org_check();

CREATE TRIGGER tier_terms_sync_linked AFTER INSERT OR UPDATE ON charter.tier_terms FOR EACH ROW EXECUTE FUNCTION charter.sync_linked_levels_trigger();

-- Names start with charter_00 / charter_01 so they run before the other BEFORE
-- triggers (alphabetical order): org_id first, then the read-only guard.
create trigger charter_00_units_set_org before insert or update of parent_id on charter.units
  for each row execute function charter.units_set_org();
create trigger charter_staff_core_membership after insert or update of role_id, unit_id on charter.role_assignments
  for each row execute function charter.staff_core_membership();
do $$
declare
  r record;
begin
  for r in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'charter' and c.column_name = 'unit_id' and c.table_name <> 'units'
  loop
    execute format('create trigger charter_00_set_org before insert or update of unit_id on charter.%I for each row execute function charter.set_org_from_unit()', r.table_name);
  end loop;
  for r in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'charter' and c.column_name = 'org_id'
  loop
    execute format('create trigger charter_01_guard_writable before insert or update or delete on charter.%I for each row execute function charter.guard_writable()', r.table_name);
  end loop;
end $$;

-- Comments (from the old schema).
COMMENT ON SCHEMA public IS 'standard public schema';

COMMENT ON COLUMN charter.member_profiles.home_of IS 'Home-chapter model (0030): the national membership this chapter record stands for.';

COMMENT ON COLUMN charter.member_profiles.left_at IS 'Home-chapter model (0030): when the member moved to another chapter (or none).';

COMMENT ON FUNCTION charter.purge_smoke_data(_since timestamp with time zone) IS 'Deletes rows a smoke-test run created in the demo organizations since _since and records one summary audit event (D-150).';

COMMENT ON TABLE charter.seat_templates IS 'Marker: confirms migration 0040 (overview counts people once) has been applied.';

COMMENT ON TABLE charter.affiliation_history IS 'Home-chapter changes (0030, D-166). Append-only; written only by definer functions.';

COMMENT ON TABLE charter.appointments IS 'Who holds which seat, past and present (E-17). Written only by definer RPCs; ended, never deleted.';

COMMENT ON TABLE charter.gateway_connections IS 'Which payment gateway an org uses (E-12). Written only by connect / disconnect RPCs; secrets live in charter.gateway_secrets.';

COMMENT ON TABLE charter.member_segments IS 'Saved member list filters (E-14).';

COMMENT ON TABLE charter.membership_events IS 'Append-only membership history (E-13a). Written only by membership RPCs; never changed or deleted.';

COMMENT ON TABLE charter.membership_tiers IS 'Membership levels (tiers) defined per organization; retired via active=false, never deleted.';

COMMENT ON COLUMN charter.membership_tiers.suggested IS 'A4: offered to the orgs below as a starting point (D-165).';

COMMENT ON COLUMN charter.membership_tiers.link_mode IS 'A4: copy = the chapter''s own level; linked = follows source_tier_id (D-165). Set only by adopt_suggested_level / make_level_own.';

COMMENT ON TABLE charter.memberships IS 'Memberships and standing per member record (D-166, D-174).';

COMMENT ON COLUMN charter.memberships.home_org_id IS 'Home-chapter model (0030): the chapter this national membership belongs to.';

COMMENT ON TABLE charter.payments IS 'Payments received by an org (E-13a, E-12). Written only by definer functions; never deleted.';

COMMENT ON TABLE charter.pricing_rules IS 'Pricing rules by member fields (0021). Write only via save_pricing_rule / set_pricing_rule_active.';

COMMENT ON TABLE charter.receipt_counters IS 'Receipt numbering per org and year (E-15). Written only by definer functions.';

COMMENT ON TABLE charter.receipts IS 'Immutable receipts (E-15, D-044). Written only by definer functions; voided or superseded, never edited or deleted.';

COMMENT ON TABLE charter.seat_contacts IS 'Role email per org and seat (D-156). Null / no row = show each officer''s own email. Written only by set_seat_contact.';

COMMENT ON TABLE charter.seat_terms IS 'Term rules per org and seat (E-17, D-142). Append-only: a by-law change adds a row with its effective date.';

COMMENT ON TABLE charter.seat_title_overrides IS 'An org''s own title for a seat its parent defined (E-17). Written only by set_seat_title; null = the default title.';

COMMENT ON TABLE charter.tier_terms IS 'Terms of a membership level (E-11). Retire with active = false; there is no DELETE policy, so rows are never deleted.';

COMMENT ON TABLE charter.webhook_events IS 'Gateway events already handled (E-12); written only by definer functions. Never deleted.';

-- Row level security, policies and grants --------------------------------------------

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'charter' loop
    execute format('alter table charter.%I enable row level security', t);
  end loop;
end $$;

-- Same table grants as before the move.
-- no access: gateway_secrets, platform_flags, platform_operators (server only)
grant delete, insert, select, update on charter.affiliation_history to authenticated;
grant delete, insert, select, update on charter.appointments to authenticated;
grant insert, select on charter.attribute_definitions to authenticated;
grant insert, select on charter.attribute_options to authenticated;
grant select on charter.attribute_values to authenticated;
grant select on charter.audit_events to authenticated;
grant delete, insert, select, update on charter.gateway_connections to authenticated;
grant delete, insert, select, update on charter.member_segments to authenticated;
grant delete, insert, select, update on charter.membership_events to authenticated;
grant delete, insert, select, update on charter.membership_tiers to authenticated;
grant delete, insert, select, update on charter.memberships to authenticated;
grant select on charter.member_profiles to authenticated;
grant delete, insert, select, update on charter.org_settings to authenticated;
grant select on charter.units to authenticated;
grant delete, insert, select, update on charter.payments to authenticated;
grant select on charter.permissions to authenticated;
grant delete, insert, select, update on charter.pricing_rules to authenticated;
grant delete, insert, select, update on charter.receipt_counters to authenticated;
grant delete, insert, select, update on charter.receipts to authenticated;
grant select on charter.role_assignments to authenticated;
grant select on charter.role_permissions to authenticated;
grant select on charter.roles to authenticated;
grant delete, insert, select, update on charter.seat_contacts to authenticated;
grant delete, insert, select, update on charter.seat_templates to authenticated;
grant delete, insert, select, update on charter.seat_terms to authenticated;
grant delete, insert, select, update on charter.seat_title_overrides to authenticated;
grant insert, select on charter.setup_states to authenticated;
grant insert, select, update on charter.tax_profiles to authenticated;
grant delete, insert, select, update on charter.tier_terms to authenticated;
grant delete, insert, select, update on charter.webhook_events to authenticated;
grant update (active, help, label, locked, member_editable, required, show_in_directory, sort_order, visibility) on charter.attribute_definitions to authenticated;
grant update (active, label, sort_order) on charter.attribute_options to authenticated;
grant update (display_name) on charter.member_profiles to authenticated;
grant update (logo_path, name, timezone) on charter.units to authenticated;
grant update (answers, updated_at, updated_by) on charter.setup_states to authenticated;
grant all on all tables in schema charter to service_role;
grant usage, select on all sequences in schema charter to authenticated, service_role;

CREATE POLICY "auditors read audit" ON charter.audit_events FOR SELECT TO authenticated USING (((unit_id IS NOT NULL) AND (unit_id IN (SELECT charter.permitted_units('audit.view'::text)))));

CREATE POLICY "chapters read their members' national membership" ON charter.memberships FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM charter.member_profiles p
  WHERE ((p.home_of = memberships.id) AND (p.left_at IS NULL) AND charter.has_permission(auth.uid(), 'members.view'::text, p.unit_id)))));

CREATE POLICY "managers insert attribute defs" ON charter.attribute_definitions FOR INSERT TO authenticated WITH CHECK ((unit_id IN (SELECT charter.permitted_units('attributes.manage'::text))));

CREATE POLICY "managers insert attribute options" ON charter.attribute_options FOR INSERT TO authenticated WITH CHECK ((unit_id IN (SELECT charter.permitted_units('attributes.manage'::text))));

CREATE POLICY "managers insert tax" ON charter.tax_profiles FOR INSERT TO authenticated WITH CHECK ((unit_id IN (SELECT charter.permitted_units('org.manage'::text))));

CREATE POLICY "managers insert terms" ON charter.tier_terms FOR INSERT TO authenticated WITH CHECK ((unit_id IN (SELECT charter.permitted_units('tiers.manage'::text))));

CREATE POLICY "managers insert tiers" ON charter.membership_tiers FOR INSERT TO authenticated WITH CHECK ((unit_id IN (SELECT charter.permitted_units('tiers.manage'::text))));

CREATE POLICY "managers read tax" ON charter.tax_profiles FOR SELECT TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('org.manage'::text))));

CREATE POLICY "managers update attribute defs" ON charter.attribute_definitions FOR UPDATE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('attributes.manage'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('attributes.manage'::text))));

CREATE POLICY "managers update attribute options" ON charter.attribute_options FOR UPDATE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('attributes.manage'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('attributes.manage'::text))));

CREATE POLICY "managers update orgs" ON charter.units FOR UPDATE TO authenticated USING ((id IN (SELECT charter.permitted_units('org.manage'::text)))) WITH CHECK ((id IN (SELECT charter.permitted_units('org.manage'::text))));

CREATE POLICY "managers update tax" ON charter.tax_profiles FOR UPDATE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('org.manage'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('org.manage'::text))));

CREATE POLICY "managers update terms" ON charter.tier_terms FOR UPDATE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('tiers.manage'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('tiers.manage'::text))));

CREATE POLICY "managers update tiers" ON charter.membership_tiers FOR UPDATE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('tiers.manage'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('tiers.manage'::text))));

CREATE POLICY "managers write settings" ON charter.org_settings TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('org.manage'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('org.manage'::text))));

CREATE POLICY "member managers add segments" ON charter.member_segments FOR INSERT TO authenticated WITH CHECK ((unit_id IN (SELECT charter.permitted_units('members.manage'::text))));

CREATE POLICY "member managers change segments" ON charter.member_segments FOR UPDATE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('members.manage'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('members.manage'::text))));

CREATE POLICY "member managers remove segments" ON charter.member_segments FOR DELETE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('members.manage'::text))));

CREATE POLICY "member viewers and the member read affiliation history" ON charter.affiliation_history FOR SELECT TO authenticated USING (((unit_id IN (SELECT charter.permitted_units('members.view'::text))) OR ((from_org_id IS NOT NULL) AND charter.has_permission(auth.uid(), 'members.view'::text, from_org_id)) OR ((to_org_id IS NOT NULL) AND charter.has_permission(auth.uid(), 'members.view'::text, to_org_id)) OR (EXISTS ( SELECT 1
   FROM (charter.memberships m
     JOIN charter.member_profiles p ON ((p.id = m.profile_id)))
  WHERE ((m.id = affiliation_history.membership_id) AND (p.user_id = auth.uid()))))));

CREATE POLICY "member viewers read segments" ON charter.member_segments FOR SELECT TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('members.view'::text))));

CREATE POLICY "members and managers read membership events" ON charter.membership_events FOR SELECT TO authenticated USING (((unit_id IN (SELECT charter.permitted_units('members.view'::text))) OR (charter.is_org_member(auth.uid(), unit_id) AND (EXISTS ( SELECT 1
   FROM (charter.memberships m
     JOIN charter.member_profiles p ON ((p.id = m.profile_id)))
  WHERE ((m.id = membership_events.membership_id) AND (p.user_id = auth.uid())))))));

CREATE POLICY "members and managers read memberships" ON charter.memberships FOR SELECT TO authenticated USING (((unit_id IN (SELECT charter.permitted_units('members.view'::text))) OR (charter.is_org_member(auth.uid(), unit_id) AND (EXISTS ( SELECT 1
   FROM charter.member_profiles p
  WHERE ((p.id = memberships.profile_id) AND (p.user_id = auth.uid())))))));

CREATE POLICY "members and viewers read orgs" ON charter.units FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), id) OR (id IN (SELECT charter.permitted_units('org.view'::text)))));

CREATE POLICY "members read settings" ON charter.org_settings FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text)))));

CREATE POLICY "payers and viewers read payments" ON charter.payments FOR SELECT TO authenticated USING (((unit_id IN (SELECT charter.permitted_units('payments.view'::text))) OR (payer_user_id = auth.uid()) OR (charter.is_org_member(auth.uid(), unit_id) AND (EXISTS ( SELECT 1
   FROM charter.member_profiles p
  WHERE ((p.id = payments.profile_id) AND (p.user_id = auth.uid())))))));

CREATE POLICY "payment admins read connections" ON charter.gateway_connections FOR SELECT TO authenticated USING (((unit_id IN (SELECT charter.permitted_units('payments.view'::text))) OR (unit_id IN (SELECT charter.permitted_units('payments.manage'::text)))));

CREATE POLICY "payment admins read webhook events" ON charter.webhook_events FOR SELECT TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('payments.view'::text))));

CREATE POLICY "payment viewers and payers read receipts" ON charter.receipts FOR SELECT TO authenticated USING (((unit_id IN (SELECT charter.permitted_units('payments.view'::text))) OR (EXISTS ( SELECT 1
   FROM (charter.payments p
     LEFT JOIN charter.member_profiles pr ON ((pr.id = p.profile_id)))
  WHERE ((p.id = receipts.payment_id) AND ((p.payer_user_id = auth.uid()) OR (pr.user_id = auth.uid())))))));

CREATE POLICY "payment viewers read receipt counters" ON charter.receipt_counters FOR SELECT TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('payments.view'::text))));

CREATE POLICY "permitted read attribute values" ON charter.attribute_values FOR SELECT TO authenticated USING (charter.can_read_attribute_value(auth.uid(), unit_id, definition_id, entity_id));

CREATE POLICY "read own or managed assignments" ON charter.role_assignments FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (unit_id IN (SELECT charter.permitted_units('roles.manage'::text)))));

CREATE POLICY "read own or permitted profiles" ON charter.member_profiles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (unit_id IN (SELECT charter.permitted_units('members.view'::text)))));

CREATE POLICY "read permissions" ON charter.permissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM charter.role_assignments ra
  WHERE (ra.user_id = auth.uid()))));

CREATE POLICY "read role permissions" ON charter.role_permissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM charter.roles r
  WHERE ((r.id = role_permissions.role_id) AND ((r.unit_id IS NULL) OR charter.can_see_org_tree(auth.uid(), r.unit_id) OR charter.has_permission(auth.uid(), 'roles.manage'::text, r.unit_id))))));

CREATE POLICY "read roles" ON charter.roles FOR SELECT TO authenticated USING (((unit_id IS NULL) OR charter.can_see_org_tree(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('roles.manage'::text)))));

CREATE POLICY "setup runners insert draft" ON charter.setup_states FOR INSERT TO authenticated WITH CHECK (((unit_id IN (SELECT charter.permitted_units('setup.run'::text))) AND (status = 'in_progress'::charter.setup_status)));

CREATE POLICY "setup runners read" ON charter.setup_states FOR SELECT TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('setup.run'::text))));

CREATE POLICY "setup runners update draft" ON charter.setup_states FOR UPDATE TO authenticated USING ((unit_id IN (SELECT charter.permitted_units('setup.run'::text)))) WITH CHECK ((unit_id IN (SELECT charter.permitted_units('setup.run'::text))));

CREATE POLICY "tree members read appointments" ON charter.appointments FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "tree members read attribute defs" ON charter.attribute_definitions FOR SELECT TO authenticated USING (charter.can_see_org_tree(auth.uid(), unit_id));

CREATE POLICY "tree members read attribute options" ON charter.attribute_options FOR SELECT TO authenticated USING (charter.can_see_org_tree(auth.uid(), unit_id));

CREATE POLICY "tree members read pricing rules" ON charter.pricing_rules FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "tree members read seat contacts" ON charter.seat_contacts FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "tree members read seat terms" ON charter.seat_terms FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "tree members read seat titles" ON charter.seat_title_overrides FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "tree members read seats" ON charter.seat_templates FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "tree members read terms" ON charter.tier_terms FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "tree members read tiers" ON charter.membership_tiers FOR SELECT TO authenticated USING ((charter.is_org_member(auth.uid(), unit_id) OR (unit_id IN (SELECT charter.permitted_units('org.view'::text))) OR charter.can_see_org_tree(auth.uid(), unit_id)));

CREATE POLICY "update own profile" ON charter.member_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- Functions: nothing for anon (except below); the server-only ones stay closed.
revoke all on all functions in schema charter from public, anon;
grant execute on all functions in schema charter to authenticated, service_role;
revoke execute on function charter.ancestor_setting(_org uuid, _key text) from authenticated;
revoke execute on function charter.chapter_dues_range_check() from authenticated;
revoke execute on function charter.check_role_permissions(_uid uuid, _org uuid, _perms text[]) from authenticated;
revoke execute on function charter.claim_webhook_event(_org uuid, _gateway charter.payment_gateway, _event_id text, _type text, _payment uuid) from authenticated;
revoke execute on function charter.complete_gateway_payment(_event_id text, _payment uuid, _gateway_ref text, _amount_minor integer, _currency text, _livemode boolean) from authenticated;
revoke execute on function charter.effective_setting(_org uuid, _key text) from authenticated;
revoke execute on function charter.emails_allowed(_org uuid) from authenticated;
revoke execute on function charter.fail_gateway_payment(_event_id text, _payment uuid, _reason text) from authenticated;
revoke execute on function charter.gateway_sealed_credentials(_org uuid) from authenticated;
revoke execute on function charter.grant_membership_term(_profile uuid, _term uuid, _paid_on date, _payment uuid, _actor uuid, _pending boolean) from authenticated;
revoke execute on function charter.holds_all_role_permissions(_user uuid, _role uuid, _org uuid) from authenticated;
revoke execute on function charter.issue_receipt_internal(_payment uuid, _supersedes uuid) from authenticated;
revoke execute on function charter.linked_price(_org uuid, _price integer, _rule text, _value integer) from authenticated;
revoke execute on function charter.listed_in_directory(_profile charter.member_profiles) from authenticated;
revoke execute on function charter.mark_payment_refunded(_event_id text, _gateway charter.payment_gateway, _gateway_ref text, _amount_minor integer) from authenticated;
revoke execute on function charter.move_home_chapter(_membership uuid, _chapter uuid) from authenticated;
revoke execute on function charter.national_dues_required(_org uuid) from authenticated;
revoke execute on function charter.national_membership_state(_user uuid, _org uuid) from authenticated;
revoke execute on function charter.national_org(_org uuid) from authenticated;
revoke execute on function charter.org_demo_guard() from authenticated;
revoke execute on function charter.org_subtree(_org uuid) from authenticated;
revoke execute on function charter.payment_failed(_event_id text, _payment uuid, _reason text) from authenticated;
revoke execute on function charter.payment_refunded(_event_id text, _gateway charter.payment_gateway, _gateway_ref text, _amount_minor integer) from authenticated;
revoke execute on function charter.payment_succeeded(_event_id text, _payment uuid, _gateway_ref text, _amount_minor integer, _currency text, _livemode boolean) from authenticated;
revoke execute on function charter.pricing_condition_matches(_c jsonb, _values jsonb) from authenticated;
revoke execute on function charter.profile_membership_id(_p charter.member_profiles) from authenticated;
revoke execute on function charter.profile_values(_profile uuid) from authenticated;
revoke execute on function charter.receipt_logo(_org uuid) from authenticated;
revoke execute on function charter.receipt_snapshot(_payment uuid) from authenticated;
revoke execute on function charter.receipt_tax_wording(_treatment charter.tax_treatment) from authenticated;
revoke execute on function charter.resolve_role(_org uuid, _key text) from authenticated;
revoke execute on function charter.role_applies_at(_role charter.roles, _org uuid) from authenticated;
revoke execute on function charter.seat_applies_at(_t charter.seat_templates, _org uuid) from authenticated;
revoke execute on function charter.seat_planned_end(_org uuid, _template uuid, _starts_on date, _rule_on date) from authenticated;
revoke execute on function charter.seat_template_check(_org uuid, _term_count integer, _term_unit charter.term_unit, _role uuid, _scope charter.seat_scope) from authenticated;
revoke execute on function charter.seat_term_in_force(_org uuid, _template uuid, _on date) from authenticated;
revoke execute on function charter.sync_linked_level(_tier uuid) from authenticated;
revoke execute on function charter.term_price(_term uuid, _values jsonb) from authenticated;
revoke execute on function charter.validate_attribute_value(_def charter.attribute_definitions, _v jsonb) from authenticated;
revoke execute on function charter.validate_join_answers(_org uuid, _answers jsonb) from authenticated;
revoke execute on function charter.validate_pricing_conditions(_org uuid, _conditions jsonb) from authenticated;
revoke execute on function charter.write_audit(_org uuid, _action text, _target_type text, _target_id text, _before jsonb, _after jsonb) from authenticated;
revoke execute on function charter.set_org_from_unit(), charter.units_set_org(), charter.guard_writable(), charter.staff_core_membership() from authenticated;

-- Charter's public join page (spec §4.5): the anon lookups exist only on a
-- self-hosted database (billing off). Hosted, joining goes through the hub's sign-in.
do $$
begin
  if not coalesce((select s.billing_enabled from public.instance_settings s where s.id), false) then
    grant usage on schema charter to anon;
    grant execute on function charter.public_join_info(text), charter.public_home_chapter_info(text) to anon;
  end if;
end $$;

-- Storage (spec §3.7): private bucket charter-branding, paths <unit_id>/… Skipped on
-- a database without Supabase Storage.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'No storage schema: skipping the charter-branding bucket and its policies';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('charter-branding', 'charter-branding', false, 2097152, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
  on conflict (id) do nothing;
  create policy "charter branding read" on storage.objects for select to authenticated
    using (bucket_id = 'charter-branding' and charter.can_see_org_tree(auth.uid(), ((storage.foldername(name))[1])::uuid));
  create policy "charter branding insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'charter-branding'
      and charter.has_permission(auth.uid(), 'org.manage', ((storage.foldername(name))[1])::uuid)
      and public.has_app_access(charter.unit_org(((storage.foldername(name))[1])::uuid), 'charter'));
  create policy "charter branding update" on storage.objects for update to authenticated
    using (bucket_id = 'charter-branding'
      and charter.has_permission(auth.uid(), 'org.manage', ((storage.foldername(name))[1])::uuid)
      and public.has_app_access(charter.unit_org(((storage.foldername(name))[1])::uuid), 'charter'));
  create policy "charter branding delete" on storage.objects for delete to authenticated
    using (bucket_id = 'charter-branding'
      and charter.has_permission(auth.uid(), 'org.manage', ((storage.foldername(name))[1])::uuid)
      and public.has_app_access(charter.unit_org(((storage.foldername(name))[1])::uuid), 'charter'));
end $$;
