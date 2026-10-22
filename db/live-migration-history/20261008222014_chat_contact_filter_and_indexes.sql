-- Exported from the live database migration history (20261008222014 chat_contact_filter_and_indexes).

-- Server-side twin of messages.html detectContactInfo(): the browser check alone is trivially bypassed.
CREATE OR REPLACE FUNCTION public.contact_info_kind(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p ~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}' THEN 'an email address'
    WHEN p ~ '(\+?[0-9][ .-]?){7,}' THEN 'a phone number'
    WHEN p ~* '\m(wa\.me|t\.me|instagram\.com|snapchat\.com|discord\.gg)/\S+' THEN 'a social media link'
    WHEN p ~* '\m(whatsapp|whats app|telegram|snap(chat)?|insta(gram)?|discord|tiktok|imessage|line id|wechat)\M.{0,15}[@#]?[a-z0-9_.]{3,}' THEN 'a social media handle'
  END;
$$;

CREATE OR REPLACE FUNCTION public.a_block_contact_info()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  k := public.contact_info_kind(NEW.content);
  IF k IS NOT NULL THEN
    RAISE EXCEPTION 'Messages can''t contain % — keep contact on UniSkilled so your booking stays protected.', k USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.a_block_contact_info() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER a_block_contact_info BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.a_block_contact_info();

-- Indexes for the lookups the app and jobs actually run.
CREATE INDEX IF NOT EXISTS idx_sessions_student ON public.sessions (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_session ON public.payments (session_id);
CREATE INDEX IF NOT EXISTS idx_payments_group_session ON public.payments (group_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON public.payments (payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payee ON public.payments (payee_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON public.messages (receiver_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_session ON public.disputes (session_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tutor ON public.reviews (tutor_id);
CREATE INDEX IF NOT EXISTS idx_gsp_group ON public.group_session_participants (group_session_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invitee ON public.referrals (invitee_id);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON public.conversations (participant_2);
