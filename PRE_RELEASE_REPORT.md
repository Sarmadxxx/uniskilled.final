# UniSkilled — Pre-Release Report

**Date:** 10 October 2026 · **Scope:** website repo `Sarmadxxx/uniskilled.final` + Supabase project `orghkbbohnabcietidiv` (database, 43 Edge Functions, 4 scheduled jobs, storage)
**Detailed findings:** `PRE_RELEASE_CHECKLIST.md`

---

## Recommendation: **NOT READY** — but close

The platform's foundations are much stronger than a typical first launch: the database blocks every tampering attempt I tried, payments are confirmed only by signed Stripe webhooks, refunds correctly claw back the tutor's share, and secrets have never been committed.

It is **not ready** because four things outside the code are still open, and one of them is that the site **cannot take real money yet**:

1. **Stripe is in test mode** (OPS-01). Until live keys are set, nobody can pay — and anyone can "pay" with Stripe's public test card.
2. **The card payment journey has never been completed once** (PAY-03). It is correct on inspection, but a 20-minute test-mode run is essential before real students pay.
3. **The Impressum shows template placeholders** on the live Legal page (LEG-01) — a legal risk in Germany.
4. **One payment-policy decision** (PAY-06): what happens to the money when a student cancels late.

Once those are done (plus merging the PR), the honest status becomes **READY AFTER REQUIRED ACTIONS → READY FOR CONTROLLED RELEASE** with a small first cohort.

---

## Findings by priority

| Priority | Found | Fixed | Awaiting your approval | Your action / decision | Accepted or later |
|---|---|---|---|---|---|
| **P0** critical | 2 | **2** | – | – | – |
| **P1** launch blocker | 7 | **3** | – | 4 | – |
| **P2** important | 12 | **8** | – | 3 | 1 not checked |
| **P3** improvement | 9 | **1** | – | – | 8 |
| **Total** | **30** | **14** | – | **7** | **9** |

---

## What I fixed

### Critical (P0) — both deployed and verified live

