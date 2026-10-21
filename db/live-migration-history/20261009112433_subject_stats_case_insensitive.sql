-- Exported from the live database migration history (20261009112433 subject_stats_case_insensitive).

create or replace view public.public_tutor_subject_stats as
select s.tutor_id,
       coalesce(max(nullif(trim(s.subject), '')), 'Other') as subject,
       count(*)::int as completed_sessions
from public.sessions s
join public.tutor_profiles tp on tp.user_id = s.tutor_id
where s.status = 'completed'
group by s.tutor_id, lower(coalesce(nullif(trim(s.subject), ''), 'Other'));
