-- Exported from the live database migration history (20260606201652 04_messages_reviews_credentials).

-- Conversations
CREATE TABLE public.conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_ids   UUID[] NOT NULL,
  archived_by       UUID[] DEFAULT ARRAY[]::UUID[],
  last_message_at   TIMESTAMP WITH TIME ZONE,
  last_message_preview VARCHAR(200),
  unread_count      JSONB DEFAULT '{}'::JSONB, -- {"user_id": count}
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages
CREATE TABLE public.messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES public.users(id),
  content           TEXT,
  attachment_url    VARCHAR(500),
  attachment_type   attachment_type,
  attachment_name   VARCHAR(255),
  attachment_size   INT,
  deleted_at        TIMESTAMP WITH TIME ZONE,
  deleted_by        UUID REFERENCES public.users(id),
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reviews
CREATE TABLE public.reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reviewer_id   UUID NOT NULL REFERENCES public.users(id),
  reviewee_id   UUID NOT NULL REFERENCES public.users(id),
  session_id    UUID REFERENCES public.sessions(id),
  order_id      UUID REFERENCES public.orders(id),
  rating        INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  is_public     BOOLEAN DEFAULT TRUE,
  hidden_by_admin     BOOLEAN DEFAULT FALSE,
  hidden_reason       TEXT,
  hidden_by           UUID REFERENCES public.users(id),
  hidden_at           TIMESTAMP WITH TIME ZONE,
  edited_at           TIMESTAMP WITH TIME ZONE,
  edit_deadline       TIMESTAMP WITH TIME ZONE, -- 14 days after created_at
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- One review per session per reviewer
  CONSTRAINT one_review_per_session UNIQUE(session_id, reviewer_id),
  CONSTRAINT one_review_per_order   UNIQUE(order_id, reviewer_id),
  -- Must have either session or order
  CONSTRAINT review_has_context CHECK (
    (session_id IS NOT NULL AND order_id IS NULL) OR
    (order_id IS NOT NULL AND session_id IS NULL)
  )
);

-- Credentials
CREATE TABLE public.credentials (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  credential_type   credential_type DEFAULT 'other',
  description       TEXT,
  -- Stats snapshot at time of issuance
  sessions_count    INT DEFAULT 0,
  orders_count      INT DEFAULT 0,
  rating_avg        DECIMAL(3,2) DEFAULT 0,
  uniskilled_score  INT DEFAULT 0,
  skills            TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Endorsements
  endorsements      JSONB DEFAULT '[]'::JSONB, -- [{business_name, quote, business_id}]
  -- Public access
  public_url        VARCHAR(500) UNIQUE,
  public_slug       VARCHAR(100) UNIQUE,
  qr_code_url       VARCHAR(500),
  -- Status
  is_active         BOOLEAN DEFAULT TRUE,
  revoked_at        TIMESTAMP WITH TIME ZONE,
  revoke_reason     TEXT,
  revoked_by        UUID REFERENCES public.users(id),
  -- Admin
  manually_created  BOOLEAN DEFAULT FALSE,
  created_by_admin  UUID REFERENCES public.users(id),
  issued_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credential endorsements from businesses
CREATE TABLE public.credential_endorsements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credential_id   UUID NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  business_id     UUID NOT NULL REFERENCES public.users(id),
  business_name   VARCHAR(255),
  quote           TEXT,
  endorsed_skills TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
