-- Exported from the live database migration history (20261009112419 public_read_views_for_signed_out_visitors).

-- Read-only views so signed-out visitors (and signed-in users browsing others)
-- see real public tutor info, without exposing student data or payout details.
-- These run with the view owner's rights on purpose: they deliberately return
-- only tutors and only public columns, so the base tables can stay locked down.

create or replace view public.public_tutors as
select u.id,
       u.full_name,
       u.avatar_url,
       u.cover_url,
       u.bio,
       u.country,
       u.city,
       u.language,
       u.created_at,
       (select count(*) from public.sessions s
         where s.tutor_id = u.id and s.status = 'completed')::int as completed_sessions
from public.users u
join public.tutor_profiles tp on tp.user_id = u.id
where u.suspended_at is null;

comment on view public.public_tutors is
  'Public tutor card data (tutors only, public columns only). Used by Find Tutors, tutor profiles and certificates.';

create or replace view public.public_tutor_subject_stats as
select s.tutor_id,
       coalesce(nullif(trim(s.subject), ''), 'Other') as subject,
       count(*)::int as completed_sessions
from public.sessions s
join public.tutor_profiles tp on tp.user_id = s.tutor_id
where s.status = 'completed'
group by s.tutor_id, coalesce(nullif(trim(s.subject), ''), 'Other');

comment on view public.public_tutor_subject_stats is
  'Completed-session counts per tutor and subject (no student data). Powers the Track Record card.';

create or replace view public.group_session_seats as
select gs.id as group_session_id,
       count(p.id) filter (where p.status = 'confirmed')::int        as confirmed_count,
       count(p.id) filter (where p.status = 'awaiting_payment')::int as pending_count
from public.group_sessions gs
left join public.group_session_participants p on p.group_session_id = gs.id
group by gs.id;

comment on view public.group_session_seats is
  'Seat counts per group session (no participant names). Lets visitors see spots left.';

revoke all on public.public_tutors, public.public_tutor_subject_stats, public.group_session_seats from public;
grant select on public.public_tutors, public.public_tutor_subject_stats, public.group_session_seats to anon, authenticated;

-- Signed-out visitors no longer need (or get) the participant list with student names.
alter policy gsp_select_authenticated on public.group_session_participants to authenticated;
