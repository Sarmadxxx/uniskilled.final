-- Exported from the live database migration history (20260716154413 add_session_completed_at).

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill: for sessions already marked completed, use updated_at as a best-effort timestamp
UPDATE public.sessions SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;
