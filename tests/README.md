# UniSkilled tests

These run automatically on every pull request (see `ENGINEERING.md`). None of them touch real money, send emails, or change data.

| Suite | What it proves | How to run |
|---|---|---|
| `static_checks.py` | Website: valid JavaScript on every page, no broken links, fonts self-hosted (no Google), no committed secrets, card-only payment page, PayPal payout picker off, legal page facts, 404 page. | `python3 tests/static_checks.py` (needs Node.js) |
| `functions/*.test.ts` | Money decisions inside the Edge Functions: payout routing, PayPal on/off switch, which payments may confirm a booking, duplicate-delivery handling, checkout-link expiry. | `node --experimental-strip-types --test tests/functions/*.test.ts` (Node 22+) |
| `e2e/smoke.spec.ts` | Browser: every page opens in Chromium (desktop + phone) without a JavaScript crash; signed-out visitors are redirected to sign in. Analytics are blocked during tests. | `npm ci && npx playwright install chromium && npm run test:e2e` |
| `load/browse.js` | Many visitors browsing at once (k6). Read-only. Run against staging. | GitHub → Actions → Load test |
| `db/security_tests.sql` | Database permissions, tested by impersonating real users: students/tutors can't change prices, payment status, payouts, roles, credit, ratings or verification; strangers can't read or edit others' data. Every attempt is rolled back. | Paste into Supabase → SQL Editor → Run, or automatic with the `DATABASE_URL` secret. Every row must show `pass = true`. It skips admin accounts (admins may bypass the guards by design). |
| `db/group_seat_tests.sql` | Group sessions: a student can't join a full, cancelled or about-to-start group, can't set or extend their own payment deadline, and can't see who else joined (the tutor can). Creates temporary groups and rolls everything back. | Same as above. Needs 1 tutor and 4 student accounts. Passes only once migration `20261024180000_group_seat_guards.sql` is applied. |

Type-check the Edge Functions offline (optional, needs Deno):

```
deno check --config tests/typecheck/deno.json supabase/functions/*/index.ts
```

What these do **not** cover (needs a person with a browser — see `PRE_RELEASE_REPORT.md`):
a real Stripe test-mode payment end to end, layouts on phones, and email delivery.
