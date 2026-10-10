-- UniSkilled — database security tests (read-only in effect)
--
-- What this does: impersonates real signed-in users (a student, their tutor, and an unrelated
-- "stranger") and tries things they must NOT be able to do — change prices, mark bookings paid,
-- make themselves admin, read other people's private data, and so on.
--
-- Safety: every attempt runs inside a sub-transaction that is ALWAYS rolled back (it ends by
-- raising a sentinel error), so nothing in the database can change, even if a test fails.
--
-- How to run: paste into Supabase Dashboard → SQL Editor and click Run, or run via the
-- Supabase MCP execute_sql tool. Every row in the result should show pass = true.
--
-- Result meanings:  'SENTINEL:n'  = the statement ran and touched n rows (then was rolled back)
--                   anything else  = the database refused it (the error message is shown)

CREATE OR REPLACE FUNCTION pg_temp.attempt(p_uid uuid, p_role text, p_sql text)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r text; n int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', p_role)::text, true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    PERFORM set_config('request.jwt.claim.role', p_role, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'SENTINEL:%', n;
  EXCEPTION WHEN OTHERS THEN
    r := SQLERRM;
  END;
  RETURN r;
END $f$;

WITH ids AS (
  SELECT s.id AS sid, s.student_id AS stu, s.tutor_id AS tut,
         (SELECT u.id FROM public.users u
           WHERE u.id NOT IN (s.student_id, s.tutor_id)
             AND NOT ('admin' = ANY (coalesce(u.roles::text[], '{}')))
           LIMIT 1) AS str,
         (SELECT tp.user_id FROM public.tutor_profiles tp
           WHERE coalesce(tp.is_active, true) LIMIT 1) AS any_tutor
  FROM public.sessions s
  WHERE s.student_id <> s.tutor_id
    -- the tutor must have a real tutor profile, otherwise profile tests touch 0 rows and prove nothing
    AND EXISTS (SELECT 1 FROM public.tutor_profiles tp WHERE tp.user_id = s.tutor_id)
  ORDER BY s.created_at DESC LIMIT 1
),
cases(test, who, role, sql_tpl, expect) AS (VALUES
  -- ── Booking & payment tampering (sessions) ──
  ('Student cannot change the price of their own booking',        'stu','authenticated', 'UPDATE public.sessions SET price = price + 1 WHERE id = %L', 'blocked'),
  ('Student cannot mark their own booking as paid',               'stu','authenticated', 'UPDATE public.sessions SET payment_status = ''paid'' WHERE id = %L', 'blocked'),
  ('Student cannot mark their own booking as confirmed',          'stu','authenticated', 'UPDATE public.sessions SET status = ''confirmed'' WHERE id = %L', 'blocked'),
  ('Tutor cannot mark a session completed (triggers payout)',     'tut','authenticated', 'UPDATE public.sessions SET status = ''completed'' WHERE id = %L', 'blocked'),
  ('Tutor cannot back-date completion to skip the 48h hold',      'tut','authenticated', 'UPDATE public.sessions SET completed_at = now() - interval ''30 days'' WHERE id = %L', 'blocked'),
  ('Stranger cannot read someone else''s booking',                'str','authenticated', 'SELECT 1 FROM public.sessions WHERE id = %L', 'zero_rows'),
  ('Stranger cannot modify someone else''s booking',              'str','authenticated', 'UPDATE public.sessions SET notes = ''x'' WHERE id = %L', 'zero_rows'),
  ('Anonymous visitor cannot read bookings',                      'none','anon',         'SELECT 1 FROM public.sessions WHERE id = %L', 'blocked_or_zero'),
  -- ── Creating bookings ──
  ('Student cannot create a booking that is already confirmed',   'stu','authenticated', 'INSERT INTO public.sessions (student_id, tutor_id, status, price, currency, scheduled_date, scheduled_time, duration_minutes, timezone, subject) SELECT %L::uuid, any_tutor, ''confirmed'', 50, ''EUR'', (now() + interval ''3 days'')::date, ''10:00'', 60, ''Europe/Berlin'', ''Test'' FROM (SELECT %L::uuid AS any_tutor) t', 'blocked'),
  ('Student cannot book below the minimum price',                 'stu','authenticated', 'INSERT INTO public.sessions (student_id, tutor_id, status, price, currency, scheduled_date, scheduled_time, duration_minutes, timezone, subject) SELECT %L::uuid, any_tutor, ''pending'', 1, ''EUR'', (now() + interval ''3 days'')::date, ''10:00'', 60, ''Europe/Berlin'', ''Test'' FROM (SELECT %L::uuid AS any_tutor) t', 'blocked'),
  -- ── Payments table ──
  ('Signed-in user cannot insert a payment record',               'stu','authenticated', 'INSERT INTO public.payments (session_id, payer_id, payee_id, type, amount, status) VALUES (%L, %L, %L, ''session'', 1, ''paid'')', 'blocked'),
  ('Tutor cannot edit their payout amount',                       'tut','authenticated', 'UPDATE public.payments SET tutor_payout = 9999 WHERE payee_id = %L', 'blocked_or_zero'),
  -- ── Account privileges (users) ──
  ('User cannot make themselves admin',                           'stu','authenticated', 'UPDATE public.users SET roles = array_append(roles, ''admin''::public.user_role) WHERE id = %L', 'blocked'),
  ('User cannot give themselves account credit',                  'stu','authenticated', 'UPDATE public.users SET credit_balance = 1000 WHERE id = %L', 'blocked'),
  ('User cannot un-suspend / alter suspension fields',            'stu','authenticated', 'UPDATE public.users SET suspended_reason = ''self-edit test'' WHERE id = %L', 'blocked'),
  ('User cannot read other users'' email addresses',              'str','authenticated', 'SELECT email FROM public.users WHERE id = %L', 'blocked'),
  ('User cannot read other users'' phone numbers',                'str','authenticated', 'SELECT phone FROM public.users WHERE id = %L', 'blocked'),
  -- ── Tutor trust & payout fields (tutor_profiles) ──
  ('Tutor cannot mark their Stripe payouts as active',            'tut','authenticated', 'UPDATE public.tutor_profiles SET stripe_account_status = ''active'' WHERE user_id = %L AND stripe_account_status IS DISTINCT FROM ''active''', 'blocked_or_zero'),
  ('Tutor cannot give themselves the University Verified badge',  'tut','authenticated', 'UPDATE public.tutor_profiles SET university_verified_at = now() WHERE user_id = %L', 'blocked'),
  ('Tutor cannot inflate their rating',                           'tut','authenticated', 'UPDATE public.tutor_profiles SET rating_avg = 5, review_count = 500 WHERE user_id = %L', 'blocked'),
  ('Others cannot read a tutor''s PayPal email',                  'str','authenticated', 'SELECT paypal_email FROM public.tutor_profiles WHERE user_id = %L', 'blocked'),
  ('Others cannot read a tutor''s Stripe account id',             'str','authenticated', 'SELECT stripe_account_id FROM public.tutor_profiles WHERE user_id = %L', 'blocked'),
  ('Stranger cannot edit another tutor''s profile',               'str','authenticated', 'UPDATE public.tutor_profiles SET bio = ''x'' WHERE user_id = %L', 'zero_rows'),
  ('CONTROL: tutor CAN edit their own bio (proves rows are reachable)', 'tut','authenticated', 'UPDATE public.tutor_profiles SET bio = bio WHERE user_id = %L', 'allowed'),
  ('CONTROL: student CAN read their own booking',                 'stu','authenticated', 'SELECT 1 FROM public.sessions WHERE id = %L', 'allowed'),
  -- ── Reviews, referrals, notifications, settings ──
  ('Cannot post a review without a completed session',            'str','authenticated', 'INSERT INTO public.reviews (student_id, tutor_id, rating, comment) VALUES (%L, %L, 5, ''x'')', 'blocked'),
  ('Cannot create referral records directly',                     'stu','authenticated', 'INSERT INTO public.referrals (referrer_id, invitee_id, referral_code, status) VALUES (%L, %L, ''X'', ''qualified'')', 'blocked'),
  ('Cannot send a notification to an unrelated user',             'str','authenticated', 'INSERT INTO public.notifications (user_id, type, title, body) VALUES (%L, ''x'', ''x'', ''x'')', 'blocked'),
  ('Non-admin cannot change the platform fee',                    'stu','authenticated', 'UPDATE public.platform_settings SET value = ''0'' WHERE key = ''platform_fee_rate''', 'blocked_or_zero'),
  ('Anonymous visitor cannot check the cron secret',              'none','anon',         'SELECT public.verify_cron_secret(''guess'')', 'blocked'),
  ('Anonymous visitor cannot read disputes',                      'none','anon',         'SELECT 1 FROM public.disputes', 'blocked_or_zero')
),
run AS (
  SELECT c.test, c.expect,
    pg_temp.attempt(
      CASE c.who WHEN 'stu' THEN i.stu WHEN 'tut' THEN i.tut WHEN 'str' THEN i.str ELSE NULL END,
      c.role,
      CASE
        WHEN c.test LIKE 'Student cannot create%' OR c.test LIKE 'Student cannot book below%'
          THEN format(c.sql_tpl, i.stu, coalesce(nullif(i.any_tutor, i.stu), i.tut))
        WHEN c.test LIKE 'Signed-in user cannot insert a payment%'
          THEN format(c.sql_tpl, i.sid, i.stu, i.tut)
        WHEN c.test LIKE 'Cannot post a review%'
          THEN format(c.sql_tpl, i.str, i.tut)
        WHEN c.test LIKE 'Cannot create referral%'
          THEN format(c.sql_tpl, i.stu, i.str)
        WHEN c.test LIKE 'Cannot send a notification%'
          THEN format(c.sql_tpl, i.stu)
        WHEN c.sql_tpl LIKE '%user_id = %L%' AND c.test LIKE '%tutor%'
          THEN format(c.sql_tpl, i.tut)
        WHEN c.sql_tpl LIKE '%FROM public.users WHERE id = %L%'
          THEN format(c.sql_tpl, i.stu)
        WHEN c.sql_tpl LIKE '%public.users%'
          THEN format(c.sql_tpl, i.stu)
        WHEN c.sql_tpl LIKE '%payee_id = %L%'
          THEN format(c.sql_tpl, i.tut)
        WHEN c.sql_tpl LIKE '%%L%'
          THEN format(c.sql_tpl, i.sid)
        ELSE c.sql_tpl
      END) AS actual
  FROM cases c CROSS JOIN ids i
)
SELECT test, expect, actual,
  CASE expect
    WHEN 'blocked'         THEN actual NOT LIKE 'SENTINEL:%'
    WHEN 'zero_rows'       THEN actual = 'SENTINEL:0'
    WHEN 'blocked_or_zero' THEN actual NOT LIKE 'SENTINEL:%' OR actual = 'SENTINEL:0'
    WHEN 'allowed'         THEN actual LIKE 'SENTINEL:%' AND actual <> 'SENTINEL:0'
  END AS pass
FROM run
ORDER BY pass, test;
