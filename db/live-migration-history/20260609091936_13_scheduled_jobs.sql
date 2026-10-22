-- Exported from the live database migration history (20260609091936 13_scheduled_jobs).

-- Enable pg_cron for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Auto-release escrow every hour
SELECT cron.schedule(
  'auto-release-escrow',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/platform-jobs?action=auto_release',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Session reminder emails every hour (find sessions in next 24hrs)
CREATE OR REPLACE FUNCTION public.send_session_reminders()
RETURNS void AS $$
DECLARE
  sess RECORD;
BEGIN
  FOR sess IN
    SELECT s.id, s.subject, s.scheduled_at_utc, s.duration_minutes, s.video_link,
           u.email, u.full_name
    FROM public.sessions s
    JOIN public.users u ON u.id = s.student_id
    WHERE s.status = 'confirmed'
    AND s.scheduled_at_utc BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
    AND s.reminder_sent_at IS NULL
  LOOP
    UPDATE public.sessions SET reminder_sent_at = NOW() WHERE id = sess.id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT sess.student_id, 'session_reminder', 'Session reminder',
           'Your ' || sess.subject || ' session is tomorrow',
           jsonb_build_object('session_id', sess.id)
    FROM public.sessions WHERE id = sess.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
