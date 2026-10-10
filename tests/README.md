# UniSkilled tests

Three suites. None of them touch real money, send emails, or change data.

| Suite | What it proves | How to run |
|---|---|---|
| `static_checks.py` | Website: valid JavaScript on every page, no broken links, fonts self-hosted (no Google), no committed secrets, card-only payment page, PayPal payout picker off, legal page facts, 404 page. | `python3 tests/static_checks.py` (needs Node.js) |
| `functions/*.test.ts` | Money decisions inside the Edge Functions: payout routing, PayPal on/off switch, which payments may confirm a booking, duplicate-delivery handling, checkout-link expiry. | `node --experimental-strip-types --test tests/functions/*.test.ts` (Node 22+) |
| `db/security_tests.sql` | Database permissions, tested by impersonating real users: students/tutors can't change prices, payment status, payouts, roles, credit, ratings or verification; strangers can't read or edit others' data. Every attempt is rolled back. | Paste into Supabase → SQL Editor → Run. Every row must show `pass = true`. |

Type-check the Edge Functions offline (optional, needs Deno):

```
deno check --config tests/typecheck/deno.json supabase/functions/*/index.ts
```

What these do **not** cover (needs a person with a browser — see `PRE_RELEASE_REPORT.md`):
a real Stripe test-mode payment end to end, layouts on phones, and email delivery.
