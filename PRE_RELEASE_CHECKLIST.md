# UniSkilled — Pre-Release Checklist

**Audit date:** 10 October 2026 · **Audited commit:** `2699e5d` (main) · **Supabase project:** `orghkbbohnabcietidiv` (eu-north-1)

This checklist was built from the **actual code and live configuration**, not from older documentation.
It covers the website (this repo, served by GitHub Pages at uniskilled.com) and the backend that lives
in Supabase (database, row-level security, 43 Edge Functions, 4 scheduled jobs, storage buckets).

**Statuses:** `NOT CHECKED` · `PASS` · `FAIL` · `FIXED` · `NEEDS REVIEW` · `BLOCKED`
**Priorities:** **P0** critical · **P1** launch blocker · **P2** important · **P3** improvement

> "PASS (inspected)" means the code was read and is correct, but the behaviour was not exercised end to end.
> "PASS (tested)" means it was actually exercised (e.g. by the database security test suite).
>
> **Where fixes live:** backend fixes (Edge Functions) are **deployed and verified live**. Website fixes are in pull request
> `pre-release-audit` and go live on uniskilled.com **when you merge it**. The database migration (DB-01, SEC-01/02/03)
> is written and reviewed but **not applied** — the tool asked for your approval because it changes storage permissions.

---

## How the system actually works today (source of truth)

| Area | What the code really does |
|---|---|
| Frontend | 28 static HTML pages + shared JS on GitHub Pages. No build step, no framework. Supabase JS loaded from CDN. |
| Auth | Supabase Auth (email + password). 10 accounts, all email-confirmed. Roles in `users.roles[]`; admin checked server-side via `is_admin()`. |
| Booking | Student sends a request (no charge) → tutor accepts → 24-hour payment window → payment confirms the session. |
| Payments (in use) | **Stripe Checkout, card (+ Klarna when available)**, as a Connect *destination charge*: the tutor's 80% goes straight into the tutor's Stripe Express account; UniSkilled keeps a 20% application fee. Confirmation happens only in the signed `stripe-webhook`. |
| Payments (dormant) | PayPal checkout + PayPal tutor payouts. Code exists and was reachable from the payment page. Per your 9 Oct decision PayPal is not part of launch. |
| Payout hold | Tutor Stripe accounts are set to **manual payouts**; an hourly job pays the tutor's balance out to their bank 48 h after the session is marked complete, unless a dispute is open. |
| Fees | `platform_settings.platform_fee_rate = 0.20` (20 %). Minimum booking €10 / $11. No student fee. |
| Referral discount | Applied server-side, capped at the platform fee, so the tutor's 80 % is never reduced. |
| Scheduled jobs | `mark-sessions-completed` (:50), `release-tutor-payout` (:00), `expire-unpaid-sessions` (:05), `check-group-session-minimums` (:10). All authenticate with a Vault secret. |
| Emails | Resend via `send-email` (19 templates) + `verify-university`; sender `info@uniskilled.com`. |
| Live data | 26 sessions (all test), **0 completed card payments ever**, 1 PayPal *sandbox* payment (released). 4 tutor profiles, 1 with a Stripe account (test mode). |

---

## Findings that need action (prioritised)

### P0 — Critical

#### PAY-01 · PayPal checkout was live on the real site while PayPal is in sandbox mode — `FIXED` (backend live; page in PR)
- **Problem:** `complete-payment.html` showed PayPal as the *default* payment option. PayPal runs in sandbox unless a `PAYPAL_ENV=live` secret exists, and it can't go live (needs a PayPal Business account). Anyone with a free PayPal developer test account could "pay" with fake money and get a real, confirmed booking; the tutor would teach for free.
- **Evidence:** `paypal-config`, `create-paypal-order`, `capture-paypal-order` all fall back to `api-m.sandbox.paypal.com`; payment page lines 94–99 default to PayPal; the only payment ever recorded is a PayPal sandbox capture.
- **Files:** `complete-payment.html`; Edge Functions `paypal-config`, `create-paypal-order`, `capture-paypal-order`.
- **Impact:** Revenue loss / unpaid tutors / fraud.
- **Fix:** Server-side switch — PayPal checkout refuses to start or capture unless `PAYPAL_CHECKOUT_ENABLED=true` **and** `PAYPAL_ENV=live` are both set. Payment page shows card only unless the server reports PayPal as enabled. PayPal code is kept (dormant), as you decided.
- **Safe to automate:** Yes (implements your 9 Oct card-only decision; no fee/policy change).
- **Verification:** 6 unit tests; **live check:** `paypal-config` → `{"checkout_enabled":false}`, `create-paypal-order` and `capture-paypal-order` → HTTP 403 (called from Supabase on 10 Oct). Static checks confirm the page defaults to card.
- **Until the PR is merged** the old page still opens on the PayPal tab and will show "PayPal checkout couldn't load"; the Card tab works. Merge soon.