**PAY-01 · Fake PayPal payments could confirm real bookings.** The payment page offered PayPal by default, and PayPal runs in *sandbox* mode (your PayPal can't go live without a Business account). Anyone with a free PayPal developer account could "pay" with test money and get a confirmed session — the tutor would teach for free.
→ PayPal checkout now refuses to run unless two settings are both on (`PAYPAL_CHECKOUT_ENABLED=true` **and** `PAYPAL_ENV=live`). The payment page shows card only unless the server says PayPal is on. PayPal code is kept dormant, as you decided on 9 Oct.
*Verified live:* order creation and capture both return 403; the config endpoint reports PayPal off.

**PAY-02 · The payout job could pay tutors twice.** Card payments put the tutor's 80 % straight into their Stripe account. The hourly payout job decided *how* to pay from the tutor's **preference** — so for a tutor set to PayPal it sent a separate PayPal payout from UniSkilled's own money while the card money stayed in their Stripe account.
→ The payout route now follows where the money actually is (card → tutor's Stripe balance, PayPal → PayPal). Failed or stuck payouts now alert you (previously only logged). Amounts, the 20 % fee and the 48-hour hold are unchanged.
*Verified live:* new version ran a real scheduled batch correctly and rejects unauthenticated calls.

### Launch blockers (P1)

- **PAY-04 · Late payments confirmed expired bookings** (possible double-booking for the tutor). Stripe checkout links now expire with the booking's 24-hour window, and the webhook only confirms bookings still awaiting payment. *(live)*
- **PAY-05 · Tutors could make themselves unbookable** by switching to PayPal payouts (card checkout requires Stripe). The picker is hidden; Stripe setup is always shown. *(in PR)*
- **LEG-02 · Legal page described PayPal checkout and didn't list Stripe** as a processor. Factual corrections only; no policy terms changed. *(in PR — have a lawyer review the page)*

### Important (P2)

- **PAY-07 · Duplicate webhook deliveries could deduct a student's credit twice**, and a **second payment** for an already-paid booking (two checkout tabs) was silently ignored with no record. The webhook now records the payment first (the database's uniqueness rule acts as a lock) and flags any late/second/orphaned payment for refund instead of confirming or losing it. *(live)*
- **LEG-03 · Fonts loaded from Google on 26 pages** (sends visitors' IP addresses to Google — a known German GDPR issue your own privacy policy warned about). All five font families are now self-hosted under their open licence, with the same names, so the design shouldn't change. *(in PR)*
- **OPS-02 · Payout failures now alert admins** (max once per 24 h per problem). *(live)*
- **OPS-03 · Edge Function code is now versioned** in the repo for the six functions I changed (`supabase/functions/`), including a snapshot of exactly what was live before, so every change is reviewable and reversible.

### Improvement (P3)
- **SEO-01 · Custom 404 page** added. *(in PR)*

### Applied with your approval (10 Oct)
- **DB-01** duplicate-payment safety indexes · **SEC-01** strangers can no longer list tutors' uploaded transcripts (tested: 0 of 9 visible) · **SEC-02** message attachments uploader/admin only · **SEC-03** 10 MB certificate limit.

---

## Tests run — actual results

| Suite | Result | Notes |
|---|---|---|
| Database security (`tests/db/security_tests.sql`) | **31 / 31 pass** | Impersonates a real student, tutor and stranger and attempts 29 attacks (change price, mark paid, mark completed, back-date to skip the hold, make self admin, add credit, fake the Verified badge, inflate ratings, read others' emails/phones/PayPal/Stripe IDs, write payments, change the fee…) plus 2 controls proving legitimate edits work. Every attempt is rolled back. Run before and after the fixes. |
| Payment logic unit tests (`tests/functions/`) | **30 / 30 pass** | Payout routing, PayPal switch, confirm decisions, duplicate handling, checkout expiry. |
| Website static checks (`tests/static_checks.py`) | **22 / 22 pass** | JS syntax on 41 scripts, links, fonts, secrets, payment page, dashboard switch, legal facts, 404. **The same suite fails 18 checks on the original code**, proving it detects these issues. |
| Edge Function type-check (Deno 2.9.6) | **Pass** | All six changed functions. One pre-existing type error in the live payout job was fixed. Lint: only import-style notes (Supabase's standard template). |
| Live checks of deployed functions | **Pass** | Called from inside Supabase: PayPal endpoints 403, config "off"; payout job correct run + 403 without secret; webhook rejects unsigned and forged events (400) and records nothing; checkout validates input. |
| Git history secret scan (403 commits) | **Pass** | Only the public anon key was ever committed. No rotation needed. |
| Production build / lint / TypeScript (website) | **N/A** | Static HTML site with no build step; replaced by the static checks above. |
| Browser journeys, mobile layouts, email delivery | **Not run** | This environment cannot reach uniskilled.com. See manual actions. |

## Security findings (summary)

Strong overall. RLS is on for all 42 tables; protected fields (prices, payment status, roles, credit, verification, ratings, Stripe status) are guarded by database triggers; private columns are hidden by column permissions; all 43 Edge Functions check identity correctly (or are retired stubs); HTML output is escaped throughout; webhook signatures are verified fail-closed.

Fixed on 10 Oct: SEC-01/02/03 (strangers can no longer list tutors' transcripts — tested 0 of 9 visible; message attachments owner-only; 10 MB limit). Open: leaked-password protection off (SEC-04), security headers not applied on GitHub Pages (SEC-05), checkout endpoints don't check the caller (SEC-06, low risk).

## Payment & payout findings (summary)

Correct by inspection and/or test: 20 % fee, 80 % tutor share, referral discounts never touch the tutor's share, refunds reverse the tutor transfer, partial dispute refunds reduce the payout proportionally (the earlier bug is fixed), 48-hour hold with dispute pause, atomic payout claims with idempotency keys.

Fixed: PAY-01, PAY-02, PAY-04, PAY-05, PAY-07. Open: OPS-01 (test mode), PAY-03 (untested end to end), PAY-06 and PAY-08 (your decisions), FIN-01 (Stripe fees on heavily discounted small bookings — information only).

## Database & deployment risks

- **Hardening applied 10 Oct:** 2 unique indexes and the certificate size limit (migration `pre_release_hardening_part1`); storage rules changed in the dashboard. Non-destructive; no data changed.
- **Test data** in the live database (DATA-01): 13 unpaid "completed" sessions and 2 "paid" sessions without payment records.
- **Account deletion** (PRIV-01): deletes fail for anyone with payments/reviews (correctly — invoices must be kept 10 years), so erasure = anonymisation. Procedure below.
- **Backups:** confirm your Supabase plan's backup retention and do one test restore.
- **Deploying the website** = merging to `main` (GitHub Pages). Edge Functions deploy instantly and separately.

---

## Manual actions required from you (in order)

1. ~~Approve the database migration~~ — **done 10 Oct**, verified.
2. **Merge pull request `pre-release-audit`** on GitHub. *(Why: until then the live payment page still opens on the PayPal tab and shows "PayPal checkout couldn't load" — card still works on the Card tab. After merging, hard-refresh the site.)*
3. **Fill in the Impressum** — send me your legal name/entity, a postal address for service, phone or second fast contact, and VAT ID if any, and I'll update `legal.html`. *(Legal requirement in Germany.)*
4. **Decide PAY-06** (late student cancellation): (a) tutor gets paid, (b) refund the student, or (c) UniSkilled keeps it. And **PAY-08**: should a reschedule within 24 h keep the "no refund" rule for a later cancellation?
5. **Run one full card test in Stripe test mode** (PAY-03), ~20 minutes:
   1. As a **tutor** account: Tutor dashboard → Set up payouts → complete Stripe test onboarding (Stripe's test data: phone `000 000 0000`, SMS code `000000`, IBAN `DE89370400440532013000`).
   2. As a **student** account (different browser profile): book that tutor at least 2 days ahead, ≥ €10.
   3. As the tutor: accept the request.
   4. As the student: Pay now → card `4242 4242 4242 4242`, any future date, any CVC.
   5. Check: page shows "Payment confirmed"; both dashboards show the session confirmed; both get emails; Supabase → `payments` has one row with a Stripe payment intent.
   6. Also try card `4000 0000 0000 0002` (declined) on a second booking — it must stay "awaiting payment".
   Tell me when done and I'll verify the database side and the webhook logs.
6. **Go live with Stripe** (OPS-01): activate the account; in Supabase → Edge Functions → Secrets set the live `STRIPE_SECRET_KEY`; in Stripe (live mode) add the webhook endpoint `https://orghkbbohnabcietidiv.supabase.co/functions/v1/stripe-webhook` with events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, then set its signing secret as `STRIPE_WEBHOOK_SECRET`. Tutors must redo payout onboarding in live mode.
7. **Lawyer & tax adviser review:** Terms, Privacy Policy, Refund Policy, the "payment protected / full refund guaranteed" banners, invoicing/VAT on the platform fee, and DAC7 platform reporting.
8. **Supabase dashboard:** turn on leaked-password protection (Auth → Passwords) if your plan allows; confirm Resend shows SPF/DKIM "Verified".
9. **Clean up test data** (DATA-01) before inviting real users — I can do this on your instruction.

### Erasure-request procedure (until a self-service button exists)
For a user with no payments: delete them in Supabase → Authentication (their data cascades). For a user with payments, keep the payment rows and anonymise instead: replace name/email/phone/bio/avatar in `users`, `student_profiles`, `tutor_profiles` with placeholders, delete their messages and uploaded files, then delete the login in Authentication. Ask me to turn this into a one-click admin function after launch.

---

## Incomplete or untested features

- **Not built:** Ferkad Score, the 06:00 matching engine, any AI features (the `ai_matching_enabled` setting has no code behind it). Business "AI matching" pages are a demo with fixed numbers, visible only to business/admin roles.
- **Partial:** tutor eligibility by grades (self-declared; admin-only grade verification); group sessions are EUR-only.
- **Untested end to end:** card checkout, refunds and payouts in Stripe test mode; transactional email delivery; mobile layouts and accessibility.

## Recommended next steps (priority order)

1. Merge the PR (today).
2. Complete the Impressum and the two policy decisions.
3. Run the Stripe test-mode journey (step 5 above); I'll verify the backend side.
4. Lawyer/tax review in parallel.
5. Switch Stripe to live; one real low-value booking between two people you trust; refund it to test refunds.
6. Controlled release to a small first group of tutors and students; watch the admin notifications daily for the first two weeks.
7. After launch: self-service account deletion, caller checks on the checkout endpoints (SEC-06), accessibility pass, automated reconciliation with Stripe.

---

## Files changed

| File | Why |
|---|---|
| `supabase/functions/release-tutor-payout/` (`index.ts`, `payout-route.ts`) | PAY-02 payout routing by payment origin; OPS-02 admin alerts; pre-existing type error fixed. **Deployed v16.** |
| `supabase/functions/stripe-webhook/` (`index.ts`, `confirm-logic.ts`) | PAY-04, PAY-07: record-then-confirm, duplicate stop, only confirm awaiting bookings, flag late/second/orphaned payments. **Deployed v16.** |
| `supabase/functions/create-stripe-checkout/` (`index.ts`, `checkout-expiry.ts`) | PAY-04: checkout link expires with the payment window. **Deployed v11.** |
| `supabase/functions/paypal-config/`, `create-paypal-order/`, `capture-paypal-order/` (+ `paypal-gate.ts` each) | PAY-01 PayPal off switch. **Deployed v2 / v13 / v18.** |
| `supabase/migrations/20261010120000_pre_release_hardening.sql` | DB-01, SEC-01/02/03. **Applied 10 Oct** (storage part via the dashboard). |
| `complete-payment.html` | PAY-01 card default, PayPal only if enabled; discount preview capped like the server. |
| `tutor-dashboard.html` | PAY-05 PayPal payout picker off. |
| `legal.html` | LEG-02 factual payment/processor corrections; Google Fonts rows removed. |
| 26 `*.html` pages, `fonts/` (16 font files, `fonts.css`, `LICENSES.md`) | LEG-03 self-hosted fonts. |
| `404.html` | SEO-01. |
| `tests/` (`db/security_tests.sql`, `functions/payments-logic.test.ts`, `static_checks.py`, `typecheck/`, `README.md`) | Automated tests. |
| `PRE_RELEASE_CHECKLIST.md`, `PRE_RELEASE_REPORT.md` | This audit. |

**Rollback:** every deployed function's previous version is in commit `254abbc` (`supabase/functions/*/index.ts`); redeploying that file restores it.
