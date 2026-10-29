-- Phase 1: Course Hubs + Exam Planner (approved by Sarmad, 29 Oct 2026)
--
-- 1. A normalised "course key" so "MATH 101", "math101" and "Math-101" are the same course.
--    Added as a generated column to tutor_courses, course_follows and feed_posts so pages can
--    query a course with a plain .eq('course_key', ...). Nothing existing is renamed or removed.
-- 2. Two read-only summary functions for the course pages (counts only, no personal data):
--    list_courses() for the directory, course_stats() for one course's follower/question counts.
--    They are SECURITY DEFINER because course_follows is private to each user; they return
--    numbers, never who follows a course.
-- 3. Exam planner: student_exams + exam_plan_tasks, private to the student who owns them.

-- ── 1. Course key ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.course_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT nullif(lower(regexp_replace(coalesce(p, ''), '[^[:alnum:]]+', '', 'g')), '') $$;

ALTER TABLE public.tutor_courses
  ADD COLUMN IF NOT EXISTS course_key text
  GENERATED ALWAYS AS (public.course_key(coalesce(nullif(btrim(course_code), ''), course_name))) STORED;

ALTER TABLE public.course_follows
  ADD COLUMN IF NOT EXISTS course_key text
  GENERATED ALWAYS AS (public.course_key(course_code)) STORED;

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS course_key text
  GENERATED ALWAYS AS (public.course_key(coalesce(nullif(btrim(course_code), ''), subject))) STORED;

CREATE INDEX IF NOT EXISTS tutor_courses_course_key_idx  ON public.tutor_courses (course_key);
CREATE INDEX IF NOT EXISTS course_follows_course_key_idx ON public.course_follows (course_key);
CREATE INDEX IF NOT EXISTS feed_posts_course_key_idx     ON public.feed_posts (course_key, created_at DESC);

