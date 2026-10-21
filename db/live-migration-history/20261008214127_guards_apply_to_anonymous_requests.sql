-- Exported from the live database migration history (20261008214127 guards_apply_to_anonymous_requests).

-- Previously: auth.uid() IS NOT NULL AND NOT is_admin()  -> anonymous API requests skipped every guard trigger.
-- Now any request made with the public anon key or a user token is guarded; only service_role,
-- internal triggers (e.g. signup) and admins bypass.
CREATE OR REPLACE FUNCTION public._is_plain_end_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT COALESCE(public.is_admin(), false);
$function$;
