-- Exported from the live database migration history (20261008214207 signup_trigger_creates_profiles).

-- Signup now creates the user row AND the student/tutor profile server-side from the
-- signup metadata, so the browser never needs anonymous insert rights.
-- Role is whitelisted (never admin); every field is validated and length-limited;
-- a bad profile field can never block the account itself from being created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  p jsonb := CASE WHEN jsonb_typeof(m->'profile') = 'object' THEN m->'profile' ELSE '{}'::jsonb END;
  r text  := lower(coalesce(m->>'role', 'student'));
  arr_subjects jsonb := CASE WHEN jsonb_typeof(p->'subjects') = 'array' THEN p->'subjects' ELSE '[]'::jsonb END;
  arr_avail    jsonb := CASE WHEN jsonb_typeof(p->'availability') = 'array' THEN p->'availability' ELSE '[]'::jsonb END;
  arr_times    jsonb := CASE WHEN jsonb_typeof(p->'preferred_times') = 'array' THEN p->'preferred_times' ELSE '[]'::jsonb END;
  arr_certs    jsonb := CASE WHEN jsonb_typeof(p->'certificates') = 'array' THEN p->'certificates' ELSE '[]'::jsonb END;
  arr_courses  jsonb := CASE WHEN jsonb_typeof(p->'courses') = 'array' THEN p->'courses' ELSE '[]'::jsonb END;
BEGIN
  IF r NOT IN ('student', 'tutor', 'business') THEN r := 'student'; END IF;

  INSERT INTO public.users (id, email, full_name, avatar_url, roles, role, gender, country, language, university_email)
  VALUES (
    NEW.id, NEW.email,
    left(m->>'full_name', 120),
    left(m->>'avatar_url', 500),
    ARRAY[r::public.user_role], r,
    left(p->>'gender', 40), left(p->>'country', 80),
    coalesce(left(p->>'language', 40), 'en'),
    CASE WHEN p <> '{}'::jsonb AND r IN ('student', 'tutor') THEN NEW.email END
  )
  ON CONFLICT (id) DO NOTHING;

  IF p = '{}'::jsonb THEN RETURN NEW; END IF;

  BEGIN
    IF r = 'student' THEN
      INSERT INTO public.student_profiles (user_id, university, degree, major, year_of_study, gender, country, language, subjects, availability, preferred_time)
      VALUES (
        NEW.id, left(p->>'university', 150), left(p->>'degree', 150), left(p->>'degree', 150),
        CASE WHEN (p->>'year_of_study') ~ '^[0-9]{1,2}$' THEN (p->>'year_of_study')::int END,
        left(p->>'gender', 40), left(p->>'country', 80), left(p->>'language', 40),
        CASE WHEN jsonb_array_length(arr_subjects) > 0 THEN (SELECT jsonb_agg(left(x, 80)) FROM (SELECT x FROM jsonb_array_elements_text(arr_subjects) x LIMIT 30) s) END,
        CASE WHEN jsonb_array_length(arr_avail) > 0 THEN (SELECT jsonb_agg(left(x, 20)) FROM (SELECT x FROM jsonb_array_elements_text(arr_avail) x LIMIT 14) s)::text END,
        left(arr_times->>0, 40)
      )
      ON CONFLICT (user_id) DO NOTHING;

    ELSIF r = 'tutor' THEN
      INSERT INTO public.tutor_profiles (user_id, location, gender, country, language, subjects, hourly_rate, currency, teaching_format, bio, certificates, availability, preferred_time, preferred_times)
      VALUES (
        NEW.id, left(p->>'university', 150),
        left(p->>'gender', 40), left(p->>'country', 80), left(p->>'language', 40),
        ARRAY(SELECT left(x, 80) FROM jsonb_array_elements_text(arr_subjects) x LIMIT 30),
        CASE WHEN (p->>'hourly_rate') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' THEN (p->>'hourly_rate')::numeric END,
        CASE WHEN upper(p->>'currency') IN ('EUR', 'USD') THEN upper(p->>'currency') ELSE 'EUR' END,
        left(p->>'teaching_format', 40),
        left(p->>'bio', 2000),
        CASE WHEN jsonb_array_length(arr_certs) > 0 THEN (
          SELECT jsonb_agg(jsonb_build_object(
                   'subject', left(c->>'subject', 100), 'grade', left(c->>'grade', 40),
                   'fileName', left(c->>'fileName', 200), 'fileUrl', NULL))
          FROM (SELECT c FROM jsonb_array_elements(arr_certs) c WHERE jsonb_typeof(c) = 'object' LIMIT 20) s) END,
        CASE WHEN jsonb_array_length(arr_avail) > 0 THEN (SELECT jsonb_agg(left(x, 20)) FROM (SELECT x FROM jsonb_array_elements_text(arr_avail) x LIMIT 14) s) END,
        left(arr_times->>0, 40),
        ARRAY(SELECT left(x, 40) FROM jsonb_array_elements_text(arr_times) x LIMIT 10)
      )
      ON CONFLICT (user_id) DO NOTHING;

      INSERT INTO public.tutor_courses (tutor_id, course_code, course_name)
      SELECT NEW.id, left(c->>'course_code', 40), left(c->>'course_name', 150)
      FROM (SELECT c FROM jsonb_array_elements(arr_courses) c WHERE jsonb_typeof(c) = 'object' LIMIT 30) s
      WHERE coalesce(trim(c->>'course_code'), '') <> '';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: profile creation skipped for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
