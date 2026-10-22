-- Exported from the live database migration history (20261009121647 tutor_university_verification).

-- Tutor university-email verification (tutors only; login email stays whatever they signed up with).

-- 1. Allowlist of university email domains (seeded from the open Hipo university-domains-list,
--    plus anything added by hand via approved requests).
create table if not exists public.university_domains (
  domain     text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  name       text not null,
  country    text,
  source     text not null default 'hipo',
  created_at timestamptz not null default now()
);
alter table public.university_domains enable row level security;
create policy university_domains_read on public.university_domains for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.university_domains from anon, authenticated;

-- 2. Pending / completed verifications. Private: only the Edge Function (service role) touches it.
create table if not exists public.tutor_university_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  email       text not null,
  domain      text not null,
  university  text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  sent_at     timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists tuv_user_idx on public.tutor_university_verifications (user_id, sent_at desc);
-- one university inbox can verify only one tutor account
create unique index if not exists tuv_email_verified_once on public.tutor_university_verifications (lower(email)) where verified_at is not null;
alter table public.tutor_university_verifications enable row level security;
revoke all on public.tutor_university_verifications from anon, authenticated;

-- 3. "My university isn't listed" requests, reviewed by the admin.
create table if not exists public.university_domain_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  email      text not null,
  university text not null,
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.university_domain_requests enable row level security;
revoke all on public.university_domain_requests from anon, authenticated;

-- 4. Public "Verified · <University>" label on the tutor profile.
alter table public.tutor_profiles add column if not exists verified_university text;

-- 5. Extend the existing guard so end users can't set the university name themselves either.
create or replace function public.a_guard_tutor_profiles()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_account_id IS NOT NULL OR NEW.stripe_account_status = 'active'
       OR NEW.university_verified_at IS NOT NULL OR NEW.verified_university IS NOT NULL
       OR NEW.grade_verified_at IS NOT NULL
       OR NEW.certified_at IS NOT NULL OR NEW.top_rated_at IS NOT NULL
       OR COALESCE(NEW.rating_avg,0) <> 0 OR COALESCE(NEW.review_count,0) <> 0
       OR COALESCE(NEW.sessions_count,0) <> 0 OR COALESCE(NEW.total_earnings,0) <> 0
       OR COALESCE(NEW.no_show_count,0) <> 0 THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
       OR NEW.stripe_account_status IS DISTINCT FROM OLD.stripe_account_status
       OR NEW.university_verified_at IS DISTINCT FROM OLD.university_verified_at
       OR NEW.verified_university IS DISTINCT FROM OLD.verified_university
       OR NEW.grade_verified_at IS DISTINCT FROM OLD.grade_verified_at
       OR NEW.certified_at IS DISTINCT FROM OLD.certified_at
       OR NEW.top_rated_at IS DISTINCT FROM OLD.top_rated_at
       OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
       OR NEW.review_count IS DISTINCT FROM OLD.review_count
       OR NEW.sessions_count IS DISTINCT FROM OLD.sessions_count
       OR NEW.response_rate IS DISTINCT FROM OLD.response_rate
       OR NEW.completion_rate IS DISTINCT FROM OLD.completion_rate
       OR NEW.no_show_count IS DISTINCT FROM OLD.no_show_count
       OR NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
