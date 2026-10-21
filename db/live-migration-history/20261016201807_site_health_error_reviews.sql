-- Exported from the live database migration history (20261016201807 site_health_error_reviews).

create table if not exists public.error_reviews (
  id uuid primary key default gen_random_uuid(),
  sentry_issue_id text not null unique,
  short_id text,
  title text,
  culprit text,
  level text,
  permalink text,
  project text,
  event_count integer default 0,
  user_count integer default 0,
  first_seen timestamptz,
  last_seen timestamptz,
  sentry_status text default 'unresolved',
  event_summary jsonb,
  review_status text not null default 'new'
    check (review_status in ('new', 'diagnosing', 'fix_ready', 'needs_info', 'uploaded', 'fixed', 'ignored')),
  diagnosis text,
  proposed_fix text,
  files_changed text[],
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists error_reviews_status_idx on public.error_reviews (review_status, updated_at desc);

alter table public.error_reviews enable row level security;
revoke all on public.error_reviews from anon, authenticated;
grant all on public.error_reviews to service_role;

select cron.unschedule('site-health-sync') where exists (select 1 from cron.job where jobname = 'site-health-sync');
select cron.schedule(
  'site-health-sync',
  '25,55 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://orghkbbohnabcietidiv.supabase.co/functions/v1/site-health',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')),
    body := '{}'::jsonb
  );
  $$
);
