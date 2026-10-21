-- Exported from the live database migration history (20260606201844 09_triggers_and_functions).

-- Auto-create user profile when someone signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_tutor_profiles_updated_at
  BEFORE UPDATE ON public.tutor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_student_profiles_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Set review edit deadline (14 days) on insert
CREATE OR REPLACE FUNCTION public.set_review_edit_deadline()
RETURNS TRIGGER AS $$
BEGIN
  NEW.edit_deadline = NEW.created_at + INTERVAL '14 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_review_edit_deadline
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_review_edit_deadline();

-- Increment job applicant count on new application
CREATE OR REPLACE FUNCTION public.increment_job_applicants()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.jobs SET applicant_count = applicant_count + 1
  WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_job_application
  AFTER INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.increment_job_applicants();

-- Update conversation last_message_at on new message
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 200),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

-- Recalculate tutor rating when review added
CREATE OR REPLACE FUNCTION public.update_tutor_rating()
RETURNS TRIGGER AS $$
DECLARE
  tutor_user_id UUID;
BEGIN
  -- Find the tutor's user_id from the session
  SELECT s.tutor_id INTO tutor_user_id
  FROM public.sessions s
  JOIN public.tutor_profiles tp ON tp.id = s.tutor_id
  WHERE s.id = NEW.session_id;

  IF tutor_user_id IS NOT NULL THEN
    UPDATE public.tutor_profiles
    SET
      rating_avg = (
        SELECT ROUND(AVG(r.rating)::numeric, 2)
        FROM public.reviews r
        JOIN public.sessions s ON s.id = r.session_id
        JOIN public.tutor_profiles tp ON tp.id = s.tutor_id
        WHERE tp.user_id = tutor_user_id
        AND r.hidden_by_admin = false
      ),
      review_count = (
        SELECT COUNT(*)
        FROM public.reviews r
        JOIN public.sessions s ON s.id = r.session_id
        JOIN public.tutor_profiles tp ON tp.id = s.tutor_id
        WHERE tp.user_id = tutor_user_id
        AND r.hidden_by_admin = false
      )
    WHERE user_id = tutor_user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_session_review
  AFTER INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  WHEN (NEW.session_id IS NOT NULL)
  EXECUTE FUNCTION public.update_tutor_rating();

-- AI match score function
CREATE OR REPLACE FUNCTION public.calculate_match_score(
  user_skills TEXT[],
  required_skills TEXT[]
)
RETURNS INT AS $$
DECLARE
  matched INT;
  total INT;
BEGIN
  total := array_length(required_skills, 1);
  IF total IS NULL OR total = 0 THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO matched
  FROM unnest(user_skills) s
  WHERE s = ANY(required_skills);
  RETURN ROUND((matched::DECIMAL / total) * 100);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get a platform setting value
CREATE OR REPLACE FUNCTION public.get_setting(setting_key VARCHAR)
RETURNS TEXT AS $$
  SELECT value FROM public.platform_settings WHERE key = setting_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get a platform setting as boolean
CREATE OR REPLACE FUNCTION public.get_setting_bool(setting_key VARCHAR)
RETURNS BOOLEAN AS $$
  SELECT (value = 'true') FROM public.platform_settings WHERE key = setting_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get a platform setting as integer
CREATE OR REPLACE FUNCTION public.get_setting_int(setting_key VARCHAR)
RETURNS INT AS $$
  SELECT value::INT FROM public.platform_settings WHERE key = setting_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
