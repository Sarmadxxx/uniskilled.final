-- Exported from the live database migration history (20261009112452 public_tutors_add_profile_links).

create or replace view public.public_tutors as
select u.id, u.full_name, u.avatar_url, u.cover_url, u.bio, u.country, u.city, u.language, u.created_at,
       (select count(*) from public.sessions s where s.tutor_id = u.id and s.status = 'completed')::int as completed_sessions,
       u.website_url, u.linkedin_url, u.github_url
from public.users u
join public.tutor_profiles tp on tp.user_id = u.id
where u.suspended_at is null;
