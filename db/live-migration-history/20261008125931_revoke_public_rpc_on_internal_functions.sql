-- Exported from the live database migration history (20261008125931 revoke_public_rpc_on_internal_functions).

-- Internal helper functions should only be callable server-side (service_role), not via the public /rest/v1/rpc API.
REVOKE EXECUTE ON FUNCTION public.increment_tutor_earnings(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_student_earnings(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_session_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
