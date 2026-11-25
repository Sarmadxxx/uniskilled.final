-- Study HQ release 1 (approved by Sarmad, 25 Nov 2026): the student's private study workspace.
--
-- ISOLATION RULE: this migration only ADDS new objects whose names start with study_ (tables,
-- functions, triggers, policies) and one new private storage bucket, study-files. It does not alter,
-- rename, drop or write to any existing table, function, policy or bucket. Study HQ reads a few
-- existing tables (users, sessions) through their existing policies and never writes to them.
-- public.course_key(text) already exists (Course Hubs migration) and is only called, not changed.
--
-- Every row belongs to exactly one student; nobody else (other students, tutors, anon) can see it.

-- ── Courses (the student's own list; separate from the public "Follow course" feature) ──────────
CREATE TABLE IF NOT EXISTS public.study_courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  course_key  text GENERATED ALWAYS AS (public.course_key(name)) STORED,
  exam_date   date,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_key)
);

-- ── Weekly timetable (imported from iCal or typed) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_timetable (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  course_label text NOT NULL CHECK (char_length(btrim(course_label)) BETWEEN 1 AND 120),
  kind         text CHECK (kind IS NULL OR char_length(kind) <= 40),
  room         text CHECK (room IS NULL OR char_length(room) <= 120),
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_hm     text NOT NULL CHECK (start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_hm       text NOT NULL CHECK (end_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ical')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Items: deadlines, tasks, notes, links ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('assignment', 'task', 'note', 'resource')),
  course_label text CHECK (course_label IS NULL OR char_length(course_label) <= 120),
  course_key   text GENERATED ALWAYS AS (public.course_key(course_label)) STORED,
  title        text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body         text CHECK (body IS NULL OR char_length(body) <= 20000),
  url          text CHECK (url IS NULL OR (char_length(url) <= 1000 AND url ~* '^https?://')),
  due_at       timestamptz,
  planned_for  date,
  weight_pct   numeric(5,2) CHECK (weight_pct IS NULL OR weight_pct BETWEEN 0 AND 100),
  estimate_min integer CHECK (estimate_min IS NULL OR estimate_min BETWEEN 5 AND 6000),
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'blocked', 'done')),
  done_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_items_user_idx ON public.study_items (user_id, kind, due_at);

-- ── Files: PDFs and slide photos (the bytes live in the private study-files bucket) ─────────────
CREATE TABLE IF NOT EXISTS public.study_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  course_label text CHECK (course_label IS NULL OR char_length(course_label) <= 120),
  course_key   text GENERATED ALWAYS AS (public.course_key(course_label)) STORED,
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  path         text NOT NULL UNIQUE CHECK (char_length(path) <= 300),
  mime         text NOT NULL CHECK (mime IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes   integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  pages        integer CHECK (pages IS NULL OR pages BETWEEN 0 AND 5000),
  text_content text CHECK (text_content IS NULL OR char_length(text_content) <= 500000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- the file must sit in the owner's own folder: <user_id>/<anything>
  CHECK (split_part(path, '/', 1) = user_id::text)
);
CREATE INDEX IF NOT EXISTS study_files_user_idx ON public.study_files (user_id, created_at);

-- ── Review state of each card (cards themselves are parsed from notes on the device) ────────────
CREATE TABLE IF NOT EXISTS public.study_card_states (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  card_id    text NOT NULL CHECK (char_length(card_id) BETWEEN 1 AND 120),
  box        smallint NOT NULL CHECK (box BETWEEN 0 AND 6),
  due        date NOT NULL,
  reviews    integer NOT NULL DEFAULT 0 CHECK (reviews >= 0),
  right_n    integer NOT NULL DEFAULT 0 CHECK (right_n >= 0),
  last       date,
  dismissed  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

-- ── Activity log (what the weekly record is built from; never note contents) ────────────────────
CREATE TABLE IF NOT EXISTS public.study_activity (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  type     text NOT NULL CHECK (type IN ('note', 'file', 'review', 'focus', 'reflect')),
  n        integer CHECK (n IS NULL OR n BETWEEN 0 AND 1000),
  right_n  integer CHECK (right_n IS NULL OR right_n BETWEEN 0 AND 1000),
  minutes  integer CHECK (minutes IS NULL OR minutes BETWEEN 0 AND 600),
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_activity_user_idx ON public.study_activity (user_id, at);

-- ── Weekly reflections ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_reflections (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  week       date NOT NULL,  -- Monday of the week
  went       text CHECK (went IS NULL OR char_length(went) <= 1000),
  stuck      text CHECK (stuck IS NULL OR char_length(stuck) <= 1000),
  aim        text CHECK (aim IS NULL OR char_length(aim) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week)
);

-- Stamps for study_items: updated_at always, done_at when an item is done.
CREATE OR REPLACE FUNCTION public.study_items_stamp()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.done_at := CASE WHEN NEW.status = 'done' THEN coalesce(NEW.done_at, now()) ELSE NULL END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.study_items_stamp() FROM PUBLIC;
DROP TRIGGER IF EXISTS study_items_stamp ON public.study_items;
CREATE TRIGGER study_items_stamp BEFORE INSERT OR UPDATE ON public.study_items
  FOR EACH ROW EXECUTE FUNCTION public.study_items_stamp();

-- ── Guard: per-student caps, owner can never change ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.study_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE cap integer; n integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'A Study HQ row cannot change owner' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    cap := CASE TG_TABLE_NAME WHEN 'study_courses' THEN 60 WHEN 'study_timetable' THEN 300
             WHEN 'study_items' THEN 3000 WHEN 'study_files' THEN 1000 WHEN 'study_card_states' THEN 20000
             WHEN 'study_activity' THEN 50000 WHEN 'study_reflections' THEN 1000 END;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', TG_TABLE_NAME) INTO n USING NEW.user_id;
    IF n >= cap THEN RAISE EXCEPTION 'Study HQ limit reached (% rows)', cap USING ERRCODE = 'check_violation'; END IF;
    IF TG_TABLE_NAME = 'study_files' THEN
      IF (SELECT coalesce(sum(f.size_bytes), 0) FROM public.study_files f WHERE f.user_id = NEW.user_id)
         + (to_jsonb(NEW) ->> 'size_bytes')::bigint > 1073741824 THEN
        RAISE EXCEPTION 'Study HQ storage is full (1 GB per student)' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['study_courses','study_timetable','study_items','study_files','study_card_states','study_activity','study_reflections'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS study_guard ON public.%I', t);
    EXECUTE format('CREATE TRIGGER study_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.study_guard()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS study_own ON public.%I', t);
    EXECUTE format('CREATE POLICY study_own ON public.%I FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.study_guard() FROM PUBLIC;

-- ── Private bucket for study files ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('study-files', 'study-files', false, 20971520,
        ARRAY['application/pdf','image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Same owner-folder rule as the existing private "materials" bucket: <user_id>/... only.
DROP POLICY IF EXISTS study_files_select ON storage.objects;
CREATE POLICY study_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'study-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS study_files_insert ON storage.objects;
CREATE POLICY study_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'study-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS study_files_delete ON storage.objects;
CREATE POLICY study_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'study-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
-- No UPDATE policy: files are replaced by delete + upload, never overwritten in place.
