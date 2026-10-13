-- Tutor public replies to reviews, and the matching review guard.
-- (Columns tutor_reply / tutor_reply_at were added in 20261013220000_lesson_reviews.sql.)

CREATE OR REPLACE FUNCTION public.reply_to_review(p_review_id uuid, p_reply text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_reply text := nullif(left(btrim(coalesce(p_reply, '')), 1000), '');
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  update public.reviews
     set tutor_reply = v_reply, tutor_reply_at = case when v_reply is null then null else now() end
   where id = p_review_id and tutor_id = auth.uid();
  if not found then raise exception 'You can only reply to reviews of your own lessons.' using errcode = '42501'; end if;
end $function$;

revoke all on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.a_guard_reviews()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF NEW.tutor_id IS DISTINCT FROM OLD.tutor_id OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  -- Only the review's tutor may set the public reply (through reply_to_review).
  IF (NEW.tutor_reply IS DISTINCT FROM OLD.tutor_reply OR NEW.tutor_reply_at IS DISTINCT FROM OLD.tutor_reply_at)
     AND auth.uid() IS DISTINCT FROM OLD.tutor_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  -- The tutor may change only the reply, nothing the student wrote.
  IF auth.uid() = OLD.tutor_id AND (NEW.rating IS DISTINCT FROM OLD.rating OR NEW.comment IS DISTINCT FROM OLD.comment OR NEW.tags IS DISTINCT FROM OLD.tags) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
