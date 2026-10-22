-- Exported from the live database migration history (20261008211939 lock_down_users_private_columns).

-- Signed-in users may read only public profile columns of public.users.
-- Private fields (email, phone, credit_balance, referral_code, stripe_customer_id, ...) are reachable only
-- via get_my_account() (own row) and admin_list_users() (admins). Service role / Edge Functions unaffected.
REVOKE SELECT ON public.users FROM anon, authenticated;
GRANT SELECT (id, full_name, avatar_url, cover_url, bio, country, city, language, timezone,
              website_url, linkedin_url, github_url, roles, role, gender, created_at, updated_at,
              last_seen_at, suspended_at, email_verified, university_email_verified)
  ON public.users TO authenticated;

-- Safety net for old cached pages that send email:'' on profile save: never let an end user blank their email.
CREATE OR REPLACE FUNCTION public.a_guard_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF 'admin' = ANY (NEW.roles::text[]) OR NEW.role = 'admin'
       OR COALESCE(NEW.credit_balance,0) <> 0 OR NEW.suspended_at IS NOT NULL
       OR COALESCE(NEW.warning_count,0) <> 0 THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF COALESCE(NEW.email::text, '') = '' AND COALESCE(OLD.email::text, '') <> '' THEN
      NEW.email := OLD.email;
    END IF;
    IF ('admin' = ANY (NEW.roles::text[]) AND NOT ('admin' = ANY (COALESCE(OLD.roles::text[], '{}'))))
       OR (NEW.role = 'admin' AND OLD.role IS DISTINCT FROM 'admin')
       OR NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
       OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
       OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
       OR NEW.warning_count IS DISTINCT FROM OLD.warning_count
       OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
       OR NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
       OR NEW.university_email_verified IS DISTINCT FROM OLD.university_email_verified THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
