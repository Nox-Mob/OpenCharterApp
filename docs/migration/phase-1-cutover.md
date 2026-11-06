# Phase 1: cutover to the new Supabase project and Cloudflare

Status on 2026-11-06. Decision: D-212. Phase 0 (D-211, [`phase-0-inventory.md`](phase-0-inventory.md)) built the new project's database from `supabase/migrations`; the owner has run the deploy. This page is the checklist for everything else. The code side is in the Phase 1 pull request; the steps marked **owner** happen in Google Cloud, Supabase, Cloudflare, Stripe or GitHub and can't be done from the repository. Secret *values* never go in the repository or a pull request.

New project: `nxungwtxnctcqolfshcr` (`https://nxungwtxnctcqolfshcr.supabase.co`). Host: Cloudflare Workers, domain `opencharterapp.org`, built from `main`.

## 1. Code (the Phase 1 pull request)

- [x] Google sign-in through Supabase Auth: `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: <origin>/auth } })` in `src/routes/auth.tsx`. `src/integrations/lovable` and `@lovable.dev/cloud-auth-js` are removed. End-to-end check: `e2e/google-sign-in.spec.ts`.
- [x] `.env` points at the new project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (built into the browser bundle) and `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` (publishable values only). The app doesn't read `SUPABASE_JWKS_URL`: supabase-js checks tokens with the Auth server.
- [x] `supabase/config.toml`: `project_id = "nxungwtxnctcqolfshcr"`.
- [x] Storage: the only bucket the code uses is `branding` (logos, private, signed URLs), created by migration `0046`. No code uses an `org-files` bucket, so none is created. Demo logos aren't copied.
- No seed file: the database starts empty except for what the migrations create, and the test accounts come from `supabase/scripts/demo-test-accounts.sql` (§3). Locally, load the same accounts with `supabase/ci/fixtures.sql` (docs/testing.md).
- Left as they are: the Lovable build config (`@lovable.dev/vite-tanstack-config`, an ordinary npm package that also produces the Cloudflare build), the preview sign-in helper (`previewAuthStorage.ts`, active only inside Lovable's editor preview), Lovable error reporting (does nothing outside Lovable) and the Lovable hosts in `origin.ts` (harmless once Lovable is unpublished). Remove them in a later clean-up.

**Merging this pull request is the switch**: `main` then builds the app against the new project, on Cloudflare and (until it is unpublished) on Lovable. Merge PR B (Phase 0) first, then this one, after §2–§4 below.

## 2. Supabase project settings (owner)

Dashboard → Authentication:

- **URL Configuration:** Site URL `https://opencharterapp.org`. Redirect URLs: `https://opencharterapp.org/**`, plus `http://localhost:*/**` for local development, plus any Cloudflare preview address you use (e.g. `https://*-nox-mob-opencharterapp.<account>.workers.dev/**`).
- **Providers → Email:** on; minimum password length 8; decide whether new accounts must confirm their email (the sign-up screen says "Check your email to confirm your account").
- **Providers → Google:** on, with the client ID and secret from §2a.
- **Emails → SMTP:** your own sender before real use (Supabase's built-in one is rate-limited). Templates: confirm signup, reset password, change email; the defaults work.
- **MFA:** off (the app doesn't use it; MFA testing applies to OpenLedgerApp).
- Scheduled jobs and outside webhooks to Supabase: none.

### 2a. Google OAuth client (owner, Google Cloud Console)

1. APIs & Services → OAuth consent screen: app name OpenCharterApp, support email, authorised domain `opencharterapp.org` (and `supabase.co`), scopes `email`, `profile`, `openid`. Publish it ("In production") so any Google account can sign in.
2. Credentials → Create credentials → OAuth client ID → Web application.
   - Authorised JavaScript origins: `https://opencharterapp.org`
   - Authorised redirect URI: **`https://nxungwtxnctcqolfshcr.supabase.co/auth/v1/callback`**
3. Paste the client ID and secret into Supabase → Authentication → Providers → Google.

## 3. Test accounts (owner, Supabase SQL Editor)

Run `supabase/scripts/demo-test-accounts.sql` as described at its top. Use the **current demo password** (docs/demo-data.md) unless you also set `SMOKE_DEMO_PASSWORD` in GitHub: once this pull request is merged, the live checks (`live.yml`) sign in to the new project with that password. Without these accounts the live checks fail after the merge.

Optional: the sales demo national Test-Demo existed only on Lovable. To have it again, create a demo national in the home-chapter model (signed in as Nora National), then run `bun scripts/seed-sales-demo.ts --org <its id>` (docs/demo-data.md).

## 4. Cloudflare Worker (owner)

Workers & Pages → your Worker → Settings:

- **Build:** build command `bun run build`, deploy command `npx wrangler deploy` (Wrangler finds the generated config through `.wrangler/deploy/config.json`). The Worker name and compatibility date come from `wrangler.jsonc` in the repository (`opencharterapp`, matching the Worker); the build merges it into the generated config. Root directory: the repository root. Branch: `main`.
- **Branch builds (previews):** branches other than `main` deploy with `npx wrangler preview`, which needs the `previews` block in `wrangler.jsonc` (present). Previews keep their own secrets (Worker → Previews, or `wrangler preview secret`); without them a preview's server functions can't reach Supabase. Sign-in on a preview address also needs that address in Supabase's redirect URLs (§2).
- **Build variables:** none needed; the `VITE_*` values come from `.env`.
- **Variables and Secrets** (runtime; add each as type **Secret**, because a plain variable set in the dashboard is removed by the next `wrangler deploy`):

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://nxungwtxnctcqolfshcr.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | the publishable key (same as `.env`) |
| `SUPABASE_SERVICE_ROLE_KEY` | the new project's **secret** key (Supabase → Project Settings → API Keys). Secret |
| `GATEWAY_ENCRYPTION_KEY` | a new random value: `openssl rand -base64 32`. Secret. Orgs connect Stripe again on the new project |
| `PUBLIC_APP_URL` | `https://opencharterapp.org` |

- **Domains & Routes:** `opencharterapp.org` (and `www.` if you want it) as a custom domain of the Worker.

## 5. Tests on the new host (owner, after the merge and a successful deploy)

- [ ] Sign up a new email/password account on `https://opencharterapp.org/auth`, confirm it if confirmation is on, sign in and out.
- [ ] "Continue with Google" with a Google account: it comes back signed in; Account shows "You sign in with Google".
- [ ] Upload a logo (Settings → General → Logo) and see it shown (signed URL), then replace it.
- [ ] Stripe test mode: in a test organization, Settings → Payments → connect Stripe with a **test** secret key and a webhook signing secret; in Stripe (test mode) add the endpoint `https://opencharterapp.org/api/public/stripe/<org id>` with the events in docs/lovable-handoff.md §6. Join with card `4242 4242 4242 4242`: the membership is active, a receipt is issued, and Stripe shows the webhook delivered (2xx).
- [ ] Actions → Live demo checks → Run workflow: the smoke and end-to-end tests pass against the new project. Set the repository variable `E2E_BASE_URL` to `https://opencharterapp.org` to include the checkout test.

## 6. Go live (owner)

There is no data to move. In order:

1. DNS: `opencharterapp.org` on the Worker (done if §4's custom domain is active).
2. Stripe: each connected org's webhook endpoint and signing secret point at `https://opencharterapp.org/api/public/stripe/<org id>` (re-entered in the app's Payments page).
3. Unpublish the Lovable app (Lovable → project → Publish → Unpublish). Keep the Lovable project itself until you're sure; the repository stays the source.
4. Remove `LOVABLE_*` secrets you no longer need from Lovable Cloud; nothing in the new setup reads them.
