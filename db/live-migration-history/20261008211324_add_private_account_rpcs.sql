-- Exported from the live database migration history (20261008211324 add_private_account_rpcs).

-- Own private fields (email, phone, credit, referral code) for the signed-in user only.
CREATE OR REPLACE FUNCTION public.get_my_account()
RETURNS TABLE (id uuid, email text, phone text, referral_code text, credit_balance numeric, university_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email::text, u.phone::text, u.referral_code::text, u.credit_balance::numeric, u.university_email::text
  FROM public.users u WHERE u.id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account() TO authenticated;

-- Full user list for the admin console; refuses everyone who is not an admin.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS SETOF public.users
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.users ORDER BY created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