#### PAY-02 · Payout job chose the payout route from the tutor's *preference*, not from where the money is — `FIXED` (live)
- **Problem:** Card payments put the tutor's 80 % into the tutor's Stripe account. `release-tutor-payout` sent a **PayPal** payout from UniSkilled's own PayPal balance whenever the tutor's preference was PayPal, while the card money stayed in their Stripe account. In live mode that pays the tutor twice; in sandbox it marks a real payment "released" with fake money.
- **Evidence:** `release-tutor-payout` → `releasePayment()` branches on `tp.payout_method`, not on `payment.stripe_payment_intent_id` / `payment.paypal_capture_id`.
- **Impact:** Double payouts / stranded tutor funds / wrong accounting.
- **Fix:** Route by origin — card payments always pay out from the tutor's Stripe balance; PayPal-captured payments use PayPal; anything else is skipped and flagged. Failed payouts now also alert admins (previously only logged).
- **Safe to automate:** Yes (payout amounts, hold and fee unchanged).
- **Verification:** 9 unit tests; **live check:** deployed v16 ran a real scheduled batch (2 sessions skipped: "no payment record"; nothing paid) and rejected an unauthenticated call (403).

### P1 — Launch blockers

#### OPS-01 · Stripe is still in test mode — the site cannot take real money — `BLOCKED (you)`
- **Problem:** Stripe account not activated / live keys not configured. Until then every "payment" is a test payment and any visitor can confirm a booking with Stripe's public test card.
- **Needed from you:** activate the Stripe account; set live `STRIPE_SECRET_KEY` and a **live** webhook endpoint (→ `…/functions/v1/stripe-webhook`, events `checkout.session.completed` + `checkout.session.async_payment_succeeded`) with its `STRIPE_WEBHOOK_SECRET`; enable Connect (Express) in live mode; each tutor must redo payout onboarding in live mode (test-mode Express accounts don't carry over).

#### PAY-03 · The card payment journey has never completed end to end — `BLOCKED (needs a browser test)`
- **Problem:** 0 rows in `payments` with a Stripe payment intent. Checkout, webhook confirmation, the 48 h payout and refunds are correct on inspection but **untested**.
- **Needed:** One full run in Stripe **test** mode (steps in `PRE_RELEASE_REPORT.md` → "Manual actions"). Takes ~20 minutes with two accounts.

#### PAY-04 · Paying after the booking expired still confirmed it — `FIXED` (live)
- **Problem:** Stripe Checkout links had no expiry, and the webhook only checked "already confirmed?". A student who paid after the 24 h window (slot released, maybe rebooked) got a confirmed booking — a possible double booking for the tutor.
- **Fix:** Checkout links now expire with the booking's payment window (Stripe minimum 30 min). The webhook only confirms bookings that are still awaiting payment; a late payment is recorded as `needs_review`, never confirmed, and admins are alerted to refund it.
- **Verification:** 15 unit tests; **live check:** webhook v16 rejects unsigned and forged-signature events (400) and records nothing; checkout v11 validates input. The late/duplicate-payment branches need a signed Stripe test event to exercise end to end (part of PAY-03).

#### PAY-05 · Tutors could pick PayPal payouts, which made them unbookable — `FIXED` (in PR)
- **Problem:** The tutor dashboard let tutors switch to PayPal payouts and showed "✅ PayPal payouts enabled", but card checkout requires an active Stripe account — so students got "This tutor hasn't finished setting up payouts".
- **Fix:** Payout picker hidden (Stripe-only); the dashboard always shows Stripe setup. Code kept behind a single `PAYPAL_PAYOUTS_ENABLED` switch.

#### LEG-01 · Impressum contains template placeholders on the live site — `BLOCKED (you)`
- **Evidence:** `legal.html` shows "[YOUR FULL LEGAL NAME or COMPANY NAME]", "[Street and house number]", "[Postcode City]", phone, VAT-ID and responsible-person placeholders, plus a visible "Action required" box.
- **Impact:** § 5 DDG requires a complete Impressum; incomplete ones attract fines and Abmahnungen.
- **Needed from you:** your legal name/entity, a serviceable postal address (a virtual office address is commonly used), phone or second fast contact, VAT ID if you have one. I can fill them in once you send them.

#### PAY-06 · Late student cancellation strands the tutor's share — `NEEDS REVIEW (your decision)`
- **Problem:** Student cancels < 24 h before → no refund (per your policy) → session becomes `cancelled`, payment stays `paid`. The payout job only pays `completed` sessions, and your Refund Policy says cancelled sessions get no payout. With card payments the tutor's 80 % is already in their Stripe account, so it sits there forever: not refunded, not paid out, not reclaimed.
- **Decision needed:** (a) tutor gets paid for late cancellations (common on tutoring platforms), (b) refund the student after all, or (c) UniSkilled keeps it (needs a Stripe transfer reversal). Code change is small once you decide.

#### LEG-02 · Legal pages describe PayPal checkout and omit Stripe — `FIXED (wording, in PR) · NEEDS REVIEW (lawyer)`
- **Problem:** Payment Terms / Refund Policy say payments go "through PayPal or, where offered, card"; the Privacy Policy's processor list omits **Stripe** (your only payment processor) and Klarna.
- **Fix:** Factual corrections only — card payments via Stripe; Stripe added to processors. No policy terms changed. Have a lawyer review the whole legal page before launch.

### P2 — Important

| ID | Finding | Status |
|---|---|---|
| PAY-07 | `stripe-webhook` continued after a failed payment insert. Two simultaneous deliveries of the same event could both pass the duplicate check; the second insert fails on the unique index but the code went on to **deduct the student's credit again** and send duplicate emails. Now records the payment first and stops on a duplicate-key error. Also: a **second payment** for an already-paid booking (two checkout tabs) used to be silently ignored — it is now recorded and flagged for refund. | `FIXED` (live) |
| DB-01 | No uniqueness on `payments.paypal_order_id`, or one payment per one-to-one session. Two partial unique indexes written (verified no existing duplicates). | `BLOCKED (your approval)` — migration ready |
| SEC-01 | Storage bucket `certificates` let **anyone list every tutor's uploaded transcripts**. Public file links don't need that permission (confirmed in Supabase docs); listing policy removal written. | `BLOCKED (your approval)` — migration ready |
| SEC-02 | Bucket `messages` (unused, 0 files) let any signed-in user read every attachment. Restriction to owner + admins written. | `BLOCKED (your approval)` — migration ready |
| SEC-03 | Bucket `certificates` had no size limit at storage level (only the Edge Function limited it). 10 MB limit written. | `BLOCKED (your approval)` — migration ready |
| PAY-08 | Reschedule loophole: < 24 h before a session the student can't get a refund, but they can reschedule to a later date and *then* cancel with a full refund. Either party can also reschedule without the other's agreement. | `NEEDS REVIEW (your decision)` |
| LEG-03 | 26 pages load fonts from Google (IP address sent to Google without consent). Your own privacy policy flags this; German courts have awarded damages for it. All 5 font families now self-hosted (OFL licence), same names, so no visual change intended. | `FIXED` (in PR) |
| PRIV-01 | No self-service account deletion; erasure requests go to info@uniskilled.com. A plain delete fails for any user with payments/reviews/referrals (correct — invoices must be kept 10 years), so erasure must be done by anonymising. Procedure documented in the report. | `NEEDS REVIEW` |
| OPS-02 | No alerting when a scheduled job fails (payouts, expiries). Failed payouts now notify admins; enable Supabase log alerts for the rest. | `FIXED (payouts)` / `NEEDS REVIEW` |
| OPS-03 | Edge Function source code is not in the repo (only `verify-university`), so the deployed code is the only copy. Functions changed in this audit are now versioned under `supabase/functions/`. | `FIXED (partial)` |
| DATA-01 | Test data: 13 sessions `completed` but unpaid, and 2 sessions marked paid+completed with **no payment record** (June–August). They count towards "can review" and the tutor Track Record. Not deleted (your data); clean up before launch. | `NEEDS REVIEW` |
| UX-01 | Mobile/desktop layout, console errors, real browser journeys not verified — the audit environment cannot reach uniskilled.com. | `NOT CHECKED` |

### P3 — Improvements (after launch is fine)

| ID | Finding | Status |
|---|---|---|
| SEO-01 | No custom 404 page (GitHub Pages default shown). Added `404.html`. | `FIXED` (in PR) |
| SEC-04 | Supabase "leaked password protection" is off (Dashboard → Auth → Passwords; may need the Pro plan). | `NEEDS REVIEW` |
| SEC-05 | Security headers in `netlify.toml` (X-Frame-Options etc.) don't apply on GitHub Pages. Consider Cloudflare in front, or accept. | `NEEDS REVIEW` |
| SEC-06 | `create-stripe-checkout` and `create-paypal-order` don't check who is calling. Low risk (the caller can only pay for an existing booking at its real price), but should require the student's login. | `NEEDS REVIEW` |
| SEC-07 | Advisor warnings: 3 SECURITY DEFINER views (`public_tutors`, `public_tutor_subject_stats`, `group_session_seats`) and helper functions callable by `anon`. Reviewed: they expose only public columns / return false for anonymous users. Accepted. | `PASS (inspected)` |
| PRIV-02 | Signed-in users can read all `student_profiles` columns incl. gender, CV link and earnings fields. Consider a public view instead. | `NEEDS REVIEW` |
| FIN-01 | Stripe processing fees are paid by UniSkilled on destination charges; with a full referral discount on a €10 booking the platform nets about −€0.40. Financial-policy decision only. | `NEEDS REVIEW` |
| DOC-01 | `INTEGRATION_GUIDE.md` documents a retired API and is publicly served. | `NEEDS REVIEW` |
| PROD-01 | `hire-talent.html` (business demo, restricted to business/admin roles) shows hard-coded "8 AI matches today". | `NEEDS REVIEW` |

---

## Full checklist by area

### A. Core functionality

| Item | Status | Notes |
|---|---|---|
| Homepage & navigation | PASS (inspected) | No broken internal links (automated check, `tests/static_checks.py`). |
| Student registration & login | PASS (inspected) | Supabase Auth; all 10 accounts email-confirmed. Not exercised in a browser. |
| Onboarding | PASS (inspected) | Business role correctly redirected to Coming Soon. |
| Student & tutor profiles | PASS (inspected) | All user text escaped (`__esc`), URLs sanitised (`__safeUrl`). |
| University verification | PASS (inspected) | Code by email to a known university domain; hashed codes, 5 attempts, rate limits, one inbox per account. **No tutor verified yet.** |
| Tutor subjects & qualifications | PASS (inspected) | Certificates via `upload-certificate` (type + size checked). |
| Tutor search / filters / profile pages | PASS (inspected) | Public data via `public_tutors` view. |
| Booking & scheduling | PASS (tested at DB level) | Minimum price, future start, 15–480 min, currency match, no self-booking, tutor clash check enforced in the database. |
| Confirmation / cancellation / rescheduling | PASS (inspected) · see PAY-06, PAY-08 | Server-side, login-checked, refunds reverse the tutor transfer. |
| Student dashboard / tutor dashboard | PASS (inspected) · PAY-05 fixed | |
| Account settings & profile editing | PASS (tested at DB level) | Own rows only; protected fields blocked by triggers. |
| Notifications & emails | PASS (inspected) | See section E. |
| Empty/loading/error states, mobile | NOT CHECKED | UX-01. |

### B. Payments & financial integrity

| Item | Status | Notes |
|---|---|---|
| Checkout & payment confirmation | PASS (inspected) · PAY-03 untested | Confirmation only via signed webhook; browser redirect only polls the server. |
| 20 % platform fee | PASS (inspected) | Read from `platform_settings`; application fee = 20 % − discount. |
| Tutor earnings / platform revenue | PASS (inspected) | Tutor always 80 % of full price. |
| Referral discounts — who pays | PASS (inspected) | Capped at platform fee; tutor unaffected; unused part kept as credit. |
| Duplicate payments / bookings | PASS (tested) + PAY-07 fixed (live), DB-01 awaiting approval | Unique Stripe payment intent; tutor clash check; PayPal order reuse blocked. |
| Failure / cancellation / refund / dispute | PASS (inspected) · PAY-06 open | Refunds reverse transfer + application fee; partial dispute refunds reduce tutor payout proportionally (earlier bug confirmed fixed). |
| Payout eligibility & status | FIXED (PAY-02) | |
| Stripe Connect onboarding | PASS (inspected) | Express, manual payouts, status only from Stripe. |
| PayPal capture & payouts | FIXED (PAY-01) — dormant | |
| 48-hour hold | PASS (inspected) | Hold starts when the job marks the session complete; open disputes pause it. |
| Currency & minimums | PASS (tested at DB level) | EUR/USD; €10 / $11 minimum; group sessions EUR only (known scope limit). |
| Webhook signature, retries, idempotency | PASS (inspected) + PAY-07 fixed | HMAC-SHA256, 5-minute tolerance, fail-closed. |
| Manipulated prices / fees / statuses | PASS (tested) | Database security suite: 31/31 (29 attacks blocked + 2 controls). |
| Reconciliation DB ↔ providers | NEEDS REVIEW | No automated reconciliation. Weekly manual check suggested (report). |

### C. Database & backend

| Item | Status | Notes |
|---|---|---|
| Supabase configuration | PASS | Project healthy, Postgres 17. |
| Schema, relationships, constraints, indexes | PASS (inspected) + DB-01 fixed | |
| Row Level Security | PASS (tested) | Enabled on all 42 tables; 2 tables with RLS and no policies are server-only by design. |
| Authorization in Edge Functions | PASS (inspected) | All 43 reviewed: user functions verify the login token; jobs use the Vault cron secret; money-moving functions are server-only; 12 legacy/one-off functions are retired stubs. |
| Validation & sanitisation | PASS (inspected) | |
| Race conditions & duplicates | PASS (inspected) + PAY-07 fixed | Atomic claims for payouts and referral rewards. |
| Booking/payment state consistency | FIXED (PAY-04) · PAY-06 open | |
| Migrations & seed data | NEEDS REVIEW | Schema history lives in Supabase; repo has 2 SQL files + the new migration. DATA-01. |
| Error handling & logging | PASS (inspected) · OPS-02 | |
| Rate limiting & abuse | PASS (partial) | Verification codes and domain requests rate-limited; Supabase Auth rate limits apply. Booking-email sending not rate-limited (P3). |
| Backup & recovery | NEEDS REVIEW | Check your Supabase plan's backup retention; test a restore once. |

### D. Security & privacy

| Item | Status | Notes |
|---|---|---|
| Authentication & sessions | PASS (inspected) | |
| Password reset & email verification | PASS (inspected) | Branded template live (per earlier work). |
| Unauthorized access to user data | PASS (tested) | Emails, phones, PayPal emails, Stripe IDs hidden by column grants. |
| Secrets in frontend or Git history | PASS (tested) | 403 commits scanned; only the public anon key ever committed. No rotation needed. |
| API keys & environment variables | PASS (inspected) | All secrets read from Supabase secrets. |
| SQL injection / XSS / CSRF | PASS (inspected) | No raw SQL from the client; HTML escaping throughout; bearer-token auth (not cookies), so CSRF doesn't apply. |
| File uploads | PASS (inspected) · SEC-01/02/03 awaiting approval | |
| Webhook security | PASS (inspected) | |
| Impersonation / fake accounts | PASS (partial) | University verification for tutors; students are unverified by design. |
| Personal-data exposure | PASS (tested) · PRIV-02 | |
| Account & data deletion | NEEDS REVIEW (PRIV-01) | |
| Dependency vulnerabilities | PASS | No npm dependencies; Supabase JS pinned from CDN. |
| Production vs development config | BLOCKED (OPS-01) | Stripe test mode; PayPal sandbox (now disabled). |

### E. Emails & notifications

| Item | Status | Notes |
|---|---|---|
| Welcome / verification emails | PASS (inspected) | Supabase Auth emails. |
| Password reset | PASS (inspected) | |
| Booking confirmations, changes, cancellations | PASS (inspected) | |
| Payment receipts & payout notifications | PASS (partial) | Confirmation emails sent; no formal receipt/invoice PDF (see F). |
| Template correctness & branding | PASS (inspected) | All values HTML-escaped. |
| Delivery failures & retries | NEEDS REVIEW | Failures logged, not retried. Acceptable at launch volume. |
| Duplicate notifications | FIXED (PAY-07) | |
| Production domain & sender | NEEDS REVIEW | Earlier test landed in inbox; confirm SPF/DKIM/DMARC show "Verified" in Resend. |

### F. Legal & operational readiness *(not legal advice — have a lawyer review)*

| Item | Status | Notes |
|---|---|---|
| Terms of Service | NEEDS REVIEW | Present and detailed. |
| Privacy Policy / GDPR | FIXED (LEG-02 wording) · NEEDS REVIEW | |
| Cookie consent | PASS (inspected) | No analytics or tracking cookies found; only essential login storage. Self-hosted fonts remove the main consent issue. |
| Refund, cancellation, disputes | NEEDS REVIEW | PAY-06, PAY-08. |
| Marketplace & tutor responsibilities | NEEDS REVIEW | Includes non-circumvention clause. |
| Tax, invoicing, payouts | NEEDS REVIEW | Who invoices whom, VAT on the platform fee, tutors' own tax duties, DAC7 platform reporting — needs a tax adviser. |
| Impressum | BLOCKED (LEG-01) | |
| Support contact & complaints | PASS (inspected) | info@uniskilled.com; disputes via "Report an Issue". |
| Accessibility | NOT CHECKED | Needs a browser audit. |
| SEO, social previews, 404 | PASS + SEO-01 fixed | Public pages have title, description, Open Graph; robots.txt excludes private pages. |

### G. Performance, reliability & deployment

| Item | Status | Notes |
|---|---|---|
| Production build / lint / type-check | N/A | Static site, no build step. Automated static checks added instead. |
| Automated tests | FIXED | Added `tests/`: database security 31/31, function logic 30/30, website static checks 22/22 (and 18 of those fail on the old code, proving they detect the issues). |
| Broken routes & links | PASS (tested) | |
| Console errors / failed requests | NOT CHECKED | UX-01. |
| Mobile & desktop layouts | NOT CHECKED | UX-01. |
| Page performance & images | PASS (inspected) | Hero images externalised; largest image 248 KB. |
| Environment configuration | BLOCKED (OPS-01) | |
| Deployment & domain | PASS (inspected) | GitHub Pages + CNAME. Merging to `main` deploys. |
| Logging & monitoring | NEEDS REVIEW (OPS-02) | |
| Recovery procedures | NEEDS REVIEW | |
| Analytics | PASS | None installed. |

### H. Product-specific features

| Feature | Status | Reality in the code |
|---|---|---|
| Verified university-student tutoring | Implemented | Email-code verification against 10,587 known university domains; badge shown; unverified tutors still listed (your decision). |
| Eligibility from completed subjects / grades | Partial | Tutors self-declare courses, grade and certificates; `grade_verified_at` can only be set by admin. No automated grade check. |
| University, degree, year, subjects | Implemented | |
| Availability & booking | Implemented | Blocked-slot calendar + clash checks. |
| **Ferkad Score** | **Not built** | No code anywhere. |
| **06:00 matching engine** | **Not built** | No scheduled matching job. `ai_matching_enabled=true` in settings has no code behind it. |
| Referral discounts | Implemented | €10 referrer reward after invitee's first completed session. |
| Group sessions | Implemented | 2–4 students, cancelled + refunded if < 2 paid 12 h before. |
| Disputes | Implemented | |
| AI-powered student features | **Not built** | No AI/LLM integration exists. Business "AI matching" pages are a demo with fixed numbers. |

---

## Change log (this audit)

See `PRE_RELEASE_REPORT.md` → "Files changed" for the complete list with reasons.
