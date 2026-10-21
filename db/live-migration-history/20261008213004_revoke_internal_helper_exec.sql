-- Exported from the live database migration history (20261008213004 revoke_internal_helper_exec).

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_setting(character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_setting_bool(character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_setting_int(character varying) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_setting(character varying), public.get_setting_bool(character varying), public.get_setting_int(character varying) TO service_role;
