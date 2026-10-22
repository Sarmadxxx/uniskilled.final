-- Notification center: the bell asks "how many unread notifications does this person have?" on
-- every dashboard load and after each live alert. This partial index answers that from the
-- unread rows only, so it stays fast however many old (read) notifications pile up.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE read = false;
