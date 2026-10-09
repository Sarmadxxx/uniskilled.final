-- Applied to Supabase project orghkbbohnabcietidiv on 2026-10-09 (already live — kept here as a record).
-- Tutor university-email verification. Tutors only; the login email is unchanged.
-- Edge Function source: db/functions/verify-university/index.ts (deployed as `verify-university`, verify_jwt=false,
-- checks the login token itself).

create table if not exists public.university_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  name text not null, country text, source text not null default 'hipo', created_at timestamptz not null default now()
);
alter table public.university_domains enable row level security;
create policy university_domains_read on public.university_domains for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.university_domains from anon, authenticated;

create table if not exists public.tutor_university_verifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, email text not null, domain text not null,
  university text not null, code_hash text not null, expires_at timestamptz not null, attempts int not null default 0,
  sent_at timestamptz not null default now(), verified_at timestamptz
);
create index if not exists tuv_user_idx on public.tutor_university_verifications (user_id, sent_at desc);
create unique index if not exists tuv_email_verified_once on public.tutor_university_verifications (lower(email)) where verified_at is not null;
alter table public.tutor_university_verifications enable row level security;
revoke all on public.tutor_university_verifications from anon, authenticated;

create table if not exists public.university_domain_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, email text not null, university text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')), created_at timestamptz not null default now()
);
alter table public.university_domain_requests enable row level security;
revoke all on public.university_domain_requests from anon, authenticated;

alter table public.tutor_profiles add column if not exists verified_university text;
-- a_guard_tutor_profiles() was extended so end users can't set verified_university (university_verified_at was already guarded).

-- Seeding (run once): the database downloaded the open list itself via pg_net
--   select net.http_get('https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json');
-- then inserted every listed domain (lower-cased, valid format, excluding 'com.edu') → 10,587 domains.
--
-- Adding a university by hand after a "not listed" request:
--   insert into public.university_domains (domain, name, country, source) values ('example-uni.de', 'Example University', 'DE', 'manual');
--   update public.university_domain_requests set status = 'approved' where id = '...';
