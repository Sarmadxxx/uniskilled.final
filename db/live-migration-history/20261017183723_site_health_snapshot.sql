-- Exported from the live database migration history (20261017183723 site_health_snapshot).

-- Sentry numbers written by the daily Claude review (via the Sentry connector), so Site Health
-- works without a Sentry auth token. One row per capture; the newest row is shown.
create table if not exists public.site_health_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  kpis jsonb not null default '{}'::jsonb,      -- errors_24h, errors_7d, unresolved_issues, new_issues_24h, crash_free_sessions, sessions_24h
  daily jsonb not null default '[]'::jsonb,     -- [{day:'YYYY-MM-DD', errors:n}] last 7 days
  top_issues jsonb not null default '[]'::jsonb,-- [{short_id,title,culprit,events_24h,users,last_seen,permalink}]
  captured_by text
);
alter table public.site_health_snapshots enable row level security;
revoke all on public.site_health_snapshots from anon, authenticated;
grant all on public.site_health_snapshots to service_role;
