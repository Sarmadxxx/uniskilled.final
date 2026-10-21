-- Exported from the live database migration history (20261008125941 restore_service_role_execute_internal_functions).

GRANT EXECUTE ON FUNCTION public.increment_tutor_earnings(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_student_earnings(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_session_reminders() TO service_role;
NOTIFY pgrst, 'reload schema';
