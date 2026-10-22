-- Exported from the live database migration history (20260606201634 03_sessions_jobs_orders).

-- Tutoring sessions
CREATE TABLE public.sessions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_id                  UUID NOT NULL REFERENCES public.tutor_profiles(id),
  student_id                UUID NOT NULL REFERENCES public.users(id),
  subject                   VARCHAR(255) NOT NULL,
  scheduled_at_utc          TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes          INT NOT NULL DEFAULT 60,
  status                    session_status DEFAULT 'pending',
  video_link                VARCHAR(500),
  notes                     TEXT,
  -- Payment
  session_fee               DECIMAL(8,2) NOT NULL,
  booking_fee               DECIMAL(8,2) DEFAULT 1.50,
  total_charged             DECIMAL(8,2) NOT NULL,
  currency                  VARCHAR(3) DEFAULT 'EUR',
  platform_fee_pct          INT DEFAULT 20,
  platform_fee_amount       DECIMAL(8,2),
  tutor_payout              DECIMAL(8,2),
  stripe_payment_intent_id  VARCHAR(255),
  stripe_transfer_id        VARCHAR(255),
  -- Cancellation & refunds
  cancellation_by           cancellation_by,
  cancelled_at              TIMESTAMP WITH TIME ZONE,
  cancellation_reason       TEXT,
  refund_amount             DECIMAL(8,2),
  refund_pct                INT, -- 100, 50, or 0
  stripe_refund_id          VARCHAR(255),
  -- Rescheduling
  reschedule_count          INT DEFAULT 0,
  original_scheduled_at     TIMESTAMP WITH TIME ZONE,
  -- No-show
  no_show_by                cancellation_by,
  no_show_reported_at       TIMESTAMP WITH TIME ZONE,
  no_show_confirmed_by      UUID REFERENCES public.users(id),
  -- Metadata
  reminder_sent_at          TIMESTAMP WITH TIME ZONE,
  completed_at              TIMESTAMP WITH TIME ZONE,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job posts
CREATE TABLE public.jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  category          VARCHAR(100),
  type              job_type DEFAULT 'freelance',
  skills_required   TEXT[] DEFAULT ARRAY[]::TEXT[],
  budget_min        DECIMAL(8,2),
  budget_max        DECIMAL(8,2),
  currency          VARCHAR(3) DEFAULT 'EUR',
  remote            BOOLEAN DEFAULT TRUE,
  location          VARCHAR(255),
  status            job_status DEFAULT 'draft',
  applicant_count   INT DEFAULT 0,
  view_count        INT DEFAULT 0,
  expires_at        TIMESTAMP WITH TIME ZONE,
  published_at      TIMESTAMP WITH TIME ZONE,
  closed_at         TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job applications
CREATE TABLE public.job_applications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cover_letter    TEXT,
  cv_url          VARCHAR(500),
  portfolio_url   VARCHAR(500),
  match_score     INT DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'applied', -- 'applied' | 'reviewed' | 'accepted' | 'rejected'
  reviewed_at     TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(job_id, student_id)
);

-- Freelance orders
CREATE TABLE public.orders (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id               UUID NOT NULL REFERENCES public.users(id),
  student_id                UUID NOT NULL REFERENCES public.users(id),
  job_id                    UUID REFERENCES public.jobs(id),
  title                     VARCHAR(255) NOT NULL,
  description               TEXT,
  requirements              TEXT,
  -- Payment
  amount                    DECIMAL(8,2) NOT NULL,
  currency                  VARCHAR(3) DEFAULT 'EUR',
  platform_fee_pct          INT DEFAULT 15,
  platform_fee_amount       DECIMAL(8,2),
  student_payout            DECIMAL(8,2),
  business_order_fee_pct    INT DEFAULT 0,
  business_order_fee_amount DECIMAL(8,2),
  stripe_payment_intent_id  VARCHAR(255),
  stripe_transfer_id        VARCHAR(255),
  stripe_refund_id          VARCHAR(255),
  -- Status
  status                    order_status DEFAULT 'pending',
  delivery_deadline         TIMESTAMP WITH TIME ZONE,
  delivered_at              TIMESTAMP WITH TIME ZONE,
  delivery_notes            TEXT,
  approved_at               TIMESTAMP WITH TIME ZONE,
  auto_release_at           TIMESTAMP WITH TIME ZONE, -- 7 days after delivery if not approved
  cancelled_at              TIMESTAMP WITH TIME ZONE,
  cancellation_reason       TEXT,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Saved tutors (students bookmarking tutors)
CREATE TABLE public.saved_tutors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tutor_id    UUID NOT NULL REFERENCES public.tutor_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, tutor_id)
);

-- Saved students (businesses bookmarking students for talent pool)
CREATE TABLE public.saved_students (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notes         TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(business_id, student_id)
);
