# How UniSkilled is built and kept safe

## Where things run

| Part | Where | Notes |
|---|---|---|
| Website (HTML/CSS/JS) | GitHub Pages, from `main` | Deploys automatically about a minute after a merge. |
| Database, logins, file storage, realtime | Supabase project `orghkbbohnabcietidiv` (Stockholm) | Access rules (RLS) on every table. |
| Server functions (payments, payouts, emails, jobs) | Supabase Edge Functions, source in `supabase/functions/` | 50 functions, 19 of them retired stubs. |
| Card payments / payouts | Stripe (Connect, destination charges) | PayPal code is kept but switched off. |
| Email | Resend | |
| Errors / analytics | Sentry (EU), PostHog (EU) | |

## Where secrets live

- **Server keys** (Stripe, PayPal, Resend, Daily, Sentry token, Cloudflare TURN): Supabase → Edge Functions → **Secrets**. Functions read them with `Deno.env.get(...)`. They are never in this repository.
- **Scheduled-job secret**: generated inside the database and stored in Supabase **Vault**; jobs read it from there.
- **Public values** (safe in the browser by design): the Supabase anon key and address in `supabase-config.js` (the only copy), the Sentry DSN, the PostHog project key.
- **GitHub secrets** (Settings → Secrets and variables → Actions), used only by workflows:
  - `DATABASE_URL`: runs the database security tests and the daily structure snapshot.
  - `SUPABASE_ACCESS_TOKEN`: lets the "Deploy server functions" workflow deploy (use a scoped token).

The secret scan (`gitleaks`, settings in `.gitleaks.toml`) fails any pull request that adds a real key or password.

## Automatic tests (`.github/workflows/ci.yml`)

Run on every pull request and every change to `main`. Results also show on the admin page → Site Health → *Automatic tests*.

| Check | What it proves |
|---|---|
| Site checks (`tests/static_checks.py`) | JavaScript parses, no broken links, no committed secrets, fonts self-hosted, legal text, database library self-hosted, one shared config, every server function has its login setting. |
| Payment logic (`tests/functions/*.test.ts`) | Payout routing, duplicate-payment handling, which payments may confirm a booking, checkout expiry. |
| Type-check (Deno) | All 50 server functions compile. |
| Secret scan (gitleaks) | No keys or passwords in the code or its history. |
| Browser tests (Playwright) | Every page opens in Chromium on desktop and phone without a JavaScript crash; signed-out visitors are sent to sign in. |
| Database security (`tests/db/security_tests.sql`) | 31 attempts by a student, a tutor and a stranger to do things they must not (change prices, mark bookings paid, make themselves admin, read others' data). All rolled back. Needs `DATABASE_URL`. |

Run them locally: `npm test` (site, logic, types) and `npm run test:e2e` (browser; first `npx playwright install chromium`).

## Changing things safely

- **Website**: open a pull request; tests run; merge when green.
- **Server functions**: edit in `supabase/functions/<name>/`, open a pull request, merge, then Actions → **Deploy server functions** → Run workflow (staging first). The login setting for each function is in `supabase/config.toml`, a copy of the live settings. The Supabase CLI defaults to "require login", which would break webhooks and jobs.
- **Database**: add a file to `supabase/migrations/`, test it with a rollback-only dry run, apply, then run the security tests. The daily snapshot (`db/schema.sql`) opens a pull request whenever the live structure changes, so nothing changed directly in the dashboard goes unrecorded.
- **Load test**: Actions → **Load test** (k6, `tests/load/browse.js`). Read-only; point it at staging.

## Staging (test copy)

Planned as a free second Supabase project, built from `db/schema.sql` once the snapshot workflow has run (it needs `DATABASE_URL`). The deploy workflow already supports it: set the repository variable `STAGING_PROJECT_REF`.

## Folders

- `supabase/functions/`: every live server function, exactly as deployed (checked 2026-10-21).
- `supabase/migrations/`: database changes made from this repository.
- `db/live-migration-history/`: all 88 migrations recorded in the live database, exported for reference. Some changes were applied directly and are only in `db/schema.sql` (once the snapshot runs).
- `vendor/supabase-js/`: the Supabase browser library, self-hosted (checked against npm's published checksums).
- `tests/`: everything above.
