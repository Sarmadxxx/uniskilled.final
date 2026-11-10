-- Languages a person speaks or teaches in — NOT the website language (decision 10 Nov 2026).
-- Stage 2 of the multilingual plan. Adds:
--   • public.user_languages: one row per language, with a level (native / fluent / conversational)
--   • set_my_languages(): the only way to change it — the signed-in person's own list, all or nothing
--   • tutors' languages are public (they are what students filter on); everyone else's are private
--   • sign-up stores the languages chosen on the sign-up page (handle_new_user, one extra block)
--   • the few languages typed into the old free-text fields are converted to the new list
-- The old columns (users.language, tutor_profiles.language, tutor_profiles.languages) are left as
-- they are for one release so nothing that still reads them breaks.

create table if not exists public.user_languages (
  user_id    uuid not null references public.users(id) on delete cascade,
  lang       text not null check (lang ~ '^[a-z]{2,3}$'),
  level      text not null default 'fluent' check (level in ('native', 'fluent', 'conversational')),
  position   smallint not null default 0 check (position between 0 and 19),
  created_at timestamptz not null default now(),
  primary key (user_id, lang)
);
create index if not exists user_languages_lang_idx on public.user_languages (lang);
alter table public.user_languages enable row level security;

-- Is this person a listed (not suspended) tutor? Security definer so visitors can ask without
-- being able to read the users table themselves. Returns a yes/no only.
create or replace function public.is_listed_tutor(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.tutor_profiles tp join public.users u on u.id = tp.user_id
                 where tp.user_id = p_user and u.suspended_at is null);
$$;
revoke all on function public.is_listed_tutor(uuid) from public;
grant execute on function public.is_listed_tutor(uuid) to anon, authenticated, service_role;

drop policy if exists user_languages_read_tutors on public.user_languages;
create policy user_languages_read_tutors on public.user_languages
  for select to anon, authenticated using (public.is_listed_tutor(user_id));
drop policy if exists user_languages_read_own on public.user_languages;
create policy user_languages_read_own on public.user_languages
  for select to authenticated using (user_id = (select auth.uid()));

-- Reading only; all changes go through set_my_languages().
revoke all on public.user_languages from anon, authenticated;
grant select on public.user_languages to anon, authenticated;
grant all on public.user_languages to service_role;

create or replace function public.set_my_languages(p_langs jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_langs is null or jsonb_typeof(p_langs) <> 'array' then raise exception 'Expected a list of languages' using errcode = '22023'; end if;
  if jsonb_array_length(p_langs) > 20 then raise exception 'At most 20 languages' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_langs) x
             where jsonb_typeof(x) <> 'object'
                or coalesce(lower(x->>'code'), '') !~ '^[a-z]{2,3}$'
                or coalesce(x->>'level', '') not in ('native', 'fluent', 'conversational')) then
    raise exception 'Unknown language or level' using errcode = '22023';
  end if;
  delete from public.user_languages where user_id = uid;
  insert into public.user_languages (user_id, lang, level, position)
  select uid, lower(x->>'code'), x->>'level', (ord - 1)::smallint
  from jsonb_array_elements(p_langs) with ordinality as t(x, ord)
  on conflict (user_id, lang) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_my_languages(jsonb) from public, anon;
grant execute on function public.set_my_languages(jsonb) to authenticated;

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

      INSERT INTO public.tutor_courses (tutor_id, course_code, course_name)
      SELECT NEW.id, left(c->>'course_code', 40), left(c->>'course_name', 150)
      FROM (SELECT c FROM jsonb_array_elements(arr_courses) c WHERE jsonb_typeof(c) = 'object' LIMIT 30) s
      WHERE coalesce(trim(c->>'course_code'), '') <> '';
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

-- One-off: turn what people typed into the old free-text language fields into the new list.
-- The first language each person named was asked for as their "primary language" → native;
-- any others → fluent. Unknown words are skipped (people can add languages themselves).
-- users.language = 'en' was only the automatic default, never a choice, so it is not converted.
with names(word, code) as (values
  ('english','en'),('englisch','en'),('anglais','en'),('ingles','en'),('inglés','en'),('ingilizce','en'),('ingilizce','en'),('الإنجليزية','en'),('الانجليزية','en'),('انجليزي','en'),
  ('arabic','ar'),('arabisch','ar'),('arabe','ar'),('árabe','ar'),('arapça','ar'),('العربية','ar'),('عربي','ar'),('عربية','ar'),
  ('german','de'),('deutsch','de'),('allemand','de'),('alemán','de'),('almanca','de'),('الألمانية','de'),
  ('turkish','tr'),('türkisch','tr'),('turc','tr'),('turco','tr'),('türkçe','tr'),('التركية','tr'),
  ('french','fr'),('französisch','fr'),('français','fr'),('francés','fr'),('fransızca','fr'),('الفرنسية','fr'),
  ('spanish','es'),('spanisch','es'),('espagnol','es'),('español','es'),('ispanyolca','es'),('الإسبانية','es'),
  ('kurdish','ku'),('kurdisch','ku'),('kurmanji','ku'),('sorani','ckb'),('persian','fa'),('farsi','fa'),('urdu','ur'),
  ('italian','it'),('portuguese','pt'),('dutch','nl'),('polish','pl'),('russian','ru'),('ukrainian','uk'),('chinese','zh'),
  ('mandarin','zh'),('hindi','hi'),('greek','el'),('romanian','ro'),('hebrew','he'),('japanese','ja'),('korean','ko')
),
typed as (
  select u.id as user_id,
         coalesce(nullif(trim(tp.language), ''), nullif(trim(sp.language), ''),
                  case when lower(trim(coalesce(u.language, ''))) not in ('', 'en') then trim(u.language) end) as txt,
         coalesce(tp.languages, '{}'::text[]) as extra
  from public.users u
  left join public.tutor_profiles tp on tp.user_id = u.id
  left join public.student_profiles sp on sp.user_id = u.id
),
words as (
  select user_id, lower(trim(w)) as word, ord
  from typed, regexp_split_to_table(coalesce(txt, ''), '\s*[,/;&]\s*|\s+and\s+|\s+و\s*') with ordinality as s(w, ord)
  where trim(w) <> ''
  union all
  select user_id, lower(trim(e)), 100 + ord from typed, unnest(extra) with ordinality as x(e, ord) where trim(e) <> ''
),
coded as (
  select w.user_id, n.code, min(w.ord) as ord
  from words w join names n on n.word = w.word
  group by w.user_id, n.code
)
insert into public.user_languages (user_id, lang, level, position)
select user_id, code,
       case when ord = min(ord) over (partition by user_id) then 'native' else 'fluent' end,
       least(row_number() over (partition by user_id order by ord) - 1, 19)::smallint
from coded
on conflict (user_id, lang) do nothing;
