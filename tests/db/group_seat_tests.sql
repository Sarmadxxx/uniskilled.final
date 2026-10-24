-- UniSkilled — group session seat tests (read-only in effect)
--
-- Creates temporary group sessions, has real student accounts try to join them and a stranger try
-- to read them, then throws everything away (the whole run ends with a sentinel error that rolls
-- back every change). Nothing in the database changes, even if a test fails.
--
-- How to run: paste into Supabase → SQL Editor, or run via the Supabase MCP execute_sql tool.
-- Every row should show pass = true. Needs at least 4 plain student accounts and 1 tutor.

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE n int; r text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    SET LOCAL ROLE authenticated;
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    RESET ROLE;
    r := 'OK:' || n;
  EXCEPTION WHEN OTHERS THEN
    r := SQLERRM;              -- the failed statement alone is rolled back
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  RETURN r;
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.group_seat_tests(p_pre_sql text DEFAULT NULL) RETURNS TABLE(test text, actual text, pass boolean)
LANGUAGE plpgsql AS $f$
DECLARE
  tut uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid;
  g_open uuid := gen_random_uuid(); g_cancel uuid := gen_random_uuid(); g_soon uuid := gen_random_uuid();
  soon timestamptz := now() + interval '30 minutes';
  later date := (now() + interval '3 days')::date;
  res text[] := '{}';
  r text; due timestamptz;
  ins text := 'INSERT INTO public.group_session_participants (group_session_id, student_id, student_name, status, payment_due_at) VALUES (%L, %L, ''Test'', ''awaiting_payment'', %L)';
BEGIN
  SELECT tp.user_id INTO tut FROM public.tutor_profiles tp JOIN public.users u ON u.id = tp.user_id
   WHERE NOT ('admin' = ANY (coalesce(u.roles::text[], '{}'))) LIMIT 1;
  SELECT array_agg(id) INTO res FROM (
    SELECT u.id::text FROM public.users u
     WHERE NOT EXISTS (SELECT 1 FROM public.tutor_profiles tp WHERE tp.user_id = u.id)
       AND NOT ('admin' = ANY (coalesce(u.roles::text[], '{}')))
     ORDER BY u.created_at LIMIT 4) x;
  s1 := res[1]; s2 := res[2]; s3 := res[3]; s4 := res[4]; res := '{}';
  IF tut IS NULL OR s4 IS NULL THEN
    test := 'setup'; actual := 'needs 1 tutor and 4 plain students'; pass := false; RETURN NEXT; RETURN;
  END IF;

  BEGIN
    -- Optional: apply a not-yet-released migration first (dry run; rolled back with everything else)
    IF p_pre_sql IS NOT NULL THEN EXECUTE p_pre_sql; END IF;
    -- Setup (as the database owner, so the tutor guard doesn't apply)
    INSERT INTO public.group_sessions (id, tutor_id, tutor_name, subject, scheduled_date, scheduled_time, duration_minutes, max_students, price_per_student, currency, status, timezone)
    VALUES (g_open,   tut, 'T', 'Seat test', later, '10:00', 60, 2, 20, 'EUR', 'open', 'Europe/Berlin'),
           (g_cancel, tut, 'T', 'Seat test', later, '12:00', 60, 4, 20, 'EUR', 'cancelled', 'Europe/Berlin'),
           (g_soon,   tut, 'T', 'Seat test', (soon AT TIME ZONE 'Europe/Berlin')::date,
                      to_char(soon AT TIME ZONE 'Europe/Berlin', 'HH24:MI')::time, 60, 4, 20, 'EUR', 'open', 'Europe/Berlin');

    r := pg_temp.as_user(s1, format(ins, g_open, s1, now() + interval '400 days'));
    res := res || ('Student 1 can join an open group with free seats|' || r || '|' || (r = 'OK:1'));
    SELECT payment_due_at INTO due FROM public.group_session_participants WHERE group_session_id = g_open AND student_id = s1;
    res := res || ('Payment deadline is set by the database (≤ 24h), not the browser|' || coalesce(due::text, 'null') || '|' || coalesce(due <= now() + interval '24 hours 1 minute', false));

    r := pg_temp.as_user(s2, format(ins, g_open, s2, now() + interval '1 day'));
    res := res || ('Student 2 takes the last seat|' || r || '|' || (r = 'OK:1'));

    r := pg_temp.as_user(s3, format(ins, g_open, s3, now() + interval '1 day'));
    res := res || ('Student 3 cannot join a full group|' || r || '|' || (r NOT LIKE 'OK:%'));

    r := pg_temp.as_user(s3, format(ins, g_cancel, s3, now() + interval '1 day'));
    res := res || ('Cannot join a cancelled group|' || r || '|' || (r NOT LIKE 'OK:%'));

    r := pg_temp.as_user(s3, format(ins, g_soon, s3, now() + interval '1 day'));
    res := res || ('Cannot join a group starting in under 1 hour|' || r || '|' || (r NOT LIKE 'OK:%'));

    r := pg_temp.as_user(s1, format('UPDATE public.group_session_participants SET payment_due_at = now() + interval ''400 days'' WHERE group_session_id = %L AND student_id = %L', g_open, s1));
    res := res || ('Student cannot extend their own payment deadline|' || r || '|' || (r NOT LIKE 'OK:%'));

    r := pg_temp.as_user(s4, format('SELECT 1 FROM public.group_session_participants WHERE group_session_id = %L', g_open));
    res := res || ('Another student cannot see who joined|' || r || '|' || (r = 'OK:0'));

    r := pg_temp.as_user(s1, format('SELECT 1 FROM public.group_session_participants WHERE group_session_id = %L', g_open));
    res := res || ('CONTROL: a student sees only their own seat|' || r || '|' || (r = 'OK:1'));

    r := pg_temp.as_user(tut, format('SELECT 1 FROM public.group_session_participants WHERE group_session_id = %L', g_open));
    res := res || ('CONTROL: the tutor sees everyone in their group|' || r || '|' || (r = 'OK:2'));

    r := pg_temp.as_user(s4, format('SELECT confirmed_count + pending_count FROM public.group_session_seats WHERE group_session_id = %L', g_open));
    res := res || ('CONTROL: seat counts stay visible to everyone|' || r || '|' || (r = 'OK:1'));

    RAISE EXCEPTION 'ROLLBACK_SENTINEL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_SENTINEL' THEN
      res := res || ('run aborted|' || SQLERRM || '|false');
    END IF;
  END;

  FOR i IN 1 .. coalesce(array_length(res, 1), 0) LOOP
    test := split_part(res[i], '|', 1); actual := split_part(res[i], '|', 2); pass := split_part(res[i], '|', 3)::boolean;
    RETURN NEXT;
  END LOOP;
END $f$;

SELECT * FROM pg_temp.group_seat_tests() ORDER BY pass, test;
