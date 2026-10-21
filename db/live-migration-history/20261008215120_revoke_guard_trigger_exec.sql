-- Exported from the live database migration history (20261008215120 revoke_guard_trigger_exec).

REVOKE EXECUTE ON FUNCTION public.a_guard_messages(), public.a_guard_notifications(), public.a_guard_reviews(), public.sanitize_notification_text() FROM PUBLIC, anon, authenticated;