-- ── 2. Course summaries ────────────────────────────────────────────────────────────────────────
-- Directory: every course that has at least one active tutor, a follower or a question.
CREATE OR REPLACE FUNCTION public.list_courses(p_query text DEFAULT NULL, p_limit int DEFAULT 60)
RETURNS TABLE (course_key text, label text, course_name text, universities text[],
               tutor_count int, follower_count int, question_count int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH active_tc AS (
    SELECT tc.* FROM public.tutor_courses tc
    JOIN public.tutor_profiles tp ON tp.user_id = tc.tutor_id AND coalesce(tp.is_active, true)
    JOIN public.users u ON u.id = tc.tutor_id AND u.suspended_at IS NULL
    WHERE tc.course_key IS NOT NULL
  ),
  keys AS (
    SELECT course_key FROM active_tc
    UNION SELECT course_key FROM public.course_follows WHERE course_key IS NOT NULL
    UNION SELECT course_key FROM public.feed_posts     WHERE course_key IS NOT NULL
  ),
  agg AS (
    SELECT k.course_key,
      coalesce(
        (SELECT mode() WITHIN GROUP (ORDER BY nullif(btrim(t.course_code), '')) FROM active_tc t WHERE t.course_key = k.course_key),
        (SELECT mode() WITHIN GROUP (ORDER BY btrim(f.course_code)) FROM public.course_follows f WHERE f.course_key = k.course_key),
        (SELECT mode() WITHIN GROUP (ORDER BY btrim(coalesce(nullif(p.course_code, ''), p.subject))) FROM public.feed_posts p WHERE p.course_key = k.course_key)
      ) AS label,
      (SELECT mode() WITHIN GROUP (ORDER BY nullif(btrim(t.course_name), '')) FROM active_tc t WHERE t.course_key = k.course_key) AS course_name,
      (SELECT array_agg(DISTINCT btrim(t.university)) FILTER (WHERE nullif(btrim(t.university), '') IS NOT NULL) FROM active_tc t WHERE t.course_key = k.course_key) AS universities,
      (SELECT count(DISTINCT t.tutor_id)::int FROM active_tc t WHERE t.course_key = k.course_key) AS tutor_count,
      (SELECT count(*)::int FROM public.course_follows f WHERE f.course_key = k.course_key) AS follower_count,
      (SELECT count(*)::int FROM public.feed_posts p WHERE p.course_key = k.course_key AND coalesce(p.post_type, '') <> 'share') AS question_count
    FROM keys k
  )
  SELECT a.course_key, coalesce(a.label, a.course_key), a.course_name, coalesce(a.universities, '{}'),
         a.tutor_count, a.follower_count, a.question_count
  FROM agg a
  WHERE p_query IS NULL OR btrim(p_query) = ''
     OR a.course_key LIKE '%' || public.course_key(p_query) || '%'
     OR coalesce(a.course_name, '') ILIKE '%' || btrim(p_query) || '%'
     OR coalesce(a.label, '') ILIKE '%' || btrim(p_query) || '%'
     OR array_to_string(coalesce(a.universities, '{}'), ' ') ILIKE '%' || btrim(p_query) || '%'
  ORDER BY a.tutor_count DESC, a.follower_count DESC, a.question_count DESC, a.course_key
  LIMIT least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- One course: follower count, question count and whether the viewer follows it.
CREATE OR REPLACE FUNCTION public.course_stats(p_course_key text)
RETURNS TABLE (follower_count int, question_count int, i_follow boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*)::int FROM public.course_follows f WHERE f.course_key = public.course_key(p_course_key)),
    (SELECT count(*)::int FROM public.feed_posts p WHERE p.course_key = public.course_key(p_course_key) AND coalesce(p.post_type, '') <> 'share'),
    EXISTS (SELECT 1 FROM public.course_follows f WHERE f.course_key = public.course_key(p_course_key) AND f.user_id = (SELECT auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.list_courses(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.course_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_courses(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_stats(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_key(text) TO anon, authenticated;

-- ── 3. Exam planner ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_exams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  course_code text CHECK (course_code IS NULL OR char_length(course_code) <= 60),
  course_key  text GENERATED ALWAYS AS (public.course_key(coalesce(nullif(btrim(course_code), ''), title))) STORED,
  exam_date   date NOT NULL,
  topics      text[] NOT NULL DEFAULT '{}' CHECK (cardinality(topics) BETWEEN 1 AND 30),
  study_days  smallint[] NOT NULL DEFAULT '{1,2,3,4,5}' CHECK (cardinality(study_days) BETWEEN 1 AND 7 AND study_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_plan_tasks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id    uuid NOT NULL REFERENCES public.student_exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  topic      text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 120),
  kind       text NOT NULL CHECK (kind IN ('learn', 'review', 'practice')),
  done_at    timestamptz,
  unsure     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_exams_student_idx   ON public.student_exams (student_id, exam_date);
CREATE INDEX IF NOT EXISTS exam_plan_tasks_exam_idx    ON public.exam_plan_tasks (exam_id, day);
CREATE INDEX IF NOT EXISTS exam_plan_tasks_student_idx ON public.exam_plan_tasks (student_id, day);

-- A task always belongs to the same student as its exam; caps keep one account from filling the table.
CREATE OR REPLACE FUNCTION public.exam_planner_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'student_exams' THEN
    NEW.updated_at := now();
    IF TG_OP = 'INSERT' AND (SELECT count(*) FROM public.student_exams WHERE student_id = NEW.student_id) >= 20 THEN
      RAISE EXCEPTION 'You can plan up to 20 exams at a time. Delete an old one first.';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_exams e WHERE e.id = NEW.exam_id AND e.student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM public.exam_plan_tasks WHERE exam_id = NEW.exam_id) >= 400 THEN
    RAISE EXCEPTION 'This plan is too long. Use fewer topics or a closer exam date.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS student_exams_guard ON public.student_exams;
CREATE TRIGGER student_exams_guard BEFORE INSERT OR UPDATE ON public.student_exams
  FOR EACH ROW EXECUTE FUNCTION public.exam_planner_guard();
DROP TRIGGER IF EXISTS exam_plan_tasks_guard ON public.exam_plan_tasks;
CREATE TRIGGER exam_plan_tasks_guard BEFORE INSERT OR UPDATE ON public.exam_plan_tasks
  FOR EACH ROW EXECUTE FUNCTION public.exam_planner_guard();

ALTER TABLE public.student_exams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_plan_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_exams_own ON public.student_exams FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid())) WITH CHECK (student_id = (SELECT auth.uid()));
CREATE POLICY exam_plan_tasks_own ON public.exam_plan_tasks FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid())) WITH CHECK (student_id = (SELECT auth.uid()));

REVOKE ALL ON public.student_exams, public.exam_plan_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_exams, public.exam_plan_tasks TO authenticated;
GRANT ALL ON public.student_exams, public.exam_plan_tasks TO service_role;
