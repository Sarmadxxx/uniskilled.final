-- Lesson ratings (applied 2026-10-13 via SQL). One review per lesson, by the student who had it.
alter table public.reviews add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.reviews add column if not exists tags text[] not null default '{}';
alter table public.reviews add column if not exists updated_at timestamptz;
create unique index if not exists reviews_session_unique on public.reviews(session_id) where session_id is not null;

-- Private feedback to UniSkilled (admins only; never shown to the tutor).
create table if not exists public.lesson_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.lesson_feedback enable row level security;
create policy "lesson_feedback_admin_read" on public.lesson_feedback for select to authenticated using (public.is_admin());

-- Only the lesson's student; lesson completed, over, or 5+ minutes connected in the classroom;
-- tags limited to a fixed list (max 5); editing allowed for 14 days; tutor is notified of new reviews.
create or replace function public.submit_lesson_review(
  p_session_id uuid, p_rating integer, p_comment text, p_tags text[], p_private_note text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions%rowtype;
  v_end timestamptz;
  v_connected integer;
  v_existing public.reviews%rowtype;
  v_id uuid;
  v_comment text := nullif(left(btrim(coalesce(p_comment, '')), 1000), '');
  v_note text := nullif(left(btrim(coalesce(p_private_note, '')), 2000), '');
  v_tags text[];
  v_allowed text[] := array['Clear explanations','Patient','Well prepared','Helpful materials','Encouraging','On time','Great for exams','Knows the subject'];
begin
  if v_uid is null then raise exception 'Please sign in to rate your lesson.' using errcode = '42501'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Please choose 1 to 5 stars.' using errcode = '22023'; end if;
  select * into s from public.sessions where id = p_session_id;
  if not found or s.student_id is distinct from v_uid then
    raise exception 'Only the student of this lesson can rate it.' using errcode = '42501';
  end if;
  if s.status not in ('confirmed', 'completed') then
    raise exception 'This lesson can''t be rated because it didn''t take place.' using errcode = '22023';
  end if;
  v_end := coalesce(s.ends_at, s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60)));
  select coalesce(sum(connected_seconds), 0) into v_connected
    from public.classroom_attendance where session_id = s.id and user_id = v_uid;
  if not (s.status = 'completed' or now() >= v_end or v_connected >= 300) then
    raise exception 'You can rate this lesson once it has taken place.' using errcode = '22023';
  end if;
  select array_agg(distinct t) into v_tags from unnest(coalesce(p_tags, '{}')) t where t = any(v_allowed);
  v_tags := coalesce(v_tags[1:5], '{}');
  select * into v_existing from public.reviews where session_id = s.id;
  if found then
    if v_existing.created_at < now() - interval '14 days' then
      raise exception 'Reviews can be changed for 14 days after they are written.' using errcode = '22023';
    end if;
    update public.reviews set rating = p_rating, comment = v_comment, tags = v_tags, updated_at = now()
     where id = v_existing.id returning id into v_id;
  else
    insert into public.reviews (tutor_id, student_id, student_name, rating, comment, tags, session_id)
    values (s.tutor_id, v_uid, coalesce(s.student_name, 'Student'), p_rating, v_comment, v_tags, s.id)
    returning id into v_id;
    insert into public.notifications (user_id, type, title, body, link, read)
    values (s.tutor_id, 'new_review', '⭐ New ' || p_rating || '-star review',
            coalesce(s.student_name, 'A student') || ' rated your ' || coalesce(s.subject, '') || ' lesson.',
            'tutor-dashboard.html?tab=reviews', false);
  end if;
  if v_note is not null then
    insert into public.lesson_feedback (session_id, user_id, note) values (s.id, v_uid, v_note);
  end if;
  return v_id;
end $$;
revoke all on function public.submit_lesson_review(uuid, integer, text, text[], text) from public, anon;
grant execute on function public.submit_lesson_review(uuid, integer, text, text[], text) to authenticated;
