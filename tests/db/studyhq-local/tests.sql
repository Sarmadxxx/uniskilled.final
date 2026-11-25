-- Study HQ release 1: access and data checks on a local Postgres. Every row must show pass = t.
CREATE OR REPLACE FUNCTION pg_temp.attempt(p_uid uuid, p_role text, p_sql text)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r text; n int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'SENTINEL:%', n;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  RETURN r;
END $f$;
\set B '''22222222-2222-2222-2222-222222222222'''
INSERT INTO public.study_courses (user_id, name) VALUES ('22222222-2222-2222-2222-222222222222','STAT 201');
INSERT INTO public.study_timetable (user_id, course_label, weekday, start_hm, end_hm) VALUES ('22222222-2222-2222-2222-222222222222','STAT 201',1,'10:00','11:30');
INSERT INTO public.study_items (user_id, kind, title, course_label) VALUES ('22222222-2222-2222-2222-222222222222','note','B private','STAT 201');
INSERT INTO public.study_items (user_id, kind, title) VALUES ('11111111-1111-1111-1111-111111111111','note','A own');
INSERT INTO public.study_files (user_id, name, path, mime, size_bytes) VALUES ('22222222-2222-2222-2222-222222222222','b.pdf','22222222-2222-2222-2222-222222222222/b.pdf','application/pdf',100);
INSERT INTO public.study_card_states (user_id, card_id, box, due) VALUES ('22222222-2222-2222-2222-222222222222','x:1',1,current_date);
INSERT INTO public.study_activity (user_id, type, n) VALUES ('22222222-2222-2222-2222-222222222222','review',5);
INSERT INTO public.study_reflections (user_id, week, went) VALUES ('22222222-2222-2222-2222-222222222222','2026-11-23','ok');
INSERT INTO storage.objects (bucket_id, name) VALUES ('study-files','22222222-2222-2222-2222-222222222222/b.pdf'),('study-files','11111111-1111-1111-1111-111111111111/a.pdf');

