-- Applied to Supabase project orghkbbohnabcietidiv on 2026-10-09 (already live — kept as a record).
-- Narrow lookups so private tutor_profiles columns can be locked for every end user.

create or replace function public.get_my_tutor_private()
returns table (meeting_link text, paypal_email text, payout_method text,
               stripe_account_id text, stripe_account_status text, total_earnings numeric)
language sql stable security definer set search_path = public as $$
  select tp.meeting_link, tp.paypal_email, tp.payout_method, tp.stripe_account_id, tp.stripe_account_status, tp.total_earnings
  from public.tutor_profiles tp where tp.user_id = auth.uid();
$$;

create or replace function public.get_session_meeting_link(p_session_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select tp.meeting_link from public.sessions s join public.tutor_profiles tp on tp.user_id = s.tutor_id
  where s.id = p_session_id and s.status = 'confirmed' and auth.uid() is not null and auth.uid() in (s.student_id, s.tutor_id);
$$;

create or replace function public.set_my_meeting_link(p_link text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := nullif(trim(coalesce(p_link, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if v is not null and (v !~* '^https://[^\s/$.?#][^\s]*$' or length(v) > 500) then
    raise exception 'Enter a full link starting with https://' using errcode = '22023';
  end if;
  insert into public.tutor_profiles (user_id, meeting_link) values (auth.uid(), v)
  on conflict (user_id) do update set meeting_link = excluded.meeting_link;
  return v;
end $$;

revoke all on function public.get_my_tutor_private() from public, anon;
revoke all on function public.get_session_meeting_link(uuid) from public, anon;
revoke all on function public.set_my_meeting_link(text) from public, anon;
grant execute on function public.get_my_tutor_private() to authenticated;
grant execute on function public.get_session_meeting_link(uuid) to authenticated;
grant execute on function public.set_my_meeting_link(text) to authenticated;

-- TO APPLY AFTER THE PAGE CHANGES ARE LIVE (PR #2 merged) — locks private columns for signed-in users too.
-- Tested: plain UPDATEs of payout_method / paypal_email keep working; upserts of public columns keep working.
-- revoke select on public.tutor_profiles from authenticated;
-- grant select (id, user_id, bio, subjects, teaching_levels, hourly_rate, currency, languages, format, location,
--   teaching_style, video_link, rating_avg, review_count, sessions_count, university_verified_at, verified_university,
--   grade_verified_at, certified_at, top_rated_at, next_available, is_active, created_at, updated_at, session_length,
--   availability, preferred_time, preferred_times, teaching_format, country, language, certificates, degree_level, major,
--   overall_grade, max_students, avatar_url, study_year, cover_url) on public.tutor_profiles to authenticated;
