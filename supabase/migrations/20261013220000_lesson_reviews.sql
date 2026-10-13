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

-- submit_lesson_review(session, rating 1-5, comment, tags, private note):
--   only the lesson's student; lesson completed, over, or 5+ minutes connected in the classroom;
--   tags limited to a fixed list (max 5); editing allowed for 14 days; tutor is notified of new reviews.
-- (Full function body as deployed: see the database; kept in sync with rate-lesson.html.)