WITH cases(test, who, role, sql, expect) AS (VALUES
 ('A cannot read B courses',        'me','authenticated','SELECT 1 FROM public.study_courses','zero_rows'),
 ('A cannot read B timetable',      'me','authenticated','SELECT 1 FROM public.study_timetable','zero_rows'),
 ('A cannot read B items',          'me','authenticated','SELECT 1 FROM public.study_items WHERE title = ''B private''','zero_rows'),
 ('A cannot read B files',          'me','authenticated','SELECT 1 FROM public.study_files','zero_rows'),
 ('A cannot read B card states',    'me','authenticated','SELECT 1 FROM public.study_card_states','zero_rows'),
 ('A cannot read B activity',       'me','authenticated','SELECT 1 FROM public.study_activity','zero_rows'),
 ('A cannot read B reflections',    'me','authenticated','SELECT 1 FROM public.study_reflections','zero_rows'),
 ('A cannot change B items',        'me','authenticated','UPDATE public.study_items SET title = ''x'' WHERE title = ''B private''','zero_rows'),
 ('A cannot delete B courses',      'me','authenticated','DELETE FROM public.study_courses','zero_rows'),
 ('A cannot insert as B',           'me','authenticated','INSERT INTO public.study_courses (user_id, name) VALUES (''22222222-2222-2222-2222-222222222222'',''x'')','blocked'),
 ('A cannot give own item to B',    'me','authenticated','UPDATE public.study_items SET user_id = ''22222222-2222-2222-2222-222222222222'' WHERE title = ''A own''','blocked'),
 ('A cannot register a file in B folder','me','authenticated','INSERT INTO public.study_files (name, path, mime, size_bytes) VALUES (''x'',''22222222-2222-2222-2222-222222222222/x.pdf'',''application/pdf'',1)','blocked'),
 ('A cannot register an executable','me','authenticated','INSERT INTO public.study_files (name, path, mime, size_bytes) VALUES (''x'',''11111111-1111-1111-1111-111111111111/x.exe'',''application/x-msdownload'',1)','blocked'),
 ('A cannot register a 25 MB file', 'me','authenticated','INSERT INTO public.study_files (name, path, mime, size_bytes) VALUES (''x'',''11111111-1111-1111-1111-111111111111/x.pdf'',''application/pdf'',26214400)','blocked'),
 ('A cannot read B storage object', 'me','authenticated','SELECT 1 FROM storage.objects WHERE name LIKE ''2222%''','zero_rows'),
 ('A cannot upload into B folder',  'me','authenticated','INSERT INTO storage.objects (bucket_id, name) VALUES (''study-files'',''22222222-2222-2222-2222-222222222222/evil.pdf'')','blocked'),
 ('A cannot overwrite own object',  'me','authenticated','UPDATE storage.objects SET name = name WHERE bucket_id = ''study-files''','zero_rows'),
 ('A cannot delete B object',       'me','authenticated','DELETE FROM storage.objects WHERE name LIKE ''2222%''','zero_rows'),
 ('Bad timetable time rejected',    'me','authenticated','INSERT INTO public.study_timetable (course_label, weekday, start_hm, end_hm) VALUES (''x'',1,''25:00'',''26:00'')','blocked'),
 ('javascript: link rejected',      'me','authenticated','INSERT INTO public.study_items (kind, title, url) VALUES (''resource'',''x'',''javascript:alert(1)'')','blocked'),
 ('Anon cannot read anything',      'none','anon','SELECT 1 FROM public.study_items','blocked'),
 ('Anon cannot read files table',   'none','anon','SELECT 1 FROM public.study_files','blocked'),
 ('Signed-in user cannot TRUNCATE', 'me','authenticated','TRUNCATE public.study_activity','blocked'),
 ('CONTROL: A adds a course',       'me','authenticated','INSERT INTO public.study_courses (name, exam_date) VALUES (''Microeconomics'', current_date + 30)','allowed'),
 ('CONTROL: A adds a class',        'me','authenticated','INSERT INTO public.study_timetable (course_label, weekday, start_hm, end_hm, source) VALUES (''Microeconomics'',2,''08:15'',''09:45'',''ical'')','allowed'),
 ('CONTROL: A registers own file',  'me','authenticated','INSERT INTO public.study_files (name, path, mime, size_bytes, text_content) VALUES (''a.pdf'',''11111111-1111-1111-1111-111111111111/a.pdf'',''application/pdf'',1000,''hello'')','allowed'),
 ('CONTROL: A uploads to own folder','me','authenticated','INSERT INTO storage.objects (bucket_id, name) VALUES (''study-files'',''11111111-1111-1111-1111-111111111111/b.pdf'')','allowed'),
 ('CONTROL: A reads own object',    'me','authenticated','SELECT 1 FROM storage.objects WHERE name LIKE ''1111%''','allowed'),
 ('CONTROL: A saves a card state',  'me','authenticated','INSERT INTO public.study_card_states (card_id, box, due) VALUES (''n:1'',2,current_date)','allowed'),
 ('CONTROL: A logs activity',       'me','authenticated','INSERT INTO public.study_activity (type, n, right_n) VALUES (''review'',10,8)','allowed'),
 ('CONTROL: A saves reflection',    'me','authenticated','INSERT INTO public.study_reflections (week, went) VALUES (''2026-11-23'',''good'')','allowed'),
 ('CONTROL: A adds a note',         'me','authenticated','INSERT INTO public.study_items (kind, title, body, course_label) VALUES (''note'',''Lecture 4'',''Q: x\nA: y'',''Microeconomics'')','allowed'),
 ('CONTROL: A ticks a deadline done','me','authenticated','UPDATE public.study_items SET status = ''done'' WHERE title = ''A own''','allowed'),
 ('CONTROL: A deletes own data',    'me','authenticated','DELETE FROM public.study_items WHERE title = ''A own''','allowed')
),
run AS (SELECT c.test, c.expect, pg_temp.attempt(CASE c.who WHEN 'me' THEN '11111111-1111-1111-1111-111111111111'::uuid END, c.role, c.sql) AS actual FROM cases c)
SELECT test, expect, actual,
  CASE expect WHEN 'blocked' THEN actual NOT LIKE 'SENTINEL:%'
              WHEN 'zero_rows' THEN actual = 'SENTINEL:0'
              WHEN 'allowed' THEN actual LIKE 'SENTINEL:%' AND actual <> 'SENTINEL:0' END AS pass
FROM run ORDER BY pass, test;

SELECT 'course_key generated' AS test, (SELECT course_key FROM public.study_courses WHERE name = 'STAT 201') = 'stat201' AS pass
UNION ALL SELECT 'bucket is private', NOT public FROM storage.buckets WHERE id = 'study-files'
UNION ALL SELECT 'existing materials bucket untouched', (SELECT file_size_limit = 20971520 AND allowed_mime_types = ARRAY['application/pdf'] FROM storage.buckets WHERE id = 'materials')
UNION ALL SELECT 'existing materials policy untouched', EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'materials_select')
UNION ALL SELECT 'every study table has RLS', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname LIKE 'study\_%' AND relkind = 'r');
DO $$ BEGIN
  INSERT INTO public.study_courses (user_id, name) SELECT '11111111-1111-1111-1111-111111111111', 'c' || g FROM generate_series(1, 80) g;
  RAISE NOTICE 'cap test: FAIL';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'cap test: PASS (%)', SQLERRM; END $$;
UPDATE public.study_items SET status = 'done' WHERE title = 'B private';
SELECT 'done_at stamped' AS test, done_at IS NOT NULL AS pass FROM public.study_items WHERE title = 'B private';
