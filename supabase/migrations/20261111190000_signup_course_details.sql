-- Sign-up keeps the course details tutors can already add on their profile (11 Nov 2026):
-- professor, semester and grade, and the course is listed under the tutor's university,
-- so students searching by professor or university find the tutor straight away.
-- A course needs a name or a code (before: a code). Course names are cut to 120 characters, the
-- table limit (before: 150, which made a long name skip the whole profile). Only the tutor_courses insert changes.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  arr_langs    jsonb := CASE WHEN jsonb_typeof(p->'languages') = 'array' THEN p->'languages' ELSE '[]'::jsonb END;
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

      INSERT INTO public.tutor_courses (tutor_id, course_code, course_name, professor_name, university, semester, grade)
      SELECT NEW.id,
             nullif(left(trim(c->>'course_code'), 40), ''), nullif(left(trim(c->>'course_name'), 120), ''),
             nullif(left(trim(c->>'professor_name'), 80), ''),
             coalesce(nullif(left(trim(c->>'university'), 120), ''), nullif(left(trim(p->>'university'), 120), '')),
             nullif(left(trim(c->>'semester'), 30), ''), nullif(left(trim(c->>'grade'), 20), '')
      FROM (SELECT c FROM jsonb_array_elements(arr_courses) c WHERE jsonb_typeof(c) = 'object' LIMIT 30) s
      WHERE coalesce(trim(c->>'course_code'), '') <> '' OR coalesce(trim(c->>'course_name'), '') <> '';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: profile creation skipped for %: %', NEW.id, SQLERRM;
  END;

  -- Languages the person speaks / teaches in (10 Nov 2026). Its own block: a problem here can
  -- never stop the account or profile from being created.
  BEGIN
    INSERT INTO public.user_languages (user_id, lang, level, position)
    SELECT NEW.id, lower(x->>'code'),
           CASE WHEN x->>'level' IN ('native', 'fluent', 'conversational') THEN x->>'level' ELSE 'fluent' END,
           (ord - 1)::smallint
    FROM jsonb_array_elements(arr_langs) WITH ORDINALITY AS t(x, ord)
    WHERE jsonb_typeof(x) = 'object' AND lower(x->>'code') ~ '^[a-z]{2,3}$' AND ord <= 20
    ON CONFLICT (user_id, lang) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: languages skipped for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
