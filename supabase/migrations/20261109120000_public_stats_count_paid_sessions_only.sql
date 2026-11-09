-- Public "completed sessions" counts (tutor profile Track Record, tutor certificate, tutor cards)
-- counted every booking marked completed, including €0 test bookings from June–July 2026 made
-- before payments existed. Bookings now always cost at least €15/$17, so a real lesson is always
-- paid: count only sessions whose payment went through. Late student cancellations are not
-- counted (they are status 'cancelled').
--
-- CREATE OR REPLACE keeps the views' owner, grants and column order, so nothing else changes.
-- No data is modified.

CREATE OR REPLACE VIEW public.public_tutor_subject_stats AS
 SELECT s.tutor_id,
    COALESCE(max(NULLIF(TRIM(BOTH FROM s.subject), ''::text)), 'Other'::text) AS subject,
    (count(*))::integer AS completed_sessions
   FROM (sessions s
     JOIN tutor_profiles tp ON ((tp.user_id = s.tutor_id)))
  WHERE (s.status = 'completed'::text) AND (s.payment_status = 'paid'::text)
  GROUP BY s.tutor_id, (lower(COALESCE(NULLIF(TRIM(BOTH FROM s.subject), ''::text), 'Other'::text)));

CREATE OR REPLACE VIEW public.public_tutors AS
 SELECT u.id,
    u.full_name,
    u.avatar_url,
    u.cover_url,
    u.bio,
    u.country,
    u.city,
    u.language,
    u.created_at,
    (( SELECT count(*) AS count
           FROM sessions s
          WHERE ((s.tutor_id = u.id) AND (s.status = 'completed'::text) AND (s.payment_status = 'paid'::text))))::integer AS completed_sessions,
    u.website_url,
    u.linkedin_url,
    u.github_url
   FROM (users u
     JOIN tutor_profiles tp ON ((tp.user_id = u.id)))
  WHERE (u.suspended_at IS NULL);
