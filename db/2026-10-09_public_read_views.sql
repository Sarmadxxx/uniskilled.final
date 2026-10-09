-- Applied to Supabase project orghkbbohnabcietidiv on 2026-10-09 (already live — kept here as a record).
-- Why: the users table is locked for signed-out visitors (correctly), so Find Tutors, tutor profiles and
-- shared certificates showed "Tutor" with no photo/bio and "0 sessions". These views expose ONLY tutors
-- and ONLY public columns, so the base tables stay private.

create or replace view public.public_tutors as
select u.id, u.full_name, u.avatar_url, u.cover_url, u.bio, u.country, u.city, u.language, u.created_at,
       (select count(*) from public.sessions s where s.tutor_id = u.id and s.status = 'completed')::int as completed_sessions,
       u.website_url, u.linkedin_url, u.github_url
from public.users u
join public.tutor_profiles tp on tp.user_id = u.id
where u.suspended_at is null;

create or replace view public.public_tutor_subject_stats as
select s.tutor_id,
       coalesce(max(nullif(trim(s.subject), '')), 'Other') as subject,
       count(*)::int as completed_sessions
from public.sessions s
join public.tutor_profiles tp on tp.user_id = s.tutor_id
where s.status = 'completed'
group by s.tutor_id, lower(coalesce(nullif(trim(s.subject), ''), 'Other'));

create or replace view public.group_session_seats as
select gs.id as group_session_id,
       count(p.id) filter (where p.status = 'confirmed')::int        as confirmed_count,
       count(p.id) filter (where p.status = 'awaiting_payment')::int as pending_count
from public.group_sessions gs
left join public.group_session_participants p on p.group_session_id = gs.id
group by gs.id;

revoke all on public.public_tutors, public.public_tutor_subject_stats, public.group_session_seats from public;
grant select on public.public_tutors, public.public_tutor_subject_stats, public.group_session_seats to anon, authenticated;

-- Signed-out visitors can no longer read group participant lists (student names, payment status).
alter policy gsp_select_authenticated on public.group_session_participants to authenticated;
