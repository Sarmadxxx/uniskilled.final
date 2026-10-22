-- Exported from the live database migration history (20260606201711 05_disputes_notifications_payments).

-- Disputes
CREATE TABLE public.disputes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opened_by         UUID NOT NULL REFERENCES public.users(id),
  against           UUID NOT NULL REFERENCES public.users(id),
  session_id        UUID REFERENCES public.sessions(id),
  order_id          UUID REFERENCES public.orders(id),
  reason            TEXT NOT NULL,
  evidence_urls     TEXT[] DEFAULT ARRAY[]::TEXT[],
  status            dispute_status DEFAULT 'open',
  priority          VARCHAR(20) DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  -- Admin resolution
  admin_id          UUID REFERENCES public.users(id),
  admin_notes       TEXT, -- internal only, never shown to users
  resolution        dispute_resolution,
  resolution_notes  TEXT, -- shown to both parties
  refund_amount     DECIMAL(8,2),
  release_amount    DECIMAL(8,2),
  resolved_at       TIMESTAMP WITH TIME ZONE,
  -- Deadline
  deadline          TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT dispute_has_context CHECK (
    (session_id IS NOT NULL AND order_id IS NULL) OR
    (order_id IS NOT NULL AND session_id IS NULL)
  )
);

-- User reports (off-platform solicitation, harassment, etc.)
CREATE TABLE public.user_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reported_by     UUID NOT NULL REFERENCES public.users(id),
  reported_user   UUID NOT NULL REFERENCES public.users(id),
  report_type     VARCHAR(100) NOT NULL, -- 'off_platform_solicitation' | 'harassment' | 'fraud' | 'other'
  description     TEXT NOT NULL,
  evidence_urls   TEXT[] DEFAULT ARRAY[]::TEXT[],
  status          VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'reviewed' | 'actioned' | 'dismissed'
  reviewed_by     UUID REFERENCES public.users(id),
  reviewed_at     TIMESTAMP WITH TIME ZONE,
  admin_notes     TEXT,
  -- Whistleblower credit
  credit_issued   BOOLEAN DEFAULT FALSE,
  credit_amount   DECIMAL(8,2),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications
CREATE TABLE public.notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type            VARCHAR(100) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  data            JSONB DEFAULT '{}'::JSONB, -- metadata like {session_id, order_id}
  is_read         BOOLEAN DEFAULT FALSE,
  read_at         TIMESTAMP WITH TIME ZONE,
  action_url      VARCHAR(500),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment transactions (mirrors Stripe events)
CREATE TABLE public.payments (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                      VARCHAR(100) NOT NULL, -- 'session_booking' | 'order_escrow' | 'payout' | 'refund' | 'subscription'
  amount                    DECIMAL(10,2) NOT NULL,
  currency                  VARCHAR(3) DEFAULT 'EUR',
  platform_fee              DECIMAL(8,2),
  -- Relations
  payer_id                  UUID REFERENCES public.users(id),
  payee_id                  UUID REFERENCES public.users(id),
  session_id                UUID REFERENCES public.sessions(id),
  order_id                  UUID REFERENCES public.orders(id),
  -- Stripe
  stripe_payment_intent_id  VARCHAR(255) UNIQUE,
  stripe_transfer_id        VARCHAR(255),
  stripe_refund_id          VARCHAR(255),
  stripe_event_id           VARCHAR(255),
  -- Status
  status                    VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'succeeded' | 'failed' | 'refunded' | 'in_escrow'
  flagged                   BOOLEAN DEFAULT FALSE,
  flag_reason               VARCHAR(255),
  reviewed_by               UUID REFERENCES public.users(id),
  reviewed_at               TIMESTAMP WITH TIME ZONE,
  -- Metadata
  metadata                  JSONB DEFAULT '{}'::JSONB,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payout requests
CREATE TABLE public.payout_requests (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES public.users(id),
  amount                DECIMAL(8,2) NOT NULL,
  currency              VARCHAR(3) DEFAULT 'EUR',
  stripe_connected_id   VARCHAR(255),
  stripe_payout_id      VARCHAR(255),
  status                VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'processing' | 'paid' | 'failed'
  processed_at          TIMESTAMP WITH TIME ZONE,
  failure_reason        TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
