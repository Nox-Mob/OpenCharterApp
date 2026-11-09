# Settings to re-enter on the new Supabase project

The migrations rebuild the database: tables, functions, policies and the `branding` bucket. Everything below lives outside the migrations, so on the new project it has to be set by hand, in the Supabase dashboard or in GitHub. Names only: **no value belongs in this file or anywhere in the repository.** Inventory: [`phase-0-inventory.md`](phase-0-inventory.md). Supabase CLI 2.122.1.

## 1. Project settings (Phase 0, before the first deploy)

Dashboard → Project Settings → Data API (and Database):

- Data API **on**, exposing only `public` (and `graphql_public`). Never expose `private`.
- "Automatically expose new tables" **off**. Every table gets explicit GRANTs in its migration, and the replay job checks this (`auto_expose_new_tables = false` in `supabase/config.toml`).
- Automatic RLS **on**. Every table also enables RLS in its migration.
- Max rows: 1,000 (the app reads every page, D-181).

## 2. Sign-in providers (Authentication → Sign In / Providers)

- **Email** (email and password): on. Signups on. Check whether Lovable required email confirmation and match it ("Confirm email"). The local stack has it off.
- Minimum password length: 8 (the reset-password screen asks for 8).
- **Google:** through Supabase Auth since Phase 1 (D-212; Lovable's broker is gone). Create an OAuth client in Google Cloud with the redirect URI `https://<project ref>.supabase.co/auth/v1/callback`, and enter its client ID and secret in the dashboard (steps: phase-1-cutover.md §2a). `supabase/config.toml` has `[auth.external.google]` present but `enabled = false`, reading `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` from the environment.
- Anonymous sign-ins, phone, other providers: off.

## 3. Redirect URLs (Authentication → URL Configuration)

- **Site URL:** the app's public address (today the Lovable published URL; later your own domain).
- **Redirect URLs:** the same address with `/**`, plus any preview address you use. The app sends people back to `/account` (email change), `/reset-password` (password reset) and the page they signed up from (`/join/…`, `/invite/…`).
- `config.toml` allows only `http://localhost:*` for the local stack. Production URLs are never in the repository.

## 4. Email templates and SMTP (Authentication → Emails)

- Templates used: confirm signup, reset password, change email address, and invite if you send Supabase invitations. The app's own invitations go through `create_invitation` and need no template. Copy any wording you changed on Lovable. Otherwise the defaults are fine.
- **SMTP:** Supabase's built-in sender is rate-limited and meant for testing. For real use, set custom SMTP (host, port, user, sender address and name). The password goes in the dashboard only. App email (E-08, `EMAIL_TRANSPORT`) isn't built yet.

## 5. MFA

The app doesn't use `auth.mfa`, so MFA (TOTP and phone) stays **off**, in `config.toml` and on the project.

## 6. Scheduled jobs

None. No migration uses `pg_cron` or `pg_net`, and no route uses `src/integrations/supabase/cron-auth.ts` yet. When scheduled routes arrive (E-08), they need `LOVABLE_CRON_SECRET` (to be renamed in Phase 1) and a scheduler.

## 7. Secrets and environment variables (names only)

**App server** (Cloudflare Worker secrets since Phase 1, phase-1-cutover.md §4; set each as type Secret so `wrangler deploy` keeps it):

| Name | What |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | The project's API URL and publishable key (publishable values, public; in `wrangler.jsonc` since D-219) |
| `SUPABASE_SERVICE_ROLE_KEY` | The service-role or secret key, for server functions. **Secret** |
| `GATEWAY_ENCRYPTION_KEY` | Encrypts each organization's Stripe credentials (32 random bytes, base64). **Secret.** Use the **same** value as on Lovable only if you copy encrypted Stripe credentials over. With no production data, generate a new one and orgs reconnect Stripe |
| `PUBLIC_APP_URL`, `PUBLIC_APP_ALLOWED_ORIGINS` | Optional: the app's public address and extra allowed origins, for links that leave the app and come back (Stripe) |
| `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS` | Scheduled-route secret (unused yet, §6) |
| `EMAIL_TRANSPORT` | Planned (E-08) |

**Browser build** (`.env`, publishable only): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, and `SUPABASE_PROJECT_ID`. The client reads `VITE_SUPABASE_PUBLISHABLE_KEY`, so a variable named `VITE_SUPABASE_KEY` would not be used. These change at the **Phase 1 cutover**, not before: `main` still deploys from Lovable.

**GitHub** (Settings → Secrets and variables → Actions; the deploy secrets may instead go on the `supabase-prod` environment):

| Name | Kind | Used by |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | `supabase-db.yml` deploy: a personal access token with the scopes in §8 |
| `SUPABASE_DB_PASSWORD` | secret | deploy: the new project's database password |
| `SUPABASE_PROJECT_ID` | secret | deploy: the new project's ref (the 20-letter ID in its URL) |
| `SMOKE_DEMO_PASSWORD` | secret | `live.yml`: the demo accounts' password (§9). A **repository** secret (`live.yml` uses no environment). Only set it if the demo accounts use a password other than the default in docs/demo-data.md: once set, the live checks use it for whichever project `.env` points at |
| `E2E_BASE_URL` | variable | `live.yml`: a deployed site for the checkout test |

## 8. The deploy job's access token

Create it at supabase.com → Account → Access Tokens, with only these scopes:

- `project_admin_read`
- `projects_read`
- `database_pooling_config_read`
- `branching_production_read`

The deploy job fails with a message naming these scopes if the Management API answers 403. It reaches the database through the project's IPv4 **session pooler** (`*.pooler.supabase.com`, port 5432), because GitHub's runners have no IPv6.

## 9. The test accounts on the new project

`supabase/scripts/demo-test-accounts.sql` creates the three demo accounts (`demo-national@`, `demo-chapter@`, `demo-member@opencharter.test`) and Demo National with its Austin and Dallas chapters, set up as `docs/demo-data.md` describes. The smoke and end-to-end tests expect them. Run it **after** the real deploy:

1. Open the SQL Editor of the new project (or connect with `psql` through the session pooler).
2. Paste this line first, with the password in place of the dots. Use the same value as the `SMOKE_DEMO_PASSWORD` secret:
   `select set_config('fixture.demo_password', '........', false);`
3. Paste the whole script below it and run.

It is safe to run twice: existing rows are left alone, and an existing account keeps its password. It refuses to run, changing nothing, if a demo ID or slug belongs to a real (non-demo) organization or a demo email belongs to another account. The password is never stored in the repository.

## 10. Outside webhooks and domains

- **Stripe:** each organization's webhook points at `https://<app domain>/api/public/stripe/<org id>` (docs/lovable-handoff.md §6). It doesn't involve Supabase, but if the app's domain changes at the cutover, each connected org updates its endpoint in Stripe.
- **Custom domains:** none yet (E-22 deferred). Supabase's custom-domain add-on isn't used.
- No other outside service calls the database or the API.
