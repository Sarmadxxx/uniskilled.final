-- UniSkilled — remove table rights the website's API roles never use (audit 19 Nov, SEC-05).
--
-- The signed-out role (anon) and signed-in role (authenticated) had Supabase's default
-- "ALL" grants. Row Level Security already blocks every write that matters, so nothing was
-- exploitable, but a single wrong policy later would have opened it. This keeps exactly the
-- rights the site uses (SELECT/INSERT/UPDATE/DELETE, still filtered by RLS) and removes:
--   * TRUNCATE, TRIGGER, REFERENCES for anon and authenticated on every public table/view
--     (TRUNCATE ignores RLS; PostgREST never issues it, so the site can't need it);
--   * INSERT/UPDATE/DELETE for anon on the feed tables and group-session participants,
--     where only signed-in policies exist.
-- New tables get the same treatment via default privileges.
-- Reversible: GRANT ALL ON <table> TO anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.feed_posts, public.feed_likes, public.feed_replies,
  public.group_session_participants FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
